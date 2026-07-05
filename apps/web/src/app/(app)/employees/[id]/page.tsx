'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Award, Banknote, CalendarDays, Clock, FileClock, LayoutGrid, Mail } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/feature-context';
import { fmtDate, fmtTime, SHIFT_CHIP } from '@/lib/workforce';

const CARD = 'glass-card rounded-2xl';
const fmtJMD = (cents?: number) => 'J$' + Math.round((cents ?? 0) / 100).toLocaleString('en-US');
const initials = (s: string) => (s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const EVENT_LABEL: Record<string, string> = { ClockIn: 'Clock In', ClockOut: 'Clock Out', BreakStart: 'Break Start', BreakEnd: 'Break End', LunchStart: 'Lunch Start', LunchEnd: 'Lunch End' };
const EVENT_TINT: Record<string, string> = { ClockIn: 'text-green-600', ClockOut: 'text-red-600', BreakStart: 'text-violet-600', BreakEnd: 'text-violet-600', LunchStart: 'text-slate-500', LunchEnd: 'text-slate-500' };
const TS_STATUS: Record<string, { bg: string; fg: string }> = {
  Draft: { bg: '#F1F5F9', fg: '#64748B' }, Submitted: { bg: '#E0F2FE', fg: '#0284C7' }, UnderReview: { bg: '#EEF2FF', fg: '#4F46E5' },
  Approved: { bg: '#DCFCE7', fg: '#16A34A' }, Rejected: { bg: '#FEE2E2', fg: '#DC2626' }, PayrollLocked: { bg: '#F1F5F9', fg: '#334155' },
};

const mondayOf = (d: Date) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; };
const iso = (d: Date) => d.toISOString().slice(0, 10);

