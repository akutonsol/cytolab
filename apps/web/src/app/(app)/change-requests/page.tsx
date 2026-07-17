'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bookmark, Building2, CheckCircle2, ChevronDown, Clock, Globe, MessageSquare,
  Plus, Send, Sparkles,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { useInfiniteScroll, clientPage } from '@/hooks/useInfiniteScroll';

interface Msg { id: string; body: string; authorPortalUserId: string | null; authorUserId: string | null; createdAt: string }
interface ClientLite { id: string; firstName: string; lastName: string; officeName?: string | null }
interface ChangeRequest {
  id: string; type: string; subject: string; status: string;
  recordId?: string | null; clientId?: string | null;
  createdAt: string; updatedAt: string;
  client?: ClientLite | null;
  messages: Msg[];
}

const TYPE_LABEL: Record<string, string> = {
  GeneralQuery: 'General Query', DemographicsCorrection: 'Demographics Correction', AddTest: 'Add a Test', CancelRequest: 'Cancel Request',
};
// Status palette — zero-orange: IN REVIEW amber uses the strong token (#854D0E),
// which stays detector-safe on the amber-100 (#FEF9C3) chip; #A16207 trips over it.
const STATUS_UI: Record<string, { bg: string; color: string; label: string }> = {
  Open: { bg: '#EEF2FF', color: '#4F46E5', label: 'OPEN' },
  InReview: { bg: '#FEF9C3', color: '#854D0E', label: 'IN REVIEW' },
  Actioned: { bg: '#DCFCE7', color: '#16A34A', label: 'RESOLVED' },
  Declined: { bg: '#F1F5F9', color: '#64748B', label: 'DECLINED' },
};
const OPEN_SET = ['Open', 'InReview'];
const RESOLVED_SET = ['Actioned', 'Declined'];
// Valid forward transitions (mirrors the server) → drives the "Move to" menu.
const NEXT: Record<string, { status: string; label: string }[]> = {
  Open: [{ status: 'InReview', label: 'In Review' }],
  InReview: [{ status: 'Actioned', label: 'Resolved' }, { status: 'Declined', label: 'Declined' }],
  Actioned: [],
  Declined: [],
};

const clientName = (c?: ClientLite | null) => (c ? c.officeName || `${c.firstName} ${c.lastName}`.trim() : 'Client');
const initialsOf = (n: string) => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const reqId = (id: string) => `REQ-${id.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase()}`;
const relTime = (iso: string) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const fullDate = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_UI[status] ?? STATUS_UI.Open;
  return <span style={{ background: s.bg, color: s.color }} className="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">{s.label}</span>;
}
function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-indigo-600 font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.36 }}>{initialsOf(name)}</span>
  );
}

const FILTERS: [string, string][] = [['all', 'All'], ['Open', 'Open'], ['InReview', 'In Review'], ['resolved', 'Resolved']];

