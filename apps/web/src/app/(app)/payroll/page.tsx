'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Calculator, ChevronRight, Send, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { jmd, monthYear, fmtDate } from '@/lib/payroll';
import { useFeatures } from '@/lib/feature-context';
import { PayrollEngine } from '@/components/payroll/PayrollEngine';

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
const SKY = '#0284C7';
const GRID = '#F1F5F9';

// Compact JMD for chart tooltip (dollars from cents).
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

// Tooltip showing Gross / Net / Tax for the hovered point (reads the full datum).
function PayrollChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as { Gross: number; Net: number; Taxes: number };
  const rows: [string, number, string][] = [['Gross', d.Gross, INDIGO], ['Net', d.Net, SLATE], ['Tax', d.Taxes, SKY]];
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg">
      <div className="mb-1 text-[12px] font-semibold text-slate-900">{label}</div>
      {rows.map(([name, value, color]) => (
        <div key={name} className="flex items-center gap-2 text-[12px]">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          <span className="text-slate-500">{name}:</span>
          <span className="font-semibold text-slate-900">{compact(value * 100)}</span>
        </div>
      ))}
    </div>
  );
}

// Local, data-driven fallback answer when no AI endpoint is available (demo mode).
function demoAnswer(q: string, a?: Analytics): string {
  if (!a) return 'Payroll data is still loading — try again in a moment.';
  const bp = (a.byPeriod ?? []).filter((p) => p.totalGross > 0);
  const last = bp[bp.length - 1];
  const prev = bp[bp.length - 2];
  const ql = q.toLowerCase();
  if (ql.includes('increase') || ql.includes('why')) {
    if (last && prev) {
      const change = pct(last.totalGross, prev.totalGross);
      const dir = change >= 0 ? 'up' : 'down';
      return `Gross payroll went from ${jmd(prev.totalGross)} in ${monLabel(prev.period)} to ${jmd(last.totalGross)} in ${monLabel(last.period)} — ${dir} ${Math.abs(change)}%. The main driver is the change in headcount (${prev.employeeCount} → ${last.employeeCount} employees) and their combined gross earnings for the period.`;
    }
    return `Year-to-date gross payroll is ${jmd(a.yearlyTotals.totalGross)} across ${a.yearlyTotals.activeEmployeeCount} employees. Add a second processed period to see period-over-period drivers.`;
  }
  if (ql.includes('overtime')) {
    return `Overtime isn't tracked as a separate line in payroll analytics yet — it's rolled into gross earnings. For ${last ? monLabel(last.period) : 'the latest period'}, gross was ${jmd(last?.totalGross ?? a.yearlyTotals.totalGross)}. Use the Overtime module (Workforce → Overtime) to break out approved overtime minutes and cost.`;
  }
  if (ql.includes('gross') && ql.includes('net')) {
    const g = a.yearlyTotals.totalGross, n = a.yearlyTotals.totalNet, t = a.yearlyTotals.totalTaxes;
    const ratio = g > 0 ? Math.round((n / g) * 100) : 0;
    return `Year-to-date, gross is ${jmd(g)} and net is ${jmd(n)} — employees take home about ${ratio}% of gross. The ${jmd(t)} difference is statutory deductions (NIS, NHT, Education Tax, PAYE). The gap tracks gross closely month to month.`;
  }
  return `Year-to-date: gross ${jmd(a.yearlyTotals.totalGross)}, net ${jmd(a.yearlyTotals.totalNet)}, taxes ${jmd(a.yearlyTotals.totalTaxes)} across ${a.yearlyTotals.activeEmployeeCount} employees. Ask about payroll increases, overtime costs, or the gross-vs-net trend.`;
}

const CHIPS = ['Why did payroll increase?', 'Show overtime costs this month', 'Compare gross vs net trend'];

