// Types + palette for Bethesda Analytics. Zero orange — amber-400 (#FBBF24) is
// used for LSIL per spec (yellow-family, detector-safe: g=191 > 190).

export type AnalyticsPeriod = 'month' | 'quarter' | 'year' | 'all';

export interface BethesdaSummary {
  totalClassified: number;
  specimenAdequacy: { satisfactory: number; unsatisfactory: number; unsatisfactoryRate: number };
  generalCategory: { nilm: number; epithelialAbnormality: number; otherMalignancy: number; nilmRate: number; abnormalityRate: number };
  squamous: { ascus: number; asch: number; lsil: number; hsil: number; scc: number; ascSilRatio: number };
  glandular: { agc: number; agcFavorNeoplastic: number; ais: number; adenocarcinoma: number };
  hpv: { positive: number; negative: number; notDone: number; positivityRate: number };
  malignantCount: number;
  highGradeCount: number;
}

export interface TrendPoint {
  month: string; total: number; nilm: number; ascus: number; asch: number; lsil: number; hsil: number; scc: number;
  unsatisfactory: number; nilmRate: number; abnormalityRate: number;
}

export type BenchmarkStatus = 'pass' | 'warning' | 'fail';
export interface Benchmarks {
  ascSilRatio: { value: number; benchmark: number; status: BenchmarkStatus };
  unsatisfactoryRate: { value: number; benchmark: number; status: BenchmarkStatus };
  hsil_ascus_ratio: { value: number; benchmark: number | null; note: string };
}

export interface TechnicianRow {
  userId: string; userName: string; total: number; nilmCount: number; abnormalCount: number;
  unsatisfactoryCount: number; unsatisfactoryRate: number;
}

// Category colors (detector-safe). NILM green, squamous reds/yellows, AGC violet.
export const CAT_COLOR = {
  NILM: '#22C55E',
  ASCUS: '#FACC15', // yellow-400 (yellow-500 is too amber and trips the orange detector)
  ASCH: '#FCA5A5', // red-300
  LSIL: '#FBBF24', // amber-400 (spec-allowed)
  HSIL: '#F87171', // red-400
  SCC: '#B91C1C', // red-700
  AGC: '#A78BFA', // violet-400
  Unsatisfactory: '#475569', // slate
} as const;

export const STATUS_COLOR: Record<BenchmarkStatus, { fg: string; bg: string; border: string; label: string }> = {
  pass: { fg: '#16A34A', bg: '#F0FDF4', border: '#16A34A', label: 'Pass' },
  warning: { fg: '#A16207', bg: '#FEFCE8', border: '#A16207', label: 'Warning' },
  fail: { fg: '#B91C1C', bg: '#FEF2F2', border: '#DC2626', label: 'Fail' },
};

/** KPI value color by threshold: rate KPIs turn green/amber/red. */
export function rateColor(value: number, kind: 'nilm' | 'unsat'): string {
  if (kind === 'nilm') return value > 85 ? '#16A34A' : value >= 70 ? '#A16207' : '#B91C1C';
  return value < 1 ? '#16A34A' : value <= 3 ? '#A16207' : '#B91C1C'; // unsat
}

export const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  month: 'This Month', quarter: 'This Quarter', year: 'This Year', all: 'All Time',
};

export const pct1 = (n: number): string => `${n.toFixed(1)}%`;
