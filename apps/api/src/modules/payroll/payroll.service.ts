import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PayAdviceStatus, PayrollRunStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { PayAdviceQueryDto, PayrollQueryDto, ProcessPayrollDto, UpdatePayAdviceDto } from './dto/payroll.dto';

// ── Jamaican statutory payroll deductions (employee side), monthly.
// All money is in minor units (cents). Rates/thresholds approximate the
// 2024/25 tables and are intentionally centralised so a lab can tune them.
const NIS_RATE = 0.03;
const NIS_MONTHLY_CEILING = 41_666_667; // cents (~JMD 5,000,000 / yr)
const NHT_RATE = 0.02;
const EDTAX_RATE = 0.0225;
const PAYE_THRESHOLD = 14_167_400; // cents/month (~JMD 1,700,088 / yr)
const PAYE_HIGHER_THRESHOLD = 50_000_000; // cents/month statutory income (~JMD 6,000,000 / yr)
const PAYE_RATE_1 = 0.25;
const PAYE_RATE_2 = 0.3;

export interface Deductions {
  grossPay: number;
  nis: number;
  nht: number;
  edTax: number;
  paye: number;
  otherDeductions: number;
  netPay: number;
}

/** Pure statutory-deduction calculator (exported so it can be unit-tested). */
export function computeDeductions(basicPay: number, overtime = 0, allowances = 0, otherDeductions = 0): Deductions {
  const grossPay = basicPay + overtime + allowances;
  const nis = Math.round(Math.min(grossPay, NIS_MONTHLY_CEILING) * NIS_RATE);
  const nht = Math.round(grossPay * NHT_RATE);
  const statutory = grossPay - nis; // NIS is deductible before edTax + PAYE
  const edTax = Math.round(statutory * EDTAX_RATE);
  let paye = 0;
  if (statutory > PAYE_THRESHOLD) {
    const band1 = Math.min(statutory, PAYE_HIGHER_THRESHOLD) - PAYE_THRESHOLD;
    paye = band1 * PAYE_RATE_1;
    if (statutory > PAYE_HIGHER_THRESHOLD) paye += (statutory - PAYE_HIGHER_THRESHOLD) * PAYE_RATE_2;
    paye = Math.round(paye);
  }
  const totalDeductions = nis + nht + edTax + paye + otherDeductions;
  return { grossPay, nis, nht, edTax, paye, otherDeductions, netPay: grossPay - totalDeductions };
}

const runListSelect = {
  id: true,
  period: true,
  status: true,
  totalGross: true,
  totalDeductions: true,
  totalNet: true,
  employeeCount: true,
  processedAt: true,
  processedBy: { select: { id: true, firstName: true, lastName: true } },
  createdAt: true,
} as const;

const adviceSelect = {
  id: true,
  period: true,
  basicPay: true,
  overtime: true,
  allowances: true,
  grossPay: true,
  nis: true,
  nht: true,
  edTax: true,
  paye: true,
  otherDeductions: true,
  netPay: true,
  status: true,
  issuedAt: true,
  employeeId: true,
  payrollRunId: true,
  employee: {
    select: {
      id: true,
      employeeNo: true,
      jobTitle: true,
      user: { select: { firstName: true, lastName: true } },
    },
  },
} as const;

@Injectable()
export class PayrollService {
  constructor(private prisma: PrismaService) {}

  // ── Payroll runs ────────────────────────────────────────────────
  async listRuns(query: PayrollQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const skip = (page - 1) * pageSize;
    const [data, total] = await Promise.all([
      this.prisma.payrollRun.findMany({ skip, take: pageSize, orderBy: { period: 'desc' }, select: runListSelect }),
      this.prisma.payrollRun.count(),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async getRun(id: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id },
      select: { ...runListSelect, payAdvices: { orderBy: { employee: { employeeNo: 'asc' } }, select: adviceSelect } },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    return run;
  }

  /** Generate a run for a period: one pay advice per active employee. */
  async processRun(dto: ProcessPayrollDto, userId: string) {
    const existing = await this.prisma.payrollRun.findFirst({ where: { period: dto.period }, select: { id: true } });
    if (existing) throw new BadRequestException(`A payroll run for ${dto.period} already exists`);

    const employees = await this.prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true, salary: true },
    });
    if (employees.length === 0) throw new BadRequestException('No active employees to process');

