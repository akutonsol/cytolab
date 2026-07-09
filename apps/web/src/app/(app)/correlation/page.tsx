'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, GitCompare, Plus } from 'lucide-react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/feature-context';
import { AddCorrelationModal } from '@/components/AddCorrelationModal';
import {
  CORRELATION_RESULTS, DONUT_COLOR, RESULT_META, patientName, shortDate,
  type CorrelationAnalytics, type CorrelationCase, type CorrelationResult,
} from '@/lib/correlation';
import { Card } from '@/components/ui';


function ResultBadge({ r }: { r: CorrelationResult | null }) {
  const m = RESULT_META[r ?? 'Unresolved'];
  return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: m.bg, color: m.fg }}>{r === 'MajorDiscordant' && <AlertTriangle size={11} />}{m.label}</span>;
}

function Kpi({ label, value, fg = '#0F172A' }: { label: string; value: string | number; fg?: string }) {
  return <Card radius="md" elevation="soft" border="hairline" className="p-4"><div className="text-[24px] font-bold leading-none" style={{ color: fg }}>{value}</div><div className="mt-1.5 text-[13px] text-[#475569]">{label}</div></Card>;
}

export default function CorrelationPage() {
  const router = useRouter();
  const { isEnabled } = useFeatures();
  const enabled = isEnabled('CORRELATION_TRACKING');
  const [addOpen, setAddOpen] = useState(false);
  const [fResult, setFResult] = useState('');
  const [fReview, setFReview] = useState(false);

  const { data: analytics } = useQuery<CorrelationAnalytics>({ queryKey: ['correlation-analytics'], queryFn: () => api.get('/correlation/analytics').then((r) => r.data), enabled });
  const { data: cases = [] } = useQuery<CorrelationCase[]>({
    queryKey: ['correlations', fResult, fReview],
    queryFn: () => api.get('/correlation', { params: { ...(fResult && { result: fResult }), ...(fReview && { reviewRequired: true }) } }).then((r) => r.data),
    enabled,
  });

  if (!enabled) {
    return (
      <div className="min-h-full pt-4" style={{ background: '#F8FAFC' }}>
        <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[#EEF2F7] bg-white p-8 text-center shadow-sm">
          <GitCompare size={28} className="mx-auto text-[#9CA3AF]" />
          <div className="mt-3 text-[18px] font-bold text-[#0F172A]">Feature not enabled</div>
          <div className="mt-1 text-[14px] text-[#6B7280]">Correlation Tracking is disabled for this lab.</div>
        </div>
      </div>
    );
  }

  const donut = analytics ? CORRELATION_RESULTS.map((r) => ({
    name: RESULT_META[r].label, value: r === 'Concordant' ? analytics.concordantCount : r === 'MinorDiscordant' ? analytics.minorDiscordantCount : r === 'MajorDiscordant' ? analytics.majorDiscordantCount : analytics.unresolvedCount, color: DONUT_COLOR[r],
  })).filter((d) => d.value > 0) : [];
  const pending = cases.filter((c) => c.reviewRequired && !c.reviewedAt);

  return (
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#0F172A]">Correlation Tracking</h1>
          <p className="mt-1.5 text-[15px] text-[#6B7280]">Cyto-histo concordance for QA and CAP/ISO accreditation.</p>
        </div>
        <button onClick={() => setAddOpen(true)} className="flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2.5 text-[14px] font-semibold text-white"><Plus size={16} /> Add Correlation</button>
      </div>

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Total Cases" value={analytics?.total ?? 0} />
        <Kpi label="Concordance Rate" value={`${(analytics?.concordanceRate ?? 0).toFixed(1)}%`} fg={(analytics?.concordanceRate ?? 0) > 95 ? '#16A34A' : '#0F172A'} />
        <Kpi label="Major Discordant" value={analytics?.majorDiscordantCount ?? 0} fg={(analytics?.majorDiscordantCount ?? 0) > 0 ? '#B91C1C' : '#0F172A'} />
        <Kpi label="Pending Review" value={analytics?.pendingReview ?? 0} fg={(analytics?.pendingReview ?? 0) > 0 ? '#A16207' : '#0F172A'} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[65fr_35fr]">
        {/* Cases table */}
        <Card radius="md" elevation="soft" border="hairline">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#EEF2F7] p-3">
            <select value={fResult} onChange={(e) => setFResult(e.target.value)} className="h-9 rounded-lg border border-[#E2E8F0] px-2 text-[13px] outline-none">
              <option value="">All results</option>{CORRELATION_RESULTS.map((r) => <option key={r} value={r}>{RESULT_META[r].label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-[13px] text-[#334155]"><input type="checkbox" checked={fReview} onChange={(e) => setFReview(e.target.checked)} style={{ accentColor: '#4F46E5' }} /> Review required</label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#EEF2F7] text-[11px] uppercase tracking-wide text-[#475569]">
                  <th className="px-3 py-2.5 font-semibold">Patient</th><th className="px-3 py-2.5 font-semibold">Cyto Date</th>
                  <th className="px-3 py-2.5 font-semibold">Cyto Dx</th><th className="px-3 py-2.5 font-semibold">Histo Date</th>
                  <th className="px-3 py-2.5 font-semibold">Histo Dx</th><th className="px-3 py-2.5 font-semibold">Result</th>
                  <th className="px-3 py-2.5 font-semibold">Review</th>
                </tr>
              </thead>
              <tbody>
                {cases.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-12 text-center text-[#475569]">No correlation cases.</td></tr>
                ) : cases.map((c) => (
                  <tr key={c.id} onClick={() => router.push(`/correlation/${c.id}`)} className="cursor-pointer border-b border-[#F1F5F9] transition-colors hover:bg-[#F8FAFC]"
                    style={{ background: c.correlationResult === 'MajorDiscordant' ? RESULT_META.MajorDiscordant.rowBg : undefined }}>
                    <td className="px-3 py-2.5 font-semibold text-[#0F172A]">{patientName(c)}</td>
                    <td className="px-3 py-2.5 text-[#475569]">{shortDate(c.cytologyDate)}</td>
                    <td className="px-3 py-2.5 text-[#334155]">{c.cytologyDiagnosis}</td>
                    <td className="px-3 py-2.5 text-[#475569]">{shortDate(c.histologyDate)}</td>
                    <td className="px-3 py-2.5 text-[#334155]">{c.histologyDiagnosis ?? '—'}</td>
                    <td className="px-3 py-2.5"><ResultBadge r={c.correlationResult} /></td>
                    <td className="px-3 py-2.5">{c.reviewRequired && !c.reviewedAt ? <span className="text-[12px] font-semibold text-[#B91C1C]">Required</span> : c.reviewedAt ? <span className="text-[12px] text-[#16A34A]">Reviewed</span> : <span className="text-[12px] text-[#475569]">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Analytics panel */}
        <div className="flex flex-col gap-5">
          <Card radius="md" elevation="soft" border="hairline" className="p-4">
            <div className="mb-2 text-[15px] font-bold text-[#0F172A]">Concordance Distribution</div>
            {donut.length === 0 ? <div className="py-8 text-center text-[13px] text-[#475569]">No data yet.</div> : (
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={donut} dataKey="value" nameKey="name" innerRadius={50} outerRadius={78} paddingAngle={2}>{donut.map((d) => <Cell key={d.name} fill={d.color} />)}</Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
          <Card radius="md" elevation="soft" border="hairline" className="p-4">
            <div className="mb-2 text-[15px] font-bold text-[#0F172A]">Monthly Trend <span className="text-[12px] font-normal text-[#475569]">· 6 months</span></div>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={analytics?.byMonth ?? []} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#475569' }} tickFormatter={(m) => m.slice(5)} />
                <Tooltip />
                <Bar dataKey="concordant" stackId="a" fill={DONUT_COLOR.Concordant} />
                <Bar dataKey="minorDiscordant" stackId="a" fill={DONUT_COLOR.MinorDiscordant} />
                <Bar dataKey="majorDiscordant" stackId="a" fill={DONUT_COLOR.MajorDiscordant} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card radius="md" elevation="soft" border="hairline" className="p-4">
            <div className="mb-2 text-[15px] font-bold text-[#0F172A]">Pending Review ({pending.length})</div>
            {pending.length === 0 ? <div className="text-[13px] text-[#475569]">Nothing awaiting review.</div> : (
              <div className="flex flex-col gap-2">
                {pending.slice(0, 6).map((c) => (
                  <button key={c.id} onClick={() => router.push(`/correlation/${c.id}`)} className="flex items-center justify-between rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-left text-[13px]">
                    <span className="font-semibold text-[#0F172A]">{patientName(c)}</span>
                    <ResultBadge r={c.correlationResult} />
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {addOpen && <AddCorrelationModal onClose={() => setAddOpen(false)} />}
    </div>
  );
}
