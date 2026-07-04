import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PayAdviceStatus, PayrollRunStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { ApproveRunDto, PayAdviceQueryDto, PayrollQueryDto, ProcessPayrollDto, UpdatePayAdviceDto } from './dto/payroll.dto';

// ── Jamaican statutory payroll deductions (employee side), monthly. All money is
// in minor units (cents). Rates/thresholds approximate the 2024/25 tables and
// are centralised so a lab can tune them.
const NIS_RATE = 0.03;
const NIS_MONTHLY_CEILING = 41_666_667; // cents (~JMD 5,000,000 / yr)
const NHT_RATE = 0.02;
const EDTAX_RATE = 0.0225;
const PAYE_THRESHOLD = 14_167_400; // cents/month (~JMD 1,700,088 / yr)
const PAYE_HIGHER_THRESHOLD = 50_000_000; // cents/month statutory income (~JMD 6,000,000 / yr)
const PAYE_RATE_1 = 0.25;
const PAYE_RATE_2 = 0.3;

export interface AdviceInput {
  basicPay: number;
  overtime?: number;
  allowances?: number;
  commission?: number;
  bonus?: number;
  pension?: number;
  reimbursement?: number;
  otherDeductions?: number;
}
export interface AdviceComputed {
  grossPay: number; nis: number; nht: number; edTax: number; paye: number; netPay: number;
}

/** Pure statutory-deduction calculator (exported for unit testing). */
export function computeAdvice(i: AdviceInput): AdviceComputed {
  const grossPay = i.basicPay + (i.overtime ?? 0) + (i.allowances ?? 0) + (i.commission ?? 0) + (i.bonus ?? 0);
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
  const totalDeductions = nis + nht + edTax + paye + (i.pension ?? 0) + (i.reimbursement ?? 0) + (i.otherDeductions ?? 0);
  return { grossPay, nis, nht, edTax, paye, netPay: grossPay - totalDeductions };
}

const runListSelect = {
  id: true, period: true, status: true, runNumber: true, payrollDate: true,
  totalGross: true, totalDeductions: true, totalNet: true, employeeCount: true,
  integrityHash: true, processedAt: true, approvedAt: true, approvalNotes: true,
  processedBy: { select: { id: true, firstName: true, lastName: true } },
  approvedBy: { select: { id: true, firstName: true, lastName: true } },
  createdAt: true,
} as const;

