'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell, CalendarOff, Check, CheckCircle2, ChevronRight, Clock, DollarSign, ExternalLink,
  FileClock, FlaskConical, Inbox, MessageSquare, MoreHorizontal, SlidersHorizontal, X, XCircle,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';

// ── Unified notification model (merges /notifications + /workforce/notifications) ─
interface UItem {
  id: string;
  source: 'sys' | 'wf';
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  entityId: string | null;
  entityType: string | null;
  link: string | null;
}
interface SysNotif { id: string; type: string; title: string; body: string; read: boolean; link?: string | null; entityId?: string | null; entityType?: string | null; createdAt: string }
interface WfNotif { id: string; type: string; title: string; body: string; isRead: boolean; relatedEntityId: string | null; relatedEntityType: string | null; createdAt: string }

const normSys = (n: SysNotif): UItem => ({ id: n.id, source: 'sys', type: n.type, title: n.title, body: n.body, read: n.read, createdAt: n.createdAt, entityId: n.entityId ?? null, entityType: n.entityType ?? null, link: n.link ?? null });
const normWf = (n: WfNotif): UItem => ({ id: n.id, source: 'wf', type: n.type, title: n.title, body: n.body, read: n.isRead, createdAt: n.createdAt, entityId: n.relatedEntityId, entityType: n.relatedEntityType, link: null });

// ── Category grouping (Records / Requests / Payments; everything else → All) ─────
const CAT_RECORDS = ['SPECIMEN_RECEIVED', 'RESULT_READY', 'AUTHORIZATION_REQUIRED', 'RECORD_SUBMITTED', 'RECORD_RESULTED', 'RECORD_APPROVED', 'RECORD_FAILED', 'AUTHORIZATION_NEEDED'];
const CAT_REQUESTS = ['LEAVE_REQUEST_SUBMITTED', 'LEAVE_APPROVED', 'LEAVE_REJECTED', 'TIMESHEET_SUBMITTED', 'TIMESHEET_APPROVED', 'TIMESHEET_REJECTED', 'OVERTIME_APPROVED', 'OVERTIME_REJECTED', 'CHANGE_REQUEST_RECEIVED', 'CHANGE_REQUEST_REPLIED'];
const CAT_PAYMENTS = ['INVOICE_CREATED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE'];
const categoryOf = (t: string): 'records' | 'requests' | 'payments' | 'other' =>
  CAT_RECORDS.includes(t) ? 'records' : CAT_REQUESTS.includes(t) ? 'requests' : CAT_PAYMENTS.includes(t) ? 'payments' : 'other';

// Icon + tint per category (zero-orange: indigo/blue/green/sky/red only).
function iconFor(t: string): { Icon: typeof Bell; bg: string; fg: string } {
  const c = categoryOf(t);
  if (t.includes('FAILED') || t.includes('REJECTED') || t === 'PAYMENT_OVERDUE') return { Icon: XCircle, bg: '#FEF2F2', fg: '#DC2626' };
  if (t.includes('APPROVED') || t === 'PAYMENT_RECEIVED') return { Icon: CheckCircle2, bg: '#F0FDF4', fg: '#16A34A' };
  if (c === 'records') return { Icon: FlaskConical, bg: '#EEF2FF', fg: '#4F46E5' };
  if (c === 'requests') return { Icon: FileClock, bg: '#EEF2FF', fg: '#4F46E5' };
  if (c === 'payments') return { Icon: DollarSign, bg: '#F0FDF4', fg: '#16A34A' };
  if (t.includes('CHANGE_REQUEST') || t.includes('MESSAGE')) return { Icon: MessageSquare, bg: '#F0F9FF', fg: '#0284C7' };
  if (t.includes('LEAVE')) return { Icon: CalendarOff, bg: '#EEF2FF', fg: '#4F46E5' };
  return { Icon: Bell, bg: '#EEF2FF', fg: '#4F46E5' };
}

// Priority parsed from the title/body (support tickets embed it), else derived.
const PRIORITY: Record<string, { bg: string; fg: string }> = {
  CRITICAL: { bg: '#FEE2E2', fg: '#DC2626' }, HIGH: { bg: '#FEF9C3', fg: '#A16207' },
  MEDIUM: { bg: '#EEF2FF', fg: '#4F46E5' }, LOW: { bg: '#F1F5F9', fg: '#64748B' },
};
const priorityOf = (n: UItem): keyof typeof PRIORITY => {
  const m = `${n.title} ${n.body}`.toUpperCase().match(/\b(CRITICAL|HIGH|MEDIUM|LOW)\b/);
  if (m) return m[1] as keyof typeof PRIORITY;
  if (n.type.includes('FAILED') || n.type.includes('REJECTED') || n.type.includes('ALERT')) return 'HIGH';
  return 'MEDIUM';
};
const humanType = (t: string) => t.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const sourceLabel = (n: UItem) => (n.source === 'wf' ? 'Workforce' : 'System');
const ticketNo = (n: UItem) => n.title.match(/TKT-[\d-]+/)?.[0] ?? null;
const typeLabel = (n: UItem) => (/new support ticket/i.test(n.title) || n.entityType === 'SupportTicket' ? 'Support Ticket Created' : humanType(n.type));

