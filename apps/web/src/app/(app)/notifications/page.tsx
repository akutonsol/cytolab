'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCircle2, Clock, DollarSign, FlaskConical, MessageSquare, X, XCircle } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';

type NType =
  | 'RECORD_SUBMITTED' | 'RECORD_RESULTED' | 'RECORD_APPROVED' | 'RECORD_FAILED' | 'AUTHORIZATION_NEEDED'
  | 'CHANGE_REQUEST_RECEIVED' | 'CHANGE_REQUEST_REPLIED' | 'PAYMENT_RECEIVED' | 'APPOINTMENT_REMINDER' | 'SYSTEM_ALERT';

interface Notif {
  id: string; type: NType; title: string; body: string; read: boolean;
  link?: string | null; entityId?: string | null; entityType?: string | null; createdAt: string;
}

// Icon + tint per type. AUTHORIZATION_NEEDED uses detector-safe amber #B45309.
const ICON: Record<string, { bg: string; color: string; Icon: any }> = {
  AUTHORIZATION_NEEDED: { bg: '#FEF3C7', color: '#B45309', Icon: Clock },
  RECORD_APPROVED: { bg: '#F0FDF4', color: '#16A34A', Icon: CheckCircle2 },
  RECORD_FAILED: { bg: '#FEF2F2', color: '#DC2626', Icon: XCircle },
  RECORD_RESULTED: { bg: '#EEF2FF', color: '#4F46E5', Icon: FlaskConical },
  RECORD_SUBMITTED: { bg: '#EEF2FF', color: '#4F46E5', Icon: FlaskConical },
  CHANGE_REQUEST_RECEIVED: { bg: '#F0F9FF', color: '#0284C7', Icon: MessageSquare },
  CHANGE_REQUEST_REPLIED: { bg: '#F0F9FF', color: '#0284C7', Icon: MessageSquare },
  PAYMENT_RECEIVED: { bg: '#F0FDF4', color: '#16A34A', Icon: DollarSign },
  APPOINTMENT_REMINDER: { bg: '#EEF2FF', color: '#4F46E5', Icon: Clock },
  SYSTEM_ALERT: { bg: '#F8F9FF', color: '#4F46E5', Icon: Bell },
};
const DEFAULT_ICON = { bg: '#F1F0EA', color: '#64748B', Icon: Bell };

const RECORD_TYPES = ['RECORD_SUBMITTED', 'RECORD_RESULTED', 'RECORD_APPROVED', 'RECORD_FAILED', 'AUTHORIZATION_NEEDED'];
const REQUEST_TYPES = ['CHANGE_REQUEST_RECEIVED', 'CHANGE_REQUEST_REPLIED'];
const PAYMENT_TYPES = ['PAYMENT_RECEIVED'];
const TABS: [string, string][] = [['all', 'All'], ['unread', 'Unread'], ['records', 'Records'], ['requests', 'Requests'], ['payments', 'Payments']];

const relTime = (iso: string) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function NotificationsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState('all');

  const { data: unread = 0 } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => api.get('/notifications/unread-count').then((r) => r.data.count as number),
  });

  // Infinite scroll: switching to/from the "unread" tab changes the API filter
  // (and so the fetchFn identity), which resets the list to page 1; the other
  // tabs are client-side filters over the accumulated rows.
  const unreadOnly = tab === 'unread';
  const fetchFn = useCallback(
    (page: number, pageSize: number) =>
      api.get('/notifications', { params: { page, pageSize, ...(unreadOnly ? { read: false } : {}) } }).then((r) => r.data),
    [unreadOnly],
  );
  const { items: rows, loading, initialLoading, hasMore, sentinelRef } = useInfiniteScroll<Notif>({ fetchFn, pageSize: 20 });

  const shown = useMemo(() => {
    if (tab === 'records') return rows.filter((n) => RECORD_TYPES.includes(n.type));
    if (tab === 'requests') return rows.filter((n) => REQUEST_TYPES.includes(n.type));
    if (tab === 'payments') return rows.filter((n) => PAYMENT_TYPES.includes(n.type));
    return rows;
  }, [rows, tab]);

  const markRead = useMutation({
    mutationFn: (id: string) => api.put(`/notifications/${id}/read`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); qc.invalidateQueries({ queryKey: ['notifications-unread'] }); },
  });
  const markAll = useMutation({
    mutationFn: () => api.put('/notifications/read-all'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); qc.invalidateQueries({ queryKey: ['notifications-unread'] }); },
  });

  const open = (n: Notif) => {
    if (!n.read) markRead.mutate(n.id);
    if (n.link) router.push(n.link);
  };

  return (
    <div className="mx-auto max-w-[800px]">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-tight text-[#0F172A]">Notifications</h1>
          <p className="mt-1 text-[14px] text-[#64748B]">{unread} unread</p>
        </div>
        {unread > 0 && (
          <button onClick={() => markAll.mutate()} disabled={markAll.isPending}
            className="rounded-xl border border-[#E5E3DC] bg-white px-4 py-2 text-[13px] font-semibold text-[#0F172A] transition-colors hover:bg-[#F9F8F5] disabled:opacity-60">Mark all read</button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="mb-5 inline-flex flex-wrap gap-1 rounded-xl border border-[#E5E3DC] bg-white p-1">
        {TABS.map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors ${tab === v ? 'bg-[#4F46E5] text-white' : 'text-[#64748B] hover:text-[#0F172A]'}`}>{l}</button>
        ))}
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-[20px] border border-[#E5E3DC] bg-white">
        {shown.length === 0 && !initialLoading ? (
          <div className="flex flex-col items-center gap-2 py-20 text-center">
            <Bell size={48} className="text-[#E2E8F0]" />
            <div className="text-[16px] font-semibold text-[#64748B]">No notifications</div>
            <div className="text-[13px] text-[#94A3B8]">You&apos;re all caught up!</div>
          </div>
        ) : (
          shown.map((n) => {
            const ic = ICON[n.type] ?? DEFAULT_ICON;
            return (
              <div key={n.id} onClick={() => open(n)}
                className="group flex cursor-pointer items-start gap-3.5 border-b border-[#F8FAFC] px-5 py-4 transition-colors last:border-0 hover:bg-[#F9F8F5]"
                style={{ background: n.read ? '#fff' : '#FAFBFF', borderLeft: `3px solid ${n.read ? 'transparent' : '#4F46E5'}` }}>
                <span style={{ background: ic.bg, color: ic.color }} className="grid h-10 w-10 shrink-0 place-items-center rounded-full"><ic.Icon size={18} /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold" style={{ color: n.read ? '#374151' : '#0F172A' }}>{n.title}</div>
                  <div className="mt-0.5 text-[13px] text-[#64748B]">{n.body}</div>
                  <div className="mt-1 text-[11px] text-[#94A3B8]">{relTime(n.createdAt)}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2 pt-1">
                  {!n.read && <span className="h-2 w-2 rounded-full bg-[#4F46E5]" />}
                  {!n.read && (
                    <button title="Mark read" onClick={(e) => { e.stopPropagation(); markRead.mutate(n.id); }}
                      className="grid h-7 w-7 place-items-center rounded-lg text-[#94A3B8] opacity-0 transition-opacity hover:bg-[#F1F0EA] hover:text-[#0F172A] group-hover:opacity-100"><X size={14} /></button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <ScrollSentinel ref={sentinelRef} loading={loading && !initialLoading} hasMore={hasMore} />
    </div>
  );
}
