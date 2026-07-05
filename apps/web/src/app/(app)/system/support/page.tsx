'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, CalendarClock, CheckCircle2, Clock, Headset, Megaphone, Plus, Search, Send, X,
} from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// ─── Types ───────────────────────────────────────────────────────────────────
type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'PENDING_RESPONSE' | 'RESOLVED' | 'CLOSED';
type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type TicketCategory = 'BUG' | 'FEATURE_REQUEST' | 'DATA_ISSUE' | 'ACCESS' | 'BILLING' | 'TRAINING' | 'MAINTENANCE' | 'OTHER';

interface Ticket {
  id: string; ticketNumber: string; title: string; description: string;
  category: TicketCategory; priority: TicketPriority; status: TicketStatus;
  submitterType: string; submittedById: string | null; submitterName: string; submitterEmail: string;
  assignedToId: string | null; resolvedAt: string | null; closedAt: string | null;
  resolutionNotes: string | null; slaDeadline: string | null; createdAt: string;
}
interface Comment { id: string; authorName: string; authorType: string; body: string; isInternal: boolean; createdAt: string }
interface TicketDetail extends Ticket { comments: Comment[]; attachments: { id: string; fileName: string; fileUrl: string; fileSize: number }[] }
interface Stats {
  open: number; inProgress: number; pendingResponse: number; resolved: number; closed: number;
  breachedSla: number; avgResolutionHours: number;
  byPriority: Record<string, number>; byCategory: Record<string, number>;
}
interface Win {
  id: string; title: string; description: string | null; scheduledAt: string; durationMinutes: number;
  affectedSystems: string[]; status: string; notifyUsers: boolean; createdAt: string;
}
interface Announcement { id: string; title: string; body: string; type: string; isActive: boolean; showFrom: string; showUntil: string | null }
interface UserLite { id: string; firstName: string; lastName: string; email: string }

// ─── Style tokens (zero-orange: #A16207 pending, #B45309 high amber) ──────────
const CARD = 'rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)]';
const PRIORITY: Record<TicketPriority, { bg: string; fg: string }> = {
  CRITICAL: { bg: '#FEE2E2', fg: '#DC2626' },
  HIGH: { bg: '#FEF3C7', fg: '#B45309' },
  MEDIUM: { bg: '#EEF2FF', fg: '#4F46E5' },
  LOW: { bg: '#F1F5F9', fg: '#64748B' },
};
const STATUS: Record<TicketStatus, { bg: string; fg: string; label: string }> = {
  OPEN: { bg: '#DBEAFE', fg: '#2563EB', label: 'OPEN' },
  IN_PROGRESS: { bg: '#EEF2FF', fg: '#4F46E5', label: 'IN PROGRESS' },
  PENDING_RESPONSE: { bg: '#FEF9C3', fg: '#A16207', label: 'PENDING' },
  RESOLVED: { bg: '#DCFCE7', fg: '#16A34A', label: 'RESOLVED' },
  CLOSED: { bg: '#F1F5F9', fg: '#64748B', label: 'CLOSED' },
};
const ANN_TYPE: Record<string, { bg: string; fg: string }> = {
  INFO: { bg: '#DBEAFE', fg: '#2563EB' },
  WARNING: { bg: '#FEF3C7', fg: '#A16207' },
  CRITICAL: { bg: '#FEE2E2', fg: '#DC2626' },
};
const CATEGORIES: TicketCategory[] = ['BUG', 'FEATURE_REQUEST', 'DATA_ISSUE', 'ACCESS', 'BILLING', 'TRAINING', 'MAINTENANCE', 'OTHER'];
const PRIORITIES: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'PENDING_RESPONSE', 'RESOLVED', 'CLOSED'];
const SYSTEMS = ['API', 'Database', 'Portal', 'Email', 'Storage', 'All Systems'];
const CAT_COLORS = ['#4F46E5', '#7C3AED', '#2563EB', '#0D9488', '#16A34A', '#A16207', '#B45309', '#64748B'];

const cat = (c: string) => c.replace('_', ' ');
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const isBreached = (t: Ticket) => !!t.slaDeadline && ['OPEN', 'IN_PROGRESS', 'PENDING_RESPONSE'].includes(t.status) && new Date(t.slaDeadline) < new Date();

