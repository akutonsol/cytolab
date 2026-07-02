'use client';

import { useState } from 'react';
import { App } from 'antd';
import {
  AlertTriangle, ArrowUpRight, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, Clock, FlaskConical,
  Maximize2, MoreHorizontal, Package, Pencil, Plus, Search, Star,
} from 'lucide-react';
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis } from 'recharts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { RecordFormDrawer } from '@/components/RecordFormDrawer';
import type { FormType } from '@/lib/specimen-types';

interface Rec {
  id: string; labNumber?: string | null; identifier: string; formType?: string | null; status: string; urgent: boolean;
  specimenDate?: string | null; createdAt: string;
  patient?: { firstName: string; lastName: string; registrationNo?: string };
  specimens?: { id: string; type?: string }[];
  statusHistory?: { status: string; createdAt: string }[];
}

const SPECIMEN: Record<string, string> = {
  ENDOCERV_ASP: 'Endocervical asp.', CERV_SCRAP: 'Cervical scrape', VAG_POOL: 'Vaginal pool', URINE: 'Urine cytology',
  CSF: 'CSF', PLEURAL_FLD: 'Pleural fluid', BREAST_ASP: 'Breast asp.', JOINT_ASP: 'Joint asp.', SYNOVIAL_FLD: 'Synovial fluid', OTHER: 'Other',
};
const GREEN = ['Approved', 'Billed', 'Paid', 'Completed'];
const RED = ['Failed', 'Disabled'];
const PROCESSING = ['Processing', 'Partial', 'Submitted'];
const OPEN = ['Pending', 'Submitted', 'Processing', 'Partial', 'Completed', 'Resulted'];
const ALL_STATUSES = ['Pending', 'Submitted', 'Processing', 'Partial', 'Completed', 'Resulted', 'Approved', 'Billed', 'Paid', 'OnHold', 'Failed'];

const specLabel = (t?: string | null) => (t ? SPECIMEN[t] ?? t : null);
const patientName = (r: Rec) => (r.patient ? `${r.patient.firstName} ${r.patient.lastName}`.trim() : '—');
const dateFmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const clock = (d: string) => new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const sameDay = (a: string | number, b: string | number) => new Date(a).toDateString() === new Date(b).toDateString();
const ageDays = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
const priorityOf = (r: Rec) => (r.urgent ? 'High' : ageDays(r.createdAt) > 7 ? 'Medium' : 'Low');
const relTime = (d: string) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (sameDay(d, Date.now())) return `Today, ${clock(d)}`;
  if (sameDay(d, Date.now() - 86_400_000)) return 'Yesterday';
  return `${Math.floor(s / 86400)}d ago`;
};

// Priority pill palette (severity colours — amber/red/green, no accent-orange).
const PRIORITY = {
  High: { bg: '#fef2f2', fg: '#dc2626' },
  Medium: { bg: '#fff7ed', fg: '#c2410c' },
  Low: { bg: '#f0fdf4', fg: '#16a34a' },
} as const;
// Status badge colours (no orange/gold).
const statusStyle = (s: string) =>
  GREEN.includes(s) ? { bg: '#f0fdf4', fg: '#16a34a' }
    : RED.includes(s) ? { bg: '#fef2f2', fg: '#dc2626' }
      : s === 'OnHold' ? { bg: '#f1f5f9', fg: '#64748b' }
        : { bg: '#eef3ff', fg: '#4f7df9' };

