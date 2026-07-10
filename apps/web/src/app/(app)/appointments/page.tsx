'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/feature-context';
import { NewAppointmentModal } from '@/components/NewAppointmentModal';
import {
  APPT_TYPES, STATUS_META, TYPE_META, dateKey, longDate, normStatus, normType, timeOf,
  type Appointment, type AppointmentStats,
} from '@/lib/appointments';
import { Card, IconAction } from '@/components/ui';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function TypeChip({ type, compact }: { type: string; compact?: boolean }) {
  const m = TYPE_META[normType(type)];
  return <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: m.bg, color: m.color }}>{compact ? m.label.split(' ')[0] : m.label}</span>;
}
function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[normStatus(status)];
  return <span className="inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: m.bg, color: m.fg, textDecoration: m.strike ? 'line-through' : undefined }}>{m.label}</span>;
}

// ── Reschedule modal ─────────────────────────────────────────────────────────
function RescheduleModal({ appt, onClose }: { appt: Appointment; onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [date, setDate] = useState(dateKey(new Date(appt.scheduledAt)));
  const [time, setTime] = useState(new Date(appt.scheduledAt).toTimeString().slice(0, 5));
  const save = useMutation({
    mutationFn: () => api.post(`/appointments/${appt.id}/reschedule`, { newScheduledAt: new Date(`${date}T${time}`).toISOString() }).then((r) => r.data),
    onSuccess: () => { message.success('Rescheduled'); ['appointments', 'appt-calendar', 'appt-stats'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onClose(); },
    onError: () => message.error('Could not reschedule'),
  });
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 2400, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="w-full max-w-[380px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-[17px] font-bold text-[#0F172A]">Reschedule</h3><IconAction icon={<X size={16} />} tone="strong" onClick={onClose} /></div>
        <div className="flex gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10 flex-1 rounded-lg border border-[#E2E8F0] px-3 text-[14px]" />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-10 rounded-lg border border-[#E2E8F0] px-3 text-[14px]" />
        </div>
        <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#475569]">Cancel</button><button disabled={save.isPending} onClick={() => save.mutate()} className="rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white">Reschedule</button></div>
      </div>
    </div>,
    document.body,
  );
}

function useApptActions() {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      (action === 'cancel' ? api.delete(`/appointments/${id}`, { data: {} }) : api.post(`/appointments/${id}/${action}`, {})).then((r) => r.data),
    onSuccess: (_d, v) => { message.success('Updated'); ['appointments', 'appt-calendar', 'appt-stats'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); },
    onError: () => message.error('Action failed'),
  });
}

function RowActions({ appt, onReschedule }: { appt: Appointment; onReschedule: () => void }) {
  const act = useApptActions();
  const s = normStatus(appt.status);
  const btn = 'rounded-lg border border-[#E2E8F0] px-2.5 py-1 text-[12px] font-semibold';
  const done = ['Completed', 'Cancelled', 'NoShow', 'Rescheduled'].includes(s);
  if (done) return <span className="text-[12px] text-[#475569]">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {s === 'Scheduled' && <button onClick={() => act.mutate({ id: appt.id, action: 'confirm' })} className={`${btn} text-[#4F46E5]`}>Confirm</button>}
      {['Scheduled', 'Confirmed'].includes(s) && <button onClick={() => act.mutate({ id: appt.id, action: 'check-in' })} className={`${btn} text-[#1D4ED8]`}>Check In</button>}
      {s === 'CheckedIn' && <button onClick={() => act.mutate({ id: appt.id, action: 'complete' })} className="rounded-lg bg-[#16A34A] px-2.5 py-1 text-[12px] font-semibold text-white">Complete</button>}
      <button onClick={onReschedule} className={`${btn} text-[var(--color-warning)]`}>Reschedule</button>
      {['Scheduled', 'Confirmed'].includes(s) && <button onClick={() => act.mutate({ id: appt.id, action: 'no-show' })} className={`${btn} text-[#B91C1C]`}>No-Show</button>}
      <button onClick={() => act.mutate({ id: appt.id, action: 'cancel' })} className={`${btn} text-[#475569]`}>Cancel</button>
    </div>
  );
}

