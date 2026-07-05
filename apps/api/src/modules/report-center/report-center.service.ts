import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { deriveShortCode } from '../bethesda/bethesda.service';
import { ReportQueryDto } from './dto/report-center.dto';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const TARGET_TAT_DAYS = 5;

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};
const median = (nums: number[]) => {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const ABNORMAL = new Set(['ASCUS', 'ASC-H', 'LSIL', 'HSIL', 'SCC', 'AGUS', 'MALIG']);

@Injectable()
export class ReportCenterService {
  constructor(private prisma: PrismaService) {}

  // Default window: trailing 12 months.
  private range(q: ReportQueryDto) {
    const to = q.dateTo ? new Date(q.dateTo) : new Date();
    to.setHours(23, 59, 59, 999);
    const from = q.dateFrom ? new Date(q.dateFrom) : new Date(to.getTime() - 365 * DAY);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }
  private priorRange(from: Date, to: Date) {
    const span = to.getTime() - from.getTime();
    return { from: new Date(from.getTime() - span), to: new Date(from.getTime() - 1) };
  }
  /** Ordered month keys spanning [from, to]. */
  private monthSpan(from: Date, to: Date): string[] {
    const keys: string[] = [];
    const d = new Date(from.getFullYear(), from.getMonth(), 1);
    const end = new Date(to.getFullYear(), to.getMonth(), 1);
    while (d <= end) { keys.push(monthKey(d)); d.setMonth(d.getMonth() + 1); }
    return keys;
  }
  private emptyMonths<T extends object>(from: Date, to: Date, init: () => T): Map<string, T> {
    const m = new Map<string, T>();
    for (const k of this.monthSpan(from, to)) m.set(k, init());
    return m;
  }

  // ── SPECIMEN REPORTS ──────────────────────────────────────────────────────
  async specimenVolume(q: ReportQueryDto) {
    const { from, to } = this.range(q);
    const where = { createdAt: { gte: from, lte: to }, ...(q.clientId ? { clientId: q.clientId } : {}) };
    const records = await this.prisma.record.findMany({ where, select: { formType: true, createdAt: true, specimens: { select: { type: true } } } });

    const gynCount = records.filter((r) => r.formType === 'Gynecology').length;
    const nonGynCount = records.filter((r) => r.formType === 'NonGynecology').length;
    const total = records.length;

    const prior = this.priorRange(from, to);
    const priorTotal = await this.prisma.record.count({ where: { createdAt: { gte: prior.from, lte: prior.to } } });
    const growthRate = priorTotal ? round1(((total - priorTotal) / priorTotal) * 100) : 0;

    const months = this.emptyMonths(from, to, () => ({ total: 0, gyn: 0, nonGyn: 0 }));
    for (const r of records) {
      const b = months.get(monthKey(new Date(r.createdAt)));
      if (b) { b.total++; if (r.formType === 'Gynecology') b.gyn++; else if (r.formType === 'NonGynecology') b.nonGyn++; }
    }
    const byMonth = [...months.entries()].map(([k, v]) => ({ month: monthLabel(k), ...v }));

    const typeCounts = new Map<string, number>();
    for (const r of records) for (const s of r.specimens) typeCounts.set(s.type, (typeCounts.get(s.type) ?? 0) + 1);
    const specimenTotal = [...typeCounts.values()].reduce((a, b) => a + b, 0);
    const bySpecimenType = [...typeCounts.entries()].map(([type, count]) => ({ type, count, percentage: pct(count, specimenTotal) })).sort((a, b) => b.count - a.count);

    return { total, gynCount, nonGynCount, growthRate, byMonth, bySpecimenType };
  }

  async tatAnalysis(q: ReportQueryDto) {
    const { from, to } = this.range(q);
    const sheets = await this.prisma.resultSheet.findMany({
      where: { authorized: true, authorizedAt: { gte: from, lte: to } },
      select: {
        authorizedAt: true,
        authorizedBy: { select: { firstName: true, lastName: true } },
        record: { select: { specimenDate: true, createdAt: true, urgent: true, specimens: { select: { type: true }, take: 1 } } },
      },
    });

    type Row = { hours: number; urgent: boolean; type: string; pathologist: string; month: string };
    const rows: Row[] = sheets.filter((s) => s.authorizedAt).map((s) => {
      const start = s.record?.specimenDate ?? s.record?.createdAt ?? s.authorizedAt!;
      const hours = Math.max(0, (+new Date(s.authorizedAt!) - +new Date(start)) / HOUR);
      return {
        hours,
        urgent: !!s.record?.urgent,
        type: s.record?.specimens[0]?.type ?? 'Unknown',
        pathologist: s.authorizedBy ? `${s.authorizedBy.firstName} ${s.authorizedBy.lastName}`.trim() : 'Unassigned',
        month: monthKey(new Date(s.authorizedAt!)),
      };
    });

    const allHours = rows.map((r) => r.hours);
    const avgTAT = allHours.length ? round1(allHours.reduce((a, b) => a + b, 0) / allHours.length / 24) : 0; // days
    const medianTAT = round1(median(allHours) / 24);
    const targetHours = TARGET_TAT_DAYS * 24;
    const onTime = rows.filter((r) => r.hours <= targetHours).length;
    const onTimeRate = pct(onTime, rows.length);
    const breachRate = rows.length ? round1(100 - onTimeRate) : 0;

    const group = <K extends string>(keyOf: (r: Row) => K) => {
      const m = new Map<K, number[]>();
      for (const r of rows) { const arr = m.get(keyOf(r)) ?? []; arr.push(r.hours); m.set(keyOf(r), arr); }
      return m;
    };
    const priM = group((r) => (r.urgent ? 'Urgent' : 'Routine'));
    const byPriority = [...priM.entries()].map(([priority, hs]) => ({ priority, avgHours: round1(hs.reduce((a, b) => a + b, 0) / hs.length), count: hs.length }));
    const typeM = group((r) => r.type);
    const bySpecimenType = [...typeM.entries()].map(([type, hs]) => ({ type, avgHours: round1(hs.reduce((a, b) => a + b, 0) / hs.length) })).sort((a, b) => b.avgHours - a.avgHours);
    const pathM = group((r) => r.pathologist);
    const byPathologist = [...pathM.entries()].map(([name, hs]) => ({ name, avgHours: round1(hs.reduce((a, b) => a + b, 0) / hs.length), count: hs.length })).sort((a, b) => b.count - a.count);

    const months = this.emptyMonths(from, to, () => ({ hours: [] as number[], breach: 0 }));
    for (const r of rows) { const b = months.get(r.month); if (b) { b.hours.push(r.hours); if (r.hours > targetHours) b.breach++; } }
    const trend = [...months.entries()].map(([k, v]) => ({ month: monthLabel(k), avgHours: v.hours.length ? round1(v.hours.reduce((a, b) => a + b, 0) / v.hours.length) : 0, breachCount: v.breach }));

    return { avgTAT, medianTAT, targetTAT: TARGET_TAT_DAYS, onTimeRate, breachRate, byPriority, bySpecimenType, byPathologist, trend };
  }

  async specimenDistribution(q: ReportQueryDto) {
    const { from, to } = this.range(q);
    const records = await this.prisma.record.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { formType: true, doctor: true, client: { select: { firstName: true, lastName: true, officeName: true } }, specimens: { select: { type: true } } },
    });
    const total = records.length;
    const typeCounts = new Map<string, number>();
    const clientCounts = new Map<string, number>();
    const doctorCounts = new Map<string, number>();
    let gyn = 0, nonGyn = 0;
    for (const r of records) {
      if (r.formType === 'Gynecology') gyn++; else if (r.formType === 'NonGynecology') nonGyn++;
      for (const s of r.specimens) typeCounts.set(s.type, (typeCounts.get(s.type) ?? 0) + 1);
      const cn = r.client ? (r.client.officeName || `${r.client.firstName} ${r.client.lastName}`.trim()) : 'Direct / Walk-in';
      clientCounts.set(cn, (clientCounts.get(cn) ?? 0) + 1);
      const dn = r.doctor || 'Not stated';
      doctorCounts.set(dn, (doctorCounts.get(dn) ?? 0) + 1);
    }
    const specTotal = [...typeCounts.values()].reduce((a, b) => a + b, 0);
    const toArr = (m: Map<string, number>, whole: number, key: string) => [...m.entries()].map(([k, count]) => ({ [key]: k, count, percentage: pct(count, whole) })).sort((a: any, b: any) => b.count - a.count);
    return {
      byType: toArr(typeCounts, specTotal, 'type'),
      byClient: toArr(clientCounts, total, 'client').slice(0, 20),
      byDoctor: toArr(doctorCounts, total, 'doctor').slice(0, 20),
      byFormType: { gyn, nonGyn },
    };
  }

  // ── CLINICAL REPORTS ──────────────────────────────────────────────────────
  private async bethesdaRows(from: Date, to: Date) {
    const results = await this.prisma.bethesdaResult.findMany({
      where: { record: { createdAt: { gte: from, lte: to } } },
      select: { specimenAdequacy: true, generalCategory: true, squamousCategory: true, ascSubtype: true, glandularCategory: true, record: { select: { createdAt: true } } },
    });
    return results.map((b) => ({ code: deriveShortCode(b as any), month: monthKey(new Date(b.record!.createdAt)) }));
  }

  async bethesdaTrends(q: ReportQueryDto) {
    const { from, to } = this.range(q);
    const rows = await this.bethesdaRows(from, to);
    const total = rows.length;
    const count = (c: string) => rows.filter((r) => r.code === c).length;
    const nilm = count('NILM'), unsat = count('UNSAT');
    const ascus = count('ASCUS'), asch = count('ASC-H'), lsil = count('LSIL'), hsil = count('HSIL'), scc = count('SCC');
    const abnormal = rows.filter((r) => r.code && ABNORMAL.has(r.code)).length;
    const asc = ascus + asch, sil = lsil + hsil;
    const ascSilRatio = sil ? round1(asc / sil) : 0;

    const months = this.emptyMonths(from, to, () => ({ nilm: 0, ascus: 0, lsil: 0, hsil: 0, scc: 0, unsat: 0 }));
    for (const r of rows) {
      const b = months.get(r.month); if (!b || !r.code) continue;
      if (r.code === 'NILM') b.nilm++; else if (r.code === 'ASCUS') b.ascus++; else if (r.code === 'LSIL') b.lsil++;
      else if (r.code === 'HSIL') b.hsil++; else if (r.code === 'SCC') b.scc++; else if (r.code === 'UNSAT') b.unsat++;
    }
    const byMonth = [...months.entries()].map(([k, v]) => ({ month: monthLabel(k), ...v }));

    return {
      nilmRate: pct(nilm, total), abnormalityRate: pct(abnormal, total), unsatisfactoryRate: pct(unsat, total),
      ascSilRatio,
      byMonth,
      benchmarkStatus: {
        ascSil: ascSilRatio <= 3 ? 'Within benchmark' : 'Above benchmark',
        unsatRate: pct(unsat, total) <= 1 ? 'Within benchmark' : 'Above benchmark',
      },
    };
  }

  async abnormalRate(q: ReportQueryDto) {
    const { from, to } = this.range(q);
    const bethesda = await this.prisma.bethesdaResult.findMany({
      where: { record: { createdAt: { gte: from, lte: to } } },
      select: { specimenAdequacy: true, generalCategory: true, squamousCategory: true, ascSubtype: true, glandularCategory: true, record: { select: { createdAt: true, resultSheets: { where: { authorized: true }, select: { authorizedBy: { select: { firstName: true, lastName: true } } }, take: 1 } } } },
    });
    const totalResults = bethesda.length;
    const rows = bethesda.map((b) => ({
      code: deriveShortCode(b as any),
      month: monthKey(new Date(b.record!.createdAt)),
      pathologist: b.record?.resultSheets[0]?.authorizedBy ? `${b.record.resultSheets[0].authorizedBy!.firstName} ${b.record.resultSheets[0].authorizedBy!.lastName}`.trim() : 'Unassigned',
    }));
    const abnormalCount = rows.filter((r) => r.code && ABNORMAL.has(r.code)).length;

    const esc = await this.prisma.escalationRecord.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { severity: true, status: true } });
    const escalations = {
      total: esc.length,
      highGrade: esc.filter((e) => e.severity === 'HighGrade').length,
      malignant: esc.filter((e) => e.severity === 'Malignant').length,
      resolved: esc.filter((e) => e.status === 'Resolved').length,
    };

    const months = this.emptyMonths(from, to, () => ({ total: 0, abnormal: 0 }));
    for (const r of rows) { const b = months.get(r.month); if (b) { b.total++; if (r.code && ABNORMAL.has(r.code)) b.abnormal++; } }
    const byMonth = [...months.entries()].map(([k, v]) => ({ month: monthLabel(k), total: v.total, abnormal: v.abnormal, rate: pct(v.abnormal, v.total) }));

    const pathM = new Map<string, { total: number; abnormal: number }>();
    for (const r of rows) { const e = pathM.get(r.pathologist) ?? { total: 0, abnormal: 0 }; e.total++; if (r.code && ABNORMAL.has(r.code)) e.abnormal++; pathM.set(r.pathologist, e); }
    const byPathologist = [...pathM.entries()].map(([name, v]) => ({ name, total: v.total, abnormal: v.abnormal, rate: pct(v.abnormal, v.total) })).sort((a, b) => b.total - a.total);

    return { totalResults, abnormalCount, abnormalRate: pct(abnormalCount, totalResults), escalations, byMonth, byPathologist };
  }

  async cytotechnologistPerformance(q: ReportQueryDto) {
    const { from, to } = this.range(q);
    const sheets = await this.prisma.resultSheet.findMany({
      where: { authorized: true, authorizedAt: { gte: from, lte: to } },
      select: {
        authorizedAt: true,
        authorizedById: true,
        authorizedBy: { select: { firstName: true, lastName: true, roles: { select: { role: { select: { name: true } } }, take: 1 } } },
        record: { select: { specimenDate: true, createdAt: true, bethesdaResult: { select: { specimenAdequacy: true, generalCategory: true, squamousCategory: true, ascSubtype: true, glandularCategory: true } } } },
      },
    });
    const targetHours = TARGET_TAT_DAYS * 24;
    type S = { name: string; role: string; total: number; hours: number[]; onTime: number; abnormal: number; unsat: number };
    const map = new Map<string, S>();
    for (const s of sheets) {
      if (!s.authorizedById) continue;
      const e = map.get(s.authorizedById) ?? {
        name: s.authorizedBy ? `${s.authorizedBy.firstName} ${s.authorizedBy.lastName}`.trim() : '—',
        role: s.authorizedBy?.roles[0]?.role?.name ?? 'Staff',
        total: 0, hours: [], onTime: 0, abnormal: 0, unsat: 0,
      };
      e.total++;
      const start = s.record?.specimenDate ?? s.record?.createdAt ?? s.authorizedAt!;
      const h = Math.max(0, (+new Date(s.authorizedAt!) - +new Date(start)) / HOUR);
      e.hours.push(h); if (h <= targetHours) e.onTime++;
      const code = s.record?.bethesdaResult ? deriveShortCode(s.record.bethesdaResult as any) : null;
      if (code && ABNORMAL.has(code)) e.abnormal++;
      if (code === 'UNSAT') e.unsat++;
      map.set(s.authorizedById, e);
    }
    const staff = [...map.entries()].map(([userId, e]) => {
      const avgTAT = e.hours.length ? round1(e.hours.reduce((a, b) => a + b, 0) / e.hours.length / 24) : 0;
      const onTimeRate = pct(e.onTime, e.total);
      const unsatisfactoryRate = pct(e.unsat, e.total);
      const accuracy = round1(100 - unsatisfactoryRate);
      return {
        userId, name: e.name, role: e.role,
        casesProcessed: e.total, casesAuthorized: e.total,
        avgTAT, onTimeRate,
        abnormalDetectionRate: pct(e.abnormal, e.total),
        unsatisfactoryRate,
        qualityScore: round1(onTimeRate * 0.4 + accuracy * 0.6),
      };
    }).sort((a, b) => b.casesProcessed - a.casesProcessed);
    return { staff };
  }

  // ── FINANCIAL REPORTS ─────────────────────────────────────────────────────
  async revenueByClient(q: ReportQueryDto) {
    const { from, to } = this.range(q);
    const bills = await this.prisma.bill.findMany({
      where: { createdAt: { gte: from, lte: to }, ...(q.clientId ? { clientId: q.clientId } : {}) },
      select: { total: true, amountPaid: true, createdAt: true, client: { select: { firstName: true, lastName: true, officeName: true } } },
    });
    const totalRevenue = bills.reduce((s, b) => s + b.total, 0);
    const totalPaid = bills.reduce((s, b) => s + b.amountPaid, 0);
    const totalOutstanding = totalRevenue - totalPaid;

    const cm = new Map<string, { invoiceCount: number; totalAmount: number; paidAmount: number }>();
    for (const b of bills) {
      const cn = b.client ? (b.client.officeName || `${b.client.firstName} ${b.client.lastName}`.trim()) : 'Direct / Walk-in';
      const e = cm.get(cn) ?? { invoiceCount: 0, totalAmount: 0, paidAmount: 0 };
      e.invoiceCount++; e.totalAmount += b.total; e.paidAmount += b.amountPaid; cm.set(cn, e);
    }
    const byClient = [...cm.entries()].map(([clientName, e]) => ({
      clientName, invoiceCount: e.invoiceCount, totalAmount: e.totalAmount, paidAmount: e.paidAmount,
      outstandingAmount: e.totalAmount - e.paidAmount, paymentRate: pct(e.paidAmount, e.totalAmount),
    })).sort((a, b) => b.totalAmount - a.totalAmount);

    const months = this.emptyMonths(from, to, () => ({ revenue: 0, collected: 0 }));
    for (const b of bills) { const m = months.get(monthKey(new Date(b.createdAt))); if (m) { m.revenue += b.total; m.collected += b.amountPaid; } }
    const trend = [...months.entries()].map(([k, v]) => ({ month: monthLabel(k), revenue: v.revenue, collected: v.collected }));

    return { totalRevenue, totalPaid, totalOutstanding, byClient, trend };
  }

  async servicesRevenue(q: ReportQueryDto) {
    const { from, to } = this.range(q);
    const lines = await this.prisma.billLine.findMany({
      where: { bill: { createdAt: { gte: from, lte: to } } },
      select: { serviceName: true, quantity: true, unitPrice: true, bill: { select: { createdAt: true, record: { select: { formType: true } } } } },
    });
    const svc = new Map<string, { count: number; total: number; unitPrice: number }>();
    const form = { gyn: { count: 0, revenue: 0 }, nonGyn: { count: 0, revenue: 0 } };
    const months = this.emptyMonths(from, to, () => ({ revenue: 0 }));
    for (const l of lines) {
      const amount = l.quantity * l.unitPrice;
      const e = svc.get(l.serviceName) ?? { count: 0, total: 0, unitPrice: l.unitPrice };
      e.count += l.quantity; e.total += amount; svc.set(l.serviceName, e);
      const ft = l.bill?.record?.formType;
      if (ft === 'Gynecology') { form.gyn.count += l.quantity; form.gyn.revenue += amount; }
      else if (ft === 'NonGynecology') { form.nonGyn.count += l.quantity; form.nonGyn.revenue += amount; }
      const m = l.bill ? months.get(monthKey(new Date(l.bill.createdAt))) : null; if (m) m.revenue += amount;
    }
    const byService = [...svc.entries()].map(([service, e]) => ({ service, count: e.count, unitPrice: e.unitPrice, total: e.total })).sort((a, b) => b.total - a.total);
    const trend = [...months.entries()].map(([k, v]) => ({ month: monthLabel(k), revenue: v.revenue }));
    return { byService, byFormType: form, trend };
  }

  async outstandingPayments(q: ReportQueryDto) {
    const { from, to } = this.range(q);
    const bills = await this.prisma.bill.findMany({
      where: { createdAt: { gte: from, lte: to }, status: { in: ['Draft', 'Issued', 'PartiallyPaid'] } },
      select: { referenceNo: true, total: true, amountPaid: true, dueDate: true, status: true, client: { select: { firstName: true, lastName: true, officeName: true } } },
      orderBy: { dueDate: 'asc' },
    });
    const now = Date.now();
    const invoices = bills
      .map((b) => {
        const amount = b.total - b.amountPaid;
        const daysOverdue = b.dueDate ? Math.max(0, Math.floor((now - +new Date(b.dueDate)) / DAY)) : 0;
        return {
          invoiceNo: b.referenceNo,
          clientName: b.client ? (b.client.officeName || `${b.client.firstName} ${b.client.lastName}`.trim()) : 'Direct / Walk-in',
          amount, dueDate: b.dueDate ? b.dueDate.toISOString() : null, daysOverdue, status: b.status,
        };
      })
      .filter((i) => i.amount > 0);
    const totalOutstanding = invoices.reduce((s, i) => s + i.amount, 0);
    const overdue = invoices.filter((i) => i.daysOverdue > 0);
    const avgDaysOverdue = overdue.length ? Math.round(overdue.reduce((s, i) => s + i.daysOverdue, 0) / overdue.length) : 0;
    return { totalOutstanding, overdueCount: overdue.length, avgDaysOverdue, invoices };
  }

  // ── PATIENT REPORTS ───────────────────────────────────────────────────────
  async patientRegistration(q: ReportQueryDto) {
    const { from, to } = this.range(q);
    const [inPeriod, totalPatients] = await Promise.all([
      this.prisma.patient.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { gender: true, dateOfBirth: true, createdAt: true } }),
      this.prisma.patient.count(),
    ]);
    const newThisPeriod = inPeriod.length;
    const prior = this.priorRange(from, to);
    const priorNew = await this.prisma.patient.count({ where: { createdAt: { gte: prior.from, lte: prior.to } } });
    const growthRate = priorNew ? round1(((newThisPeriod - priorNew) / priorNew) * 100) : 0;
    const cumulativeStart = await this.prisma.patient.count({ where: { createdAt: { lt: from } } });

    const months = this.emptyMonths(from, to, () => ({ newPatients: 0 }));
    for (const p of inPeriod) { const m = months.get(monthKey(new Date(p.createdAt))); if (m) m.newPatients++; }
    let running = cumulativeStart;
    const byMonth = [...months.entries()].map(([k, v]) => { running += v.newPatients; return { month: monthLabel(k), newPatients: v.newPatients, cumulative: running }; });

    const byGender = { male: 0, female: 0, other: 0 };
    const ageGroups = [{ range: '0-20', min: 0, max: 20 }, { range: '21-30', min: 21, max: 30 }, { range: '31-40', min: 31, max: 40 }, { range: '41-50', min: 41, max: 50 }, { range: '51-60', min: 51, max: 60 }, { range: '60+', min: 61, max: 200 }];
    const ageCounts = ageGroups.map((g) => ({ range: g.range, count: 0 }));
    for (const p of inPeriod) {
      if (p.gender === 'Male') byGender.male++; else if (p.gender === 'Female') byGender.female++; else byGender.other++;
      if (p.dateOfBirth) {
        const age = Math.floor((Date.now() - +new Date(p.dateOfBirth)) / (365.25 * DAY));
        const gi = ageGroups.findIndex((g) => age >= g.min && age <= g.max);
        if (gi >= 0) ageCounts[gi].count++;
      }
    }
    return { totalPatients, newThisPeriod, growthRate, byMonth, byGender, byAgeGroup: ageCounts };
  }

  async recallCompliance(q: ReportQueryDto) {
    const { from, to } = this.range(q);
    const recalls = await this.prisma.recallRecord.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { status: true, triggerDiagnosis: true, dueDate: true, completedAt: true, createdAt: true, patient: { select: { firstName: true, lastName: true } } },
    });
    const total = recalls.length;
    const completed = recalls.filter((r) => r.status === 'Completed').length;
    const overdue = recalls.filter((r) => r.status === 'Overdue').length;
    const pending = recalls.filter((r) => ['Pending', 'Due'].includes(r.status)).length;
    const returns = recalls.filter((r) => r.completedAt).map((r) => (+new Date(r.completedAt!) - +new Date(r.createdAt)) / DAY);
    const avgDaysToReturn = returns.length ? Math.round(returns.reduce((a, b) => a + b, 0) / returns.length) : 0;

    const dm = new Map<string, { total: number; completed: number }>();
    for (const r of recalls) { const e = dm.get(r.triggerDiagnosis) ?? { total: 0, completed: 0 }; e.total++; if (r.status === 'Completed') e.completed++; dm.set(r.triggerDiagnosis, e); }
    const byDiagnosis = [...dm.entries()].map(([diagnosis, e]) => ({ diagnosis, total: e.total, completed: e.completed, rate: pct(e.completed, e.total) })).sort((a, b) => b.total - a.total);

    const now = Date.now();
    const overdueList = recalls.filter((r) => r.status === 'Overdue').map((r) => ({
      patient: r.patient ? `${r.patient.firstName} ${r.patient.lastName}`.trim() : '—',
      dueDate: r.dueDate ? r.dueDate.toISOString() : null,
      daysOverdue: r.dueDate ? Math.max(0, Math.floor((now - +new Date(r.dueDate)) / DAY)) : 0,
      diagnosis: r.triggerDiagnosis,
    })).sort((a, b) => b.daysOverdue - a.daysOverdue);

    return { totalRecalls: total, completed, pending, overdue, complianceRate: pct(completed, total), avgDaysToReturn, byDiagnosis, overdueList };
  }

  // ── STAFF REPORTS ─────────────────────────────────────────────────────────
  async payAdviceHistory(q: ReportQueryDto) {
    const { from, to } = this.range(q);
    const fromP = monthKey(from), toP = monthKey(to);
    const advices = await this.prisma.payAdvice.findMany({
      where: { period: { gte: fromP, lte: toP } },
      select: {
        period: true, basicPay: true, grossPay: true, nis: true, nht: true, edTax: true, paye: true, otherDeductions: true, netPay: true,
        employee: { select: { employeeNo: true, user: { select: { firstName: true, lastName: true } }, department: { select: { name: true } } } },
      },
      orderBy: { period: 'desc' },
    });
    const employees = advices.map((a) => {
      const totalDeductions = a.nis + a.nht + a.edTax + a.paye + a.otherDeductions;
      return {
        name: a.employee?.user ? `${a.employee.user.firstName} ${a.employee.user.lastName}`.trim() : '—',
        employeeNo: a.employee?.employeeNo ?? '—',
        department: a.employee?.department?.name ?? '—',
        period: a.period,
        basicPay: a.basicPay, grossPay: a.grossPay, totalDeductions, netPay: a.netPay,
        nisDeduction: a.nis, nhtDeduction: a.nht, edTaxDeduction: a.edTax, payeDeduction: a.paye,
      };
    });
    const totals = employees.reduce((t, e) => ({ gross: t.gross + e.grossPay, deductions: t.deductions + e.totalDeductions, net: t.net + e.netPay }), { gross: 0, deductions: 0, net: 0 });
    return { period: fromP === toP ? fromP : `${fromP} — ${toP}`, employees, totals };
  }

  // ── QUALITY REPORTS ───────────────────────────────────────────────────────
  async qcFailures(q: ReportQueryDto) {
    const { from, to } = this.range(q);
    const checks = await this.prisma.qCCheck.findMany({
      where: { performedAt: { gte: from, lte: to } },
      select: { checkType: true, result: true, performedAt: true, equipment: { select: { name: true } } },
    });
    const totalChecks = checks.length;
    const failCount = checks.filter((c) => c.result === 'Fail').length;
    const passCount = checks.filter((c) => c.result === 'Pass').length;

    const byTypeM = new Map<string, { fail: number; pass: number }>();
    const byEqM = new Map<string, { fail: number; pass: number }>();
    const dayM = new Map<string, { pass: number; fail: number }>();
    for (const c of checks) {
      const t = byTypeM.get(c.checkType) ?? { fail: 0, pass: 0 };
      const eqName = c.equipment?.name ?? 'Unassigned';
      const eq = byEqM.get(eqName) ?? { fail: 0, pass: 0 };
      const dkey = new Date(c.performedAt).toISOString().slice(0, 10);
      const d = dayM.get(dkey) ?? { pass: 0, fail: 0 };
      if (c.result === 'Fail') { t.fail++; eq.fail++; d.fail++; } else if (c.result === 'Pass') { t.pass++; eq.pass++; d.pass++; }
      byTypeM.set(c.checkType, t); byEqM.set(eqName, eq); dayM.set(dkey, d);
    }
    const byType = [...byTypeM.entries()].map(([type, v]) => ({ type, fail: v.fail, pass: v.pass, rate: pct(v.fail, v.fail + v.pass) })).sort((a, b) => b.fail - a.fail);
    const byEquipment = [...byEqM.entries()].map(([equipment, v]) => ({ equipment, fail: v.fail, pass: v.pass, rate: pct(v.fail, v.fail + v.pass) })).sort((a, b) => b.fail - a.fail);
    const trend = [...dayM.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, pass: v.pass, fail: v.fail }));
    const openAlerts = await this.prisma.qCFailureAlert.count({ where: { status: 'Open' } });

    return { totalChecks, failCount, failRate: pct(failCount, totalChecks), passRate: pct(passCount, totalChecks), byType, byEquipment, trend, openAlerts };
  }

  async capBenchmarks(q: ReportQueryDto) {
    const [beth, tat, qc] = await Promise.all([this.bethesdaTrends(q), this.tatAnalysis(q), this.qcFailures(q)]);
    const bench = (value: number, benchmark: number, higherIsBetter: boolean) => {
      const ok = higherIsBetter ? value >= benchmark : value <= benchmark;
      const warn = higherIsBetter ? value >= benchmark * 0.95 : value <= benchmark * 1.2;
      return { value, benchmark, status: ok ? 'Compliant' : warn ? 'Warning' : 'Non-Compliant' };
    };
    const ascSil = bench(beth.ascSilRatio, 3.0, false);
    const unsat = bench(beth.unsatisfactoryRate, 1.0, false);
    const tatC = bench(tat.onTimeRate, 95, true);
    const qcPass = bench(qc.passRate, 95, true);
    const statuses = [ascSil, unsat, tatC, qcPass].map((s) => s.status);
    const overall = statuses.includes('Non-Compliant') ? 'Non-Compliant' : statuses.includes('Warning') ? 'Warning' : 'Compliant';
    return { ascSilRatio: ascSil, unsatisfactoryRate: unsat, tatCompliance: tatC, qcPassRate: qcPass, overall };
  }

  // ── DASHBOARD SUMMARY ─────────────────────────────────────────────────────
  async summary(q: ReportQueryDto) {
    const [vol, tat, abn, rev, pat, qc, cap] = await Promise.all([
      this.specimenVolume(q), this.tatAnalysis(q), this.abnormalRate(q), this.revenueByClient(q),
      this.patientRegistration(q), this.qcFailures(q), this.capBenchmarks(q),
    ]);
    return {
      specimens: { total: vol.total, gyn: vol.gynCount, nonGyn: vol.nonGynCount, growthRate: vol.growthRate },
      tat: { avgTAT: tat.avgTAT, onTimeRate: tat.onTimeRate, breachRate: tat.breachRate },
      clinical: { totalResults: abn.totalResults, abnormalRate: abn.abnormalRate, escalations: abn.escalations.total },
      revenue: { total: rev.totalRevenue, paid: rev.totalPaid, outstanding: rev.totalOutstanding },
      patients: { total: pat.totalPatients, newThisPeriod: pat.newThisPeriod, growthRate: pat.growthRate },
      quality: { passRate: qc.passRate, failCount: qc.failCount, openAlerts: qc.openAlerts },
      compliance: { overall: cap.overall },
    };
  }
}
