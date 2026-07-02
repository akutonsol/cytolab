'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { App } from 'antd';
import {
  ChevronDown, Filter, MoreHorizontal, Paperclip, Plus, Search, Send, Star, Video, X,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ClientSelect } from '@/components/ClientSelect';

// Brand avatar palette (no orange). Colour picked deterministically by name hash.
const BRAND = ['#4f7df9', '#6366f1', '#0d9488', '#16a34a', '#9333ea', '#0ea5e9'];
const hueOf = (s: string) => BRAND[(s || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % BRAND.length];
const initials = (n: string) => (n || '?').split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

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

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: hueOf(name), fontSize: size * 0.38 }}>{initials(name)}</span>
  );
}

export default function MessagingPage() {
  const { message } = App.useApp();
  const { claims } = useAuth();
  const myId = claims?.userId;
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>('');
  const [activeId, setActiveId] = useState<string>();
  const [text, setText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [openMore, setOpenMore] = useState(false);
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
    refetchInterval: 5000, // poll for new messages
  });

  const messages = thread?.messages ?? [];
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages.length, activeId]);

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
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Could not send message'),
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
    <div className="flex h-[calc(100vh-140px)] overflow-hidden rounded-card border border-card bg-surface shadow-card">
      {/* ================= LEFT PANEL ================= */}
      <aside className="flex w-[280px] shrink-0 flex-col border-r border-card">
        <div className="flex items-center justify-between px-4 py-4">
          <div className="relative">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}
              className="cursor-pointer appearance-none bg-transparent pr-6 text-[17px] font-extrabold tracking-tight text-text outline-none">
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
              <button key={t.id} onClick={() => setActiveId(t.id)}
                className="flex w-full items-center gap-3 border-b border-[#f3f4f6] px-4 py-3.5 text-left transition-colors hover:bg-[#f8fafd]"
                style={{ background: on ? '#eef3ff' : undefined }}>
                <Avatar name={t.title} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[15px] font-semibold text-[#111827]">{t.title}</span>
                    <span className="shrink-0 text-[12px] font-medium text-[#9ca3af]">{t.lastMessage ? threadTime(t.lastMessage.createdAt) : ''}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-[#9ca3af]">{t.lastMessage?.body ?? 'No messages yet'}</span>
                    {t.unread && <Star size={14} className="shrink-0 fill-[#4f7df9] text-[#4f7df9]" />}
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
      <section className="flex min-w-0 flex-1 flex-col">
        {!thread ? (
          <div className="grid flex-1 place-items-center text-small text-text-tertiary">Select a conversation</div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-card px-5 py-3.5">
              <div className="flex items-center gap-3">
                <Avatar name={counterName} size={38} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold text-text">{counterName}</span>
                    <span className="h-2 w-2 rounded-full bg-success" />
                  </div>
                  <span className="text-caption font-medium text-text-tertiary">{thread.subject ?? (thread.type === 'CLIENT' ? 'Client thread' : 'Internal thread')}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button aria-label="Search" className="grid h-9 w-9 place-items-center rounded-full text-text-tertiary hover:bg-lightgray"><Search size={17} /></button>
                <button aria-label="More" className="grid h-9 w-9 place-items-center rounded-full text-text-tertiary hover:bg-lightgray"><MoreHorizontal size={17} /></button>
              </div>
            </div>

            <div ref={scrollRef} className="premium-scroll flex-1 overflow-y-auto px-6 py-5" style={{ background: '#ffffff' }}>
              {messages.map((m: any, i: number) => {
                const prev = messages[i - 1]; const next = messages[i + 1];
                const mine = m.authorUserId === myId;
                const showSep = !prev || !sameDay(prev.createdAt, m.createdAt);
                const endRun = !next || next.authorUserId !== m.authorUserId || !sameDay(next.createdAt, m.createdAt);
                return (
                  <div key={m.id}>
                    {showSep && <div className="my-5 text-center text-[12px] font-semibold tracking-wide text-[#9ca3af]">{daySep(m.createdAt)}</div>}
                    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[62%]">
                        <div className={mine
                          ? 'rounded-[20px] rounded-br-[6px] bg-[#4f7df9] px-4 py-3 text-[15px] font-normal leading-relaxed text-white'
                          : 'rounded-[20px] rounded-bl-[6px] bg-[#eef1fb] px-4 py-3 text-[15px] font-normal leading-relaxed text-[#1f2937]'}>
                          {m.body}
                        </div>
                        {endRun && <div className={`mt-1.5 text-[12px] font-medium text-[#9ca3af] ${mine ? 'text-right' : 'text-left'}`}>{clock(m.createdAt)}</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-3 border-t border-card px-5 py-4">
              <button aria-label="Attach" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-text-tertiary hover:bg-lightgray"><Paperclip size={18} /></button>
              <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                placeholder="Type your message..." className="h-11 flex-1 rounded-pill bg-[#f6f8fc] px-4 text-small text-text outline-none placeholder:text-text-tertiary" />
              <button onClick={submit} disabled={!text.trim() || send.isPending}
                className="flex h-11 items-center gap-1.5 rounded-pill bg-primary px-5 text-small font-bold text-white transition-colors hover:bg-primary-hover disabled:opacity-50"><Send size={16} /> Send</button>
            </div>
          </>
        )}
      </section>

      {/* ================= RIGHT PANEL ================= */}
      {thread && (
        <aside className="premium-scroll hidden w-[280px] shrink-0 flex-col overflow-y-auto border-l border-card p-5 xl:flex">
          <div className="mb-2 flex items-center justify-end gap-2">
            <button aria-label="Video call" className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-primary"><Video size={16} /></button>
          </div>
          <div className="flex flex-col items-center text-center">
            <Avatar name={counterName} size={80} />
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

      {modalOpen && <NewThreadModal onClose={() => setModalOpen(false)} onCreated={(id) => { setModalOpen(false); qc.invalidateQueries({ queryKey: ['msg-threads'] }); setActiveId(id); }} />}
    </div>
  );
}

function NewThreadModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { message } = App.useApp();
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
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Could not create thread'),
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
