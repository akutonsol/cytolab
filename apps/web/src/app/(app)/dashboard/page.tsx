'use client';

import { useRouter } from 'next/navigation';
import { Skeleton } from 'antd';
import {
  Activity, ArrowRight, ArrowUpRight, Calendar, CheckCircle2, ChevronDown, Clock, CreditCard, DollarSign, FileCheck, FileText, FlaskConical,
  Folder, Hourglass, Microscope, Monitor, MoreHorizontal, Plus, RotateCw, ShieldCheck, ShoppingBag, SlidersHorizontal, Smartphone, Stethoscope, Tablet,
  TestTube, TrendingUp, User, Users,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { GlassCard } from '@/components/dashboard/glass-card';
import { HeroBanner, type HeroChip } from '@/components/dashboard/hero-banner';
import { NavPills } from '@/components/dashboard/nav-pills';
import { PerformanceArea, SubscriptionBars } from './charts';

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

// Case distribution by specimen class (violet family, zero-orange).
const specimenTypes = [
  { label: 'Body Fluid', color: '#6366F1', pct: 42 },
  { label: 'Respiratory', color: '#8B5CF6', pct: 28 },
  { label: 'Urine', color: '#A78BFA', pct: 16 },
  { label: 'CSF', color: '#C4B5FD', pct: 8 },
  { label: 'Other', color: '#E0E7FF', pct: 6 },
];

// ── Specimen icon library: SVG cell-clusters coloured per specimen class ──────
// Reusable, transparent, crisp — no raster assets. Zero-orange (FNA/body-fluid
// map to teal/violet instead of the reference's amber suggestions).
const SPECIMEN_PALETTE: Record<string, { bg: string; cells: string[]; nucleus: string }> = {
  gyn: { bg: '#DCFCE7', cells: ['#86EFAC', '#4ADE80', '#22C55E'], nucleus: '#15803D' },
  urine: { bg: '#FFE4E6', cells: ['#FDA4AF', '#FB7185', '#F43F5E'], nucleus: '#BE123C' },
  csf: { bg: '#E0F2FE', cells: ['#7DD3FC', '#38BDF8', '#0EA5E9'], nucleus: '#0369A1' },
  fluid: { bg: '#EDE9FE', cells: ['#C4B5FD', '#A78BFA', '#8B5CF6'], nucleus: '#6D28D9' },
  fna: { bg: '#CCFBF1', cells: ['#5EEAD4', '#2DD4BF', '#14B8A6'], nucleus: '#0F766E' },
  resp: { bg: '#DBEAFE', cells: ['#93C5FD', '#60A5FA', '#3B82F6'], nucleus: '#1D4ED8' },
  indigo: { bg: '#E0E7FF', cells: ['#A5B4FC', '#818CF8', '#6366F1'], nucleus: '#4338CA' },
};
const paletteFor = (type?: string | null) => {
  const t = type ?? '';
  if (['CERV_SCRAP', 'ENDOCERV_ASP', 'VAG_POOL'].includes(t)) return SPECIMEN_PALETTE.gyn;
  if (t === 'URINE') return SPECIMEN_PALETTE.urine;
  if (t === 'CSF') return SPECIMEN_PALETTE.csf;
  if (['PLEURAL_FLD', 'SYNOVIAL_FLD', 'JOINT_ASP', 'OTHER'].includes(t)) return SPECIMEN_PALETTE.fluid;
  if (['BREAST_ASP', 'THYROID_FNA', 'LYMPH_NODE', 'BONE_MARROW'].includes(t)) return SPECIMEN_PALETTE.fna;
  if (['SPUTUM', 'BRONCHIAL_WASH'].includes(t)) return SPECIMEN_PALETTE.resp;
  return SPECIMEN_PALETTE.indigo;
};
const SPECIMEN_CELLS = [
  { x: 50, y: 48, r: 16 }, { x: 31, y: 37, r: 9 }, { x: 68, y: 35, r: 10 },
  { x: 71, y: 61, r: 8 }, { x: 37, y: 65, r: 9 }, { x: 56, y: 70, r: 7 },
  { x: 23, y: 55, r: 6 }, { x: 47, y: 25, r: 6 }, { x: 80, y: 49, r: 5 },
  { x: 61, y: 19, r: 4 }, { x: 21, y: 31, r: 4 }, { x: 76, y: 75, r: 4 },
];
function SpecimenIcon({ type, size = 44 }: { type?: string | null; size?: number }) {
  const p = paletteFor(type);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ borderRadius: 12, background: p.bg, flexShrink: 0 }}>
      {SPECIMEN_CELLS.map((c, i) => (
        <g key={i}>
          <circle cx={c.x} cy={c.y} r={c.r} fill={p.cells[i % p.cells.length]} opacity={0.9} />
          <circle cx={c.x} cy={c.y} r={c.r * 0.42} fill={p.nucleus} opacity={0.92} />
        </g>
      ))}
    </svg>
  );
}

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
  const kpis = ov?.kpis;
  const totalSpecimens = d.throughput.series?.reduce((s: any, i: any) => s + (i.value || 0), 0) || 0;
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
          {/* ═══ SECTION 1: KPI STRIP ═══ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 16 }}>
            {[
              { solid: true, bg: '#DD7B6B', icon: <TestTube size={24} color="#8B2C1E" />, label: 'ACTIVE SPECIMENS', value: totalSpecimens || 0, delta: `+${d.throughput.series?.slice(-1)[0]?.value || 0} today` },
              { bg: '#FBE9DB', label: 'CASES TODAY', value: d.throughput.series?.slice(-1)[0]?.value || 0, delta: `+${d.throughput.series?.slice(-7).reduce((s: any, i: any) => s + (i.value > 0 ? 1 : 0), 0) || 0} this week`, deltaColor: '#B06A4E' },
              { bg: '#ECE7F6', label: 'TURNAROUND TIME', value: `${kpis?.avgTat ?? '—'}d`, delta: (kpis?.avgTat ?? 99) <= 3 ? '-0.3d improvement' : '+0.3d slower', deltaColor: (kpis?.avgTat ?? 99) <= 3 ? '#6D5BC0' : '#EF4444' },
              { bg: '#E6E9F5', label: 'PENDING REVIEW', value: kpis?.pendingRequisitions || 0, delta: `High priority: ${d.priorityRecords?.filter((r: any) => r.urgent).length || 0}`, deltaColor: '#5B69C4' },
              { bg: '#EAE6F9', label: 'AI CONFIDENCE', value: `${eff?.authorization ?? 92}%`, delta: '+4% vs yesterday', deltaColor: '#7C5FD3' },
            ].map((c: any, i: number) => c.solid ? (
              <div key={i} style={{ background: c.bg, borderRadius: 16, padding: '18px 20px', boxShadow: '0 6px 20px rgba(200,90,70,0.18)', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: 13, background: 'rgba(255,255,255,0.28)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{c.icon}</div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#5A241B', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{c.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#3D160F', letterSpacing: '-0.02em', lineHeight: 1, fontFamily: 'Geist,sans-serif' }}>{c.value}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(90,36,27,0.72)', marginTop: 4 }}>{c.delta}</div>
                </div>
              </div>
            ) : (
              <div key={i} style={{ background: c.bg, borderRadius: 16, padding: '20px 22px', boxShadow: '0 4px 20px rgba(80,70,120,0.06)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#8B8FA3', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>{c.label}</div>
                <div style={{ fontSize: 30, fontWeight: 800, color: '#1E1B33', letterSpacing: '-0.02em', lineHeight: 1, fontFamily: 'Geist,sans-serif' }}>{c.value}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: c.deltaColor, marginTop: 8 }}>{c.delta}</div>
              </div>
            ))}
          </div>

          {/* ═══ SECTION 2: MAIN 3-COLUMN GRID ═══ */}
          <div style={{ display: 'grid', gridTemplateColumns: '400px minmax(0,1fr) 400px', gap: 20, alignItems: 'stretch' }}>
            {/* LEFT: Specimen Queue */}
            <div style={{ height: 540, background: 'white', borderRadius: 20, padding: '20px', border: '1px solid #EEF2F7', boxShadow: '0 4px 24px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>Specimen Queue</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 999, padding: '4px 10px', cursor: 'pointer' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>All Types</span>
                  <ChevronDown size={12} color="#94A3B8" />
                </div>
              </div>
              <div className="premium-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {(d.priorityRecords || []).slice(0, 6).map((r: any, i: number) => {
                  const isFirst = i === 0;
                  return (
                    <div key={r.id} onClick={() => router.push(`/records/${r.id}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, cursor: 'pointer', background: isFirst ? '#F0F0FF' : 'transparent', border: isFirst ? '1px solid #C7D2FE' : '1px solid transparent', transition: 'all 0.15s' }}
                      onMouseEnter={(e) => { if (!isFirst) (e.currentTarget as HTMLDivElement).style.background = '#F8FAFC'; }}
                      onMouseLeave={(e) => { if (!isFirst) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}>
                      <SpecimenIcon type={r.specimen} size={44} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>{r.labNumber ?? '—'}</span>
                          {r.urgent && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: '#4F46E5', background: '#EEF2FF', borderRadius: 999, padding: '2px 8px' }}>High Priority</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.specimen?.replace(/_/g, '.') ?? '—'}{r.patient ? ` · ${r.patient}` : ''}
                        </div>
                        <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>
                          Received {new Date(r.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      {isFirst
                        ? <ArrowRight size={16} color="#4F46E5" style={{ flexShrink: 0 }} />
                        : <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: dotFor(r.status) }} />}
                    </div>
                  );
                })}
              </div>
              <button onClick={() => router.push('/records')} style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: '#4F46E5', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0' }}>
                View all specimens <ArrowUpRight size={14} />
              </button>
            </div>

            {/* CENTER: AI Cytology Model */}
            <div style={{ height: 540, background: 'linear-gradient(135deg,#F8F9FF 0%,#EEF0FF 100%)', borderRadius: 20, border: '1px solid #E0E7FF', boxShadow: '0 4px 24px rgba(79,70,229,0.08)', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* Header (overlays the stage so the head can fill the panel) */}
              <div style={{ padding: '20px 24px 0', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 4 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>AI Cytology Model</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, background: '#DCFCE7', borderRadius: 999, padding: '4px 11px' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 6px rgba(34,197,94,0.6)' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#16A34A' }}>Live Analysis</span>
                </div>
              </div>

              {/* Analysis stage — head fills the panel, scalp near the top */}
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                <div style={{ position: 'relative', width: 760, height: 520, maxWidth: '100%', overflow: 'hidden' }}>
                  {(() => {
                    const markers = [
                      { x: 330, y: 96, color: '#6366F1' },
                      { x: 128, y: 268, color: '#3B82F6' },
                      { x: 352, y: 290, color: '#8B5CF6' },
                      { x: 262, y: 458, color: '#8B5CF6' },
                    ];
                    const findings = [
                      { label: 'Reactive Mesothelial Cells', conf: 96, color: '#6366F1', y: 100, attention: false },
                      { label: 'Inflammatory Cells', conf: 89, color: '#3B82F6', y: 214, attention: false },
                      { label: 'Atypical Cells', conf: 72, color: '#8B5CF6', y: 314, attention: true },
                      { label: 'Background Debris', conf: 94, color: '#6366F1', y: 452, attention: false },
                    ];
                    const LX = 500; // label dot x
                    return (
                      <>
                        {/* dotted connectors marker → label */}
                        <svg width="760" height="520" viewBox="0 0 760 520" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
                          {markers.map((m, i) => (
                            <line key={i} x1={m.x} y1={m.y} x2={LX} y2={findings[i].y} stroke="#C7D2FE" strokeWidth={1.5} strokeDasharray="2 5" />
                          ))}
                        </svg>
                        {/* aura */}
                        <div style={{ position: 'absolute', left: -90, top: -30, width: 680, height: 660, background: 'radial-gradient(44% 44% at 47% 44%, rgba(255,255,255,0.92), rgba(139,92,246,0.16) 46%, rgba(99,102,241,0.06) 62%, transparent 74%)', filter: 'blur(4px)', zIndex: 0 }} />
                        {/* glowing base platform */}
                        <div style={{ position: 'absolute', left: 70, top: 468, width: 370, height: 60, borderRadius: '50%', background: 'radial-gradient(50% 50% at 50% 50%, rgba(255,255,255,0.95), rgba(167,139,250,0.38) 45%, rgba(139,92,246,0.08) 68%, transparent 78%)', filter: 'blur(1px)', zIndex: 1 }} />
                        {/* head — box matches the image's 1.5 aspect (no letterbox); scalp near top */}
                        <img src="/ai-man.png" alt="AI Cytology Model" className="ai-breathe"
                          style={{ position: 'absolute', left: -167, top: -18, width: 833, height: 555, objectFit: 'contain', objectPosition: 'center', filter: 'brightness(1.52) contrast(1.14) saturate(0.35) drop-shadow(0 18px 40px rgba(99,102,241,0.3))', zIndex: 2 }} />
                        {/* glossy white top-light to mimic the reference render */}
                        <div style={{ position: 'absolute', left: 80, top: 20, width: 360, height: 340, background: 'radial-gradient(46% 42% at 50% 26%, rgba(255,255,255,0.55), rgba(255,255,255,0.12) 46%, transparent 66%)', mixBlendMode: 'screen', pointerEvents: 'none', zIndex: 2 }} />
                        {/* target markers (soft halo + ring + center) */}
                        {markers.map((m, i) => (
                          <div key={i} style={{ position: 'absolute', left: m.x, top: m.y, transform: 'translate(-50%,-50%)', zIndex: 3, width: 48, height: 48, borderRadius: '50%', display: 'grid', placeItems: 'center', background: `radial-gradient(50% 50% at 50% 50%, ${m.color}33, transparent 70%)` }}>
                            <div className="ai-pulse" style={{ width: 28, height: 28, borderRadius: '50%', background: 'white', border: `2px solid ${m.color}`, boxShadow: `0 0 10px ${m.color}66`, display: 'grid', placeItems: 'center' }}>
                              <div style={{ width: 10, height: 10, borderRadius: '50%', background: m.color }} />
                            </div>
                          </div>
                        ))}
                        {/* findings labels (plain, connected) */}
                        {findings.map((f, i) => (
                          <div key={i} style={{ position: 'absolute', left: LX, top: f.y, transform: 'translateY(-50%)', width: 210, zIndex: 3 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                              <div style={{ width: 10, height: 10, borderRadius: '50%', background: f.color, flexShrink: 0 }} />
                              <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{f.label}</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#94A3B8', marginLeft: 19, marginTop: 2 }}>Confidence {f.conf}%</div>
                            {f.attention && (
                              <div style={{ marginLeft: 19, marginTop: 5 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', background: '#FEF2F2', borderRadius: 6, padding: '2px 8px' }}>+ Attention</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Rotate Model pill */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 24px 22px', display: 'flex', justifyContent: 'center', zIndex: 4 }}>
                <button onClick={() => router.push(`/records/${d.priorityRecords?.[0]?.id ?? ''}`)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #EEF2F7', boxShadow: '0 6px 18px rgba(79,70,229,0.10)', borderRadius: 999, padding: '11px 24px', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#4F46E5', fontFamily: 'Geist,sans-serif' }}>
                  <RotateCw size={15} /> Rotate Model <ArrowRight size={15} />
                </button>
              </div>
            </div>

            {/* RIGHT: AI Findings */}
            <div className="premium-scroll" style={{ height: 540, background: 'white', borderRadius: 20, padding: '20px', border: '1px solid #EEF2F7', boxShadow: '0 4px 24px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>AI Findings</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#4F46E5', fontFamily: 'Geist,sans-serif' }}>{d.priorityRecords?.[0]?.labNumber ?? '—'}</span>
              </div>

              {/* Interpretation */}
              <div style={{ background: '#F4F4FB', borderRadius: 16, padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#64748B' }}>Interpretation</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#4F46E5', background: '#EEF2FF', borderRadius: 999, padding: '3px 10px' }}>High Confidence</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', fontFamily: 'Geist,sans-serif', letterSpacing: '-0.02em', marginBottom: 4 }}>
                  {d.priorityRecords?.[0]?.urgent ? 'Atypical Cells Detected' : 'Specimen Under Review'}
                </div>
                <div style={{ fontSize: 14, color: '#64748B' }}>
                  {d.priorityRecords?.[0]?.urgent ? 'Suspicious for malignancy.' : 'Awaiting cytological analysis.'}
                </div>
              </div>

              {/* Key Observations */}
              <div style={{ background: '#FAFAFE', borderRadius: 16, padding: '16px 18px' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif', marginBottom: 12 }}>Key Observations</div>
                {[
                  {
                    label: 'Cellularity', value: 'Moderate to high',
                    icon: (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="#4F46E5">
                        <circle cx="8" cy="7" r="1.6" /><circle cx="13" cy="6" r="1.6" /><circle cx="17" cy="9" r="1.6" />
                        <circle cx="7" cy="12" r="1.6" /><circle cx="12" cy="11" r="2.1" /><circle cx="16.5" cy="14" r="1.6" />
                        <circle cx="9" cy="16" r="1.6" /><circle cx="13.5" cy="17" r="1.6" />
                      </svg>
                    ),
                  },
                  {
                    label: 'Cell Type', value: 'Atypical mesothelial cells',
                    icon: (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2">
                        <circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2.6" fill="#4F46E5" stroke="none" />
                      </svg>
                    ),
                  },
                  {
                    label: 'Background', value: 'Inflammation present',
                    icon: (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="#4F46E5">
                        {[6, 12, 18].map((y) => [6, 12, 18].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.7" />))}
                      </svg>
                    ),
                  },
                  {
                    label: 'Additional Notes', value: 'Recommend IHC panel',
                    icon: (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><polyline points="14 3 14 8 19 8" />
                        <line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="16.5" x2="13" y2="16.5" />
                      </svg>
                    ),
                  },
                ].map(({ icon, label, value }, i, arr) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', borderBottom: i < arr.length - 1 ? '1px solid #EEF0F6' : 'none' }}>
                    <div style={{ width: 46, height: 46, borderRadius: 13, background: '#EEF2FF', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{icon}</div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{label}</div>
                      <div style={{ fontSize: 14, color: '#64748B', marginTop: 2 }}>{value}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTAs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto' }}>
                <button onClick={() => router.push(`/records/${d.priorityRecords?.[0]?.id ?? ''}`)} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg,#4F46E5 0%,#6D28D9 100%)', color: 'white', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'Geist,sans-serif', boxShadow: '0 8px 20px rgba(79,70,229,0.28)' }}>
                  View Full Report <ArrowRight size={16} />
                </button>
                <button onClick={() => router.push('/authorizer')} style={{ width: '100%', padding: '13px', background: '#EEF0FB', color: '#4F46E5', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'Geist,sans-serif' }}>
                  Add to Pathologist Review <Users size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* ═══ SECTION 3: BOTTOM ROW ═══ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
            {/* Monthly Case Volume */}
            <div style={{ background: 'white', borderRadius: 20, padding: '20px 24px', border: '1px solid #EEF2F7', boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>Monthly Case Volume</span>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 999, padding: '3px 10px', cursor: 'pointer' }}>6 Months ▾</div>
              </div>
              <SubscriptionBars data={(() => {
                const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const now = new Date();
                const series = d.throughput.series ?? [];
                const chunk = Math.max(1, Math.ceil(series.length / 6));
                const rows = Array.from({ length: 6 }, (_, i) => {
                  const dt = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
                  const current = series.slice(i * chunk, (i + 1) * chunk).reduce((s: any, r: any) => s + (r.value || 0), 0);
                  return { month: MONTHS[dt.getMonth()], current, gap: 0 };
                });
                const maxC = Math.max(1, ...rows.map((r) => r.current));
                const target = Math.round(maxC * 1.3);
                rows.forEach((r) => { r.gap = Math.max(0, target - r.current); });
                return rows;
              })()} />
            </div>

            {/* Case Distribution by Type */}
            <div style={{ background: 'white', borderRadius: 20, padding: '20px 24px', border: '1px solid #EEF2F7', boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif', marginBottom: 16 }}>Case Distribution by Type</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
                  <svg viewBox="0 0 120 120" width="120" height="120">
                    {specimenTypes.reduce((acc: any, { pct, color }, i) => {
                      const prev = acc.offset;
                      const circ = 2 * Math.PI * 46;
                      const dash = (pct / 100) * circ;
                      const gap = 2;
                      acc.elements.push(
                        <circle key={i} cx="60" cy="60" r="46" fill="none" stroke={color} strokeWidth="14"
                          strokeDasharray={`${dash - gap} ${circ - (dash - gap)}`}
                          strokeDashoffset={-(prev * (circ / 100))}
                          transform="rotate(-90 60 60)" />
                      );
                      acc.offset += pct;
                      return acc;
                    }, { offset: 0, elements: [] as any[] }).elements}
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', fontFamily: 'Geist,sans-serif', lineHeight: 1 }}>{totalSpecimens || 0}</div>
                    <div style={{ fontSize: 9, color: '#94A3B8', fontWeight: 600, textAlign: 'center', marginTop: 2 }}>Total Cases</div>
                  </div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {specimenTypes.map(({ label, color, pct }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>{label}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* AI Performance */}
            <div style={{ background: 'white', borderRadius: 20, padding: '20px 24px', border: '1px solid #EEF2F7', boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>AI Performance</span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#4F46E5', fontFamily: 'Geist,sans-serif', lineHeight: 1.1 }}>{eff?.authorization ?? 92}%</div>
                  <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>Accuracy</div>
                </div>
              </div>
              <PerformanceArea />
            </div>

            {/* Recent Activity */}
            <div style={{ background: 'white', borderRadius: 20, padding: '20px', border: '1px solid #EEF2F7', boxShadow: '0 4px 24px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>Recent Activity</span>
                <button onClick={() => router.push('/records')} style={{ fontSize: 12, fontWeight: 600, color: '#4F46E5', background: 'none', border: 'none', cursor: 'pointer' }}>View all</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                {(d.activity || []).slice(0, 5).map((a: any, i: number, arr: any[]) => {
                  const meta = activityMeta(a.status);
                  const Icon = meta.Icon;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < arr.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 11, background: '#EEF2FF', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        <Icon size={17} color="#4F46E5" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta.title}</div>
                        {a.labNumber && <div style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500, marginTop: 2 }}>{a.labNumber}</div>}
                      </div>
                      <div style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500, flexShrink: 0 }}>{new Date(a.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function activityMeta(status: string): { title: string; Icon: typeof Activity } {
  const s = (status || '').toLowerCase();
  if (/(submit|receiv|regist|accession)/.test(s)) return { title: 'New specimen received', Icon: FileText };
  if (/(process|progress|screen)/.test(s)) return { title: 'Processing started', Icon: FlaskConical };
  if (/(result|complet|analys)/.test(s)) return { title: 'Analysis completed', Icon: CheckCircle2 };
  if (/(approv|authoriz|final|report|sign)/.test(s)) return { title: 'Report finalized', Icon: FileCheck };
  if (/(bill|invoic|paid|charge)/.test(s)) return { title: 'Invoice billed', Icon: FileText };
  return { title: status || 'Activity', Icon: Activity };
}

function SkeletonCard() {
  return (
    <div style={{ background: '#ffffff', borderRadius: 24, border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 12px 40px -12px rgba(80,70,160,0.2)', padding: 24 }}>
      <Skeleton active paragraph={{ rows: 6 }} />
    </div>
  );
}
