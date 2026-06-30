import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LabContext } from '../../common/tenancy/lab-context';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { CreateRequisitionDto, RequisitionQueryDto } from './dto/requisition.dto';

const requisitionSelect = {
  id: true,
  status: true,
  amount: true,
  entriesCompleted: true,
  clientId: true,
  client: { select: { id: true, firstName: true, lastName: true, officeName: true } },
  workspaceId: true,
  dateReceived: true,
  lines: {
    select: {
      id: true,
      isUrgent: true,
      isCompleted: true,
      description: true,
      amount: true,
      recordId: true,
    },
  },
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
    return this.prisma.requisition.create({
      data: tenantCreate<Prisma.RequisitionUncheckedCreateInput>({
        ...rest,
        lines: lines?.length
          ? { create: lines.map((l) => ({ isUrgent: l.isUrgent ?? false, description: l.description, amount: l.amount ?? 0 })) }
          : undefined,
      }),
      select: requisitionSelect,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.requisition.delete({ where: { id } });
    return { deleted: true };
  }

  // RequisitionLine has no labId column of its own, so the extension can't scope
  // it directly — guard ownership through the parent requisition's lab.
  async removeLine(lineId: string) {
    const line = await this.prisma.requisitionLine.findFirst({
      where: { id: lineId, requisition: { labId: this.labContext.getLabId() } },
    });
    if (!line) throw new NotFoundException('Requisition line not found');
    await this.prisma.requisitionLine.delete({ where: { id: lineId } });
    return { deleted: true };
  }
}
