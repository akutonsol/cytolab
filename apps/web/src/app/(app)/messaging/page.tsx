'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  ChevronDown, Filter, MoreHorizontal, Paperclip, Plus, Search, Send, Video, X,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ClientSelect } from '@/components/ClientSelect';

// Brand avatar palette (no orange). Colour picked deterministically by name hash.
const BRAND = ['#4f7df9', '#6366f1', '#0d9488', '#16a34a', '#9333ea', '#0ea5e9'];
const hashOf = (s: string) => (s || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
const hueOf = (s: string) => BRAND[hashOf(s) % BRAND.length];
const initials = (n: string) => (n || '?').split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

// Decorative stock portraits — picked deterministically by name hash, with the
// coloured-initials tile as fallback if the image fails to load.
const AVATAR_POOL = [
  'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=96&h=96&fit=crop&crop=faces&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=96&h=96&fit=crop&crop=faces&q=80',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=96&h=96&fit=crop&crop=faces&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=96&h=96&fit=crop&crop=faces&q=80',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=96&h=96&fit=crop&crop=faces&q=80',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=96&h=96&fit=crop&crop=faces&q=80',
];
const photoOf = (s: string) => AVATAR_POOL[hashOf(s) % AVATAR_POOL.length];

const APPROVED = ['Approved', 'Billed', 'Paid', 'Completed'];
const PENDING = ['Pending', 'Submitted', 'Processing', 'Partial', 'Resulted'];
const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();
const clock = (d: string) => new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const daySep = (d: string) => {
  const t = new Date(); const y = new Date(Date.now() - 86_400_000);
  if (sameDay(d, t.toISOString())) return 'TODAY';
  if (sameDay(d, y.toISOString())) return 'YESTERDAY';
  return new Date(d).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }).toUpperCase();
};
const threadTime = (d: string) => {
  const t = new Date();
  if (sameDay(d, t.toISOString())) return clock(d);
  if (sameDay(d, new Date(Date.now() - 86_400_000).toISOString())) return 'Yesterday';
  return new Date(d).toLocaleDateString(undefined, { weekday: 'short' });
};

const getMessageStatus = (m: any): 'sent' | 'delivered' | 'read' =>
  m.readAt ? 'read' : m.deliveredAt ? 'delivered' : 'sent';

