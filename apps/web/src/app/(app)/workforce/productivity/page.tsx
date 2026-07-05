'use client';

import { useCallback, useMemo, useState } from 'react';
import { Activity, ChevronDown, ChevronRight, FlaskConical, Gauge, Minus, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FeatureGate } from '@/components/FeatureGate';
import { useEmployees, empName, fmtHours } from '@/lib/workforce';
import { useInfiniteScroll, clientPage } from '@/hooks/useInfiniteScroll';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';

const CARD = 'rounded-xl border border-slate-100 bg-white shadow-sm';
// Stable empty fallback so the infinite-scroll fetchFn identity is stable while loading.
const NO_ROWS: any[] = [];
const TH = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap';
const CELL = 'px-4 py-3 align-middle text-sm';
const iso = (d: Date) => d.toISOString().slice(0, 10);
const initials = (s: string) => (s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// Rank medal colours — explicitly authorised earth tones for rank badges only.
const MEDAL: Record<number, string> = { 1: '#CA8A04', 2: '#6B7280', 3: '#92400E' };

function Ring({ value }: { value: number }) {
  const r = 26, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0">
      <circle cx="32" cy="32" r={r} fill="none" stroke="#EEF2F7" strokeWidth="7" />
      <circle cx="32" cy="32" r={r} fill="none" stroke="#4F46E5" strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 32 32)" />
      <text x="32" y="36" textAnchor="middle" className="fill-charcoal-heading" style={{ fontSize: 15, fontWeight: 700 }}>{value}</text>
    </svg>
  );
}

function Trend({ t }: { t: { direction: string; changePct: number } }) {
  if (t.direction === 'up') return <span className="inline-flex items-center gap-1 text-sm font-semibold text-green-600"><TrendingUp size={15} /> {Math.abs(t.changePct)}%</span>;
  if (t.direction === 'down') return <span className="inline-flex items-center gap-1 text-sm font-semibold text-red-600"><TrendingDown size={15} /> {Math.abs(t.changePct)}%</span>;
  return <span className="inline-flex items-center gap-1 text-sm text-slate-400"><Minus size={15} /> 0%</span>;
}

