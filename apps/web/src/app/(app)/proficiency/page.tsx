'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { GraduationCap, Plus, X } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFeatures } from '@/lib/feature-context';
import {
  STATUS_META, TEST_TYPES, TYPE_META, scoreColor, shortDate,
  type ProfAnalytics, type ProfTest, type ProfTestType,
} from '@/lib/proficiency';
import { Card, IconAction, EmptyState } from '@/components/ui';

const inp = 'h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-[14px] outline-none focus:border-[#4F46E5]';

function NewTestModal({ onClose }: { onClose: (id?: string) => void }) {
  const { message } = AntdApp.useApp();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [testType, setTestType] = useState<ProfTestType>('Internal');
  const [startDate, setStart] = useState('');
  const [endDate, setEnd] = useState('');
  const [passingScore, setPass] = useState(80);

  const save = useMutation({
    mutationFn: () => api.post('/proficiency', { name, description: description || undefined, testType, startDate, endDate, passingScore }).then((r) => r.data),
    onSuccess: (d) => { message.success('Test created'); qc.invalidateQueries({ queryKey: ['proficiency'] }); onClose(d.id); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Could not create test'),
  });

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 2200, background: 'rgba(15,23,42,0.55)' }} onClick={() => onClose()}>
      <div className="w-full max-w-[480px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-[18px] font-bold text-[#0F172A]">New Proficiency Test</h3><IconAction icon={<X size={16} />} tone="strong" onClick={() => onClose()} /></div>
        <div className="flex flex-col gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Test name, e.g. Q3 2026 CAP Survey" className={inp} />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Description (optional)" className={inp} />
          <div className="grid grid-cols-2 gap-3">
            <select value={testType} onChange={(e) => setTestType(e.target.value as ProfTestType)} className={inp}>{TEST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <div className="flex items-center gap-2"><span className="text-[13px] text-[#475569]">Pass ≥</span><input type="number" min={0} max={100} value={passingScore} onChange={(e) => setPass(Number(e.target.value))} className={inp} /><span className="text-[13px] text-[#475569]">%</span></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[12px] font-semibold text-[#475569]">Start<input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} className={`${inp} mt-1`} /></label>
            <label className="text-[12px] font-semibold text-[#475569]">End<input type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} className={`${inp} mt-1`} /></label>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => onClose()} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#475569]">Cancel</button>
          <button disabled={!name.trim() || !startDate || !endDate || save.isPending} onClick={() => save.mutate()} className="rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40">Create</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Kpi({ label, value, fg = '#0F172A' }: { label: string; value: string | number; fg?: string }) {
  return <Card radius="md" elevation="soft" border="hairline" className="p-4"><div className="text-[24px] font-bold leading-none" style={{ color: fg }}>{value}</div><div className="mt-1.5 text-[13px] text-[#475569]">{label}</div></Card>;
}

