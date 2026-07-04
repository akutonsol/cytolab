import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export type Period = 'month' | 'quarter' | 'year' | 'all';

const rowSelect = {
  specimenAdequacy: true, generalCategory: true, squamousCategory: true, ascSubtype: true,
  glandularCategory: true, hpvResult: true, hpvGenotype: true, reportedAt: true, reportedById: true,
  reportedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.BethesdaResultSelect;

type Row = Prisma.BethesdaResultGetPayload<{ select: typeof rowSelect }>;

/** Percentage to 1 decimal (0 when the denominator is 0). */
const pct = (n: number, d: number): number => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
const ratio = (n: number, d: number): number => (d > 0 ? Math.round((n / d) * 100) / 100 : 0);

@Injectable()
export class BethesdaAnalyticsService {
  constructor(private prisma: PrismaService) {}

  private range(period: Period | undefined, year?: number, month?: number): { gte?: Date; lte?: Date } {
    const now = new Date();
    if (!period || period === 'all') return {};
    const y = year ?? now.getFullYear();
    if (period === 'year') return { gte: new Date(y, 0, 1), lte: new Date(y, 11, 31, 23, 59, 59) };
    if (period === 'quarter') { const q = Math.floor(now.getMonth() / 3); return { gte: new Date(y, q * 3, 1), lte: new Date(y, q * 3 + 3, 0, 23, 59, 59) }; }
    const m = (month ?? now.getMonth() + 1) - 1;
    return { gte: new Date(y, m, 1), lte: new Date(y, m + 1, 0, 23, 59, 59) };
  }

  private fetch(where: Prisma.BethesdaResultWhereInput) {
    return this.prisma.bethesdaResult.findMany({ where, select: rowSelect });
  }

  /** Raw category counts shared by summary + trend. */
  private counts(rows: Row[]) {
    const c = (fn: (r: Row) => boolean) => rows.filter(fn).length;
    const satisfactory = c((r) => r.specimenAdequacy === 'Satisfactory');
    return {
      total: rows.length,
      satisfactory,
      unsatisfactory: c((r) => r.specimenAdequacy === 'Unsatisfactory'),
      nilm: c((r) => r.generalCategory === 'NILM'),
      epithelialAbnormality: c((r) => r.generalCategory === 'EpithelialAbnormality'),
      otherMalignancy: c((r) => r.generalCategory === 'OtherMalignancy'),
      ascus: c((r) => r.squamousCategory === 'ASC' && r.ascSubtype === 'ASCUS'),
      asch: c((r) => r.squamousCategory === 'ASC' && r.ascSubtype === 'ASCH'),
      lsil: c((r) => r.squamousCategory === 'LSIL'),
      hsil: c((r) => r.squamousCategory === 'HSIL'),
      scc: c((r) => r.squamousCategory === 'SCC'),
      agc: c((r) => r.glandularCategory === 'AGC'),
      agcFavorNeoplastic: c((r) => r.glandularCategory === 'AGC_FavorNeoplastic'),
      ais: c((r) => r.glandularCategory === 'AIS'),
      adenocarcinoma: c((r) => r.glandularCategory === 'Adenocarcinoma'),
      hpvPositive: c((r) => r.hpvResult === 'Positive'),
      hpvNegative: c((r) => r.hpvResult === 'Negative'),
      hpvNotDone: c((r) => !r.hpvResult || r.hpvResult === 'NotPerformed'),
    };
  }

  async summary(period: Period | undefined, year?: number, month?: number) {
    const rows = await this.fetch({ reportedAt: this.range(period, year, month) });
    const k = this.counts(rows);
    const sil = k.lsil + k.hsil + k.scc;
    return {
      totalClassified: k.total,
      specimenAdequacy: { satisfactory: k.satisfactory, unsatisfactory: k.unsatisfactory, unsatisfactoryRate: pct(k.unsatisfactory, k.total) },
      generalCategory: {
        nilm: k.nilm, epithelialAbnormality: k.epithelialAbnormality, otherMalignancy: k.otherMalignancy,
        nilmRate: pct(k.nilm, k.satisfactory),
        abnormalityRate: pct(k.epithelialAbnormality + k.otherMalignancy, k.satisfactory),
      },
      squamous: { ascus: k.ascus, asch: k.asch, lsil: k.lsil, hsil: k.hsil, scc: k.scc, ascSilRatio: ratio(k.ascus + k.asch, sil) },
      glandular: { agc: k.agc, agcFavorNeoplastic: k.agcFavorNeoplastic, ais: k.ais, adenocarcinoma: k.adenocarcinoma },
      hpv: { positive: k.hpvPositive, negative: k.hpvNegative, notDone: k.hpvNotDone, positivityRate: pct(k.hpvPositive, k.hpvPositive + k.hpvNegative) },
      malignantCount: k.scc + k.adenocarcinoma + k.otherMalignancy,
      highGradeCount: k.hsil + k.asch + k.ais,
    };
  }

  async trend(months = 12) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const rows = await this.fetch({ reportedAt: { gte: start } });
    const buckets = new Map<string, Row[]>();
    for (let i = 0; i < months; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      buckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, []);
    }
    for (const r of rows) {
      const d = new Date(r.reportedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets.get(key)?.push(r);
    }
    return [...buckets.entries()].map(([month, mrows]) => {
      const k = this.counts(mrows);
      return {
        month, total: k.total, nilm: k.nilm, ascus: k.ascus, asch: k.asch, lsil: k.lsil, hsil: k.hsil, scc: k.scc,
        unsatisfactory: k.unsatisfactory,
        nilmRate: pct(k.nilm, k.satisfactory),
        abnormalityRate: pct(k.epithelialAbnormality + k.otherMalignancy, k.satisfactory),
      };
    });
  }

  async benchmarks() {
    const rows = await this.fetch({});
    const k = this.counts(rows);
    const ascSil = ratio(k.ascus + k.asch, k.lsil + k.hsil + k.scc);
    const unsat = pct(k.unsatisfactory, k.total);
    const ascSilStatus = ascSil >= 3.0 ? 'fail' : ascSil >= 2.5 ? 'warning' : 'pass';
    const unsatStatus = unsat > 3.0 ? 'fail' : unsat >= 1.0 ? 'warning' : 'pass';
    return {
      ascSilRatio: { value: ascSil, benchmark: 3.0, status: ascSilStatus as 'pass' | 'warning' | 'fail' },
      unsatisfactoryRate: { value: unsat, benchmark: 1.0, status: unsatStatus as 'pass' | 'warning' | 'fail' },
      hsil_ascus_ratio: { value: ratio(k.hsil, k.ascus), benchmark: null, note: 'Lab-specific baseline' },
    };
  }

  async byTechnician() {
    const rows = await this.fetch({});
    const groups = new Map<string, { name: string; rows: Row[] }>();
    for (const r of rows) {
      const id = r.reportedById ?? 'unknown';
      const name = r.reportedBy ? `${r.reportedBy.firstName} ${r.reportedBy.lastName}`.trim() : 'Unknown';
      if (!groups.has(id)) groups.set(id, { name, rows: [] });
      groups.get(id)!.rows.push(r);
    }
    return [...groups.entries()].map(([userId, g]) => {
      const k = this.counts(g.rows);
      return {
        userId, userName: g.name,
        total: k.total, nilmCount: k.nilm,
        abnormalCount: k.epithelialAbnormality + k.otherMalignancy,
        unsatisfactoryCount: k.unsatisfactory,
        unsatisfactoryRate: pct(k.unsatisfactory, k.total),
      };
    }).sort((a, b) => b.total - a.total);
  }
}