    let totalGross = 0;
    let totalNet = 0;
    let totalDeductions = 0;
    const advices = employees.map((e) => {
      const d = computeDeductions(e.salary);
      totalGross += d.grossPay;
      totalNet += d.netPay;
      totalDeductions += d.grossPay - d.netPay;
      return {
        // labId stamped by the tenancy extension (nested create).
        employeeId: e.id,
        period: dto.period,
        basicPay: e.salary,
        overtime: 0,
        allowances: 0,
        grossPay: d.grossPay,
        nis: d.nis,
        nht: d.nht,
        edTax: d.edTax,
        paye: d.paye,
        otherDeductions: 0,
        netPay: d.netPay,
        status: PayAdviceStatus.Issued,
        issuedAt: new Date(),
      };
    });

    const run = await this.prisma.payrollRun.create({
      data: {
        // labId stamped by the tenancy extension.
        period: dto.period,
        status: PayrollRunStatus.Completed,
        totalGross,
        totalDeductions,
        totalNet,
        employeeCount: employees.length,
        processedAt: new Date(),
        processedById: userId,
        payAdvices: { create: advices },
      } as Prisma.PayrollRunUncheckedCreateInput,
      select: { ...runListSelect, payAdvices: { orderBy: { employee: { employeeNo: 'asc' } }, select: adviceSelect } },
    });
    return run;
  }

  async removeRun(id: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id }, select: { id: true } });
    if (!run) throw new NotFoundException('Payroll run not found');
    await this.prisma.payrollRun.delete({ where: { id } }); // cascades pay advices
    return { deleted: true };
  }

  // ── Pay advices ─────────────────────────────────────────────────
  async listAdvices(query: PayAdviceQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 100;
    const skip = (page - 1) * pageSize;
    const where: Prisma.PayAdviceWhereInput = {
      ...(query.period && { period: query.period }),
      ...(query.employeeId && { employeeId: query.employeeId }),
    };
    const [data, total] = await Promise.all([
      this.prisma.payAdvice.findMany({ where, skip, take: pageSize, orderBy: { period: 'desc' }, select: adviceSelect }),
      this.prisma.payAdvice.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async getAdvice(id: string) {
    const advice = await this.prisma.payAdvice.findFirst({ where: { id }, select: adviceSelect });
    if (!advice) throw new NotFoundException('Pay advice not found');
    return advice;
  }

  /** Adjust overtime / allowances / other deductions and recompute the slip. */
  async updateAdvice(id: string, dto: UpdatePayAdviceDto) {
    const advice = await this.prisma.payAdvice.findFirst({
      where: { id },
      select: { id: true, basicPay: true, overtime: true, allowances: true, otherDeductions: true, payrollRunId: true, status: true },
    });
    if (!advice) throw new NotFoundException('Pay advice not found');
    if (advice.status === PayAdviceStatus.Paid) throw new BadRequestException('A paid advice can no longer be edited');

    const overtime = dto.overtime ?? advice.overtime;
    const allowances = dto.allowances ?? advice.allowances;
    const otherDeductions = dto.otherDeductions ?? advice.otherDeductions;
    const d = computeDeductions(advice.basicPay, overtime, allowances, otherDeductions);

    const updated = await this.prisma.payAdvice.update({
      where: { id },
      data: { overtime, allowances, grossPay: d.grossPay, nis: d.nis, nht: d.nht, edTax: d.edTax, paye: d.paye, otherDeductions, netPay: d.netPay },
      select: adviceSelect,
    });
    if (advice.payrollRunId) await this.recomputeRunTotals(advice.payrollRunId);
    return updated;
  }

  async payAdvice(id: string) {
    const advice = await this.prisma.payAdvice.findFirst({ where: { id }, select: { id: true, status: true } });
    if (!advice) throw new NotFoundException('Pay advice not found');
    return this.prisma.payAdvice.update({ where: { id }, data: { status: PayAdviceStatus.Paid }, select: adviceSelect });
  }

  private async recomputeRunTotals(runId: string) {
    const advices = await this.prisma.payAdvice.findMany({ where: { payrollRunId: runId }, select: { grossPay: true, netPay: true } });
    const totalGross = advices.reduce((s, a) => s + a.grossPay, 0);
    const totalNet = advices.reduce((s, a) => s + a.netPay, 0);
    await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { totalGross, totalNet, totalDeductions: totalGross - totalNet, employeeCount: advices.length },
    });
  }

  // ── Stats (KPI strip) ───────────────────────────────────────────
  async getStats() {
    const [runCount, latest] = await Promise.all([
      this.prisma.payrollRun.count(),
      this.prisma.payrollRun.findFirst({ orderBy: { period: 'desc' }, select: runListSelect }),
    ]);
    return {
      totalRuns: runCount,
      latestPeriod: latest?.period ?? null,
      latestNet: latest?.totalNet ?? 0,
      latestGross: latest?.totalGross ?? 0,
      latestEmployeeCount: latest?.employeeCount ?? 0,
    };
  }
}