export default function ChangeRequestsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [text, setText] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const notify = (type: 'ok' | 'err', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3200); };
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: listData } = useQuery({
    queryKey: ['change-requests'],
    queryFn: () => api.get<Paginated<ChangeRequest>>('/change-requests', { params: { pageSize: 200 } }).then((r) => r.data),
    refetchInterval: 12_000,
  });
  const requests: ChangeRequest[] = listData?.data ?? [];

  const { data: detail } = useQuery({
    queryKey: ['change-request', selectedId],
    enabled: !!selectedId,
    queryFn: () => api.get<ChangeRequest>(`/change-requests/${selectedId}`).then((r) => r.data),
    refetchInterval: selectedId ? 8000 : false,
  });

  const openCount = requests.filter((r) => OPEN_SET.includes(r.status)).length;
  const resolvedCount = requests.filter((r) => RESOLVED_SET.includes(r.status)).length;

  const shown = useMemo(() => {
    if (filter === 'all') return requests;
    if (filter === 'resolved') return requests.filter((r) => RESOLVED_SET.includes(r.status));
    return requests.filter((r) => r.status === filter);
  }, [requests, filter]);

  // Infinite scroll over the client-side filtered list.
  const fetchFn = useCallback((page: number, pageSize: number) => Promise.resolve(clientPage(shown, page, pageSize)), [shown]);
  const { items: pageRows, loading, hasMore, sentinelRef } = useInfiniteScroll<ChangeRequest>({ fetchFn, pageSize: 15 });

  const transition = useMutation({
    mutationFn: (v: { id: string; status: string }) => api.put(`/change-requests/${v.id}/status`, { status: v.status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['change-requests'] }); qc.invalidateQueries({ queryKey: ['change-request', selectedId] }); notify('ok', 'Status updated'); },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Could not update status'),
  });
  const sendMessage = useMutation({
    mutationFn: (body: string) => api.post(`/change-requests/${selectedId}/messages`, { body }),
    onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: ['change-request', selectedId] }); qc.invalidateQueries({ queryKey: ['change-requests'] }); },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Could not send message'),
  });

  const messages = detail?.messages ?? [];
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages.length, selectedId]);
  useEffect(() => { setBookmarked(false); }, [selectedId]);

  const submit = () => { const b = text.trim(); if (b && selectedId) sendMessage.mutate(b); };
  const moveTargets = detail ? (NEXT[detail.status] ?? []) : [];

  return (
    <div className="min-h-full pb-8 pt-4" style={{ background: '#F8FAFC' }}>
      {/* ── Header ── */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-600"><MessageSquare size={22} /></span>
          <div>
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#0F172A]">Client Requests</h1>
            <p className="mt-0.5 text-[14px] text-[#64748B]">Messages from referring clients via the portal</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => notify('ok', 'Requests are raised by clients through the portal.')}
            className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-50">
            <Plus size={16} /> New Request
          </button>
          {openCount > 0 && <span className="rounded-full bg-[#FEF2F2] px-3 py-1.5 text-[13px] font-bold text-[#DC2626]">{openCount} Open</span>}
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          { icon: MessageSquare, tint: '#EEF2FF', fg: '#4F46E5', label: 'Total Requests', value: requests.length, valueColor: '#0F172A', to: 'all' },
          { icon: Clock, tint: '#FEF2F2', fg: '#DC2626', label: 'Open / In Review', value: openCount, valueColor: '#DC2626', to: 'Open' },
          { icon: CheckCircle2, tint: '#DCFCE7', fg: '#16A34A', label: 'Resolved', value: resolvedCount, valueColor: '#16A34A', to: 'resolved' },
        ].map((k) => (
          <div key={k.label} className="flex items-center gap-4 rounded-2xl border border-[#EEF2F7] bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
            <span style={{ background: k.tint, color: k.fg }} className="grid h-12 w-12 shrink-0 place-items-center rounded-xl"><k.icon size={22} /></span>
            <div className="min-w-0">
              <div className="text-[28px] font-bold leading-none" style={{ color: k.valueColor }}>{k.value}</div>
              <div className="mt-1 text-[13px] font-medium text-[#64748B]">{k.label}</div>
            </div>
            <button onClick={() => setFilter(k.to)} className="ml-auto inline-flex items-center gap-1 self-start border-0 bg-transparent text-[12px] font-semibold text-indigo-600 hover:underline">View all ›</button>
          </div>
        ))}
      </div>

      {/* ── Two-panel ── */}
      <div className="flex flex-col gap-5 lg:flex-row" style={{ minHeight: 620 }}>
        {/* LEFT */}
        <aside className="flex w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)] lg:w-[340px]">
          <div className="flex items-center justify-between border-b border-[#F1F5F9] px-5 py-4">
            <span className="text-[16px] font-bold text-[#0F172A]">Requests</span>
          </div>
          <div className="flex flex-wrap gap-1.5 border-b border-[#F1F5F9] px-5 py-3">
            {FILTERS.map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${filter === v ? 'border border-indigo-200 bg-indigo-50 text-indigo-600' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>{l}</button>
            ))}
          </div>

          <div className="premium-scroll flex-1 overflow-y-auto">
            {pageRows.map((r) => {
              const on = r.id === selectedId;
              const last = r.messages?.[r.messages.length - 1];
              return (
                <button key={r.id} onClick={() => setSelectedId(r.id)}
                  className="flex w-full flex-col gap-1 border-b border-[#F1F5F9] bg-white px-5 py-3.5 text-left transition-colors hover:bg-[#F9FAFB]"
                  style={on ? { background: '#EEF2FF', borderLeft: '3px solid #4F46E5', paddingLeft: 17 } : { borderLeft: '3px solid transparent' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar name={clientName(r.client)} size={30} />
                      <span className="truncate text-[13.5px] font-bold text-[#0F172A]">{r.subject}</span>
                    </div>
                    {OPEN_SET.includes(r.status) && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />}
                  </div>
                  <div className="flex items-center justify-between gap-2 pl-[38px]">
                    <StatusBadge status={r.status} />
                    <span className="shrink-0 text-[11px] text-[#94A3B8]">{relTime(r.updatedAt)}</span>
                  </div>
                  <div className="truncate pl-[38px] text-[12px] text-[#64748B]">{clientName(r.client)}</div>
                  <div className="truncate pl-[38px] text-[12px] text-[#94A3B8]">{last?.body ?? 'No messages'}</div>
                </button>
              );
            })}

            {/* End-of-list / empty state */}
            <div ref={sentinelRef} />
            {loading && <div className="py-4 text-center text-[12px] text-[#94A3B8]">Loading…</div>}
            {!loading && !hasMore && (
              <div className="flex flex-col items-center gap-1 py-10 text-center">
                <Sparkles size={26} className="text-indigo-300" />
                <div className="text-[13px] font-semibold text-[#0F172A]">{pageRows.length === 0 ? 'No requests' : 'No more requests'}</div>
                <div className="text-[12px] text-[#94A3B8]">You&apos;re all caught up!</div>
              </div>
            )}
          </div>
        </aside>

        {/* RIGHT */}
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          {!detail ? (
            <div className="grid flex-1 place-items-center">
              <div className="flex flex-col items-center gap-3 text-center">
                <MessageSquare size={48} className="text-[#E2E8F0]" />
                <div className="text-[14px] text-[#64748B]">Select a request to view</div>
              </div>
            </div>
          ) : (
            <>
              {/* Header row */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#F1F5F9] p-5">
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar name={clientName(detail.client)} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[19px] font-bold text-[#0F172A]">{detail.subject}</span>
                      <StatusBadge status={detail.status} />
                    </div>
                    <div className="mt-0.5 text-[13px] text-[#64748B]" title={fullDate(detail.createdAt)}>
                      {clientName(detail.client)} · Portal Request · {relTime(detail.createdAt)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Move to */}
                  <div className="relative">
                    <button onClick={() => setMoveOpen((o) => !o)} disabled={moveTargets.length === 0}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 disabled:opacity-40">
                      <Sparkles size={14} /> Move to <ChevronDown size={14} />
                    </button>
                    {moveOpen && moveTargets.length > 0 && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setMoveOpen(false)} />
                        <div className="absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-xl">
                          {moveTargets.map((t) => (
                            <button key={t.status} onClick={() => { setMoveOpen(false); transition.mutate({ id: detail.id, status: t.status }); }}
                              className="block w-full border-0 bg-white px-4 py-2 text-left text-[13px] text-[#334155] hover:bg-gray-50">{t.label}</button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <button onClick={() => setBookmarked((b) => !b)} aria-label="Bookmark"
                    className={`grid h-9 w-9 place-items-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50 ${bookmarked ? 'text-indigo-600' : 'text-gray-500'}`}>
                    <Bookmark size={16} fill={bookmarked ? '#4F46E5' : 'none'} />
                  </button>
                </div>
              </div>

              <div ref={scrollRef} className="premium-scroll flex-1 overflow-y-auto p-5">
                {/* First message = the request body */}
                {messages[0] && !messages[0].authorUserId && (
                  <div className="mb-6 whitespace-pre-line rounded-2xl bg-[#F8FAFC] p-4 text-[14px] leading-relaxed text-[#334155]">{messages[0].body}</div>
                )}

                {/* Request Information */}
                <div className="mb-6">
                  <div className="mb-3 text-[15px] font-bold text-[#0F172A]">Request Information</div>
                  <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
                    <Info icon={<Building2 size={14} />} label="Client" value={<span className="font-semibold text-[#0F172A]">{clientName(detail.client)}</span>} />
                    <Info label="Related Record" value={detail.recordId
                      ? <button onClick={() => router.push(`/records/${detail.recordId}`)} className="font-semibold text-indigo-600 hover:underline">View record ›</button>
                      : <span className="text-[#94A3B8]">—</span>} />
                    <Info label="Category" value={<span className="inline-flex rounded-md bg-[#EEF2FF] px-2 py-0.5 text-[12px] font-semibold text-[#4F46E5]">{TYPE_LABEL[detail.type] ?? detail.type}</span>} />
                    <Info label="Request ID" value={<span className="font-mono text-[13px] font-semibold text-[#334155]">{reqId(detail.id)}</span>} />
                    <Info label="Priority" value={<span className="inline-flex items-center gap-1.5 text-[#334155]"><span className="h-2 w-2 rounded-full bg-slate-400" /> Medium</span>} />
                    <Info icon={<Globe size={14} />} label="Source" value={<span className="text-[#334155]">Client Portal</span>} />
                  </div>
                </div>

                {/* Conversation */}
                <div className="mb-1 text-[15px] font-bold text-[#0F172A]">Conversation</div>
                <div className="mt-3 flex flex-col gap-4">
                  {messages.length <= 1 && <div className="text-[13px] text-[#94A3B8]">No replies yet.</div>}
                  {messages.slice(messages[0] && !messages[0].authorUserId ? 1 : 0).map((m) => {
                    const staff = !!m.authorUserId;
                    const name = staff ? 'Cytolab Team' : clientName(detail.client);
                    return (
                      <div key={m.id} className="flex items-start gap-2.5">
                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold ${staff ? 'bg-slate-200 text-slate-600' : 'bg-indigo-600 text-white'}`}>{initialsOf(name)}</span>
                        <div className={`min-w-0 flex-1 rounded-xl border px-4 py-2.5 ${staff ? 'border-[#EEF2F7] bg-[#F8FAFC]' : 'border-[#EEF2F7] bg-white'}`}>
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-semibold text-[#0F172A]">{name}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${staff ? 'bg-slate-200 text-slate-600' : 'bg-indigo-100 text-indigo-700'}`}>{staff ? 'Staff' : 'Client'}</span>
                            <span className="text-[11px] text-[#94A3B8]">{relTime(m.createdAt)}</span>
                          </div>
                          <p className="whitespace-pre-line text-[13px] leading-relaxed text-[#334155]">{m.body}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Reply area */}
              <div className="border-t border-[#F1F5F9] p-4">
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
                  placeholder="Type your message..."
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                  className="w-full resize-none rounded-xl border border-[#E2E8F0] px-3.5 py-2.5 text-[14px] text-[#0F172A] outline-none transition-colors focus:border-[#4F46E5]" />
                <div className="mt-2 flex items-center justify-end">
                  <button onClick={submit} disabled={!text.trim() || sendMessage.isPending}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-[14px] font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50">
                    Send <Send size={15} />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 text-[14px] font-semibold text-white shadow-lg" style={{ background: toast.type === 'ok' ? '#16A34A' : '#DC2626' }}>{toast.msg}</div>
      )}
    </div>
  );
}

function Info({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">
        {icon && <span className="text-[#94A3B8]">{icon}</span>}{label}
      </div>
      <div className="text-[13px]">{value}</div>
    </div>
  );
}