// ── Log Metric (manager, collapsible) ──────────────────────────────────────────
function LogMetric() {
  const qc = useQueryClient();
  const { data: employees = [] } = useEmployees();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState(iso(new Date()));
  const [specimensProcessed, setSpec] = useState('0');
  const [reportsCompleted, setReports] = useState('0');
  const [averageTATMinutes, setTat] = useState('0');
  const [qualityScore, setQuality] = useState(80);
  const [msg, setMsg] = useState('');

  const save = useMutation({
    mutationFn: () => api.post('/workforce/productivity/metrics', {
      employeeId, date,
      specimensProcessed: Number(specimensProcessed) || 0,
      reportsCompleted: Number(reportsCompleted) || 0,
      averageTATMinutes: Number(averageTATMinutes) || 0,
      qualityScore,
    }),
    onSuccess: () => {
      setMsg('Metric saved.');
      qc.invalidateQueries({ queryKey: ['prod-summary'] });
      qc.invalidateQueries({ queryKey: ['prod-leaderboard'] });
      qc.invalidateQueries({ queryKey: ['prod-benchmarks'] });
      setTimeout(() => setMsg(''), 2500);
    },
    onError: (e: any) => setMsg(e?.response?.data?.message ?? 'Failed to save'),
  });

  return (
    <div className={`${CARD} overflow-hidden`}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-slate-50">
        <span className="flex items-center gap-2 text-base font-semibold text-charcoal-heading"><Plus size={17} className="text-slate-400" /> Log Daily Metric</span>
        {open ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
      </button>
      {open && (
        <div className="border-t border-slate-100 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Employee</label>
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary">
                <option value="">Select employee…</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{empName(e)}</option>)}
              </select>
            </div>
            <div><label className="mb-1 block text-sm font-medium text-slate-600">Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary" /></div>
            <div><label className="mb-1 block text-sm font-medium text-slate-600">Specimens Processed</label><input type="number" min="0" value={specimensProcessed} onChange={(e) => setSpec(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary" /></div>
            <div><label className="mb-1 block text-sm font-medium text-slate-600">Reports Completed</label><input type="number" min="0" value={reportsCompleted} onChange={(e) => setReports(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary" /></div>
            <div><label className="mb-1 block text-sm font-medium text-slate-600">Avg TAT (minutes)</label><input type="number" min="0" value={averageTATMinutes} onChange={(e) => setTat(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-primary" /></div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Quality Score <span className="font-semibold text-primary">{qualityScore}</span></label>
              <input type="range" min="0" max="100" value={qualityScore} onChange={(e) => setQuality(Number(e.target.value))} className="mt-3 w-full accent-primary" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-3">
            {msg && <span className="text-sm text-secondary">{msg}</span>}
            <button onClick={() => save.mutate()} disabled={!employeeId || save.isPending} className="btn-primary" style={{ opacity: !employeeId || save.isPending ? 0.5 : 1 }}>{save.isPending ? 'Saving…' : 'Save Metric'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductivityPage() {
  const { can } = useAuth();
  const isManager = can('employee:change');
  const [start, setStart] = useState(iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [end, setEnd] = useState(iso(new Date()));

  const { data: benchmarks } = useQuery({ queryKey: ['prod-benchmarks'], queryFn: () => api.get('/workforce/productivity/benchmarks').then((r) => r.data) });
  const { data: leaders = [] } = useQuery({ queryKey: ['prod-leaderboard'], queryFn: () => api.get('/workforce/productivity/leaderboard').then((r) => r.data) });
  const summaryParams = useMemo(() => ({ startDate: start, endDate: end }), [start, end]);
  const { data: summaryData } = useQuery({ queryKey: ['prod-summary', summaryParams], queryFn: () => api.get('/workforce/productivity/summary', { params: summaryParams }).then((r) => r.data), enabled: !!start && !!end });
  const summary = (summaryData ?? NO_ROWS) as any[];
  const fetchFn = useCallback((p: number, ps: number) => Promise.resolve(clientPage(summary, p, ps)), [summary]);
  const { items: pageRows, loading, initialLoading, hasMore, sentinelRef } = useInfiniteScroll<any>({ fetchFn, pageSize: 20 });

  return (
    <div className="w-full">
      <div className="mb-5">
        <h1 className="text-[30px] font-bold leading-tight tracking-tight text-charcoal-heading">Productivity Analytics</h1>
        <p className="mt-1 text-sm text-secondary">Throughput, turnaround and quality across the team.</p>
      </div>

      {/* Benchmarks */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={`${CARD} flex items-center gap-4 p-5`}>
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><FlaskConical size={20} /></span>
          <div><div className="text-3xl font-bold leading-none text-charcoal-heading">{benchmarks?.avgSpecimensPerDay ?? 0}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Avg Specimens / Day</div></div>
        </div>
        <div className={`${CARD} flex items-center gap-4 p-5`}>
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Activity size={20} /></span>
          <div><div className="text-3xl font-bold leading-none text-charcoal-heading">{fmtHours(benchmarks?.avgTATMinutes)}h</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Avg Turnaround</div></div>
        </div>
        <div className={`${CARD} flex items-center gap-4 p-5`}>
          <Ring value={benchmarks?.avgQualityScore ?? 0} />
          <div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Avg Quality Score</div><div className="mt-1 flex items-center gap-1 text-sm text-slate-500"><Gauge size={14} /> out of 100</div></div>
        </div>
      </div>

      <div className="flex flex-col gap-6 xl:flex-row">
        {/* Leaderboard */}
        <div className="xl:w-[360px]">
          <div className={`${CARD} p-5`}>
            <div className="mb-4 text-base font-semibold text-charcoal-heading">Leaderboard <span className="text-xs font-normal text-slate-400">· this month</span></div>
            {leaders.length === 0 && <div className="py-8 text-center text-sm text-slate-400">No metrics logged this month.</div>}
            <div className="flex flex-col gap-3">
              {leaders.map((l: any) => (
                <div key={l.employeeId} className="flex items-center gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: MEDAL[l.rank] ?? '#CBD5E1' }}>{l.rank}</span>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-50 text-[11px] font-bold text-indigo-600">{initials(l.name)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-charcoal-heading">{l.name}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, l.qualityScore)}%` }} /></div>
                      <span className="text-[10px] text-slate-400">Q{l.qualityScore}</span>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-charcoal-heading">{l.specimensProcessed}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Summary + Log */}
        <div className="min-w-0 flex-1 space-y-6">
          <div className={`${CARD} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <span className="text-base font-semibold text-charcoal-heading">Summary</span>
              <div className="flex items-center gap-2">
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2.5 text-sm text-slate-600 outline-none focus:border-primary" />
                <span className="text-sm text-slate-400">to</span>
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2.5 text-sm text-slate-600 outline-none focus:border-primary" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead><tr className="border-y border-slate-100"><th className={TH}>Employee</th><th className={`${TH} text-right`}>Specimens/Day</th><th className={`${TH} text-right`}>Avg TAT</th><th className={`${TH} text-right`}>Quality</th><th className={`${TH} text-right`}>Reports</th><th className={`${TH} text-right`}>Trend</th></tr></thead>
                <tbody>
                  {!initialLoading && summary.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">No metrics for this range.</td></tr>}
                  {pageRows.map((r: any) => (
                    <tr key={r.employeeId} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className={`${CELL} font-medium text-charcoal-heading`}>{r.name}</td>
                      <td className={`${CELL} text-right`}>{r.avgSpecimensPerDay}</td>
                      <td className={`${CELL} text-right text-slate-600`}>{fmtHours(r.avgTATMinutes)}h</td>
                      <td className={`${CELL} text-right text-slate-600`}>{r.avgQualityScore}</td>
                      <td className={`${CELL} text-right text-slate-600`}>{r.totalReports}</td>
                      <td className={`${CELL} text-right`}><Trend t={r.trend} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pageRows.length > 0 && <ScrollSentinel ref={sentinelRef} loading={loading && !initialLoading} hasMore={hasMore} />}
          </div>

          {isManager && <LogMetric />}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <FeatureGate feature="WORKFORCE_MANAGEMENT" fallback={<div className="p-8 text-sm text-secondary">Workforce Management is not enabled for this lab.</div>}>
      <ProductivityPage />
    </FeatureGate>
  );
}
