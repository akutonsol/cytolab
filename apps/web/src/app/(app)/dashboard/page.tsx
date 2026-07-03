'use client';

import { useRouter } from 'next/navigation';
import { Skeleton } from 'antd';
import {
  Activity, ArrowUpRight, Calendar, CheckCircle2, ChevronDown, Clock, CreditCard, DollarSign, FlaskConical,
  Microscope, Monitor, MoreHorizontal, Plus, ShoppingBag, SlidersHorizontal, Smartphone, Stethoscope, Tablet,
  TestTube, TrendingUp, User,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { GlassCard } from '@/components/dashboard/glass-card';
import { HeroBanner, type HeroChip } from '@/components/dashboard/hero-banner';
import { NavPills } from '@/components/dashboard/nav-pills';
import { ConversionBars, RevenueArea, SubscriptionBars } from './charts';

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
          transformOrigin: '66% 20%',
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

        <div style={{ marginTop: 40 }} className="flex flex-col gap-5">
          {/* ═══ Top block ═══ */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
            {/* Monthly Subscription Revenue */}
            <GlassCard
              title="Monthly Subscription Revenue"
              action={
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500 }}>6 months</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', fontFamily: 'Geist,sans-serif' }}>$487K</div>
                </div>
              }
            >
              <SubscriptionBars height={250} />
              <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 20, marginTop: 14 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif', marginBottom: 18 }}>Practice Overview</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  {[
                    { icon: <DollarSign size={20} />, value: '$487.3k', label: 'Total Revenue' },
                    { icon: <ShoppingBag size={20} />, value: '8,547', label: 'Total Appointments' },
                    { icon: <CreditCard size={20} />, value: '$57.02', label: 'Avg Fee' },
                  ].map(({ icon, value, label }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{ width: 56, height: 56, borderRadius: '50%', border: '1.5px solid #E2E8F0', display: 'grid', placeItems: 'center', color: '#64748B', flexShrink: 0 }}>{icon}</span>
                      <div>
                        <div style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500 }}>{label}</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', fontFamily: 'Geist,sans-serif' }}>{value}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 8 }}>
                    {[
                      { label: 'Online Booking', v: '42% / $204.7K' },
                      { label: 'Partner Referrals', v: '31% / $151.3K' },
                      { label: 'Walk-in Patients', v: '27% / $131.3K' },
                    ].map(({ label, v }) => (
                      <div key={label}>
                        <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500 }}>{label}</div>
                        <div style={{ fontSize: 12, color: '#0F172A', fontWeight: 700 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', gap: 3 }}>
                    <div style={{ width: '42%', background: '#22C55E', borderRadius: 999 }} />
                    <div style={{ width: '31%', background: '#4F46E5', borderRadius: 999 }} />
                    <div style={{ width: '27%', background: '#0F172A', borderRadius: 999 }} />
                  </div>
                </div>
              </div>
            </GlassCard>

            {/* Right column */}
            <div className="flex flex-col gap-5">
              {/* Appointment Conversion Rate */}
              <GlassCard title="Appointment Conversion Rate">
                <div style={{ position: 'relative' }}>
                  <ConversionBars height={180} />
                  <div style={{ position: 'absolute', top: -4, right: 0, width: 148 }}>
                    <div style={{ background: 'white', borderRadius: 14, padding: '10px 12px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', border: '1px solid #EEF2F7' }}>
                      <div style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>New Patients</div>
                      <div style={{ height: 4, background: '#EEF2F7', borderRadius: 999, margin: '8px 0' }}><div style={{ width: '60%', height: 4, borderRadius: 999, background: '#4F46E5' }} /></div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>2,847</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 700, color: '#4F46E5', background: '#EEF2FF', borderRadius: 999, padding: '2px 6px' }}><TrendingUp size={10} />24%</span>
                      </div>
                    </div>
                    <div style={{ background: '#0F172A', borderRadius: 14, padding: '10px 12px', marginTop: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600 }}>Growth</span>
                        <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'grid', placeItems: 'center', color: '#94A3B8' }}><Clock size={12} /></span>
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: 'white', fontFamily: 'Geist,sans-serif', marginTop: 2 }}>+12%</div>
                    </div>
                  </div>
                </div>
              </GlassCard>

              {/* Access Platform Distribution */}
              <GlassCard title="Access Platform Distribution">
                <div className="flex flex-col gap-4">
                  {[
                    { Icon: Monitor, name: 'Hospital Admin Panel', sub: '2,847 consultation', pct: 58, color: '#4F46E5', bg: '#EEF2FF', fg: '#4F46E5' },
                    { Icon: Smartphone, name: 'Patient Mobile App', sub: '1,523 consultation', pct: 31, color: '#22C55E', bg: '#F0FDF4', fg: '#16A34A' },
                    { Icon: Tablet, name: 'Doctor Tablet Usage', sub: '542 consultation', pct: 11, color: '#14B8A6', bg: '#F0FDFA', fg: '#0D9488' },
                  ].map(({ Icon, name, sub, pct, color, bg, fg }) => (
                    <div key={name}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: 36, height: 36, borderRadius: 10, background: bg, color: fg, display: 'grid', placeItems: 'center' }}><Icon size={16} /></span>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{name}</div>
                            <div style={{ fontSize: 12, color: '#94A3B8' }}>{sub}</div>
                          </div>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>{pct}%</span>
                      </div>
                      <div style={{ height: 6, background: '#EEF2F7', borderRadius: 999 }}><div style={{ height: 6, borderRadius: 999, background: color, width: `${pct}%` }} /></div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </div>
          </div>

          {/* ═══ Bottom block ═══ */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2.3fr_1fr]">
            {/* Total Revenue */}
            <GlassCard
              title={
                <div>
                  <div style={{ fontSize: 14, color: '#64748B', fontWeight: 600 }}>Total Revenue</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
                    <span style={{ fontSize: 40, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', fontFamily: 'Geist,sans-serif' }}>$487,326</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12, fontWeight: 700, color: '#16A34A', background: '#F0FDF4', borderRadius: 999, padding: '3px 8px' }}><TrendingUp size={12} />8%</span>
                  </div>
                </div>
              }
              action={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', borderRadius: 10, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' }}><Calendar size={14} /> Monthly <ChevronDown size={14} /></button>
                  <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', borderRadius: 10, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>Filter <SlidersHorizontal size={14} /></button>
                  <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', borderRadius: 10, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>Add widget <Plus size={14} /></button>
                </div>
              }
            >
              <RevenueArea height={300} />
            </GlassCard>

            {/* Top Services */}
            <GlassCard title="Top Services">
              <div className="flex flex-col">
                {[
                  { name: 'Cardiology Consultation', value: '$12,847' },
                  { name: 'General Physician Visit', value: '$9,204' },
                  { name: 'Dermatology Screening', value: '$7,631' },
                  { name: 'Orthopedic Review', value: '$5,912' },
                ].map((s, i, arr) => (
                  <div key={s.name} style={{ padding: '14px 0', borderBottom: i < arr.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                    <div style={{ fontSize: 13, color: '#94A3B8', fontWeight: 500 }}>{s.name}</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', fontFamily: 'Geist,sans-serif', marginTop: 2 }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
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