function ReadReceipt({ status }: { status: 'sent' | 'delivered' | 'read' }) {
  const color = status === 'read' ? '#4F46E5' : '#94A3B8';
  if (status === 'sent') {
    return (
      <svg width="16" height="10" viewBox="0 0 16 10" aria-label="sent">
        <polyline points="1,5 4,8 9,1" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" aria-label={status}>
      <polyline points="1,5 4,8 9,1" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="6,5 9,8 14,1" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span className="relative grid shrink-0 place-items-center overflow-hidden rounded-full font-bold text-white"
      style={{ width: size, height: size, background: hueOf(name), fontSize: size * 0.38 }}>
      {initials(name)}
      <Image src={photoOf(name)} alt="" fill unoptimized sizes={`${size}px`} className="object-cover" />
    </span>
  );
}

export default function MessagingPage() {
  const { claims } = useAuth();
  const myId = claims?.userId;
  const qc = useQueryClient();
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const notify = (type: 'ok' | 'err', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3200); };
  const [filter, setFilter] = useState<string>('');
  const [activeId, setActiveId] = useState<string>();
  const [text, setText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [openMore, setOpenMore] = useState(false);
  const [msgQ, setMsgQ] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: threads } = useQuery({
    queryKey: ['msg-threads', filter],
    queryFn: () => api.get<Paginated<any>>('/messaging/threads', { params: filter ? { type: filter } : {} }).then((r) => r.data),
    refetchInterval: 8000,
  });
  const threadRows = threads?.data ?? [];

  // Auto-select the first thread once loaded.
  useEffect(() => { if (!activeId && threadRows.length) setActiveId(threadRows[0].id); }, [threadRows, activeId]);

  const { data: thread } = useQuery({
    queryKey: ['msg-thread', activeId],
    enabled: !!activeId,
    queryFn: () => api.get(`/messaging/threads/${activeId}`).then((r) => r.data),
    refetchInterval: 5000, // poll for new messages (and refreshed read receipts)
  });

  // Typing indicators from other participants (poll every 2s while open).
  const { data: typingUsers = [] } = useQuery({
    queryKey: ['msg-typing', activeId],
    queryFn: () => api.get(`/messaging/threads/${activeId}/typing`).then((r) => r.data),
    refetchInterval: 2000,
    enabled: !!activeId,
  });
  const sendTyping = useMutation({ mutationFn: () => api.post(`/messaging/threads/${activeId}/typing`) });
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Mark inbound messages read; refreshes the thread-list unread state + bell.
  const markRead = useMutation({
    mutationFn: (threadId: string) => api.put(`/messaging/threads/${threadId}/read`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['msg-threads'] }); qc.invalidateQueries({ queryKey: ['notifications-unread'] }); },
  });
  const openThread = (id: string) => { setActiveId(id); markRead.mutate(id); };
  const handleCompose = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    clearTimeout(typingTimeoutRef.current);
    if (e.target.value && activeId) { sendTyping.mutate(); typingTimeoutRef.current = setTimeout(() => {}, 4000); }
  };

  const messages = thread?.messages ?? [];
  const shownMessages = msgQ.trim()
    ? messages.filter((m: any) => (m.body ?? '').toLowerCase().includes(msgQ.trim().toLowerCase()))
    : messages;
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages.length, activeId]);
  useEffect(() => { setMsgQ(''); }, [activeId]);
  // Viewing a thread's messages marks them read.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeId && thread?.messages?.length) markRead.mutate(activeId); }, [activeId, thread?.messages?.length]);

  const counterpart = useMemo(() => {
    if (!thread) return null;
    const other = thread.participants?.find((p: any) => p.userId && p.userId !== myId);
    return other?.user ?? null;
  }, [thread, myId]);
  const counterName = thread?.type === 'CLIENT'
    ? (thread?.client?.officeName || `${thread?.client?.firstName ?? ''} ${thread?.client?.lastName ?? ''}`.trim() || 'Client')
    : (counterpart ? `${counterpart.firstName} ${counterpart.lastName}`.trim() : thread?.title ?? '—');

  const send = useMutation({
    mutationFn: (body: string) => api.post(`/messaging/threads/${activeId}/messages`, { body }).then((r) => r.data),
    onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: ['msg-thread', activeId] }); qc.invalidateQueries({ queryKey: ['msg-threads'] }); },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Could not send message'),
  });
  const submit = () => { const b = text.trim(); if (b && activeId) send.mutate(b); };

  // Right-panel related records (CLIENT threads only).
  const { data: clientRecords } = useQuery({
    queryKey: ['msg-client-records', thread?.clientId],
    enabled: thread?.type === 'CLIENT' && !!thread?.clientId,
    queryFn: () => api.get<Paginated<any>>('/specimens/client', { params: { clientId: thread.clientId, pageSize: 100 } }).then((r) => r.data),
  });
  const recs = clientRecords?.data ?? [];
  const recCats = [
    { label: 'All Records', count: recs.length, hue: '#4f7df9' },
    { label: 'Pending', count: recs.filter((r: any) => PENDING.includes(r.status)).length, hue: '#0ea5e9' },
    { label: 'Authorized', count: recs.filter((r: any) => APPROVED.includes(r.status)).length, hue: '#16a34a' },
    { label: 'Flagged', count: recs.filter((r: any) => r.urgent).length, hue: '#e11d48' },
  ];

  return (
    <div className="flex h-[calc(100vh-140px)] gap-4">
      {/* ================= LEFT PANEL ================= */}
      <aside className="flex w-[300px] shrink-0 flex-col overflow-hidden rounded-2xl border border-card bg-surface shadow-card">
        <div className="flex items-center justify-between px-4 py-4">
          <div className="relative">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}
              className="select-bare cursor-pointer appearance-none bg-transparent pr-6 text-[17px] font-extrabold tracking-tight text-text outline-none">
              <option value="">All Messages</option>
              <option value="INTERNAL">Internal</option>
              <option value="CLIENT">Client</option>
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-text-secondary" />
          </div>
          <div className="flex items-center gap-2">
            <button aria-label="Filter" className="grid h-8 w-8 place-items-center rounded-full border border-[#eef2f7] text-[#9ca3af] transition-colors hover:text-[#111827]"><Filter size={15} /></button>
            <button aria-label="Search" className="grid h-8 w-8 place-items-center rounded-full border border-[#eef2f7] text-[#9ca3af] transition-colors hover:text-[#111827]"><Search size={15} /></button>
          </div>
        </div>

        <div className="premium-scroll flex-1 overflow-y-auto">
          {threadRows.length === 0 && <div className="px-4 py-8 text-center text-small text-text-tertiary">No conversations yet.</div>}
          {threadRows.map((t: any) => {
            const on = t.id === activeId;
            return (
              <button key={t.id} onClick={() => openThread(t.id)}
                className="flex w-full items-center gap-3 border-b border-[#f3f4f6] px-4 py-3.5 text-left transition-colors hover:bg-[#f8fafd]"
                style={{ background: on ? '#eef3ff' : undefined }}>
                <Avatar name={t.title} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[15px]" style={{ fontWeight: t.unread ? 700 : 500, color: t.unread ? '#0F172A' : '#374151' }}>{t.title}</span>
                    <span className="shrink-0 text-[12px] font-medium text-[#9ca3af]">{t.lastMessage ? threadTime(t.lastMessage.createdAt) : ''}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[13px]" style={{ fontWeight: t.unread ? 700 : 500, color: t.unread ? '#374151' : '#9ca3af' }}>{t.lastMessage?.body ?? 'No messages yet'}</span>
                    {t.unread && <span className="shrink-0" style={{ width: 8, height: 8, borderRadius: '50%', background: '#4F46E5' }} />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="border-t border-card p-3">
          <button onClick={() => setModalOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-control bg-primary py-3 text-small font-bold text-white transition-colors hover:bg-primary-hover"><Plus size={17} /> New Thread</button>
        </div>
      </aside>

      {/* ================= CENTER PANEL ================= */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-card bg-surface shadow-card">
        {!thread ? (
          <div className="grid flex-1 place-items-center text-small text-text-tertiary">Select a conversation</div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-card px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className="relative inline-flex">
                  <Avatar name={counterName} size={38} />
                  <span style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: '50%', background: '#22C55E', border: '2px solid white' }} />
                </div>
                <div>
                  <span className="text-[15px] font-bold text-text">{counterName}</span>
                  <div className="text-caption font-medium text-text-tertiary">{thread.subject ?? (thread.type === 'CLIENT' ? 'Client thread' : 'Internal thread')}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-9 items-center gap-2 rounded-full bg-[#f6f8fc] px-3.5 text-[#9ca3af]">
                  <Search size={15} />
                  <input
                    value={msgQ}
                    onChange={(e) => setMsgQ(e.target.value)}
                    placeholder="Search…"
                    className="w-24 border-none bg-transparent text-[13px] text-[#111827] outline-none placeholder:text-[#9ca3af] focus:w-36 transition-all"
                  />
                </div>
                <button aria-label="More" className="grid h-9 w-9 place-items-center rounded-full border border-[#eef2f7] text-[#9ca3af] hover:text-[#111827]"><MoreHorizontal size={17} /></button>
              </div>
            </div>

            <div ref={scrollRef} className="premium-scroll flex-1 overflow-y-auto px-6 py-5" style={{ background: '#ffffff' }}>
              {msgQ.trim() && !shownMessages.length && (
                <div className="mt-10 text-center text-[13px] text-[#9ca3af]">No messages match “{msgQ.trim()}”.</div>
              )}
              {shownMessages.map((m: any, i: number) => {
                const prev = shownMessages[i - 1]; const next = shownMessages[i + 1];
                const mine = m.authorUserId === myId;
                const showSep = !prev || !sameDay(prev.createdAt, m.createdAt);
                const endRun = !next || next.authorUserId !== m.authorUserId || !sameDay(next.createdAt, m.createdAt);
                return (
                  <div key={m.id}>
                    {showSep && <div className="my-6 text-center text-[12px] font-semibold tracking-wide text-[#9ca3af]">{daySep(m.createdAt)}</div>}
                    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${endRun ? 'mb-5' : 'mb-1'}`}>
                      <div className="max-w-[70%]">
                        <div className={mine
                          ? 'rounded-[18px] bg-[#4f7df9] px-[18px] py-[11px] text-[15px] font-normal leading-[1.55] text-white'
                          : 'rounded-[18px] bg-[#eef1fb] px-[18px] py-[11px] text-[15px] font-normal leading-[1.55] text-[#1f2937]'}>
                          {m.body}
                        </div>
                        {endRun && (
                          <div className={`mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-[#9ca3af] ${mine ? 'justify-end' : 'justify-start'}`}>
                            <span>{clock(m.createdAt)}</span>
                            {mine && <ReadReceipt status={getMessageStatus(m)} />}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {typingUsers.length > 0 && (
              <div className="flex items-center gap-2 px-5 pb-2 pt-0">
                <div className="flex gap-[3px]">
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#94A3B8', display: 'inline-block', animation: 'typingDot 1.4s ease-in-out infinite', animationDelay: `${i * 0.2}s` }} />
                  ))}
                </div>
                <span className="text-[12px] italic text-[#94A3B8]">
                  {typingUsers.length === 1 ? `${typingUsers[0].name} is typing…` : `${typingUsers.length} people are typing…`}
                </span>
              </div>
            )}

            <div className="flex items-center gap-3 border-t border-card px-5 py-4">
              <button aria-label="Attach" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-text-tertiary hover:bg-lightgray"><Paperclip size={18} /></button>
              <input value={text} onChange={handleCompose} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                placeholder="Type your message..." className="h-11 flex-1 rounded-pill bg-[#f6f8fc] px-4 text-small text-text outline-none placeholder:text-text-tertiary" />
              <button onClick={submit} disabled={!text.trim() || send.isPending}
                style={{ opacity: text.trim() ? 1 : 0.5, cursor: text.trim() ? 'pointer' : 'not-allowed' }}
                className="flex h-11 items-center gap-1.5 rounded-pill bg-primary px-5 text-small font-bold text-white transition-colors hover:bg-primary-hover"><Send size={16} /> Send</button>
            </div>
          </>
        )}
      </section>

      {/* ================= RIGHT PANEL ================= */}
      {thread && (
        <aside className="premium-scroll hidden w-[300px] shrink-0 flex-col overflow-y-auto rounded-2xl border border-card bg-surface p-5 shadow-card xl:flex">
          <div className="mb-2 flex items-center justify-between gap-2">
            <button aria-label="Collapse panel" className="grid h-9 w-9 place-items-center rounded-full border border-[#eef2f7] text-[#9ca3af] hover:text-[#111827]"><ChevronDown size={16} className="rotate-90" /></button>
            <button aria-label="Video call" className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-primary"><Video size={16} /></button>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="rounded-full p-1 ring-1 ring-[#c9d8ff]">
              <Avatar name={counterName} size={84} />
            </div>
            <div className="mt-3 text-[17px] font-extrabold text-text">{counterName}</div>
            <div className="text-caption font-medium text-text-tertiary">{thread.type === 'CLIENT' ? 'Client contact' : counterpart?.email ?? 'Team member'}</div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-control bg-[#eef3ff] p-3">
              <div className="text-small font-bold text-text">{thread.type === 'CLIENT' ? counterName : `${thread.participants?.length ?? 0}`}</div>
              <div className="mt-0.5 text-tiny font-semibold text-text-tertiary">{thread.type === 'CLIENT' ? 'Client Thread' : 'Participants'}</div>
            </div>
            <div className="rounded-control bg-[#eef3ff] p-3">
              <div className="text-small font-bold text-text">{thread.type === 'CLIENT' ? 'Client' : 'Internal'}</div>
              <div className="mt-0.5 text-tiny font-semibold text-text-tertiary">Type</div>
            </div>
          </div>

          <button onClick={() => setOpenMore((v) => !v)} className="mt-3 flex items-center justify-center gap-1.5 rounded-control bg-[#eef3ff] py-2.5 text-small font-bold text-primary">
            Open more <ChevronDown size={15} className="transition-transform" style={{ transform: openMore ? 'rotate(180deg)' : 'none' }} />
          </button>
          {openMore && (
            <div className="mt-2 flex flex-col gap-1.5 rounded-control bg-[#f6f8fc] p-3">
              {thread.participants?.map((p: any) => (
                <div key={p.id} className="flex items-center gap-2">
                  <Avatar name={p.user ? `${p.user.firstName} ${p.user.lastName}` : 'Client'} size={26} />
                  <span className="truncate text-caption font-semibold text-text-secondary">{p.user ? `${p.user.firstName} ${p.user.lastName}` : (p.portalUser ? `${p.portalUser.firstName} ${p.portalUser.lastName}` : 'Client')}{p.userId === myId ? ' (you)' : ''}</span>
                </div>
              ))}
            </div>
          )}

          {thread.type === 'CLIENT' && (
            <div className="mt-6">
              <div className="mb-2 text-caption font-bold uppercase tracking-wide text-text-tertiary">Related Records</div>
              <div className="flex flex-col gap-1.5">
                {recCats.map((c) => (
                  <button key={c.label} className="flex items-center gap-3 rounded-control p-2.5 text-left transition-colors hover:bg-[#f6f8fc]">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control" style={{ background: `${c.hue}1a`, color: c.hue }}><Search size={15} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-small font-bold text-text">{c.label}</div>
                      <div className="text-tiny font-medium text-text-tertiary">{c.count} record{c.count === 1 ? '' : 's'}</div>
                    </div>
                    <ChevronDown size={16} className="-rotate-90 text-text-tertiary" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      )}

      {modalOpen && <NewThreadModal onClose={() => setModalOpen(false)} onCreated={(id) => { setModalOpen(false); qc.invalidateQueries({ queryKey: ['msg-threads'] }); setActiveId(id); }} notify={notify} />}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 text-[14px] font-semibold text-white shadow-lg"
          style={{ background: toast.type === 'ok' ? '#16A34A' : '#DC2626' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function NewThreadModal({ onClose, onCreated, notify }: { onClose: () => void; onCreated: (id: string) => void; notify: (type: 'ok' | 'err', msg: string) => void }) {
  const [subject, setSubject] = useState('');
  const [type, setType] = useState<'INTERNAL' | 'CLIENT'>('INTERNAL');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<{ id: string; name: string }[]>([]);
  const [clientId, setClientId] = useState<string>();

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ['msg-users', q], enabled: type === 'INTERNAL',
    queryFn: () => api.get('/messaging/users', { params: q ? { q } : {} }).then((r) => r.data),
  });

  const create = useMutation({
    mutationFn: () => api.post('/messaging/threads', {
      subject: subject.trim() || undefined, type,
      userIds: type === 'INTERNAL' ? picked.map((p) => p.id) : [],
      clientId: type === 'CLIENT' ? clientId : undefined,
    }).then((r) => r.data),
    onSuccess: (t: any) => onCreated(t.id),
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Could not create thread'),
  });
  const canCreate = type === 'INTERNAL' ? picked.length > 0 : !!clientId;
  const inputCls = 'h-11 w-full rounded-[10px] border border-[#e2e8f0] bg-white px-3.5 text-small text-text outline-none transition-colors focus:border-primary';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-card bg-white p-6 shadow-float" onClick={(e) => e.stopPropagation()}>
        <div className="text-[20px] font-extrabold tracking-tight text-text">New thread</div>
        <div className="mt-0.5 text-small font-medium text-text-secondary">Start an internal or client conversation.</div>

        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-small font-bold text-text">Subject</span>
            <input autoFocus value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Case review" className={inputCls} />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-small font-bold text-text">Type</span>
            <div className="flex gap-2">
              {(['INTERNAL', 'CLIENT'] as const).map((t) => (
                <button key={t} onClick={() => setType(t)}
                  className="flex-1 rounded-[10px] border py-2.5 text-small font-bold transition-colors"
                  style={{ borderColor: type === t ? '#4f7df9' : '#e2e8f0', background: type === t ? '#eef3ff' : '#fff', color: type === t ? '#4f7df9' : '#6b7280' }}>
                  {t === 'INTERNAL' ? 'Internal' : 'Client'}
                </button>
              ))}
            </div>
          </div>

          {type === 'INTERNAL' ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-small font-bold text-text">Participants</span>
              {picked.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {picked.map((p) => (
                    <span key={p.id} className="flex items-center gap-1.5 rounded-pill bg-primary-soft px-2 py-1 text-caption font-bold text-primary">
                      {p.name} <button onClick={() => setPicked((s) => s.filter((x) => x.id !== p.id))}><X size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search staff…" className={inputCls} />
              <div className="max-h-40 overflow-y-auto rounded-[10px] border border-[#e2e8f0]">
                {users.filter((u) => !picked.some((p) => p.id === u.id)).slice(0, 8).map((u) => (
                  <button key={u.id} onClick={() => setPicked((s) => [...s, { id: u.id, name: `${u.firstName} ${u.lastName}` }])}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-[#f6f8fc]">
                    <Avatar name={`${u.firstName} ${u.lastName}`} size={28} />
                    <span className="text-small font-semibold text-text">{u.firstName} {u.lastName}</span>
                    <span className="ml-auto text-tiny text-text-tertiary">{u.email}</span>
                  </button>
                ))}
                {users.length === 0 && <div className="px-3 py-3 text-caption text-text-tertiary">No staff found.</div>}
              </div>
            </div>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="text-small font-bold text-text">Client</span>
              <ClientSelect placeholder="Search a client" value={clientId} onChange={setClientId} />
            </label>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2.5">
          <button onClick={onClose} className="h-11 rounded-[10px] border border-card px-5 text-small font-bold text-text-secondary hover:text-text">Cancel</button>
          <button onClick={() => canCreate && create.mutate()} disabled={!canCreate || create.isPending}
            className="h-11 rounded-[10px] bg-primary px-6 text-small font-bold text-white transition-colors hover:bg-primary-hover disabled:opacity-50">
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
