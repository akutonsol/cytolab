'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, FlaskConical, Microscope } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/feature-context';
import {
  CORRELATION_RESULTS, HISTOLOGY_SOURCES, RESULT_META, patientName, shortDate,
  type CorrelationCase, type CorrelationResult, type HistologySource,
} from '@/lib/correlation';

const CARD = 'rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]';
const inp = 'h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-[14px] outline-none focus:border-[#4F46E5]';
const Info = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="mb-2.5"><div className="text-[11px] font-semibold uppercase tracking-wide text-[#475569]">{label}</div><div className="mt-0.5 text-[14px] text-[#0F172A]">{value}</div></div>
);

export default function CorrelationDetailPage() {
  const router = useRouter();
  const id = String(useParams().id);
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const { isEnabled } = useFeatures();
  const [reviewNotes, setReviewNotes] = useState('');
  const [editOpen, setEditOpen] = useState(false);

  const { data: c } = useQuery<CorrelationCase>({ queryKey: ['correlation', id], queryFn: () => api.get(`/correlation/${id}`).then((r) => r.data), enabled: !!id && isEnabled('CORRELATION_TRACKING') });
  const { data: bethesda } = useQuery<any>({ queryKey: ['corr-bethesda-view', c?.cytologyRecordId], enabled: !!c?.cytologyRecordId, queryFn: () => api.get(`/bethesda/record/${c!.cytologyRecordId}`).then((r) => r.data) });

  const invalidate = () => ['correlation', 'correlations', 'correlation-analytics'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const review = useMutation({
    mutationFn: () => api.post(`/correlation/${id}/review`, { reviewNotes: reviewNotes || undefined }),
    onSuccess: () => { message.success('Marked reviewed'); invalidate(); },
    onError: () => message.error('Could not mark reviewed'),
  });

  if (!isEnabled('CORRELATION_TRACKING')) {
    return <div className="min-h-full pt-4" style={{ background: '#F8FAFC' }}><div className="mx-auto mt-16 max-w-md rounded-2xl border border-[#EEF2F7] bg-white p-8 text-center shadow-sm"><GitCompareIcon /><div className="mt-3 text-[18px] font-bold text-[#0F172A]">Feature not enabled</div></div></div>;
  }
  if (!c) return <div className="min-h-full pt-6 text-[14px] text-[#475569]" style={{ background: '#F8FAFC' }}>Loading…</div>;

  const m = RESULT_META[c.correlationResult ?? 'Unresolved'];

  return (
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      <button onClick={() => router.push('/correlation')} className="mb-3 flex items-center gap-1.5 text-[13px] font-medium text-[#475569] hover:text-[#0F172A]"><ArrowLeft size={15} /> Correlation Tracking</button>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold text-[#0F172A]">{patientName(c)}</h1>
          <p className="mt-0.5 text-[14px] text-[#6B7280]">{c.patient?.registrationNo ?? ''} · created {shortDate(c.createdAt)}{c.createdBy ? ` by ${c.createdBy.firstName} ${c.createdBy.lastName}` : ''}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-bold" style={{ background: m.bg, color: m.fg }}>{c.correlationResult === 'MajorDiscordant' && <AlertTriangle size={14} />}{m.label}</span>
      </div>

      {/* Two-column: cytology | histology */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className={`${CARD} p-5`}>
          <div className="mb-3 flex items-center gap-2 text-[15px] font-bold text-[#0F172A]"><FlaskConical size={18} className="text-[#4F46E5]" /> Cytology</div>
          <Info label="Record" value={c.cytologyRecord ? (c.cytologyRecord.labNumber ?? c.cytologyRecord.identifier) : '—'} />
          <Info label="Date" value={shortDate(c.cytologyDate)} />
          <Info label="Diagnosis" value={c.cytologyDiagnosis} />
          {bethesda && <Info label="Bethesda" value={<span>{bethesda.shortCode || '—'}{bethesda.generatedNarrative ? <span className="mt-1 block text-[12px] text-[#475569]">{bethesda.generatedNarrative.slice(0, 200)}</span> : null}</span>} />}
        </div>
        <div className={`${CARD} p-5`}>
          <div className="mb-3 flex items-center gap-2 text-[15px] font-bold text-[#0F172A]"><Microscope size={18} className="text-[#7C3AED]" /> Histology</div>
          {c.histologyDiagnosis || c.histologyDate ? (
            <>
              <Info label="Date" value={shortDate(c.histologyDate)} />
              <Info label="Diagnosis" value={c.histologyDiagnosis ?? '—'} />
              <Info label="Source" value={c.histologySource + (c.externalLabName ? ` · ${c.externalLabName}` : '')} />
            </>
          ) : (
            <div className="text-[14px] text-[#475569]">No histology recorded yet.</div>
          )}
        </div>
      </div>

      {/* Assessment */}
      <div className={`${CARD} mt-5 p-5`} style={{ borderLeft: `4px solid ${m.fg}` }}>
        <div className="mb-2 text-[15px] font-bold text-[#0F172A]">Correlation Assessment</div>
        {c.discordanceReason && <Info label="Discordance Reason" value={c.discordanceReason} />}
        <Info label="Review status" value={c.reviewedAt ? <span className="text-[#16A34A]">Reviewed {shortDate(c.reviewedAt)}{c.reviewedBy ? ` by ${c.reviewedBy.firstName} ${c.reviewedBy.lastName}` : ''}</span> : c.reviewRequired ? <span className="text-[#B91C1C]">Review required</span> : 'No review required'} />
        {c.reviewNotes && <Info label="Review notes" value={c.reviewNotes} />}

        {c.reviewRequired && !c.reviewedAt && (
          <div className="mt-3 rounded-xl border border-[#E2E8F0] p-3">
            <textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} rows={2} placeholder="Review notes (optional)…" className={inp} />
            <button onClick={() => review.mutate()} className="mt-2 flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3.5 py-2 text-[13px] font-semibold text-white"><CheckCircle2 size={15} /> Mark Reviewed</button>
          </div>
        )}

        <button onClick={() => setEditOpen((v) => !v)} className="mt-3 text-[13px] font-semibold text-[#4F46E5] hover:underline">{editOpen ? 'Hide' : 'Update histology / result'}</button>
        {editOpen && <UpdateForm caseId={id} current={c} onDone={() => { setEditOpen(false); invalidate(); }} />}
      </div>
    </div>
  );
}

function GitCompareIcon() { return <AlertTriangle size={28} className="mx-auto text-[#9CA3AF]" />; }

function UpdateForm({ caseId, current, onDone }: { caseId: string; current: CorrelationCase; onDone: () => void }) {
  const { message } = AntdApp.useApp();
  const [histologyDate, setHistologyDate] = useState(current.histologyDate ? current.histologyDate.slice(0, 10) : '');
  const [histologyDiagnosis, setHistologyDiagnosis] = useState(current.histologyDiagnosis ?? '');
  const [histologySource, setHistologySource] = useState<HistologySource>(current.histologySource);
  const [correlationResult, setCorrelationResult] = useState<CorrelationResult | ''>(current.correlationResult ?? '');
  const [discordanceReason, setDiscordanceReason] = useState(current.discordanceReason ?? '');
  const isDiscordant = correlationResult === 'MinorDiscordant' || correlationResult === 'MajorDiscordant';

  const save = useMutation({
    mutationFn: () => api.patch(`/correlation/${caseId}`, {
      histologyDate: histologyDate || undefined, histologyDiagnosis: histologyDiagnosis || undefined, histologySource,
      correlationResult: correlationResult || undefined, discordanceReason: isDiscordant ? discordanceReason || undefined : undefined,
    }),
    onSuccess: () => { message.success('Updated'); onDone(); },
    onError: () => message.error('Update failed'),
  });

  return (
    <div className="mt-3 flex flex-col gap-2.5 rounded-xl border border-[#E2E8F0] p-3">
      <div className="grid grid-cols-2 gap-2">
        <input type="date" value={histologyDate} onChange={(e) => setHistologyDate(e.target.value)} className={inp} />
        <select value={histologySource} onChange={(e) => setHistologySource(e.target.value as HistologySource)} className={inp}>{HISTOLOGY_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
      </div>
      <textarea value={histologyDiagnosis} onChange={(e) => setHistologyDiagnosis(e.target.value)} rows={2} placeholder="Histology diagnosis…" className={inp} />
      <div className="flex flex-wrap gap-2">
        {CORRELATION_RESULTS.map((r) => (
          <button key={r} type="button" onClick={() => setCorrelationResult(r)} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold" style={correlationResult === r ? { background: RESULT_META[r].bg, color: RESULT_META[r].fg, boxShadow: `inset 0 0 0 1.5px ${RESULT_META[r].fg}` } : { background: '#F8FAFC', color: '#475569', border: '1px solid #E2E8F0' }}>{RESULT_META[r].label}</button>
        ))}
      </div>
      {isDiscordant && <textarea value={discordanceReason} onChange={(e) => setDiscordanceReason(e.target.value)} rows={2} placeholder="Discordance reason…" className={inp} />}
      <button disabled={save.isPending} onClick={() => save.mutate()} className="self-start rounded-lg bg-[#4F46E5] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40">Save</button>
    </div>
  );
}
