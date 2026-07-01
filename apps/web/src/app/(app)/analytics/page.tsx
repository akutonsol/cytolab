'use client';

import { Skeleton } from 'antd';
import {
  Activity, AlertTriangle, ChevronRight, Clock, FileClock, Receipt, RotateCcw, ShieldCheck, TrendingUp, Zap,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MiniAreaChart, PillSelect, SectionCard } from '@/components/ui';
import { ComplianceLine, DivergingBars, DualAreaLine } from './charts';

const money = (n: number) => `$${(n ?? 0).toLocaleString()}`;

// Soft-tinted rounded-square icon chips (blue / green / orange), Lucide icons.
const CHIP = {
  blue: 'bg-primary-soft text-primary',
  green: 'bg-success-soft text-success',
  orange: 'bg-warning-soft text-warning',
  red: 'bg-danger-soft text-danger',
  gray: 'bg-lightgray text-text-secondary',
} as const;

const INSIGHT: Record<string, { icon: React.ReactNode; chip: keyof typeof CHIP }> = {
  fastestTat: { icon: <Zap size={18} />, chip: 'blue' },
  topClient: { icon: <TrendingUp size={18} />, chip: 'green' },
  authRate: { icon: <ShieldCheck size={18} />, chip: 'orange' },
  abnormalRate: { icon: <AlertTriangle size={18} />, chip: 'blue' },
};
const ATTENTION: Record<string, { icon: React.ReactNode; chip: keyof typeof CHIP }> = {
  overdue: { icon: <Clock size={16} />, chip: 'red' },
  urgent: { icon: <Zap size={16} />, chip: 'orange' },
  awaiting: { icon: <FileClock size={16} />, chip: 'blue' },
  reopened: { icon: <RotateCcw size={16} />, chip: 'red' },
  unbilled: { icon: <Receipt size={16} />, chip: 'gray' },
};
const BADGE_TEXT: Record<string, string> = { danger: 'text-danger', warning: 'text-warning', info: 'text-primary', neutral: 'text-text-secondary' };
const BADGE_BG: Record<string, string> = { danger: 'bg-danger-soft', warning: 'bg-warning-soft', info: 'bg-primary-soft', neutral: 'bg-lightgray' };

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex items-center gap-4">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 text-caption text-text-secondary">
          <span className="h-2 w-2 rounded-full" style={{ background: it.color }} /> {it.label}
        </span>
      ))}
    </div>
  );
}

