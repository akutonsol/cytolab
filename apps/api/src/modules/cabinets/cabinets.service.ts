import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { isUniqueConflict } from '../../common/util/lab-sequence';
import { CabinetRecordsQueryDto, CreateCabinetDto, UpdateCabinetDto } from './dto/cabinet.dto';

// Client summary shown on the folder sidebar + cabinet header.
const clientSelect = {
  select: { id: true, firstName: true, lastName: true, officeName: true, accountNo: true },
} as const;

// Records rows reuse the Specimen Overview shape (patient + reg no, client + AC#,
// lab number, specimen type, status, date).
const cabinetRecordSelect = {
  id: true,
  labNumber: true,
  formType: true,
  status: true,
  urgent: true,
  specimenDate: true,
  createdAt: true,
  patient: { select: { id: true, firstName: true, lastName: true, registrationNo: true } },
  client: { select: { id: true, firstName: true, lastName: true, officeName: true, accountNo: true } },
  specimens: { select: { id: true, type: true } },
  resultSheets: { select: { id: true, authorized: true } },
} as const;

// Reference code CB{accountNo}-{RAND4}, e.g. CBCYLB-937739-QCLP. The random
// suffix guards against reuse if a client is relinked to a fresh cabinet.
const RAND_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeReferenceCode(accountNo: string | null | undefined, fallback: string): string {
  const base = accountNo?.trim() || `X${fallback.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase()}`;
  const rand = Array.from({ length: 4 }, () => RAND_ALPHABET[Math.floor(Math.random() * RAND_ALPHABET.length)]).join('');
  return `CB${base}-${rand}`;
}

@Injectable()
export class CabinetsService {
  constructor(private prisma: PrismaService) {}

  // All queries are lab-scoped automatically by the tenancy extension.
  findAll() {
    return this.prisma.cabinet.findMany({
      orderBy: { createdAt: 'desc' },
      include: { client: clientSelect },
    });
  }

  async findOne(id: string) {
    const cabinet = await this.prisma.cabinet.findFirst({ where: { id }, include: { client: clientSelect } });
    if (!cabinet) throw new NotFoundException('Cabinet not found');
    return cabinet;
  }

  /** Resolve a client's account number, or throw if the client isn't in this lab. */
  private async clientAccountNo(clientId: string): Promise<string | null> {
    const client = await this.prisma.client.findFirst({ where: { id: clientId }, select: { accountNo: true } });
    if (!client) throw new BadRequestException('Linked client not found in this lab');
    return client.accountNo;
  }

  async create(dto: CreateCabinetDto) {
    const { clientId, ...rest } = dto;
    // Linking a client generates the reference code from its account number.
    const identifier = clientId
      ? makeReferenceCode(await this.clientAccountNo(clientId), rest.label)
      : undefined;
    try {
      return await this.prisma.cabinet.create({
        data: tenantCreate<Prisma.CabinetUncheckedCreateInput>({ ...rest, clientId, identifier }),
        include: { client: clientSelect },
      });
    } catch (e) {
      if (isUniqueConflict(e, 'clientId')) {
        throw new ConflictException('This client already has a cabinet');
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateCabinetDto) {
    const existing = await this.findOne(id);
    const data: Prisma.CabinetUncheckedUpdateInput = { ...dto };

    // Re-linking (or unlinking) a client regenerates / clears the reference code.
    if (dto.clientId !== undefined && dto.clientId !== existing.clientId) {
      data.identifier = dto.clientId
        ? makeReferenceCode(await this.clientAccountNo(dto.clientId), dto.label ?? existing.label)
        : null;
    }

    try {
      return await this.prisma.cabinet.update({ where: { id }, data, include: { client: clientSelect } });
    } catch (e) {
      if (isUniqueConflict(e, 'clientId')) {
        throw new ConflictException('This client already has a cabinet');
      }
      throw e;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    // Record.cabinetId is ON DELETE SET NULL; contents are derived by client, so
    // deleting a cabinet just removes the folder, not the records.
    await this.prisma.cabinet.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * A cabinet's records = its linked client's specimen records (automatic-by-
   * client). Supports the A–Z surname index + the Form Type / Status filters.
   */
  async records(id: string, query: CabinetRecordsQueryDto) {
    const cabinet = await this.findOne(id);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    // An unlinked cabinet has no client, therefore no records.
    if (!cabinet.clientId) return paginate([], 0, page, pageSize);

    const where: Prisma.RecordWhereInput = { clientId: cabinet.clientId };
    if (query.status) where.status = query.status;
    if (query.formType) where.formType = query.formType;
    if (query.surname) {
      where.patient = { is: { lastName: { startsWith: query.surname, mode: 'insensitive' } } };
    }

    const [data, total] = await Promise.all([
      this.prisma.record.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ urgent: 'desc' }, { createdAt: 'desc' }],
        select: cabinetRecordSelect,
      }),
      this.prisma.record.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }
}
