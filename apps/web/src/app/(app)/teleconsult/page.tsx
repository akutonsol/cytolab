'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Video } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/feature-context';
import { NewConsultModal } from '@/components/NewConsultModal';
import {
  AGREEMENT_META, STATUS_META, TIMELINE, URGENCY_META, shortDate, timelineIndex,
  type Consult, type ConsultAnalytics, type ConsultStatus,
} from '@/lib/teleconsult';

const CARD = 'rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]';
const TABS: (ConsultStatus | 'all')[] = ['all', 'Pending', 'Responded', 'Accepted'];

function Kpi({ label, value, fg = '#0F172A' }: { label: string; value: string; fg?: string }) {
  return <div className={`${CARD} p-4`}><div className="text-[24px] font-bold leading-none" style={{ color: fg }}>{value}</div><div className="mt-1.5 text-[13px] text-[#475569]">{label}</div></div>;
}

function Timeline({ status }: { status: ConsultStatus }) {
  const idx = timelineIndex(status);
  return (
    <div className="flex items-center gap-1">
      {TIMELINE.map((stage, i) => (
        <div key={stage} className="flex items-center gap-1">
          <div className="flex flex-col items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: i <= idx ? '#4F46E5' : 'transparent', border: i <= idx ? 'none' : '1.5px solid #CBD5E1' }} />
          </div>
          {i < TIMELINE.length - 1 && <span className="h-px w-5" style={{ background: i < idx ? '#4F46E5' : '#E2E8F0' }} />}
        </div>
      ))}
    </div>
  );
}

export default function TeleconsultPage() {
  const { isEnabled } = useFeatures();
  const enabled = isEnabled('TELECONSULTATION');
  const router = useRouter();
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [tab, setTab] = useState<ConsultStatus | 'all'>('all');
  const [newOpen, setNewOpen] = useState(false);

  const { data: analytics } = useQuery<ConsultAnalytics>({ queryKey: ['consult-analytics'], queryFn: () => api.get('/teleconsult/analytics').then((r) => r.data), enabled });
  const { data: list = [] } = useQuery<Consult[]>({ queryKey: ['teleconsult', tab], queryFn: () => api.get('/teleconsult', { params: { ...(tab !== 'all' && { status: tab }) } }).then((r) => r.data), enabled });

  const act = useMutation({
    mutationFn: ({ id, ep }: { id: string; ep: string }) => api.post(`/teleconsult/${id}/${ep}`).then((r) => r.data),
    onSuccess: (_d, v) => { message.success(v.ep === 'accept' ? 'Opinion accepted' : v.ep === 'decline' ? 'Opinion declined' : 'Access link resent'); ['teleconsult', 'consult-analytics'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); },
    onError: () => message.error('Action failed'),
  });

  if (!enabled) {
    return (
      <div className="min-h-full pt-4" style={{ background: '#F8FAFC' }}>
        <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[#EEF2F7] bg-white p-8 text-center shadow-sm">
          <Video size={28} className="mx-auto text-[#9CA3AF]" />
          <div className="mt-3 text-[18px] font-bold text-[#0F172A]">Feature not enabled</div>
          <div className="mt-1 text-[14px] text-[#6B7280]">Teleconsultation is disabled for this lab.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#0F172A]">Teleconsultation</h1>
          <p className="mt-1.5 text-[15px] text-[#6B7280]">Request de-identified second opinions from external specialists.</p>
        </div>
        <button onClick={() => setNewOpen(true)} className="rounded-lg bg-[#4F46E5] px-4 py-2.5 text-[14px] font-semibold text-white">New Consultation</button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Active Requests" value={String(analytics?.pending ?? 0)} />
        <Kpi label="Awaiting Response" value={String(analytics?.pending ?? 0)} fg={(analytics?.pending ?? 0) > 0 ? '#B45309' : '#0F172A'} />
        <Kpi label="Responded" value={String(analytics?.responded ?? 0)} fg="#16A34A" />
        <Kpi label="Avg Response Time" value={`${analytics?.avgResponseDays ?? 0}d`} fg="#4F46E5" />
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-full bg-[#F1F5F9] p-1" style={{ width: 'fit-content' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors" style={tab === t ? { background: '#fff', color: '#0F172A', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } : { color: '#475569' }}>{t === 'all' ? 'All' : t}</button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className={`${CARD} p-12 text-center text-[#475569]`}>No consultations.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {list.map((c) => {
            const u = URGENCY_META[c.urgency];
            const s = STATUS_META[c.status];
            return (
              <div key={c.id} className={`${CARD} flex flex-col p-4`}>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: u.bg, color: u.fg }}>{u.label}</span>
                    <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: s.bg, color: s.fg }}>{s.label}</span>
                  </div>
                  <span className="font-mono text-[12px] text-[#475569]">{c.caseReference}</span>
                </div>

                <div className="text-[15px] font-bold text-[#0F172A]"><span className="font-mono text-[#4F46E5]">{c.labNo}</span> · {c.specimenType}</div>
                <div className="mt-0.5 text-[13px] text-[#475569]">{c.consultantName}{c.consultantInstitution ? ` · ${c.consultantInstitution}` : ''}</div>
                <p className="mt-2 line-clamp-2 text-[13px] text-[#334155]">{c.specificQuestion}</p>

                <div className="mt-2 text-[12px]" style={{ color: c.isOverdue ? '#B91C1C' : '#475569' }}>
                  {c.dueDate ? `Due ${shortDate(c.dueDate)}${c.isOverdue ? ' · overdue' : ''}` : 'No due date'}
                </div>

                {c.agreementLevel && (
                  <div className="mt-2"><span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: AGREEMENT_META[c.agreementLevel].bg, color: AGREEMENT_META[c.agreementLevel].fg }}>{AGREEMENT_META[c.agreementLevel].label}</span></div>
                )}

                <div className="mt-3 border-t border-[#F1F5F9] pt-3">
                  <Timeline status={c.status} />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => router.push(`/teleconsult/${c.id}`)} className="rounded-lg bg-[#EEF2FF] px-3 py-1.5 text-[12px] font-semibold text-[#4F46E5]">View</button>
                  <button onClick={() => act.mutate({ id: c.id, ep: 'resend' })} className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-[12px] font-semibold text-[#475569]">Resend</button>
                  {c.status === 'Responded' && (
                    <>
                      <button onClick={() => act.mutate({ id: c.id, ep: 'accept' })} className="rounded-lg bg-[#16A34A] px-3 py-1.5 text-[12px] font-semibold text-white">Accept</button>
                      <button onClick={() => act.mutate({ id: c.id, ep: 'decline' })} className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-[12px] font-semibold text-[#475569]">Decline</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {newOpen && <NewConsultModal onClose={() => setNewOpen(false)} onCreated={(id) => router.push(`/teleconsult/${id}`)} />}
    </div>
  );
}
