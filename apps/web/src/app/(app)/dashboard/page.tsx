'use client';

import { useRouter } from 'next/navigation';
import { Skeleton } from 'antd';
import {
  Activity, ArrowUpRight, Calendar, CheckCircle2, ChevronDown, Clock, FlaskConical, Microscope, MoreHorizontal,
  Stethoscope, TestTube, TrendingUp, User,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { GlassCard } from '@/components/dashboard/glass-card';
import { HeroBanner, type HeroChip } from '@/components/dashboard/hero-banner';
import { NavPills } from '@/components/dashboard/nav-pills';
import { OeeDonut, ProgressRing, RadarMetrics, ThroughputComb } from './charts';

const GREEN = '#22c55e', BLUE = '#4F46E5';
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
  { bg: '#E0E7FF', fg: '#4338CA', Icon: Microscope },
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
function DatePill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-soft)] bg-white/70 px-3 py-1.5 text-xs font-semibold text-[var(--foreground)]">
      <Calendar size={14} className="text-[var(--muted-foreground)]" />
      {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
      <ChevronDown size={14} className="text-[var(--muted-foreground)]" />
    </span>
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

          {/* Specimen Throughput (left) + Performance Radar (right) — one divided card */}
          <GlassCard
            className="lg:col-span-2"
            title="Specimen Throughput"
            action={
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500 }}>30 days</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', fontFamily: 'Geist,sans-serif' }}>
                  {d.throughput.series?.reduce((s: number, i: any) => s + (i.value || 0), 0) || 0} total
                </div>
              </div>
            }
          >
            <div className="flex flex-col gap-6 lg:flex-row">
              <div className="min-w-0 flex-1">
                <div className="mt-1"><ThroughputComb data={d.throughput.series.map((s: any) => ({ ...s, capacity: 20 }))} height={220} /></div>

                {/* Lab Overview strip */}
                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 16, marginTop: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>Lab Overview</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {[
                      { label: 'On-time', value: `${eff.onTime ?? 0}%`, icon: <Clock size={14} /> },
                      { label: 'Authorized', value: `${eff.authorization ?? 0}%`, icon: <CheckCircle2 size={14} /> },
                      { label: 'Avg TAT', value: `${ov?.kpis?.avgTat ?? '—'}d`, icon: <Activity size={14} /> },
                    ].map(({ label, value, icon }) => (
                      <div key={label} style={{ textAlign: 'center', padding: '8px 4px', background: '#F8FAFC', borderRadius: 10, border: '1px solid #F1F5F9' }}>
                        <div style={{ color: '#4F46E5', marginBottom: 4, display: 'flex', justifyContent: 'center' }}>{icon}</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em', fontFamily: 'Geist,sans-serif' }}>{value}</div>
                        <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, marginTop: 2 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Specimen mix breakdown */}
                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 14, marginTop: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    {(() => {
                      const gyn = eff.specimensProcessed || 0;
                      const non = eff.reportsAuthorized || 0;
                      const urg = d.priorityRecords?.length || 0;
                      const tot = Math.max(gyn + non + urg, 1);
                      return [
                        { label: 'Gynecology', count: gyn, pct: Math.round((gyn / tot) * 100), color: '#4F46E5' },
                        { label: 'Non-Gynecology', count: non, pct: Math.round((non / tot) * 100), color: '#818CF8' },
                        { label: 'Urgent', count: urg, pct: Math.round((urg / tot) * 100), color: '#EF4444' },
                      ];
                    })().map(({ label, pct, count, color }) => (
                      <div key={label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: '#64748B', fontWeight: 500 }}>{label}</span>
                          <span style={{ fontSize: 11, color: '#0F172A', fontWeight: 700 }}>{pct}% / {count}</span>
                        </div>
                        <div style={{ height: 4, background: '#EEF2F7', borderRadius: 999 }}>
                          <div style={{ height: 4, borderRadius: 999, background: color, width: `${Math.min(pct, 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
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
              <div className="grid flex-1 grid-cols-3 gap-x-4 gap-y-5" style={{ minWidth: 260 }}>
                {[
                  { label: 'On-time', value: `${eff.onTime}%`, icon: '⏱' },
                  { label: 'Authorization', value: `${eff.authorization}%`, icon: '✓' },
                  { label: 'Accuracy', value: `${eff.accuracy}%`, icon: '◎' },
                  { label: 'Specimens', value: eff.specimensProcessed, icon: '⬡' },
                  { label: 'Reports', value: eff.reportsAuthorized, icon: '📋' },
                  { label: 'Re-open', value: `${eff.reopenRate}%`, icon: '↺' },
                ].map(({ label, value, icon }) => (
                  <div key={label} style={{ textAlign: 'center', padding: '8px 4px' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', border: '1.5px solid #E2E8F0', display: 'grid', placeItems: 'center', fontSize: 16, margin: '0 auto 6px', background: 'white' }}>{icon}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1, fontFamily: 'Geist,sans-serif' }}>{value}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 3, fontWeight: 500 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* Growth chip */}
            <div style={{ background: '#0F172A', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Growth</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: '-0.02em', fontFamily: 'Geist,sans-serif' }}>{d.throughput.deltaPct >= 0 ? '+' : ''}{d.throughput.deltaPct ?? 0}%</div>
              </div>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.1)', display: 'grid', placeItems: 'center', color: '#94A3B8' }}>
                <TrendingUp size={16} />
              </div>
            </div>
          </GlassCard>

          {/* Top Clients — no card background */}
          <GlassCard title="Top Clients" action={<SeeAll onClick={() => router.push('/clients')} />} style={{ background: 'transparent', backdropFilter: 'none', WebkitBackdropFilter: 'none', border: '1px solid transparent', boxShadow: 'none' }}>
            <div className="flex flex-col">
              {d.topClients.length === 0 && <div className="py-6 text-center text-xs text-[var(--muted-foreground)]">No client volume yet.</div>}
              {d.topClients.map((c: any, i: number) => {
                const maxCount = d.topClients[0]?.count ?? 1;
                const pct = Math.round((c.count / maxCount) * 100);
                const colors = ['#4F46E5', '#818CF8', '#A5B4FC', '#C7D2FE'];
                const initials = (c.name || '').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <div key={i} style={{ marginBottom: i < d.topClients.length - 1 ? 20 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: i === 0 ? '#EEF2FF' : i === 1 ? '#F0FDF4' : '#FFF1F2', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, color: i === 0 ? '#4F46E5' : i === 1 ? '#16A34A' : '#DC2626' }}>
                          {initials}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{c.name}</div>
                          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{c.count} records</div>
                        </div>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{pct}%</span>
                    </div>
                    <div style={{ height: 4, background: '#EEF2F7', borderRadius: 999 }}>
                      <div style={{ height: 4, borderRadius: 999, background: colors[i] || '#C7D2FE', width: `${pct}%`, transition: 'width 0.8s ease-out' }} />
                    </div>
                  </div>
                );
              })}
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
