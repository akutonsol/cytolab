'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { APPT_TYPES, TYPE_META, type AppointmentType } from '@/lib/appointments';

const inp = 'h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-[14px] outline-none focus:border-[#4F46E5]';
const lbl = 'mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#94A3B8]';

interface Props {
  onClose: () => void;
  onCreated?: (id: string) => void;
  defaults?: { patientId?: string; appointmentType?: AppointmentType; recallRecordId?: string; scheduledDate?: string };
}

export function NewAppointmentModal({ onClose, onCreated, defaults }: Props) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [patientId, setPatientId] = useState(defaults?.patientId ?? '');
  const [appointmentType, setType] = useState<AppointmentType>(defaults?.appointmentType ?? 'SpecimenCollection');
  const [date, setDate] = useState(defaults?.scheduledDate ?? '');
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState(30);
  const [location, setLocation] = useState('');
  const [clientId, setClientId] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [notes, setNotes] = useState('');

  const { data: patients } = useQuery<Paginated<any>>({ queryKey: ['appt-patients'], enabled: !defaults?.patientId, queryFn: () => api.get('/patients', { params: { pageSize: 300 } }).then((r) => r.data) });
  const { data: clients } = useQuery<Paginated<any>>({ queryKey: ['appt-clients'], queryFn: () => api.get('/clients', { params: { pageSize: 300 } }).then((r) => r.data) });
  const { data: users } = useQuery<Paginated<any>>({ queryKey: ['appt-users'], queryFn: () => api.get('/users', { params: { pageSize: 200 } }).then((r) => r.data) });

  const save = useMutation({
    mutationFn: () => api.post('/appointments', {
      patientId, appointmentType, scheduledAt: new Date(`${date}T${time}`).toISOString(),
      duration, location: location || undefined, clientId: clientId || undefined,
      doctorName: doctorName || undefined, assignedToId: assignedToId || undefined,
      recallRecordId: defaults?.recallRecordId, notes: notes || undefined,
    }).then((r) => r.data),
    onSuccess: (a) => { message.success('Appointment scheduled'); ['appointments', 'appt-calendar', 'appt-stats'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onCreated?.(a.id); onClose(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Could not schedule appointment'),
  });

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 2200, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="w-full max-w-[520px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[18px] font-bold text-[#0F172A]">New Appointment</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#64748B] hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="flex flex-col gap-3">
          {!defaults?.patientId ? (
            <div><label className={lbl}>Patient</label>
              <select value={patientId} onChange={(e) => setPatientId(e.target.value)} className={inp}>
                <option value="">Select patient…</option>
                {(patients?.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.registrationNo ? ` (${p.registrationNo})` : ''}</option>)}
              </select>
            </div>
          ) : <div className="rounded-lg bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#64748B]">Patient pre-selected from recall</div>}

          <div>
            <label className={lbl}>Type</label>
            <div className="flex flex-wrap gap-1.5">
              {APPT_TYPES.map((t) => (
                <button key={t} onClick={() => setType(t)} className="rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-colors"
                  style={appointmentType === t ? { borderColor: TYPE_META[t].color, background: TYPE_META[t].bg, color: TYPE_META[t].color } : { borderColor: '#E2E8F0', color: '#64748B' }}>{TYPE_META[t].label}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div><label className={lbl}>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} /></div>
            <div><label className={lbl}>Time</label><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inp} /></div>
            <div><label className={lbl}>Minutes</label><input type="number" min={5} max={480} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inp} /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Location</label><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Room / bay" className={inp} /></div>
            <div><label className={lbl}>Assigned To</label>
              <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className={inp}>
                <option value="">Unassigned</option>
                {(users?.data ?? []).map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Referring Client</label>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={inp}>
                <option value="">None</option>
                {(clients?.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.officeName || `${c.firstName} ${c.lastName}`}</option>)}
              </select>
            </div>
            <div><label className={lbl}>Ref. Doctor</label><input value={doctorName} onChange={(e) => setDoctorName(e.target.value)} placeholder="Dr. …" className={inp} /></div>
          </div>

          <div><label className={lbl}>Notes</label><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inp} h-auto py-2`} /></div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#64748B]">Cancel</button>
          <button disabled={!patientId || !date || save.isPending} onClick={() => save.mutate()} className="rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40">Schedule</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