export default function ProficiencyPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const { claims } = useAuth();
  const { isEnabled } = useFeatures();
  const enabled = isEnabled('PROFICIENCY_TESTING');
  const isManager = claims?.isSuperRole || (claims?.permissions ?? []).includes('resultsheet:authorize');
  const [newOpen, setNewOpen] = useState(false);

  const { data: tests = [] } = useQuery<ProfTest[]>({ queryKey: ['proficiency'], queryFn: () => api.get('/proficiency').then((r) => r.data), enabled });
  const { data: analytics } = useQuery<ProfAnalytics>({ queryKey: ['proficiency-analytics'], queryFn: () => api.get('/proficiency/analytics').then((r) => r.data), enabled });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => api.post(`/proficiency/${id}/${action}`).then((r) => r.data),
    onSuccess: (_d, v) => { message.success(v.action === 'activate' ? 'Test activated' : v.action === 'close' ? 'Test closed for grading' : 'Test graded'); qc.invalidateQueries({ queryKey: ['proficiency'] }); qc.invalidateQueries({ queryKey: ['proficiency-analytics'] }); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Action failed'),
  });

  if (!enabled) {
    return (
      <div className="min-h-full pt-4" style={{ background: '#F8FAFC' }}>
        <EmptyState className="mt-16"
              icon={<GraduationCap size={28} />}
              title={<>Feature not enabled</>}
              description={<>Proficiency Testing is disabled for this lab.</>}
            />
      </div>
    );
  }

  const activeTests = tests.filter((t) => t.status === 'Active').length;
  const thisYear = new Date().getFullYear();
  const completedThisYear = tests.filter((t) => t.status === 'Completed' && new Date(t.endDate).getFullYear() === thisYear).length;

  return (
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#0F172A]">Proficiency Testing</h1>
          <p className="mt-1.5 text-[15px] text-[#6B7280]">Blind-review competency tracking for CAP/CLIA accreditation.</p>
        </div>
        {isManager && <button onClick={() => setNewOpen(true)} className="flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2.5 text-[14px] font-semibold text-white"><Plus size={16} /> New Test</button>}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Active Tests" value={activeTests} fg={activeTests > 0 ? '#1D4ED8' : '#0F172A'} />
        <Kpi label="Lab Average Score" value={`${(analytics?.labAverageScore ?? 0).toFixed(1)}%`} fg="#4F46E5" />
        <Kpi label="Pass Rate" value={`${(analytics?.passingRate ?? 0).toFixed(1)}%`} fg={(analytics?.passingRate ?? 0) >= 80 ? '#16A34A' : '#0F172A'} />
        <Kpi label="Completed This Year" value={completedThisYear} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {tests.length === 0 ? (
          <Card radius="md" elevation="soft" border="hairline" className="p-8 text-center text-[14px] text-[#475569]">No proficiency tests yet.</Card>
        ) : tests.map((t) => {
          const st = STATUS_META[t.status];
          const ty = TYPE_META[t.testType];
          return (
            <Card radius="md" elevation="soft" border="hairline" className="flex flex-col p-4" key={t.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[16px] font-bold text-[#0F172A]">{t.name}</div>
                  <div className="mt-0.5 text-[12px] text-[#475569]">{shortDate(t.startDate)} – {shortDate(t.endDate)}</div>
                </div>
                <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: ty.bg, color: ty.fg }}>{t.testType}</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                <span className="text-[12px] text-[#475569]">{t.responderCount} pathologist{t.responderCount === 1 ? '' : 's'} responded · {t.caseCount} case{t.caseCount === 1 ? '' : 's'}</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#F1F5F9] pt-3">
                <button onClick={() => router.push(`/proficiency/${t.id}`)} className="rounded-lg bg-[#EEF2FF] px-3 py-1.5 text-[13px] font-semibold text-[#4F46E5]">View</button>
                {t.status === 'Active' && <button onClick={() => router.push(`/proficiency/${t.id}/respond`)} className="rounded-lg border border-[#4F46E5] px-3 py-1.5 text-[13px] font-semibold text-[#4F46E5]">Respond</button>}
                {isManager && t.status === 'Draft' && <button onClick={() => act.mutate({ id: t.id, action: 'activate' })} className="rounded-lg bg-[#4F46E5] px-3 py-1.5 text-[13px] font-semibold text-white">Start</button>}
                {isManager && t.status === 'Active' && <button onClick={() => act.mutate({ id: t.id, action: 'close' })} className="rounded-lg bg-[#7C3AED] px-3 py-1.5 text-[13px] font-semibold text-white">Close</button>}
                {isManager && t.status === 'Grading' && <button onClick={() => act.mutate({ id: t.id, action: 'grade' })} className="rounded-lg bg-[#16A34A] px-3 py-1.5 text-[13px] font-semibold text-white">Grade</button>}
              </div>
            </Card>
          );
        })}
      </div>

      {newOpen && <NewTestModal onClose={(id) => { setNewOpen(false); if (id) router.push(`/proficiency/${id}`); }} />}
    </div>
  );
}
