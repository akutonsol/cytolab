'use client';

import Link from 'next/link';
import { ArrowUpRight, CalendarDays, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ClockWidget } from '@/components/workforce/ClockWidget';
import { useMyEmployee, fmtDate, SHIFT_CHIP } from '@/lib/workforce';

const mondayOf = (d: Date) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; };
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function MyTodayCard() {
  const { employee } = useMyEmployee();
  const wk = iso(mondayOf(new Date()));
  const { data: schedule } = useQuery({
    queryKey: ['schedule', wk, 'my-today'],
    queryFn: () => api.get('/workforce/schedule', { params: { weekStart: wk } }).then((r) => r.data),
    enabled: !!employee?.id,
  });

  const today = iso(new Date());
  const myShift = ((schedule?.dates?.[today] ?? []) as any[]).find((a) => a.employee.id === employee?.id)?.shift ?? null;

  return (
    <div style={{ background: 'white', borderRadius: 20, border: '1px solid #EEF2F7', boxShadow: '0 4px 24px rgba(0,0,0,0.04)', padding: 20 }}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><Clock size={17} /></span>
          <span className="text-base font-bold text-charcoal-heading" style={{ fontFamily: 'Geist,sans-serif' }}>My Today</span>
        </div>
        <Link href="/workforce" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">Attendance <ArrowUpRight size={14} /></Link>
      </div>

      <ClockWidget compact />

      <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
        <span className="inline-flex items-center gap-2 text-sm text-secondary"><CalendarDays size={15} className="text-slate-400" /> Today&apos;s shift · {fmtDate(new Date())}</span>
        {myShift ? <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${SHIFT_CHIP[myShift.type] ?? 'bg-slate-100 text-slate-700'}`}>{myShift.name} · {myShift.startTime}–{myShift.endTime}</span> : <span className="text-xs text-slate-400">No shift assigned</span>}
      </div>
    </div>
  );
}
