'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, ExternalLink, MessageSquare, Send } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';

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
  GeneralQuery: 'General query', DemographicsCorrection: 'Demographics correction', AddTest: 'Add a test', CancelRequest: 'Cancel request',
};
// Detector-safe palette. Open uses #B45309 (reads amber, passes the zero-orange gate).
const STATUS_UI: Record<string, { bg: string; color: string; label: string }> = {
  Open: { bg: '#FEF3C7', color: '#B45309', label: 'Open' },
  InReview: { bg: '#EEF2FF', color: '#4F46E5', label: 'In Review' },
  Actioned: { bg: '#F0FDF4', color: '#16A34A', label: 'Actioned' },
  Declined: { bg: '#FEF2F2', color: '#DC2626', label: 'Declined' },
};
const OPEN_SET = ['Open', 'InReview'];
const RESOLVED_SET = ['Actioned', 'Declined'];

const clientName = (c?: ClientLite | null) => (c ? c.officeName || `${c.firstName} ${c.lastName}`.trim() : 'Client');
const initialsOf = (n: string) => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const relTime = (iso: string) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const fmtTime = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_UI[status] ?? STATUS_UI.Open;
  return <span style={{ background: s.bg, color: s.color }} className="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide">{s.label}</span>;
}

const CARD = 'rounded-2xl border border-[#E5E3DC] bg-white';
const FILTERS: [string, string][] = [['all', 'All'], ['Open', 'Open'], ['InReview', 'In Review'], ['resolved', 'Resolved']];

