'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarDays, ChevronDown, Clock, Coffee, LogIn, LogOut } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMyEmployee, greeting, fmtTime, empName, SHIFT_CHIP } from '@/lib/workforce';

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}

const hhmmss = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const liveHours = (fromIso?: string | null, base = 0) => {
  if (!fromIso) return base.toFixed(2);
  const h = base + (Date.now() - new Date(fromIso).getTime()) / 3_600_000;
  return Math.max(0, h).toFixed(2);
};

// Duration (seconds) → HH:MM:SS, for the nav dropdown rows.
const fmtDur = (secs: number) => {
  const s = Math.max(0, Math.floor(secs));
  const parts = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  return parts.map((n) => String(n).padStart(2, '0')).join(':');
};
// "HH:MM" (24h) → "hh:mm AM/PM".
const to12h = (hm?: string | null) => {
  if (!hm) return '—';
  const [H, M] = hm.split(':').map(Number);
  const ap = H < 12 ? 'AM' : 'PM';
  return `${String(H % 12 || 12).padStart(2, '0')}:${String(M ?? 0).padStart(2, '0')} ${ap}`;
};
const mondayOf = (d: Date) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; };
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function ClockWidget({ compact = false, nav = false }: { compact?: boolean; nav?: boolean }) {
  const now = useNow();
  const qc = useQueryClient();
  const router = useRouter();
  const { employee, isLoading } = useMyEmployee();
  const [open, setOpen] = useState(false);

  const { data: status } = useQuery({
    queryKey: ['clock-status', employee?.id],
    queryFn: () => api.get(`/workforce/clock/status/${employee!.id}`).then((r) => r.data),
    enabled: !!employee?.id,
    refetchInterval: 30_000,
  });

  // Today's scheduled shift (start/end times) for the nav dropdown — same source
  // the My Today card uses. Only fetched in nav mode.
  const wk = iso(mondayOf(new Date()));
  const { data: schedule } = useQuery({
    queryKey: ['schedule', wk, 'my-today'],
    queryFn: () => api.get('/workforce/schedule', { params: { weekStart: wk } }).then((r) => r.data),
    enabled: nav && !!employee?.id,
  });
  const myShift = ((schedule?.dates?.[iso(new Date())] ?? []) as any[]).find((a) => a.employee.id === employee?.id)?.shift ?? null;

  const clock = useMutation({
    mutationFn: (type: string) => api.post('/workforce/clock', { employeeId: employee!.id, type, method: 'Desktop' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clock-status', employee?.id] }); qc.invalidateQueries({ queryKey: ['attendance-today'] }); },
  });

  if (isLoading) return nav ? null : <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm text-sm text-slate-500">Loading…</div>;
  if (!employee) {
    if (nav) return null;
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 text-slate-500"><Clock size={20} /><span className="text-sm font-medium">No employee profile linked to your account.</span></div>
      </div>
    );
  }

  const isClockedIn = !!status?.isClockedIn;
  const shift = status?.currentShift;

  // ── Nav header variant: compact CLOCK IN button, or a live timer pill that
  // opens the attendance dropdown. ──────────────────────────────────────────
  if (nav) {
    if (!isClockedIn) {
      return (
        <button onClick={() => clock.mutate('ClockIn')} disabled={clock.isPending}
          className="clock-card transition-colors hover:bg-gray-50 disabled:opacity-60" style={{ gap: 8, minWidth: 0 }}>
          <LogIn size={16} className="text-indigo-600" />
          <span className="text-sm font-semibold text-indigo-600">Clock In</span>
        </button>
      );
    }

    const workedSecs = status?.clockedInAt ? (now.getTime() - new Date(status.clockedInAt).getTime()) / 1000 : 0;
    let remaining = '—';
    if (myShift?.endTime) {
      const [eh, em] = myShift.endTime.split(':').map(Number);
      const end = new Date(now); end.setHours(eh, em, 0, 0);
      remaining = fmtDur((end.getTime() - now.getTime()) / 1000);
    }
    const Row = ({ label, value }: { label: string; value: string }) => (
      <div className="flex items-center justify-between py-1.5">
        <span className="inline-flex items-center gap-2 text-sm text-gray-600"><Clock size={15} className="text-gray-500" /> {label}</span>
        <span className="font-mono text-sm font-semibold text-gray-900">{value}</span>
      </div>
    );
    const go = (path: string) => { setOpen(false); router.push(path); };

    return (
      <div className="relative" style={{ zIndex: open ? 60 : undefined }}>
        <button onClick={() => setOpen((o) => !o)} className="clock-card" style={{ gap: 12 }}>
          <span className="clock-status" />
          <span className="flex flex-col text-left leading-tight">
            <span className="clock-time font-mono text-gray-900">{hhmmss(now)}</span>
            <span className="clock-label">Shift Active</span>
          </span>
          <ChevronDown size={14} className="text-gray-400" />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-50" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full z-[60] mt-3 w-80 rounded-2xl border border-gray-100 bg-white p-4 shadow-2xl">
              <span className="absolute -top-1.5 right-14 h-3 w-3 rotate-45 rounded-sm border-l border-t border-gray-100 bg-white" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                    <span className="text-base font-bold text-gray-900">Clocked In</span>
                  </div>
                  <div className="mt-0.5 text-sm text-gray-500">Since {fmtTime(status.clockedInAt)}</div>
                </div>
                <button onClick={() => { setOpen(false); clock.mutate('ClockOut'); }} disabled={clock.isPending}
                  className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 disabled:opacity-60">
                  <LogOut size={16} /> Clock Out
                </button>
              </div>

              <div className="my-3 h-px bg-gray-100" />
              <Row label="Worked Today" value={fmtDur(workedSecs)} />
              <Row label="Break Time" value="00:00:00" />
              <Row label="Remaining (in shift)" value={remaining} />
              <Row label="Today's Shift" value={myShift ? `${to12h(myShift.startTime)} - ${to12h(myShift.endTime)}` : '—'} />

              <div className="my-3 h-px bg-gray-100" />
              <button onClick={() => { setOpen(false); clock.mutate('BreakStart'); }} disabled={clock.isPending}
                className="flex w-full items-center gap-3 rounded-lg border-0 bg-transparent px-1 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60">
                <Coffee size={16} className="text-gray-500" /> Take Break
              </button>
              <button onClick={() => go('/workforce/timesheets')}
                className="flex w-full items-center gap-3 rounded-lg border-0 bg-transparent px-1 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50">
                <CalendarDays size={16} className="text-gray-500" /> View Timesheet
              </button>

              <div className="my-3 h-px bg-gray-100" />
              <button onClick={() => go('/workforce')}
                className="flex w-full items-center justify-between border-0 bg-transparent px-1 py-1 text-sm font-semibold text-indigo-600">
                <span>Go to Attendance Dashboard</span> <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    // In compact mode the widget is embedded inside another card (MyTodayCard),
    // so it drops its own card chrome/padding and lays out horizontally to stay short.
    <div className={compact ? '' : 'rounded-2xl border border-slate-100 bg-white p-6 shadow-sm'}>
      <div className={`flex ${compact ? 'items-center justify-between gap-4' : 'flex-wrap items-center justify-between gap-6'}`}>
        <div className="min-w-0">
          <div className="font-mono text-4xl font-bold tracking-tight text-charcoal-heading">{hhmmss(now)}</div>
          <div className="mt-0.5 text-sm text-slate-500">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm font-semibold text-charcoal-heading">{greeting()}, {empName(employee).split(' ')[0]}</span>
            {shift && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${SHIFT_CHIP[shift.type] ?? 'bg-slate-100 text-slate-700'}`}>{shift.name}</span>}
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          {isClockedIn ? (
            <>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-sm font-semibold text-green-700"><span className="h-2 w-2 rounded-full bg-green-500" /> Clocked in at {fmtTime(status.clockedInAt)}</span>
                <span className="font-mono text-lg font-bold text-charcoal-heading">{liveHours(status.clockedInAt, 0)}h</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => clock.mutate('ClockOut')} disabled={clock.isPending} className={`inline-flex items-center gap-2 rounded-xl bg-red-600 font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-60 ${compact ? 'px-4 py-2 text-sm' : 'px-6 py-3 text-base'}`}><LogOut size={compact ? 16 : 18} /> CLOCK OUT</button>
                <button onClick={() => clock.mutate('BreakStart')} disabled={clock.isPending} className="btn-secondary"><Coffee size={16} /> Break</button>
              </div>
            </>
          ) : (
            <button onClick={() => clock.mutate('ClockIn')} disabled={clock.isPending} className={`inline-flex items-center gap-2 rounded-xl bg-primary font-bold text-white shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-60 ${compact ? 'px-6 py-2.5 text-sm' : 'px-8 py-4 text-lg'}`}><LogIn size={compact ? 16 : 20} /> CLOCK IN</button>
          )}
          {clock.isError && <div className="text-xs text-error">Could not record — try again.</div>}
        </div>
      </div>
    </div>
  );
}
