import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RecordStatus } from '@prisma/client';
import { LabContext } from '../../common/tenancy/lab-context';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import {
  CreateRecordDto,
  RecordQueryDto,
  UpdateRecordDto,
  UpdateRecordStatusDto,
} from './dto/record.dto';
import { randomBytes } from 'crypto';

const recordSelect = {
  id: true,
  identifier: true,
  labNumber: true,
  clinicalDiagnosis: true,
  urgent: true,
  medicalEntry: true,
  billed: true,
  status: true,
  dateStatus: true,
  patientId: true,
  patient: { select: { id: true, registrationNo: true, firstName: true, lastName: true } },
  clientId: true,
  client: { select: { id: true, firstName: true, lastName: true, officeName: true } },
  workspaceId: true,
  specimens: {
    select: { id: true, type: true, label: true, vialColour: true, antiserumA: true, antiserumB: true, rhSolution: true, bloodGroup: true, dateReceived: true },
  },
  therapy: true,
  statusHistory: {
    select: { id: true, status: true, notes: true, userId: true, createdAt: true },
    orderBy: { createdAt: 'asc' as const },
  },
  createdAt: true,
  updatedAt: true,
} as const;

// Valid forward transitions; OnHold / Disabled / Failed can be set from any non-terminal state
const ALLOWED_TRANSITIONS: Partial<Record<RecordStatus, RecordStatus[]>> = {
  [RecordStatus.Pending]:    [RecordStatus.Submitted, RecordStatus.OnHold, RecordStatus.Disabled],
  [RecordStatus.Submitted]:  [RecordStatus.Processing, RecordStatus.OnHold, RecordStatus.Disabled],
  [RecordStatus.Processing]: [RecordStatus.Partial, RecordStatus.Completed, RecordStatus.OnHold, RecordStatus.Disabled, RecordStatus.Failed],
  [RecordStatus.Partial]:    [RecordStatus.Completed, RecordStatus.OnHold, RecordStatus.Disabled, RecordStatus.Failed],
  [RecordStatus.Completed]:  [RecordStatus.Approved, RecordStatus.OnHold],
  [RecordStatus.Approved]:   [RecordStatus.Billed],
  [RecordStatus.Billed]:     [RecordStatus.Paid],
  [RecordStatus.OnHold]:     [RecordStatus.Submitted, RecordStatus.Processing, RecordStatus.Disabled],
};

@Injectable()
export class RecordsService {
  constructor(
    private prisma: PrismaService,
    private labContext: LabContext,
  ) {}

  // Record queries are lab-scoped automatically by the tenancy extension; nested
  // tenant rows (specimens) are stamped with the lab on write by the same guard.
  async findAll(query: RecordQueryDto) {
    return this.list(query);
  }

  async findApproved(query: RecordQueryDto) {
    return this.list({ ...query, status: RecordStatus.Approved });
  }

  async findBillable(query: RecordQueryDto) {
    // Completed + Approved but not yet billed
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where = {
      billed: false,
      status: { in: [RecordStatus.Completed, RecordStatus.Approved] },
    };
    const [data, total] = await Promise.all([
      this.prisma.record.findMany({ where, select: recordSelect, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.record.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findByClient(clientId: string, query: RecordQueryDto) {
    return this.list({ ...query, clientId });
  }

  async findByPatient(patientId: string, query: RecordQueryDto) {
    return this.list({ ...query, patientId });
  }

  async findRecent(query: RecordQueryDto) {
    const pageSize = query.pageSize ?? 10;
    const data = await this.prisma.record.findMany({
      select: recordSelect,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });
    return { data, total: data.length };
  }

  async findByRequisition(requisitionId: string, query: RecordQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where = { requisitionLines: { some: { requisitionId } } };
    const [data, total] = await Promise.all([
      this.prisma.record.findMany({ where, select: recordSelect, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.record.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findOne(id: string) {
    const record = await this.prisma.record.findFirst({ where: { id }, select: recordSelect });
    if (!record) throw new NotFoundException('Record not found');
    return record;
  }

  async create(userId: string, dto: CreateRecordDto) {
    const { specimens, therapy, requisitionLineId, ...rest } = dto;
    const identifier = this.generateIdentifier();

    const record = await this.prisma.record.create({
      data: tenantCreate<Prisma.RecordUncheckedCreateInput>({
        identifier,
        ...rest,
        specimens: specimens?.length
          ? {
              create: specimens.map((s) =>
                tenantCreate<Prisma.SpecimenUncheckedCreateWithoutRecordInput>(s),
              ),
            }
          : undefined,
        therapy: therapy ? { create: therapy } : undefined,
        statusHistory: {
          create: { status: RecordStatus.Pending, userId, notes: 'Record created' },
        },
      }),
      select: recordSelect,
    });

    // Link to requisition line if provided. RequisitionLine carries no labId of
    // its own, so confirm it belongs to this lab (via its parent) before linking.
    if (requisitionLineId) {
      const line = await this.prisma.requisitionLine.findFirst({
        where: { id: requisitionLineId, requisition: { labId: this.labContext.getLabId() } },
        select: { id: true },
      });
      if (line) {
        await this.prisma.requisitionLine.update({
          where: { id: requisitionLineId },
          data: { recordId: record.id },
        });
      }
    }

    return record;
  }

  async update(id: string, userId: string, dto: UpdateRecordDto) {
    await this.findOne(id);
    const { therapy, ...rest } = dto;

    return this.prisma.record.update({
      where: { id },
      data: {
        ...rest,
        ...(therapy != null
          ? {
              therapy: {
                upsert: { create: therapy, update: therapy },
              },
            }
          : {}),
      },
      select: recordSelect,
    });
  }

  async submit(id: string, userId: string) {
    return this.transition(id, userId, RecordStatus.Submitted, 'Submitted by staff');
  }

  async updateStatus(id: string, userId: string, dto: UpdateRecordStatusDto) {
    return this.transition(id, userId, dto.status, dto.notes);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.record.delete({ where: { id } });
    return { deleted: true };
  }

  // ---- helpers ----

  private async list(query: RecordQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.patientId) where.patientId = query.patientId;
    if (query.clientId) where.clientId = query.clientId;

    const [data, total] = await Promise.all([
      this.prisma.record.findMany({ where, select: recordSelect, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.record.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  private async transition(
    id: string,
    userId: string,
    newStatus: RecordStatus,
    notes?: string,
  ) {
    const record = await this.findOne(id);
    const current = record.status as RecordStatus;
    const allowed = ALLOWED_TRANSITIONS[current] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(`Cannot transition from ${current} to ${newStatus}`);
    }

    return this.prisma.record.update({
      where: { id },
      data: {
        status: newStatus,
        dateStatus: new Date(),
        statusHistory: { create: { status: newStatus, userId, notes } },
      },
      select: recordSelect,
    });
  }

  private generateIdentifier() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    return `REC-${date}-${suffix}`;
  }
}
