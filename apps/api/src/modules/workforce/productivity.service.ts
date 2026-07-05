import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BenchmarksQuery, ProductivityMetricQuery, ProductivitySummaryQuery, UpsertProductivityMetricDto } from './dto/workforce-phase3.dto';

const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const round = (n: number) => Math.round(n);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

@Injectable()
export class ProductivityService {
  constructor(private prisma: PrismaService) {}

  // Create or update the daily metric for an employee (unique per employee/day).
  async upsertMetric(dto: UpsertProductivityMetricDto) {
    const date = dayStart(new Date(dto.date));
    const data = {
      specimensProcessed: dto.specimensProcessed ?? 0,
      reportsCompleted: dto.reportsCompleted ?? 0,
      averageTATMinutes: dto.averageTATMinutes ?? 0,
      qualityScore: dto.qualityScore ?? 0,
    };
    const existing = await this.prisma.productivityMetric.findFirst({ where: { employeeId: dto.employeeId, date } });
    if (existing) return this.prisma.productivityMetric.update({ where: { id: existing.id }, data });
    return this.prisma.productivityMetric.create({
      data: { employeeId: dto.employeeId, date, ...data } as Prisma.ProductivityMetricUncheckedCreateInput,
    });
  }

  listMetrics(q: ProductivityMetricQuery) {
    const where: Prisma.ProductivityMetricWhereInput = {};
    if (q.employeeId) where.employeeId = q.employeeId;
    if (q.startDate || q.endDate) {
      where.date = {};
      if (q.startDate) where.date.gte = dayStart(new Date(q.startDate));
      if (q.endDate) where.date.lte = dayStart(new Date(q.endDate));
    }
    return this.prisma.productivityMetric.findMany({
      where, orderBy: { date: 'desc' },
      include: { employee: { include: { user: { select: { firstName: true, lastName: true } } } } },
    });
  }

  async summary(q: ProductivitySummaryQuery) {
    const start = dayStart(new Date(q.startDate));
    const end = dayStart(new Date(q.endDate));
    const mid = new Date((+start + +end) / 2);

    const employees = await this.prisma.employee.findMany({
      where: { isActive: true, ...(q.departmentId ? { departmentId: q.departmentId } : {}) },
      include: { user: { select: { firstName: true, lastName: true } }, department: { select: { name: true } } },
      orderBy: { employeeNo: 'asc' },
    });
    const metrics = await this.prisma.productivityMetric.findMany({
      where: { employeeId: { in: employees.map((e) => e.id) }, date: { gte: start, lte: end } },
    });
    const byEmp = new Map<string, typeof metrics>();
    for (const m of metrics) byEmp.set(m.employeeId, [...(byEmp.get(m.employeeId) ?? []), m]);

    return employees.map((emp) => {
      const ms = byEmp.get(emp.id) ?? [];
      const days = ms.length;
      const firstHalf = ms.filter((m) => +m.date < +mid).map((m) => m.specimensProcessed);
      const secondHalf = ms.filter((m) => +m.date >= +mid).map((m) => m.specimensProcessed);
      const fAvg = avg(firstHalf), sAvg = avg(secondHalf);
      const changePct = fAvg > 0 ? round(((sAvg - fAvg) / fAvg) * 100) : sAvg > 0 ? 100 : 0;
      return {
        employeeId: emp.id,
        name: `${emp.user.firstName} ${emp.user.lastName}`.trim(),
        department: emp.department?.name ?? null,
        avgSpecimensPerDay: days ? round(avg(ms.map((m) => m.specimensProcessed))) : 0,
        avgTATMinutes: days ? round(avg(ms.map((m) => m.averageTATMinutes))) : 0,
        avgQualityScore: days ? round(avg(ms.map((m) => m.qualityScore))) : 0,
        totalReports: ms.reduce((s, m) => s + m.reportsCompleted, 0),
        daysReported: days,
        trend: { direction: changePct > 0 ? 'up' : changePct < 0 ? 'down' : 'flat', changePct },
      };
    });
  }

  async leaderboard() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const metrics = await this.prisma.productivityMetric.findMany({
      where: { date: { gte: start, lt: end } },
      include: { employee: { include: { user: { select: { firstName: true, lastName: true } }, department: { select: { name: true } } } } },
    });
    const agg = new Map<string, { name: string; department: string | null; specimens: number; quality: number[] }>();
    for (const m of metrics) {
      const cur = agg.get(m.employeeId) ?? { name: `${m.employee.user.firstName} ${m.employee.user.lastName}`.trim(), department: m.employee.department?.name ?? null, specimens: 0, quality: [] };
      cur.specimens += m.specimensProcessed;
      if (m.qualityScore > 0) cur.quality.push(m.qualityScore);
      agg.set(m.employeeId, cur);
    }
    return [...agg.entries()]
      .map(([employeeId, v]) => ({ employeeId, name: v.name, department: v.department, specimensProcessed: v.specimens, qualityScore: round(avg(v.quality)) }))
      .sort((a, b) => b.specimensProcessed - a.specimensProcessed)
      .slice(0, 10)
      .map((r, i) => ({ rank: i + 1, ...r }));
  }

  async benchmarks(q: BenchmarksQuery) {
    const now = new Date();
    const start = q.startDate ? dayStart(new Date(q.startDate)) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = q.endDate ? dayStart(new Date(q.endDate)) : now;
    const metrics = await this.prisma.productivityMetric.findMany({ where: { date: { gte: start, lte: end } } });
    // Average specimens per employee-day; TAT/quality averaged over reported days.
    return {
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
      daysReported: metrics.length,
      avgSpecimensPerDay: metrics.length ? round(avg(metrics.map((m) => m.specimensProcessed))) : 0,
      avgTATMinutes: metrics.length ? round(avg(metrics.map((m) => m.averageTATMinutes))) : 0,
      avgQualityScore: metrics.length ? round(avg(metrics.filter((m) => m.qualityScore > 0).map((m) => m.qualityScore))) : 0,
    };
  }
}
