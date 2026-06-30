import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BillStatus, Prisma, RecordStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { RecordsService } from '../records/records.service';
import { BillQueryDto, CreateBillDto } from './dto/bill.dto';

const billSelect = {
  id: true,
  referenceNo: true,
  status: true,
  subtotal: true,
  taxTotal: true,
  total: true,
  amountPaid: true,
  dueDate: true,
  viewed: true,
  recordId: true,
  record: { select: { id: true, identifier: true, status: true } },
  clientId: true,
  client: { select: { id: true, firstName: true, lastName: true, officeName: true } },
  lines: {
    select: {
      id: true,
      serviceId: true,
      serviceName: true,
      serviceCode: true,
      description: true,
      quantity: true,
      unitPrice: true,
      amount: true,
    },
  },
  taxes: { select: { id: true, taxId: true, name: true, rateBasisPoints: true, amount: true } },
  payments: { select: { id: true, amount: true, type: true, verified: true, datePaid: true } },
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class BillingService {
  constructor(
    private prisma: PrismaService,
    private records: RecordsService,
  ) {}

  /** Add derived (not stored) fields to a bill payload. */
  private decorate<T extends { total: number; amountPaid: number; dueDate: Date | null; status: BillStatus }>(
    bill: T,
  ) {
    const outstanding = bill.total - bill.amountPaid; // minor units (cents)
    const isOverdue = !!bill.dueDate && bill.dueDate < new Date() && bill.status !== BillStatus.Paid;
    return { ...bill, outstanding, isOverdue };
  }

  async create(dto: CreateBillDto) {
    const record = await this.prisma.record.findFirst({
      where: { id: dto.recordId },
      select: { id: true, clientId: true },
    });
    if (!record) throw new NotFoundException('Record not found');

    // Snapshot each line's service identity + price at bill time.
    const serviceIds = [...new Set(dto.lines.map((l) => l.serviceId))];
    const services = await this.prisma.service.findMany({ where: { id: { in: serviceIds } } });
    const byId = new Map(services.map((s) => [s.id, s]));

    const lineData = dto.lines.map((l) => {
      const svc = byId.get(l.serviceId);
      if (!svc) throw new NotFoundException(`Service not found: ${l.serviceId}`);
      return {
        serviceId: svc.id,
        serviceName: svc.name,
        serviceCode: svc.code,
        description: l.description,
        quantity: l.quantity,
        unitPrice: svc.price, // snapshot
        amount: svc.price * l.quantity,
      };
    });
    const subtotal = lineData.reduce((sum, l) => sum + l.amount, 0);

    // Apply requested taxes, or the lab's defaults; snapshot name + rate.
    const taxes = dto.taxIds?.length
      ? await this.prisma.tax.findMany({ where: { id: { in: dto.taxIds } } })
      : await this.prisma.tax.findMany({ where: { isDefault: true } });
    const taxData = taxes.map((t) => ({
      taxId: t.id,
      name: t.name,
      rateBasisPoints: t.rateBasisPoints,
      amount: Math.round((subtotal * t.rateBasisPoints) / 10000),
    }));
    const taxTotal = taxData.reduce((sum, t) => sum + t.amount, 0);

    const bill = await this.prisma.bill.create({
      data: tenantCreate<Prisma.BillUncheckedCreateInput>({
        recordId: dto.recordId,
        clientId: dto.clientId ?? record.clientId ?? null,
        referenceNo: this.generateReference(),
        status: BillStatus.Draft,
        subtotal,
        taxTotal,
        total: subtotal + taxTotal,
        amountPaid: 0,
        dueDate: dto.dueDate,
        lines: {
          create: lineData.map((l) =>
            tenantCreate<Prisma.BillLineUncheckedCreateWithoutBillInput>(l),
          ),
        },
        taxes: taxData.length
          ? {
              create: taxData.map((t) =>
                tenantCreate<Prisma.BillTaxUncheckedCreateWithoutBillInput>(t),
              ),
            }
          : undefined,
      }),
      select: billSelect,
    });
    return this.decorate(bill);
  }

  async findAll(query: BillQueryDto, statusFilter?: BillStatus[]) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.BillWhereInput = {};
    if (query.status) where.status = query.status;
    else if (statusFilter) where.status = { in: statusFilter };

    const [data, total] = await Promise.all([
      this.prisma.bill.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' }, select: billSelect }),
      this.prisma.bill.count({ where }),
    ]);
    return paginate(data.map((b) => this.decorate(b)), total, page, pageSize);
  }

  async findOne(id: string) {
    const bill = await this.prisma.bill.findFirst({ where: { id }, select: billSelect });
    if (!bill) throw new NotFoundException('Bill not found');
    return this.decorate(bill);
  }

  async summary() {
    const [counts, totals] = await Promise.all([
      this.prisma.bill.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.bill.aggregate({ _sum: { total: true, amountPaid: true } }),
    ]);
    const billed = totals._sum.total ?? 0;
    const collected = totals._sum.amountPaid ?? 0;
    return {
      byStatus: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
      billed, // minor units (cents)
      collected, // minor units (cents)
      outstanding: billed - collected, // minor units (cents)
    };
  }

  /**
   * Issue a draft bill. Advances the linked record Approved -> Billed via the
   * record lifecycle (which validates the transition and writes a status event),
   * and flags the record billed.
   */
  async issue(id: string, userId: string) {
    const bill = await this.prisma.bill.findFirst({ where: { id }, select: { id: true, recordId: true, status: true } });
    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.status !== BillStatus.Draft) throw new BadRequestException('Bill has already been issued');

    // Lifecycle: a record must be Approved before its bill can be issued.
    await this.records.updateStatus(bill.recordId, userId, {
      status: RecordStatus.Billed,
      notes: 'Bill issued',
    });
    await this.prisma.record.update({ where: { id: bill.recordId }, data: { billed: true } });

    await this.prisma.bill.update({ where: { id }, data: { status: BillStatus.Issued } });
    return this.findOne(id);
  }

  async markViewed(id: string) {
    await this.findOne(id);
    await this.prisma.bill.update({ where: { id }, data: { viewed: true } });
    return this.findOne(id);
  }

  private generateReference() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    return `BILL-${date}-${suffix}`;
  }
}
