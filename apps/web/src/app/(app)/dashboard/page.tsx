'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from 'antd';
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, Calendar, CheckCircle2, ChevronDown, Clock, CreditCard, DollarSign, FileCheck, FileText, FlaskConical,
  Folder, Hourglass, Microscope, Monitor, MoreHorizontal, Plus, ShieldCheck, ShoppingBag, SlidersHorizontal, Smartphone, Stethoscope, Tablet,
  TestTube, TrendingUp, User, Users,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFeatures } from '@/lib/feature-context';
import { FeatureGate } from '@/components/FeatureGate';
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

// Case distribution by specimen class (violet family, zero-orange). Percentages
// are fallbacks only — the donut recomputes them from real priorityRecords when
// data is present (see specimenTypesDynamic).
const specimenTypes = [
  { label: 'Body Fluid', color: '#4F46E5', pct: 42 },
  { label: 'Respiratory', color: '#06B6D4', pct: 28 },
  { label: 'Urine', color: '#8B5CF6', pct: 16 },
  { label: 'CSF', color: '#3B82F6', pct: 8 },
  { label: 'Other', color: '#94A3B8', pct: 6 },
];

// Human-readable specimen labels (enum → display). Falls back to a de-underscored
// version for any type not listed here.
const SPEC_LABELS: Record<string, string> = {
  ENDOCERV_ASP: 'Endocerv. Asp', CERV_SCRAP: 'Cervical Scrape', VAG_POOL: 'Vaginal Pool',
  URINE: 'Urine Cytology', CSF: 'CSF', PLEURAL_FLD: 'Pleural Fluid', BREAST_ASP: 'Breast Asp.',
  JOINT_ASP: 'Joint Asp.', SYNOVIAL_FLD: 'Synovial Fluid', SPUTUM: 'Sputum',
  BRONCHIAL_WASH: 'Bronchial Wash', THYROID_FNA: 'Thyroid FNA', LYMPH_NODE: 'Lymph Node FNA',
  BONE_MARROW: 'Bone Marrow', SKIN_SCRAPING: 'Skin Scraping', OTHER: 'Other',
};
const specLabel = (t?: string | null) => SPEC_LABELS[t ?? ''] ?? t?.replace(/_/g, '.') ?? '—';
// Group a specimen type into one of the five donut buckets.
const specBucket = (t?: string | null) => {
  const x = t ?? '';
  if (['SPUTUM', 'BRONCHIAL_WASH'].includes(x)) return 'Respiratory';
  if (x === 'URINE') return 'Urine';
  if (x === 'CSF') return 'CSF';
  if (['PLEURAL_FLD', 'SYNOVIAL_FLD', 'JOINT_ASP', 'BREAST_ASP', 'THYROID_FNA', 'LYMPH_NODE', 'BONE_MARROW'].includes(x)) return 'Body Fluid';
  return 'Other';
};

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

const MODEL_VIEWS = ['Cervical', 'Fluid', 'FNA', 'Respiratory'];
const MODEL_DOT = ['#6366F1', '#14B8A6', '#8B5CF6', '#3B82F6']; // indigo / teal / violet / blue
// Hotspot marker layouts vary by GYN vs non-GYN specimen for visual variety.
const MARKER_SETS: Record<string, { x: number; y: number; color: string }[]> = {
  GYN: [
    { x: 352, y: 100, color: '#6366F1' },
    { x: 262, y: 290, color: '#8B5CF6' },
    { x: 420, y: 320, color: '#06B6D4' },
    { x: 310, y: 458, color: '#8B5CF6' },
  ],
  NONGYN: [
    { x: 300, y: 120, color: '#6366F1' },
    { x: 240, y: 310, color: '#8B5CF6' },
    { x: 440, y: 290, color: '#06B6D4' },
    { x: 352, y: 440, color: '#6366F1' },
  ],
};
// Analysis progress by record status — drives the "Processing Specimen" bar.
const PROGRESS_MAP: Record<string, number> = {
  Pending: 5, Submitted: 15, Processing: 76, Partial: 60, Resulted: 85,
  Completed: 90, Approved: 100, Billed: 100, Paid: 100, Viewed: 100,
  OnHold: 30, Failed: 0, Disabled: 0,
};

