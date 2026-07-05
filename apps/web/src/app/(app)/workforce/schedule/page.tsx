'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FeatureGate } from '@/components/FeatureGate';
import { useEmployees, empName, SHIFT_CHIP } from '@/lib/workforce';

const CARD = 'rounded-xl border border-slate-100 bg-white shadow-sm';
const iso = (d: Date) => d.toISOString().slice(0, 10);
const mondayOf = (d: Date) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; };
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Grid() {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [deptId, setDeptId] = useState('all');
  const [picker, setPicker] = useState<{ employeeId: string; date: string } | null>(null);

  const wk = iso(weekStart);
  const { data: schedule } = useQuery({ queryKey: ['schedule', wk, deptId], queryFn: () => api.get('/workforce/schedule', { params: { weekStart: wk, departmentId: deptId === 'all' ? undefined : deptId } }).then((r) => r.data) });
  const { data: employees = [] } = useEmployees();
  const { data: shifts = [] } = useQuery({ queryKey: ['shifts'], queryFn: () => api.get('/workforce/shifts').then((r) => r.data) });

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => iso(new Date(+weekStart + i * 86_400_000))), [weekStart]);
  const departments = useMemo(() => Array.from(new Map(employees.filter((e) => e.department).map((e) => [e.department!.id, e.department!.name])).entries()), [employees]);
  const rows = deptId === 'all' ? employees : employees.filter((e) => e.department?.id === deptId);

  // assignment lookup: date -> employeeId -> assignment
  const lookup = useMemo(() => {
    const m = new Map<string, Map<string, any>>();
    for (const [date, list] of Object.entries((schedule?.dates ?? {}) as Record<string, any[]>)) {
      const em = new Map<string, any>();
      for (const a of list) em.set(a.employee.id, a);
      m.set(date, em);
    }
    return m;
  }, [schedule]);

  const assign = useMutation({
    mutationFn: (v: { employeeId: string; shiftId: string; date: string }) => api.post('/workforce/schedule/assign', v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); setPicker(null); },
  });

  const rangeLabel = `${new Date(days[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(days[6]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <div className="w-full">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-[30px] font-bold leading-tight tracking-tight text-charcoal-heading">Schedule</h1><p className="mt-1 text-sm text-secondary">Weekly shift assignments.</p></div>
      </div>

      <div className={`${CARD} mb-4 flex flex-wrap items-center justify-between gap-3 p-3`}>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(new Date(+weekStart - 7 * 86_400_000))} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><ChevronLeft size={16} /></button>
          <span className="min-w-[190px] text-center text-sm font-semibold text-charcoal-heading">{rangeLabel}</span>
          <button onClick={() => setWeekStart(new Date(+weekStart + 7 * 86_400_000))} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><ChevronRight size={16} /></button>
          <button onClick={() => setWeekStart(mondayOf(new Date()))} className="ml-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">This week</button>
        </div>
        <select value={deptId} onChange={(e) => setDeptId(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary">
          <option value="all">All Departments</option>{departments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>

      <div className={`${CARD} overflow-x-auto p-0`}>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Employee</th>
              {days.map((d, i) => <th key={d} className="px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">{DOW[i]}<div className="text-[10px] font-normal text-slate-300">{new Date(d).getDate()}</div></th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">No employees.</td></tr>}
            {rows.map((e) => (
              <tr key={e.id} className="border-b border-slate-100">
                <td className="sticky left-0 z-10 bg-white px-4 py-3 text-sm font-medium text-charcoal-heading">{empName(e)}</td>
                {days.map((d) => {
                  const a = lookup.get(d)?.get(e.id);
                  return (
                    <td key={d} className="px-1.5 py-2 text-center">
                      {a ? (
                        <span className={`inline-block rounded-lg px-2 py-1 text-[11px] font-semibold ${SHIFT_CHIP[a.shift.type] ?? 'bg-slate-100 text-slate-700'}`} title={`${a.shift.startTime}–${a.shift.endTime}`}>{a.shift.name}</span>
                      ) : (
                        <button onClick={() => setPicker({ employeeId: e.id, date: d })} className="grid h-7 w-7 place-items-center rounded-lg border border-dashed border-slate-200 text-slate-300 hover:border-primary hover:text-primary"><Plus size={14} /></button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span className="font-semibold uppercase tracking-wide text-slate-400">Shifts:</span>
        {shifts.map((s: any) => <span key={s.id} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${SHIFT_CHIP[s.type] ?? 'bg-slate-100 text-slate-700'}`}>{s.name} · {s.startTime}–{s.endTime}</span>)}
      </div>

      {/* Assign picker */}
      {picker && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/30 p-4" onClick={() => setPicker(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold text-charcoal-heading">Assign Shift</h3><button onClick={() => setPicker(null)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
            <div className="mb-3 text-sm text-slate-500">{empName(rows.find((r) => r.id === picker.employeeId))} · {new Date(picker.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</div>
            <div className="flex flex-col gap-2">
              {shifts.map((s: any) => (
                <button key={s.id} onClick={() => assign.mutate({ employeeId: picker.employeeId, shiftId: s.id, date: picker.date })} disabled={assign.isPending} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left hover:border-primary">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${SHIFT_CHIP[s.type] ?? 'bg-slate-100 text-slate-700'}`}>{s.name}</span>
                  <span className="text-xs text-slate-400">{s.startTime}–{s.endTime}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SchedulePage() {
  return <FeatureGate feature="WORKFORCE_MANAGEMENT" fallback={<div className="p-8 text-sm text-secondary">Workforce Management is not enabled for this lab.</div>}><Grid /></FeatureGate>;
}