// Related-entity → label + route.
const relatedFor = (n: UItem): { label: string; sub: string; route: string | null } | null => {
  if (n.link) return { label: (n.title.replace(/^New\s+/i, '').split('(')[0].trim() || 'Details'), sub: 'Linked item', route: n.link };
  const et = n.entityType;
  if (!et) return null;
  const map: Record<string, { label: string; route: (id: string | null) => string }> = {
    LeaveRequest: { label: 'Leave request', route: () => '/workforce/leave' },
    OvertimeRecord: { label: 'Overtime', route: () => '/workforce/overtime' },
    Timesheet: { label: 'Timesheet', route: (id) => (id ? `/workforce/timesheets/${id}` : '/workforce/timesheets') },
    PerformanceReview: { label: 'Performance review', route: () => '/workforce/performance' },
    Record: { label: 'Sample record', route: (id) => (id ? `/records/${id}` : '/records') },
    SupportTicket: { label: 'Support ticket', route: () => '/system/support' },
  };
  const e = map[et];
  if (!e) return { label: humanType(et), sub: 'Related', route: null };
  return { label: e.label, sub: et.replace(/([A-Z])/g, ' $1').trim(), route: e.route(n.entityId) };
};

const relTime = (iso: string) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604_800) return `${Math.floor(s / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const fmtFull = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};

// Time bucket for the "Today / Yesterday / This Week / Earlier" section headers.
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
function bucketOf(iso: string): 'Today' | 'Yesterday' | 'This Week' | 'Earlier' {
  const diff = Math.round((+startOfDay(new Date()) - +startOfDay(new Date(iso))) / 86_400_000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return 'This Week';
  return 'Earlier';
}
const BUCKETS = ['Today', 'Yesterday', 'This Week', 'Earlier'] as const;
const TABS = [['all', 'All'], ['unread', 'Unread'], ['records', 'Records'], ['requests', 'Requests'], ['payments', 'Payments']] as const;

export default function NotificationsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // System notifications — paginated (infinite scroll).
  const fetchFn = useCallback(
    (page: number, pageSize: number) => api.get('/notifications', { params: { page, pageSize } }).then((r) => r.data),
    [],
  );
  const { items: sysRaw, loading, initialLoading, hasMore, sentinelRef } = useInfiniteScroll<SysNotif>({ fetchFn, pageSize: 20 });

  // Workforce notifications — flat array (≤100), feature-gated (fail soft → []).
  const { data: wfRaw = [] } = useQuery({
    queryKey: ['wf-notifications-page'],
    queryFn: () => api.get('/workforce/notifications').then((r) => r.data as WfNotif[]).catch(() => [] as WfNotif[]),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['wf-notifications-page'] });
    qc.invalidateQueries({ queryKey: ['notifications-unread'] });
  };
  const markRead = useMutation({
    mutationFn: (n: UItem) => (n.source === 'wf' ? api.patch(`/workforce/notifications/${n.id}/read`) : api.put(`/notifications/${n.id}/read`)),
    onSuccess: invalidate,
  });
  const markAll = useMutation({
    mutationFn: () => Promise.all([api.put('/notifications/read-all').catch(() => {}), api.patch('/workforce/notifications/read-all').catch(() => {})]),
    onSuccess: invalidate,
  });

  // Merge + sort by createdAt desc.
  const merged = useMemo(
    () => [...wfRaw.map(normWf), ...sysRaw.map(normSys)].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [wfRaw, sysRaw],
  );
  const counts = useMemo(() => ({
    all: merged.length,
    unread: merged.filter((n) => !n.read).length,
    records: merged.filter((n) => categoryOf(n.type) === 'records').length,
    requests: merged.filter((n) => categoryOf(n.type) === 'requests').length,
    payments: merged.filter((n) => categoryOf(n.type) === 'payments').length,
  }), [merged]);

  const shown = useMemo(() => {
    if (tab === 'unread') return merged.filter((n) => !n.read);
    if (tab === 'all') return merged;
    return merged.filter((n) => categoryOf(n.type) === tab);
  }, [merged, tab]);

  const grouped = useMemo(() => {
    const g: Record<string, UItem[]> = { Today: [], Yesterday: [], 'This Week': [], Earlier: [] };
    for (const n of shown) g[bucketOf(n.createdAt)].push(n);
    return g;
  }, [shown]);

  const selected = merged.find((n) => n.id === selectedId) ?? null;
  // Default-select the most recent notification so the detail panel is populated
  // on load (matches the reference). Selecting does NOT mark read — that's the
  // explicit "Mark as read" action.
  useEffect(() => { if (!selectedId && merged.length > 0) setSelectedId(merged[0].id); }, [merged, selectedId]);
  const openDetail = (n: UItem) => setSelectedId(n.id);

  return (
    <div className="flex h-full min-h-0 gap-6">
      {/* ── Left: list ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[30px] font-bold leading-tight tracking-tight text-charcoal-heading">Notifications</h1>
            <p className="mt-1 text-sm text-secondary">Stay updated with everything that matters.</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"><SlidersHorizontal size={15} /> Filter</button>
            <button onClick={() => markAll.mutate()} disabled={markAll.isPending || counts.unread === 0} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Check size={15} /> Mark all as read</button>
            <button aria-label="More options" className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"><MoreHorizontal size={16} /></button>
          </div>
        </div>

        {/* Tab pills */}
        <div className="mb-4 flex flex-wrap gap-2">
          {TABS.map(([key, label]) => {
            const active = tab === key;
            const n = counts[key as keyof typeof counts];
            return (
              <button key={key} onClick={() => setTab(key)}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${active ? 'bg-primary text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                {label}
                {key !== 'all' && n > 0 && <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{n}</span>}
              </button>
            );
          })}
        </div>

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-100 bg-white">
          {!initialLoading && shown.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-24 text-center">
              <Inbox size={44} className="text-slate-200" />
              <div className="text-base font-semibold text-slate-500">No notifications</div>
              <div className="text-sm text-slate-400">You&apos;re all caught up.</div>
            </div>
          ) : (
            BUCKETS.map((b) => grouped[b].length > 0 && (
              <div key={b}>
                <div className="sticky top-0 z-[1] bg-white/90 px-5 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400 backdrop-blur">{b}</div>
                {grouped[b].map((n) => {
                  const ic = iconFor(n.type);
                  const isSel = n.id === selectedId;
                  return (
                    <button key={`${n.source}-${n.id}`} onClick={() => openDetail(n)}
                      className={`flex w-full items-start gap-3.5 border-b border-slate-100 px-5 py-4 text-left transition-colors ${isSel ? '' : 'bg-white hover:bg-slate-50'}`}
                      style={isSel ? { background: '#F5F6FF', borderLeft: '3px solid #4F46E5', paddingLeft: 'calc(1.25rem - 3px)' } : undefined}>
                      <span style={{ background: ic.bg, color: ic.fg }} className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl"><ic.Icon size={18} /></span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm ${n.read ? 'font-medium text-slate-600' : 'font-bold text-charcoal-heading'}`}>{n.title}</span>
                        <span className="mt-0.5 block truncate text-[13px] text-slate-500">{n.body}</span>
                        <span className="mt-1 block text-[11px] text-slate-400">{relTime(n.createdAt)}</span>
                      </span>
                      {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
          <ScrollSentinel ref={sentinelRef} loading={loading && !initialLoading} hasMore={hasMore} />
        </div>
      </div>

      {/* ── Right: detail ── */}
      <div className="hidden w-[400px] shrink-0 xl:block">
        {selected ? (
          <Detail n={selected} onClose={() => setSelectedId(null)} onView={(r) => router.push(r)} onMarkRead={() => markRead.mutate(selected)} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-slate-100 bg-white py-24 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-400"><Bell size={26} /></span>
            <div className="mt-4 text-base font-semibold text-slate-500">Select a notification</div>
            <div className="mt-1 text-sm text-slate-400">Choose one from the list to view details.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Detail({ n, onClose, onView, onMarkRead }: { n: UItem; onClose: () => void; onView: (route: string) => void; onMarkRead: () => void }) {
  const pr = priorityOf(n);
  const prc = PRIORITY[pr];
  const rel = relatedFor(n);
  const relIcon = iconFor(n.type);
  const tkt = ticketNo(n);
  const viewRoute = n.link || rel?.route || null;
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-100 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-sm text-slate-500">{tkt ?? humanType(n.type)}</span>
        <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-md px-2 py-0.5 text-[11px] font-bold" style={{ background: prc.bg, color: prc.fg }}>{pr}</span>
        <span className="text-sm text-slate-500">{typeLabel(n)}</span>
      </div>

      <h2 className="text-xl font-bold leading-snug text-charcoal-heading">{n.title}</h2>
      <div className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-500"><Clock size={14} /> {fmtFull(n.createdAt)}</div>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Description</div>
        <p className="text-sm leading-relaxed text-on-surface">{n.body || '—'}</p>

        <div className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Source</div>
        <span className="mt-1 inline-block rounded-lg bg-slate-100 px-2.5 py-1 text-sm text-slate-600">{sourceLabel(n)}</span>

        {rel && (
          <>
            <div className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Related</div>
            <button onClick={() => rel.route && onView(rel.route)} disabled={!rel.route}
              className="mt-1 flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition-colors enabled:hover:border-primary disabled:opacity-70">
              <span style={{ background: relIcon.bg, color: relIcon.fg }} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"><relIcon.Icon size={17} /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-charcoal-heading">{rel.label}</span><span className="block truncate text-xs text-slate-400">{rel.sub}</span></span>
              {rel.route && <ChevronRight size={16} className="text-slate-400" />}
            </button>
          </>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-2">
        {viewRoute && (
          <button onClick={() => onView(viewRoute)} className="btn-primary w-full justify-center">
            View {tkt ? 'Ticket' : 'Details'} <ExternalLink size={16} />
          </button>
        )}
        {!n.read && <button onClick={onMarkRead} className="btn-secondary w-full justify-center"><Check size={15} /> Mark as read</button>}
      </div>
    </div>
  );
}
