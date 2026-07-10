'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, Plus, Trash2, X } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFeatures } from '@/lib/feature-context';
import {
  DIFFICULTIES, DIFFICULTY_META, STATUS_META, passBadge, scoreColor,
  type CaseDifficulty, type ProfResults, type TestDetail,
} from '@/lib/proficiency';
import { Card, IconAction } from '@/components/ui';

const inp = 'h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-[14px] outline-none focus:border-[#4F46E5]';

function AddCaseModal({ testId, onClose }: { testId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [specimenType, setSpecimen] = useState('');
  const [clinicalHistory, setHistory] = useState('');
  const [imageUrl, setImage] = useState('');
  const [expectedDiagnosis, setExpected] = useState('');
  const [expectedBethesda, setBethesda] = useState('');
  const [difficulty, setDifficulty] = useState<CaseDifficulty>('Standard');
  const save = useMutation({
    mutationFn: () => api.post(`/proficiency/${testId}/cases`, { specimenType, clinicalHistory: clinicalHistory || undefined, imageUrl: imageUrl || undefined, expectedDiagnosis, expectedBethesda: expectedBethesda || undefined, difficulty }),
    onSuccess: () => { message.success('Case added'); qc.invalidateQueries({ queryKey: ['proficiency', testId] }); onClose(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Could not add case'),
  });
  return createPortal(
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: 2100, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="flex h-full w-full max-w-[480px] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 p-5"><h3 className="text-[18px] font-bold text-[#0F172A]">Add Case</h3><IconAction icon={<X size={16} />} tone="strong" onClick={onClose} /></div>
        <div className="flex-1 overflow-y-auto p-5">
          <L label="Specimen Type"><input value={specimenType} onChange={(e) => setSpecimen(e.target.value)} placeholder="e.g. Cervical, Urine…" className={inp} /></L>
          <L label="Difficulty"><select value={difficulty} onChange={(e) => setDifficulty(e.target.value as CaseDifficulty)} className={inp}>{DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}</select></L>
          <L label="Clinical History (anonymized)"><textarea value={clinicalHistory} onChange={(e) => setHistory(e.target.value)} rows={2} className={inp} /></L>
          <L label="Slide Image URL (optional)"><input value={imageUrl} onChange={(e) => setImage(e.target.value)} placeholder="https://…" className={inp} /></L>
          <div className="my-3 rounded-lg bg-[#FEF2F2] px-3 py-2 text-[12px] font-semibold text-[#B91C1C]">Hidden from reviewers</div>
          <L label="Expected Diagnosis"><input value={expectedDiagnosis} onChange={(e) => setExpected(e.target.value)} placeholder="The correct answer" className={inp} /></L>
          <L label="Expected Bethesda (optional)"><input value={expectedBethesda} onChange={(e) => setBethesda(e.target.value)} className={inp} /></L>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4"><button onClick={onClose} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#475569]">Cancel</button><button disabled={!specimenType.trim() || !expectedDiagnosis.trim() || save.isPending} onClick={() => save.mutate()} className="rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40">Add Case</button></div>
      </div>
    </div>,
    document.body,
  );
}
const L = ({ label, children }: { label: string; children: React.ReactNode }) => (<div className="mb-3.5"><label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#475569]">{label}</label>{children}</div>);

export default function ProficiencyDetailPage() {
  const router = useRouter();
  const id = String(useParams().id);
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const { claims } = useAuth();
  const { isEnabled } = useFeatures();
  const isManager = claims?.isSuperRole || (claims?.permissions ?? []).includes('resultsheet:authorize');
  const [tab, setTab] = useState<'cases' | 'responses' | 'results'>('cases');
  const [addOpen, setAddOpen] = useState(false);

  const { data: test } = useQuery<TestDetail>({ queryKey: ['proficiency', id], queryFn: () => api.get(`/proficiency/${id}`).then((r) => r.data), enabled: !!id && isEnabled('PROFICIENCY_TESTING') });
  const { data: results } = useQuery<ProfResults>({ queryKey: ['proficiency-results', id], queryFn: () => api.get(`/proficiency/${id}/results`).then((r) => r.data), enabled: !!id && test?.status === 'Completed' });

  const delCase = useMutation({
    mutationFn: (caseId: string) => api.delete(`/proficiency/${id}/cases/${caseId}`),
    onSuccess: () => { message.success('Case removed'); qc.invalidateQueries({ queryKey: ['proficiency', id] }); },
    onError: () => message.error('Could not remove case'),
  });

  if (!isEnabled('PROFICIENCY_TESTING')) return <div className="min-h-full pt-6 text-[14px] text-[#475569]" style={{ background: '#F8FAFC' }}>Feature not enabled.</div>;
  if (!test) return <div className="min-h-full pt-6 text-[14px] text-[#475569]" style={{ background: '#F8FAFC' }}>Loading…</div>;
  const st = STATUS_META[test.status];
  const tabs: ('cases' | 'responses' | 'results')[] = test.status === 'Completed' ? ['cases', 'responses', 'results'] : ['cases', 'responses'];

  return (
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      <button onClick={() => router.push('/proficiency')} className="mb-3 flex items-center gap-1.5 text-[13px] font-medium text-[#475569] hover:text-[#0F172A]"><ArrowLeft size={15} /> Proficiency Testing</button>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold text-[#0F172A]">{test.name}</h1>
          <p className="mt-0.5 text-[14px] text-[#6B7280]">{test.testType} · pass ≥ {test.passingScore}% · {test.totalCases} cases</p>
        </div>
        <span className="rounded-full px-3 py-1 text-[13px] font-bold" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
      </div>

      <div className="mb-4 flex gap-1 rounded-full bg-[#F1F5F9] p-1" style={{ width: 'fit-content' }}>
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="rounded-full px-4 py-1.5 text-[13px] font-semibold capitalize transition-colors" style={tab === t ? { background: '#fff', color: '#0F172A', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } : { color: '#475569' }}>{t}</button>
        ))}
      </div>

      {/* Cases */}
      {tab === 'cases' && (
        <Card radius="md" elevation="soft" border="hairline">
          <div className="flex items-center justify-between border-b border-[#EEF2F7] p-4">
            <span className="text-[15px] font-bold text-[#0F172A]">Cases ({test.cases.length})</span>
            {isManager && test.status === 'Draft' && <button onClick={() => setAddOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3 py-1.5 text-[13px] font-semibold text-white"><Plus size={14} /> Add Case</button>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead><tr className="border-b border-[#EEF2F7] text-[11px] uppercase tracking-wide text-[#475569]"><th className="px-4 py-2.5 font-semibold">#</th><th className="px-4 py-2.5 font-semibold">Specimen</th><th className="px-4 py-2.5 font-semibold">Difficulty</th><th className="px-4 py-2.5 font-semibold">Expected Dx</th><th className="px-4 py-2.5 font-semibold">Responses</th>{isManager && test.status === 'Draft' && <th className="px-4 py-2.5" />}</tr></thead>
              <tbody>
                {test.cases.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center text-[#475569]">No cases yet.</td></tr> : test.cases.map((c) => {
                  const dm = DIFFICULTY_META[c.difficulty];
                  return (
                    <tr key={c.id} className="border-b border-[#F1F5F9]">
                      <td className="px-4 py-2.5 font-semibold text-[#0F172A]">{c.caseNumber}</td>
                      <td className="px-4 py-2.5 text-[#334155]">{c.specimenType}</td>
                      <td className="px-4 py-2.5"><span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: dm.bg, color: dm.fg }}>{c.difficulty}</span></td>
                      <td className="px-4 py-2.5 font-mono text-[#334155]">{c.expectedDiagnosis}</td>
                      <td className="px-4 py-2.5 text-[#475569]">{c.responseCount}</td>
                      {isManager && test.status === 'Draft' && <td className="px-4 py-2.5"><button onClick={() => delCase.mutate(c.id)} className="grid h-8 w-8 place-items-center rounded-lg text-[#DC2626] hover:bg-[#FEF2F2]"><Trash2 size={15} /></button></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Responses */}
      {tab === 'responses' && (
        <Card radius="md" elevation="soft" border="hairline">
          <div className="border-b border-[#EEF2F7] p-4 text-[15px] font-bold text-[#0F172A]">Responses</div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead><tr className="border-b border-[#EEF2F7] text-[11px] uppercase tracking-wide text-[#475569]"><th className="px-4 py-2.5 font-semibold">Pathologist</th><th className="px-4 py-2.5 font-semibold">Cases Completed</th><th className="px-4 py-2.5 font-semibold">Score</th><th className="px-4 py-2.5 font-semibold">Status</th></tr></thead>
              <tbody>
                {test.responseSummary.length === 0 ? <tr><td colSpan={4} className="px-4 py-10 text-center text-[#475569]">No responses yet.</td></tr> : test.responseSummary.map((r) => (
                  <tr key={r.userId} className="border-b border-[#F1F5F9]">
                    <td className="px-4 py-2.5 font-semibold text-[#0F172A]">{r.name}</td>
                    <td className="px-4 py-2.5 text-[#334155]">{r.casesCompleted} / {test.totalCases}</td>
                    <td className="px-4 py-2.5 font-semibold" style={{ color: r.percentage !== null ? scoreColor(r.percentage, test.passingScore) : '#475569' }}>{r.percentage !== null ? `${r.percentage.toFixed(1)}%` : '—'}</td>
                    <td className="px-4 py-2.5">{r.passed === null ? <span className="text-[12px] text-[#475569]">{r.graded ? 'Graded' : 'Submitted'}</span> : (() => { const b = passBadge(r.passed); return <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: b.bg, color: b.fg }}>{b.label}</span>; })()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Results */}
      {tab === 'results' && results && (
        <div className="flex flex-col gap-5">
          <Card radius="md" elevation="soft" border="hairline" className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-4">
              <span className="text-[15px] font-bold text-[#0F172A]">Scorecard</span>
              <span className="text-[13px] text-[#475569]">Lab average <span className="font-bold" style={{ color: scoreColor(results.labAverage, results.passingScore) }}>{results.labAverage.toFixed(1)}%</span> · pass rate {results.passRate.toFixed(1)}%</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead><tr className="border-b border-[#EEF2F7] text-[11px] uppercase tracking-wide text-[#475569]"><th className="px-4 py-2.5 font-semibold">Pathologist</th><th className="px-4 py-2.5 font-semibold">Correct</th><th className="px-4 py-2.5 font-semibold">Score</th><th className="px-4 py-2.5 font-semibold">Result</th></tr></thead>
                <tbody>
                  {results.scores.map((s) => { const b = passBadge(s.passed); return (
                    <tr key={s.userId} className="border-b border-[#F1F5F9]">
                      <td className="px-4 py-2.5 font-semibold text-[#0F172A]">{s.name}</td>
                      <td className="px-4 py-2.5 text-[#334155]">{s.correct} / {s.total}</td>
                      <td className="px-4 py-2.5 text-[18px] font-bold" style={{ color: scoreColor(s.percentage, results.passingScore) }}>{s.percentage.toFixed(1)}%</td>
                      <td className="px-4 py-2.5"><span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: b.bg, color: b.fg }}>{b.label}</span></td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          </Card>
          <Card radius="md" elevation="soft" border="hairline" className="p-4">
            <div className="mb-3 text-[15px] font-bold text-[#0F172A]">Per-Case Breakdown</div>
            <div className="flex flex-col gap-3">
              {results.cases.map((c) => (
                <div key={c.caseId} className="rounded-xl border border-[#EEF2F7] p-3">
                  <div className="text-[13px] font-bold text-[#0F172A]">Case {c.caseNumber} · {c.specimenType} <span className="ml-2 font-normal text-[#475569]">Expected: <span className="font-mono">{c.expected}</span></span></div>
                  <div className="mt-2 flex flex-col gap-1">
                    {c.responses.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-[12px]">
                        {r.isCorrect ? <Check size={14} className="text-[#16A34A]" /> : <X size={14} className="text-[#DC2626]" />}
                        <span className="text-[#334155]">{r.responder}:</span> <span className="font-mono" style={{ color: r.isCorrect ? '#16A34A' : '#B91C1C' }}>{r.answer}</span>
                      </div>
                    ))}
                    {c.responses.length === 0 && <span className="text-[12px] text-[#475569]">No responses.</span>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {addOpen && <AddCaseModal testId={id} onClose={() => setAddOpen(false)} />}
    </div>
  );
}
