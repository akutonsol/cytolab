import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { allocateSequence, isUniqueConflict } from '../../common/util/lab-sequence';
import { CreateRequisitionDto, RequisitionQueryDto } from './dto/requisition.dto';

// Human-facing requisition number (legacy Ref#, e.g. 1460). Plain numeric, no
// prefix. Fresh lab starts at REF_BASE+1; migration seeds to max(numeric
// imported). Same atomic seeded-counter pattern as patient registrationNo.
const REF_SEQUENCE = 'requisitionRef';
const REF_BASE = 1_000n;
const MAX_REF_RETRIES = 5;

const requisitionSelect = {
  id: true,
  referenceNo: true,
  status: true,
  amount: true,
  clientId: true,
  client: { select: { id: true, firstName: true, lastName: true, officeName: true, accountNo: true } },
  workspaceId: true,
  dateReceived: true,
  lines: {
    select: {
      id: true,
      formType: true,
      isUrgent: true,
      isCompleted: true,
      notes: true,
      amount: true,
      recordId: true,
    },
  },
  // Ordered/Fulfilled counts for the list view.
  _count: { select: { lines: true } },
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class RequisitionsService {
  constructor(
    private prisma: PrismaService,
    private labContext: LabContext,
  ) {}

  // Requisition queries are lab-scoped automatically by the tenancy extension.
  async findAll(query: RequisitionQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      this.prisma.requisition.findMany({
        where,
        select: requisitionSelect,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.requisition.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findByClient(clientId: string, query: RequisitionQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: any = { clientId };
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      this.prisma.requisition.findMany({
        where,
        select: requisitionSelect,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.requisition.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findOne(id: string) {
    const req = await this.prisma.requisition.findFirst({
      where: { id },
      select: requisitionSelect,
    });
    if (!req) throw new NotFoundException('Requisition not found');
    return req;
  }

  async create(dto: CreateRequisitionDto) {
    const { lines, ...rest } = dto;
    // Batch total = Σ line costs (cents).
    const amount = (lines ?? []).reduce((sum, l) => sum + (l.amount ?? 0), 0);
    const linesCreate = lines?.length
      ? {
          create: lines.map((l) =>
            tenantCreate<Prisma.RequisitionLineUncheckedCreateWithoutRequisitionInput>({
              formType: l.formType ?? undefined,
              isUrgent: l.isUrgent ?? false,
              notes: l.notes,
              amount: l.amount ?? 0,
            }),
          ),
        }
      : undefined;

    // Atomic seeded Ref# with the unique-constraint retry backstop.
    for (let attempt = 0; ; attempt++) {
      const referenceNo = await this.allocateReferenceNo();
      try {
        const created = await this.prisma.requisition.create({
          data: tenantCreate<Prisma.RequisitionUncheckedCreateInput>({
            referenceNo,
            amount,
            ...rest,
            lines: linesCreate,
          }),
          select: requisitionSelect,
        });
        // Auto-create the physical-form tracking record (stage Pending). This is
        // unconditional (the Requisition Tracking UI is feature-gated, not the
        // custody trail); best-effort so it never blocks requisition creation.
        await this.prisma.requisitionTracking
          .create({ data: tenantCreate<Prisma.RequisitionTrackingUncheckedCreateInput>({ requisitionId: created.id }) })
          .catch(() => undefined);
        return created;
      } catch (e) {
        if (isUniqueConflict(e, 'referenceNo') && attempt < MAX_REF_RETRIES) continue;
        if (isUniqueConflict(e, 'referenceNo')) {
          throw new ConflictException('Could not allocate a unique requisition number; please retry');
        }
        throw e;
      }
    }
  }

  /** Allocate the next requisition Ref# for the current lab (atomic, seeded). */
  private async allocateReferenceNo(): Promise<string> {
    const labId = this.labContext.getLabId();
    if (!labId) throw new Error('Cannot allocate a requisition number with no lab context');
    const value = await allocateSequence(this.prisma, labId, REF_SEQUENCE, REF_BASE);
    return value.toString();
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.requisition.delete({ where: { id } });
    return { deleted: true };
  }

  // RequisitionLine now carries its own labId, so the tenancy guard scopes it
  // directly — a line from another lab won't be found.
  async removeLine(lineId: string) {
    const line = await this.prisma.requisitionLine.findFirst({ where: { id: lineId } });
    if (!line) throw new NotFoundException('Requisition line not found');
    await this.prisma.requisitionLine.delete({ where: { id: lineId } });
    return { deleted: true };
  }
}