function KpiCard({ label, sub, value, Icon }: { label: string; sub: string; value: number; Icon: any }) {
  return (
    <div className="flex flex-col rounded-[16px] border border-card bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between">
        <span className="text-[15px] font-bold text-text">{label}</span>
        <Icon size={18} className="text-text-tertiary" />
      </div>
      <span className="mt-0.5 text-caption font-medium text-text-tertiary">{sub}</span>
      <div className="mt-4 flex items-end gap-2">
        <span className="text-[34px] font-extrabold leading-none tracking-tight text-text">{value.toLocaleString()}</span>
        <ArrowUpRight size={16} className="mb-1 text-text-tertiary" />
      </div>
    </div>
  );
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SamplesPage() {
  const { can } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const pageSize = 11;
  const [chooseOpen, setChooseOpen] = useState(false);
  const [drawer, setDrawer] = useState<{ formType: FormType; recordId?: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [q, setQ] = useState('');
  const [goal, setGoal] = useState(150);
  const [editingGoal, setEditingGoal] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ['records', page, pageSize],
    queryFn: () => api.get<Paginated<Rec>>('/specimens', { params: { page, pageSize } }).then((r) => r.data),
  });
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Stats window (same endpoint) for the KPI cards + gauge.
  const { data: statsData } = useQuery({
    queryKey: ['records-stats'],
    queryFn: () => api.get<Paginated<Rec>>('/specimens', { params: { page: 1, pageSize: 100 } }).then((r) => r.data),
  });
  const all = statsData?.data ?? [];

  const { data: recentData } = useQuery({
    queryKey: ['records-recent'],
    queryFn: () => api.get<Paginated<Rec>>('/specimens/recent', { params: { pageSize: 14 } }).then((r) => r.data),
  });
  const recent = recentData?.data ?? [];

  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const startMonth = new Date(); startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0);
  const kpis = {
    newToday: all.filter((r) => new Date(r.createdAt) >= startToday).length,
    completed: all.filter((r) => GREEN.includes(r.status) && new Date(r.createdAt) >= startMonth).length,
    processing: all.filter((r) => PROCESSING.includes(r.status)).length,
    delayed: all.filter((r) => r.urgent && OPEN.includes(r.status)).length,
  };
  const approved = all.filter((r) => ['Approved', 'Billed', 'Paid'].includes(r.status)).length;
  const approvedPct = all.length ? Math.round((approved / all.length) * 100) : 0;

  // Bar chart: samples processed bucketed by day-of-week. Uses the wider stats
  // window (recent-14 clusters on a single day, leaving the chart empty).
  const chartSrc = all.length ? all : recent;
  const buckets = DOW.map((d, i) => ({ day: d[0], full: d, v: chartSrc.filter((r) => new Date(r.createdAt).getDay() === i).length }));
  const peak = Math.max(1, ...buckets.map((b) => b.v));
  const chart = buckets.map((b) => ({ ...b, peak: b.v === peak && b.v > 0 }));
  const weekTotal = chartSrc.length;

  // Filtered current-page rows.
  const view = rows.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (priorityFilter && priorityOf(r) !== priorityFilter) return false;
    if (q) { const s = q.toLowerCase(); if (!(r.labNumber ?? '').toLowerCase().includes(s) && !patientName(r).toLowerCase().includes(s)) return false; }
    return true;
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/specimen/delete/${id}`),
    onSuccess: () => { message.success('Sample deleted'); qc.invalidateQueries({ queryKey: ['records'] }); qc.invalidateQueries({ queryKey: ['records-stats'] }); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Could not delete'),
  });
  const openEdit = (r: Rec) => { setMenuId(null); setDrawer({ formType: r.formType === 'Gynecology' ? 'Gynecology' : 'NonGynecology', recordId: r.id }); };

  const selCls = 'h-10 appearance-none rounded-[10px] border border-card bg-surface pl-3 pr-8 text-small font-medium text-text outline-none focus:border-primary';

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
      {/* ================= LEFT COLUMN ================= */}
      <div className="flex min-w-0 flex-col gap-6">
        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label="New Samples" sub="Today" value={kpis.newToday} Icon={Package} />
          <KpiCard label="Completed" sub="This Month" value={kpis.completed} Icon={CheckCircle} />
          <KpiCard label="Processing" sub="In progress" value={kpis.processing} Icon={Clock} />
          <KpiCard label="Delayed" sub="Requires attention" value={kpis.delayed} Icon={AlertTriangle} />
        </div>

        {/* Samples table */}
        <div className="flex flex-col rounded-[16px] border border-card bg-surface shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
            <h2 className="text-[20px] font-extrabold tracking-tight text-text">Samples</h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selCls}>
                  <option value="">All statuses</option>
                  {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
              </div>
              <div className="relative">
                <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className={selCls}>
                  <option value="">All priorities</option>
                  {['High', 'Medium', 'Low'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
              </div>
              <div className="flex h-10 items-center gap-2 rounded-[10px] border border-card bg-surface px-3 text-text-tertiary">
                <Search size={15} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="w-28 border-none bg-transparent text-small text-text outline-none placeholder:text-text-tertiary" />
              </div>
              {can('record:create') && (
                <button onClick={() => setChooseOpen(true)} className="flex h-10 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-small font-bold text-white hover:bg-primary-hover"><Plus size={16} /> New Sample</button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto px-2 pb-2 pt-3">
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr className="text-left text-caption font-bold uppercase tracking-wide text-text-tertiary">
                  <th className="px-4 py-3">Lab#</th><th className="px-4 py-3">Patient</th><th className="px-4 py-3">Specimen type</th>
                  <th className="px-4 py-3">Priority</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Due Date</th><th className="w-10 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {isFetching && view.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-small text-text-tertiary">Loading samples…</td></tr>}
                {!isFetching && view.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-small text-text-tertiary">No samples match your filters.</td></tr>}
                {view.map((r) => {
                  const pr = priorityOf(r); const ps = PRIORITY[pr as keyof typeof PRIORITY]; const st = statusStyle(r.status);
                  const spec = specLabel(r.specimens?.[0]?.type);
                  return (
                    <tr key={r.id} className="border-t border-border transition-colors hover:bg-[#f8fafd]">
                      <td className="px-4 py-3"><span className="font-mono text-small font-semibold text-text">{r.labNumber ?? '—'}</span></td>
                      <td className="px-4 py-3"><span className="text-small font-semibold text-text">{patientName(r)}</span></td>
                      <td className="px-4 py-3">
                        {spec ? <span className="text-small font-medium text-text-secondary">{spec}</span>
                          : r.formType ? <span className="inline-flex items-center rounded-pill bg-lightgray px-2.5 py-1 text-caption font-bold text-text-secondary">{r.formType === 'Gynecology' ? 'GYN' : 'NON-GYN'}</span>
                            : <span className="text-small text-text-tertiary">—</span>}
                      </td>
                      <td className="px-4 py-3"><span className="inline-flex items-center rounded-pill px-2.5 py-1 text-caption font-bold" style={{ background: ps.bg, color: ps.fg }}>{pr}</span></td>
                      <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-caption font-bold" style={{ background: st.bg, color: st.fg }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: st.fg }} />{r.status}</span></td>
                      <td className="px-4 py-3"><span className="text-small font-medium text-text-secondary">{dateFmt(r.specimenDate)}</span></td>
                      <td className="relative px-2 py-3">
                        <button onClick={() => setMenuId(menuId === r.id ? null : r.id)} className="text-text-tertiary hover:text-text"><MoreHorizontal size={18} /></button>
                        {menuId === r.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
                            <div className="absolute right-6 top-11 z-20 w-32 overflow-hidden rounded-[10px] border border-card bg-white py-1 shadow-float">
                              <button onClick={() => openEdit(r)} className="block w-full px-3 py-2 text-left text-small font-medium text-text hover:bg-[#f6f8fc]">View</button>
                              {can('record:change') && <button onClick={() => openEdit(r)} className="block w-full px-3 py-2 text-left text-small font-medium text-text hover:bg-[#f6f8fc]">Edit</button>}
                              {can('record:delete') && <button onClick={() => { setMenuId(null); if (confirm(`Delete sample ${r.labNumber ?? ''}?`)) del.mutate(r.id); }} className="block w-full px-3 py-2 text-left text-small font-medium text-danger hover:bg-danger-soft">Delete</button>}
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
            <div className="flex items-center gap-2.5">
              <Ring pct={approvedPct} />
              <span className="text-caption font-bold text-text-secondary">{approvedPct}% completed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="grid h-9 w-9 place-items-center rounded-full border border-card text-text-secondary disabled:opacity-40 hover:text-text"><ChevronLeft size={16} /></button>
              {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                const n = page <= 2 ? i + 1 : page - 1 + i;
                if (n > totalPages) return null;
                return <button key={n} onClick={() => setPage(n)} className="grid h-9 min-w-9 place-items-center rounded-full px-2 text-small font-bold" style={{ background: n === page ? '#eef3ff' : 'transparent', color: n === page ? '#4f7df9' : '#6b7280' }}>{n}</button>;
              })}
              <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="grid h-9 w-9 place-items-center rounded-full border border-card text-text-secondary disabled:opacity-40 hover:text-text"><ChevronRight size={16} /></button>
            </div>
            <div className="flex items-center gap-2">
              {can('record:create') && <button onClick={() => setChooseOpen(true)} className="grid h-9 w-9 place-items-center rounded-full bg-primary text-white hover:bg-primary-hover"><Plus size={17} /></button>}
              <button className="grid h-9 w-9 place-items-center rounded-full border border-card text-text-secondary hover:text-text"><Maximize2 size={15} /></button>
            </div>
          </div>
        </div>
      </div>

      {/* ================= RIGHT SIDEBAR ================= */}
      <div className="flex flex-col gap-6">
        {/* Samples Processed */}
        <div className="rounded-[16px] border border-card bg-surface p-5 shadow-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-primary-soft text-primary"><Package size={17} /></span>
              <div>
                <div className="text-[15px] font-extrabold text-text">Samples Processed</div>
                <div className="text-tiny font-medium text-text-tertiary">Last 14 samples</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-pill border border-card px-2.5 py-1 text-caption font-bold text-text-secondary">Week <ChevronDown size={13} /></span>
              <button className="grid h-8 w-8 place-items-center rounded-full border border-card text-text-secondary"><ArrowUpRight size={14} /></button>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div>
              <div className="text-[30px] font-extrabold leading-none tracking-tight text-text">{weekTotal}</div>
              <div className="mt-1 text-caption font-medium text-text-tertiary">Total samples processed</div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-pill bg-text px-2.5 py-1 text-tiny font-semibold text-white"><Star size={11} /> Load peak</span>
          </div>
          <div className="mt-3" style={{ width: '100%', height: 140 }}>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={chart} margin={{ top: 22, right: 4, bottom: 0, left: 4 }} barCategoryGap="26%">
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <Bar dataKey="v" radius={[5, 5, 5, 5]} isAnimationActive={false}>
                  <LabelList dataKey="v" position="top" style={{ fontSize: 11, fontWeight: 700, fill: '#6b7280' }} formatter={(v: any) => (v ? v : '')} />
                  {chart.map((c, i) => <Cell key={i} fill={c.peak ? '#4f7df9' : '#e2e8f0'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Completion Rate */}
        <div className="rounded-[16px] border border-card bg-surface p-5 shadow-card">
          <div className="text-[15px] font-extrabold text-text">Completion Rate</div>
          <div className="mt-0.5 text-caption font-medium text-text-tertiary">Track today&apos;s fulfillment rate to keep operations on schedule.</div>
          <div className="mt-2 flex items-center justify-center"><Gauge value={approved} goal={goal} /></div>
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-text text-white"><Pencil size={14} /></span>
              <span className="text-small font-bold text-text">Change Target</span>
            </div>
            {editingGoal ? (
              <input autoFocus type="number" defaultValue={goal} onBlur={(e) => { setGoal(Math.max(1, +e.target.value || goal)); setEditingGoal(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { setGoal(Math.max(1, +(e.target as HTMLInputElement).value || goal)); setEditingGoal(false); } }}
                className="h-9 w-20 rounded-[10px] border border-primary px-2 text-small font-bold text-text outline-none" />
            ) : (
              <button onClick={() => setEditingGoal(true)} className="text-small font-bold text-primary hover:underline">{goal}</button>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-[16px] border border-card bg-surface p-5 shadow-card">
          <div className="flex items-center justify-between">
            <div className="text-[15px] font-extrabold text-text">Recent Activity</div>
            <button className="text-caption font-semibold text-text-secondary hover:text-text">See All</button>
          </div>
          <div className="mt-3 flex flex-col gap-3.5">
            {recent.length === 0 && <div className="py-4 text-center text-small text-text-tertiary">No recent activity.</div>}
            {recent.slice(0, 5).map((r) => {
              const isGreen = GREEN.includes(r.status); const isRed = r.urgent || RED.includes(r.status);
              const hue = isGreen ? '#16a34a' : isRed ? '#dc2626' : '#4f7df9';
              const action = isGreen ? 'marked as Completed' : isRed ? (r.urgent ? 'flagged urgent' : 'failed') : `${r.status.toLowerCase()}`;
              const when = r.statusHistory?.[r.statusHistory.length - 1]?.createdAt ?? r.createdAt;
              return (
                <div key={r.id} className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: `${hue}1a`, color: hue }}>
                    {isGreen ? <CheckCircle size={16} /> : isRed ? <AlertTriangle size={16} /> : <Package size={16} />}
                  </span>
                  <div className="min-w-0 flex-1 text-small">
                    <span className="text-text-secondary">Sample </span>
                    <span className="rounded-md bg-text px-1.5 py-0.5 font-mono text-tiny font-bold text-white">{r.labNumber ?? '—'}</span>
                    <span className="text-text-secondary"> {action}</span>
                  </div>
                  <span className="shrink-0 text-tiny font-medium text-text-tertiary">{relTime(when)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Choose form (New Sample) */}
      {chooseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setChooseOpen(false)}>
          <div className="w-full max-w-md rounded-card bg-white p-6 shadow-float" onClick={(e) => e.stopPropagation()}>
            <div className="text-[20px] font-extrabold tracking-tight text-text">New sample</div>
            <div className="mt-0.5 text-small font-medium text-text-secondary">Choose the form type to begin.</div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {(['Gynecology', 'NonGynecology'] as FormType[]).map((ft) => (
                <button key={ft} onClick={() => { setChooseOpen(false); setDrawer({ formType: ft }); }}
                  className="flex flex-col items-center gap-2 rounded-control border border-card py-7 transition-colors hover:border-primary hover:bg-primary-soft">
                  <FlaskConical size={26} className="text-primary" />
                  <span className="text-small font-bold text-text">{ft === 'Gynecology' ? 'Gynecology' : 'Non-Gynecology'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {drawer && <RecordFormDrawer open onClose={() => { setDrawer(null); qc.invalidateQueries({ queryKey: ['records'] }); }} formType={drawer.formType} recordId={drawer.recordId} />}
    </div>
  );
}

function Ring({ pct }: { pct: number }) {
  const size = 34, sw = 4, r = (size - sw) / 2, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e8edf4" strokeWidth={sw} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#16a34a" strokeWidth={sw} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, pct) / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

function Gauge({ value, goal }: { value: number; goal: number }) {
  const size = 190, sw = 14, r = (size - sw) / 2 - 6, cx = size / 2, cy = size / 2;
  const c = 2 * Math.PI * r;
  const arc = 0.72; // 260° sweep, gap at the bottom
  const frac = Math.min(1, goal ? value / goal : 0);
  const start = 135; // degrees (7–8 o'clock)
  const ang = (start + frac * arc * 360) * (Math.PI / 180);
  const mx = cx + r * Math.cos(ang), my = cy + r * Math.sin(ang);
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef2f7" strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={`${arc * c} ${c}`} transform={`rotate(${start} ${cx} ${cy})`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#4f7df9" strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={`${frac * arc * c} ${c}`} transform={`rotate(${start} ${cx} ${cy})`} />
        <circle cx={mx} cy={my} r={5} fill="#fff" stroke="#4f7df9" strokeWidth={3} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 40, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>{value}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#9ca3af' }}>Goal {goal}</span>
      </div>
    </div>
  );
}
