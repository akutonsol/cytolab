import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClockEventType, Prisma, ShiftType, TimesheetStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WorkforceNotificationService } from './workforce-notification.service';
import {
  AssignShiftDto, AttendanceSummaryQuery, BulkAssignDto, ClockDto, ClockHistoryQuery, CorrectClockDto,
  CreateShiftDto, GenerateTimesheetDto, ScheduleQuery, TimesheetQuery, UpdateShiftDto,
} from './dto/workforce.dto';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const CLOCK_IN_TYPES: ClockEventType[] = [ClockEventType.ClockIn, ClockEventType.BreakEnd, ClockEventType.LunchEnd];
const BREAK_TYPES: ClockEventType[] = [ClockEventType.BreakStart, ClockEventType.LunchStart];
const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const isoDay = (d: Date) => new Date(d).toISOString().slice(0, 10);
const hhmmToMin = (s: string) => { const [h, m] = s.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class WorkforceService {
  constructor(
    private prisma: PrismaService,
    private notifications: WorkforceNotificationService,
    private realtime: RealtimeGateway,
  ) {}

  // ── Shift detection ─────────────────────────────────────────────────────────
  private async shiftForTime(when: Date) {
    const shifts = await this.prisma.shift.findMany({ where: { isActive: true } });
    const min = when.getHours() * 60 + when.getMinutes();
    return shifts.find((s) => {
      const a = hhmmToMin(s.startTime), b = hhmmToMin(s.endTime);
      return a <= b ? min >= a && min < b : min >= a || min < b;
    }) ?? null;
  }

  // Walk a day's sorted events → worked ms, current state, break count.
  private tally(events: { type: ClockEventType; timestamp: Date }[], upTo = new Date()) {
    const sorted = [...events].sort((x, y) => +x.timestamp - +y.timestamp);
    let workedMs = 0, openFrom: number | null = null, clockedInAt: Date | null = null, breakCount = 0, everIn = false, lastOut: Date | null = null;
    for (const e of sorted) {
      const t = +e.timestamp;
      if (CLOCK_IN_TYPES.includes(e.type)) {
        if (e.type === ClockEventType.ClockIn) { clockedInAt = e.timestamp; everIn = true; }
        if (openFrom == null) openFrom = t;
      } else if (BREAK_TYPES.includes(e.type)) {
        if (openFrom != null) { workedMs += t - openFrom; openFrom = null; }
        breakCount++;
      } else if (e.type === ClockEventType.ClockOut) {
        if (openFrom != null) { workedMs += t - openFrom; openFrom = null; }
        lastOut = e.timestamp;
      }
    }
    const isClockedIn = openFrom != null;
    if (openFrom != null) workedMs += Math.max(0, +upTo - openFrom); // live accrual
    return { workedMs, isClockedIn, clockedInAt, breakCount, everIn, lastOut };
  }

  private async eventsForDay(employeeId: string, day: Date) {
    const start = dayStart(day); const end = new Date(+start + DAY);
    return this.prisma.clockEvent.findMany({ where: { employeeId, timestamp: { gte: start, lt: end } }, orderBy: { timestamp: 'asc' } });
  }

  // ── Clock endpoints ───────────────────────────────────────────────────────────
  async clock(dto: ClockDto) {
    const emp = await this.prisma.employee.findFirst({ where: { id: dto.employeeId } });
    if (!emp) throw new NotFoundException('Employee not found');
    const now = new Date();
    const shift = await this.shiftForTime(now);
    const event = await this.prisma.clockEvent.create({
      data: {
        employeeId: dto.employeeId, type: dto.type, method: dto.method ?? undefined,
        location: dto.location ?? null, notes: dto.notes ?? null,
      } as Prisma.ClockEventUncheckedCreateInput,
    });
    const dayEvents = await this.eventsForDay(dto.employeeId, now);
    const t = this.tally(dayEvents, now);
    // Realtime: roster/attendance changes → push to the lab so the workforce
    // dashboard updates live when someone clocks in/out.
    const rtEvent = dto.type === ClockEventType.ClockIn ? 'attendance:clockin'
      : dto.type === ClockEventType.ClockOut ? 'attendance:clockout' : 'attendance:update';
    this.realtime.emitToLab(emp.labId, rtEvent, {
      type: rtEvent,
      data: { employeeId: dto.employeeId, clockType: dto.type, isClockedIn: t.isClockedIn },
    });
    return {
      event,
      currentStatus: t.isClockedIn ? 'ClockedIn' : 'ClockedOut',
      hoursToday: round2(t.workedMs / HOUR),
      currentShift: shift ? { id: shift.id, name: shift.name, type: shift.type } : null,
    };
  }

  async clockStatus(employeeId: string) {
    const now = new Date();
    const dayEvents = await this.eventsForDay(employeeId, now);
    const t = this.tally(dayEvents, now);
    const shift = await this.shiftForTime(now);
    return {
      isClockedIn: t.isClockedIn,
      clockedInAt: t.clockedInAt,
      hoursToday: round2(t.workedMs / HOUR),
      currentShift: shift ? { id: shift.id, name: shift.name, type: shift.type, color: shift.color } : null,
      breakCount: t.breakCount,
    };
  }

  async clockHistory(employeeId: string, q: ClockHistoryQuery) {
    const gte = q.dateFrom ? new Date(q.dateFrom) : new Date(Date.now() - 30 * DAY);
    const lte = q.dateTo ? new Date(new Date(q.dateTo).setHours(23, 59, 59, 999)) : new Date();
    return this.prisma.clockEvent.findMany({ where: { employeeId, timestamp: { gte, lte } }, orderBy: { timestamp: 'desc' } });
  }

  async correctClock(eventId: string, dto: CorrectClockDto, userId?: string) {
    const ev = await this.prisma.clockEvent.findFirst({ where: { id: eventId } });
    if (!ev) throw new NotFoundException('Clock event not found');
    // Never delete — correct in place, keeping the audit trail.
    return this.prisma.clockEvent.update({
      where: { id: eventId },
      data: { timestamp: new Date(dto.timestamp), editedAt: new Date(), editedById: userId ?? null, editReason: dto.reason },
    });
  }

  // ── Timesheets ────────────────────────────────────────────────────────────────
  async listTimesheets(q: TimesheetQuery) {
    const where: Prisma.TimesheetWhereInput = {};
    if (q.employeeId) where.employeeId = q.employeeId;
    if (q.status) where.status = q.status as TimesheetStatus;
    if (q.periodStart) where.periodStart = new Date(q.periodStart);
    return this.prisma.timesheet.findMany({
      where, orderBy: { periodStart: 'desc' },
      include: { employee: { include: { user: { select: { firstName: true, lastName: true } }, department: { select: { name: true } } } } },
    });
  }

  async timesheetDetail(id: string) {
    const ts = await this.prisma.timesheet.findFirst({
      where: { id },
      include: { entries: { orderBy: { date: 'asc' } }, employee: { include: { user: { select: { firstName: true, lastName: true } }, department: { select: { name: true } } } }, reviewedBy: { select: { firstName: true, lastName: true } } },
    });
    if (!ts) throw new NotFoundException('Timesheet not found');
    return ts;
  }

  async generateTimesheet(dto: GenerateTimesheetDto) {
    const emp = await this.prisma.employee.findFirst({ where: { id: dto.employeeId } });
    if (!emp) throw new NotFoundException('Employee not found');
    const start = dayStart(new Date(dto.periodStart));
    const end = dayStart(new Date(dto.periodEnd));
    if (+end < +start) throw new BadRequestException('periodEnd must be after periodStart');

    const events = await this.prisma.clockEvent.findMany({
      where: { employeeId: dto.employeeId, timestamp: { gte: start, lt: new Date(+end + DAY) } },
      orderBy: { timestamp: 'asc' },
    });
    const byDay = new Map<string, typeof events>();
    for (const e of events) { const k = isoDay(e.timestamp); byDay.set(k, [...(byDay.get(k) ?? []), e]); }

    const entries: Prisma.TimesheetEntryCreateWithoutTimesheetInput[] = [];
    let totalReg = 0, totalOt = 0;
    for (let d = new Date(start); +d <= +end; d = new Date(+d + DAY)) {
      const key = isoDay(d);
      const dayEvents = byDay.get(key) ?? [];
      if (dayEvents.length === 0) continue;
      const t = this.tally(dayEvents, new Date(+dayStart(d) + DAY)); // cap accrual at end of that day
      const worked = t.workedMs / HOUR;
      const regular = round2(Math.min(8, worked));
      const overtime = round2(Math.max(0, worked - 8));
      totalReg += regular; totalOt += overtime;
      const clockIn = dayEvents.find((e) => e.type === ClockEventType.ClockIn)?.timestamp ?? null;
      const clockOut = [...dayEvents].reverse().find((e) => e.type === ClockEventType.ClockOut)?.timestamp ?? null;
      const breaks = dayEvents.filter((e) => BREAK_TYPES.includes(e.type)).length; // break count → minutes best-effort
      entries.push({ date: dayStart(d), clockIn, clockOut, breakMinutes: 0, regularHours: regular, overtimeHours: overtime, shift: ShiftType.Morning, notes: breaks ? `${breaks} break(s)` : null });
    }
    totalReg = round2(totalReg); totalOt = round2(totalOt);

    // Upsert on (labId via unique) — one timesheet per (employee, periodStart).
    const existing = await this.prisma.timesheet.findFirst({ where: { employeeId: dto.employeeId, periodStart: start } });
    if (existing) {
      await this.prisma.timesheetEntry.deleteMany({ where: { timesheetId: existing.id } });
      return this.prisma.timesheet.update({
        where: { id: existing.id },
        data: { periodEnd: end, regularHours: totalReg, overtimeHours: totalOt, totalHours: round2(totalReg + totalOt), status: TimesheetStatus.Draft, entries: { create: entries } },
        include: { entries: true },
      });
    }
    return this.prisma.timesheet.create({
      data: { employeeId: dto.employeeId, periodStart: start, periodEnd: end, regularHours: totalReg, overtimeHours: totalOt, totalHours: round2(totalReg + totalOt), entries: { create: entries } } as Prisma.TimesheetUncheckedCreateInput,
      include: { entries: true },
    });
  }

  private async transitionTimesheet(id: string, data: Prisma.TimesheetUpdateInput) {
    const ts = await this.prisma.timesheet.findFirst({ where: { id } });
    if (!ts) throw new NotFoundException('Timesheet not found');
    return this.prisma.timesheet.update({ where: { id }, data });
  }

  private period(ts: { periodStart: Date; periodEnd: Date }) {
    return `${ts.periodStart.toISOString().slice(0, 10)}–${ts.periodEnd.toISOString().slice(0, 10)}`;
  }

  async submitTimesheet(id: string) {
    const ts = await this.transitionTimesheet(id, { status: TimesheetStatus.Submitted, submittedAt: new Date() });
    const managers = await this.notifications.managerRecipientIds();
    await this.notifications.notifyMany(
      managers, 'TIMESHEET_SUBMITTED', 'Timesheet submitted',
      `A timesheet for ${this.period(ts)} was submitted for review.`, ts.id, 'Timesheet',
    );
    return ts;
  }

  async approveTimesheet(id: string, userId?: string) {
    const ts = await this.transitionTimesheet(id, { status: TimesheetStatus.Approved, approvedAt: new Date(), reviewedAt: new Date(), reviewedBy: userId ? { connect: { id: userId } } : undefined });
    const emp = await this.prisma.employee.findFirst({ where: { id: ts.employeeId }, select: { userId: true } });
    if (emp) {
      await this.notifications.notify(
        emp.userId, 'TIMESHEET_APPROVED', 'Timesheet approved',
        `Your timesheet for ${this.period(ts)} was approved.`, ts.id, 'Timesheet',
      );
    }
    return ts;
  }

  async rejectTimesheet(id: string, reason: string, userId?: string) {
    const ts = await this.transitionTimesheet(id, { status: TimesheetStatus.Rejected, reviewedAt: new Date(), notes: reason, reviewedBy: userId ? { connect: { id: userId } } : undefined });
    const emp = await this.prisma.employee.findFirst({ where: { id: ts.employeeId }, select: { userId: true } });
    if (emp) {
      await this.notifications.notify(
        emp.userId, 'TIMESHEET_REJECTED', 'Timesheet rejected',
        `Your timesheet for ${this.period(ts)} was rejected: ${reason}`, ts.id, 'Timesheet',
      );
    }
    return ts;
  }

  // ── Scheduling ──────────────────────────────────────────────────────────────
  async schedule(q: ScheduleQuery) {
    const weekStart = dayStart(new Date(q.weekStart));
    const weekEnd = new Date(+weekStart + 7 * DAY);
    const assignments = await this.prisma.shiftAssignment.findMany({
      where: {
        date: { gte: weekStart, lt: weekEnd },
        ...(q.departmentId ? { employee: { departmentId: q.departmentId } } : {}),
      },
      include: { shift: true, employee: { include: { user: { select: { firstName: true, lastName: true } }, department: { select: { name: true } } } } },
      orderBy: { date: 'asc' },
    });
    const dates: Record<string, any[]> = {};
    for (let i = 0; i < 7; i++) dates[isoDay(new Date(+weekStart + i * DAY))] = [];
    for (const a of assignments) {
      const key = isoDay(a.date);
      (dates[key] ??= []).push({
        assignmentId: a.id, status: a.status,
        employee: { id: a.employeeId, name: `${a.employee.user.firstName} ${a.employee.user.lastName}`.trim(), department: a.employee.department?.name ?? null },
        shift: { id: a.shift.id, name: a.shift.name, type: a.shift.type, color: a.shift.color, startTime: a.shift.startTime, endTime: a.shift.endTime },
      });
    }
    return { weekStart: isoDay(weekStart), dates };
  }

  async assignShift(dto: AssignShiftDto, userId?: string) {
    const date = dayStart(new Date(dto.date));
    // Replace any existing assignment for this employee on this day, so
    // re-assigning a cell changes the shift instead of stacking duplicates.
    await this.prisma.shiftAssignment.deleteMany({ where: { employeeId: dto.employeeId, date } });
    return this.prisma.shiftAssignment.create({
      data: { employeeId: dto.employeeId, shiftId: dto.shiftId, date, createdById: userId ?? null } as Prisma.ShiftAssignmentUncheckedCreateInput,
      include: { shift: true },
    });
  }

  async removeAssignment(id: string) {
    // Lab-scoped by the tenancy extension; deleteMany avoids a throw when the
    // row isn't in the caller's lab (nothing matches → deleted: false).
    const res = await this.prisma.shiftAssignment.deleteMany({ where: { id } });
    return { deleted: res.count > 0 };
  }

  async assignBulk(dto: BulkAssignDto, userId?: string) {
    const created = [];
    for (const a of dto.assignments) created.push(await this.assignShift(a, userId));
    return { created: created.length };
  }

  listShifts() {
    return this.prisma.shift.findMany({ orderBy: { startTime: 'asc' } });
  }
  createShift(dto: CreateShiftDto) {
    return this.prisma.shift.create({ data: { name: dto.name, startTime: dto.startTime, endTime: dto.endTime, type: dto.type as ShiftType, color: dto.color ?? undefined } as Prisma.ShiftUncheckedCreateInput });
  }
  async updateShift(id: string, dto: UpdateShiftDto) {
    const s = await this.prisma.shift.findFirst({ where: { id } });
    if (!s) throw new NotFoundException('Shift not found');
    return this.prisma.shift.update({ where: { id }, data: { ...dto, type: dto.type ? (dto.type as ShiftType) : undefined } });
  }

  // ── Attendance ──────────────────────────────────────────────────────────────
  async attendanceToday() {
    const now = new Date();
    const start = dayStart(now); const end = new Date(+start + DAY);
    const employees = await this.prisma.employee.findMany({ where: { isActive: true }, select: { id: true } });
    const events = await this.prisma.clockEvent.findMany({ where: { timestamp: { gte: start, lt: end } }, orderBy: { timestamp: 'asc' } });
    const byEmp = new Map<string, typeof events>();
    for (const e of events) byEmp.set(e.employeeId, [...(byEmp.get(e.employeeId) ?? []), e]);

    let present = 0, clockedIn = 0, late = 0, overtime = 0;
    const lateGraceMin = 8 * 60 + 15; // 08:15 default grace
    for (const emp of employees) {
      const evs = byEmp.get(emp.id);
      if (!evs || evs.length === 0) continue;
      present++;
      const t = this.tally(evs, now);
      if (t.isClockedIn) clockedIn++;
      const firstIn = evs.find((e) => e.type === ClockEventType.ClockIn)?.timestamp;
      if (firstIn && (firstIn.getHours() * 60 + firstIn.getMinutes()) > lateGraceMin) late++;
      const worked = t.workedMs / HOUR;
      if (worked > 8) overtime += worked - 8;
    }
    return {
      present,
      absent: employees.length - present,
      late,
      onLeave: 0, // no leave model yet
      clockedIn,
      overtime: round2(overtime),
      totalActive: employees.length,
    };
  }

  async attendanceRoster() {
    const now = new Date();
    const start = dayStart(now); const end = new Date(+start + DAY);
    const employees = await this.prisma.employee.findMany({ where: { isActive: true }, include: { user: { select: { firstName: true, lastName: true } }, department: { select: { name: true } } }, orderBy: { employeeNo: 'asc' } });
    const events = await this.prisma.clockEvent.findMany({ where: { timestamp: { gte: start, lt: end } }, orderBy: { timestamp: 'asc' } });
    const byEmp = new Map<string, typeof events>();
    for (const e of events) byEmp.set(e.employeeId, [...(byEmp.get(e.employeeId) ?? []), e]);
    const shift = await this.shiftForTime(now);
    const lateGrace = 8 * 60 + 15;
    return employees.map((emp) => {
      const evs = byEmp.get(emp.id) ?? [];
      const t = this.tally(evs, now);
      const clockIn = evs.find((e) => e.type === ClockEventType.ClockIn)?.timestamp ?? null;
      const clockOut = [...evs].reverse().find((e) => e.type === ClockEventType.ClockOut)?.timestamp ?? null;
      let status = 'NotStarted';
      if (clockIn) status = (clockIn.getHours() * 60 + clockIn.getMinutes()) > lateGrace ? 'Late' : 'Present';
      return {
        employeeId: emp.id, name: `${emp.user.firstName} ${emp.user.lastName}`.trim(), department: emp.department?.name ?? null,
        shift: shift ? { name: shift.name, type: shift.type } : null,
        status, clockIn, clockOut, hours: round2(t.workedMs / HOUR), isClockedIn: t.isClockedIn,
      };
    });
  }

  async attendanceSummary(q: AttendanceSummaryQuery) {
    const from = q.dateFrom ? dayStart(new Date(q.dateFrom)) : dayStart(new Date(Date.now() - 30 * DAY));
    const to = q.dateTo ? dayStart(new Date(q.dateTo)) : dayStart(new Date());
    const employees = await this.prisma.employee.findMany({ where: { isActive: true }, include: { user: { select: { firstName: true, lastName: true } }, department: { select: { name: true } } } });
    const events = await this.prisma.clockEvent.findMany({ where: { timestamp: { gte: from, lt: new Date(+to + DAY) } }, orderBy: { timestamp: 'asc' } });
    const totalDays = Math.round((+to - +from) / DAY) + 1;
    const lateGrace = 8 * 60 + 15;

    const byEmpDay = new Map<string, Map<string, typeof events>>();
    for (const e of events) {
      const day = isoDay(e.timestamp);
      const m = byEmpDay.get(e.employeeId) ?? new Map();
      m.set(day, [...(m.get(day) ?? []), e]); byEmpDay.set(e.employeeId, m);
    }
    return employees.map((emp) => {
      const days = byEmpDay.get(emp.id) ?? new Map();
      let daysPresent = 0, lateCount = 0, totalHours = 0, overtimeHours = 0;
      for (const [, evs] of days) {
        daysPresent++;
        const t = this.tally(evs as any, new Date());
        const worked = t.workedMs / HOUR;
        totalHours += worked; overtimeHours += Math.max(0, worked - 8);
        const firstIn = (evs as any).find((e: any) => e.type === ClockEventType.ClockIn)?.timestamp as Date | undefined;
        if (firstIn && (firstIn.getHours() * 60 + firstIn.getMinutes()) > lateGrace) lateCount++;
      }
      return {
        employeeId: emp.id,
        name: `${emp.user.firstName} ${emp.user.lastName}`.trim(),
        department: emp.department?.name ?? null,
        daysPresent,
        daysAbsent: Math.max(0, totalDays - daysPresent),
        lateCount,
        avgHoursPerDay: daysPresent ? round2(totalHours / daysPresent) : 0,
        totalHours: round2(totalHours),
        overtimeHours: round2(overtimeHours),
      };
    });
  }
}
