'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/feature-context';
import { CONFIDENCE_LEVELS, DIFFICULTY_META, type ConfidenceLevel, type MyResponse } from '@/lib/proficiency';
import { notify } from '@/lib/notify';

const inp = 'w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-[15px] outline-none focus:border-[#4F46E5]';
const BETHESDA_OPTIONS = ['', 'NILM', 'ASC-US', 'ASC-H', 'LSIL', 'HSIL', 'SCC', 'AGC', 'Adenocarcinoma', 'Unsatisfactory'];

export default function RespondPage() {
  const router = useRouter();
  const id = String(useParams().id);
  const qc = useQueryClient();
  const { isEnabled } = useFeatures();
  const [idx, setIdx] = useState(0);
  const [diagnosis, setDiagnosis] = useState('');
  const [bethesdaAnswer, setBethesda] = useState('');
  const [confidence, setConfidence] = useState<ConfidenceLevel>('Moderate');
  const [notes, setNotes] = useState('');

  const { data } = useQuery<MyResponse>({ queryKey: ['proficiency-mine', id], queryFn: () => api.get(`/proficiency/${id}/my-response`).then((r) => r.data), enabled: !!id && isEnabled('PROFICIENCY_TESTING') });
  const cases = data?.cases ?? [];
  const current = cases[idx];
  const respondedIds = useMemo(() => new Set((data?.responses ?? []).map((r) => r.caseId)), [data]);

  // Load any existing answer when the current case changes.
  useEffect(() => {
    if (!current) return;
    const existing = (data?.responses ?? []).find((r) => r.caseId === current.id);
    setDiagnosis(existing?.diagnosis ?? '');
    setBethesda(existing?.bethesdaAnswer ?? '');
    setConfidence(existing?.confidence ?? 'Moderate');
    setNotes(existing?.notes ?? '');
  }, [current?.id, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () => api.post(`/proficiency/${id}/respond`, { caseId: current!.id, diagnosis, bethesdaAnswer: bethesdaAnswer || undefined, confidence, notes: notes || undefined }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proficiency-mine', id] }),
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Could not save'),
  });

  if (!isEnabled('PROFICIENCY_TESTING')) return <div className="min-h-full pt-6 text-[14px] text-[#475569]" style={{ background: '#F8FAFC' }}>Feature not enabled.</div>;
  if (!data) return <div className="min-h-full pt-6 text-[14px] text-[#475569]" style={{ background: '#F8FAFC' }}>Loading…</div>;
  if (data.test.status !== 'Active') {
    return <div className="min-h-full pt-10" style={{ background: '#F8FAFC' }}><div className="mx-auto max-w-md rounded-2xl border border-[#EEF2F7] bg-white p-8 text-center shadow-sm"><CheckCircle2 size={28} className="mx-auto text-[#16A34A]" /><div className="mt-3 text-[18px] font-bold text-[#0F172A]">Test not open for responses</div><button onClick={() => router.push(`/proficiency/${id}`)} className="mt-4 rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white">View test</button></div></div>;
  }
  if (!current) return <div className="min-h-full pt-6 text-[14px] text-[#475569]" style={{ background: '#F8FAFC' }}>No cases in this test.</div>;

  const done = cases.filter((c) => respondedIds.has(c.id)).length;
  const dm = DIFFICULTY_META[current.difficulty];
  const saveThen = async (next: boolean) => {
    if (diagnosis.trim()) await save.mutateAsync();
    if (next) { if (idx < cases.length - 1) setIdx(idx + 1); else router.push(`/proficiency/${id}`); }
    else router.push('/proficiency');
  };

  return (
    <div className="min-h-full pb-12 pt-4" style={{ background: '#F8FAFC' }}>
      <div className="mx-auto max-w-2xl">
        {/* Progress */}
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-[18px] font-bold text-[#0F172A]">Proficiency Test: {data.test.name}</h1>
            <span className="text-[13px] font-semibold text-[#475569]">{done} of {cases.length} answered</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#E2E8F0]"><div className="h-full rounded-full bg-[#4F46E5]" style={{ width: `${(done / cases.length) * 100}%` }} /></div>
        </div>

        <div className="rounded-2xl border border-[#EEF2F7] bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-[#0F172A]">Case {current.caseNumber}</span>
            <span className="text-[13px] text-[#475569]">· {current.specimenType}</span>
            <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: dm.bg, color: dm.fg }}>{current.difficulty}</span>
          </div>
          {current.clinicalHistory && <p className="mt-2 rounded-lg bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#475569]">{current.clinicalHistory}</p>}
          {current.imageUrl && <img src={current.imageUrl} alt={`Case ${current.caseNumber} slide`} className="mt-3 max-h-72 w-full rounded-lg border border-[#E2E8F0] object-contain" />}

          <div className="mt-5 flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#475569]">Diagnosis</label>
              <textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} rows={2} placeholder="Your diagnosis…" className={inp} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#475569]">Bethesda Classification (if applicable)</label>
              <select value={bethesdaAnswer} onChange={(e) => setBethesda(e.target.value)} className={inp}>{BETHESDA_OPTIONS.map((o) => <option key={o} value={o}>{o || '— none —'}</option>)}</select>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#475569]">Confidence</label>
              <div className="flex gap-2">
                {CONFIDENCE_LEVELS.map((c) => (
                  <button key={c} type="button" onClick={() => setConfidence(c)} className="flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors" style={confidence === c ? { background: '#EEF2FF', color: '#4F46E5', boxShadow: 'inset 0 0 0 1.5px #4F46E5' } : { background: '#F8FAFC', color: '#475569', border: '1px solid #E2E8F0' }}>{c}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#475569]">Notes (optional)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inp} />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#475569] disabled:opacity-40">Previous</button>
            <div className="flex gap-2">
              <button onClick={() => saveThen(false)} disabled={save.isPending} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#475569]">Save &amp; Exit</button>
              <button onClick={() => saveThen(true)} disabled={!diagnosis.trim() || save.isPending} className="rounded-lg bg-[#4F46E5] px-5 py-2 text-[14px] font-semibold text-white disabled:opacity-40">{idx < cases.length - 1 ? 'Save & Next' : 'Save & Finish'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
