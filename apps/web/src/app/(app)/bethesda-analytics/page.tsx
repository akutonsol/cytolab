'use client';

import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/feature-context';
import {
  CAT_COLOR, PERIOD_LABELS, STATUS_COLOR, pct1, rateColor,
  type AnalyticsPeriod, type Benchmarks, type BethesdaSummary, type TechnicianRow, type TrendPoint,
} from '@/lib/bethesda-analytics';
import { Card, EmptyState } from '@/components/ui';


function Kpi({ label, value, fg = '#0F172A', sub }: { label: string; value: string | number; fg?: string; sub?: string }) {
  return (
    <Card radius="md" elevation="soft" border="hairline" className="p-4">
      <div className="text-[24px] font-bold leading-none" style={{ color: fg }}>{value}</div>
      <div className="mt-1.5 text-[12px] font-medium text-[#475569]">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[#475569]">{sub}</div>}
    </Card>
  );
}

export default function BethesdaAnalyticsPage() {
  const { isEnabled } = useFeatures();
  const enabled = isEnabled('BETHESDA_ANALYTICS');
  const [period, setPeriod] = useState<AnalyticsPeriod>('all');

  const { data: summary } = useQuery<BethesdaSummary>({ queryKey: ['bethesda-summary', period], queryFn: () => api.get('/bethesda/analytics/summary', { params: { period } }).then((r) => r.data), enabled });
  const { data: trend = [] } = useQuery<TrendPoint[]>({ queryKey: ['bethesda-trend'], queryFn: () => api.get('/bethesda/analytics/trend', { params: { months: 12 } }).then((r) => r.data), enabled });
  const { data: benchmarks } = useQuery<Benchmarks>({ queryKey: ['bethesda-benchmarks'], queryFn: () => api.get('/bethesda/analytics/benchmarks').then((r) => r.data), enabled });
  const { data: techs = [] } = useQuery<TechnicianRow[]>({ queryKey: ['bethesda-techs'], queryFn: () => api.get('/bethesda/analytics/by-technician').then((r) => r.data), enabled });

  if (!enabled) {
    return (
      <div className="min-h-full pt-4" style={{ background: '#F8FAFC' }}>
        <EmptyState className="mt-16"
              icon={<BarChart3 size={28} />}
              title={<>Feature not enabled</>}
              description={<>Bethesda Analytics is disabled for this lab.</>}
            />
      </div>
    );
  }

  const s = summary;
  const total = s?.totalClassified ?? 0;
  const dist = s ? [
    { label: 'NILM', count: s.generalCategory.nilm, color: CAT_COLOR.NILM },
    { label: 'ASC-US', count: s.squamous.ascus, color: CAT_COLOR.ASCUS },
    { label: 'ASC-H', count: s.squamous.asch, color: CAT_COLOR.ASCH },
    { label: 'LSIL', count: s.squamous.lsil, color: CAT_COLOR.LSIL },
    { label: 'HSIL', count: s.squamous.hsil, color: CAT_COLOR.HSIL },
    { label: 'SCC', count: s.squamous.scc, color: CAT_COLOR.SCC },
    { label: 'AGC', count: s.glandular.agc, color: CAT_COLOR.AGC },
    { label: 'Unsatisfactory', count: s.specimenAdequacy.unsatisfactory, color: CAT_COLOR.Unsatisfactory },
  ] : [];

  const hpvData = s ? [
    { name: 'Positive', value: s.hpv.positive, color: '#DC2626' },
    { name: 'Negative', value: s.hpv.negative, color: '#16A34A' },
    { name: 'Not Done', value: s.hpv.notDone, color: '#475569' },
  ].filter((d) => d.value > 0) : [];

  const labAvgUnsat = techs.length ? (techs.reduce((a, t) => a + t.unsatisfactoryCount, 0) / Math.max(1, techs.reduce((a, t) => a + t.total, 0))) * 100 : 0;

  return (
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#0F172A]">Bethesda Analytics</h1>
          <p className="mt-1.5 text-[15px] text-[#6B7280]">TBS category distributions, ASC:SIL ratio, and CAP benchmark compliance.</p>
        </div>
        <div className="flex gap-1 rounded-full bg-[#F1F5F9] p-1">
          {(['month', 'quarter', 'year', 'all'] as AnalyticsPeriod[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors"
              style={period === p ? { background: '#fff', color: '#0F172A', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } : { color: '#475569' }}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Row 1 — KPI strip */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Total Classified" value={total} />
        <Kpi label="NILM Rate" value={pct1(s?.generalCategory.nilmRate ?? 0)} fg={rateColor(s?.generalCategory.nilmRate ?? 0, 'nilm')} sub="of satisfactory" />
        <Kpi label="Abnormality Rate" value={pct1(s?.generalCategory.abnormalityRate ?? 0)} fg="#4F46E5" sub="of satisfactory" />
        <Kpi label="Unsatisfactory Rate" value={pct1(s?.specimenAdequacy.unsatisfactoryRate ?? 0)} fg={rateColor(s?.specimenAdequacy.unsatisfactoryRate ?? 0, 'unsat')} />
        <Kpi label="HPV Positivity" value={pct1(s?.hpv.positivityRate ?? 0)} fg="#4F46E5" />
        <Kpi label="Malignant Count" value={s?.malignantCount ?? 0} fg={(s?.malignantCount ?? 0) > 0 ? '#B91C1C' : '#0F172A'} />
      </div>

      {/* Row 2 — Trend (60) + Distribution (40) */}
      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-[60fr_40fr]">
        <Card radius="md" elevation="soft" border="hairline" className="p-4">
          <div className="mb-3 text-[15px] font-bold text-[#0F172A]">Classification Trend <span className="text-[12px] font-normal text-[#475569]">· last 12 months</span></div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={trend} margin={{ top: 6, right: 6, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#475569' }} tickFormatter={(m) => m.slice(2)} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#475569' }} allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#475569' }} unit="%" />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="nilm" stackId="a" fill={CAT_COLOR.NILM} name="NILM" />
              <Bar yAxisId="left" dataKey="ascus" stackId="a" fill={CAT_COLOR.ASCUS} name="ASC-US" />
              <Bar yAxisId="left" dataKey="asch" stackId="a" fill={CAT_COLOR.ASCH} name="ASC-H" />
              <Bar yAxisId="left" dataKey="lsil" stackId="a" fill={CAT_COLOR.LSIL} name="LSIL" />
              <Bar yAxisId="left" dataKey="hsil" stackId="a" fill={CAT_COLOR.HSIL} name="HSIL" />
              <Bar yAxisId="left" dataKey="scc" stackId="a" fill={CAT_COLOR.SCC} name="SCC" />
              <Bar yAxisId="left" dataKey="unsatisfactory" stackId="a" fill={CAT_COLOR.Unsatisfactory} name="Unsat" />
              <Line yAxisId="right" type="monotone" dataKey="abnormalityRate" stroke="#4F46E5" strokeWidth={2} dot={false} name="Abnormality %" />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        <Card radius="md" elevation="soft" border="hairline" className="p-4">
          <div className="mb-3 text-[15px] font-bold text-[#0F172A]">Distribution Breakdown</div>
          <div className="flex flex-col gap-2.5">
            {dist.map((d) => {
              const p = total ? (d.count / total) * 100 : 0;
              return (
                <div key={d.label}>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-medium text-[#334155]">{d.label}</span>
                    <span className="text-[#475569]">{d.count} ({p.toFixed(1)}%)</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, p)}%`, background: d.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Row 3 — Benchmarks (50) + HPV (50) */}
      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div>
          <div className="mb-3 text-[15px] font-bold text-[#0F172A]">CAP Benchmark Compliance</div>
          <div className="flex flex-col gap-3">
            {benchmarks && (
              <>
                <BenchmarkCard title="ASC:SIL Ratio" value={benchmarks.ascSilRatio.value.toFixed(2)} standard="< 3.0" status={benchmarks.ascSilRatio.status} progress={Math.min(100, (benchmarks.ascSilRatio.value / 3.0) * 100)} />
                <BenchmarkCard title="Unsatisfactory Rate" value={`${benchmarks.unsatisfactoryRate.value.toFixed(1)}%`} standard="< 1%" status={benchmarks.unsatisfactoryRate.status} progress={Math.min(100, (benchmarks.unsatisfactoryRate.value / 1.0) * 100)} />
                <Card radius="md" elevation="soft" border="hairline" className="p-4" style={{ borderLeft: '4px solid #475569' }}>
                  <div className="text-[14px] font-bold text-[#0F172A]">HSIL:ASC-US Ratio</div>
                  <div className="mt-1 text-[13px] text-[#475569]">Your value: <span className="font-semibold text-[#0F172A]">{benchmarks.hsil_ascus_ratio.value.toFixed(2)}</span> · {benchmarks.hsil_ascus_ratio.note}</div>
                </Card>
              </>
            )}
          </div>
        </div>

        <Card radius="md" elevation="soft" border="hairline" className="p-4">
          <div className="mb-3 text-[15px] font-bold text-[#0F172A]">HPV Analysis</div>
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={hpvData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
                  {hpvData.map((d) => <Cell key={d.name} fill={d.color} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-1 text-center">
              <div className="text-[28px] font-bold text-[#4F46E5]">{pct1(s?.hpv.positivityRate ?? 0)}</div>
              <div className="text-[12px] text-[#475569]">HPV positivity rate (of tested)</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Row 4 — Technician performance */}
      <Card radius="md" elevation="soft" border="hairline" className="overflow-hidden">
        <div className="border-b border-[#EEF2F7] p-4 text-[15px] font-bold text-[#0F172A]">Performance by Technician</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#EEF2F7] text-[11px] uppercase tracking-wide text-[#475569]">
                <th className="px-4 py-2.5 font-semibold">Technician</th><th className="px-4 py-2.5 font-semibold">Total</th>
                <th className="px-4 py-2.5 font-semibold">NILM</th><th className="px-4 py-2.5 font-semibold">Abnormal</th>
                <th className="px-4 py-2.5 font-semibold">Unsat</th><th className="px-4 py-2.5 font-semibold">Unsat Rate</th>
                <th className="px-4 py-2.5 font-semibold">vs Lab Avg</th>
              </tr>
            </thead>
            <tbody>
              {techs.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-[#475569]">No technician data.</td></tr>
              ) : techs.map((t) => {
                const diff = t.unsatisfactoryRate - labAvgUnsat;
                const worse = diff > 0.05;
                return (
                  <tr key={t.userId} className="border-b border-[#F1F5F9]">
                    <td className="px-4 py-2.5 font-semibold text-[#0F172A]">{t.userName}</td>
                    <td className="px-4 py-2.5 text-[#334155]">{t.total}</td>
                    <td className="px-4 py-2.5 text-[#334155]">{t.nilmCount}</td>
                    <td className="px-4 py-2.5 text-[#334155]">{t.abnormalCount}</td>
                    <td className="px-4 py-2.5 text-[#334155]">{t.unsatisfactoryCount}</td>
                    <td className="px-4 py-2.5 font-semibold" style={{ color: worse ? '#B91C1C' : '#334155' }}>{t.unsatisfactoryRate.toFixed(1)}%</td>
                    <td className="px-4 py-2.5 font-semibold" style={{ color: diff <= 0 ? '#16A34A' : '#B91C1C' }}>{diff > 0 ? '+' : ''}{diff.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function BenchmarkCard({ title, value, standard, status, progress }: { title: string; value: string; standard: string; status: 'pass' | 'warning' | 'fail'; progress: number }) {
  const m = STATUS_COLOR[status];
  return (
    <Card radius="md" elevation="soft" border="hairline" className="p-4" style={{ borderLeft: `4px solid ${m.border}` }}>
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-bold text-[#0F172A]">{title}</div>
        <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: m.bg, color: m.fg }}>{m.label}</span>
      </div>
      <div className="mt-1 text-[13px] text-[#475569]">Your value: <span className="font-semibold text-[#0F172A]">{value}</span> · CAP benchmark: {standard}</div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
        <div className="h-full rounded-full" style={{ width: `${progress}%`, background: m.border }} />
      </div>
    </Card>
  );
}