function Badge({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: bg, color: fg }}>{children}</span>;
}
const inputCls = 'h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-3.5 text-sm text-[#0F172A] outline-none focus:border-[#4F46E5]';
const labelCls = 'mb-1.5 block text-[13px] font-semibold text-[#334155]';
const btnPrimary = 'inline-flex items-center gap-2 rounded-xl bg-[#4F46E5] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:opacity-50';
const btnGhost = 'inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC]';

export default function SupportPage() {
  // Route guard (TKT-2026-0004): the management view is superuser-only. The nav
  // hides it, but direct URL navigation must be blocked client-side too (APIs
  // already return 403 — this is defense-in-depth).
  const router = useRouter();
  const { message } = AntdApp.useApp();
  const { claims, hydrated, can } = useAuth();
  const allowed = can('system:health');
  useEffect(() => {
    if (hydrated && claims && !allowed) {
      message.error('Access denied');
      router.replace('/dashboard');
    }
  }, [hydrated, claims, allowed, message, router]);

  const [tab, setTab] = useState<'tickets' | 'maintenance' | 'announcements' | 'analytics'>('tickets');
  const TABS = [
    { key: 'tickets', label: 'Tickets', icon: Headset },
    { key: 'maintenance', label: 'Maintenance', icon: CalendarClock },
    { key: 'announcements', label: 'Announcements', icon: Megaphone },
    { key: 'analytics', label: 'Analytics', icon: CheckCircle2 },
  ] as const;

  // Until claims hydrate, or while an unauthorized user is redirected, render
  // nothing. The (app) layout handles the unauthenticated → /login case.
  if (!hydrated || !claims || !allowed) return null;

  return (
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      <div className="mb-5">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[#0F172A]">Maintenance &amp; Support</h1>
        <p className="mt-1.5 text-[15px] text-[#6B7280]">Support tickets, scheduled maintenance and system announcements.</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-1 rounded-2xl border border-[#EEF2F7] bg-white p-1.5 shadow-sm" style={{ width: 'fit-content' }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
              style={active ? { background: '#4F46E5', color: '#fff' } : { color: '#64748B' }}>
              <t.icon size={16} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'tickets' && <TicketsTab />}
      {tab === 'maintenance' && <MaintenanceTab />}
      {tab === 'announcements' && <AnnouncementsTab />}
      {tab === 'analytics' && <AnalyticsTab />}
    </div>
  );
}

// ═══ Tab 1 — Tickets ══════════════════════════════════════════════════════════
function TicketsTab() {
  const [f, setF] = useState({ status: '', priority: '', category: '', submitterType: '', search: '', startDate: '', endDate: '' });
  const [openId, setOpenId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const { data: stats } = useQuery({ queryKey: ['support-stats'], queryFn: () => api.get<Stats>('/system/support/stats').then((r) => r.data) });
  const { data: users = [] } = useQuery({
    queryKey: ['users-lite'],
    queryFn: () => api.get<UserLite[] | Paginated<UserLite>>('/users').then((r) => (Array.isArray(r.data) ? r.data : r.data.data)),
  });
  const userName = (id?: string | null) => { const u = users.find((x) => x.id === id); return u ? `${u.firstName} ${u.lastName}`.trim() : '—'; };

  const params = useMemo(() => Object.fromEntries(Object.entries(f).filter(([, v]) => v)), [f]);
  const { data: page, isFetching } = useQuery({
    queryKey: ['support-tickets', params],
    queryFn: () => api.get<Paginated<Ticket>>('/system/support/tickets', { params: { ...params, pageSize: 100 } }).then((r) => r.data),
  });
  const rows = page?.data ?? [];

  const KPIS = [
    { label: 'Open', value: stats?.open ?? 0, color: '#2563EB' },
    { label: 'In Progress', value: stats?.inProgress ?? 0, color: '#4F46E5' },
    { label: 'Pending Response', value: stats?.pendingResponse ?? 0, color: '#A16207' },
    { label: 'Breached SLA', value: stats?.breachedSla ?? 0, color: '#DC2626' },
    { label: 'Avg Resolution', value: `${stats?.avgResolutionHours ?? 0}h`, color: '#16A34A' },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {KPIS.map((k) => (
          <div key={k.label} className={`${CARD} p-4`}>
            <div className="text-[26px] font-bold leading-none" style={{ color: k.color }}>{k.value}</div>
            <div className="mt-1.5 text-[12px] font-medium text-[#64748B]">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filters + New */}
      <div className={`${CARD} flex flex-wrap items-center gap-3 p-4`}>
        <div className="flex h-11 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3.5 text-[#9CA3AF]">
          <Search size={16} />
          <input value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} placeholder="Search title or ticket #..." className="w-full border-none bg-transparent text-sm text-[#0F172A] outline-none placeholder:text-[#9CA3AF]" />
        </div>
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm"><option value="">All Statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}</select>
        <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} className="h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm"><option value="">All Priorities</option>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select>
        <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm"><option value="">All Categories</option>{CATEGORIES.map((c) => <option key={c} value={c}>{cat(c)}</option>)}</select>
        <select value={f.submitterType} onChange={(e) => setF({ ...f, submitterType: e.target.value })} className="h-11 rounded-xl border border-[#E2E8F0] px-3 text-sm"><option value="">All Submitters</option><option value="STAFF">Staff</option><option value="CLIENT">Client</option><option value="CONSULTANT">Consultant</option></select>
        <button onClick={() => setNewOpen(true)} className={`${btnPrimary} ml-auto`}><Plus size={16} /> New Ticket</button>
      </div>

      {/* Table */}
      <div className={`${CARD} overflow-hidden p-0`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#EEF2F7] text-[11px] uppercase tracking-wide text-[#94A3B8]">
                {['Ticket #', 'Title', 'Category', 'Priority', 'Submitter', 'Assigned', 'Status', 'SLA', 'Created'].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {isFetching && rows.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-[#94A3B8]">Loading…</td></tr>}
              {!isFetching && rows.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-[#94A3B8]">No tickets found.</td></tr>}
              {rows.map((t) => (
                <tr key={t.id} onClick={() => setOpenId(t.id)} className="cursor-pointer border-b border-[#F1F5F9] transition-colors hover:bg-[#F8FAFC]">
                  <td className="px-4 py-3.5 font-mono text-[13px] font-bold text-[#0F172A]">{t.ticketNumber}</td>
                  <td className="px-4 py-3.5 max-w-[280px] truncate text-[#334155]">{t.title}</td>
                  <td className="px-4 py-3.5"><Badge bg="#F1F5F9" fg="#475569">{cat(t.category)}</Badge></td>
                  <td className="px-4 py-3.5"><Badge bg={PRIORITY[t.priority].bg} fg={PRIORITY[t.priority].fg}>{t.priority}</Badge></td>
                  <td className="px-4 py-3.5 text-[13px] text-[#64748B]">{t.submitterName}<div className="text-[11px] text-[#94A3B8]">{t.submitterType}</div></td>
                  <td className="px-4 py-3.5 text-[13px] text-[#64748B]">{userName(t.assignedToId)}</td>
                  <td className="px-4 py-3.5"><Badge bg={STATUS[t.status].bg} fg={STATUS[t.status].fg}>{STATUS[t.status].label}</Badge></td>
                  <td className="px-4 py-3.5 text-[13px]" style={{ color: isBreached(t) ? '#DC2626' : '#64748B', fontWeight: isBreached(t) ? 700 : 400 }}>{fmtDateTime(t.slaDeadline)}</td>
                  <td className="px-4 py-3.5 text-[13px] text-[#64748B]">{fmtDate(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {newOpen && <NewTicketModal users={users} onClose={() => setNewOpen(false)} />}
      {openId && <TicketDetail id={openId} users={users} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function NewTicketModal({ users, onClose }: { users: UserLite[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [v, setV] = useState({ title: '', description: '', category: 'BUG', priority: 'MEDIUM', assignedToId: '' });
  const m = useMutation({
    mutationFn: () => api.post('/system/support/tickets', { ...v, assignedToId: v.assignedToId || undefined }),
    onSuccess: () => { message.success('Ticket created'); qc.invalidateQueries({ queryKey: ['support-tickets'] }); qc.invalidateQueries({ queryKey: ['support-stats'] }); onClose(); },
    onError: () => message.error('Could not create ticket'),
  });
  return (
    <Modal title="New Ticket" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div><label className={labelCls}>Title</label><input className={inputCls} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></div>
        <div><label className={labelCls}>Description</label><textarea className={`${inputCls} h-24 py-2`} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelCls}>Category</label><select className={inputCls} value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{cat(c)}</option>)}</select></div>
          <div><label className={labelCls}>Priority</label><select className={inputCls} value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
        </div>
        <div><label className={labelCls}>Assign to (optional)</label><select className={inputCls} value={v.assignedToId} onChange={(e) => setV({ ...v, assignedToId: e.target.value })}><option value="">Unassigned</option>{users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}</select></div>
      </div>
      <ModalFooter>
        <button onClick={onClose} className={btnGhost}>Cancel</button>
        <button disabled={!v.title.trim() || !v.description.trim() || m.isPending} onClick={() => m.mutate()} className={btnPrimary}>Create Ticket</button>
      </ModalFooter>
    </Modal>
  );
}

function TicketDetail({ id, users, onClose }: { id: string; users: UserLite[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const { data: t } = useQuery({ queryKey: ['support-ticket', id], queryFn: () => api.get<TicketDetail>(`/system/support/tickets/${id}`).then((r) => r.data) });
  const [comment, setComment] = useState('');
  const [internal, setInternal] = useState(false);
  const userName = (uid?: string | null) => { const u = users.find((x) => x.id === uid); return u ? `${u.firstName} ${u.lastName}`.trim() : 'Unassigned'; };

  const refresh = () => { qc.invalidateQueries({ queryKey: ['support-ticket', id] }); qc.invalidateQueries({ queryKey: ['support-tickets'] }); qc.invalidateQueries({ queryKey: ['support-stats'] }); };
  const patch = useMutation({ mutationFn: (body: any) => api.patch(`/system/support/tickets/${id}`, body), onSuccess: () => { refresh(); message.success('Updated'); }, onError: () => message.error('Update failed') });
  const resolve = useMutation({ mutationFn: () => api.patch(`/system/support/tickets/${id}/resolve`, { resolutionNotes: t?.resolutionNotes ?? undefined }), onSuccess: () => { refresh(); message.success('Resolved'); } });
  const close = useMutation({ mutationFn: () => api.patch(`/system/support/tickets/${id}/close`, {}), onSuccess: () => { refresh(); message.success('Closed'); } });
  const addComment = useMutation({
    mutationFn: () => api.post(`/system/support/tickets/${id}/comments`, { body: comment, isInternal: internal }),
    onSuccess: () => { setComment(''); setInternal(false); refresh(); },
    onError: () => message.error('Could not add comment'),
  });

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[520px] flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#EEF2F7] p-5">
          <div>
            <div className="font-mono text-[13px] font-bold text-[#4F46E5]">{t?.ticketNumber}</div>
            <h2 className="mt-1 text-[18px] font-bold text-[#0F172A]">{t?.title ?? 'Loading…'}</h2>
            {t && <div className="mt-1 text-[13px] text-[#64748B]">{t.submitterName} · {t.submitterType} · {fmtDate(t.createdAt)}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-[#64748B] hover:bg-[#F1F5F9]"><X size={18} /></button>
        </div>

        {t && (
          <div className="flex-1 overflow-y-auto p-5">
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[#334155]">{t.description}</p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Status</label>
                <select className={inputCls} value={t.status} onChange={(e) => patch.mutate({ status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}</select>
              </div>
              <div>
                <label className={labelCls}>Priority</label>
                <select className={inputCls} value={t.priority} onChange={(e) => patch.mutate({ priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Assigned to</label>
                <select className={inputCls} value={t.assignedToId ?? ''} onChange={(e) => patch.mutate({ assignedToId: e.target.value })}><option value="">Unassigned</option>{users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}</select>
              </div>
            </div>

            {isBreached(t) && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[13px] font-semibold text-[#DC2626]"><AlertTriangle size={15} /> SLA breached — due {fmtDateTime(t.slaDeadline)}</div>
            )}

            {/* Comment thread */}
            <div className="mt-6">
              <div className="mb-3 text-[13px] font-bold uppercase tracking-wide text-[#94A3B8]">Activity ({t.comments.length})</div>
              <div className="flex flex-col gap-3">
                {t.comments.length === 0 && <div className="text-[13px] text-[#94A3B8]">No comments yet.</div>}
                {t.comments.map((c) => (
                  <div key={c.id} className="rounded-xl border p-3" style={{ borderColor: c.isInternal ? '#FDE68A' : '#EEF2F7', background: c.isInternal ? '#FFFBEB' : '#fff' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-[#0F172A]">{c.authorName}</span>
                      <span className="text-[11px] text-[#94A3B8]">{fmtDateTime(c.createdAt)}</span>
                    </div>
                    {c.isInternal && <span className="mt-1 inline-block text-[10px] font-bold uppercase text-[#A16207]">Internal note</span>}
                    <p className="mt-1 whitespace-pre-wrap text-[13px] text-[#334155]">{c.body}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3">
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" className={`${inputCls} h-20 py-2`} />
                <div className="mt-2 flex items-center justify-between">
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#64748B]">
                    <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} style={{ accentColor: '#A16207' }} /> Internal note (hidden from client)
                  </label>
                  <button disabled={!comment.trim() || addComment.isPending} onClick={() => addComment.mutate()} className={btnPrimary}><Send size={15} /> Send</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-[#EEF2F7] p-4">
          <button disabled={resolve.isPending || t?.status === 'RESOLVED'} onClick={() => resolve.mutate()} className={`${btnGhost} flex-1 justify-center`} style={{ color: '#16A34A', borderColor: '#BBF7D0' }}><CheckCircle2 size={16} /> Resolve</button>
          <button disabled={close.isPending || t?.status === 'CLOSED'} onClick={() => close.mutate()} className={`${btnGhost} flex-1 justify-center`}>Close</button>
        </div>
      </div>
    </>
  );
}

// ═══ Tab 2 — Maintenance Windows ══════════════════════════════════════════════
function MaintenanceTab() {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [open, setOpen] = useState(false);
  const { data: wins = [] } = useQuery({ queryKey: ['support-windows'], queryFn: () => api.get<Win[]>('/system/support/maintenance-windows').then((r) => r.data) });
  const now = Date.now();
  const upcoming = wins.filter((w) => new Date(w.scheduledAt).getTime() >= now && w.status !== 'CANCELLED' && w.status !== 'COMPLETED');
  const past = wins.filter((w) => !upcoming.includes(w));
  const cancel = useMutation({ mutationFn: (id: string) => api.delete(`/system/support/maintenance-windows/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['support-windows'] }); message.success('Cancelled'); } });
  const winStatus: Record<string, { bg: string; fg: string }> = { SCHEDULED: { bg: '#DBEAFE', fg: '#2563EB' }, IN_PROGRESS: { bg: '#EEF2FF', fg: '#4F46E5' }, COMPLETED: { bg: '#DCFCE7', fg: '#16A34A' }, CANCELLED: { bg: '#F1F5F9', fg: '#64748B' } };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-bold text-[#0F172A]">Upcoming Windows</h2>
        <button onClick={() => setOpen(true)} className={btnPrimary}><Plus size={16} /> Schedule Maintenance</button>
      </div>
      {upcoming.length === 0 && <div className={`${CARD} p-8 text-center text-[14px] text-[#94A3B8]`}>No upcoming maintenance scheduled.</div>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {upcoming.map((w) => (
          <div key={w.id} className={`${CARD} p-5`}>
            <div className="flex items-start justify-between">
              <div className="text-[15px] font-bold text-[#0F172A]">{w.title}</div>
              <Badge bg={winStatus[w.status]?.bg ?? '#F1F5F9'} fg={winStatus[w.status]?.fg ?? '#64748B'}>{w.status}</Badge>
            </div>
            {w.description && <p className="mt-1 text-[13px] text-[#64748B]">{w.description}</p>}
            <div className="mt-3 flex items-center gap-2 text-[13px] text-[#334155]"><Clock size={15} className="text-[#94A3B8]" /> {fmtDateTime(w.scheduledAt)} · {w.durationMinutes} min</div>
            <div className="mt-3 flex flex-wrap gap-1.5">{w.affectedSystems.map((s) => <span key={s} className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-[11px] font-semibold text-[#475569]">{s}</span>)}</div>
            <button onClick={() => cancel.mutate(w.id)} className="mt-4 text-[12px] font-semibold text-[#DC2626] hover:underline">Cancel window</button>
          </div>
        ))}
      </div>

      {past.length > 0 && (
        <div className={`${CARD} overflow-hidden p-0`}>
          <div className="border-b border-[#EEF2F7] p-4 text-[14px] font-bold text-[#0F172A]">Past &amp; Cancelled</div>
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-[#EEF2F7] text-[11px] uppercase tracking-wide text-[#94A3B8]">{['Title', 'Scheduled', 'Duration', 'Systems', 'Status'].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {past.map((w) => (
                <tr key={w.id} className="border-b border-[#F1F5F9]">
                  <td className="px-4 py-3 font-semibold text-[#0F172A]">{w.title}</td>
                  <td className="px-4 py-3 text-[#64748B]">{fmtDateTime(w.scheduledAt)}</td>
                  <td className="px-4 py-3 text-[#64748B]">{w.durationMinutes} min</td>
                  <td className="px-4 py-3 text-[#64748B]">{w.affectedSystems.join(', ')}</td>
                  <td className="px-4 py-3"><Badge bg={winStatus[w.status]?.bg ?? '#F1F5F9'} fg={winStatus[w.status]?.fg ?? '#64748B'}>{w.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && <ScheduleModal onClose={() => setOpen(false)} />}
    </div>
  );
}

function ScheduleModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [v, setV] = useState({ title: '', description: '', scheduledAt: '', durationMinutes: 60, notifyUsers: true });
  const [systems, setSystems] = useState<string[]>([]);
  const m = useMutation({
    mutationFn: () => api.post('/system/support/maintenance-windows', { ...v, durationMinutes: Number(v.durationMinutes), scheduledAt: new Date(v.scheduledAt).toISOString(), affectedSystems: systems }),
    onSuccess: () => { message.success('Maintenance scheduled'); qc.invalidateQueries({ queryKey: ['support-windows'] }); onClose(); },
    onError: () => message.error('Could not schedule'),
  });
  const toggle = (s: string) => setSystems((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]));
  return (
    <Modal title="Schedule Maintenance" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div><label className={labelCls}>Title</label><input className={inputCls} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></div>
        <div><label className={labelCls}>Description</label><textarea className={`${inputCls} h-20 py-2`} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelCls}>Scheduled at</label><input type="datetime-local" className={inputCls} value={v.scheduledAt} onChange={(e) => setV({ ...v, scheduledAt: e.target.value })} /></div>
          <div><label className={labelCls}>Duration (min)</label><input type="number" min={1} className={inputCls} value={v.durationMinutes} onChange={(e) => setV({ ...v, durationMinutes: Number(e.target.value) })} /></div>
        </div>
        <div>
          <label className={labelCls}>Affected systems</label>
          <div className="flex flex-wrap gap-2">
            {SYSTEMS.map((s) => (
              <button key={s} onClick={() => toggle(s)} className="rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors" style={systems.includes(s) ? { background: '#4F46E5', color: '#fff', borderColor: '#4F46E5' } : { background: '#fff', color: '#475569', borderColor: '#E2E8F0' }}>{s}</button>
            ))}
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[14px] text-[#334155]"><input type="checkbox" checked={v.notifyUsers} onChange={(e) => setV({ ...v, notifyUsers: e.target.checked })} style={{ accentColor: '#4F46E5' }} /> Notify all lab users</label>
      </div>
      <ModalFooter>
        <button onClick={onClose} className={btnGhost}>Cancel</button>
        <button disabled={!v.title.trim() || !v.scheduledAt || systems.length === 0 || m.isPending} onClick={() => m.mutate()} className={btnPrimary}>Schedule</button>
      </ModalFooter>
    </Modal>
  );
}

// ═══ Tab 3 — Announcements ════════════════════════════════════════════════════
function AnnouncementsTab() {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [open, setOpen] = useState(false);
  const { data: list = [] } = useQuery({ queryKey: ['support-announcements'], queryFn: () => api.get<Announcement[]>('/system/support/announcements').then((r) => r.data) });
  const toggle = useMutation({ mutationFn: (a: Announcement) => api.patch(`/system/support/announcements/${a.id}`, { isActive: !a.isActive }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['support-announcements'] }); message.success('Updated'); } });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-bold text-[#0F172A]">Announcements</h2>
        <button onClick={() => setOpen(true)} className={btnPrimary}><Plus size={16} /> New Announcement</button>
      </div>
      {list.length === 0 && <div className={`${CARD} p-8 text-center text-[14px] text-[#94A3B8]`}>No announcements yet.</div>}
      <div className="flex flex-col gap-3">
        {list.map((a) => {
          const c = ANN_TYPE[a.type] ?? ANN_TYPE.INFO;
          return (
            <div key={a.id} className={`${CARD} p-5`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><Badge bg={c.bg} fg={c.fg}>{a.type}</Badge><span className="text-[15px] font-bold text-[#0F172A]">{a.title}</span></div>
                  <p className="mt-1.5 text-[13px] text-[#475569]">{a.body}</p>
                  <div className="mt-2 text-[11px] text-[#94A3B8]">Shows {fmtDate(a.showFrom)}{a.showUntil ? ` → ${fmtDate(a.showUntil)}` : ' onwards'}</div>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[13px] font-semibold" style={{ color: a.isActive ? '#16A34A' : '#94A3B8' }}>
                  <input type="checkbox" checked={a.isActive} onChange={() => toggle.mutate(a)} style={{ accentColor: '#4F46E5' }} /> {a.isActive ? 'Active' : 'Inactive'}
                </label>
              </div>
            </div>
          );
        })}
      </div>
      {open && <NewAnnouncementModal onClose={() => setOpen(false)} />}
    </div>
  );
}

function NewAnnouncementModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [v, setV] = useState({ title: '', body: '', type: 'INFO', showFrom: '', showUntil: '' });
  const m = useMutation({
    mutationFn: () => api.post('/system/support/announcements', { title: v.title, body: v.body, type: v.type, showFrom: v.showFrom ? new Date(v.showFrom).toISOString() : undefined, showUntil: v.showUntil ? new Date(v.showUntil).toISOString() : undefined }),
    onSuccess: () => { message.success('Announcement created'); qc.invalidateQueries({ queryKey: ['support-announcements'] }); onClose(); },
    onError: () => message.error('Could not create'),
  });
  const c = ANN_TYPE[v.type] ?? ANN_TYPE.INFO;
  return (
    <Modal title="New Announcement" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div><label className={labelCls}>Title</label><input className={inputCls} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></div>
        <div><label className={labelCls}>Body</label><textarea className={`${inputCls} h-24 py-2`} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} /></div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className={labelCls}>Type</label><select className={inputCls} value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>{['INFO', 'WARNING', 'CRITICAL'].map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
          <div><label className={labelCls}>Show from</label><input type="datetime-local" className={inputCls} value={v.showFrom} onChange={(e) => setV({ ...v, showFrom: e.target.value })} /></div>
          <div><label className={labelCls}>Show until</label><input type="datetime-local" className={inputCls} value={v.showUntil} onChange={(e) => setV({ ...v, showUntil: e.target.value })} /></div>
        </div>
        <div>
          <label className={labelCls}>Preview</label>
          <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: c.bg }}>
            <Megaphone size={18} style={{ color: c.fg }} />
            <div><div className="text-[13px] font-bold" style={{ color: c.fg }}>{v.title || 'Announcement title'}</div><div className="text-[12px]" style={{ color: c.fg }}>{v.body || 'Body text preview'}</div></div>
          </div>
        </div>
      </div>
      <ModalFooter>
        <button onClick={onClose} className={btnGhost}>Cancel</button>
        <button disabled={!v.title.trim() || !v.body.trim() || m.isPending} onClick={() => m.mutate()} className={btnPrimary}>Publish</button>
      </ModalFooter>
    </Modal>
  );
}

// ═══ Tab 4 — Analytics ════════════════════════════════════════════════════════
function AnalyticsTab() {
  const { data: stats } = useQuery({ queryKey: ['support-stats'], queryFn: () => api.get<Stats>('/system/support/stats').then((r) => r.data) });
  const { data: page } = useQuery({ queryKey: ['support-tickets-all'], queryFn: () => api.get<Paginated<Ticket>>('/system/support/tickets', { params: { pageSize: 500 } }).then((r) => r.data) });
  const all = page?.data ?? [];

  const totalOpen = (stats?.open ?? 0) + (stats?.inProgress ?? 0) + (stats?.pendingResponse ?? 0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const thisMonth = all.filter((t) => new Date(t.createdAt) >= monthStart).length;

  const byCategory = Object.entries(stats?.byCategory ?? {}).map(([name, value]) => ({ name: cat(name), value }));
  const byStatus = [
    { name: 'Open', value: stats?.open ?? 0, color: '#2563EB' },
    { name: 'In Progress', value: stats?.inProgress ?? 0, color: '#4F46E5' },
    { name: 'Pending', value: stats?.pendingResponse ?? 0, color: '#A16207' },
    { name: 'Resolved', value: stats?.resolved ?? 0, color: '#16A34A' },
    { name: 'Closed', value: stats?.closed ?? 0, color: '#64748B' },
  ].filter((s) => s.value > 0);

  // 30-day volume series from all tickets.
  const days: { day: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const next = new Date(d); next.setDate(d.getDate() + 1);
    const count = all.filter((t) => { const c = new Date(t.createdAt); return c >= d && c < next; }).length;
    days.push({ day: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), count });
  }

  const KPIS = [
    { label: 'Total Open', value: totalOpen, color: '#2563EB' },
    { label: 'Breached SLA', value: stats?.breachedSla ?? 0, color: '#DC2626' },
    { label: 'Avg Resolution (h)', value: stats?.avgResolutionHours ?? 0, color: '#16A34A' },
    { label: 'Total This Month', value: thisMonth, color: '#4F46E5' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {KPIS.map((k) => (
          <div key={k.label} className={`${CARD} p-5`}>
            <div className="text-[30px] font-bold leading-none" style={{ color: k.color }}>{k.value}</div>
            <div className="mt-2 text-[13px] font-medium text-[#64748B]">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className={`${CARD} p-5`}>
          <div className="mb-4 text-[14px] font-bold text-[#0F172A]">Tickets by Category</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byCategory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94A3B8' }} interval={0} angle={-20} textAnchor="end" height={50} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94A3B8' }} />
              <Tooltip />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>{byCategory.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={`${CARD} p-5`}>
          <div className="mb-4 text-[14px] font-bold text-[#0F172A]">Tickets by Status</div>
          <div className="flex items-center gap-4">
            <PieChart width={200} height={200}>
              <Pie data={byStatus} dataKey="value" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={2} stroke="none">{byStatus.map((s, i) => <Cell key={i} fill={s.color} />)}</Pie>
            </PieChart>
            <div className="flex flex-1 flex-col gap-2">
              {byStatus.map((s) => (
                <div key={s.name} className="flex items-center justify-between text-[13px]"><span className="flex items-center gap-2 text-[#64748B]"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} /> {s.name}</span><span className="font-semibold text-[#0F172A]">{s.value}</span></div>
              ))}
              {byStatus.length === 0 && <div className="text-[13px] text-[#94A3B8]">No data</div>}
            </div>
          </div>
        </div>
      </div>

      <div className={`${CARD} p-5`}>
        <div className="mb-4 text-[14px] font-bold text-[#0F172A]">Ticket Volume (last 30 days)</div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={days}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94A3B8' }} interval={4} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94A3B8' }} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#4F46E5" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Shared modal chrome ──────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-[560px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[18px] font-bold text-[#0F172A]">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-[#64748B] hover:bg-[#F1F5F9]"><X size={18} /></button>
        </div>
        {children}
      </div>
    </>
  );
}
function ModalFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 flex items-center justify-end gap-3">{children}</div>;
}
