'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Send } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { portalApi } from '@/lib/portal-api';
import { CrStatusBadge, fmtDateTime } from '@/lib/portal-ui';

const CR_TYPES = [
  { value: 'GeneralQuery', label: 'General query' },
  { value: 'DemographicsCorrection', label: 'Demographics correction' },
  { value: 'AddTest', label: 'Add a test' },
  { value: 'CancelRequest', label: 'Cancel a request' },
];
const INPUT = 'h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-3.5 text-[14px] text-[#0F172A] outline-none transition-colors focus:border-[#4F46E5]';

function MessagesInner() {
  const qc = useQueryClient();
  const recordId = useSearchParams().get('recordId') ?? undefined;
  const [activeId, setActiveId] = useState<string>();
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState('');
  // new-request form
  const [subject, setSubject] = useState('');
  const [type, setType] = useState('GeneralQuery');
  const [body, setBody] = useState('');
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const notify = (t: 'ok' | 'err', msg: string) => { setToast({ type: t, msg }); setTimeout(() => setToast(null), 3200); };

  const { data: me } = useQuery({ queryKey: ['portal-me'], queryFn: () => portalApi.get('/portal/auth/me').then((r) => r.data) });
  const { data: listData } = useQuery({
    queryKey: ['portal-change-requests', 'list'],
    queryFn: () => portalApi.get('/portal/change-requests', { params: { pageSize: 50 } }).then((r) => r.data),
    refetchInterval: 10_000,
  });
  const threads: any[] = listData?.data ?? [];

  const { data: active } = useQuery({
    queryKey: ['portal-change-request', activeId],
    enabled: !!activeId,
    queryFn: () => portalApi.get(`/portal/change-requests/${activeId}`).then((r) => r.data),
    refetchInterval: 8000,
  });

  // Deep-link from a record: open the new-request composer prefilled.
  useEffect(() => { if (recordId) { setComposing(true); setSubject((s) => s || 'Question about my record'); } }, [recordId]);
  useEffect(() => { if (!activeId && !composing && threads.length) setActiveId(threads[0].id); }, [threads, activeId, composing]);

  const create = useMutation({
    mutationFn: () => portalApi.post('/portal/change-requests', { type, subject: subject.trim(), message: body.trim(), recordId }).then((r) => r.data),
    onSuccess: (cr: any) => {
      setComposing(false); setSubject(''); setBody(''); setType('GeneralQuery');
      qc.invalidateQueries({ queryKey: ['portal-change-requests'] });
      setActiveId(cr.id);
      notify('ok', 'Message sent to the lab');
    },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Could not send message'),
  });

  const reply = useMutation({
    mutationFn: (b: string) => portalApi.post(`/portal/change-requests/${activeId}/messages`, { body: b }).then((r) => r.data),
    onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: ['portal-change-request', activeId] }); qc.invalidateQueries({ queryKey: ['portal-change-requests'] }); },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Could not send'),
  });

  const startNew = () => { setComposing(true); setActiveId(undefined); };
  const sendReply = () => { const b = text.trim(); if (b && activeId) reply.mutate(b); };
  const canCreate = !!subject.trim() && !!body.trim() && !create.isPending;
  const messages: any[] = active?.messages ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-[28px] font-bold tracking-tight text-[#0F172A]">Messages</h1>

      <div className="flex h-[560px] gap-4">
        {/* Thread list */}
        <aside className="flex w-[300px] shrink-0 flex-col overflow-hidden rounded-2xl border border-[#EEF2F7] bg-white">
          <div className="border-b border-[#EEF2F7] p-3">
            <button onClick={startNew} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#4F46E5] py-2.5 text-[13px] font-semibold text-white transition-[filter] hover:brightness-110"><Plus size={16} /> New Message</button>
          </div>
          <div className="premium-scroll flex-1 overflow-y-auto">
            {threads.length === 0 && <div className="px-4 py-8 text-center text-[13px] text-[#94A3B8]">No messages yet.</div>}
            {threads.map((t) => {
              const on = t.id === activeId && !composing;
              return (
                <button key={t.id} onClick={() => { setComposing(false); setActiveId(t.id); }}
                  className="flex w-full flex-col gap-1 border-b border-[#F8FAFC] px-4 py-3 text-left transition-colors hover:bg-[#FAFBFD]"
                  style={{ background: on ? '#EEF3FF' : undefined }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[14px] font-semibold text-[#0F172A]">{t.subject}</span>
                    <CrStatusBadge status={t.status} />
                  </div>
                  <span className="truncate text-[12px] text-[#94A3B8]">{t.messages?.[t.messages.length - 1]?.body ?? 'No messages'}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Conversation / composer */}
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#EEF2F7] bg-white">
          {composing ? (
            <div className="flex flex-col gap-4 p-6">
              <div className="text-[16px] font-bold text-[#0F172A]">New message to the lab</div>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[#0F172A]">Topic</label>
                <select className={INPUT} value={type} onChange={(e) => setType(e.target.value)}>
                  {CR_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[#0F172A]">Subject</label>
                <input className={INPUT} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief subject" />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[#0F172A]">Message</label>
                <textarea className={`${INPUT} h-auto py-2.5`} rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="How can the lab help?" style={{ resize: 'vertical' }} />
              </div>
              {recordId && <div className="text-[12px] text-[#94A3B8]">Linked to record {recordId.slice(0, 8)}…</div>}
              <div className="flex justify-end gap-2">
                <button className="btn-secondary" onClick={() => setComposing(false)}>Cancel</button>
                <button className="btn-primary" disabled={!canCreate} style={{ opacity: canCreate ? 1 : 0.5 }} onClick={() => create.mutate()}>{create.isPending ? 'Sending…' : 'Send'}</button>
              </div>
            </div>
          ) : !active ? (
            <div className="grid flex-1 place-items-center text-[13px] text-[#94A3B8]">Select a conversation</div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-[#EEF2F7] px-5 py-3.5">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-bold text-[#0F172A]">{active.subject}</div>
                  <div className="text-[12px] text-[#94A3B8]">{CR_TYPES.find((t) => t.value === active.type)?.label ?? active.type}</div>
                </div>
                <CrStatusBadge status={active.status} />
              </div>
              <div className="premium-scroll flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {messages.map((m) => {
                  const mine = !!m.authorPortalUserId && (!me || m.authorPortalUserId === me.id);
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[75%]">
                        <div className={mine ? 'rounded-[16px] bg-[#4F46E5] px-4 py-2.5 text-[14px] leading-relaxed text-white' : 'rounded-[16px] bg-[#EEF1FB] px-4 py-2.5 text-[14px] leading-relaxed text-[#1F2937]'}>{m.body}</div>
                        <div className={`mt-1 text-[11px] text-[#94A3B8] ${mine ? 'text-right' : 'text-left'}`}>{mine ? 'You' : 'Lab'} · {fmtDateTime(m.createdAt)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 border-t border-[#EEF2F7] px-4 py-3">
                <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                  placeholder="Type a reply…" className="h-11 flex-1 rounded-full bg-[#F6F8FC] px-4 text-[14px] text-[#111827] outline-none placeholder:text-[#94A3B8]" />
                <button onClick={sendReply} disabled={!text.trim() || reply.isPending}
                  className="flex h-11 items-center gap-1.5 rounded-full bg-[#4F46E5] px-5 text-[14px] font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-50"><Send size={16} /> Send</button>
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

export default function PortalMessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesInner />
    </Suspense>
  );
}
