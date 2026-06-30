import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { CreatePatientDto, PatientQueryDto, UpdatePatientDto } from './dto/patient.dto';
import { randomBytes } from 'crypto';

const patientSelect = {
  id: true,
  registrationNo: true,
  firstName: true,
  lastName: true,
  middleName: true,
  phoneNumber: true,
  bloodGroup: true,
  gender: true,
  height: true,
  weight: true,
  email: true,
  dateOfBirth: true,
  identityToken: true,
  motherMaidenName: true,
  avatarUrl: true,
  clientId: true,
  client: { select: { id: true, firstName: true, lastName: true, officeName: true, email: true } },
  addresses: {
    select: {
      id: true,
      label: true,
      line1: true,
      line2: true,
      city: true,
      region: true,
      postalCode: true,
      country: true,
    },
  },
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  // Every query below is automatically scoped to the caller's lab by the Prisma
  // tenancy extension (labId injected from the request's JWT context).
  async findAll(query: PatientQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where = this.buildWhere(query);
    const [data, total] = await Promise.all([
      this.prisma.patient.findMany({ where, select: patientSelect, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.patient.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findByClient(clientId: string, query: PatientQueryDto) {
    return this.findAll({ ...query, clientId });
  }

  async search(query: PatientQueryDto) {
    return this.findAll(query);
  }

  async findOne(id: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id }, select: patientSelect });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  private addressCreate(addresses?: { line1: string }[]) {
    if (!addresses?.length) return undefined;
    return {
      create: addresses.map((a) =>
        tenantCreate<Prisma.PatientAddressUncheckedCreateWithoutPatientInput>({ ...a }),
      ),
    };
  }

  async create(dto: CreatePatientDto) {
    const { addresses, ...rest } = dto;
    const registrationNo = this.generateRegNo();
    const existing = await this.prisma.patient.findFirst({ where: { registrationNo } });
    if (existing) throw new ConflictException('Registration number collision; retry');

    return this.prisma.patient.create({
      data: tenantCreate<Prisma.PatientUncheckedCreateInput>({
        registrationNo,
        ...rest,
        addresses: this.addressCreate(addresses),
      }),
      select: patientSelect,
    });
  }

  async update(id: string, dto: UpdatePatientDto) {
    await this.findOne(id);
    const { addresses, ...rest } = dto;
    const data: Prisma.PatientUncheckedUpdateInput = { ...rest };
    // When addresses are supplied, replace the whole set.
    if (addresses !== undefined) {
      data.addresses = { deleteMany: {}, ...this.addressCreate(addresses) };
    }
    return this.prisma.patient.update({ where: { id }, data, select: patientSelect });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.patient.delete({ where: { id } });
    return { deleted: true };
  }

  private buildWhere(query: PatientQueryDto) {
    const where: any = {};
    if (query.clientId) where.clientId = query.clientId;
    if (query.q) {
      const q = query.q;
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { registrationNo: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phoneNumber: { contains: q, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  private generateRegNo() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    return `PAT-${date}-${suffix}`;
  }
}
