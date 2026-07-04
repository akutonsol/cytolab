import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BillStatus, NotificationType, Prisma, RecordStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { RecordsService } from '../records/records.service';
import { NotificationsHelper } from '../notifications/notifications.helper';
import { CreatePaymentDto, PaymentQueryDto } from './dto/payment.dto';

const paymentSelect = {
  id: true,
  billId: true,
  amount: true,
  type: true,
  referenceNo: true,
  bank: true,
  chequeNumber: true,
  verified: true,
  datePaid: true,
  createdAt: true,
} as const;

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private records: RecordsService,
    private notifs: NotificationsHelper,
  ) {}

  /**
   * Record a payment against a bill. Multiple payments settle a bill partially;
   * amountPaid is recomputed from the authoritative payment rows. When the bill
   * becomes fully settled it flips to Paid and the record advances Billed -> Paid.
   */
  async create(dto: CreatePaymentDto, userId: string) {
    const bill = await this.prisma.bill.findFirst({
      where: { id: dto.billId },
      select: { id: true, total: true, amountPaid: true, status: true, recordId: true, referenceNo: true },
    });
    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.status === BillStatus.Draft) {
      throw new BadRequestException('Bill must be issued before it can be paid');
    }
    if (bill.status === BillStatus.Paid) {
      throw new BadRequestException('Bill is already fully paid');
    }
    const outstanding = bill.total - bill.amountPaid; // minor units (cents)
    if (dto.amount > outstanding) {
      throw new BadRequestException('Payment exceeds the outstanding balance');
    }

    const { payment, status } = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: tenantCreate<Prisma.PaymentUncheckedCreateInput>({
          billId: dto.billId,
          amount: dto.amount,
          type: dto.type,
          referenceNo: dto.referenceNo,
          bank: dto.bank,
          chequeNumber: dto.chequeNumber,
        }),
        select: paymentSelect,
      });
      // Recompute from the payment rows so amountPaid can't drift.
      const agg = await tx.payment.aggregate({ where: { billId: dto.billId }, _sum: { amount: true } });
      const amountPaid = agg._sum.amount ?? 0;
      const status = amountPaid >= bill.total ? BillStatus.Paid : BillStatus.PartiallyPaid;
      await tx.bill.update({ where: { id: dto.billId }, data: { amountPaid, status } });
      return { payment, status };
    });

    // Full settlement advances the record Billed -> Paid (only when valid).
    if (status === BillStatus.Paid) {
      const record = await this.prisma.record.findFirst({
        where: { id: bill.recordId },
        select: { status: true },
      });
      if (record?.status === RecordStatus.Billed) {
        await this.records.updateStatus(bill.recordId, userId, {
          status: RecordStatus.Paid,
          notes: 'Bill fully paid',
        });
      }
    }

    // Notify finance staff of the received payment (best-effort).
    await this.notifs.notifyPermission('payment:view', {
      type: NotificationType.PAYMENT_RECEIVED,
      title: 'Payment received',
      body: `$${(payment.amount / 100).toFixed(2)} received for ${bill.referenceNo ?? 'a bill'}.`,
      link: '/billing',
      entityId: payment.id,
      entityType: 'payment',
    });

    return payment;
  }

  async findAll(query: PaymentQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where: Prisma.PaymentWhereInput = {};
    if (query.billId) where.billId = query.billId;

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({ where, skip, take: pageSize, orderBy: { datePaid: 'desc' }, select: paymentSelect }),
      this.prisma.payment.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  /** Payments recorded against a single bill (legacy GET /bill/payments/:id). */
  paymentsForBill(billId: string, query: PaymentQueryDto) {
    return this.findAll({ ...query, billId });
  }

  async summary() {
    const [count, totals, byType] = await Promise.all([
      this.prisma.payment.count(),
      this.prisma.payment.aggregate({ _sum: { amount: true } }),
      this.prisma.payment.groupBy({ by: ['type'], _sum: { amount: true }, _count: { _all: true } }),
    ]);
    return {
      count,
      collected: totals._sum.amount ?? 0, // minor units (cents)
      byType: byType.map((t) => ({ type: t.type, count: t._count._all, amount: t._sum.amount ?? 0 })),
    };
  }

  async verify(id: string) {
    const payment = await this.prisma.payment.findFirst({ where: { id } });
    if (!payment) throw new NotFoundException('Payment not found');
    return this.prisma.payment.update({ where: { id }, data: { verified: true }, select: paymentSelect });
  }
}
