'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Check, Copy, Mail, Send } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/feature-context';
import { AGREEMENT_META, STATUS_META, TIMELINE, URGENCY_META, dateTime, shortDate, timelineIndex, type Consult } from '@/lib/teleconsult';

const CARD = 'rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]';

export default function ConsultDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const { isEnabled } = useFeatures();
  const [copied, setCopied] = useState(false);

  const { data: c, isLoading } = useQuery<Consult>({ queryKey: ['consult', id], queryFn: () => api.get(`/teleconsult/${id}`).then((r) => r.data), enabled: isEnabled('TELECONSULTATION') });

  const act = useMutation({
    mutationFn: (ep: string) => api.post(`/teleconsult/${id}/${ep}`).then((r) => r.data),
    onSuccess: (_d, ep) => { message.success(ep === 'accept' ? 'Opinion accepted' : ep === 'decline' ? 'Opinion declined' : 'Access link resent'); qc.invalidateQueries({ queryKey: ['consult', id] }); qc.invalidateQueries({ queryKey: ['teleconsult'] }); },
    onError: () => message.error('Action failed'),
  });

  if (!isEnabled('TELECONSULTATION')) return <div className="grid h-[60vh] place-items-center text-[#475569]">Teleconsultation is disabled for this lab.</div>;
  if (isLoading || !c) return <div className="grid h-[60vh] place-items-center text-[#475569]">Loading…</div>;

  const publicLink = typeof window !== 'undefined' ? `${window.location.origin}/teleconsult/public/${c.accessToken}` : '';
  const copyLink = () => { navigator.clipboard.writeText(publicLink); setCopied(true); message.success('Access link copied'); setTimeout(() => setCopied(false), 1500); };
  const idx = timelineIndex(c.status);
  const shared = [c.sharedNarrative && 'Narrative report', c.sharedBethesda && 'Bethesda classification', c.sharedImages && 'Digital slide images'].filter(Boolean) as string[];

  return (
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      <button onClick={() => router.push('/teleconsult')} className="mb-4 flex items-center gap-1.5 text-[13px] font-semibold text-[#475569] hover:text-[#0F172A]"><ArrowLeft size={15} /> Teleconsultations</button>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-[#0F172A]">Consultation <span className="font-mono text-[#4F46E5]">{c.caseReference}</span></h1>
          <p className="mt-1 text-[14px] text-[#6B7280]">{c.labNo} · {c.specimenType}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: URGENCY_META[c.urgency].bg, color: URGENCY_META[c.urgency].fg }}>{URGENCY_META[c.urgency].label}</span>
          <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: STATUS_META[c.status].bg, color: STATUS_META[c.status].fg }}>{STATUS_META[c.status].label}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* LEFT — case + response */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className={`${CARD} p-5`}>
            <div className="mb-3 text-[12px] font-bold uppercase tracking-wide text-[#475569]">Case Details (de-identified)</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
              <div><div className="text-[11px] font-semibold uppercase tracking-wide text-[#475569]">Patient</div><div className="mt-0.5 font-semibold text-[#0F172A]">{c.patientInitials}</div></div>
              <div><div className="text-[11px] font-semibold uppercase tracking-wide text-[#475569]">Specimen</div><div className="mt-0.5 text-[#334155]">{c.specimenType}</div></div>
            </div>
            <div className="mt-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#475569]">Clinical Summary</div>
              <p className="mt-1 text-[14px] text-[#334155]">{c.clinicalSummary}</p>
            </div>
            <div className="mt-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#475569]">Specific Question</div>
              <p className="mt-1 text-[14px] font-medium text-[#0F172A]">{c.specificQuestion}</p>
            </div>
          </div>

          {/* Timeline */}
          <div className={`${CARD} p-5`}>
            <div className="mb-4 text-[12px] font-bold uppercase tracking-wide text-[#475569]">Progress</div>
            <div className="flex items-center">
              {TIMELINE.map((stage, i) => (
                <div key={stage} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="grid h-6 w-6 place-items-center rounded-full text-white" style={{ background: i <= idx ? '#4F46E5' : '#E2E8F0' }}>{i <= idx && <Check size={13} />}</span>
                    <span className="text-[11px] font-semibold" style={{ color: i <= idx ? '#4F46E5' : '#475569' }}>{stage}</span>
                  </div>
                  {i < TIMELINE.length - 1 && <span className="mx-1 mb-4 h-0.5 flex-1" style={{ background: i < idx ? '#4F46E5' : '#E2E8F0' }} />}
                </div>
              ))}
            </div>
          </div>

          {/* Response */}
          {c.consultantResponse ? (
            <div className={`${CARD} p-5`}>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[12px] font-bold uppercase tracking-wide text-[#475569]">Consultant Response</div>
                {c.agreementLevel && <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: AGREEMENT_META[c.agreementLevel].bg, color: AGREEMENT_META[c.agreementLevel].fg }}>{AGREEMENT_META[c.agreementLevel].label}</span>}
              </div>
              {c.consultantDiagnosis && <div className="mb-2 text-[15px] font-bold text-[#0F172A]">{c.consultantDiagnosis}</div>}
              <p className="whitespace-pre-wrap text-[14px] text-[#334155]">{c.consultantResponse}</p>
              <div className="mt-2 text-[12px] text-[#475569]">Received {dateTime(c.respondedAt)}</div>

              {c.status === 'Responded' && (
                <div className="mt-4 flex gap-2 border-t border-[#F1F5F9] pt-4">
                  <button onClick={() => act.mutate('accept')} className="rounded-lg bg-[#16A34A] px-4 py-2 text-[13px] font-semibold text-white">Accept Opinion</button>
                  <button onClick={() => act.mutate('decline')} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[13px] font-semibold text-[#475569]">Decline</button>
                </div>
              )}
            </div>
          ) : (
            <div className={`${CARD} p-5 text-[14px] text-[#475569]`}>Awaiting the consultant's response.</div>
          )}
        </div>

        {/* RIGHT — request details */}
        <div className="flex flex-col gap-4">
          <div className={`${CARD} p-5`}>
            <div className="mb-3 text-[12px] font-bold uppercase tracking-wide text-[#475569]">Consultant</div>
            <div className="text-[15px] font-bold text-[#0F172A]">{c.consultantName}</div>
            {c.consultantInstitution && <div className="text-[13px] text-[#475569]">{c.consultantInstitution}</div>}
            <a href={`mailto:${c.consultantEmail}`} className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-[#4F46E5]"><Mail size={13} /> {c.consultantEmail}</a>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
              <div><div className="text-[11px] font-semibold uppercase tracking-wide text-[#475569]">Urgency</div><div className="mt-0.5 font-semibold" style={{ color: URGENCY_META[c.urgency].fg }}>{c.urgency}</div></div>
              <div><div className="text-[11px] font-semibold uppercase tracking-wide text-[#475569]">Due</div><div className="mt-0.5" style={{ color: c.isOverdue ? '#B91C1C' : '#334155' }}>{shortDate(c.dueDate)}</div></div>
            </div>
          </div>

          <div className={`${CARD} p-5`}>
            <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#475569]">Shared Materials</div>
            {shared.length === 0 ? <div className="text-[13px] text-[#475569]">Case summary only.</div> : (
              <ul className="flex flex-col gap-1 text-[13px] text-[#334155]">{shared.map((s) => <li key={s} className="flex items-center gap-1.5"><Check size={13} className="text-[#16A34A]" /> {s}</li>)}</ul>
            )}
          </div>

          <div className={`${CARD} p-5`}>
            <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#475569]">Access Link</div>
            <div className="flex items-center gap-2">
              <input readOnly value={publicLink} className="h-9 flex-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2 text-[12px] text-[#475569] outline-none" />
              <button onClick={copyLink} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#EEF2FF] text-[#4F46E5]">{copied ? <Check size={15} /> : <Copy size={15} />}</button>
            </div>
            <div className="mt-1.5 text-[11px] text-[#475569]">Expires {shortDate(c.tokenExpiresAt)}</div>
            <button onClick={() => act.mutate('resend')} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 py-2 text-[13px] font-semibold text-[#4F46E5] hover:bg-[#EEF3FF]"><Send size={14} /> Resend Link</button>
          </div>
        </div>
      </div>
    </div>
  );
}
