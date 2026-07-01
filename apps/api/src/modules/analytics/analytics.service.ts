import { Injectable } from '@nestjs/common';
import { RecordStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DAY_MS = 86_400_000;

const FULFILLED: RecordStatus[] = [
  RecordStatus.Completed, RecordStatus.Resulted, RecordStatus.Approved, RecordStatus.Billed, RecordStatus.Paid, RecordStatus.Viewed,
];
const OPEN_BEFORE_APPROVAL: RecordStatus[] = [
  RecordStatus.Submitted, RecordStatus.Processing, RecordStatus.Partial, RecordStatus.Completed, RecordStatus.Resulted,
];
const PENDING: RecordStatus[] = [RecordStatus.Pending, RecordStatus.Submitted, RecordStatus.Processing, RecordStatus.Partial];
const RESULTED_PLUS: RecordStatus[] = [RecordStatus.Resulted, RecordStatus.Approved, RecordStatus.Billed, RecordStatus.Paid];
const APPROVED_PLUS: RecordStatus[] = [RecordStatus.Approved, RecordStatus.Billed, RecordStatus.Paid];

interface Ev { status: RecordStatus; createdAt: Date }
const firstAt = (events: Ev[], status: RecordStatus): Date | null => {
  const hits = events.filter((e) => e.status === status).map((e) => +new Date(e.createdAt));
  return hits.length ? new Date(Math.min(...hits)) : null;
};
const firstFulfilled = (events: Ev[]): Date | null => {
  const hits = events.filter((e) => FULFILLED.includes(e.status)).map((e) => +new Date(e.createdAt));
  return hits.length ? new Date(Math.min(...hits)) : null;
};

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService, private labContext: LabContext) {}

  async dashboard() {
    const now = new Date();
    const labId = this.labContext.getLabId();
    const lab = labId
      ? await this.prisma.lab.findUnique({ where: { id: labId }, select: { targetTatDays: true, monthlyVolumeTarget: true, currency: true } })
      : null;
    const targetTatDays = lab?.targetTatDays ?? 3;

    // Trailing 12 months window.
    const start0 = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const base = start0.getFullYear() * 12 + start0.getMonth();
    const bucketIndex = (d: Date | string) => {
      const dt = new Date(d);
      const idx = dt.getFullYear() * 12 + dt.getMonth() - base;
      return idx >= 0 && idx < 12 ? idx : -1;
    };
    const monthLabels = Array.from({ length: 12 }, (_, i) => MONTHS[new Date(start0.getFullYear(), start0.getMonth() + i, 1).getMonth()]);
    const currentIdx = 11;

    // ---- one records pull for the window ----
    const records = await this.prisma.record.findMany({
      where: { createdAt: { gte: start0 } },
      select: {
        id: true, status: true, urgent: true, clientId: true, createdAt: true, billed: true,
        client: { select: { officeName: true, firstName: true, lastName: true } },
        specimens: { select: { type: true } },
        statusHistory: { select: { status: true, createdAt: true } },
        resultSheets: { select: { authorized: true } },
      },
    });

    const actual = new Array(12).fill(0);
    const revenueByMonth = new Array(12).fill(0); // dollars (from bills below)
    const tatRecords: { tatDays: number; approvedAt: Date; specimenTypes: string[]; clientId: string | null }[] = [];
    let resultedPlus = 0;
    let approvedPlus = 0;
    let specimenCount = 0;
    const clientMonth = new Map<string, { name: string; cur: number; prev: number }>();

    for (const r of records) {
      const sh = r.statusHistory as Ev[];
      const types = r.specimens.map((s) => s.type);
      specimenCount += r.specimens.length;

      const fulfilled = firstFulfilled(sh);
      if (fulfilled) {
        const i = bucketIndex(fulfilled);
        if (i >= 0) actual[i] += 1;
      }
      if (RESULTED_PLUS.includes(r.status)) resultedPlus += 1;
      if (APPROVED_PLUS.includes(r.status)) approvedPlus += 1;

      const approvedAt = firstAt(sh, RecordStatus.Approved);
      if (approvedAt) {
        const submittedAt = firstAt(sh, RecordStatus.Submitted) ?? new Date(r.createdAt);
        const tatDays = Math.max(0, (+approvedAt - +submittedAt) / DAY_MS);
        tatRecords.push({ tatDays, approvedAt, specimenTypes: types, clientId: r.clientId });
      }

      // Highest-volume client: current vs prior month.
      if (r.clientId && fulfilled) {
        const name = r.client?.officeName || `${r.client?.firstName ?? ''} ${r.client?.lastName ?? ''}`.trim() || 'Client';
        const i = bucketIndex(fulfilled);
        const rec = clientMonth.get(r.clientId) ?? { name, cur: 0, prev: 0 };
        if (i === currentIdx) rec.cur += 1;
        else if (i === currentIdx - 1) rec.prev += 1;
        clientMonth.set(r.clientId, rec);
      }
    }

    // ---- revenue (non-draft bills) ----
    const bills = await this.prisma.bill.findMany({
      where: { status: { not: 'Draft' }, createdAt: { gte: start0 } },
      select: { total: true, createdAt: true },
    });
    let revenueTotalCents = 0;
    for (const b of bills) {
      revenueTotalCents += b.total;
      const i = bucketIndex(b.createdAt);
      if (i >= 0) revenueByMonth[i] += b.total / 100;
    }

    // ---- monthly volume + target ----
    const withData = actual.filter((v) => v > 0);
    const derivedTarget = withData.length ? Math.round(withData.reduce((a, b) => a + b, 0) / withData.length) : 0;
    const monthlyTarget = lab?.monthlyVolumeTarget ?? Math.max(derivedTarget, 1);
    const monthlyVolume = actual.map((a, i) => ({
      month: monthLabels[i],
      actual: a,
      target: monthlyTarget,
      deficit: Math.max(0, monthlyTarget - a),
      current: i === currentIdx,
    }));

    // ---- TAT / compliance ----
    const onTimeCount = tatRecords.filter((t) => t.tatDays <= targetTatDays).length;
    const onTimePct = tatRecords.length ? Math.round((onTimeCount / tatRecords.length) * 1000) / 10 : 0;
    const avgTat = tatRecords.length ? tatRecords.reduce((a, t) => a + t.tatDays, 0) / tatRecords.length : 0;

    // Current week Mon..Sun compliance line.
    const monday = new Date(now);
    const dow = (monday.getDay() + 6) % 7; // 0 = Monday
    monday.setDate(monday.getDate() - dow);
    monday.setHours(0, 0, 0, 0);
    const week = DAYS.map((day, i) => {
      const s = new Date(monday); s.setDate(monday.getDate() + i);
      const e = new Date(s); e.setDate(s.getDate() + 1);
      const inDay = tatRecords.filter((t) => t.approvedAt >= s && t.approvedAt < e);
      const on = inDay.filter((t) => t.tatDays <= targetTatDays).length;
      return { day, total: inDay.length, onTime: on, delayed: inDay.length - on, onTimePct: inDay.length ? Math.round((on / inDay.length) * 100) : null };
    });

    // Monthly on-time% + avg cost for sparklines.
    const tatByMonth = new Array(12).fill(null).map(() => ({ on: 0, total: 0 }));
    for (const t of tatRecords) {
      const i = bucketIndex(t.approvedAt);
      if (i >= 0) { tatByMonth[i].total += 1; if (t.tatDays <= targetTatDays) tatByMonth[i].on += 1; }
    }
    const onTimeSpark = tatByMonth.map((m) => (m.total ? Math.round((m.on / m.total) * 100) : 0));
    const volumeByMonth = actual;
    const avgCostSpark = revenueByMonth.map((rev, i) => (volumeByMonth[i] ? Math.round((rev / volumeByMonth[i]) * 10) / 10 : 0));

    // ---- insights ----
    const tatByType = new Map<string, { sum: number; n: number }>();
    for (const t of tatRecords) for (const ty of t.specimenTypes) {
      const rec = tatByType.get(ty) ?? { sum: 0, n: 0 }; rec.sum += t.tatDays; rec.n += 1; tatByType.set(ty, rec);
    }
    let fastest: { type: string; avg: number } | null = null;
    for (const [type, v] of tatByType) { const avg = v.sum / v.n; if (!fastest || avg < fastest.avg) fastest = { type, avg }; }

    let topClient: { name: string; cur: number; prev: number } | null = null;
    for (const v of clientMonth.values()) if (!topClient || v.cur > topClient.cur) topClient = v;
    const topClientPct = topClient && topClient.prev ? Math.round(((topClient.cur - topClient.prev) / topClient.prev) * 100) : null;

    const authRate = resultedPlus ? Math.round((approvedPlus / resultedPlus) * 100) : 0;
    const [abnormalLines, totalLines] = await Promise.all([
      this.prisma.resultLine.count({ where: { abnormalFinding: true } }),
      this.prisma.resultLine.count(),
    ]);
    const abnormalRate = totalLines ? Math.round((abnormalLines / totalLines) * 100) : 0;

    // ---- attention queue (targeted counts) ----
    const overdueBefore = new Date(now.getTime() - targetTatDays * DAY_MS);
    const [awaiting, urgent, overdue, reopened, unbilled] = await Promise.all([
      this.prisma.record.count({ where: { status: RecordStatus.Resulted } }),
      this.prisma.record.count({ where: { urgent: true, status: { in: PENDING } } }),
      this.prisma.record.count({ where: { status: { in: OPEN_BEFORE_APPROVAL }, createdAt: { lt: overdueBefore } } }),
      this.prisma.resultSheet.count({ where: { authorized: false, events: { some: { type: 'Deauthorized' } } } }),
      this.prisma.record.count({ where: { status: { in: [RecordStatus.Completed, RecordStatus.Resulted, RecordStatus.Approved] }, billed: false } }),
    ]);
    const attentionItems = [
      { key: 'overdue', title: 'Overdue records', description: `Past ${targetTatDays}-day turnaround target`, count: overdue, severity: 'danger' },
      { key: 'urgent', title: 'Urgent pending', description: 'Marked urgent, not yet completed', count: urgent, severity: 'warning' },
      { key: 'awaiting', title: 'Awaiting authorization', description: 'Resulted, waiting for sign-off', count: awaiting, severity: 'info' },
      { key: 'reopened', title: 'Re-opened after sign-off', description: 'De-authorized, needs re-approval', count: reopened, severity: 'danger' },
      { key: 'unbilled', title: 'Unbilled completed', description: 'Fulfilled but no issued bill', count: unbilled, severity: 'neutral' },
    ];

    // ---- reports authorized this month ----
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const authorizedThisMonth = await this.prisma.resultSheet.count({ where: { authorized: true, authorizedAt: { gte: startOfMonth } } });
    const reportTarget = lab?.monthlyVolumeTarget ?? Math.max(derivedTarget, 1);

    const currency = lab?.currency ?? 'JMD';
    return {
      currency,
      currentMonth: monthLabels[currentIdx],
      targetTatDays,
      targetDerived: lab?.monthlyVolumeTarget == null,
      monthlyVolume,
      volumeRevenue: monthLabels.map((month, i) => ({ month, volume: volumeByMonth[i], revenue: Math.round(revenueByMonth[i]), current: i === currentIdx })),
      attention: { total: attentionItems.reduce((a, x) => a + x.count, 0), items: attentionItems },
      insights: {
        items: [
          { key: 'fastestTat', title: 'Fastest turnaround', detail: fastest?.type ?? '—', metric: fastest ? `${fastest.avg.toFixed(1)}d` : '—' },
          { key: 'topClient', title: 'Highest volume client', detail: topClient?.name ?? '—', metric: topClientPct != null ? `${topClientPct >= 0 ? '+' : ''}${topClientPct}%` : `${topClient?.cur ?? 0}` },
          { key: 'authRate', title: 'Authorization rate', detail: 'Resulted → Approved', metric: `${authRate}%` },
          { key: 'abnormalRate', title: 'Abnormal findings', detail: 'Flagged result lines', metric: `${abnormalRate}%` },
        ],
        footerLabel: 'AVG TURNAROUND',
        footerValue: tatRecords.length ? `${avgTat.toFixed(1)} days` : '—',
      },
      kpis: {
        revenue: { value: Math.round(revenueTotalCents / 100), spark: revenueByMonth.map((v) => Math.round(v)) },
        onTimeTat: { value: onTimePct, spark: onTimeSpark },
        avgCost: { value: specimenCount ? Math.round((revenueTotalCents / 100 / specimenCount) * 100) / 100 : 0, spark: avgCostSpark },
      },
      compliance: { onTimePct, targetTatDays, week },
      reportsAuthorized: { count: authorizedThisMonth, target: reportTarget, pct: reportTarget ? Math.min(100, Math.round((authorizedThisMonth / reportTarget) * 100)) : 0 },
    };
  }
}