function Overview({ e }: { e: any }) {
  const rows: [string, React.ReactNode][] = [
    ['Employee #', <span className="font-mono">{e.employeeNo}</span>],
    ['Job title', e.jobTitle],
    ['Employment type', e.employmentType],
    ['Department', e.department?.name ?? '—'],
    ['Start date', fmtDate(e.startDate)],
    ['Status', e.isActive ? <span className="font-semibold text-green-600">Active</span> : <span className="text-slate-500">Inactive</span>],
    ['Monthly salary', <span className="font-semibold text-charcoal-heading">{fmtJMD(e.salary)}</span>],
  ];
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className={`${CARD} p-6`}>
        <div className="mb-4 font-label-sm text-label-sm uppercase tracking-wider text-secondary">Employment</div>
        <dl className="divide-y divide-outline-variant/30">
          {rows.map(([k, v]) => <div key={k} className="flex items-center justify-between py-2.5 text-sm"><dt className="text-secondary">{k}</dt><dd className="text-on-surface">{v}</dd></div>)}
        </dl>
      </div>
      <div className={`${CARD} p-6`}>
        <div className="mb-4 font-label-sm text-label-sm uppercase tracking-wider text-secondary">Contact & Banking</div>
        <dl className="divide-y divide-outline-variant/30">
          {([['Email', e.user?.email ?? '—'], ['Address', e.address ?? '—'], ['Emergency', e.emergencyContactName ?? '—'], ['Emergency phone', e.emergencyContactPhone ?? '—'], ['Bank', e.bankName ?? '—'], ['Account #', e.bankAccount ?? '—'], ['TRN', e.trn ?? '—']] as [string, string][]).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-2.5 text-sm"><dt className="text-secondary">{k}</dt><dd className="text-on-surface">{v}</dd></div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function ClockHistoryTab({ id }: { id: string }) {
  const { data: events = [] } = useQuery({ queryKey: ['clock-history', id], queryFn: () => api.get(`/workforce/clock/history/${id}`).then((r) => r.data) });
  const TH = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400';
  const CELL = 'px-4 py-3 align-middle text-sm';
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-outline-variant/40"><th className={TH}>Date</th><th className={TH}>Time</th><th className={TH}>Event</th><th className={TH}>Method</th><th className={TH}>Notes</th></tr></thead>
          <tbody>
            {events.length === 0 && <tr><td colSpan={5} className="px-4 py-14 text-center text-sm text-slate-400">No clock events in the last 30 days.</td></tr>}
            {events.map((ev: any) => (
              <tr key={ev.id} className="border-b border-surface-container-low hover:bg-surface-container-low/50">
                <td className={`${CELL} text-slate-600`}>{fmtDate(ev.timestamp)}</td>
                <td className={`${CELL} font-mono text-charcoal-heading`}>{fmtTime(ev.timestamp)}</td>
                <td className={`${CELL} font-semibold ${EVENT_TINT[ev.type] ?? 'text-slate-600'}`}>{EVENT_LABEL[ev.type] ?? ev.type}</td>
                <td className={`${CELL} text-slate-500`}>{ev.method ?? '—'}{ev.editedAt && <span className="ml-1.5 text-[10px] text-slate-400">(edited)</span>}</td>
                <td className={`${CELL} text-slate-500`}>{ev.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TimesheetsTab({ id }: { id: string }) {
  const { data: rows = [] } = useQuery({ queryKey: ['timesheets', id], queryFn: () => api.get('/workforce/timesheets', { params: { employeeId: id } }).then((r) => r.data) });
  const TH = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400';
  const CELL = 'px-4 py-3 align-middle text-sm';
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-outline-variant/40"><th className={TH}>Period</th><th className={`${TH} text-right`}>Regular</th><th className={`${TH} text-right`}>OT</th><th className={`${TH} text-right`}>Total</th><th className={TH}>Status</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-14 text-center text-sm text-slate-400">No timesheets for this employee yet.</td></tr>}
            {rows.map((r: any) => {
              const s = TS_STATUS[r.status] ?? TS_STATUS.Draft;
              return (
                <tr key={r.id} className="border-b border-surface-container-low hover:bg-surface-container-low/50">
                  <td className={`${CELL}`}><Link href={`/workforce/timesheets/${r.id}`} className="font-medium text-primary hover:underline">{fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)}</Link></td>
                  <td className={`${CELL} text-right`}>{r.regularHours}</td>
                  <td className={`${CELL} text-right`}>{r.overtimeHours}</td>
                  <td className={`${CELL} text-right font-semibold text-charcoal-heading`}>{r.totalHours}h</td>
                  <td className={CELL}><span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: s.bg, color: s.fg }}>{r.status.toUpperCase()}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScheduleTab({ id }: { id: string }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const wk = iso(weekStart);
  const { data: schedule } = useQuery({ queryKey: ['schedule', wk], queryFn: () => api.get('/workforce/schedule', { params: { weekStart: wk } }).then((r) => r.data) });
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => iso(new Date(+weekStart + i * 86_400_000))), [weekStart]);
  const mine = useMemo(() => {
    const m = new Map<string, any>();
    for (const [date, list] of Object.entries((schedule?.dates ?? {}) as Record<string, any[]>)) {
      const a = list.find((x) => x.employee.id === id);
      if (a) m.set(date, a);
    }
    return m;
  }, [schedule, id]);
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return (
    <div className={`${CARD} p-5`}>
      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => setWeekStart(new Date(+weekStart - 7 * 86_400_000))} className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-500 hover:bg-slate-50">‹</button>
        <span className="text-sm font-semibold text-charcoal-heading">Week of {fmtDate(days[0])}</span>
        <button onClick={() => setWeekStart(new Date(+weekStart + 7 * 86_400_000))} className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-500 hover:bg-slate-50">›</button>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((d, i) => {
          const a = mine.get(d);
          return (
            <div key={d} className="rounded-xl border border-slate-100 p-2 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{DOW[i]}</div>
              <div className="mb-2 text-xs text-slate-300">{new Date(d).getDate()}</div>
              {a ? <span className={`inline-block rounded-lg px-2 py-1 text-[11px] font-semibold ${SHIFT_CHIP[a.shift.type] ?? 'bg-slate-100 text-slate-700'}`}>{a.shift.name}</span> : <span className="text-xs text-slate-300">Off</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const scoreColor = (v: number) => (v >= 80 ? '#16A34A' : v >= 60 ? '#A16207' : '#DC2626');

function PerformanceTab({ id }: { id: string }) {
  const { data: composite } = useQuery({ queryKey: ['perf-score', id], queryFn: () => api.get(`/workforce/performance/score/${id}`).then((r) => r.data) });
  const { data: reviews = [] } = useQuery({ queryKey: ['perf-reviews', id], queryFn: () => api.get('/workforce/performance/reviews', { params: { employeeId: id } }).then((r) => r.data) });
  const { data: goals = [] } = useQuery({ queryKey: ['perf-goals', id, 'active'], queryFn: () => api.get('/workforce/performance/goals', { params: { employeeId: id, status: 'ACTIVE' } }).then((r) => r.data) });
  const lastReview = reviews[0];
  const B = composite?.breakdown;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className={`${CARD} p-6`}>
        <div className="mb-4 flex items-center justify-between">
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Composite Score</span>
          <span className="text-4xl font-bold" style={{ color: scoreColor(composite?.score ?? 0) }}>{composite?.score ?? 0}</span>
        </div>
        <div className="flex flex-col gap-3">
          {B && ([['Attendance', B.attendance, '25%'], ['Productivity', B.productivity, '35%'], ['Quality', B.quality, '25%'], ['Review', B.review, '15%']] as const).map(([label, b, w]) => (
            <div key={label}>
              <div className="mb-1 flex items-center justify-between text-xs"><span className="text-slate-500">{label} <span className="text-slate-300">· {w}</span></span><span className="font-semibold" style={{ color: scoreColor(b.score) }}>{b.score}</span></div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${Math.min(100, b.score)}%`, background: scoreColor(b.score) }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className={`${CARD} p-6`}>
          <div className="mb-3 font-label-sm text-label-sm uppercase tracking-wider text-secondary">Last Review</div>
          {lastReview ? (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-charcoal-heading">{lastReview.period}</span>
                <span className="text-2xl font-bold" style={{ color: scoreColor(lastReview.overallScore) }}>{lastReview.overallScore}</span>
              </div>
              <div className="mt-2 text-xs text-slate-500">Attendance {lastReview.attendanceScore} · Productivity {lastReview.productivityScore} · Quality {lastReview.qualityScore}</div>
              {lastReview.comments && <p className="mt-2 text-sm text-on-surface">{lastReview.comments}</p>}
            </div>
          ) : <p className="text-sm text-slate-400">No reviews yet.</p>}
        </div>

        <div className={`${CARD} p-6`}>
          <div className="mb-3 font-label-sm text-label-sm uppercase tracking-wider text-secondary">Active Goals</div>
          {goals.length === 0 ? <p className="text-sm text-slate-400">No active goals.</p> : (
            <div className="flex flex-col gap-3">
              {goals.map((g: any) => (
                <div key={g.id}>
                  <div className="mb-1 flex items-center justify-between text-sm"><span className="font-medium text-charcoal-heading">{g.title}</span><span className="text-xs text-slate-400">{g.progress}%</span></div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${g.progress}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmployeeDetail({ id }: { id: string }) {
  const { isEnabled } = useFeatures();
  const wf = isEnabled('WORKFORCE_MANAGEMENT');
  const [tab, setTab] = useState('overview');
  const { data: e, isLoading } = useQuery({ queryKey: ['employee', id], queryFn: () => api.get(`/employees/${id}`).then((r) => r.data) });

  const tabs = [
    { key: 'overview', label: 'Overview', icon: LayoutGrid, show: true },
    { key: 'clock', label: 'Clock History', icon: Clock, show: wf },
    { key: 'timesheets', label: 'Timesheets', icon: FileClock, show: wf },
    { key: 'schedule', label: 'Schedule', icon: CalendarDays, show: wf },
    { key: 'performance', label: 'Performance', icon: Award, show: wf },
  ].filter((t) => t.show);

  if (isLoading || !e) return <div className="p-8 text-sm text-secondary">Loading…</div>;
  const name = `${e.user.firstName} ${e.user.lastName}`;

  return (
    <div className="min-h-full" style={{ background: '#F8FAFC' }}>
      <div className="py-8">
        <Link href="/employees" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"><ArrowLeft size={15} /> Employees</Link>

        <div className={`${CARD} mb-6 flex flex-wrap items-center gap-4 p-6`}>
          <span style={{ background: '#EEF2FF', color: '#4F46E5' }} className="grid h-16 w-16 shrink-0 place-items-center rounded-full text-xl font-bold">{initials(name)}</span>
          <div className="min-w-0 flex-1">
            <h1 className="font-headline-lg text-headline-lg text-charcoal-heading">{name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-secondary">
              <span>{e.jobTitle}</span><span>·</span><span>{e.department?.name ?? 'Unassigned'}</span>
              {e.user?.email && <><span>·</span><span className="inline-flex items-center gap-1"><Mail size={13} /> {e.user.email}</span></>}
            </div>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-1 border-b border-outline-variant/40">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${tab === t.key ? 'border-primary text-primary' : 'border-transparent text-secondary hover:text-on-surface'}`}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && <Overview e={e} />}
        {tab === 'clock' && wf && <ClockHistoryTab id={id} />}
        {tab === 'timesheets' && wf && <TimesheetsTab id={id} />}
        {tab === 'schedule' && wf && <ScheduleTab id={id} />}
        {tab === 'performance' && wf && <PerformanceTab id={id} />}
      </div>
    </div>
  );
}

export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <EmployeeDetail id={id} />;
}
