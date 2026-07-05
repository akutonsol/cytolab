import { Injectable } from '@nestjs/common';
import { ClockEventType, LeaveRequestStatus, OvertimeStatus, TimesheetStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AttendanceReportQuery, DateRangeReportQuery } from './dto/workforce-phase2.dto';

const DAY = 86_400_000;
// Payroll conventions for deriving a rate from a monthly salary (cents).
const WORK_DAYS_PER_MONTH = 22;
const WORK_HOURS_PER_DAY = 8;
const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const isoDay = (d: Date) => new Date(d).toISOString().slice(0, 10);
const inclusiveDays = (start: Date, end: Date) => Math.floor((+dayStart(end) - +dayStart(start)) / DAY) + 1;
const LATE_GRACE_MIN = 8 * 60 + 15; // 08:15
const round = (n: number) => Math.round(n);

@Injectable()
export class WorkforceReportsService {
  constructor(private prisma: PrismaService) {}

  // 1. Attendance summary ───────────────────────────────────────────────────────
  async attendanceSummary(q: AttendanceReportQuery) {
    const start = dayStart(new Date(q.startDate));
    const end = dayStart(new Date(q.endDate));
    const totalDays = Math.max(1, inclusiveDays(start, end));

    const employees = await this.prisma.employee.findMany({
      where: { isActive: true, ...(q.departmentId ? { departmentId: q.departmentId } : {}) },
      include: { user: { select: { firstName: true, lastName: true } }, department: { select: { name: true } } },
      orderBy: { employeeNo: 'asc' },
    });
    const empIds = new Set(employees.map((e) => e.id));

    const events = await this.prisma.clockEvent.findMany({
      where: { type: ClockEventType.ClockIn, timestamp: { gte: start, lt: new Date(+end + DAY) } },
      orderBy: { timestamp: 'asc' },
    });
    // employeeId → day → earliest ClockIn timestamp
    const firstIn = new Map<string, Map<string, Date>>();
    for (const e of events) {
      if (!empIds.has(e.employeeId)) continue;
      const m = firstIn.get(e.employeeId) ?? new Map<string, Date>();
      const key = isoDay(e.timestamp);
      if (!m.has(key)) m.set(key, e.timestamp);
      firstIn.set(e.employeeId, m);
    }

    const leaves = await this.prisma.leaveRequest.findMany({
      where: {
        status: LeaveRequestStatus.APPROVED,
        startDate: { lte: new Date(+end + DAY) },
        endDate: { gte: start },
        employeeId: { in: employees.map((e) => e.id) },
      },
    });
    const leaveByEmp = new Map<string, number>();
    for (const lv of leaves) {
      const oStart = new Date(Math.max(+dayStart(lv.startDate), +start));
      const oEnd = new Date(Math.min(+dayStart(lv.endDate), +end));
      if (+oEnd < +oStart) continue;
      leaveByEmp.set(lv.employeeId, (leaveByEmp.get(lv.employeeId) ?? 0) + inclusiveDays(oStart, oEnd));
    }

    return employees.map((emp) => {
      const days = firstIn.get(emp.id) ?? new Map<string, Date>();
      const presentDays = days.size;
      let lateDays = 0;
      for (const [, ts] of days) {
        if (ts.getHours() * 60 + ts.getMinutes() > LATE_GRACE_MIN) lateDays++;
      }
      const leaveDays = Math.min(totalDays, leaveByEmp.get(emp.id) ?? 0);
      const absentDays = Math.max(0, totalDays - presentDays - leaveDays);
      const expected = Math.max(0, totalDays - leaveDays);
      const attendanceRate = expected > 0 ? Math.min(100, round((presentDays / expected) * 100)) : 100;
      return {
        employeeId: emp.id,
        name: `${emp.user.firstName} ${emp.user.lastName}`.trim(),
        department: emp.department?.name ?? null,
        totalDays, presentDays, absentDays, lateDays, leaveDays, attendanceRate,
      };
    });
  }

