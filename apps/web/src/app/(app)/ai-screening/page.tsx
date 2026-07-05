'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Brain } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/feature-context';
import { ConfidenceRing } from '@/components/ConfidenceRing';
import { ReviewScreeningModal } from '@/components/ReviewScreeningModal';
import { LEVEL_META, SPECIMEN_LABEL, type AIAnalytics, type AIScreening } from '@/lib/ai-screening';

const CARD = 'rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]';

function Kpi({ label, value, fg = '#0F172A' }: { label: string; value: string; fg?: string }) {
  return <div className={`${CARD} p-4`}><div className="text-[24px] font-bold leading-none" style={{ color: fg }}>{value}</div><div className="mt-1.5 text-[13px] text-[#475569]">{label}</div></div>;
}

function DistBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[13px]">
        <span className="font-semibold text-[#334155]">{label}</span>
        <span className="text-[#475569]">{count} · {pct}%</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-[#F1F5F9]">
        <div className="h-2.5 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export default function AIScreeningPage() {
  const { isEnabled } = useFeatures();
  const enabled = isEnabled('AI_SCREENING');
  const router = useRouter();
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [review, setReview] = useState<AIScreening | null>(null);

  const { data: analytics } = useQuery<AIAnalytics>({ queryKey: ['ai-analytics'], queryFn: () => api.get('/ai-screening/analytics').then((r) => r.data), enabled });
  const { data: queue = [] } = useQuery<AIScreening[]>({ queryKey: ['ai-queue'], queryFn: () => api.get('/ai-screening/queue').then((r) => r.data), enabled });

  const batch = useMutation({
    mutationFn: async () => {
      const targets = queue.slice(0, 10);
      await Promise.all(targets.map((r) => api.post(`/ai-screening/record/${r.recordId}`)));
      return targets.length;
    },
    onSuccess: (n) => { message.success(`Re-screening ${n} record${n === 1 ? '' : 's'}…`); setTimeout(() => { qc.invalidateQueries({ queryKey: ['ai-queue'] }); qc.invalidateQueries({ queryKey: ['ai-analytics'] }); }, 2500); },
    onError: () => message.error('Batch screen failed'),
  });

  if (!enabled) {
    return (
      <div className="min-h-full pt-4" style={{ background: '#F8FAFC' }}>
        <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[#EEF2F7] bg-white p-8 text-center shadow-sm">
          <Brain size={28} className="mx-auto text-[#9CA3AF]" />
          <div className="mt-3 text-[18px] font-bold text-[#0F172A]">Feature not enabled</div>
          <div className="mt-1 text-[14px] text-[#6B7280]">AI Screening is disabled for this lab.</div>
        </div>
      </div>
    );
  }

  const a = analytics;
  const totalLevels = (a?.highConfidence ?? 0) + (a?.mediumConfidence ?? 0) + (a?.lowConfidence ?? 0);
  const highPct = totalLevels ? Math.round(((a?.highConfidence ?? 0) / totalLevels) * 100) : 0;

  return (
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#0F172A]">AI Screening</h1>
          <p className="mt-1.5 text-[15px] text-[#6B7280]">Pre-screening flags abnormal cells before pathologist review.</p>
        </div>
        <button onClick={() => batch.mutate()} disabled={batch.isPending || queue.length === 0} className="rounded-lg bg-[#4F46E5] px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-40">Run Batch Screen</button>
      </div>

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Total Screened" value={String(a?.totalScreened ?? 0)} />
        <Kpi label="Pending Review" value={String(a?.pendingReview ?? 0)} fg={(a?.pendingReview ?? 0) > 0 ? '#B45309' : '#0F172A'} />
        <Kpi label="High Confidence" value={`${highPct}%`} fg="#16A34A" />
        <Kpi label="Low Confidence" value={String(a?.lowConfidence ?? 0)} fg={(a?.lowConfidence ?? 0) > 0 ? '#B91C1C' : '#0F172A'} />
        <Kpi label="Agreement Rate" value={`${a?.agreementRate ?? 0}%`} fg="#4F46E5" />
      </div>

      {/* Two-column main */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* LEFT — Review queue */}
        <div className={`${CARD} overflow-hidden lg:col-span-3`}>
          <div className="flex items-center justify-between border-b border-[#EEF2F7] px-4 py-3">
            <h2 className="text-[15px] font-bold text-[#0F172A]">Review Queue</h2>
            <span className="text-[12px] text-[#475569]">Lowest confidence first · {queue.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#EEF2F7] text-[11px] uppercase tracking-wide text-[#475569]">
                  <th className="px-3 py-2.5 font-semibold">Record</th>
                  <th className="px-3 py-2.5 font-semibold">Patient</th>
                  <th className="px-3 py-2.5 font-semibold">Conf.</th>
                  <th className="px-3 py-2.5 font-semibold">Primary Finding</th>
                  <th className="px-3 py-2.5 font-semibold">Flagged</th>
                  <th className="px-3 py-2.5 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {queue.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-12 text-center text-[#475569]">Nothing awaiting review.</td></tr>
                ) : queue.map((r) => (
                  <tr key={r.id} className="border-b border-[#F1F5F9] transition-colors hover:bg-[#F8FAFC]">
                    <td className="px-3 py-2.5 font-mono font-semibold text-[#4F46E5]">{r.labNo}</td>
                    <td className="px-3 py-2.5 font-semibold text-[#0F172A]">{r.patientName}</td>
                    <td className="px-3 py-2.5"><ConfidenceRing value={r.confidence} level={r.confidenceLevel} size={38} stroke={4} /></td>
                    <td className="px-3 py-2.5 text-[#334155]"><span className="line-clamp-1">{r.primaryFinding ?? '—'}</span></td>
                    <td className="px-3 py-2.5 text-[#334155]">{r.flaggedAreas}</td>
                    <td className="px-3 py-2.5"><button onClick={() => setReview(r)} className="rounded-lg bg-[#EEF2FF] px-2.5 py-1 text-[12px] font-semibold text-[#4F46E5]">Review</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT — Analytics */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className={`${CARD} p-4`}>
            <h2 className="mb-3 text-[15px] font-bold text-[#0F172A]">Confidence Distribution</h2>
            <div className="flex flex-col gap-3">
              <DistBar label="High (≥90%)" count={a?.highConfidence ?? 0} total={totalLevels} color={LEVEL_META.High.ring} />
              <DistBar label="Medium (70–89%)" count={a?.mediumConfidence ?? 0} total={totalLevels} color={LEVEL_META.Medium.ring} />
              <DistBar label="Low (<70%)" count={a?.lowConfidence ?? 0} total={totalLevels} color={LEVEL_META.Low.ring} />
            </div>
          </div>

          <div className={`${CARD} p-4`}>
            <h2 className="text-[15px] font-bold text-[#0F172A]">Agreement Rate</h2>
            <div className="mt-1 text-[32px] font-bold leading-none text-[#4F46E5]">{a?.agreementRate ?? 0}%</div>
            <div className="mt-1 text-[13px] text-[#475569]">Avg confidence {a?.avgConfidence ?? 0}%</div>
          </div>

          <div className={`${CARD} p-4`}>
            <h2 className="mb-2 text-[15px] font-bold text-[#0F172A]">By Specimen Type</h2>
            <table className="w-full text-left text-[13px]">
              <thead><tr className="text-[11px] uppercase tracking-wide text-[#475569]"><th className="py-1 font-semibold">Type</th><th className="py-1 text-right font-semibold">Screened</th><th className="py-1 text-right font-semibold">Avg Conf.</th></tr></thead>
              <tbody>
                {(a?.bySpecimenType ?? []).length === 0 ? (
                  <tr><td colSpan={3} className="py-3 text-center text-[#475569]">No data.</td></tr>
                ) : (a?.bySpecimenType ?? []).map((s) => (
                  <tr key={s.type} className="border-t border-[#F1F5F9]">
                    <td className="py-1.5 font-semibold text-[#334155]">{SPECIMEN_LABEL[s.type] ?? s.type}</td>
                    <td className="py-1.5 text-right text-[#475569]">{s.count}</td>
                    <td className="py-1.5 text-right text-[#475569]">{s.avgConfidence}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Performance trend */}
      <div className={`${CARD} mt-4 p-4`}>
        <h2 className="mb-3 text-[15px] font-bold text-[#0F172A]">Avg Confidence — Last 6 Months</h2>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={a?.trendByMonth ?? []} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #EEF2F7', fontSize: 13 }} formatter={(v: any) => [`${v}%`, 'Avg confidence']} />
            <Line type="monotone" dataKey="avgConfidence" stroke="#4F46E5" strokeWidth={2.5} dot={{ r: 3, fill: '#4F46E5' }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {review && <ReviewScreeningModal result={review} onClose={() => setReview(null)} />}
    </div>
  );
}
