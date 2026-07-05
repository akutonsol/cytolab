'use client';

import { useEffect, useState } from 'react';
import { Clock, Coffee, LogIn, LogOut } from 'lucide-react';
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

export function ClockWidget({ compact = false }: { compact?: boolean }) {
  const now = useNow();
  const qc = useQueryClient();
  const { employee, isLoading } = useMyEmployee();

  const { data: status } = useQuery({
    queryKey: ['clock-status', employee?.id],
    queryFn: () => api.get(`/workforce/clock/status/${employee!.id}`).then((r) => r.data),
    enabled: !!employee?.id,
    refetchInterval: 30_000,
  });

  const clock = useMutation({
    mutationFn: (type: string) => api.post('/workforce/clock', { employeeId: employee!.id, type, method: 'Desktop' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clock-status', employee?.id] }); qc.invalidateQueries({ queryKey: ['attendance-today'] }); },
  });

  if (isLoading) return <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm text-sm text-slate-400">Loading…</div>;
  if (!employee) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 text-slate-500"><Clock size={20} /><span className="text-sm font-medium">No employee profile linked to your account.</span></div>
      </div>
    );
  }

  const isClockedIn = !!status?.isClockedIn;
  const shift = status?.currentShift;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className={`flex ${compact ? 'flex-col gap-4' : 'flex-wrap items-center justify-between gap-6'}`}>
        <div className="min-w-0">
          <div className="font-mono text-4xl font-bold tracking-tight text-charcoal-heading">{hhmmss(now)}</div>
          <div className="mt-1 text-sm text-slate-400">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-charcoal-heading">{greeting()}, {empName(employee).split(' ')[0]}</span>
            {shift && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${SHIFT_CHIP[shift.type] ?? 'bg-slate-100 text-slate-700'}`}>{shift.name}</span>}
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          {isClockedIn ? (
            <>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-sm font-semibold text-green-600"><span className="h-2 w-2 rounded-full bg-green-500" /> Clocked in at {fmtTime(status.clockedInAt)}</span>
                <span className="font-mono text-lg font-bold text-charcoal-heading">{liveHours(status.clockedInAt, 0)}h</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => clock.mutate('ClockOut')} disabled={clock.isPending} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-base font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-60"><LogOut size={18} /> CLOCK OUT</button>
                <button onClick={() => clock.mutate('BreakStart')} disabled={clock.isPending} className="btn-secondary"><Coffee size={16} /> Break</button>
              </div>
            </>
          ) : (
            <button onClick={() => clock.mutate('ClockIn')} disabled={clock.isPending} className="inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-4 text-lg font-bold text-white shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-60"><LogIn size={20} /> CLOCK IN</button>
          )}
          {clock.isError && <div className="text-xs text-error">Could not record — try again.</div>}
        </div>
      </div>
    </div>
  );
}
