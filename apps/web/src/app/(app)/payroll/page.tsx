'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Banknote, Calculator, ChevronRight, Landmark, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Bar, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { jmd, money, monthYear, fmtDate } from '@/lib/payroll';

// ── Types ────────────────────────────────────────────────────────────────────
interface Money4 { nis: number; nht: number; edTax: number; paye: number }
interface Period { period: string; totalGross: number; totalNet: number; totalTaxes: number; employeeCount: number; status: string | null }
interface RecentRun { id: string; period: string; runNumber: number; employeeCount: number; totalGross: number; totalNet: number; totalTaxes: number; status: string }
interface Analytics {
  year: number;
  yearlyTotals: { totalGross: number; totalNet: number; totalTaxes: number; activeEmployeeCount: number };
  byPeriod: Period[];
  taxBreakdown: Money4;
  taxBreakdownPrev: Money4;
  recentRuns: RecentRun[];
  mostRecent: { id: string; period: string; payrollDate: string | null; totalGross: number; totalNet: number; employeeCount: number } | null;
  topEarners: { employeeName: string; department: string | null; netPay: number }[];
}

const INDIGO = '#4F46E5';
const SLATE = '#94A3B8';
const GRID = '#F1F5F9';

// Compact JMD for big KPI numbers / chart axis (dollars from cents).
const compact = (cents: number) => {
  const v = cents / 100;
  if (Math.abs(v) >= 1_000_000) return `J$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `J$${(v / 1_000).toFixed(0)}K`;
  return `J$${Math.round(v)}`;
};
const axisFmt = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
};
const monLabel = (p: string) => { const [y, m] = p.split('-'); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short' }); };
const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : cur > 0 ? 100 : 0);
const daysLeftInMonth = () => { const d = new Date(); const end = new Date(d.getFullYear(), d.getMonth() + 1, 0); return Math.max(0, Math.ceil((end.getTime() - d.getTime()) / 86_400_000)); };
const nextPeriod = (a: Analytics | undefined) => {
  const d = new Date(); const cur = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  if (a?.mostRecent && a.mostRecent.period >= cur) { const nd = new Date(d.getFullYear(), d.getMonth() + 1, 1); return `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}`; }
  return cur;
};

const RUN_BADGE: Record<string, { bg: string; color: string }> = {
  Completed: { bg: '#F0FDF4', color: '#16A34A' },
  Processing: { bg: '#F0F9FF', color: '#0284C7' },
  Draft: { bg: '#F1F5F9', color: '#64748B' },
};

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg">
      <div className="mb-1 text-[12px] font-semibold text-slate-900">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-[12px]">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="capitalize text-slate-500">{p.name}:</span>
          <span className="font-semibold text-slate-900">{compact(p.value * 100)}</span>
        </div>
      ))}
    </div>
  );
}

export default function PayrollDashboard() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [gran, setGran] = useState<'Month' | 'Quarter' | 'Year'>('Month');
  useEffect(() => setMounted(true), []);
  const year = new Date().getFullYear();

  const { data: a } = useQuery({
    queryKey: ['payroll-analytics', year],
    queryFn: () => api.get<Analytics>('/payroll/analytics', { params: { year } }).then((r) => r.data),
  });

  const chartData = useMemo(() => {
    const bp = a?.byPeriod ?? [];
    const pt = (label: string, g: number, n: number, t: number) => ({ label, Gross: g / 100, Net: n / 100, Taxes: t / 100 });
    if (gran === 'Month') return bp.map((p) => pt(monLabel(p.period), p.totalGross, p.totalNet, p.totalTaxes));
    if (gran === 'Quarter') return [0, 1, 2, 3].map((i) => { const s = bp.slice(i * 3, i * 3 + 3); return pt(`Q${i + 1}`, s.reduce((x, y) => x + y.totalGross, 0), s.reduce((x, y) => x + y.totalNet, 0), s.reduce((x, y) => x + y.totalTaxes, 0)); });
    return [pt(String(year), bp.reduce((x, y) => x + y.totalGross, 0), bp.reduce((x, y) => x + y.totalNet, 0), bp.reduce((x, y) => x + y.totalTaxes, 0))];
  }, [a, gran, year]);

  const costTrend = useMemo(() => (a?.byPeriod ?? []).map((p) => ({ label: monLabel(p.period), Gross: p.totalGross / 100, Net: p.totalNet / 100 })), [a]);

  const taxRows = a ? [
    { key: 'nis', label: 'NIS', cur: a.taxBreakdown.nis, prev: a.taxBreakdownPrev.nis },
    { key: 'nht', label: 'NHT', cur: a.taxBreakdown.nht, prev: a.taxBreakdownPrev.nht },
    { key: 'edtax', label: 'Education Tax', cur: a.taxBreakdown.edTax, prev: a.taxBreakdownPrev.edTax },
    { key: 'paye', label: 'PAYE', cur: a.taxBreakdown.paye, prev: a.taxBreakdownPrev.paye },
  ] : [];

  const heroGross = a?.mostRecent?.totalGross ?? a?.yearlyTotals.totalGross ?? 0;
  const heroPeriod = a?.mostRecent?.period ? monthYear(a.mostRecent.period) : String(year);

  return (
    <div className="min-h-full" style={{ background: '#F8FAFC' }}>
      <div className="px-6 py-8 lg:px-8">
        {/* Top bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-charcoal-heading">Payroll</h1>
          <button className="btn-primary !h-12 !px-6 !text-[15px]" onClick={() => router.push('/payroll/wizard')}><Calculator size={18} /> Run Salary Payroll</button>
        </div>

        {/* Hero KPI row */}
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi icon={Banknote} color={INDIGO} label="Total Gross Payroll" value={compact(a?.yearlyTotals.totalGross ?? 0)} sub={`${year} year to date`} primary />
          <Kpi icon={Banknote} color="#16A34A" label="Total Net Payroll" value={compact(a?.yearlyTotals.totalNet ?? 0)} sub="Take-home paid" />
          <Kpi icon={Landmark} color="#0284C7" label="Total Tax Collected" value={compact(a?.yearlyTotals.totalTaxes ?? 0)} sub="NIS · NHT · Ed · PAYE" />
          <Kpi icon={Users} color="#7C3AED" label="Employees on Payroll" value={String(a?.yearlyTotals.activeEmployeeCount ?? 0)} sub="Active employees" />
        </div>

        {/* Main charts row: 60/40 */}
        <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
          {/* Payroll by period */}
          <div className="glass-card rounded-2xl p-6 lg:col-span-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Payroll by Period</div>
                <div className="mt-1 font-display text-4xl font-bold leading-none text-[#0F172A] lg:text-5xl">{jmd(heroGross)}</div>
                <div className="mt-1 font-body-sm text-body-sm text-secondary">Gross · {heroPeriod}</div>
              </div>
              <div className="flex rounded-xl border border-outline-variant/40 p-0.5">
                {(['Month', 'Quarter', 'Year'] as const).map((g) => (
                  <button key={g} onClick={() => setGran(g)} className={`rounded-lg px-3 py-1.5 font-label-sm text-label-sm font-semibold transition-colors ${gran === g ? 'bg-primary-fixed text-primary' : 'text-secondary hover:bg-surface-container-low'}`}>{g}</button>
                ))}
              </div>
            </div>
            <div className="mt-4 h-[300px] w-full">
              {mounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: SLATE, fontSize: 12 }} />
                    <YAxis tickFormatter={axisFmt} tickLine={false} axisLine={false} tick={{ fill: SLATE, fontSize: 12 }} width={48} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(79,70,229,0.06)' }} />
                    <Bar dataKey="Gross" fill={INDIGO} radius={[4, 4, 0, 0]} maxBarSize={38} isAnimationActive={false} />
                    <Line type="monotone" dataKey="Net" stroke={SLATE} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Tax breakdown */}
          <div className="glass-card rounded-2xl p-6 lg:col-span-2">
            <div className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Tax Collection Breakdown</div>
            <div className="mt-4 flex flex-col divide-y divide-outline-variant/30">
              {taxRows.map((r) => {
                const p = pct(r.cur, r.prev);
                return (
                  <div key={r.key} className="flex items-center justify-between py-3.5">
                    <div>
                      <div className="font-body-md text-body-md font-semibold text-charcoal-heading">{r.label}</div>
                      <div className="mt-0.5 inline-flex items-center gap-1 font-label-sm text-label-sm" style={{ color: p >= 0 ? '#16A34A' : '#64748B' }}>
                        {p >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {Math.abs(p)}% vs {year - 1}
                      </div>
                    </div>
                    <div className="font-display text-[22px] font-bold text-[#0F172A]">{jmd(r.cur)}</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-primary-fixed px-4 py-3.5">
              <span className="font-label-md text-label-md font-semibold uppercase tracking-wider text-primary">Total Taxes</span>
              <span className="font-display text-2xl font-bold text-primary">{jmd(a?.yearlyTotals.totalTaxes ?? 0)}</span>
            </div>
          </div>
        </div>

        {/* Secondary row: 50/50 */}
        <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Cost trend */}
          <div className="glass-card rounded-2xl p-6">
            <div className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Monthly Payroll Cost</div>
            <div className="mt-1 font-body-sm text-body-sm text-secondary">Gross vs Net · {year}</div>
            <div className="mt-4 h-[240px] w-full">
              {mounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={costTrend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: SLATE, fontSize: 12 }} />
                    <YAxis tickFormatter={axisFmt} tickLine={false} axisLine={false} tick={{ fill: SLATE, fontSize: 12 }} width={48} />
                    <Tooltip content={<ChartTip />} />
                    <Line type="monotone" dataKey="Gross" stroke={INDIGO} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="Net" stroke={SLATE} strokeWidth={2.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="mt-3 flex items-center gap-5">
              <Legend color={INDIGO} label="Gross payroll" />
              <Legend color={SLATE} label="Net payroll" dashed />
            </div>
          </div>

          {/* Payroll runs table */}
          <div className="glass-card flex flex-col overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between px-6 py-4">
              <div className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Payroll Runs</div>
              {a?.recentRuns[0] && <Link href={`/payroll/run/${a.recentRuns[0].id}`} className="font-label-sm text-label-sm font-semibold text-primary hover:underline">View all</Link>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-y border-outline-variant/40 bg-surface-container-low/40">
                    {['Period', 'Emp', 'Gross', 'Net', 'Taxes', 'Status', ''].map((h) => <th key={h} className="px-4 py-2.5 text-left font-label-sm text-label-sm uppercase tracking-wider text-secondary">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(a?.recentRuns ?? []).map((r) => {
                    const b = RUN_BADGE[r.status] ?? RUN_BADGE.Draft;
                    return (
                      <tr key={r.id} className="cursor-pointer border-b border-surface-container-low transition-colors hover:bg-surface-container-low/50" onClick={() => router.push(`/payroll/run/${r.id}`)}>
                        <td className="px-4 py-3 font-body-sm text-body-sm font-semibold text-charcoal-heading">{monthYear(r.period)}</td>
                        <td className="px-4 py-3 font-body-sm text-body-sm text-secondary">{r.employeeCount}</td>
                        <td className="px-4 py-3 font-body-sm text-body-sm text-on-surface">{jmd(r.totalGross)}</td>
                        <td className="px-4 py-3 font-body-sm text-body-sm font-semibold text-charcoal-heading">{jmd(r.totalNet)}</td>
                        <td className="px-4 py-3 font-body-sm text-body-sm text-secondary">{jmd(r.totalTaxes)}</td>
                        <td className="px-4 py-3"><span style={{ background: b.bg, color: b.color }} className="inline-block rounded-full px-2.5 py-1 font-label-sm text-label-sm font-medium">{r.status}</span></td>
                        <td className="px-4 py-3 text-secondary"><ChevronRight size={15} /></td>
                      </tr>
                    );
                  })}
                  {(a?.recentRuns ?? []).length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center font-body-sm text-body-sm text-secondary">No payroll runs yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Bottom row: 3 col */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Most recent run */}
          <div className="glass-card rounded-2xl p-6">
            <div className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Most Recent Run</div>
            {a?.mostRecent ? (
              <>
                <div className="mt-3 font-display text-4xl font-bold leading-none text-[#0F172A]">{jmd(a.mostRecent.totalGross)}</div>
                <div className="mt-1 font-body-sm text-body-sm text-secondary">Payout Total · {monthYear(a.mostRecent.period)}</div>
                <div className="mt-4 flex flex-col gap-2 border-t border-[#F1F0EA] pt-4">
                  <Row label="NET Payout Cash" value={jmd(a.mostRecent.totalNet)} />
                  <Row label="Employees Paid" value={String(a.mostRecent.employeeCount)} />
                  <Row label="Payroll Date" value={fmtDate(a.mostRecent.payrollDate)} />
                </div>
                <Link href={`/payroll/run/${a.mostRecent.id}`} className="mt-4 inline-flex items-center gap-1 font-label-md text-label-md font-semibold text-primary hover:underline">View Details <ArrowRight size={14} /></Link>
              </>
            ) : <p className="mt-4 font-body-sm text-body-sm text-secondary">No payroll processed yet.</p>}
          </div>

          {/* Top earners */}
          <div className="glass-card rounded-2xl p-6">
            <div className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Top Earners This Period</div>
            <div className="mt-3 flex flex-col divide-y divide-outline-variant/30">
              {(a?.topEarners ?? []).map((e, i) => (
                <div key={i} className="flex items-center gap-3 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full font-label-sm text-label-sm font-bold" style={{ background: '#EEF2FF', color: INDIGO }}>{e.employeeName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-body-sm text-body-sm font-semibold text-charcoal-heading">{e.employeeName}</div>
                    <div className="truncate font-label-sm text-label-sm text-secondary">{e.department ?? '—'}</div>
                  </div>
                  <div className="font-body-sm text-body-sm font-semibold text-charcoal-heading">{jmd(e.netPay)}</div>
                </div>
              ))}
              {(a?.topEarners ?? []).length === 0 && <p className="py-4 font-body-sm text-body-sm text-secondary">No pay advices yet.</p>}
            </div>
          </div>

          {/* Upcoming payroll */}
          <div className="glass-card flex flex-col rounded-2xl p-6" style={{ background: 'linear-gradient(140deg,#EEF2FF,#F5F3FF)' }}>
            <div className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Upcoming Payroll</div>
            <div className="mt-3 font-display text-3xl font-bold leading-none text-[#0F172A]">{monthYear(nextPeriod(a))}</div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-5xl font-bold text-[#4F46E5]">{daysLeftInMonth()}</span>
              <span className="font-body-sm text-body-sm text-secondary">days until month end</span>
            </div>
            <button className="btn-primary mt-auto w-full justify-center" onClick={() => router.push('/payroll/wizard')}>Run Payroll <ArrowUpRight size={15} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, color, label, value, sub, primary }: { icon: any; color: string; label: string; value: string; sub: string; primary?: boolean }) {
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">{label}</span>
        <span style={{ background: `${color}15`, color }} className="grid h-9 w-9 place-items-center rounded-lg"><Icon size={17} /></span>
      </div>
      <div className={`mt-3 font-display text-4xl font-bold leading-none lg:text-5xl ${primary ? '' : ''}`} style={{ color: primary ? INDIGO : '#0F172A' }}>{value}</div>
      <div className="mt-2 font-body-sm text-body-sm text-secondary">{sub}</div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between"><span className="font-body-sm text-body-sm text-secondary">{label}</span><span className="font-body-sm text-body-sm font-semibold text-charcoal-heading">{value}</span></div>;
}
function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return <span className="inline-flex items-center gap-1.5 font-label-sm text-label-sm text-secondary"><span className="inline-block h-0.5 w-5 rounded" style={{ background: dashed ? 'transparent' : color, borderTop: dashed ? `2px dashed ${color}` : undefined }} />{label}</span>;
}
