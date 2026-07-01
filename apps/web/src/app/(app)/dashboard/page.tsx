'use client';

import { useRouter } from 'next/navigation';
import { Skeleton } from 'antd';
import { ArrowUpRight, FlaskConical, MoreHorizontal, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AvatarStack, PillSelect, SectionCard } from '@/components/ui';
import { OeeDonut, ProgressRing, RadarMetrics, ThroughputBars } from './charts';

const ago = (d: string) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
const dateShort = (d: string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const GREEN = '#22c55e', BLUE = '#4f7df9', RED = '#ef4444';
const dotFor = (status: string) =>
  ['Approved', 'Completed', 'Paid', 'Billed'].includes(status) ? GREEN
    : ['Deauthorized', 'Failed', 'Disabled'].includes(status) ? RED : BLUE;

function SeeAll({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="text-caption font-semibold text-primary hover:underline">See all</button>;
}
function Stat({ value, label, dot }: { value: React.ReactNode; label: string; dot: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-title font-bold leading-tight text-text">{value}</span>
      <span className="flex items-center gap-1.5 text-caption text-text-tertiary">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} /> {label}
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: d, isLoading, isError } = useQuery({
    queryKey: ['dashboard-home'],
    queryFn: () => api.get('/analytics/home').then((r) => r.data),
  });

  if (isError) return <div className="p-2 text-small text-text-secondary">Dashboard is unavailable right now.</div>;
  if (isLoading || !d) {
    return (
      <div className="grid grid-cols-12 gap-6">
        {['xl:col-span-4', 'xl:col-span-5', 'xl:col-span-3', 'xl:col-span-5', 'xl:col-span-4', 'xl:col-span-3'].map((s, i) => (
          <div key={i} className={`col-span-12 ${s}`}><SkeletonCard h={i < 3 ? 340 : 300} /></div>
        ))}
      </div>
    );
  }

  const up = d.throughput.deltaPct >= 0;

  return (
    <div className="flex flex-col gap-6">
      {/* ---- ROW 1 ---- */}
      <div className="grid grid-cols-12 gap-6">
        {/* Priority Queue */}
        <SectionCard className="col-span-12 xl:col-span-4" title="Priority Queue" action={<SeeAll onClick={() => router.push('/records')} />}>
          <div className="flex flex-col divide-y divide-border">
            {d.priorityRecords.length === 0 && <div className="py-6 text-center text-small text-text-tertiary">Nothing urgent — you&apos;re clear.</div>}
            {d.priorityRecords.map((r: any) => (
              <div key={r.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-control ${r.urgent ? 'bg-danger-soft text-danger' : 'bg-primary-soft text-primary'}`}><FlaskConical size={18} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-small font-semibold text-text">{r.patient}</span>
                    <span className="shrink-0 text-caption text-text-tertiary">{r.labNumber}</span>
                  </div>
                  <div className="truncate text-caption text-text-tertiary">{[r.client, r.specimen].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                <span className="hidden shrink-0 rounded-pill bg-text px-2.5 py-1 text-tiny font-semibold text-white sm:inline">{dateShort(r.date)}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <ProgressRing pct={r.progress} />
                  <span className="hidden text-caption text-text-secondary md:inline">{r.progress}%</span>
                </div>
                <button onClick={() => router.push('/records')} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-card text-text-secondary hover:text-text"><ArrowUpRight size={16} /></button>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Specimen Throughput */}
        <SectionCard
          className="col-span-12 xl:col-span-5"
          title="Specimen Throughput"
          action={<div className="flex items-center gap-2"><PillSelect value="Week" options={['Week']} /><button className="grid h-8 w-8 place-items-center rounded-full border border-card text-text-secondary"><ArrowUpRight size={15} /></button></div>}
        >
          <div className="mb-1 flex items-center gap-3">
            <span className="text-h1 font-extrabold tracking-tight text-text">{d.throughput.headlinePct}%</span>
            <span className={`flex items-center gap-1 rounded-pill px-2 py-0.5 text-caption font-semibold ${up ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}>
              {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{Math.abs(d.throughput.deltaPct)}%
            </span>
          </div>
          <div className="mb-2 text-caption text-text-tertiary">{d.throughput.headlineLabel}, last 6 weeks</div>
          <ThroughputBars data={d.throughput.series} />
        </SectionCard>

        {/* Performance Radar */}
        <SectionCard className="col-span-12 xl:col-span-3" title="Performance Radar" action={<PillSelect value="Week" options={['Week']} />}>
          <RadarMetrics data={d.radar} />
          <div className="mt-1 flex items-center justify-center gap-4">
            <span className="flex items-center gap-1.5 text-caption text-text-secondary"><span className="h-2 w-2 rounded-full bg-primary" /> This period</span>
            <span className="flex items-center gap-1.5 text-caption text-text-secondary"><span className="h-2 w-2 rounded-full bg-text" /> Last period</span>
          </div>
        </SectionCard>
      </div>

      {/* ---- ROW 2 ---- */}
      <div className="grid grid-cols-12 gap-6">
        {/* Lab Effectiveness */}
        <SectionCard className="col-span-12 xl:col-span-5" title="Lab Effectiveness" action={<PillSelect value="This month" options={['This month']} />}>
          <div className="flex flex-wrap items-center gap-6">
            <OeeDonut value={d.effectiveness.oee} />
            <div className="grid flex-1 grid-cols-3 gap-x-4 gap-y-5" style={{ minWidth: 260 }}>
              <Stat value={`${d.effectiveness.onTime}%`} label="On-time" dot={BLUE} />
              <Stat value={`${d.effectiveness.authorization}%`} label="Authorization" dot={GREEN} />
              <Stat value={`${d.effectiveness.accuracy}%`} label="Accuracy" dot={BLUE} />
              <Stat value={d.effectiveness.specimensProcessed} label="Specimens" dot={BLUE} />
              <Stat value={d.effectiveness.reportsAuthorized} label="Authorized" dot={GREEN} />
              <Stat value={`${d.effectiveness.reopenRate}%`} label="Re-open rate" dot={RED} />
            </div>
          </div>
        </SectionCard>

        {/* Top Clients */}
        <SectionCard className="col-span-12 md:col-span-6 xl:col-span-4" title="Top Clients" action={<SeeAll onClick={() => router.push('/clients')} />}>
          <div className="flex flex-col gap-3">
            {d.topClients.length === 0 && <div className="py-6 text-center text-small text-text-tertiary">No client volume yet.</div>}
            {d.topClients.map((c: any, i: number) => (
              <div key={i} className="flex items-center gap-3 rounded-control border border-card p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-small font-semibold text-text">{c.name}</div>
                  <div className="truncate text-caption text-text-tertiary">{c.type || 'Referring client'} · {c.count} records</div>
                </div>
                <AvatarStack avatars={[{ name: c.name }, { name: c.type ?? 'Lab' }]} size={26} max={2} />
                <button onClick={() => router.push('/clients')} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><Plus size={16} /></button>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Activity */}
        <SectionCard className="col-span-12 md:col-span-6 xl:col-span-3" title="Activity" action={<button className="text-caption font-semibold text-text-tertiary hover:text-text">Clear all</button>}>
          <div className="flex flex-col gap-3">
            {d.activity.length === 0 && <div className="py-6 text-center text-small text-text-tertiary">No recent activity.</div>}
            {d.activity.map((a: any, i: number) => (
              <div key={i} className="flex items-start gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: dotFor(a.status) }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-small font-semibold text-text">{a.status} · {a.labNumber ?? '—'}</div>
                  <div className="truncate text-caption text-text-tertiary">{a.patient} · {ago(a.at)}</div>
                </div>
                <button className="shrink-0 text-text-tertiary hover:text-text"><MoreHorizontal size={16} /></button>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function SkeletonCard({ h }: { h: number }) {
  return (
    <div className="rounded-card border border-card bg-surface p-7 shadow-card" style={{ height: h }}>
      <Skeleton active paragraph={{ rows: 5 }} />
    </div>
  );
}
