'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FeatureGate } from '@/components/FeatureGate';
import { useEmployees, empName, SHIFT_CHIP } from '@/lib/workforce';
import { Card } from '@/components/ui';

const pad2 = (n: number) => String(n).padStart(2, '0');
// Plain LOCAL calendar date (YYYY-MM-DD) — built from local components, never
// via toISOString(), which would UTC-shift the day in non-zero-offset zones.
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// Parse a YYYY-MM-DD as a LOCAL date (a bare string parses as UTC midnight,
// which renders as the previous day in negative-offset zones like Jamaica).
const parseLocal = (s: string) => new Date(`${s}T00:00:00`);
// Serialize a calendar date for the API at LOCAL NOON. The backend snaps dates
// to a local day boundary, so a bare YYYY-MM-DD (UTC midnight) would shift back
// a day in UTC-5; noon keeps new Date() on the intended calendar day regardless
// of a ±12h offset between client and server.
const apiDate = (s: string) => `${s}T12:00:00`;
const mondayOf = (d: Date) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; };
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Grid() {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [deptId, setDeptId] = useState('all');
  // `current` is set when opening the picker on an existing assignment (edit mode).
  const [picker, setPicker] = useState<{ employeeId: string; date: string; current?: { assignmentId: string; shiftId: string } } | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  const wk = ymd(weekStart);
  const { data: schedule } = useQuery({ queryKey: ['schedule', wk, deptId], queryFn: () => api.get('/workforce/schedule', { params: { weekStart: apiDate(wk), departmentId: deptId === 'all' ? undefined : deptId } }).then((r) => r.data) });
  const { data: employees = [] } = useEmployees();
  const { data: shifts = [] } = useQuery({ queryKey: ['shifts'], queryFn: () => api.get('/workforce/shifts').then((r) => r.data) });

  // Local calendar dates Mon…Sun of the week (day-by-day so DST can't shift them).
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => ymd(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i))),
    [weekStart],
  );
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
    onError: (e: any) => setAssignError(e?.response?.data?.message ?? 'Could not assign shift. Please try again.'),
  });
  const remove = useMutation({
    mutationFn: (assignmentId: string) => api.delete(`/workforce/schedule/assignments/${assignmentId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); setPicker(null); },
    onError: (e: any) => setAssignError(e?.response?.data?.message ?? 'Could not remove shift. Please try again.'),
  });
  const busy = assign.isPending || remove.isPending;
  // The shift currently being saved (drives the per-option spinner).
  const savingShiftId = assign.isPending ? assign.variables?.shiftId : null;
  // Open the picker for a cell (optionally in edit mode with the current
  // assignment), clearing any prior error/in-flight state.
  const openPicker = (employeeId: string, date: string, current?: { assignmentId: string; shiftId: string }) => {
    assign.reset(); remove.reset(); setAssignError(null); setPicker({ employeeId, date, current });
  };
  const closePicker = () => { assign.reset(); remove.reset(); setAssignError(null); setPicker(null); };

  const rangeLabel = `${parseLocal(days[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${parseLocal(days[6]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <div className="w-full">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-[30px] font-bold leading-tight tracking-tight text-charcoal-heading">Schedule</h1><p className="mt-1 text-sm text-secondary">Weekly shift assignments.</p></div>
      </div>

      <Card radius="sm" elevation="sm" border="subtle" className="mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(new Date(+weekStart - 7 * 86_400_000))} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><ChevronLeft size={16} /></button>
          <span className="min-w-[190px] text-center text-sm font-semibold text-charcoal-heading">{rangeLabel}</span>
          <button onClick={() => setWeekStart(new Date(+weekStart + 7 * 86_400_000))} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><ChevronRight size={16} /></button>
          <button onClick={() => setWeekStart(mondayOf(new Date()))} className="ml-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">This week</button>
        </div>
        <select value={deptId} onChange={(e) => setDeptId(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary">
          <option value="all">All Departments</option>{departments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </Card>

      <Card radius="sm" elevation="sm" border="subtle" className="overflow-x-auto p-0">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Employee</th>
              {days.map((d, i) => <th key={d} className="px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">{DOW[i]}<div className="text-[10px] font-normal text-slate-300">{parseLocal(d).getDate()}</div></th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-500">No employees.</td></tr>}
            {rows.map((e) => (
              <tr key={e.id} className="border-b border-slate-100">
                <td className="sticky left-0 z-10 bg-white px-4 py-3 text-sm font-medium text-charcoal-heading">{empName(e)}</td>
                {days.map((d) => {
                  const a = lookup.get(d)?.get(e.id);
                  return (
                    <td key={d} className="px-1.5 py-2 text-center">
                      {a ? (
                        <button
                          onClick={() => openPicker(e.id, d, { assignmentId: a.assignmentId, shiftId: a.shift.id })}
                          title={`${a.shift.name} · ${a.shift.startTime}–${a.shift.endTime} — click to change or remove`}
                          className={`group inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-shadow hover:ring-2 hover:ring-primary/40 ${SHIFT_CHIP[a.shift.type] ?? 'bg-slate-100 text-slate-700'}`}
                        >
                          {a.shift.name}
                          <Pencil size={11} className="opacity-0 transition-opacity group-hover:opacity-70" />
                        </button>
                      ) : (
                        <button onClick={() => openPicker(e.id, d)} className="grid h-7 w-7 place-items-center rounded-lg border border-dashed border-slate-200 text-slate-300 hover:border-primary hover:text-primary"><Plus size={14} /></button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span className="font-semibold uppercase tracking-wide text-slate-500">Shifts:</span>
        {shifts.map((s: any) => <span key={s.id} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${SHIFT_CHIP[s.type] ?? 'bg-slate-100 text-slate-700'}`}>{s.name} · {s.startTime}–{s.endTime}</span>)}
      </div>

      {/* Assign picker */}
      {picker && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/30 p-4" onClick={closePicker}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold text-charcoal-heading">{picker.current ? 'Change Shift' : 'Assign Shift'}</h3><button onClick={closePicker} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X size={18} /></button></div>
            <div className="mb-3 text-sm text-slate-500">{empName(rows.find((r) => r.id === picker.employeeId))} · {parseLocal(picker.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</div>
            <div className="flex flex-col gap-2">
              {shifts.map((s: any) => {
                const selected = picker.current?.shiftId === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => { setAssignError(null); assign.mutate({ employeeId: picker.employeeId, shiftId: s.id, date: apiDate(picker.date) }); }}
                    disabled={busy}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-60 ${selected ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-slate-200 hover:border-primary'}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${SHIFT_CHIP[s.type] ?? 'bg-slate-100 text-slate-700'}`}>{s.name}</span>
                      {selected && <span className="text-[11px] font-medium text-primary">Current</span>}
                    </span>
                    {savingShiftId === s.id
                      ? <Loader2 size={15} className="animate-spin text-primary" />
                      : <span className="text-xs text-slate-500">{s.startTime}–{s.endTime}</span>}
                  </button>
                );
              })}
              {shifts.length === 0 && <div className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-500">No shifts defined yet.</div>}
            </div>
            {picker.current && (
              <button
                onClick={() => { setAssignError(null); remove.mutate(picker.current!.assignmentId); }}
                disabled={busy}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
              >
                {remove.isPending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                Remove Shift
              </button>
            )}
            {assignError && <div className="mt-3 text-sm text-error">{assignError}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SchedulePage() {
  return <FeatureGate feature="WORKFORCE_MANAGEMENT" fallback={<div className="p-8 text-sm text-secondary">Workforce Management is not enabled for this lab.</div>}><Grid /></FeatureGate>;
}