  // 2. Leave liability ──────────────────────────────────────────────────────────
  async leaveLiability() {
    const year = new Date().getFullYear();
    const balances = await this.prisma.leaveBalance.findMany({
      where: { year },
      include: {
        leaveType: { select: { name: true } },
        employee: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
    return balances.map((b) => {
      const remaining = b.entitlement - b.used - b.pending;
      // Daily rate from monthly salary (cents): salary / working days per month.
      const dailyRateCents = b.employee.salary / WORK_DAYS_PER_MONTH;
      const estimatedCostCents = round(Math.max(0, remaining) * dailyRateCents);
      return {
        employeeId: b.employeeId,
        name: `${b.employee.user.firstName} ${b.employee.user.lastName}`.trim(),
        leaveType: b.leaveType.name,
        year,
        entitlement: b.entitlement,
        used: b.used,
        pending: b.pending,
        remaining,
        estimatedCostCents,
      };
    });
  }

  // 3. Overtime cost ────────────────────────────────────────────────────────────
  async overtimeCost(q: DateRangeReportQuery) {
    const start = dayStart(new Date(q.startDate));
    const end = dayStart(new Date(q.endDate));
    const records = await this.prisma.overtimeRecord.findMany({
      where: { status: { not: OvertimeStatus.REJECTED }, date: { gte: start, lte: end } },
      include: {
        overtimeRule: { select: { rateMultiplierX100: true } },
        employee: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
    // Aggregate per employee: total OT minutes and OT cost.
    const agg = new Map<string, { name: string; salary: number; totalOvertimeMinutes: number; costCents: number; rateMultiplierX100: number }>();
    for (const r of records) {
      const key = r.employeeId;
      const cur = agg.get(key) ?? {
        name: `${r.employee.user.firstName} ${r.employee.user.lastName}`.trim(),
        salary: r.employee.salary,
        totalOvertimeMinutes: 0,
        costCents: 0,
        rateMultiplierX100: r.overtimeRule.rateMultiplierX100,
      };
      // Per-minute base rate from monthly salary (cents).
      const minuteRateCents = r.employee.salary / (WORK_DAYS_PER_MONTH * WORK_HOURS_PER_DAY * 60);
      cur.totalOvertimeMinutes += r.overtimeMinutes;
      cur.costCents += r.overtimeMinutes * minuteRateCents * (r.overtimeRule.rateMultiplierX100 / 100);
      cur.rateMultiplierX100 = r.overtimeRule.rateMultiplierX100;
      agg.set(key, cur);
    }
    return [...agg.entries()].map(([employeeId, v]) => ({
      employeeId,
      name: v.name,
      totalOvertimeMinutes: v.totalOvertimeMinutes,
      rateMultiplierX100: v.rateMultiplierX100,
      estimatedOvertimeCostCents: round(v.costCents),
    }));
  }

  // 4. Timesheet summary ────────────────────────────────────────────────────────
  async timesheetSummary(q: DateRangeReportQuery) {
    const start = dayStart(new Date(q.startDate));
    const end = dayStart(new Date(q.endDate));
    const timesheets = await this.prisma.timesheet.findMany({
      where: { periodStart: { lte: new Date(+end + DAY) }, periodEnd: { gte: start } },
      include: { employee: { include: { user: { select: { firstName: true, lastName: true } } } } },
    });
    const agg = new Map<string, { name: string; totalRegularMinutes: number; totalOvertimeMinutes: number; submittedCount: number; approvedCount: number; pendingCount: number }>();
    for (const ts of timesheets) {
      const cur = agg.get(ts.employeeId) ?? {
        name: `${ts.employee.user.firstName} ${ts.employee.user.lastName}`.trim(),
        totalRegularMinutes: 0, totalOvertimeMinutes: 0, submittedCount: 0, approvedCount: 0, pendingCount: 0,
      };
      cur.totalRegularMinutes += round(ts.regularHours * 60);
      cur.totalOvertimeMinutes += round(ts.overtimeHours * 60);
      if (ts.status === TimesheetStatus.Submitted) cur.submittedCount++;
      else if (ts.status === TimesheetStatus.Approved) cur.approvedCount++;
      else if (ts.status === TimesheetStatus.Draft || ts.status === TimesheetStatus.UnderReview) cur.pendingCount++;
      agg.set(ts.employeeId, cur);
    }
    return [...agg.entries()].map(([employeeId, v]) => ({ employeeId, ...v }));
  }
}