export default function PayrollDashboard() {
  const router = useRouter();
  const { isEnabled } = useFeatures();
  const wf = isEnabled('WORKFORCE_MANAGEMENT');
  const [tab, setTab] = useState<'overview' | 'engine'>('overview');
  const [mounted, setMounted] = useState(false);
  const [heroGran, setHeroGran] = useState<'Month' | 'Quarter' | 'Year'>('Month');
  const [chartGran, setChartGran] = useState<'Week' | 'Month' | 'Quarter' | 'Year'>('Month');
  useEffect(() => setMounted(true), []);
  const year = new Date().getFullYear();

  const { data: a } = useQuery({
    queryKey: ['payroll-analytics', year],
    queryFn: () => api.get<Analytics>('/payroll/analytics', { params: { year } }).then((r) => r.data),
  });

  // Hero totals reflect the selected period toggle.
  const hero = useMemo(() => {
    const bp = (a?.byPeriod ?? []).filter((p) => p.totalGross > 0);
    if (heroGran === 'Year' || bp.length === 0) {
      const yt = a?.yearlyTotals;
      return { gross: yt?.totalGross ?? 0, net: yt?.totalNet ?? 0, tax: yt?.totalTaxes ?? 0, employees: yt?.activeEmployeeCount ?? 0 };
    }
    const slice = heroGran === 'Quarter' ? bp.slice(-3) : bp.slice(-1);
    return {
      gross: slice.reduce((s, p) => s + p.totalGross, 0),
      net: slice.reduce((s, p) => s + p.totalNet, 0),
      tax: slice.reduce((s, p) => s + p.totalTaxes, 0),
      employees: slice.reduce((m, p) => Math.max(m, p.employeeCount), 0),
    };
  }, [a, heroGran]);

  const chartData = useMemo(() => {
    const bp = a?.byPeriod ?? [];
    const pt = (label: string, g: number, n: number, t: number) => ({ label, Gross: g / 100, Net: n / 100, Taxes: t / 100 });
    if (chartGran === 'Week') {
      const withData = bp.filter((p) => p.totalGross > 0);
      const m = withData[withData.length - 1];
      if (!m) return [];
      // Latest month split evenly across its weeks (finest real granularity is monthly).
      return [1, 2, 3, 4].map((w) => pt(`W${w}`, m.totalGross / 4, m.totalNet / 4, m.totalTaxes / 4));
    }
    if (chartGran === 'Month') return bp.map((p) => pt(monLabel(p.period), p.totalGross, p.totalNet, p.totalTaxes));
    if (chartGran === 'Quarter') return [0, 1, 2, 3].map((i) => { const s = bp.slice(i * 3, i * 3 + 3); return pt(`Q${i + 1}`, s.reduce((x, y) => x + y.totalGross, 0), s.reduce((x, y) => x + y.totalNet, 0), s.reduce((x, y) => x + y.totalTaxes, 0)); });
    return [pt(String(year), bp.reduce((x, y) => x + y.totalGross, 0), bp.reduce((x, y) => x + y.totalNet, 0), bp.reduce((x, y) => x + y.totalTaxes, 0))];
  }, [a, chartGran, year]);

  const taxRows = a ? [
    { key: 'nis', label: 'NIS', cur: a.taxBreakdown.nis, prev: a.taxBreakdownPrev.nis },
    { key: 'nht', label: 'NHT', cur: a.taxBreakdown.nht, prev: a.taxBreakdownPrev.nht },
    { key: 'edtax', label: 'Education Tax', cur: a.taxBreakdown.edTax, prev: a.taxBreakdownPrev.edTax },
    { key: 'paye', label: 'PAYE', cur: a.taxBreakdown.paye, prev: a.taxBreakdownPrev.paye },
  ] : [];

  // ── Ask Payroll AI (posts to /ai/chat if present, else a local demo answer) ──
  const [aiInput, setAiInput] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const aiContext = a
    ? `Payroll ${year}: gross ${jmd(a.yearlyTotals.totalGross)}, net ${jmd(a.yearlyTotals.totalNet)}, taxes ${jmd(a.yearlyTotals.totalTaxes)}, ${a.yearlyTotals.activeEmployeeCount} employees. Monthly gross: ${(a.byPeriod ?? []).filter((p) => p.totalGross > 0).map((p) => `${monLabel(p.period)} ${jmd(p.totalGross)}`).join(', ')}.`
    : '';
  const ask = useMutation({
    mutationFn: async (q: string): Promise<string> => {
      try {
        const r = await api.post('/ai/chat', { message: q, context: aiContext });
        return r.data?.reply ?? r.data?.message ?? r.data?.text ?? demoAnswer(q, a);
      } catch {
        return demoAnswer(q, a);
      }
    },
    onSuccess: (text) => setAiResponse(text),
  });
  const submitAsk = (q: string) => { const t = q.trim(); if (!t || ask.isPending) return; setAiInput(t); ask.mutate(t); };

  return (
    <div className="min-h-full" style={{ background: '#F8FAFC' }}>
      <div className="py-8">
        {/* Top bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-charcoal-heading">Payroll</h1>
          <button className="btn-primary !h-12 !px-6 !text-[15px]" onClick={() => router.push('/payroll/wizard')}><Calculator size={18} /> Run Salary Payroll</button>
        </div>

        {wf && (
          <div className="mb-6 flex gap-1 border-b border-slate-200">
            {(['overview', 'engine'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${tab === t ? 'border-primary text-primary' : 'border-transparent text-secondary hover:text-on-surface'}`}>{t === 'overview' ? 'Overview' : 'Payroll Engine'}</button>
            ))}
          </div>
        )}

        {wf && tab === 'engine' ? <PayrollEngine /> : (
        <>
        {/* ── Hero: dominant Total Gross Payroll ── */}
        <div className="glass-card mb-5 rounded-2xl px-6 py-8">
          <div className="flex justify-end">
            <div className="flex rounded-xl border border-outline-variant/40 p-0.5">
              {(['Month', 'Quarter', 'Year'] as const).map((g) => (
                <button key={g} onClick={() => setHeroGran(g)} className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${heroGran === g ? 'bg-primary-fixed text-primary' : 'text-secondary hover:bg-surface-container-low'}`}>{g}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-center py-4 text-center">
            <div className="text-6xl font-bold leading-none text-gray-900">{jmd(hero.gross)}</div>
            <div className="mt-3 text-sm uppercase tracking-wider text-gray-500">Total Gross Payroll</div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-gray-500">
              <span>Net <span className="font-semibold text-gray-700">{jmd(hero.net)}</span></span>
              <span className="text-gray-300">·</span>
              <span>Tax <span className="font-semibold text-gray-700">{jmd(hero.tax)}</span></span>
              <span className="text-gray-300">·</span>
              <span>Employees <span className="font-semibold text-gray-700">{hero.employees}</span></span>
            </div>
          </div>
        </div>

        {/* ── Consolidated payroll chart (gross bars + net line) ── */}
        <div className="glass-card mb-5 rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Payroll Trend</div>
              <div className="mt-1 font-body-sm text-body-sm text-secondary">Gross vs Net · {year}</div>
            </div>
            <div className="flex gap-1 rounded-full bg-surface-container-low/60 p-1">
              {(['Week', 'Month', 'Quarter', 'Year'] as const).map((g) => (
                <button key={g} onClick={() => setChartGran(g)} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${chartGran === g ? 'bg-primary text-white shadow-sm' : 'text-secondary hover:text-primary'}`}>{g}</button>
              ))}
            </div>
          </div>
          <div className="mt-4 h-64 w-full">
            {mounted && (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: SLATE, fontSize: 12 }} />
                  <YAxis tickFormatter={axisFmt} tickLine={false} axisLine={false} tick={{ fill: SLATE, fontSize: 12 }} width={48} />
                  <Tooltip content={<PayrollChartTip />} cursor={{ fill: 'rgba(79,70,229,0.06)' }} />
                  <Bar dataKey="Gross" fill={INDIGO} radius={[4, 4, 0, 0]} maxBarSize={38} isAnimationActive={false} />
                  <Line type="monotone" dataKey="Net" stroke={INDIGO} strokeWidth={2.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-3 flex items-center gap-5">
            <span className="inline-flex items-center gap-1.5 font-label-sm text-label-sm text-secondary"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: INDIGO }} />Gross payroll</span>
            <span className="inline-flex items-center gap-1.5 font-label-sm text-label-sm text-secondary"><span className="inline-block h-0.5 w-5" style={{ borderTop: `2px dashed ${INDIGO}` }} />Net payroll</span>
          </div>
        </div>

        {/* ── Runs table + Tax breakdown ── */}
        <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
          {/* Payroll runs table */}
          <div className="glass-card flex flex-col overflow-hidden rounded-2xl lg:col-span-3">
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

        {/* Bottom row: 3 col */}
        <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
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

        {/* ── Ask Payroll AI ── */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: '#EEF2FF', color: INDIGO }}><Sparkles size={20} /></span>
            <div>
              <div className="font-body-md text-body-md font-semibold text-charcoal-heading">Ask Payroll AI</div>
              <div className="font-body-sm text-body-sm text-secondary">Get instant insights about your payroll data</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <button key={c} onClick={() => submitAsk(c)} disabled={ask.isPending} className="rounded-full border border-outline-variant/50 bg-white px-3.5 py-1.5 font-label-sm text-label-sm text-on-surface transition-colors hover:border-primary hover:text-primary disabled:opacity-50">{c}</button>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitAsk(aiInput); }}
              placeholder="Ask anything about payroll..."
              className="h-12 flex-1 rounded-xl border border-outline-variant/40 bg-white px-4 font-body-sm text-body-sm text-on-surface outline-none focus:border-primary"
            />
            <button onClick={() => submitAsk(aiInput)} disabled={ask.isPending || !aiInput.trim()} className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary text-white transition-colors hover:bg-primary-hover disabled:opacity-50" aria-label="Send">
              <Send size={18} />
            </button>
          </div>

          {(ask.isPending || aiResponse) && (
            <div className="mt-4 rounded-xl px-4 py-3 font-body-sm text-body-sm leading-relaxed text-on-surface" style={{ background: '#EEF2FF' }}>
              {ask.isPending ? <span className="text-secondary">Thinking…</span> : aiResponse}
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between"><span className="font-body-sm text-body-sm text-secondary">{label}</span><span className="font-body-sm text-body-sm font-semibold text-charcoal-heading">{value}</span></div>;
}