function KpiTile({ label, value, spark, color }: { label: string; value: string; spark: number[]; color: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-card border border-card bg-surface p-4 shadow-card">
      <div className="flex min-w-0 flex-col">
        <span className="text-title font-bold leading-tight text-text">{value}</span>
        <span className="whitespace-nowrap text-tiny text-text-tertiary">{label}</span>
      </div>
      <div className="w-16 shrink-0"><MiniAreaChart data={spark.length ? spark : [0, 0]} color={color} height={36} /></div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics-dashboard'],
    queryFn: () => api.get('/analytics/dashboard').then((r) => r.data),
  });

  if (isError) return <div className="p-2 text-small text-text-secondary">Analytics are unavailable right now.</div>;
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-6"><SkeletonCard h={460} /></div>
        <div className="col-span-3"><SkeletonCard h={460} /></div>
        <div className="col-span-3"><SkeletonCard h={460} /></div>
        <div className="col-span-7"><SkeletonCard h={320} /></div>
        <div className="col-span-5"><SkeletonCard h={320} /></div>
      </div>
    );
  }
  const d = data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h2 text-text">Analytics</h1>
        <p className="text-small text-text-secondary">Live lab performance — volume, turnaround, revenue and what needs attention.</p>
      </div>

      {/* ---- TOP ROW ---- */}
      <div className="grid grid-cols-12 gap-6">
        <SectionCard
          className="col-span-12 xl:col-span-6"
          title="Specimen Volume Overview"
          action={<Legend items={[{ label: 'Actual Volume', color: '#2e5ce6' }, { label: 'Target Capacity', color: '#cbd5e1' }]} />}
        >
          <DivergingBars data={d.monthlyVolume} currentMonth={d.currentMonth} />
        </SectionCard>

        <SectionCard
          className="col-span-12 md:col-span-6 xl:col-span-3"
          title="Attention Queue"
          action={<span className="grid h-7 min-w-7 place-items-center rounded-pill bg-lightgray px-2 text-caption font-semibold text-text-secondary">{d.attention.total}</span>}
        >
          <div className="flex flex-col divide-y divide-border">
            {d.attention.items.map((it: any) => (
              <div key={it.key} className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-control ${CHIP[ATTENTION[it.key]?.chip ?? 'gray']}`}>{ATTENTION[it.key]?.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-small font-semibold text-text">{it.title}</div>
                  <div className="text-caption text-text-tertiary">{it.description}</div>
                </div>
                <span className={`grid h-6 min-w-6 place-items-center rounded-pill px-2 text-caption font-semibold ${BADGE_BG[it.severity]} ${BADGE_TEXT[it.severity]}`}>{it.count}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard className="col-span-12 md:col-span-6 xl:col-span-3">
          <div className="flex items-center justify-between rounded-card bg-primary-soft px-4 py-3">
            <span className="text-small font-semibold text-primary">Based on the last 30 days</span>
            <Activity size={18} className="text-primary" />
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {d.insights.items.map((it: any) => {
              const cfg = INSIGHT[it.key] ?? { icon: <Zap size={18} />, chip: 'blue' as const };
              const neg = String(it.metric).startsWith('-');
              const pos = String(it.metric).startsWith('+');
              return (
                <div key={it.key} className="flex items-center gap-3 rounded-control px-1 py-1.5">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-control ${CHIP[cfg.chip]}`}>{cfg.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-small font-semibold text-text">{it.title}</div>
                    <div className="truncate text-caption text-text-tertiary">{it.detail}</div>
                  </div>
                  <span className={`text-small font-semibold ${neg ? 'text-danger' : pos ? 'text-success' : 'text-text'}`}>{it.metric}</span>
                  <ChevronRight size={16} className="text-text-tertiary" />
                </div>
              );
            })}
            <div className="mt-2 flex items-center justify-between border-t border-border pt-3">
              <span className="text-caption font-medium uppercase tracking-wide text-text-tertiary">{d.insights.footerLabel}</span>
              <span className="rounded-pill bg-success-soft px-2.5 py-1 text-caption font-semibold text-success">{d.insights.footerValue}</span>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ---- LOWER ROW ---- */}
      <div className="grid grid-cols-12 gap-6">
        <SectionCard
          className="col-span-12 xl:col-span-7"
          title="Turnaround Overview"
          subtitle="Specimen volume vs revenue, trailing 12 months"
          action={<div className="flex items-center gap-3"><Legend items={[{ label: 'Volume', color: '#2e5ce6' }, { label: 'Revenue', color: '#111827' }]} /><PillSelect value="Year" options={['Year']} /></div>}
        >
          <DualAreaLine data={d.volumeRevenue} />
        </SectionCard>

        <div className="col-span-12 grid grid-cols-6 gap-6 xl:col-span-5">
          <div className="col-span-6 flex flex-col gap-4 sm:col-span-2">
            <KpiTile label="Revenue" value={money(d.kpis.revenue.value)} spark={d.kpis.revenue.spark} color="#2e5ce6" />
            <KpiTile label="On-time %" value={`${d.kpis.onTimeTat.value}%`} spark={d.kpis.onTimeTat.spark} color="#111827" />
            <KpiTile label="Cost / spec." value={money(d.kpis.avgCost.value)} spark={d.kpis.avgCost.spark} color="#2e5ce6" />
          </div>

          <SectionCard className="col-span-6 sm:col-span-4" title="Turnaround Compliance" action={<PillSelect value="Week" options={['Week']} />}>
            <div className="mb-1 flex items-baseline gap-2">
              <span className="text-h2 text-text">{d.compliance.onTimePct}%</span>
              <span className="text-caption text-text-tertiary">on time · target {d.compliance.targetTatDays}d</span>
            </div>
            <ComplianceLine week={d.compliance.week} />
          </SectionCard>

          <SectionCard className="col-span-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-caption text-text-tertiary">Reports Authorized · this month</div>
                <div className="text-title font-bold text-text">{d.reportsAuthorized.count} <span className="text-small font-medium text-text-tertiary">/ {d.reportsAuthorized.target} target</span></div>
              </div>
              <span className="text-small font-semibold text-primary">{d.reportsAuthorized.pct}%</span>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-pill bg-lightgray">
              <div className="h-full rounded-pill bg-primary" style={{ width: `${d.reportsAuthorized.pct}%` }} />
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function SkeletonCard({ h }: { h: number }) {
  return (
    <div className="rounded-card border border-card bg-surface p-7 shadow-card" style={{ height: h }}>
      <Skeleton active paragraph={{ rows: 6 }} />
    </div>
  );
}
