'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App } from 'antd';
import {
  AlertTriangle, ArrowRight, ArrowUpDown, Calendar, ChevronDown, Clock, FileText,
  Filter, Maximize2, MoreHorizontal, Phone, Plus, Search, UserX, Video, X,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PatientSelect } from '@/components/PatientSelect';
import { ClientSelect } from '@/components/ClientSelect';

// ─── Types ───────────────────────────────────────────────────────────────────
type ApptStatus = 'SCHEDULED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'MISSED' | 'CANCELLED';
type ApptType = 'COLLECTION' | 'CALLBACK' | 'CONSULTATION' | 'FOLLOWUP';
interface Overview {
  kpis: { scheduledToday: number; missed: number; pendingCallbacks: number; pendingReports: number };
  todaySchedule: { id: string; title: string; type: ApptType; status: ApptStatus; scheduledAt: string; duration: number; patientName: string | null; clientName: string | null }[];
  alerts: { type: 'critical' | 'overdue' | 'pending'; title: string; description: string; patientId?: string }[];
  callbacks: { id: string; title: string; status: ApptStatus; scheduledAt: string; patientName: string | null; clientName: string | null }[];
  recentRecords: { id: string; labNumber: string | null; status: string; createdAt: string; patientName: string | null; specimenType: string | null }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const CARD = 'rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)]';
const midMins = (iso: string) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const timeRange = (iso: string, dur: number) => `${fmtTime(iso)} – ${fmtTime(new Date(new Date(iso).getTime() + dur * 60000).toISOString())}`;
const relDate = (iso: string) => {
  const d = new Date(iso); const t = new Date(); const y = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === t.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// Status → block/badge palette (zero orange).
const STATUS_UI: Record<ApptStatus, { bar: string; bg: string; badgeBg: string; label: string }> = {
  SCHEDULED: { bar: '#4F46E5', bg: '#EEF3FF', badgeBg: '#E0E7FF', label: 'Scheduled' },
  CONFIRMED: { bar: '#4F46E5', bg: '#EEF3FF', badgeBg: '#E0E7FF', label: 'Confirmed' },
  IN_PROGRESS: { bar: '#8B5CF6', bg: '#F5F0FF', badgeBg: '#EDE9FE', label: 'In Progress' },
  COMPLETED: { bar: '#22C55E', bg: '#F0FDF4', badgeBg: '#DCFCE7', label: 'Completed' },
  MISSED: { bar: '#EF4444', bg: '#FEF2F2', badgeBg: '#FEE2E2', label: 'Missed' },
  CANCELLED: { bar: '#9CA3AF', bg: '#F9FAFB', badgeBg: '#F3F4F6', label: 'Cancelled' },
};
const TYPE_LABEL: Record<ApptType, string> = { COLLECTION: 'Collection', CALLBACK: 'Callback', CONSULTATION: 'Consultation', FOLLOWUP: 'Follow-up' };

// Record status → lab-results badge + action.
function recordUi(status: string): { badgeBg: string; badgeText: string; action: string; actionColor: string } {
  if (['Approved', 'Billed', 'Paid'].includes(status)) return { badgeBg: '#DCFCE7', badgeText: '#16A34A', action: 'View report', actionColor: '#4F7DF9' };
  if (status === 'Resulted') return { badgeBg: '#EDE9FE', badgeText: '#6D28D9', action: 'Review', actionColor: '#4F46E5' };
  if (['Failed', 'Disabled', 'OnHold'].includes(status)) return { badgeBg: '#FEE2E2', badgeText: '#DC2626', action: 'Review', actionColor: '#DC2626' };
  return { badgeBg: '#E0EAFE', badgeText: '#2563EB', action: 'Track', actionColor: '#6B7280' };
}

const ALERT_UI = {
  critical: { Icon: FileText, color: '#8B5CF6', bg: '#F5F3FF' },
  overdue: { Icon: Clock, color: '#EF4444', bg: '#FEF2F2' },
  pending: { Icon: FileText, color: '#4F46E5', bg: '#EEF3FF' },
} as const;

// ─── Page ────────────────────────────────────────────────────────────────────
export default function AppointmentsPage() {
  const router = useRouter();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const qc = useQueryClient();

  const { data: me } = useQuery<{ firstName?: string }>({ queryKey: ['auth-me'], queryFn: () => api.get('/auth/me').then((r) => r.data) });
  const { data, isLoading } = useQuery<Overview>({ queryKey: ['appointments-overview'], queryFn: () => api.get('/appointments/overview').then((r) => r.data) });

  const greetHour = new Date().getHours();
  const greeting = greetHour < 12 ? 'Good morning' : greetHour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = me?.firstName || 'there';

  const matches = (s: string | null | undefined) => !search.trim() || (s ?? '').toLowerCase().includes(search.trim().toLowerCase());
  const schedule = (data?.todaySchedule ?? []).filter((a) => matches(a.patientName) || matches(a.title) || matches(a.id));
  const records = (data?.recentRecords ?? []).filter((r) => matches(r.patientName) || matches(r.labNumber) || matches(r.id));

  return (
    <div className="min-h-full" style={{ background: '#F8FAFC' }}>
      {/* ── Greeting row ── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-bold leading-tight tracking-tight text-[#0F172A]">{greeting}, {firstName}!</h1>
          <p className="mt-2 text-[16px] text-[#6B7280]">Here&apos;s your day at a glance.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-[280px] items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-4 text-[#9CA3AF]">
            <Search size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by Appointment ID"
              className="w-full border-none bg-transparent text-[14px] text-[#0F172A] outline-none placeholder:text-[#9CA3AF]" />
          </div>
          {can('appointment:manage') && (
            <button onClick={() => setModalOpen(true)}
              className="flex h-11 items-center gap-2 rounded-full bg-[#4F46E5] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#4338CA]">
              <Plus size={17} /> New
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid h-64 place-items-center text-[#9CA3AF]">Loading your day…</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_2.2fr_1.35fr]">
          {/* ── LEFT ── */}
          <div className="flex min-w-0 flex-col gap-5">
            <div className="grid grid-cols-2 gap-4">
              <Kpi icon={Calendar} label="Appointments" value={data?.kpis.scheduledToday ?? 0} sub="pending confirmations" />
              <Kpi icon={UserX} label="Missed visits" value={data?.kpis.missed ?? 0} sub="View contact details" />
              <Kpi icon={Video} label="Callbacks" value={data?.kpis.pendingCallbacks ?? 0} sub="awaiting response" />
              <Kpi icon={FileText} label="Lab Reports" value={data?.kpis.pendingReports ?? 0} sub="require review" />
            </div>
            <CallbacksPanel callbacks={data?.callbacks ?? []} />
          </div>

          {/* ── CENTER ── */}
          <div className="flex min-w-0 flex-col gap-5">
            <ScheduleCard schedule={schedule} />
            <LabResultsCard records={records} onOpen={(id) => router.push(`/records/${id}`)} />
          </div>

          {/* ── RIGHT ── */}
          <AlertsCard alerts={data?.alerts ?? []} onOpen={(a) => router.push(a.patientId ? `/patients/${a.patientId}` : '/records')} />
        </div>
      )}

      {modalOpen && (
        <NewAppointmentModal
          onClose={() => setModalOpen(false)}
          onCreated={() => { setModalOpen(false); qc.invalidateQueries({ queryKey: ['appointments-overview'] }); }}
        />
      )}
    </div>
  );
}

