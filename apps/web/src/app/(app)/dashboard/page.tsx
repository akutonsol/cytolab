'use client';

import { useRouter } from 'next/navigation';
import { Skeleton } from 'antd';
import {
  ArrowUpRight, Calendar, ChevronDown, Clock, FlaskConical, Microscope, MoreHorizontal, Plus,
  Stethoscope, TestTube, TrendingDown, TrendingUp, User,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AvatarStack, PillSelect } from '@/components/ui';
import { GlassCard } from '@/components/dashboard/glass-card';
import { HeroBanner, type HeroChip } from '@/components/dashboard/hero-banner';
import { NavPills } from '@/components/dashboard/nav-pills';
import { OeeDonut, ProgressRing, RadarMetrics, ThroughputComb } from './charts';

const GREEN = '#22c55e', BLUE = '#4f7df9', PURPLE = '#8b5cf6';
// The page is transparent so it shows the layout's single shared canvas gradient
// (top bar + content are one continuous surface, no seam). The DNA PNG has a
// transparent background, so it overlays the gradient directly.

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

// Varied light icon chips (grey / sage / tan / blue-gray / lavender) with
// patient/cytology-appropriate icons, cycled per row.
const CHIPS = [
  { bg: '#eceef2', fg: '#5b6472', Icon: User },
  { bg: '#e3ead9', fg: '#5b6b47', Icon: TestTube },
  { bg: '#ece2d0', fg: '#8a734e', Icon: Microscope },
  { bg: '#dfe3ec', fg: '#5b6472', Icon: FlaskConical },
  { bg: '#e6e1f2', fg: '#6b5ca0', Icon: Stethoscope },
];

function SeeAll({ label = 'See all', onClick }: { label?: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
      style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)' }}
    >
      {label}
    </button>
  );
}
function IconBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return <button onClick={onClick} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--border-soft)] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]">{children}</button>;
}
function DatePill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-soft)] bg-white/70 px-3 py-1.5 text-xs font-semibold text-[var(--foreground)]">
      <Calendar size={14} className="text-[var(--muted-foreground)]" />
      {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
      <ChevronDown size={14} className="text-[var(--muted-foreground)]" />
    </span>
  );
}
function Stat({ value, label, dot }: { value: React.ReactNode; label: string; dot?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[30px] font-extrabold leading-none tracking-tight text-[var(--foreground)]">{value}</span>
      <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--muted-foreground)]">
        {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}{label}
      </span>
    </div>
  );
}

