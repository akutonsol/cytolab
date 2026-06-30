import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RecordStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
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
  constructor(private prisma: PrismaService) {}

  async findAll(labId: string, query: RecordQueryDto) {
    return this.list(labId, query);
  }

  async findApproved(labId: string, query: RecordQueryDto) {
    return this.list(labId, { ...query, status: RecordStatus.Approved });
  }

  async findBillable(labId: string, query: RecordQueryDto) {
    // Completed + Approved but not yet billed
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where = {
      labId,
      billed: false,
      status: { in: [RecordStatus.Completed, RecordStatus.Approved] },
    };
    const [data, total] = await Promise.all([
      this.prisma.record.findMany({ where, select: recordSelect, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.record.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findByClient(labId: string, clientId: string, query: RecordQueryDto) {
    return this.list(labId, { ...query, clientId });
  }

  async findByPatient(labId: string, patientId: string, query: RecordQueryDto) {
    return this.list(labId, { ...query, patientId });
  }

  async findRecent(labId: string, query: RecordQueryDto) {
    const pageSize = query.pageSize ?? 10;
    const where: any = { labId };
    const data = await this.prisma.record.findMany({
      where,
      select: recordSelect,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });
    return { data, total: data.length };
  }

  async findByRequisition(labId: string, requisitionId: string, query: RecordQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where = { labId, requisitionLines: { some: { requisitionId } } };
    const [data, total] = await Promise.all([
      this.prisma.record.findMany({ where, select: recordSelect, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.record.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findOne(labId: string, id: string) {
    const record = await this.prisma.record.findFirst({ where: { id, labId }, select: recordSelect });
    if (!record) throw new NotFoundException('Record not found');
    return record;
  }

  async create(labId: string, userId: string, dto: CreateRecordDto) {
    const { specimens, therapy, requisitionLineId, ...rest } = dto;
    const identifier = this.generateIdentifier();

    const record = await this.prisma.record.create({
      data: {
        labId,
        identifier,
        ...rest,
        specimens: specimens?.length
          ? { create: specimens.map((s) => ({ labId, ...s })) }
          : undefined,
        therapy: therapy ? { create: therapy } : undefined,
        statusHistory: {
          create: { status: RecordStatus.Pending, userId, notes: 'Record created' },
        },
      },
      select: recordSelect,
    });

    // Link to requisition line if provided
    if (requisitionLineId) {
      await this.prisma.requisitionLine.update({
        where: { id: requisitionLineId },
        data: { recordId: record.id },
      });
    }

    return record;
  }

  async update(labId: string, id: string, userId: string, dto: UpdateRecordDto) {
    await this.findOne(labId, id);
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

  async submit(labId: string, id: string, userId: string) {
    return this.transition(labId, id, userId, RecordStatus.Submitted, 'Submitted by staff');
  }

  async updateStatus(labId: string, id: string, userId: string, dto: UpdateRecordStatusDto) {
    return this.transition(labId, id, userId, dto.status, dto.notes);
  }

  async remove(labId: string, id: string) {
    await this.findOne(labId, id);
    await this.prisma.record.delete({ where: { id } });
    return { deleted: true };
  }

  // ---- helpers ----

  private async list(labId: string, query: RecordQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: any = { labId };
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
    labId: string,
    id: string,
    userId: string,
    newStatus: RecordStatus,
    notes?: string,
  ) {
    const record = await this.findOne(labId, id);
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