// ─── KPI card ────────────────────────────────────────────────────────────────
function Kpi({ icon: Icon, label, value, sub }: { icon: any; label: string; value: number; sub: string }) {
  return (
    <div className={`${CARD} flex flex-col p-6`}>
      <div className="flex items-center gap-2.5 text-[#6B7280]">
        <Icon size={19} className="shrink-0" />
        <span className="truncate whitespace-nowrap text-[15px] font-medium">{label}</span>
      </div>
      <div className="mt-4 text-[38px] font-bold leading-none text-[#0F172A]">{value}</div>
      <div className="mt-5 border-t border-[#F1F3F7] pt-3 text-[12px] text-[#9CA3AF]">{sub}</div>
    </div>
  );
}

// ─── Callbacks panel ─────────────────────────────────────────────────────────
function CallbacksPanel({ callbacks }: { callbacks: Overview['callbacks'] }) {
  return (
    <div className={`${CARD} p-6`}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[20px] font-bold text-[#0F172A]">Pending Callbacks</h2>
        <button aria-label="More" className="grid h-8 w-8 place-items-center rounded-lg text-[#9CA3AF] hover:bg-[#F3F4F6]"><MoreHorizontal size={18} /></button>
      </div>
      {callbacks.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-[#9CA3AF]">No pending callbacks</div>
      ) : (
        <div className="flex flex-col gap-3">
          {callbacks.map((c) => {
            const live = c.status === 'IN_PROGRESS';
            const name = c.patientName || c.clientName || c.title;
            return (
              <div key={c.id} className={`rounded-2xl p-4 ${live ? 'bg-[#F2F4FF]' : 'border border-[#F1F3F7]'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-bold text-[#0F172A]">{name}</span>
                  <button aria-label="Video" className="grid h-9 w-9 place-items-center rounded-xl border border-[#E5E7EB] bg-white text-[#6B7280] hover:text-[#0F172A]"><Video size={16} /></button>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-[13px]">
                  {live ? (
                    <><span className="h-2 w-2 rounded-full bg-[#22C55E]" /><span className="font-semibold text-[#16A34A]">Live</span><span className="text-[#9CA3AF]">· In progress</span></>
                  ) : (
                    <><span className="h-2 w-2 rounded-full bg-[#D1D5DB]" /><span className="text-[#9CA3AF]">Preparing</span></>
                  )}
                </div>
                <button className={`mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold transition-colors ${
                  live ? 'bg-[#4F46E5] text-white hover:bg-[#4338CA]' : 'bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]'}`}>
                  {live ? <Phone size={15} /> : <Video size={15} />}
                  {live ? 'Join call' : 'Start session'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Today's schedule (timeline) ─────────────────────────────────────────────
const PX_PER_MIN = 4.2;
const LANE_W = 44;

function ScheduleCard({ schedule }: { schedule: Overview['todaySchedule'] }) {
  const { lanes, cols, totalWidth, baseMin } = useMemo(() => {
    if (!schedule.length) return { lanes: [] as (Overview['todaySchedule'][number] & { startMin: number; endMin: number })[][], cols: [] as number[], totalWidth: 0, baseMin: 0 };
    const items = schedule.map((a) => ({ ...a, startMin: midMins(a.scheduledAt), endMin: midMins(a.scheduledAt) + a.duration }));
    const startH = Math.max(7, Math.floor(Math.min(...items.map((i) => i.startMin)) / 60));
    const endH = Math.min(20, Math.ceil(Math.max(...items.map((i) => i.endMin)) / 60));
    const base = startH * 60;
    const colList: number[] = [];
    for (let m = base; m < endH * 60; m += 30) colList.push(m);
    // Greedy lane assignment so overlapping appointments stack into rows.
    const sorted = [...items].sort((a, b) => a.startMin - b.startMin);
    const laneEnds: number[] = [];
    const out: (typeof items)[] = [];
    for (const it of sorted) {
      let li = laneEnds.findIndex((e) => e <= it.startMin);
      if (li === -1) { li = laneEnds.length; laneEnds.push(it.endMin); out.push([]); }
      else laneEnds[li] = it.endMin;
      out[li].push(it);
    }
    return { lanes: out, cols: colList, totalWidth: colList.length * 30 * PX_PER_MIN, baseMin: base };
  }, [schedule]);

  return (
    <div className={`${CARD} p-6`}>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h2 className="text-[22px] font-bold text-[#0F172A]">Today&apos;s Schedule</h2>
          <p className="mt-1 text-[14px] text-[#6B7280]">Track collections and callbacks in real time.</p>
        </div>
        <button aria-label="Expand" className="grid h-9 w-9 place-items-center rounded-lg text-[#6B7280] hover:bg-[#F3F4F6]"><Maximize2 size={16} /></button>
      </div>

      {schedule.length === 0 ? (
        <div className="flex h-52 flex-col items-center justify-center gap-2 text-[#9CA3AF]">
          <Calendar size={28} /><span className="text-[13px]">No appointments scheduled today</span>
        </div>
      ) : (
        <div className="overflow-x-auto pb-1">
          <div className="overflow-hidden rounded-2xl border border-[#EEF2F7]" style={{ minWidth: totalWidth + LANE_W }}>
            {/* Time axis */}
            <div className="flex border-b border-[#EEF2F7] bg-[#FBFCFE]">
              <div style={{ width: LANE_W }} className="shrink-0 border-r border-[#EEF2F7] py-3 text-center text-[11px] font-semibold text-[#9CA3AF]">GMT</div>
              {cols.map((m) => (
                <div key={m} style={{ width: 30 * PX_PER_MIN }} className="shrink-0 border-r border-[#EEF2F7] py-3 pl-3 text-[12px] font-medium text-[#6B7280] last:border-r-0">
                  {new Date(new Date().setHours(Math.floor(m / 60), m % 60, 0, 0)).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </div>
              ))}
            </div>
            {/* Lanes */}
            <div className="divide-y divide-[#EEF2F7]">
              {lanes.map((lane, i) => (
                <div key={i} className="flex" style={{ height: 122 }}>
                  <div style={{ width: LANE_W }} className="grid shrink-0 place-items-center border-r border-[#EEF2F7] text-[13px] font-semibold text-[#9CA3AF]">{i + 1}</div>
                  <div className="relative shrink-0" style={{ width: totalWidth }}>
                    {cols.map((m) => <div key={m} className="absolute top-0 h-full border-r border-[#F1F3F7] last:border-r-0" style={{ left: (m - baseMin) * PX_PER_MIN, width: 30 * PX_PER_MIN }} />)}
                    {lane.map((a) => {
                      const ui = STATUS_UI[a.status];
                      const left = (midMins(a.scheduledAt) - baseMin) * PX_PER_MIN;
                      const width = Math.max(a.duration * PX_PER_MIN - 10, 100);
                      return (
                        <div key={a.id} className="absolute top-3.5 overflow-hidden rounded-xl p-3"
                          style={{ left: left + 5, width, background: ui.bg, borderLeft: `3px solid ${ui.bar}` }}>
                          <div className="text-[11px] text-[#9CA3AF]">{timeRange(a.scheduledAt, a.duration)}</div>
                          <div className="mt-0.5 truncate text-[14px] font-semibold text-[#0F172A]">{a.patientName || a.title}</div>
                          <div className="truncate text-[12px] text-[#6B7280]">{TYPE_LABEL[a.type]}</div>
                          <span className="mt-1.5 inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold" style={{ background: ui.badgeBg, color: ui.bar }}>{ui.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Latest lab results ──────────────────────────────────────────────────────
function LabResultsCard({ records, onOpen }: { records: Overview['recentRecords']; onOpen: (id: string) => void }) {
  return (
    <div className={`${CARD} p-6`}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[22px] font-bold text-[#0F172A]">Latest Lab Results</h2>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 rounded-lg border border-[#EEF2F7] px-3 py-1.5 text-[13px] font-medium text-[#6B7280] hover:bg-[#F9FAFB]"><ArrowUpDown size={14} /> Sort</button>
          <button className="flex items-center gap-1.5 rounded-lg border border-[#EEF2F7] px-3 py-1.5 text-[13px] font-medium text-[#6B7280] hover:bg-[#F9FAFB]"><Filter size={14} /> Filter</button>
          <button aria-label="More" className="grid h-8 w-8 place-items-center rounded-lg text-[#9CA3AF] hover:bg-[#F3F4F6]"><MoreHorizontal size={18} /></button>
        </div>
      </div>
      {records.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-[#9CA3AF]">No recent lab results</div>
      ) : (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="text-[12px] font-medium uppercase tracking-wide text-[#9CA3AF]">
              <th className="pb-3 font-medium">Patient Name</th>
              <th className="pb-3 font-medium">Test</th>
              <th className="pb-3 font-medium">Status</th>
              <th className="pb-3 font-medium">Date</th>
              <th className="pb-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => {
              const ui = recordUi(r.status);
              return (
                <tr key={r.id} className="border-t border-[#F3F4F6] transition-colors hover:bg-[#F9FAFB]">
                  <td className="py-3.5 text-[14px] font-semibold text-[#0F172A]">{r.patientName ?? '—'}</td>
                  <td className="py-3.5 text-[14px] text-[#6B7280]">{r.specimenType ?? r.labNumber ?? '—'}</td>
                  <td className="py-3.5"><span className="inline-block rounded-md px-2.5 py-1 text-[12px] font-semibold" style={{ background: ui.badgeBg, color: ui.badgeText }}>{r.status}</span></td>
                  <td className="py-3.5 text-[14px] text-[#6B7280]">{relDate(r.createdAt)}</td>
                  <td className="py-3.5 text-right">
                    <button onClick={() => onOpen(r.id)} className="text-[14px] font-semibold hover:underline" style={{ color: ui.actionColor }}>{ui.action}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Important alerts ────────────────────────────────────────────────────────
function AlertsCard({ alerts, onOpen }: { alerts: Overview['alerts']; onOpen: (a: Overview['alerts'][number]) => void }) {
  return (
    <div className={`${CARD} h-fit min-w-0 p-6`}>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-[22px] font-bold text-[#0F172A]">Important Alerts</h2>
        <button aria-label="More" className="grid h-8 w-8 place-items-center rounded-lg text-[#9CA3AF] hover:bg-[#F3F4F6]"><MoreHorizontal size={18} /></button>
      </div>
      {alerts.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-[#9CA3AF]">No alerts right now</div>
      ) : (
        <div className="flex flex-col gap-4">
          {alerts.map((a, i) => {
            const ui = ALERT_UI[a.type];
            return (
              <div key={i} className="rounded-2xl border border-[#EEF2F7] p-5">
                <div className="flex items-start gap-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: ui.bg, color: ui.color }}>
                    {a.type === 'critical' ? <AlertTriangle size={18} /> : <ui.Icon size={18} />}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[15px] font-bold text-[#0F172A]">{a.title}</div>
                    <div className="mt-1 text-[13px] leading-relaxed text-[#6B7280]">{a.description}</div>
                  </div>
                </div>
                <button onClick={() => onOpen(a)} className="mt-3.5 flex items-center gap-1.5 text-[14px] font-semibold text-[#4F46E5] hover:underline">
                  Open patient record <ArrowRight size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── New appointment modal ───────────────────────────────────────────────────
function NewAppointmentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { message } = App.useApp();
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ApptType>('COLLECTION');
  const [patientId, setPatientId] = useState<string>();
  const [clientId, setClientId] = useState<string>();
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState(30);
  const [notes, setNotes] = useState('');

  const create = useMutation({
    mutationFn: () => api.post('/appointment', {
      title: title.trim() || `${TYPE_LABEL[type]} appointment`,
      type, scheduledAt: new Date(`${date}T${time}`).toISOString(), duration,
      patientId, clientId, notes: notes.trim() || undefined,
    }).then((r) => r.data),
    onSuccess: () => { message.success('Appointment created'); onCreated(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Could not create appointment'),
  });

  const inputCls = 'h-11 w-full rounded-[10px] border border-[#E2E8F0] bg-white px-3.5 text-[14px] text-[#0F172A] outline-none transition-colors focus:border-[#4F46E5]';
  const labelCls = 'text-[13px] font-semibold text-[#0F172A]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[20px] font-bold text-[#0F172A]">New appointment</div>
            <div className="mt-0.5 text-[14px] text-[#6B7280]">Schedule a collection, callback or consult.</div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#9CA3AF] hover:bg-[#F3F4F6]"><X size={18} /></button>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Title</span>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${TYPE_LABEL[type]} appointment`} className={inputCls} />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className={labelCls}>Patient</span>
            <PatientSelect value={patientId} onChange={setPatientId} placeholder="Search a patient" />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={labelCls}>Client</span>
            <ClientSelect value={clientId} onChange={setClientId} placeholder="Search a client" />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={labelCls}>Type</span>
            <div className="relative">
              <select value={type} onChange={(e) => setType(e.target.value as ApptType)} className={`${inputCls} cursor-pointer appearance-none pr-9`}>
                {(Object.keys(TYPE_LABEL) as ApptType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="col-span-1 flex flex-col gap-1.5">
              <span className={labelCls}>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </label>
            <label className="col-span-1 flex flex-col gap-1.5">
              <span className={labelCls}>Time</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
            </label>
            <label className="col-span-1 flex flex-col gap-1.5">
              <span className={labelCls}>Duration</span>
              <div className="relative">
                <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={`${inputCls} cursor-pointer appearance-none pr-9`}>
                  {[15, 30, 45, 60].map((d) => <option key={d} value={d}>{d} min</option>)}
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
              </div>
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional" className="w-full rounded-[10px] border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-[14px] text-[#0F172A] outline-none transition-colors focus:border-[#4F46E5]" />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2.5">
          <button onClick={onClose} className="h-11 rounded-[10px] border border-[#E2E8F0] px-5 text-[14px] font-semibold text-[#6B7280] hover:text-[#0F172A]">Cancel</button>
          <button onClick={() => create.mutate()} disabled={create.isPending}
            className="h-11 rounded-[10px] bg-[#4F46E5] px-6 text-[14px] font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:opacity-50">
            {create.isPending ? 'Creating…' : 'Create appointment'}
          </button>
        </div>
      </div>
    </div>
  );
}