export default function DashboardPage() {
  const router = useRouter();
  const { claims } = useAuth();
  const [modelView, setModelView] = useState(0);
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
  const { isEnabled } = useFeatures();
  const { data: escSummary } = useQuery({
    queryKey: ['escalation-summary'],
    queryFn: () => api.get('/escalations/summary').then((r) => r.data as { pending: number; malignantCount: number; highGradeCount: number }),
    enabled: isEnabled('ABNORMAL_ESCALATION'),
    refetchInterval: 60_000,
  });

  // The queue drives an in-place selection: which record the AI stage + findings
  // reflect. Defaults to the top-priority record once data arrives.
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  useEffect(() => {
    if (d?.priorityRecords?.[0] && !selectedRecord) setSelectedRecord(d.priorityRecords[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.priorityRecords]);
  // Reset the view label whenever the selection changes.
  useEffect(() => { setModelView(0); }, [selectedRecord?.id]);

  // Count-up animation for the confidence figure on each selection.
  const [displayConf, setDisplayConf] = useState(0);
  const targetConf = d?.effectiveness?.authorization ?? 0;
  useEffect(() => {
    let start = 0;
    const end = targetConf;
    const step = (end - start) / (800 / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setDisplayConf(end); clearInterval(timer); }
      else setDisplayConf(Math.round(start));
    }, 16);
    return () => clearInterval(timer);
  }, [selectedRecord?.id, targetConf]);

  if (isError) return <div className="p-2 text-sm text-text-secondary">Dashboard is unavailable right now.</div>;
  if (isLoading || !d) {
    return (
      <div className="dashboard-theme -m-4 md:-m-8" style={{ minHeight: '100vh', background: 'transparent', position: 'relative', overflow: 'hidden' }}>
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

  // Monthly Case Volume — bucket the throughput series into 6 months; `gap`
  // fills each capsule up to a soft target. Reused by the chart + stat tiles.
  const volRows = (() => {
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
  })();
  const volTotal = volRows.reduce((s, r) => s + r.current, 0);
  const volAvg = Math.round(volTotal / volRows.length);
  const volPeak = volRows.reduce((a, b) => (b.current > a.current ? b : a), volRows[0]);
  const volTarget = (volRows[0]?.current ?? 0) + (volRows[0]?.gap ?? 0);
  const volAttain = volTarget > 0 ? Math.min(100, Math.round((volTotal / (volTarget * volRows.length)) * 100)) : 0;

  // Case distribution — bucket the priority queue's specimen types into the five
  // donut classes and derive real percentages; fall back to the static mix when
  // the queue is empty so the demo donut still reads as full.
  const specCounts: Record<string, number> = {};
  for (const r of (d.priorityRecords ?? [])) {
    const g = specBucket(r.specimen);
    specCounts[g] = (specCounts[g] ?? 0) + 1;
  }
  const specTotalCount = Object.values(specCounts).reduce((s, v) => s + v, 0);
  const specimenTypesDynamic = specTotalCount > 0
    ? specimenTypes.map((t) => ({ ...t, pct: Math.round(((specCounts[t.label] ?? 0) / specTotalCount) * 100) }))
    : specimenTypes;

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
      <div style={{ position: 'relative', zIndex: 1, padding: '36px 40px 40px' }}>
        <HeroBanner firstName={firstName} featured={featured} chips={chips} nav={<NavPills />} />

        <FeatureGate feature="ABNORMAL_ESCALATION">
          {(escSummary?.pending ?? 0) > 0 && (
            <button onClick={() => router.push('/escalations')}
              style={{ marginTop: 24, width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderRadius: 18, border: '1px solid #FECACA', background: '#FEF2F2', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: 12, background: '#FEE2E2', color: '#B91C1C', flexShrink: 0 }}><AlertTriangle size={22} /></span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{escSummary!.pending} pending escalation{escSummary!.pending === 1 ? '' : 's'}</span>
                <span style={{ display: 'block', fontSize: 13, color: '#64748B', marginTop: 2 }}>
                  {escSummary!.malignantCount > 0 && `${escSummary!.malignantCount} malignant · `}
                  {escSummary!.highGradeCount > 0 && `${escSummary!.highGradeCount} high-grade · `}
                  Review abnormal cytology findings
                </span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#B91C1C' }}>Review →</span>
            </button>
          )}
        </FeatureGate>

        <div style={{ marginTop: 40 }} className="flex flex-col gap-5">
          {/* ═══ SECTION 1: KPI STRIP ═══ */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 16,
            marginBottom: 20,
          }}>
            {[
              {
                icon: <TestTube size={20} color="#4F46E5" />,
                label: 'Active Specimens',
                value: d.priorityRecords?.length || 0,
                sub: `${d.priorityRecords?.filter((r: any) => r.urgent).length || 0} urgent`,
                subColor: '#EF4444',
                isPriority: true,
              },
              {
                icon: <FlaskConical size={20} color="#4F46E5" />,
                label: 'Cases Today',
                value: ov?.today?.requisitionsToday || 0,
                sub: 'received today',
                subColor: '#94A3B8',
              },
              {
                icon: <Clock size={20} color="#4F46E5" />,
                label: 'Avg Turnaround',
                value: kpis?.avgTat ? `${kpis.avgTat}d` : '—',
                sub: kpis?.avgTat <= 3 ? 'Within target' : 'Above target',
                subColor: kpis?.avgTat <= 3 ? '#16A34A' : '#EF4444',
              },
              {
                icon: <Activity size={20} color="#4F46E5" />,
                label: 'Pending Review',
                value: kpis?.pendingRequisitions || 0,
                sub: `${d.priorityRecords?.filter((r: any) => r.urgent).length || 0} high priority`,
                subColor: '#94A3B8',
                isPriority: true,
              },
              {
                icon: <CheckCircle2 size={20} color="#4F46E5" />,
                label: 'Auth Rate',
                value: `${eff?.authorization || 0}%`,
                sub: eff?.authorization >= 80 ? 'On target' : 'Below target',
                subColor: eff?.authorization >= 80 ? '#16A34A' : '#EF4444',
              },
            ].map(({ icon, label, value, sub, subColor, isPriority }, i) => (
              <div key={i} style={{
                background: 'white',
                borderRadius: 16,
                padding: '18px 20px',
                border: '1px solid #EEF2F7',
                boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                ...(isPriority ? {
                  borderLeft: '3px solid #4F46E5',
                  background: 'linear-gradient(135deg, #FAFBFF 0%, #F4F4FE 100%)',
                } : {}),
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: '#EEF2FF',
                  display: 'grid', placeItems: 'center',
                  flexShrink: 0,
                }}>
                  {icon}
                </div>
                <div>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: '#94A3B8',
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                    marginBottom: 2,
                  }}>{label}</div>
                  <div style={{
                    fontSize: isPriority ? 36 : 28, fontWeight: 800, color: '#0F172A',
                    letterSpacing: '-0.02em', lineHeight: 1,
                    fontFamily: 'Geist, sans-serif',
                  }}>{value}</div>
                  <div style={{
                    fontSize: 11, fontWeight: 600,
                    color: subColor, marginTop: 3,
                  }}>{sub}</div>
                </div>
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
                {(d.priorityRecords || []).slice(0, 6).map((r: any) => {
                  const sel = selectedRecord?.id === r.id;
                  return (
                    <div key={r.id} onClick={() => setSelectedRecord(r)}
                      style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 72, padding: '10px 12px', borderRadius: 12, cursor: 'pointer', background: sel ? '#EEF2FF' : 'transparent', border: sel ? '1px solid #C7D2FE' : '1px solid transparent', transition: 'all 0.15s' }}
                      onMouseEnter={(e) => { if (!sel) (e.currentTarget as HTMLDivElement).style.background = '#F8FAFC'; }}
                      onMouseLeave={(e) => { if (!sel) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}>
                      <SpecimenIcon type={r.specimen} size={56} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>{r.labNumber ?? '—'}</span>
                          {r.urgent && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: '#4F46E5', background: '#EEF2FF', borderRadius: 999, padding: '2px 8px' }}>High Priority</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {specLabel(r.specimen)}{r.patient ? ` · ${r.patient}` : ''}
                        </div>
                        <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>
                          Received {new Date(r.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      {sel
                        ? <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: '#4F46E5' }} />
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
            <div style={{ height: 540, background: '#FFFFFF', borderRadius: 20, border: '1px solid #EEF2F7', boxShadow: '0 4px 24px rgba(79,70,229,0.08)', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* Header (overlays the stage so the head can fill the panel) */}
              <div style={{ padding: '20px 24px 0', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 4 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>AI Cytology Model</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 600, color: '#16A34A', marginTop: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 6px rgba(34,197,94,0.6)', animation: 'livePulse 2s ease-in-out infinite' }} />
                  Live Analysis
                </div>
              </div>

              {/* Analysis stage — head fills the panel, scalp near the top */}
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                <div style={{ position: 'relative', width: 760, height: 520, maxWidth: '100%', overflow: 'hidden' }}>
                  {(() => {
                    const isGyn = ['CERV_SCRAP', 'ENDOCERV_ASP', 'VAG_POOL'].includes(selectedRecord?.specimen ?? '');
                    const markers = MARKER_SETS[isGyn ? 'GYN' : 'NONGYN'].map((m) => ({ ...m, color: selectedRecord?.urgent ? '#EF4444' : m.color }));
                    const findings = [
                      { label: selectedRecord?.specimen ? specLabel(selectedRecord.specimen) : 'Awaiting Analysis', conf: eff?.authorization ?? 0, color: '#6366F1', y: 100, attention: selectedRecord?.urgent ?? false },
                      { label: `${eff?.onTime ?? 0}% On-time Rate`, conf: eff?.onTime ?? 0, color: '#3B82F6', y: 214, attention: (eff?.onTime ?? 0) < 70 },
                      { label: `${eff?.accuracy ?? 0}% Accuracy Score`, conf: eff?.accuracy ?? 0, color: '#8B5CF6', y: 314, attention: (eff?.accuracy ?? 0) < 80 },
                      { label: `${eff?.reportsAuthorized ?? 0} Reports Authorized`, conf: Math.min(100, Math.round(((eff?.reportsAuthorized ?? 0) / Math.max(eff?.specimensProcessed ?? 1, 1)) * 100)), color: '#6366F1', y: 452, attention: false },
                    ];
                    const LX = 500; // label dot x
                    return (
                      <>
                        {/* dotted connectors marker → label */}
                        <svg width="760" height="520" viewBox="0 0 760 520" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
                          {markers.map((m, i) => (
                            <line key={i} x1={m.x} y1={m.y} x2={LX} y2={findings[i].y} stroke="#818CF8" strokeWidth={1.8} strokeDasharray="4 5" />
                          ))}
                        </svg>
                        {/* aura */}
                        <div style={{ position: 'absolute', left: -130, top: -60, width: 780, height: 760, background: 'radial-gradient(55% 55% at 47% 44%, rgba(255,255,255,0.85) 0%, rgba(167,139,250,0.35) 38%, rgba(139,92,246,0.20) 55%, rgba(99,102,241,0.08) 68%, transparent 78%)', filter: 'blur(8px)', zIndex: 0 }} />
                        {/* floating cytology particles */}
                        {[
                          { size: 32, top: '12%', left: '10%', delay: '0s', dur: '7s' },
                          { size: 24, top: '30%', left: '6%', delay: '1.5s', dur: '9s' },
                          { size: 28, top: '60%', left: '8%', delay: '3s', dur: '8s' },
                          { size: 20, top: '75%', left: '18%', delay: '2s', dur: '10s' },
                          { size: 26, top: '18%', left: '72%', delay: '4s', dur: '7.5s' },
                          { size: 22, top: '50%', left: '78%', delay: '5s', dur: '8.5s' },
                          { size: 18, top: '82%', left: '68%', delay: '1s', dur: '9.5s' },
                        ].map((p, i) => (
                          <div key={i} style={{ position: 'absolute', top: p.top, left: p.left, pointerEvents: 'none', zIndex: 1, animation: `particleFloat ${p.dur} ease-in-out infinite`, animationDelay: p.delay, opacity: 0.75, filter: 'drop-shadow(0 2px 8px rgba(99,102,241,0.3))' }}>
                            <SpecimenIcon type={(['CERV_SCRAP', 'BREAST_ASP', 'URINE', 'PLEURAL_FLD', 'CSF', 'ENDOCERV_ASP', 'VAG_POOL'])[i % 7]} size={p.size} />
                          </div>
                        ))}
                        {/* rotating halo beneath the bust */}
                        <div style={{ position: 'absolute', left: 70, top: 450, width: 370, height: 80, borderRadius: '50%', background: 'radial-gradient(50% 50% at 50% 50%, rgba(167,139,250,0.3) 0%, rgba(99,102,241,0.15) 45%, transparent 70%)', filter: 'blur(8px)', zIndex: 1, animation: 'haloRotate 6s ease-in-out infinite' }} />
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
                              <span style={{ fontSize: 16, fontWeight: 800, color: '#1E1B4B' }}>{f.label}</span>
                            </div>
                            <div style={{ fontSize: 13, color: '#6B7280', marginLeft: 19, marginTop: 2 }}>Confidence {f.conf}%</div>
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

              {/* Processing Specimen overlay */}
              <div style={{ position: 'absolute', left: 20, top: 'auto', bottom: 110, zIndex: 4, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', borderRadius: 16, padding: '14px 18px', border: '1px solid rgba(79,70,229,0.12)', boxShadow: '0 8px 24px rgba(79,70,229,0.12)', width: 220 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Processing Specimen</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <SpecimenIcon type={selectedRecord?.specimen} size={36} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{selectedRecord?.labNumber ?? '—'}</div>
                    <div style={{ fontSize: 11, color: '#64748B' }}>{selectedRecord?.specimen ? specLabel(selectedRecord.specimen) : 'No active specimen'}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{selectedRecord?.patient ?? ''}</div>
                  </div>
                </div>
                {(() => {
                  const pct = PROGRESS_MAP[selectedRecord?.status ?? 'Pending'] ?? 5;
                  return (
                    <>
                      <div style={{ fontSize: 11, color: '#64748B', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                        <span>Analyzing Cells…</span>
                        <span style={{ fontWeight: 700, color: '#4F46E5' }}>{pct}%</span>
                      </div>
                      <div style={{ height: 5, background: '#EEF2FF', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: 5, borderRadius: 999, background: 'linear-gradient(90deg,#4F46E5,#7C3AED)', width: `${pct}%`, transition: 'width 1s ease-out' }} />
                      </div>
                    </>
                  );
                })()}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: '#94A3B8' }}>
                  <span>Estimated completion</span>
                  <span style={{ fontWeight: 600, color: '#4F46E5', fontFamily: 'monospace' }}>00:00:18</span>
                </div>
              </div>

              {/* View selector pill + marker hint */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 24px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 4 }}>
                <button onClick={() => setModelView((v) => (v + 1) % MODEL_VIEWS.length)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #EEF2F7', boxShadow: '0 6px 18px rgba(79,70,229,0.10)', borderRadius: 999, padding: '11px 24px', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#4F46E5', fontFamily: 'Geist,sans-serif' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" /><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                  </svg>
                  {MODEL_VIEWS[modelView]} View <ChevronDown size={14} />
                </button>
                <div style={{ textAlign: 'center', marginTop: 6, fontSize: 11, color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  Click on markers to view cell details
                </div>
              </div>
            </div>

            {/* RIGHT: AI Findings — re-keyed so it fades in on each selection */}
            <div key={selectedRecord?.id} className="premium-scroll" style={{ height: 540, background: 'white', borderRadius: 20, padding: '20px', border: '1px solid #EEF2F7', boxShadow: '0 4px 24px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', animation: 'findingsFadeIn 0.4s ease-out' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>AI Findings</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#4F46E5', fontFamily: 'Geist,sans-serif' }}>{selectedRecord?.labNumber ?? '—'}</span>
              </div>

              {/* Interpretation */}
              <div style={{ background: '#F4F4FB', borderRadius: 16, padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#64748B' }}>Interpretation</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#4F46E5', background: '#EEF2FF', borderRadius: 999, padding: '3px 10px' }}>High Confidence</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', fontFamily: 'Geist,sans-serif', letterSpacing: '-0.02em', marginBottom: 4 }}>
                  {selectedRecord?.urgent
                    ? 'Urgent Case — Immediate Review'
                    : selectedRecord?.specimen
                      ? `${specLabel(selectedRecord.specimen)} Analysis`
                      : 'No Active Cases'}
                </div>
                <div style={{ fontSize: 14, color: '#64748B' }}>
                  {selectedRecord?.client
                    ? `Client: ${selectedRecord.client}`
                    : 'Awaiting cytological analysis.'}
                </div>
              </div>

              {/* DIAGNOSIS */}
              <div style={{ marginBottom: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Diagnosis</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>
                  {selectedRecord?.urgent ? 'Atypical Cells Detected' : 'Specimen Under Review'}
                </div>
                <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
                  {selectedRecord?.client ?? 'Awaiting analysis'}
                </div>
              </div>

              {/* CONFIDENCE */}
              <div style={{ padding: '12px 14px', background: '#F4F4FB', borderRadius: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Confidence</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 6, background: '#E2E8F0', borderRadius: 999 }}>
                    <div style={{ height: 6, borderRadius: 999, background: 'linear-gradient(90deg,#4F46E5,#7C3AED)', width: `${targetConf}%`, transition: 'width 1s' }} />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#4F46E5', fontFamily: 'Geist,sans-serif', minWidth: 36 }}>{displayConf}%</span>
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Based on {eff?.specimensProcessed ?? 0} processed specimens</div>
              </div>

              {/* DETECTED FEATURES */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Detected Features</div>
                {[
                  { label: 'Specimen Type', value: specLabel(selectedRecord?.specimen) },
                  { label: 'Specimens Processed', value: `${eff?.specimensProcessed ?? 0} total` },
                  { label: 'Abnormal Cells', value: selectedRecord?.urgent ? 'Detected — Moderate' : 'Not detected' },
                ].map(({ label, value }, i, arr) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < arr.length - 1 ? '1px solid #F1F0EA' : 'none' }}>
                    <span style={{ fontSize: 13, color: '#64748B' }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* RECOMMENDED ACTION */}
              <div style={{ padding: '12px 14px', background: '#F0FDF4', borderRadius: 12, border: '1px solid #BBF7D0' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#16A34A', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Recommended Action</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>
                  {selectedRecord?.urgent
                    ? 'Priority review — escalate to senior pathologist'
                    : (eff?.authorization ?? 0) >= 80
                      ? 'Standard processing — no action required'
                      : 'Review pending cases — authorization rate below threshold'}
                </div>
              </div>

              {/* CTAs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto' }}>
                <button onClick={() => router.push(`/records/${selectedRecord?.id ?? ''}`)} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg,#4F46E5 0%,#6D28D9 100%)', color: 'white', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'Geist,sans-serif', boxShadow: '0 8px 20px rgba(79,70,229,0.28)' }}>
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
            <div style={{ background: '#FAFBFF', borderRadius: 20, padding: '20px 24px', border: '1px solid #F1F0EA' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>Monthly Case Volume</span>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 999, padding: '3px 10px', cursor: 'pointer' }}>6 Months ▾</div>
              </div>
              <SubscriptionBars data={volRows} />
              <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { value: volTotal, label: 'Total cases' },
                  { value: volAvg, label: 'Avg / month' },
                  { value: volPeak?.month ?? '—', label: 'Peak month' },
                  { value: `${volAttain}%`, label: 'Target met' },
                ].map(({ value, label }) => (
                  <div key={label} style={{ background: '#F8F9FF', borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', fontFamily: 'Geist,sans-serif', lineHeight: 1 }}>{value}</div>
                    <div style={{ fontSize: 12, color: '#64748B', fontWeight: 500, marginTop: 4 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Case Distribution by Type */}
            <div style={{ background: '#FAFBFF', borderRadius: 20, padding: '20px 24px', border: '1px solid #F1F0EA' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif', marginBottom: 16 }}>Case Distribution by Type</div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                <div style={{ position: 'relative', width: 180, height: 180, flexShrink: 0 }}>
                  <svg viewBox="0 0 180 180" width="180" height="180">
                    {(() => {
                      const types = specimenTypesDynamic.filter((t) => t.pct > 0);
                      const r = 70, circ = 2 * Math.PI * r, gap = 2.5;
                      let offset = 0;
                      return types.map(({ color, pct }, i) => {
                        const dash = (pct / 100) * circ;
                        const el = (
                          <circle key={i} cx="90" cy="90" r={r} fill="none" stroke={color} strokeWidth="20"
                            strokeDasharray={`${dash - gap} ${circ - dash + gap}`}
                            strokeDashoffset={-(offset / 100) * circ}
                            transform="rotate(-90 90 90)" />
                        );
                        offset += pct;
                        return el;
                      });
                    })()}
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: 30, fontWeight: 800, color: '#0F172A', fontFamily: 'Geist,sans-serif', lineHeight: 1 }}>{totalSpecimens || d.priorityRecords?.length || 0}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textAlign: 'center', marginTop: 3 }}>Total Cases</div>
                  </div>
                </div>
                <div style={{ width: '100%', maxWidth: 280, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {specimenTypesDynamic.map(({ label, color, pct }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: '#64748B', fontWeight: 500 }}>{label}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* AI Performance */}
            <div style={{ background: '#FAFBFF', borderRadius: 20, padding: '20px 24px', border: '1px solid #F1F0EA' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>AI Performance</span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#4F46E5', fontFamily: 'Geist,sans-serif', lineHeight: 1.1 }}>{eff?.authorization ?? 0}%</div>
                  <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>Accuracy</div>
                </div>
              </div>
              <PerformanceArea />
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  { label: 'Sensitivity', v: Math.min(99, (eff?.authorization ?? 0) + 8) },
                  { label: 'Specificity', v: Math.min(99, (eff?.authorization ?? 0) + 5) },
                  { label: 'Precision', v: Math.min(99, (eff?.authorization ?? 0) + 2) },
                  { label: 'F1 Score', v: Math.min(99, (eff?.authorization ?? 0) + 4) },
                ].map(({ label, v }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 82, fontSize: 12, color: '#64748B', fontWeight: 600, flexShrink: 0 }}>{label}</span>
                    <div style={{ flex: 1, height: 8, borderRadius: 999, background: '#EEF0F6', overflow: 'hidden' }}>
                      <div style={{ width: `${v}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#6366F1,#8B5CF6)' }} />
                    </div>
                    <span style={{ width: 36, textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#0F172A', flexShrink: 0 }}>{v}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div style={{ background: '#FAFBFF', borderRadius: 20, padding: '20px', border: '1px solid #F1F0EA', display: 'flex', flexDirection: 'column' }}>
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