// Dominant DNA-helix backdrop flowing from the top-right. `background-blend-mode:
// multiply` knocks the white PNG background out against a full-cover copy of the
// canvas gradient — self-contained and seamless (avoids the transparent-hole
// artifact that next/image + mix-blend-mode leaves in this stack).
function DnaBackdrop() {
  return (
    <>
      {/* Animated helix layer — a transparent-background PNG overlaid on the shared
          gradient, slowly twisting/breathing (see .dna-drift). No blend/backdrop, so
          the gradient shows through around it. */}
      <div
        aria-hidden
        className="dna-drift"
        style={{
          position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
          backgroundImage: 'url(/dna-helix.png)',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right -20px top -30px',
          backgroundSize: '82% auto',
          transformOrigin: 'top right',
          maskImage: 'radial-gradient(80% 80% at 100% 0%, #000 36%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(80% 80% at 100% 0%, #000 36%, transparent 70%)',
        }}
      />
    </>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { claims } = useAuth();
  const { data: d, isLoading, isError } = useQuery({
    queryKey: ['dashboard-home'],
    queryFn: () => api.get('/analytics/home').then((r) => r.data),
  });
  // Hero data (greeting, featured specimen, TAT / pending / cases-today) lives on
  // the patients "today at a glance" overview endpoint.
  const { data: ov } = useQuery({
    queryKey: ['patients-overview'],
    queryFn: () => api.get('/patients/overview').then((r) => r.data),
  });

  if (isError) return <div className="p-2 text-sm text-text-secondary">Dashboard is unavailable right now.</div>;
  if (isLoading || !d) {
    return (
      <div className="dashboard-theme -m-4 md:-m-8" style={{ minHeight: '100vh', background: 'transparent', position: 'relative', overflow: 'hidden' }}>
        <DnaBackdrop />
        <div style={{ position: 'relative', zIndex: 1, padding: '36px 40px 40px' }}>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  const up = d.throughput.deltaPct >= 0;
  const eff = d.effectiveness;
  const emailName = (claims?.email ?? '').split('@')[0].split(/[._-]/)[0].replace(/[^a-z]/gi, '');
  const firstName = ov?.greeting?.firstName || (emailName ? emailName[0].toUpperCase() + emailName.slice(1) : 'there');

  const featured = ov?.featured
    ? { labNumber: ov.featured.labNumber, patient: ov.featured.patient, status: ov.featured.status }
    : null;

  const chips: HeroChip[] = [
    { label: 'Cases Today', value: ov?.today?.requisitionsToday ?? 0 },
    { label: 'Turnaround', value: `${ov?.kpis?.avgTat ?? 0}d` },
    { label: 'Pending Review', value: ov?.kpis?.pendingRequisitions ?? 0 },
    { label: 'On-time', value: `${eff.onTime ?? 0}%`, delta: `${up ? '+' : ''}${d.throughput.deltaPct}%` },
  ];

  return (
    <div className="dashboard-theme -m-4 md:-m-8" style={{ minHeight: '100vh', background: 'transparent', position: 'relative', overflow: 'hidden' }}>
      <DnaBackdrop />

      <div style={{ position: 'relative', zIndex: 1, padding: '36px 40px 40px' }}>
        <HeroBanner firstName={firstName} featured={featured} chips={chips} nav={<NavPills />} />

        <div style={{ marginTop: 48 }} className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Priority Queue — no card background (matches reference "Urgent Tasks") */}
          <GlassCard title="Priority Queue" action={<SeeAll onClick={() => router.push('/records')} />} style={{ background: 'transparent', backdropFilter: 'none', WebkitBackdropFilter: 'none', border: '1px solid transparent', boxShadow: 'none' }}>
            <div className="flex flex-col divide-y divide-[var(--border-soft)]">
              {d.priorityRecords.length === 0 && <div className="py-6 text-center text-xs text-[var(--muted-foreground)]">Nothing urgent — you&apos;re clear.</div>}
              {d.priorityRecords.slice(0, 4).map((r: any, i: number) => {
                const chip = CHIPS[i % CHIPS.length];
                return (
                  <div key={r.id} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl" style={{ background: chip.bg, color: chip.fg }}><chip.Icon size={22} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-bold text-[var(--foreground)]">{r.patient}</div>
                      <div className="mt-1 flex min-w-0 items-center gap-2">
                        <span className="shrink-0 rounded-full bg-[#1b1d21] px-2.5 py-1 text-[11px] font-semibold text-white">{dateShort(r.date)}</span>
                        <span className="truncate text-[13px] font-medium text-[var(--muted-foreground)]">{[r.client, r.labNumber].filter(Boolean).join(' · ')}</span>
                      </div>
                    </div>
                    <span className="hidden shrink-0 items-center gap-2 rounded-full bg-[#f1f2f5] py-1 pl-1 pr-3 shadow-[0_1px_2px_rgba(16,24,40,0.06)] sm:inline-flex">
                      <ProgressRing pct={r.progress} size={34} />
                      <span className="whitespace-nowrap text-[12px] font-semibold text-[#374151]">{r.progress}% completed</span>
                    </span>
                    <button onClick={() => router.push('/records')} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#eceef4] bg-white text-[#374151] shadow-[0_2px_6px_rgba(16,24,40,0.08)] transition-colors hover:text-black"><ArrowUpRight size={16} /></button>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          {/* Specimen Throughput (bar, left) + Performance Radar (right) — one divided card */}
          <GlassCard
            className="lg:col-span-2"
            title="Specimen Throughput"
            action={<div className="flex items-center gap-2"><PillSelect value="Week" options={['Week']} /><IconBtn onClick={() => router.push('/analytics')}><ArrowUpRight size={16} /></IconBtn></div>}
          >
            <div className="flex flex-col gap-6 lg:flex-row">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5">
                  <span className="text-[34px] font-extrabold leading-none tracking-tight text-[var(--foreground)]">{d.throughput.headlinePct}%</span>
                  <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold text-white" style={{ background: BLUE }}>
                    {up ? <TrendingUp size={15} /> : <TrendingDown size={15} />}{Math.abs(d.throughput.deltaPct)}%
                  </span>
                </div>
                <div className="mt-4"><ThroughputComb data={d.throughput.series} height={260} /></div>
              </div>
              <div className="hidden w-px shrink-0 bg-[var(--border-soft)] lg:block" />
              <div className="lg:w-[40%]">
                <RadarMetrics data={d.radar} height={260} />
                <div className="mt-1 flex items-center justify-center gap-6">
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-[var(--foreground)]"><span className="h-3 w-3 rounded-full" style={{ background: BLUE }} /> This period</span>
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-[var(--foreground)]"><span className="h-3 w-3 rounded-full" style={{ background: '#2b2d31' }} /> Last period</span>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Lab Effectiveness */}
          <GlassCard title="Lab Effectiveness" action={<DatePill />}>
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-6">
              <OeeDonut value={eff.oee} inner={eff.authorization} size={196} />
              <div className="grid flex-1 grid-cols-2 gap-x-5 gap-y-6" style={{ minWidth: 200 }}>
                <Stat value={`${eff.onTime}%`} label="On-time" dot={PURPLE} />
                <Stat value={`${eff.authorization}%`} label="Authorization" dot={BLUE} />
                <Stat value={`${eff.accuracy}%`} label="Accuracy" dot={PURPLE} />
                <Stat value={eff.specimensProcessed} label="Specimens" />
                <Stat value={eff.reportsAuthorized} label="Authorized" />
                <Stat value={`${eff.reopenRate}%`} label="Re-open Rate" />
              </div>
            </div>
          </GlassCard>

          {/* Top Clients — no card background */}
          <GlassCard title="Top Clients" action={<SeeAll onClick={() => router.push('/clients')} />} style={{ background: 'transparent', backdropFilter: 'none', WebkitBackdropFilter: 'none', border: '1px solid transparent', boxShadow: 'none' }}>
            <div className="flex flex-col gap-3">
              {d.topClients.length === 0 && <div className="py-6 text-center text-xs text-[var(--muted-foreground)]">No client volume yet.</div>}
              {d.topClients.slice(0, 3).map((c: any, i: number) => (
                <div key={i} className="flex items-center gap-3 rounded-2xl border border-[#edeef3] bg-white p-4 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[16px] font-bold text-[var(--foreground)]">{c.name}</div>
                    <div className="truncate text-[13px] font-medium text-[var(--muted-foreground)]">{c.type || 'Referring client — specimens & billing'}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-[13px] font-semibold text-[var(--muted-foreground)]">{c.count} records</span>
                    <AvatarStack avatars={[{ name: c.name }, { name: c.type ?? 'Lab' }, { name: 'Team' }]} size={26} max={3} />
                  </div>
                  <button onClick={() => router.push('/clients')} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#f0f1f4] text-[#5b6472] transition-colors hover:text-black"><Plus size={18} /></button>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Activity */}
          <GlassCard title="Activity" action={<SeeAll label="Clear all" />} style={{ background: '#e8e9f2', backdropFilter: 'none', WebkitBackdropFilter: 'none' }}>
            <div className="flex flex-col gap-3">
              {d.activity.length === 0 && <div className="py-6 text-center text-xs text-[var(--muted-foreground)]">No recent activity.</div>}
              {d.activity.slice(0, 3).map((a: any, i: number) => (
                <div key={i} className="flex items-start gap-3 rounded-2xl border border-[#edeef3] bg-white p-3.5 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-bold text-[var(--foreground)]">{a.status} · {a.labNumber ?? '—'}</span>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dotFor(a.status) }} />
                    </div>
                    <div className="truncate text-xs font-medium text-[var(--muted-foreground)]">{a.patient}</div>
                    <div className="mt-1.5 flex items-center gap-3 text-[11px] font-medium text-[var(--muted-foreground)]">
                      <span className="flex items-center gap-1"><Calendar size={13} /> {dateTime(a.at)}</span>
                      <span className="flex items-center gap-1"><Clock size={13} /> {relDay(a.at)}</span>
                    </div>
                  </div>
                  <button className="shrink-0 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"><MoreHorizontal size={18} /></button>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div style={{ background: '#ffffff', borderRadius: 24, border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 12px 40px -12px rgba(80,70,160,0.2)', padding: 24 }}>
      <Skeleton active paragraph={{ rows: 6 }} />
    </div>
  );
}