export default function AppointmentsPage() {
  const { isEnabled } = useFeatures();
  const enabled = isEnabled('APPOINTMENTS');
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [newOpen, setNewOpen] = useState(false);
  const [daySel, setDaySel] = useState<string | null>(null);
  const [reschedule, setReschedule] = useState<Appointment | null>(null);
  const [fStatus, setFStatus] = useState('');
  const [fType, setFType] = useState('');

  const year = cursor.getFullYear();
  const month = cursor.getMonth() + 1;

  const { data: stats } = useQuery<AppointmentStats>({ queryKey: ['appt-stats'], queryFn: () => api.get('/appointments/stats').then((r) => r.data), enabled });
  const { data: calendar } = useQuery<{ dates: Record<string, Appointment[]> }>({ queryKey: ['appt-calendar', year, month], queryFn: () => api.get('/appointments/calendar', { params: { year, month } }).then((r) => r.data), enabled: enabled && view === 'calendar' });
  const { data: listData = [] } = useQuery<Appointment[]>({ queryKey: ['appointments', fStatus, fType], queryFn: () => api.get('/appointments', { params: { ...(fStatus && { status: fStatus }), ...(fType && { type: fType }), dateFrom: '2000-01-01', dateTo: '2100-01-01' } }).then((r) => r.data), enabled: enabled && view === 'list' });

  const dates = calendar?.dates ?? {};
  const todayKey = dateKey(new Date());

  // Build the Mon-start month grid.
  const cells = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const startOffset = (first.getDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(year, month, 0).getDate();
    const arr: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(year, month - 1, d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [year, month]);

  if (!enabled) {
    return (
      <div className="min-h-full pt-4" style={{ background: '#F8FAFC' }}>
        <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[#EEF2F7] bg-white p-8 text-center shadow-sm">
          <CalendarDays size={28} className="mx-auto text-[#9CA3AF]" />
          <div className="mt-3 text-[18px] font-bold text-[#0F172A]">Feature not enabled</div>
          <div className="mt-1 text-[14px] text-[#6B7280]">Appointments is disabled for this lab.</div>
        </div>
      </div>
    );
  }

  const daySelAppts = daySel ? (dates[daySel] ?? []) : [];

  return (
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#0F172A]">Appointments</h1>
          <p className="mt-1.5 text-[15px] text-[#6B7280]">Schedule collections, follow-ups, and recall visits.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-full bg-[#F1F5F9] p-1">
            {(['calendar', 'list'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold capitalize transition-colors" style={view === v ? { background: '#fff', color: '#0F172A', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } : { color: '#475569' }}>{v}</button>
            ))}
          </div>
          <button onClick={() => setNewOpen(true)} className="rounded-lg bg-[#4F46E5] px-4 py-2.5 text-[14px] font-semibold text-white">New Appointment</button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Today', value: stats?.todayCount ?? 0, fg: '#4F46E5' },
          { label: 'Next 7 Days', value: stats?.upcomingCount ?? 0, fg: '#0F172A' },
          { label: 'Completion Rate', value: `${stats?.completionRate ?? 0}%`, fg: '#16A34A' },
          { label: 'No-Show Rate', value: `${stats?.noShowRate ?? 0}%`, fg: (stats?.noShowRate ?? 0) > 0 ? '#B91C1C' : '#0F172A' },
        ].map((k) => (
          <Card radius="md" elevation="soft" border="hairline" className="p-4" key={k.label}><div className="text-[24px] font-bold leading-none" style={{ color: k.fg }}>{k.value}</div><div className="mt-1.5 text-[13px] text-[#475569]">{k.label}</div></Card>
        ))}
      </div>

      {/* CALENDAR VIEW */}
      {view === 'calendar' && (
        <Card radius="md" elevation="soft" border="hairline" className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconAction icon={<ChevronLeft size={16} />} tone="strong" className="hover:bg-slate-50 border border-[#E2E8F0]" onClick={() => setCursor(new Date(year, month - 2, 1))} />
              <span className="min-w-[180px] text-center text-[16px] font-bold text-[#0F172A]">{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
              <IconAction icon={<ChevronRight size={16} />} tone="strong" className="hover:bg-slate-50 border border-[#E2E8F0]" onClick={() => setCursor(new Date(year, month, 1))} />
            </div>
            <button onClick={() => { const d = new Date(); d.setDate(1); setCursor(d); }} className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-[13px] font-semibold text-[#475569]">Today</button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => <div key={w} className="px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-[#475569]">{w}</div>)}
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="min-h-[104px] rounded-lg bg-[#FAFBFC]" />;
              const key = dateKey(d);
              const appts = dates[key] ?? [];
              const isToday = key === todayKey;
              return (
                <button key={i} onClick={() => setDaySel(key)} className="min-h-[104px] rounded-lg border p-1.5 text-left transition-colors hover:border-[#C7D2FE]" style={{ borderColor: isToday ? '#C7D2FE' : '#EEF2F7', background: isToday ? '#EEF2FF' : '#fff' }}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[12px] font-bold" style={{ color: isToday ? '#4F46E5' : '#334155' }}>{d.getDate()}</span>
                    {appts.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-[#4F46E5]" />}
                  </div>
                  <div className="flex flex-col gap-1">
                    {appts.slice(0, 3).map((a) => {
                      const m = TYPE_META[normType(a.type)];
                      return <div key={a.id} className="truncate rounded px-1 py-0.5 text-[10px] font-semibold" style={{ background: m.bg, color: m.color }}>{timeOf(a.scheduledAt)} {a.patientName}</div>;
                    })}
                    {appts.length > 3 && <div className="px-1 text-[10px] font-semibold text-[#475569]">+{appts.length - 3} more</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* LIST VIEW */}
      {view === 'list' && (
        <Card radius="md" elevation="soft" border="hairline" className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#EEF2F7] p-3">
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="h-9 rounded-lg border border-[#E2E8F0] px-2 text-[13px]"><option value="">All statuses</option>{Object.keys(STATUS_META).map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <select value={fType} onChange={(e) => setFType(e.target.value)} className="h-9 rounded-lg border border-[#E2E8F0] px-2 text-[13px]"><option value="">All types</option>{APPT_TYPES.map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}</select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead><tr className="border-b border-[#EEF2F7] text-[11px] uppercase tracking-wide text-[#475569]">
                <th className="px-3 py-2.5 font-semibold">Date/Time</th><th className="px-3 py-2.5 font-semibold">Patient</th><th className="px-3 py-2.5 font-semibold">Type</th>
                <th className="px-3 py-2.5 font-semibold">Assigned To</th><th className="px-3 py-2.5 font-semibold">Client</th><th className="px-3 py-2.5 font-semibold">Status</th><th className="px-3 py-2.5 font-semibold">Actions</th>
              </tr></thead>
              <tbody>
                {listData.length === 0 ? <tr><td colSpan={7} className="px-3 py-12 text-center text-[#475569]">No appointments.</td></tr> : listData.map((a) => (
                  <tr key={a.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                    <td className="px-3 py-2.5 text-[#0F172A]"><div className="font-semibold">{new Date(a.scheduledAt).toLocaleDateString()}</div><div className="text-[12px] text-[#475569]">{timeOf(a.scheduledAt)}</div></td>
                    <td className="px-3 py-2.5 font-semibold text-[#0F172A]">{a.patientName}</td>
                    <td className="px-3 py-2.5"><TypeChip type={a.type} /></td>
                    <td className="px-3 py-2.5 text-[#334155]">{a.assignedToName ?? '—'}</td>
                    <td className="px-3 py-2.5 text-[#475569]">{a.clientName ?? '—'}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={a.status} /></td>
                    <td className="px-3 py-2.5"><RowActions appt={a} onReschedule={() => setReschedule(a)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Day detail slide-over */}
      {daySel && createPortal(
        <div className="fixed inset-0 flex justify-end" style={{ zIndex: 2100, background: 'rgba(15,23,42,0.55)' }} onClick={() => setDaySel(null)}>
          <div className="flex h-full w-full max-w-[500px] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <h3 className="text-[17px] font-bold text-[#0F172A]">{longDate(new Date(`${daySel}T00:00`))}</h3>
              <IconAction icon={<X size={16} />} tone="strong" onClick={() => setDaySel(null)} />
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {daySelAppts.length === 0 ? (
                <div className="py-8 text-center text-[13px] text-[#475569]">No appointments this day.</div>
              ) : (
                <div className="flex flex-col gap-3">
                  {daySelAppts.map((a) => (
                    <div key={a.id} className="rounded-xl border border-[#EEF2F7] p-3.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[14px] font-bold text-[#0F172A]"><Clock size={14} className="text-[#475569]" /> {timeOf(a.scheduledAt)}</div>
                        <StatusBadge status={a.status} />
                      </div>
                      <div className="mt-1.5 text-[15px] font-semibold text-[#0F172A]">{a.patientName}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[#475569]">
                        <TypeChip type={a.type} />
                        {a.location && <span>· {a.location}</span>}
                        {a.assignedToName && <span>· {a.assignedToName}</span>}
                      </div>
                      <div className="mt-2.5"><RowActions appt={a} onReschedule={() => setReschedule(a)} /></div>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => { setNewOpen(true); }} className="mt-4 w-full rounded-lg border border-dashed border-[#CBD5E1] px-3 py-2 text-[13px] font-semibold text-[#4F46E5]">+ New appointment</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {newOpen && <NewAppointmentModal onClose={() => setNewOpen(false)} defaults={daySel ? { scheduledDate: daySel } : undefined} />}
      {reschedule && <RescheduleModal appt={reschedule} onClose={() => setReschedule(null)} />}
    </div>
  );
}
