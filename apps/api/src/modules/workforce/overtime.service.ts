import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClockEventType, OvertimeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WorkforceNotificationService } from './workforce-notification.service';
import { CalculateOvertimeDto, CreateOvertimeRuleDto, OvertimeRecordQuery } from './dto/workforce-phase2.dto';

const DAY = 86_400_000;
const MINUTE = 60_000;
const CLOCK_IN_TYPES: ClockEventType[] = [ClockEventType.ClockIn, ClockEventType.BreakEnd, ClockEventType.LunchEnd];
const BREAK_TYPES: ClockEventType[] = [ClockEventType.BreakStart, ClockEventType.LunchStart];
const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const isoDay = (d: Date) => new Date(d).toISOString().slice(0, 10);

@Injectable()
export class OvertimeService {
  constructor(
    private prisma: PrismaService,
    private notifications: WorkforceNotificationService,
  ) {}

  // ── Rules ───────────────────────────────────────────────────────────────────
  createOvertimeRule(dto: CreateOvertimeRuleDto) {
    return this.prisma.overtimeRule.create({
      data: {
        name: dto.name,
        dailyThresholdMinutes: dto.dailyThresholdMinutes ?? 480,
        weeklyThresholdMinutes: dto.weeklyThresholdMinutes ?? 2400,
        rateMultiplierX100: dto.rateMultiplierX100 ?? 150,
        requiresApproval: dto.requiresApproval ?? true,
        isActive: dto.isActive ?? true,
      } as Prisma.OvertimeRuleUncheckedCreateInput,
    });
  }

  listOvertimeRules() {
    return this.prisma.overtimeRule.findMany({ orderBy: { name: 'asc' } });
  }

  // ── Records ─────────────────────────────────────────────────────────────────
  listOvertimeRecords(q: OvertimeRecordQuery) {
    const where: Prisma.OvertimeRecordWhereInput = {};
    if (q.employeeId) where.employeeId = q.employeeId;
    if (q.status) where.status = q.status as OvertimeStatus;
    if (q.startDate || q.endDate) {
      where.date = {};
      if (q.startDate) where.date.gte = dayStart(new Date(q.startDate));
      if (q.endDate) where.date.lte = dayStart(new Date(q.endDate));
    }
    return this.prisma.overtimeRecord.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        overtimeRule: true,
        employee: { include: { user: { select: { firstName: true, lastName: true } }, department: { select: { name: true } } } },
      },
    });
  }

  private async loadPendingRecord(id: string) {
    const rec = await this.prisma.overtimeRecord.findFirst({ where: { id }, include: { employee: { select: { userId: true } } } });
    if (!rec) throw new NotFoundException('Overtime record not found');
    if (rec.status !== OvertimeStatus.PENDING) throw new BadRequestException(`Record is ${rec.status}, not PENDING`);
    return rec;
  }

  async approveOvertimeRecord(id: string, userId: string) {
    const rec = await this.loadPendingRecord(id);
    const updated = await this.prisma.overtimeRecord.update({
      where: { id },
      data: { status: OvertimeStatus.APPROVED, approvedById: userId, approvedAt: new Date() },
    });
    await this.notifications.notify(
      rec.employee.userId,
      'OVERTIME_APPROVED',
      'Overtime approved',
      `Your overtime of ${rec.overtimeMinutes} minute(s) on ${isoDay(rec.date)} was approved.`,
      id,
      'OvertimeRecord',
    );
    return updated;
  }

  async rejectOvertimeRecord(id: string, userId: string) {
    const rec = await this.loadPendingRecord(id);
    const updated = await this.prisma.overtimeRecord.update({
      where: { id },
      data: { status: OvertimeStatus.REJECTED, approvedById: userId, approvedAt: new Date() },
    });
    await this.notifications.notify(
      rec.employee.userId,
      'OVERTIME_REJECTED',
      'Overtime rejected',
      `Your overtime of ${rec.overtimeMinutes} minute(s) on ${isoDay(rec.date)} was rejected.`,
      id,
      'OvertimeRecord',
    );
    return updated;
  }

  // Worked minutes for one day's sorted events (open on clock-in, pause on break,
  // close on clock-out; a still-open span is capped at end of day).
  private workedMinutes(events: { type: ClockEventType; timestamp: Date }[], dayEnd: number) {
    const sorted = [...events].sort((a, b) => +a.timestamp - +b.timestamp);
    let workedMs = 0, openFrom: number | null = null;
    for (const e of sorted) {
      const t = +e.timestamp;
      if (CLOCK_IN_TYPES.includes(e.type)) {
        if (openFrom == null) openFrom = t;
      } else if (BREAK_TYPES.includes(e.type) || e.type === ClockEventType.ClockOut) {
        if (openFrom != null) { workedMs += t - openFrom; openFrom = null; }
      }
    }
    if (openFrom != null) workedMs += Math.max(0, dayEnd - openFrom);
    return Math.floor(workedMs / MINUTE);
  }

  /**
   * Reads ClockEvents over the period, applies the active OvertimeRule's daily
   * threshold, and creates/updates an OvertimeRecord for every day whose worked
   * minutes exceed the threshold.
   */
  async calculate(dto: CalculateOvertimeDto) {
    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId } });
    if (!employee) throw new NotFoundException('Employee not found');
    const rule = await this.prisma.overtimeRule.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } });
    if (!rule) throw new BadRequestException('No active overtime rule configured');

    const start = dayStart(new Date(dto.startDate));
    const end = dayStart(new Date(dto.endDate));
    if (+end < +start) throw new BadRequestException('endDate must be on or after startDate');

    const events = await this.prisma.clockEvent.findMany({
      where: { employeeId: dto.employeeId, timestamp: { gte: start, lt: new Date(+end + DAY) } },
      orderBy: { timestamp: 'asc' },
    });
    const byDay = new Map<string, typeof events>();
    for (const e of events) { const k = isoDay(e.timestamp); byDay.set(k, [...(byDay.get(k) ?? []), e]); }

    const status = rule.requiresApproval ? OvertimeStatus.PENDING : OvertimeStatus.APPROVED;
    const results: any[] = [];
    for (let d = new Date(start); +d <= +end; d = new Date(+d + DAY)) {
      const day = dayStart(d);
      const key = isoDay(day);
      const dayEvents = byDay.get(key) ?? [];
      if (dayEvents.length === 0) continue;
      const worked = this.workedMinutes(dayEvents, +day + DAY);
      if (worked <= rule.dailyThresholdMinutes) continue;

      const overtimeMinutes = worked - rule.dailyThresholdMinutes;
      const regularMinutes = rule.dailyThresholdMinutes;

      const existing = await this.prisma.overtimeRecord.findFirst({
        where: { employeeId: dto.employeeId, date: day },
      });
      if (existing) {
        results.push(await this.prisma.overtimeRecord.update({
          where: { id: existing.id },
          data: { regularMinutes, overtimeMinutes, overtimeRuleId: rule.id },
        }));
      } else {
        results.push(await this.prisma.overtimeRecord.create({
          data: {
            employeeId: dto.employeeId, date: day, regularMinutes, overtimeMinutes,
            overtimeRuleId: rule.id, status,
          } as Prisma.OvertimeRecordUncheckedCreateInput,
        }));
      }
    }
    return { employeeId: dto.employeeId, ruleId: rule.id, daysWithOvertime: results.length, records: results };
  }
}