export default function ChangeRequestsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [reply, setReply] = useState('');
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const notify = (type: 'ok' | 'err', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3200); };
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: listData } = useQuery({
    queryKey: ['change-requests'],
    queryFn: () => api.get<Paginated<ChangeRequest>>('/change-requests', { params: { pageSize: 100 } }).then((r) => r.data),
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

  const transition = useMutation({
    mutationFn: (v: { id: string; status: string }) => api.put(`/change-requests/${v.id}/status`, { status: v.status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['change-requests'] }); qc.invalidateQueries({ queryKey: ['change-request', selectedId] }); },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Could not update status'),
  });
  const sendReply = useMutation({
    mutationFn: (body: string) => api.post(`/change-requests/${selectedId}/messages`, { body }),
    onSuccess: () => { setReply(''); qc.invalidateQueries({ queryKey: ['change-request', selectedId] }); qc.invalidateQueries({ queryKey: ['change-requests'] }); },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Could not send reply'),
  });

  const messages = detail?.messages ?? [];
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages.length, selectedId]);

  const submit = () => { const b = reply.trim(); if (b && selectedId) sendReply.mutate(b); };
  const canReply = detail && OPEN_SET.includes(detail.status);

  const kpis = [
    { icon: MessageSquare, label: 'Total Requests', value: requests.length, color: '#4F46E5' },
    { icon: Clock, label: 'Open / In Review', value: openCount, color: openCount > 0 ? '#EF4444' : '#16A34A' },
    { icon: CheckCircle2, label: 'Resolved', value: resolvedCount, color: '#16A34A' },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-tight text-[#0F172A]">Client Requests</h1>
          <p className="mt-1 text-[14px] text-[#64748B]">Messages from referring clients via the portal</p>
        </div>
        <span className="rounded-full px-3.5 py-1.5 text-[13px] font-bold" style={openCount > 0 ? { background: '#FEF2F2', color: '#DC2626' } : { background: '#F0FDF4', color: '#16A34A' }}>
          {openCount} Open
        </span>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className="flex items-center gap-3.5 rounded-2xl border border-[#E5E3DC] bg-white p-5">
            <span style={{ background: `${k.color}1A`, color: k.color }} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"><k.icon size={20} /></span>
            <div>
              <div className="text-[26px] font-bold leading-none" style={{ color: k.color === '#4F46E5' ? '#0F172A' : k.color }}>{k.value}</div>
              <div className="mt-1 text-[13px] font-medium text-[#64748B]">{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 2-column */}
      <div className="flex flex-col gap-5 lg:flex-row" style={{ minHeight: 560 }}>
        {/* LEFT */}
        <aside className="flex w-full shrink-0 flex-col overflow-hidden rounded-[20px] border border-[#E5E3DC] bg-white lg:w-[360px]">
          <div className="border-b border-[#F1F0EA] px-5 py-4">
            <div className="mb-3 text-[15px] font-semibold text-[#0F172A]">Requests</div>
            <div className="inline-flex rounded-lg bg-[#F5F4F0] p-1">
              {FILTERS.map(([v, l]) => (
                <button key={v} onClick={() => setFilter(v)}
                  className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${filter === v ? 'bg-white text-[#4F46E5] shadow-sm' : 'text-[#64748B] hover:text-[#0F172A]'}`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="premium-scroll flex-1 overflow-y-auto">
            {shown.length === 0 ? (
              <div className="px-5 py-12 text-center text-[13px] text-[#94A3B8]">No requests yet</div>
            ) : shown.map((r) => {
              const on = r.id === selectedId;
              const last = r.messages?.[r.messages.length - 1];
              return (
                <button key={r.id} onClick={() => setSelectedId(r.id)}
                  className="flex w-full flex-col gap-1 border-b border-[#F8FAFC] px-5 py-3.5 text-left transition-colors hover:bg-[#F9F8F5]"
                  style={on ? { background: '#EEF2FF', borderLeft: '3px solid #4F46E5', paddingLeft: 17 } : { borderLeft: '3px solid transparent' }}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-[14px] font-semibold text-[#0F172A]">{r.subject}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="text-[12px] text-[#64748B]">{clientName(r.client)}</div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] text-[#94A3B8]">{last?.body ?? 'No messages'}</span>
                    <span className="shrink-0 text-[11px] text-[#94A3B8]">{relTime(r.updatedAt)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* RIGHT */}
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-[#E5E3DC] bg-white">
          {!detail ? (
            <div className="grid flex-1 place-items-center">
              <div className="flex flex-col items-center gap-3 text-center">
                <MessageSquare size={48} className="text-[#E2E8F0]" />
                <div className="text-[14px] text-[#94A3B8]">Select a request to view</div>
              </div>
            </div>
          ) : (
            <>
              <div className="border-b border-[#F1F0EA] px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="truncate text-[16px] font-bold text-[#0F172A]">{detail.subject}</span>
                    <StatusBadge status={detail.status} />
                  </div>
                  <div className="flex items-center gap-2">
                    {detail.status === 'Open' && (
                      <button onClick={() => transition.mutate({ id: detail.id, status: 'InReview' })} disabled={transition.isPending}
                        className="rounded-lg bg-[#4F46E5] px-4 py-2 text-[13px] font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-60">Mark In Review</button>
                    )}
                    {detail.status === 'InReview' && (
                      <>
                        <button onClick={() => transition.mutate({ id: detail.id, status: 'Actioned' })} disabled={transition.isPending}
                          className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-60" style={{ background: '#16A34A' }}>Mark Actioned</button>
                        <button onClick={() => transition.mutate({ id: detail.id, status: 'Declined' })} disabled={transition.isPending}
                          className="rounded-lg border px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-[#FEF2F2] disabled:opacity-60" style={{ borderColor: '#DC2626', color: '#DC2626' }}>Decline</button>
                      </>
                    )}
                    {RESOLVED_SET.includes(detail.status) && <StatusBadge status={detail.status} />}
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[12px] text-[#64748B]">
                  <span>{clientName(detail.client)}</span>
                  <span className="text-[#CBD5E1]">·</span>
                  <span>{TYPE_LABEL[detail.type] ?? detail.type}</span>
                  {detail.recordId && (
                    <button onClick={() => router.push(`/records/${detail.recordId}`)} className="inline-flex items-center gap-1 font-semibold text-[#4F46E5] hover:underline">
                      <ExternalLink size={12} /> View linked record
                    </button>
                  )}
                </div>
              </div>

              <div ref={scrollRef} className="premium-scroll flex-1 overflow-y-auto px-5 py-4">
                {messages.map((m) => {
                  const staff = !!m.authorUserId;
                  if (staff) {
                    return (
                      <div key={m.id} className="mb-4 flex flex-col items-end">
                        <div className="mb-1 text-[12px] text-[#94A3B8]">You · {fmtTime(m.createdAt)}</div>
                        <div className="max-w-[75%] rounded-[16px] bg-[#4F46E5] px-4 py-2.5 text-[14px] leading-relaxed text-white">{m.body}</div>
                      </div>
                    );
                  }
                  const name = clientName(detail.client);
                  return (
                    <div key={m.id} className="mb-4 flex items-start gap-2.5">
                      <span className="mt-5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#E5E3DC] text-[11px] font-bold text-[#475569]">{initialsOf(name)}</span>
                      <div className="min-w-0">
                        <div className="mb-1 text-[12px] text-[#94A3B8]">{name} · {fmtTime(m.createdAt)}</div>
                        <div className="max-w-[75%] rounded-[16px] bg-[#F1F0EA] px-4 py-2.5 text-[14px] leading-relaxed text-[#0F172A]">{m.body}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {canReply ? (
                <div className="border-t border-[#F1F0EA] px-5 py-3">
                  <div className="flex items-end gap-2.5">
                    <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Type your reply..."
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                      className="flex-1 rounded-[10px] border border-[#E5E3DC] px-3.5 py-2.5 text-[14px] text-[#0F172A] outline-none transition-colors focus:border-[#4F46E5]" style={{ resize: 'none' }} />
                    <button onClick={submit} disabled={!reply.trim() || sendReply.isPending}
                      className="flex items-center gap-1.5 rounded-[10px] bg-[#4F46E5] px-5 py-2.5 text-[14px] font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-50"><Send size={16} /> Send</button>
                  </div>
                </div>
              ) : (
                <div className="border-t border-[#F1F0EA] px-5 py-4 text-center text-[13px] text-[#94A3B8]">This request is closed.</div>
              )}
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
