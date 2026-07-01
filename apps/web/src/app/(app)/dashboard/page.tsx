'use client';

import { useRouter } from 'next/navigation';
import { Skeleton } from 'antd';
import {
  ArrowUpRight, Boxes, Calendar, ChevronDown, ClipboardCheck, Clock, FlaskConical, MoreHorizontal, Plus,
  TrendingDown, TrendingUp, Truck, Wrench,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AvatarStack, PillSelect, SectionCard } from '@/components/ui';
import { OeeDonut, ProgressRing, RadarMetrics, ThroughputComb } from './charts';

const GREEN = '#22c55e', BLUE = '#4f7df9', GRAY = '#9ca3af';
// Subtle card gradient so surfaces aren't flat white.
const CARD = 'bg-gradient-to-b from-white to-[#f6f8fe]';

const relDay = (d: string) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
const dateShort = (d: string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const dateTime = (d: string) => new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const dotFor = (status: string) =>
  ['Approved', 'Completed', 'Paid', 'Billed'].includes(status) ? GREEN
    : ['Deauthorized', 'Failed', 'Disabled'].includes(status) ? '#ef4444' : BLUE;

// Varied icon chips (kept from the reference — navy / sage / tan / blue-gray / lavender), cycled per row.
const CHIPS = [
  { bg: '#1f2937', fg: '#ffffff', Icon: Wrench },
  { bg: '#e3ead9', fg: '#5b6b47', Icon: ClipboardCheck },
  { bg: '#ece2d0', fg: '#8a734e', Icon: Boxes },
  { bg: '#dfe3ec', fg: '#5b6472', Icon: FlaskConical },
  { bg: '#e6e1f2', fg: '#6b5ca0', Icon: Truck },
];

function SeeAll({ label = 'See all', onClick }: { label?: string; onClick?: () => void }) {
  return <button onClick={onClick} className="text-small font-semibold text-text-tertiary hover:text-text">{label}</button>;
}
function IconBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return <button onClick={onClick} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-card text-text-secondary transition-colors hover:text-text">{children}</button>;
}
function DatePill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill border border-card bg-surface px-3 py-1.5 text-small font-semibold text-text">
      <Calendar size={14} className="text-text-tertiary" />
      {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
      <ChevronDown size={14} className="text-text-tertiary" />
    </span>
  );
}
function Stat({ value, label, dot }: { value: React.ReactNode; label: string; dot?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-h3 font-bold leading-tight text-text">{value}</span>
      <span className="flex items-center gap-1.5 text-small text-text-tertiary">
        {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}{label}
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
        {['xl:col-span-4', 'xl:col-span-8', 'xl:col-span-4', 'xl:col-span-4', 'xl:col-span-4'].map((s, i) => (
          <div key={i} className={`col-span-12 ${s}`}><SkeletonCard h={i < 2 ? 380 : 520} /></div>
        ))}
      </div>
    );
  }

  const up = d.throughput.deltaPct >= 0;
  const eff = d.effectiveness;

  return (
    <div className="flex flex-col gap-6">
      {/* ---- ROW 1 (equal height) ---- */}
      <div className="grid grid-cols-12 gap-6">
        {/* Urgent Tasks / Priority Queue */}
        <SectionCard className={`col-span-12 xl:col-span-4 ${CARD}`} bodyClassName="flex flex-1 flex-col"
          title="Priority Queue" action={<SeeAll onClick={() => router.push('/records')} />}>
          <div className="flex flex-1 flex-col divide-y divide-border">
            {d.priorityRecords.length === 0 && <div className="py-6 text-center text-small text-text-tertiary">Nothing urgent — you&apos;re clear.</div>}
            {d.priorityRecords.map((r: any, i: number) => {
              const chip = CHIPS[i % CHIPS.length];
              return (
                <div key={r.id} className="flex flex-1 items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-control" style={{ background: chip.bg, color: chip.fg }}><chip.Icon size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold text-text">{r.patient}</div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                      <span className="shrink-0 rounded-pill bg-[#eef1f7] px-2 py-0.5 text-caption font-medium text-text-secondary">{dateShort(r.date)}</span>
                      <span className="truncate text-small text-text-tertiary">{[r.client, r.labNumber].filter(Boolean).join(' · ')}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <ProgressRing pct={r.progress} />
                    <span className="hidden whitespace-nowrap text-small text-text-secondary sm:inline">{r.progress}% completed</span>
                  </div>
                  <IconBtn onClick={() => router.push('/records')}><ArrowUpRight size={16} /></IconBtn>
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* Production Efficiency + Radar (one card) */}
        <section className={`col-span-12 flex flex-col rounded-card border border-card shadow-card xl:col-span-8 ${CARD}`}>
          <div className="flex flex-1 flex-col md:flex-row">
            {/* Left: throughput */}
            <div className="flex min-w-0 flex-1 flex-col p-7">
              <h2 className="text-section text-text">Specimen Throughput</h2>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-h1 font-extrabold tracking-tight text-text">{d.throughput.headlinePct}%</span>
                <span className="flex items-center gap-1 rounded-pill bg-primary-soft px-2 py-0.5 text-small font-semibold text-primary">
                  {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{Math.abs(d.throughput.deltaPct)}%
                </span>
              </div>
              <div className="mt-4 flex-1"><ThroughputComb data={d.throughput.series} /></div>
            </div>
            {/* Right: radar */}
            <div className="flex flex-col border-t border-card p-5 md:w-[40%] md:border-l md:border-t-0">
              <div className="mb-1 flex items-center justify-end gap-2">
                <PillSelect value="Week" options={['Week']} />
                <IconBtn onClick={() => router.push('/analytics')}><ArrowUpRight size={16} /></IconBtn>
              </div>
              <div className="flex-1"><RadarMetrics data={d.radar} /></div>
              <div className="mt-1 flex items-center justify-center gap-4">
                <span className="flex items-center gap-1.5 text-small text-text-secondary"><span className="h-2.5 w-2.5 rounded-full bg-primary" /> This period</span>
                <span className="flex items-center gap-1.5 text-small text-text-secondary"><span className="h-2.5 w-2.5 rounded-full bg-text" /> Last period</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ---- ROW 2 (equal height) ---- */}
      <div className="grid grid-cols-12 gap-6">
        {/* Operational Effectiveness */}
        <SectionCard className={`col-span-12 xl:col-span-4 ${CARD}`} bodyClassName="flex flex-1 flex-col justify-center"
          title={<>Lab<br />Effectiveness</>} action={<DatePill />}>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-6">
            <OeeDonut value={eff.oee} inner={eff.authorization} />
            <div className="grid flex-1 grid-cols-3 gap-x-5 gap-y-7" style={{ minWidth: 240 }}>
              <Stat value={`${eff.onTime}%`} label="On-time" dot={GRAY} />
              <Stat value={`${eff.authorization}%`} label="Authorization" dot={BLUE} />
              <Stat value={`${eff.accuracy}%`} label="Accuracy" dot="#d4d9e2" />
              <Stat value={eff.specimensProcessed} label="Specimens Processed" />
              <Stat value={eff.reportsAuthorized} label="Reports Authorized" />
              <Stat value={`${eff.reopenRate}%`} label="Re-open Rate" />
            </div>
          </div>
        </SectionCard>

        {/* Key Teams / Top Clients */}
        <SectionCard className={`col-span-12 md:col-span-6 xl:col-span-4 ${CARD}`} bodyClassName="flex flex-1 flex-col"
          title="Top Clients" action={<SeeAll onClick={() => router.push('/clients')} />}>
          <div className="flex flex-1 flex-col justify-between gap-3">
            {d.topClients.length === 0 && <div className="py-6 text-center text-small text-text-tertiary">No client volume yet.</div>}
            {d.topClients.map((c: any, i: number) => (
              <div key={i} className="flex flex-1 items-center gap-3 rounded-control border border-card bg-white/60 p-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold text-text">{c.name}</div>
                  <div className="truncate text-small text-text-tertiary">{c.type || 'Referring client — specimens & billing'}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-small font-medium text-text-secondary">{c.count} records</span>
                  <AvatarStack avatars={[{ name: c.name }, { name: c.type ?? 'Lab' }, { name: 'Team' }]} size={24} max={3} />
                </div>
                <button onClick={() => router.push('/clients')} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-card text-text-secondary hover:text-text"><Plus size={17} /></button>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Updates / Activity */}
        <SectionCard className={`col-span-12 md:col-span-6 xl:col-span-4 ${CARD}`} bodyClassName="flex flex-1 flex-col"
          title="Activity" action={<SeeAll label="Clear all" />}>
          <div className="flex flex-1 flex-col justify-between divide-y divide-border">
            {d.activity.length === 0 && <div className="py-6 text-center text-small text-text-tertiary">No recent activity.</div>}
            {d.activity.slice(0, 4).map((a: any, i: number) => (
              <div key={i} className="flex flex-1 items-start gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold text-text">{a.status} · {a.labNumber ?? '—'}</span>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dotFor(a.status) }} />
                  </div>
                  <div className="truncate text-small text-text-tertiary">{a.patient}</div>
                  <div className="mt-1.5 flex items-center gap-3 text-caption text-text-tertiary">
                    <span className="flex items-center gap-1"><Calendar size={13} /> {dateTime(a.at)}</span>
                    <span className="flex items-center gap-1"><Clock size={13} /> {relDay(a.at)}</span>
                  </div>
                </div>
                <button className="shrink-0 text-text-tertiary hover:text-text"><MoreHorizontal size={18} /></button>
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
    <div className={`rounded-card border border-card p-7 shadow-card ${CARD}`} style={{ height: h }}>
      <Skeleton active paragraph={{ rows: 6 }} />
    </div>
  );
}
