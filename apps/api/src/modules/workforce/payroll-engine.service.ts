import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LeaveRequestStatus, PayrollPeriodStatus, Prisma, TimesheetStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreatePayrollPeriodDto } from './dto/workforce-phase3.dto';
import { calculateStatutoryDeductions } from '../../common/payroll/statutory-deductions';

const DAY = 86_400_000;
const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const inclusiveDays = (start: Date, end: Date) => Math.floor((+dayStart(end) - +dayStart(start)) / DAY) + 1;
const round = (n: number) => Math.round(n);

// Hourly rate derived from a monthly salary (cents): 22 work days × 8 hours.
const WORK_DAYS_PER_MONTH = 22;
const WORK_HOURS_PER_DAY = 8;
const MONTHLY_WORK_HOURS = WORK_DAYS_PER_MONTH * WORK_HOURS_PER_DAY; // 176

// Statutory deductions come from the single shared authoritative core (R-008) — no duplicated
// NIS/NHT/Education-Tax/PAYE arithmetic lives in this engine.

@Injectable()
export class PayrollEngineService {
  constructor(private prisma: PrismaService) {}

  // ── Periods ─────────────────────────────────────────────────────────────────
  async createPeriod(dto: CreatePayrollPeriodDto) {
    const existing = await this.prisma.payrollPeriod.findFirst({ where: { year: dto.year, month: dto.month } });
    if (existing) throw new BadRequestException(`A payroll period for ${dto.year}-${String(dto.month).padStart(2, '0')} already exists`);
    return this.prisma.payrollPeriod.create({
      data: { month: dto.month, year: dto.year, status: PayrollPeriodStatus.DRAFT } as Prisma.PayrollPeriodUncheckedCreateInput,
    });
  }

  listPeriods() {
    return this.prisma.payrollPeriod.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: { processedBy: { select: { firstName: true, lastName: true } }, _count: { select: { entries: true } } },
    });
  }

  async periodDetail(id: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id },
      include: {
        processedBy: { select: { firstName: true, lastName: true } },
        entries: {
          orderBy: { grossCents: 'desc' },
          include: { employee: { include: { user: { select: { firstName: true, lastName: true } }, department: { select: { name: true } } } } },
        },
      },
    });
    if (!period) throw new NotFoundException('Payroll period not found');
    return period;
  }

  async periodEntries(id: string) {
    const period = await this.prisma.payrollPeriod.findFirst({ where: { id }, select: { id: true } });
    if (!period) throw new NotFoundException('Payroll period not found');
    return this.prisma.payrollEntry.findMany({
      where: { payrollPeriodId: id },
      orderBy: { grossCents: 'desc' },
      include: { employee: { include: { user: { select: { firstName: true, lastName: true } }, department: { select: { name: true } } } } },
    });
  }

  employeeHistory(employeeId: string) {
    return this.prisma.payrollEntry.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
      include: { payrollPeriod: { select: { month: true, year: true, status: true } } },
    });
  }

  // ── The engine ──────────────────────────────────────────────────────────────
  async processPeriod(id: string, userId: string) {
    const period = await this.prisma.payrollPeriod.findFirst({ where: { id } });
    if (!period) throw new NotFoundException('Payroll period not found');
    if (period.status === PayrollPeriodStatus.CANCELLED) throw new BadRequestException('Period is cancelled');

    const monthStart = new Date(period.year, period.month - 1, 1);
    const monthEndExcl = new Date(period.year, period.month, 1);

    await this.prisma.payrollPeriod.update({ where: { id }, data: { status: PayrollPeriodStatus.PROCESSING } });
    // Re-run safe: clear any prior entries for this period.
    await this.prisma.payrollEntry.deleteMany({ where: { payrollPeriodId: id } });

    const employees = await this.prisma.employee.findMany({ where: { isActive: true } });
    const otRule = await this.prisma.overtimeRule.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } });
    const otMultiplier = otRule?.rateMultiplierX100 ?? 150;

    let totalGross = 0, totalNet = 0, totalTax = 0, count = 0;

    for (const emp of employees) {
      // Approved timesheets overlapping the payroll month.
      const timesheets = await this.prisma.timesheet.findMany({
        where: {
          employeeId: emp.id,
          status: TimesheetStatus.Approved,
          periodStart: { lt: monthEndExcl },
          periodEnd: { gte: monthStart },
        },
        select: { regularHours: true, overtimeHours: true },
      });
      const regularMinutes = round(timesheets.reduce((s, t) => s + t.regularHours, 0) * 60);
      const overtimeMinutes = round(timesheets.reduce((s, t) => s + t.overtimeHours, 0) * 60);

      const hourlyRateCents = emp.salary / MONTHLY_WORK_HOURS;
      const grossCents = round(
        (regularMinutes / 60) * hourlyRateCents +
        (overtimeMinutes / 60) * hourlyRateCents * (otMultiplier / 100),
      );

      // Statutory deductions (all cents) — delegated to the shared authoritative core (R-008).
      const {
        nis: nisCents, nht: nhtCents, edTax: educationTaxCents, paye: payeCents, total: totalDeductionsCents,
      } = calculateStatutoryDeductions(grossCents);
      const netCents = grossCents - totalDeductionsCents;

      // Approved leave days taken within the month.
      const leaves = await this.prisma.leaveRequest.findMany({
        where: { employeeId: emp.id, status: LeaveRequestStatus.APPROVED, startDate: { lt: monthEndExcl }, endDate: { gte: monthStart } },
        select: { startDate: true, endDate: true },
      });
      let leaveDaysTaken = 0;
      for (const lv of leaves) {
        const oStart = new Date(Math.max(+dayStart(lv.startDate), +monthStart));
        const oEnd = new Date(Math.min(+dayStart(lv.endDate), +monthEndExcl - DAY));
        if (+oEnd >= +oStart) leaveDaysTaken += inclusiveDays(oStart, oEnd);
      }

      await this.prisma.payrollEntry.create({
        data: {
          payrollPeriodId: id, employeeId: emp.id, regularMinutes, overtimeMinutes,
          grossCents, nisCents, nhtCents, educationTaxCents, payeCents, totalDeductionsCents, netCents, leaveDaysTaken,
        } as Prisma.PayrollEntryUncheckedCreateInput,
      });

      totalGross += grossCents;
      totalNet += netCents;
      totalTax += totalDeductionsCents;
      count++;
    }

    return this.prisma.payrollPeriod.update({
      where: { id },
      data: {
        status: PayrollPeriodStatus.COMPLETED,
        totalGrossCents: totalGross, totalNetCents: totalNet, totalTaxCents: totalTax,
        employeeCount: count, processedAt: new Date(), processedById: userId,
      },
      include: { entries: true },
    });
  }
}
