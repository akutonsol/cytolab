'use client';

import { AlertTriangle, CalendarOff, Clock, TimerReset, UserCheck, UserX } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FeatureGate } from '@/components/FeatureGate';
import { ClockWidget } from '@/components/workforce/ClockWidget';
import { ATT_STATUS, SHIFT_CHIP, fmtTime } from '@/lib/workforce';

const CARD = 'rounded-xl border border-slate-100 bg-white shadow-sm';

function Kpi({ icon, iconClass, label, value, sub, subColor }: { icon: React.ReactNode; iconClass: string; label: string; value: React.ReactNode; sub?: string; subColor?: string }) {
  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-center gap-2">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${iconClass}`}>{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      </div>
      <div className="mt-2 text-4xl font-bold leading-none text-charcoal-heading">{value}</div>
      {sub && <div className="mt-1 text-xs font-semibold" style={{ color: subColor ?? '#94A3B8' }}>{sub}</div>}
    </div>
  );
}

function AttStatusBadge({ status }: { status: string }) {
  const s = ATT_STATUS[status] ?? ATT_STATUS.NotStarted;
  const label = status === 'NotStarted' ? 'Not Started' : status;
  return <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: s.bg, color: s.fg }}>{label}</span>;
}

function Dashboard() {
  const { data: today } = useQuery({ queryKey: ['attendance-today'], queryFn: () => api.get('/workforce/attendance/today').then((r) => r.data), refetchInterval: 60_000 });
  const { data: roster = [] } = useQuery({ queryKey: ['attendance-roster'], queryFn: () => api.get('/workforce/attendance/roster').then((r) => r.data), refetchInterval: 60_000 });

  const present = today?.present ?? 0, total = today?.totalActive ?? 0;
  const late = roster.filter((r: any) => r.status === 'Late');
  const missing = roster.filter((r: any) => r.isClockedIn); // clocked in, no clock-out yet
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const TH = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap';
  const CELL = 'px-4 py-3 align-middle text-sm';

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-[30px] font-bold leading-tight tracking-tight text-charcoal-heading">Workforce Management</h1>
        <p className="mt-1 text-sm text-secondary">Time clock, attendance and team roster.</p>
      </div>

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Kpi icon={<UserCheck size={20} />} iconClass="bg-green-50 text-green-600" label="Present Today" value={today?.present ?? 0} sub={`${pct(present)}% of team`} subColor="#16A34A" />
        <Kpi icon={<UserX size={20} />} iconClass="bg-red-50 text-red-600" label="Absent" value={today?.absent ?? 0} sub="not clocked in" subColor="#DC2626" />
        <Kpi icon={<AlertTriangle size={20} />} iconClass="bg-yellow-50 text-yellow-600" label="Late" value={today?.late ?? 0} sub="after grace" subColor="#A16207" />
        <Kpi icon={<CalendarOff size={20} />} iconClass="bg-slate-100 text-slate-500" label="On Leave" value={today?.onLeave ?? 0} sub="scheduled off" subColor="#64748B" />
        <Kpi icon={<TimerReset size={20} />} iconClass="bg-indigo-50 text-indigo-600" label="Overtime Hours" value={today?.overtime ?? 0} sub="beyond 8h/day" subColor="#4F46E5" />
      </div>

      {/* Clock widget */}
      <div className="mb-6"><ClockWidget /></div>

      {/* Team attendance */}
      <div className="flex flex-col gap-6 xl:flex-row">
        {/* Roster */}
        <div className="min-w-0 flex-1">
          <div className={`${CARD} p-0`}>
            <div className="flex items-center justify-between px-5 pt-5"><span className="text-base font-semibold text-charcoal-heading">Today&apos;s Roster</span><span className="text-xs text-slate-400">{roster.length} staff</span></div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-y border-slate-100">
                    <th className={TH}>Employee</th><th className={TH}>Department</th><th className={TH}>Shift</th><th className={TH}>Status</th><th className={TH}>Clock In</th><th className={TH}>Clock Out</th><th className={`${TH} text-right`}>Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.length === 0 && <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-400">No staff found.</td></tr>}
                  {roster.map((r: any) => (
                    <tr key={r.employeeId} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className={`${CELL} font-medium text-charcoal-heading`}>{r.name}</td>
                      <td className={`${CELL} text-slate-600`}>{r.department ?? '—'}</td>
                      <td className={CELL}>{r.shift ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SHIFT_CHIP[r.shift.type] ?? 'bg-slate-100 text-slate-700'}`}>{r.shift.name}</span> : '—'}</td>
                      <td className={CELL}><AttStatusBadge status={r.status} /></td>
                      <td className={`${CELL} text-slate-600`}>{r.clockIn ? fmtTime(r.clockIn) : '—'}</td>
                      <td className={`${CELL} text-slate-600`}>{r.clockOut ? fmtTime(r.clockOut) : (r.isClockedIn ? <span className="text-green-600">Active</span> : '—')}</td>
                      <td className={`${CELL} text-right font-semibold text-charcoal-heading`}>{r.hours}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="flex w-full shrink-0 flex-col gap-6 xl:w-[320px]">
          <div className={`${CARD} p-5`}>
            <div className="mb-4 text-sm font-semibold text-charcoal-heading">Attendance</div>
            {([['Present', today?.present ?? 0, '#16A34A'], ['Absent', today?.absent ?? 0, '#DC2626'], ['Late', today?.late ?? 0, '#A16207']] as const).map(([label, n, c]) => (
              <div key={label} className="mb-3">
                <div className="mb-1 flex items-center justify-between text-xs"><span className="text-slate-600">{label}</span><span className="font-semibold text-charcoal-heading">{n} ({pct(n)}%)</span></div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${pct(n)}%`, background: c }} /></div>
              </div>
            ))}
          </div>

          <div className={`${CARD} p-5`}>
            <div className="mb-3 text-sm font-semibold text-charcoal-heading">Late Arrivals</div>
            {late.length === 0 ? <div className="text-sm text-slate-400">None today.</div> : (
              <div className="flex flex-col gap-2">
                {late.map((r: any) => <div key={r.employeeId} className="flex items-center justify-between text-sm"><span className="text-charcoal-heading">{r.name}</span><span className="text-xs font-semibold" style={{ color: '#A16207' }}>in {fmtTime(r.clockIn)}</span></div>)}
              </div>
            )}
          </div>

          <div className={`${CARD} p-5`}>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-charcoal-heading"><Clock size={15} className="text-slate-400" /> Missing Punches</div>
            <div className="mb-3 text-xs text-slate-400">Clocked in with no clock-out yet.</div>
            {missing.length === 0 ? <div className="text-sm text-slate-400">All clear.</div> : (
              <div className="flex flex-col gap-2">
                {missing.map((r: any) => <div key={r.employeeId} className="flex items-center justify-between text-sm"><span className="text-charcoal-heading">{r.name}</span><span className="text-xs font-semibold text-green-600">since {fmtTime(r.clockIn)}</span></div>)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkforcePage() {
  return (
    <FeatureGate feature="WORKFORCE_MANAGEMENT" fallback={<div className="p-8 text-sm text-secondary">Workforce Management is not enabled for this lab.</div>}>
      <Dashboard />
    </FeatureGate>
  );
}
