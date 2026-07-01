'use client';

import { App, Skeleton } from 'antd';
import {
  ArrowRightOutlined, SafetyCertificateOutlined, TeamOutlined, ThunderboltOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MiniAreaChart, PillSelect, SectionCard, StatusBadge } from '@/components/ui';
import { ComplianceLine, DivergingBars, DualAreaLine } from './charts';

const money = (n: number) => `$${(n ?? 0).toLocaleString()}`;
const kmoney = (n: number) => (n >= 1000 ? `$${Math.round(n / 100) / 10}k` : `$${n}`);

const SEVERITY: Record<string, 'danger' | 'warning' | 'info' | 'neutral' | 'success'> = {
  danger: 'danger', warning: 'warning', info: 'info', neutral: 'neutral', success: 'success',
};
const INSIGHT_ICON: Record<string, React.ReactNode> = {
  fastestTat: <ThunderboltOutlined />, topClient: <TeamOutlined />,
  authRate: <SafetyCertificateOutlined />, abnormalRate: <WarningOutlined />,
};

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
      <div className="w-14 shrink-0"><MiniAreaChart data={spark.length ? spark : [0, 0]} color={color} height={34} /></div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { message } = App.useApp();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics-dashboard'],
    queryFn: () => api.get('/analytics/dashboard').then((r) => r.data),
  });

  if (isError) {
    return <div className="p-2 text-small text-text-secondary">Analytics are unavailable right now.</div>;
  }

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

      {/* ---- TOP ROW: volume / attention / insights ---- */}
      <div className="grid grid-cols-12 gap-6">
        <SectionCard
          className="col-span-12 xl:col-span-6"
          title="Specimen Volume Overview"
          action={<Legend items={[{ label: 'Actual Volume', color: '#4f7df9' }, { label: 'Target Capacity', color: '#9ca3af' }]} />}
        >
          <DivergingBars data={d.monthlyVolume} currentMonth={d.currentMonth} />
        </SectionCard>

        <SectionCard
          className="col-span-12 md:col-span-6 xl:col-span-3"
          title="Attention Queue"
          action={<span className="grid h-7 min-w-7 place-items-center rounded-pill bg-text px-2 text-caption font-semibold text-white">{d.attention.total}</span>}
        >
          <div className="flex flex-col divide-y divide-border">
            {d.attention.items.map((it: any) => (
              <div key={it.key} className="flex items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-small font-semibold text-text">{it.title}</div>
                  <div className="text-caption text-text-tertiary">{it.description}</div>
                </div>
                <StatusBadge status={`${it.count}`} variant={SEVERITY[it.severity]} />
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          className="col-span-12 md:col-span-6 xl:col-span-3"
          title="Insights"
          subtitle="Based on the last 30 days"
        >
          <div className="flex flex-col gap-2.5">
            {d.insights.items.map((it: any) => (
              <div key={it.key} className="flex items-center gap-3 rounded-control px-1 py-1.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-primary-soft text-primary">{INSIGHT_ICON[it.key]}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-small font-semibold text-text">{it.title}</div>
                  <div className="truncate text-caption text-text-tertiary">{it.detail}</div>
                </div>
                <span className="text-small font-semibold text-text">{it.metric}</span>
                <ArrowRightOutlined className="text-text-tertiary" />
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-border pt-3">
              <span className="text-caption font-medium uppercase tracking-wide text-text-tertiary">{d.insights.footerLabel}</span>
              <span className="rounded-pill bg-success-soft px-2.5 py-1 text-caption font-semibold text-success">{d.insights.footerValue}</span>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ---- LOWER ROW: turnaround / KPIs + compliance ---- */}
      <div className="grid grid-cols-12 gap-6">
        <SectionCard
          className="col-span-12 xl:col-span-7"
          title="Turnaround Overview"
          subtitle="Specimen volume vs revenue, trailing 12 months"
          action={<div className="flex items-center gap-3"><Legend items={[{ label: 'Volume', color: '#4f7df9' }, { label: 'Revenue', color: '#111827' }]} /><PillSelect value="Year" options={['Year']} /></div>}
        >
          <DualAreaLine data={d.volumeRevenue} />
        </SectionCard>

        <div className="col-span-12 grid grid-cols-6 gap-6 xl:col-span-5">
          <div className="col-span-6 flex flex-col gap-4 sm:col-span-2">
            <KpiTile label="Revenue" value={money(d.kpis.revenue.value)} spark={d.kpis.revenue.spark} color="#4f7df9" />
            <KpiTile label="On-time %" value={`${d.kpis.onTimeTat.value}%`} spark={d.kpis.onTimeTat.spark} color="#111827" />
            <KpiTile label="Cost / spec." value={money(d.kpis.avgCost.value)} spark={d.kpis.avgCost.spark} color="#4f7df9" />
          </div>

          <SectionCard className="col-span-6 sm:col-span-4" title="Turnaround Compliance" action={<PillSelect value="Week" options={['Week']} />}>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-h2 text-text">{d.compliance.onTimePct}%</div>
                <div className="text-caption text-text-tertiary">on time · target {d.compliance.targetTatDays}d</div>
              </div>
              <div className="flex gap-2">
                <span className="rounded-pill bg-danger-soft px-2.5 py-1 text-caption font-semibold text-danger">Delayed</span>
                <span className="rounded-pill bg-success-soft px-2.5 py-1 text-caption font-semibold text-success">On time</span>
              </div>
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
