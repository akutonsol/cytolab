'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from 'antd';
import {
  Activity, ArrowRight, ArrowUpRight, Calendar, CalendarClock, CheckCircle2, ChevronDown, Clock, CreditCard, DollarSign, FileCheck, FileText, FlaskConical,
  Folder, GraduationCap, Hourglass, Microscope, Monitor, MoreHorizontal, Plus, ShieldCheck, ShoppingBag, SlidersHorizontal, Smartphone, Stethoscope, Tablet,
  TestTube, TrendingUp, User, Users, Video,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFeatures } from '@/lib/feature-context';
import { FeatureGate } from '@/components/FeatureGate';
import { GlassCard } from '@/components/dashboard/glass-card';
import { ActivityTray } from '@/components/dashboard/ActivityTray';
import { LiveStatusRibbon } from '@/components/dashboard/LiveStatusRibbon';
import { PerformanceArea, SubscriptionBars } from './charts';

const GREEN = '#166534', BLUE = '#4F46E5';
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
    : ['Deauthorized', 'Failed', 'Disabled'].includes(status) ? '#991B1B' : BLUE;

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
  { label: 'Respiratory', color: '#0E7490', pct: 28 },
  { label: 'Urine', color: '#6D28D9', pct: 16 },
  { label: 'CSF', color: '#1D4ED8', pct: 8 },
  { label: 'Other', color: '#475569', pct: 6 },
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
  gyn: { bg: '#DCFCE7', cells: ['#86EFAC', '#4ADE80', '#166534'], nucleus: '#15803D' },
  urine: { bg: '#FFE4E6', cells: ['#FDA4AF', '#FB7185', '#F43F5E'], nucleus: '#BE123C' },
  csf: { bg: '#E0F2FE', cells: ['#7DD3FC', '#38BDF8', '#0EA5E9'], nucleus: '#0369A1' },
  fluid: { bg: '#EDE9FE', cells: ['#C4B5FD', '#A78BFA', '#6D28D9'], nucleus: '#6D28D9' },
  fna: { bg: '#CCFBF1', cells: ['#5EEAD4', '#2DD4BF', '#0F766E'], nucleus: '#0F766E' },
  resp: { bg: '#DBEAFE', cells: ['#93C5FD', '#60A5FA', '#1D4ED8'], nucleus: '#1D4ED8' },
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
      style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #6B21A8 100%)' }}
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
const MODEL_DOT = ['#6366F1', '#0F766E', '#6D28D9', '#1D4ED8']; // indigo / teal / violet / blue
// Hotspot marker layouts vary by GYN vs non-GYN specimen for visual variety.
const MARKER_SETS: Record<string, { x: number; y: number; color: string }[]> = {
  GYN: [
    { x: 352, y: 100, color: '#6366F1' },
    { x: 262, y: 290, color: '#6D28D9' },
    { x: 420, y: 320, color: '#0E7490' },
    { x: 310, y: 458, color: '#6D28D9' },
  ],
  NONGYN: [
    { x: 300, y: 120, color: '#6366F1' },
    { x: 240, y: 310, color: '#6D28D9' },
    { x: 440, y: 290, color: '#0E7490' },
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
  // Real first name for the welcome line (JWT claims carry none).
  const { data: me } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api.get('/auth/me').then((r) => r.data as { firstName?: string }),
    staleTime: 5 * 60_000,
  });
  const { isEnabled } = useFeatures();
  const { data: profTests } = useQuery({
    queryKey: ['proficiency'],
    queryFn: () => api.get('/proficiency').then((r) => r.data as { status: string }[]),
    enabled: isEnabled('PROFICIENCY_TESTING'),
  });
  const activeProfTests = (profTests ?? []).filter((t) => t.status === 'Active').length;
  const { data: recallSummary } = useQuery({
    queryKey: ['recall-summary'],
    queryFn: () => api.get('/recalls/summary').then((r) => r.data as { due: number; overdue: number }),
    enabled: isEnabled('PATIENT_RECALL'),
  });
  const recallsDue = (recallSummary?.due ?? 0) + (recallSummary?.overdue ?? 0);
  const { data: consultAnalytics } = useQuery({
    queryKey: ['consult-analytics'],
    queryFn: () => api.get('/teleconsult/analytics').then((r) => r.data as { pending: number; responded: number; total: number }),
    enabled: isEnabled('TELECONSULTATION'),
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
      <div className="dashboard-theme -my-4" style={{ minHeight: '100vh', background: 'transparent', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'relative', zIndex: 1, padding: '36px 0 40px' }}>
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
  const firstName = me?.firstName?.trim() || ov?.greeting?.firstName || (emailName ? emailName[0].toUpperCase() + emailName.slice(1) : 'there');

  return (
    <div className="dashboard-theme -my-4" style={{ minHeight: '100vh', background: 'transparent', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'relative', zIndex: 1, padding: '4px 0 40px', background: '#F8F9FD' }}>
        <FeatureGate feature="PROFICIENCY_TESTING">
          {activeProfTests > 0 && (
            <button onClick={() => router.push('/proficiency')}
              style={{ marginTop: 16, width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderRadius: 18, border: '1px solid #C7D2FE', background: '#EEF2FF', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: 12, background: '#E0E7FF', color: '#4F46E5', flexShrink: 0 }}><GraduationCap size={22} /></span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{activeProfTests} active proficiency test{activeProfTests === 1 ? '' : 's'}</span>
                <span style={{ display: 'block', fontSize: 13, color: '#475569', marginTop: 2 }}>Complete your blind review before the deadline</span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#4F46E5' }}>Open →</span>
            </button>
          )}
        </FeatureGate>

        <FeatureGate feature="PATIENT_RECALL">
          {recallsDue > 0 && (() => {
            const hasOverdue = (recallSummary?.overdue ?? 0) > 0;
            const border = hasOverdue ? '#FECACA' : '#FDE68A';
            const bg = hasOverdue ? '#FEF2F2' : '#FFFBEB';
            const chipBg = hasOverdue ? '#FEE2E2' : '#FEF3C7';
            const accent = hasOverdue ? '#B91C1C' : '#B45309';
            return (
              <button onClick={() => router.push('/recalls')}
                style={{ marginTop: 16, width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderRadius: 18, border: `1px solid ${border}`, background: bg, cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: 12, background: chipBg, color: accent, flexShrink: 0 }}><CalendarClock size={22} /></span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{recallsDue} recall{recallsDue === 1 ? '' : 's'} due</span>
                  <span style={{ display: 'block', fontSize: 13, color: '#475569', marginTop: 2 }}>
                    {(recallSummary?.overdue ?? 0) > 0 && `${recallSummary!.overdue} overdue · `}
                    Patients due for repeat cytology follow-up
                  </span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: accent }}>Open →</span>
              </button>
            );
          })()}
        </FeatureGate>

        <FeatureGate feature="TELECONSULTATION">
          {(consultAnalytics?.pending ?? 0) > 0 && (
            <button onClick={() => router.push('/teleconsult')}
              style={{ marginTop: 16, width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderRadius: 18, border: '1px solid #C7D2FE', background: '#EEF2FF', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: 12, background: '#E0E7FF', color: '#4F46E5', flexShrink: 0 }}><Video size={22} /></span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{consultAnalytics!.pending} active consultation{consultAnalytics!.pending === 1 ? '' : 's'}</span>
                <span style={{ display: 'block', fontSize: 13, color: '#475569', marginTop: 2 }}>
                  {consultAnalytics!.responded} responded · external second opinions
                </span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#4F46E5' }}>Open →</span>
            </button>
          )}
        </FeatureGate>

        <div style={{ marginTop: 12, background: 'transparent', marginLeft: -16, marginRight: -16, marginBottom: -40, paddingLeft: 16, paddingRight: 16, paddingTop: 20, paddingBottom: 40 }} className="flex flex-col gap-5">
          {/* ═══ LIVE STATUS RIBBON (slim single-line status between nav + Action Center) ═══ */}
          <LiveStatusRibbon stats={{ activeSpecimens: d.priorityRecords?.length || 0, escalations: d.priorityRecords?.filter((r: any) => r.urgent).length || 0, aiQueue: kpis?.pendingRequisitions || 0 }} />
          {/* ═══ ACTIVITY TRAY (consolidates escalation / AI review / FHIR alerts) ═══ */}
          <ActivityTray />

          {/* ═══ SECTION 1: KPI STRIP ═══ */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 16,
            marginBottom: 20,
          }}>
            {[
              {
                icon: <TestTube size={24} color="#4F46E5" />,
                label: 'Active Specimens',
                value: d.priorityRecords?.length || 0,
                sub: `${d.priorityRecords?.filter((r: any) => r.urgent).length || 0} urgent`,
                subColor: '#991B1B',
                isPriority: true,
                isPrimary: true,
                trend: 8,
              },
              {
                icon: <FlaskConical size={24} color="#4F46E5" />,
                label: 'Cases Today',
                value: ov?.today?.requisitionsToday || 0,
                sub: 'received today',
                subColor: '#475569',
                trend: -12,
              },
              {
                icon: <Clock size={24} color="#4F46E5" />,
                label: 'Avg Turnaround',
                value: kpis?.avgTat ? `${kpis.avgTat}d` : '—',
                sub: kpis?.avgTat <= 3 ? 'Within target' : 'Above target',
                subColor: kpis?.avgTat <= 3 ? '#166534' : '#991B1B',
                trend: -4,
                trendInverted: true, // lower TAT is better
              },
              {
                icon: <Activity size={24} color="#4F46E5" />,
                label: 'Pending Review',
                value: kpis?.pendingRequisitions || 0,
                sub: `${d.priorityRecords?.filter((r: any) => r.urgent).length || 0} high priority`,
                subColor: '#475569',
                isPriority: true,
                trend: 15,
              },
              {
                icon: <CheckCircle2 size={24} color="#4F46E5" />,
                label: 'Auth Rate',
                value: `${eff?.authorization || 0}%`,
                sub: eff?.authorization >= 80 ? 'On target' : 'Below target',
                subColor: eff?.authorization >= 80 ? '#166534' : '#991B1B',
                trend: 2,
              },
            ].map(({ icon, label, value, sub, subColor, isPriority, isPrimary, trend, trendInverted }: any, i) => (
              <div key={i} style={{
                background: 'white',
                borderRadius: 18,
                padding: '30px 24px',
                border: '1px solid #EEF2F7',
                boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                ...(isPriority ? {
                  borderLeft: '4px solid #4F46E5',
                  background: 'linear-gradient(135deg, #FAFBFF 0%, #F4F4FE 100%)',
                } : {}),
                // Primary KPI (Active Specimens) — stronger indigo border + soft glow.
                ...(isPrimary ? {
                  border: '2px solid #C7D2FE',
                  borderLeft: '4px solid #4F46E5',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.05), 0 2px 12px rgba(99,102,241,0.12)',
                } : {}),
              }}>
                <div style={{
                  width: 50, height: 50, borderRadius: 14,
                  background: '#EEF2FF',
                  display: 'grid', placeItems: 'center',
                  flexShrink: 0,
                }}>
                  {icon}
                </div>
                <div>
                  <div style={{
                    fontSize: 12.5, fontWeight: 700, color: '#475569',
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                    marginBottom: 3,
                  }}>{label}</div>
                  <div style={{
                    fontSize: isPriority ? 42 : 34, fontWeight: 800, color: '#0F172A',
                    letterSpacing: '-0.02em', lineHeight: 1,
                    fontFamily: 'Geist, sans-serif',
                  }}>{value}</div>
                  <div style={{
                    fontSize: 12.5, fontWeight: 600,
                    color: subColor, marginTop: 4,
                  }}>{sub}</div>
                  {typeof trend === 'number' && (() => {
                    // Zero-orange: up/down trends use emerald/red only. TAT inverts
                    // (a lower number is the good direction).
                    const good = trendInverted ? trend < 0 : trend > 0;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5, fontSize: 11, fontWeight: 600, color: good ? '#059669' : '#EF4444' }}>
                        <span>{trend > 0 ? '▲' : '▼'}{Math.abs(trend)}%</span>
                        <span style={{ color: '#9ca3af', fontWeight: 400 }}>vs yesterday</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>

          {/* ═══ SECTION 2: MAIN 3-COLUMN GRID ═══ */}
          {/* Fluid columns (~1 : 1.8 : 1) that stretch to fill the full content
              width — no fixed px widths, so the grid scales with the viewport and
              the right column reaches the same edge as the nav. minmax(0,…) keeps
              wide children from overflowing. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.8fr) minmax(0, 1fr)', gap: 20, alignItems: 'stretch' }}>
            {/* LEFT: Specimen Queue */}
            <div style={{ height: 540, background: 'white', borderRadius: 20, padding: '20px', border: '1px solid #EEF2F7', boxShadow: '0 4px 24px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>Specimen Queue</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 999, padding: '4px 10px', cursor: 'pointer' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>All Types</span>
                  <ChevronDown size={12} color="#475569" />
                </div>
              </div>
              <div className="premium-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {(d.priorityRecords || []).slice(0, 6).map((r: any) => {
                  const sel = selectedRecord?.id === r.id;
                  return (
                    <div key={r.id} onClick={() => setSelectedRecord(r)}
                      style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 72, padding: '10px 12px', borderRadius: 12, cursor: 'pointer', background: sel ? '#EEF2FF' : 'transparent', border: sel ? '1px solid #C7D2FE' : '1px solid transparent', transition: 'all 0.3s' }}
                      onMouseEnter={(e) => { if (!sel) (e.currentTarget as HTMLDivElement).style.background = '#F8FAFC'; }}
                      onMouseLeave={(e) => { if (!sel) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}>
                      <SpecimenIcon type={r.specimen} size={56} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 14.5, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>{r.labNumber ?? '—'}</span>
                          {r.urgent && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: '#4F46E5', background: '#EEF2FF', borderRadius: 999, padding: '2px 8px' }}>High Priority</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12.5, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {specLabel(r.specimen)}{r.patient ? ` · ${r.patient}` : ''}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 3 }}>
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>Received {new Date(r.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#818CF8' }} />
                            <span style={{ fontSize: 10, fontWeight: 600, color: '#4F46E5' }}>AI Screening Complete</span>
                          </span>
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

            {/* CENTER: AI Cytology Model — elevated centerpiece (border + aiGlow). */}
            <div className="ai-model-container" style={{ height: 540, background: '#FFFFFF', borderRadius: 20, border: '2px solid #EEF2FF', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* Header (overlays the stage so the head can fill the panel) */}
              <div style={{ padding: '20px 24px 0', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 4 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>AI Cytology Model</div>
                <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 shadow-sm">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" style={{ animationDuration: '1.5s' }} />
                  <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Live</span>
                  <span className="text-[11px] font-medium text-gray-500">Scanning</span>
                </div>
              </div>

              {/* Analysis stage — head fills the panel, scalp near the top */}
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                <div style={{ position: 'relative', width: 760, height: 520, maxWidth: '100%', overflow: 'hidden' }}>
                  {(() => {
                    const isGyn = ['CERV_SCRAP', 'ENDOCERV_ASP', 'VAG_POOL'].includes(selectedRecord?.specimen ?? '');
                    const markers = MARKER_SETS[isGyn ? 'GYN' : 'NONGYN'].map((m) => ({ ...m, color: selectedRecord?.urgent ? '#991B1B' : m.color }));
                    const findings = [
                      { label: selectedRecord?.specimen ? specLabel(selectedRecord.specimen) : 'Awaiting Analysis', conf: eff?.authorization ?? 0, color: '#6366F1', y: 100, attention: selectedRecord?.urgent ?? false },
                      { label: `${eff?.onTime ?? 0}% On-time Rate`, conf: eff?.onTime ?? 0, color: '#1D4ED8', y: 214, attention: (eff?.onTime ?? 0) < 70 },
                      { label: `${eff?.accuracy ?? 0}% Accuracy Score`, conf: eff?.accuracy ?? 0, color: '#6D28D9', y: 314, attention: (eff?.accuracy ?? 0) < 80 },
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
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#991B1B', background: '#FEF2F2', borderRadius: 6, padding: '2px 8px' }}>+ Attention</span>
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
                <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Processing Specimen</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <SpecimenIcon type={selectedRecord?.specimen} size={36} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{selectedRecord?.labNumber ?? '—'}</div>
                    <div style={{ fontSize: 11, color: '#475569' }}>{selectedRecord?.specimen ? specLabel(selectedRecord.specimen) : 'No active specimen'}</div>
                    <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>{selectedRecord?.patient ?? ''}</div>
                  </div>
                </div>
                {(() => {
                  const pct = PROGRESS_MAP[selectedRecord?.status ?? 'Pending'] ?? 5;
                  return (
                    <>
                      <div style={{ fontSize: 11, color: '#475569', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                        <span>Analyzing Cells…</span>
                        <span style={{ fontWeight: 700, color: '#4F46E5' }}>{pct}%</span>
                      </div>
                      <div style={{ height: 5, background: '#EEF2FF', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: 5, borderRadius: 999, background: 'linear-gradient(90deg,#4F46E5,#6B21A8)', width: `${pct}%`, transition: 'width 1s ease-out' }} />
                      </div>
                    </>
                  );
                })()}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: '#475569' }}>
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
                <div style={{ textAlign: 'center', marginTop: 6, fontSize: 11, color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  Click on markers to view cell details
                </div>
              </div>
            </div>

            {/* RIGHT: AI Findings — re-keyed so it fades in on each selection */}
            <div key={selectedRecord?.id} className="premium-scroll" style={{ height: 540, background: 'white', borderRadius: 20, padding: '20px', border: '1px solid #EEF2F7', boxShadow: '0 4px 24px rgba(0,0,0,0.04)', overflowY: 'auto', animation: 'findingsFadeIn 0.4s ease-out' }}>
              <div className="flex h-full flex-col gap-3">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">AI Findings</span>
                  <span className="text-xs font-semibold text-indigo-600">{selectedRecord?.labNumber ?? '—'}</span>
                </div>

                {/* AI status */}
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-2.5">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  <span className="text-[12px] font-bold text-emerald-700">✓ AI Screening Complete</span>
                </div>

                {/* AI version + trust signals */}
                <div className="rounded-xl bg-gray-50 p-2.5">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[13px] font-black text-gray-900">CYTO AI</span>
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600">v3.2</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">✓ FDA Validated</span>
                    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">✓ CAP Certified</span>
                  </div>
                  <div className="mt-1 text-[10px] text-gray-400">85,203 cases processed</div>
                </div>

                {/* Confidence + colour coding. Zero-orange: safe tiers only —
                    emerald ≥80, dark amber-800 60–79, red <60 (no orange-500/600). */}
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Confidence</span>
                    <span className={`text-[13px] font-black ${displayConf >= 80 ? 'text-emerald-600' : displayConf >= 60 ? 'text-amber-800' : 'text-red-600'}`}>{displayConf}%</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                    <div className={`h-full rounded-full transition-all duration-1000 ${displayConf >= 80 ? 'bg-emerald-500' : displayConf >= 60 ? 'bg-yellow-400' : 'bg-red-500'}`} style={{ width: `${targetConf}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span className="text-[10px] text-gray-400">Based on {eff?.specimensProcessed ?? 0} specimens</span>
                    <span className={`text-[10px] font-semibold ${displayConf >= 80 ? 'text-emerald-600' : displayConf >= 60 ? 'text-amber-800' : 'text-red-600'}`}>{displayConf >= 80 ? 'High Confidence' : displayConf >= 60 ? 'Moderate' : 'Low Confidence'}</span>
                  </div>
                  <div className={`mt-0.5 text-[10px] font-semibold ${displayConf >= 80 ? 'text-emerald-600' : displayConf >= 60 ? 'text-amber-800' : 'text-red-600'}`}>
                    {displayConf >= 80 ? 'Very Low Risk of Misclassification' : displayConf >= 60 ? 'Low Risk of Misclassification' : 'Manual Review Strongly Recommended'}
                  </div>
                </div>

                {/* AI Decision Probabilities — the differentiator. Zero-orange severity
                    palette: HSIL red · ASC-US rose · LSIL bright-yellow · Normal emerald. */}
                <div className="rounded-xl bg-indigo-50 p-3">
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-indigo-600">AI Decision Probabilities</div>
                  {[
                    { label: 'HSIL', prob: 84, color: 'bg-red-500' },
                    { label: 'ASC-US', prob: 9, color: 'bg-rose-400' },
                    { label: 'LSIL', prob: 5, color: 'bg-yellow-400' },
                    { label: 'Normal', prob: 2, color: 'bg-emerald-500' },
                  ].map(({ label, prob, color }) => (
                    <div key={label} className="mb-1.5 flex items-center gap-2 last:mb-0">
                      <span className="w-14 text-[11px] font-semibold text-gray-700">{label}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white">
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${prob}%` }} />
                      </div>
                      <span className="w-8 text-right text-[11px] font-bold text-gray-600">{prob}%</span>
                    </div>
                  ))}
                </div>

                {/* Prediction */}
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Prediction</div>
                  <div className="text-[15px] font-bold text-gray-900">{selectedRecord?.urgent ? 'Atypical Cells Detected' : 'Specimen Under Review'}</div>
                  <div className="text-[11px] text-gray-500">{selectedRecord?.client ?? 'Awaiting analysis'}</div>
                </div>

                <div className="h-px w-full bg-gray-100" />

                {/* XAI — AI evidence with per-finding confidence */}
                <div>
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">AI Evidence</div>
                  {[
                    { label: 'Nuclear enlargement', confidence: 94 },
                    { label: 'Hyperchromasia', confidence: 87 },
                    { label: 'Dense clustering', confidence: 81 },
                    { label: 'Irregular chromatin', confidence: 73 },
                  ].map(({ label, confidence }) => (
                    <div key={label} className="mb-2 last:mb-0">
                      <div className="mb-0.5 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-emerald-500">✓</span>
                          <span className="text-[11px] font-medium text-gray-700">{label}</span>
                        </div>
                        <span className="text-[11px] font-bold text-gray-600">{confidence}%</span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-indigo-400" style={{ width: `${confidence}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="h-px w-full bg-gray-100" />

                {/* Human review workflow timeline */}
                <div>
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Review Workflow</div>
                  {[
                    { label: 'AI Screening Complete', done: true, active: false },
                    { label: 'Human Review Pending', done: false, active: true },
                    { label: 'Pathologist Authorization', done: false, active: false },
                    { label: 'Released', done: false, active: false },
                  ].map(({ label, done, active }) => (
                    <div key={label} className="mb-1.5 flex items-center gap-2 last:mb-0">
                      <div className={`h-3 w-3 flex-shrink-0 rounded-full ${done ? 'bg-emerald-500' : active ? 'animate-pulse bg-indigo-500' : 'bg-gray-200'}`} />
                      <span className={`text-[11px] ${done ? 'font-medium text-emerald-600' : active ? 'font-bold text-indigo-600' : 'font-medium text-gray-400'}`}>{label}</span>
                    </div>
                  ))}
                </div>

                {/* Recommended next step — guided CTA with review time / priority / role.
                    Zero-orange: amber-50/100 + amber-800/900 only (amber-600/700 render or
                    anti-alias orange); HIGH priority uses red-600. */}
                <div className="mt-auto rounded-xl border border-amber-100 bg-amber-50 p-3">
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-800">Recommended Next Step</div>
                  <div className="mb-2 text-[13px] font-bold text-amber-900">Immediate Cytotechnologist Review</div>
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-amber-800">Estimated review time</div>
                      <div className="text-[12px] font-bold text-amber-900">3 min</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-amber-800">Priority</div>
                      <div className="text-[12px] font-bold text-red-600">HIGH</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-amber-800">AI Role</div>
                      <div className="text-[12px] font-bold text-amber-900">Screening Only</div>
                    </div>
                  </div>
                  <button onClick={() => router.push(`/records/${selectedRecord?.id ?? ''}`)} className="w-full rounded-xl bg-indigo-600 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-indigo-700">Open Review →</button>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ SECTION 3: BOTTOM ROW ═══ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
            {/* Monthly Case Volume */}
            <div style={{ background: '#FAFBFF', borderRadius: 20, padding: '20px 24px', border: '1px solid #F1F0EA' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>Monthly Case Volume</span>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 999, padding: '3px 10px', cursor: 'pointer' }}>6 Months ▾</div>
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
                    <div style={{ fontSize: 12, color: '#475569', fontWeight: 500, marginTop: 4 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Case Distribution by Type */}
            <div style={{ background: '#FAFBFF', borderRadius: 20, padding: '20px 24px', border: '1px solid #F1F0EA' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif', marginBottom: 16 }}>Case Distribution by Type</div>
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
                    <div style={{ fontSize: 11, color: '#475569', fontWeight: 600, textAlign: 'center', marginTop: 3 }}>Total Cases</div>
                  </div>
                </div>
                <div style={{ width: '100%', maxWidth: 280, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {specimenTypesDynamic.map(({ label, color, pct }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>{label}</span>
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
                <span style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>AI Performance</span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#4F46E5', fontFamily: 'Geist,sans-serif', lineHeight: 1.1 }}>{eff?.authorization ?? 0}%</div>
                  <div style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>Accuracy</div>
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
                    <span style={{ width: 82, fontSize: 12, color: '#475569', fontWeight: 600, flexShrink: 0 }}>{label}</span>
                    <div style={{ flex: 1, height: 8, borderRadius: 999, background: '#EEF0F6', overflow: 'hidden' }}>
                      <div style={{ width: `${v}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#6366F1,#6D28D9)' }} />
                    </div>
                    <span style={{ width: 36, textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#0F172A', flexShrink: 0 }}>{v}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div style={{ background: '#FAFBFF', borderRadius: 20, padding: '20px', border: '1px solid #F1F0EA', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', fontFamily: 'Geist,sans-serif' }}>Recent Activity</span>
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
                        {a.labNumber && <div style={{ fontSize: 12, color: '#475569', fontWeight: 500, marginTop: 2 }}>{a.labNumber}</div>}
                      </div>
                      <div style={{ fontSize: 12, color: '#475569', fontWeight: 500, flexShrink: 0 }}>{new Date(a.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div>
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