const adviceSelect = {
  id: true, period: true, hoursWorked: true,
  basicPay: true, overtime: true, allowances: true, commission: true, bonus: true, grossPay: true,
  nis: true, nht: true, edTax: true, paye: true, pension: true, reimbursement: true, otherDeductions: true, netPay: true,
  ytdGross: true, ytdNis: true, ytdNht: true, ytdEdTax: true, ytdPaye: true, ytdPension: true, ytdLoanBalance: true,
  status: true, issuedAt: true, employeeId: true, payrollRunId: true,
  employee: {
    select: {
      id: true, employeeNo: true, jobTitle: true, isFixedSalary: true, salary: true, nis: true, trn: true,
      user: { select: { firstName: true, lastName: true } },
      department: { select: { name: true } },
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
      select: {
        ...runListSelect,
        lab: { select: { name: true, address: true, phone: true } },
        payAdvices: { orderBy: { employee: { employeeNo: 'asc' } }, select: adviceSelect },
      },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    return run;
  }

  /**
   * Generate a run for a period: one pay advice per active employee, applying
   * per-employee earnings overrides, YTD roll-ups, a sequential run number, and
   * a tamper-evidence integrity hash.
   */
  async processRun(dto: ProcessPayrollDto, userId: string) {
    const existing = await this.prisma.payrollRun.findFirst({ where: { period: dto.period }, select: { id: true } });
    if (existing) throw new BadRequestException(`A payroll run for ${dto.period} already exists`);

    const employees = await this.prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true, salary: true, isFixedSalary: true },
    });
    if (employees.length === 0) throw new BadRequestException('No active employees to process');

    const lineByEmp = new Map((dto.lines ?? []).map((l) => [l.employeeId, l]));
    const year = dto.period.slice(0, 4);

    // Prior YTD (same year, earlier periods) per employee.
    const priors = await this.prisma.payAdvice.findMany({
      where: { period: { startsWith: `${year}-`, lt: dto.period } },
      select: { employeeId: true, grossPay: true, nis: true, nht: true, edTax: true, paye: true, pension: true },
    });
    const priorByEmp = new Map<string, { g: number; nis: number; nht: number; ed: number; paye: number; pen: number }>();
    for (const p of priors) {
      const acc = priorByEmp.get(p.employeeId) ?? { g: 0, nis: 0, nht: 0, ed: 0, paye: 0, pen: 0 };
      acc.g += p.grossPay; acc.nis += p.nis; acc.nht += p.nht; acc.ed += p.edTax; acc.paye += p.paye; acc.pen += p.pension;
      priorByEmp.set(p.employeeId, acc);
    }

    let totalGross = 0, totalNet = 0, totalDeductions = 0;
    const advices = employees.map((e) => {
      const line = lineByEmp.get(e.id);
      const input: AdviceInput = {
        basicPay: e.salary,
        overtime: line?.overtime ?? 0,
        allowances: line?.allowances ?? 0,
        commission: line?.commission ?? 0,
        bonus: line?.bonus ?? 0,
        pension: line?.pension ?? 0,
        reimbursement: line?.reimbursement ?? 0,
        otherDeductions: line?.otherDeductions ?? 0,
      };
      const c = computeAdvice(input);
      totalGross += c.grossPay; totalNet += c.netPay; totalDeductions += c.grossPay - c.netPay;
      const prior = priorByEmp.get(e.id) ?? { g: 0, nis: 0, nht: 0, ed: 0, paye: 0, pen: 0 };
      const pension = input.pension ?? 0;
      return {
        employeeId: e.id,
        period: dto.period,
        hoursWorked: line?.hoursWorked ?? 0,
        basicPay: e.salary,
        overtime: input.overtime, allowances: input.allowances, commission: input.commission, bonus: input.bonus,
        grossPay: c.grossPay,
        nis: c.nis, nht: c.nht, edTax: c.edTax, paye: c.paye,
        pension, reimbursement: input.reimbursement ?? 0, otherDeductions: input.otherDeductions ?? 0,
        netPay: c.netPay,
        ytdGross: prior.g + c.grossPay, ytdNis: prior.nis + c.nis, ytdNht: prior.nht + c.nht,
        ytdEdTax: prior.ed + c.edTax, ytdPaye: prior.paye + c.paye, ytdPension: prior.pen + pension, ytdLoanBalance: 0,
        status: PayAdviceStatus.Issued,
        issuedAt: new Date(),
      };
    });

    const maxRun = await this.prisma.payrollRun.aggregate({ _max: { runNumber: true } });
    const runNumber = (maxRun._max.runNumber ?? 0) + 1;
    const payrollDate = dto.payrollDate ? new Date(dto.payrollDate) : new Date();
    const integrityHash = createHash('sha256')
      .update(JSON.stringify({
        runNumber, period: dto.period, payrollDate: payrollDate.toISOString(), totalGross, totalNet,
        advices: advices.map((a) => ({ e: a.employeeId, n: a.netPay })).sort((x, y) => x.e.localeCompare(y.e)),
      }))
      .digest('hex');

    const run = await this.prisma.payrollRun.create({
      data: {
        period: dto.period,
        status: PayrollRunStatus.Completed,
        runNumber, payrollDate, integrityHash,
        totalGross, totalDeductions, totalNet, employeeCount: employees.length,
        processedAt: new Date(), processedById: userId,
        payAdvices: { create: advices },
      } as Prisma.PayrollRunUncheckedCreateInput,
      select: { ...runListSelect, payAdvices: { orderBy: { employee: { employeeNo: 'asc' } }, select: adviceSelect } },
    });
    return run;
  }

  async approveRun(id: string, userId: string, dto: ApproveRunDto) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id }, select: { id: true, status: true, approvedAt: true } });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status !== PayrollRunStatus.Completed) throw new BadRequestException('Only a completed run can be approved');
    if (run.approvedAt) throw new BadRequestException('Run is already approved');
    return this.prisma.payrollRun.update({
      where: { id },
      data: { approvedAt: new Date(), approvedById: userId, approvalNotes: dto.notes?.trim() || null },
      select: { ...runListSelect, payAdvices: { orderBy: { employee: { employeeNo: 'asc' } }, select: adviceSelect } },
    });
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

  /** Everything the standalone payslip page needs (advice + employee + run + lab). */
  async getSlip(id: string, labId: string) {
    const advice = await this.prisma.payAdvice.findFirst({
      where: { id },
      select: { ...adviceSelect, payrollRun: { select: { period: true, payrollDate: true, runNumber: true } } },
    });
    if (!advice) throw new NotFoundException('Pay advice not found');
    const lab = await this.prisma.lab.findUnique({ where: { id: labId }, select: { name: true, address: true, phone: true } });
    return { ...advice, lab };
  }

  async updateAdvice(id: string, dto: UpdatePayAdviceDto) {
    const a = await this.prisma.payAdvice.findFirst({
      where: { id },
      select: {
        id: true, basicPay: true, overtime: true, allowances: true, commission: true, bonus: true,
        pension: true, reimbursement: true, otherDeductions: true, payrollRunId: true, status: true,
      },
    });
    if (!a) throw new NotFoundException('Pay advice not found');
    if (a.status === PayAdviceStatus.Paid) throw new BadRequestException('A paid advice can no longer be edited');

    const input: AdviceInput = {
      basicPay: a.basicPay,
      overtime: dto.overtime ?? a.overtime,
      allowances: dto.allowances ?? a.allowances,
      commission: dto.commission ?? a.commission,
      bonus: dto.bonus ?? a.bonus,
      pension: dto.pension ?? a.pension,
      reimbursement: dto.reimbursement ?? a.reimbursement,
      otherDeductions: dto.otherDeductions ?? a.otherDeductions,
    };
    const c = computeAdvice(input);
    const updated = await this.prisma.payAdvice.update({
      where: { id },
      data: {
        overtime: input.overtime, allowances: input.allowances, commission: input.commission, bonus: input.bonus,
        pension: input.pension, reimbursement: input.reimbursement, otherDeductions: input.otherDeductions,
        ...(dto.hoursWorked !== undefined && { hoursWorked: dto.hoursWorked }),
        grossPay: c.grossPay, nis: c.nis, nht: c.nht, edTax: c.edTax, paye: c.paye, netPay: c.netPay,
      },
      select: adviceSelect,
    });
    if (a.payrollRunId) await this.recomputeRunTotals(a.payrollRunId);
    return updated;
  }

  async payAdvice(id: string) {
    const advice = await this.prisma.payAdvice.findFirst({ where: { id }, select: { id: true } });
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

  // ── Stats (landing page) ────────────────────────────────────────
  async getStats() {
    const [runCount, latest] = await Promise.all([
      this.prisma.payrollRun.count(),
      this.prisma.payrollRun.findFirst({ orderBy: { period: 'desc' }, select: runListSelect }),
    ]);
    return {
      totalRuns: runCount,
      latest: latest ?? null,
    };
  }
}
