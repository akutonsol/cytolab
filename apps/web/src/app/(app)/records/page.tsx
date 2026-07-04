'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle, AlertTriangle, CheckCircle, ChevronDown, Filter, FlaskConical, MoreHorizontal, Pencil, Plus,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { RecordFormDrawer } from '@/components/RecordFormDrawer';
import { FeatureGate } from '@/components/FeatureGate';
import type { FormType } from '@/lib/specimen-types';

interface Rec {
  id: string; labNumber?: string | null; identifier: string; formType?: string | null; status: string; urgent: boolean;
  specimenDate?: string | null; createdAt: string;
  patient?: { firstName: string; lastName: string; registrationNo?: string };
  specimens?: { id: string; type?: string }[];
  resultSheets?: { id: string; authorized: boolean }[];
  statusHistory?: { status: string; createdAt: string; user?: { firstName?: string; lastName?: string } | null }[];
  client?: { firstName: string; lastName: string; officeName?: string | null; accountNo?: string | null };
}

const SPECIMEN: Record<string, string> = {
  ENDOCERV_ASP: 'Endocervical asp.', CERV_SCRAP: 'Cervical scrape', VAG_POOL: 'Vaginal pool', URINE: 'Urine cytology',
  CSF: 'CSF', PLEURAL_FLD: 'Pleural fluid', BREAST_ASP: 'Breast asp.', JOINT_ASP: 'Joint asp.', SYNOVIAL_FLD: 'Synovial fluid', OTHER: 'Other',
  SPUTUM: 'Sputum cytology', BRONCHIAL_WASH: 'Bronchial wash', THYROID_FNA: 'Thyroid FNA', LYMPH_NODE: 'Lymph node FNA', BONE_MARROW: 'Bone marrow', SKIN_SCRAPING: 'Skin scraping',
};
const ACTIVE = ['Pending', 'Submitted', 'Processing', 'Partial', 'Completed', 'Resulted'];
const COMPLETED_SET = ['Approved', 'Billed', 'Paid', 'Viewed'];
const PROCESSING_SET = ['Processing', 'Partial', 'Submitted'];

// ── Design tokens (DESIGN.md) ────────────────────────────────────────────────
const GEIST = "'Geist', 'Inter', system-ui, sans-serif";
const HEAD = '#0F172A';
const SECONDARY = '#49607e';
const PRIMARY = '#4F46E5';
const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.85)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(73,96,126,0.05)',
  boxShadow: '0 20px 40px rgba(0,0,0,0.04), 0 2px 4px rgba(79,70,229,0.05)',
  borderRadius: 16,
};

// Avatar palette (name-hashed). Amber swatch from the template swapped for
// violet to keep the zero-orange rule.
const AVATARS = [
  { bg: '#EEF2FF', fg: '#4F46E5' },
  { bg: '#F0FDF4', fg: '#16A34A' },
  { bg: '#FFF1F2', fg: '#E11D48' },
  { bg: '#F5F3FF', fg: '#7C3AED' },
  { bg: '#F0F9FF', fg: '#0284C7' },
];
const nameHash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const avatarFor = (name: string) => AVATARS[nameHash(name || '?') % AVATARS.length];

const specLabel = (t?: string | null) => (t ? SPECIMEN[t] ?? t : null);
const patientName = (r: Rec) => (r.patient ? `${r.patient.firstName} ${r.patient.lastName}`.trim() : '—');
const initials = (r: Rec) => ((r.patient?.firstName?.[0] ?? '') + (r.patient?.lastName?.[0] ?? '')).toUpperCase() || '??';
const clientLabel = (r: Rec) => (r.client ? (r.client.officeName || `${r.client.firstName} ${r.client.lastName}`.trim()) : '—');
const dateFmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const clock = (d: string) => new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const sameDay = (a: string | number, b: string | number) => new Date(a).toDateString() === new Date(b).toDateString();
const relTime = (d: string) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (sameDay(d, Date.now())) return `Today, ${clock(d)}`;
  if (sameDay(d, Date.now() - 86_400_000)) return 'Yesterday';
  return `${Math.floor(s / 86400)}d ago`;
};
const overdueH = (d: string) => Math.round(((Date.now() - new Date(d).getTime()) / 3_600_000) * 10) / 10;

const statusBadge = (s: string): { bg: string; fg: string } => {
  switch (s) {
    case 'Processing':
    case 'Partial': return { bg: '#EEF2FF', fg: '#4F46E5' };
    case 'Completed': return { bg: '#dcfce7', fg: '#16A34A' };
    case 'Resulted': return { bg: '#dbeafe', fg: '#1d4ed8' };
    case 'Approved':
    case 'Billed':
    case 'Paid':
    case 'Viewed': return { bg: '#dcfce7', fg: '#16A34A' };
    case 'Submitted': return { bg: '#e2e8f0', fg: '#49607e' };
    case 'Failed':
    case 'Disabled': return { bg: '#fef2f2', fg: '#dc2626' };
    default: return { bg: '#f1f4f7', fg: '#49607e' };
  }
};
const STATUS_ACTION: Record<string, string> = {
  Pending: 'created', Submitted: 'submitted', Processing: 'in processing', Partial: 'partially resulted',
  Completed: 'completed', Resulted: 'resulted', Approved: 'approved', Billed: 'billed', Paid: 'paid',
  Viewed: 'viewed', OnHold: 'put on hold', Failed: 'failed', Disabled: 'cancelled',
};
const statusAction = (s: string) => STATUS_ACTION[s] ?? s.toLowerCase();

const kpiLabel: React.CSSProperties = { fontFamily: GEIST, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: SECONDARY };
const cardHead: React.CSSProperties = { fontFamily: GEIST, fontSize: 18, fontWeight: 600, color: HEAD };

function Kpi({ label, value, delta, deltaColor, icon, iconBg, iconFg, borderLeft }:
  { label: string; value: number; delta: string; deltaColor: string; icon: React.ReactNode; iconBg: string; iconFg: string; borderLeft?: string }) {
  return (
    <div style={{ ...glass, padding: 16, display: 'flex', flexDirection: 'column', ...(borderLeft ? { borderLeft: `4px solid ${borderLeft}` } : {}) }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={{ ...kpiLabel, fontSize: 10 }}>{label}</span>
        <span style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', background: iconBg, color: iconFg }}>{icon}</span>
      </div>
      <span style={{ fontFamily: GEIST, fontSize: 30, fontWeight: 700, lineHeight: 1, color: HEAD, marginTop: 8 }}>{value.toLocaleString()}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: deltaColor, marginTop: 5 }}>{delta}</span>
    </div>
  );
}

function Bar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 14, color: HEAD }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ width: '100%', height: 8, borderRadius: 999, background: '#ebeef1', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, borderRadius: 999, background: color }} />
      </div>
    </div>
  );
}

// Form-type icon: requisition form for GYN, specimen tube/vial for NON-GYN.
function FormTypeIcon({ gyn }: { gyn: boolean }) {
  return (
    <div style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, background: gyn ? '#EEF3FF' : '#F1F5F9', color: gyn ? PRIMARY : SECONDARY, display: 'grid', placeItems: 'center' }}>
      {gyn ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect x="8" y="2" width="8" height="20" rx="4" />
          <line x1="8" y1="7" x2="16" y2="7" />
          <line x1="12" y1="12" x2="12" y2="16" />
        </svg>
      )}
    </div>
  );
}

export default function SamplesPage() {
  const { can } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const message = {
    success: (msg: string) => { setToast({ type: 'ok', msg }); setTimeout(() => setToast(null), 3000); },
    error: (msg: string) => { setToast({ type: 'err', msg }); setTimeout(() => setToast(null), 3000); },
  };
  const [chooseOpen, setChooseOpen] = useState(false);
  const [drawer, setDrawer] = useState<{ formType: FormType; recordId?: string } | null>(null);
  const [goal, setGoal] = useState(150);
  const [editingGoal, setEditingGoal] = useState(false);
  const [visibleCount, setVisibleCount] = useState(8);
  const sentinelRef = useRef<HTMLTableRowElement | null>(null);
  const hasMoreRef = useRef(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [fStatus, setFStatus] = useState('');
  const [fUrgent, setFUrgent] = useState(false);
  const [fQuery, setFQuery] = useState('');

  const { data } = useQuery({
    queryKey: ['records-all'],
    queryFn: () => api.get<Paginated<Rec>>('/specimens', { params: { page: 1, pageSize: 500 } }).then((r) => r.data),
  });
  const all = data?.data ?? [];

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/specimen/delete/${id}`),
    onSuccess: () => { message.success('Sample deleted'); qc.invalidateQueries({ queryKey: ['records-all'] }); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Could not delete'),
  });

  // ── Derived counts (all client-side from the loaded window) ────────────────
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const startYest = new Date(startToday); startYest.setDate(startYest.getDate() - 1);
  const newToday = all.filter((r) => new Date(r.createdAt) >= startToday).length;
  const newYest = all.filter((r) => { const d = new Date(r.createdAt); return d >= startYest && d < startToday; }).length;
  const newDelta = newYest ? Math.round(((newToday - newYest) / newYest) * 100) : (newToday > 0 ? 100 : 0);

  const completedCount = all.filter((r) => COMPLETED_SET.includes(r.status)).length;
  const authorized = all.filter((r) => (r.resultSheets ?? []).some((s) => s.authorized)).length;
  const accuracy = all.length ? Math.round((authorized / all.length) * 100) : 0;
  const processingCount = all.filter((r) => PROCESSING_SET.includes(r.status)).length;
  const urgentAll = all.filter((r) => r.urgent);

  const approvedRecs = all.filter((r) => COMPLETED_SET.includes(r.status));
  const analyzerPct = all.length ? Math.round((approvedRecs.length / all.length) * 100) : 0;
  const withinTat = approvedRecs.filter((r) => {
    const sub = r.statusHistory?.find((h) => h.status === 'Submitted')?.createdAt;
    const app = r.statusHistory?.find((h) => h.status === 'Approved')?.createdAt;
    return sub && app && (new Date(app).getTime() - new Date(sub).getTime()) <= 3 * 86_400_000;
  }).length;
  const tatPct = approvedRecs.length ? Math.round((withinTat / approvedRecs.length) * 100) : 0;

  // Bars: bucket by day of week (Mon→Sun), current day highlighted.
  const WD = [{ k: 1, l: 'M' }, { k: 2, l: 'T' }, { k: 3, l: 'W' }, { k: 4, l: 'T' }, { k: 5, l: 'F' }, { k: 6, l: 'S' }, { k: 0, l: 'S' }];
  const todayDow = new Date().getDay();
  const bars = WD.map((w) => ({ l: w.l, v: all.filter((r) => new Date(r.createdAt).getDay() === w.k).length, cur: w.k === todayDow }));
  const barPeak = Math.max(1, ...bars.map((b) => b.v));

  const activeRecs = all
    .filter((r) => ACTIVE.includes(r.status))
    .filter((r) => (fStatus ? r.status === fStatus : true))
    .filter((r) => (fUrgent ? r.urgent : true))
    .filter((r) => {
      if (!fQuery) return true;
      const s = fQuery.toLowerCase();
      return patientName(r).toLowerCase().includes(s) || (r.labNumber ?? '').toLowerCase().includes(s);
    });
  const activeFilterCount = (fStatus ? 1 : 0) + (fUrgent ? 1 : 0) + (fQuery ? 1 : 0);
  const clearFilters = () => { setFStatus(''); setFUrgent(false); setFQuery(''); };
  const worklist = activeRecs.slice(0, visibleCount);
  const hasMore = visibleCount < activeRecs.length;
  hasMoreRef.current = hasMore;

  const events = all
    .flatMap((r) => (r.statusHistory ?? []).map((h) => ({ status: h.status, createdAt: h.createdAt, user: h.user, labNumber: r.labNumber })))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  const openChoose = () => { if (can('record:create')) setChooseOpen(true); };

  // Infinite scroll: reveal more active rows as the sentinel nears the viewport.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMoreRef.current) setVisibleCount((c) => c + 8);
    }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [activeRecs.length]);
  // Reset the window when filters change.
  useEffect(() => { setVisibleCount(8); }, [fStatus, fUrgent, fQuery]);

  return (
    <div className="flex flex-col gap-6">
      {/* ═══════════ HEADER ═══════════ */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 style={{ fontFamily: GEIST, fontSize: 28, fontWeight: 700, color: HEAD, lineHeight: 1.1 }}>Sample Management</h1>
          <p style={{ fontSize: 14, color: SECONDARY, marginTop: 4 }}>Real-time status tracking for clinical diagnostic samples.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <div style={{ position: 'relative' }}>
            <button onClick={() => setFiltersOpen((v) => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 18px', borderRadius: 12, background: '#fff', border: `1px solid ${filtersOpen || activeFilterCount ? PRIMARY : '#e6e9f2'}`, color: activeFilterCount ? PRIMARY : HEAD, fontFamily: GEIST, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              <Filter size={16} /> Filters
              {activeFilterCount > 0 && <span style={{ display: 'grid', placeItems: 'center', minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: PRIMARY, color: '#fff', fontSize: 11, fontWeight: 700 }}>{activeFilterCount}</span>}
            </button>
            {filtersOpen && (
              <>
                <div onClick={() => setFiltersOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{ position: 'absolute', right: 0, top: 52, zIndex: 50, width: 288, background: '#fff', border: '1px solid #ebeef1', borderRadius: 16, boxShadow: '0 20px 40px rgba(0,0,0,0.10), 0 2px 4px rgba(79,70,229,0.05)', padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ ...cardHead, fontSize: 15 }}>Filter Worklist</span>
                    {activeFilterCount > 0 && <button onClick={clearFilters} style={{ background: 'none', border: 'none', cursor: 'pointer', color: PRIMARY, fontSize: 12, fontWeight: 600 }}>Clear all</button>}
                  </div>

                  <label style={{ ...kpiLabel, display: 'block', marginBottom: 6 }}>Search</label>
                  <input value={fQuery} onChange={(e) => setFQuery(e.target.value)} placeholder="Patient or LAB#"
                    style={{ width: '100%', height: 38, borderRadius: 10, border: '1px solid #e6e9f2', padding: '0 12px', fontSize: 14, color: HEAD, outline: 'none', boxSizing: 'border-box' }} />

                  <label style={{ ...kpiLabel, display: 'block', margin: '14px 0 6px' }}>Status</label>
                  <div style={{ position: 'relative' }}>
                    <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}
                      style={{ width: '100%', height: 38, borderRadius: 10, border: '1px solid #e6e9f2', padding: '0 32px 0 12px', fontSize: 14, color: HEAD, outline: 'none', appearance: 'none', background: '#fff', cursor: 'pointer', boxSizing: 'border-box' }}>
                      <option value="">All active statuses</option>
                      {ACTIVE.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <ChevronDown size={15} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: SECONDARY, pointerEvents: 'none' }} />
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, cursor: 'pointer', fontSize: 14, color: HEAD }}>
                    <input type="checkbox" checked={fUrgent} onChange={(e) => setFUrgent(e.target.checked)} style={{ width: 15, height: 15, accentColor: PRIMARY, cursor: 'pointer' }} />
                    Urgent only
                  </label>

                  <button onClick={() => setFiltersOpen(false)} style={{ width: '100%', marginTop: 16, height: 40, borderRadius: 10, background: PRIMARY, border: 'none', color: '#fff', fontFamily: GEIST, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Done</button>
                </div>
              </>
            )}
          </div>
          {can('record:create') && (
            <button onClick={openChoose} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 20px', borderRadius: 12, background: PRIMARY, border: 'none', color: '#fff', fontFamily: GEIST, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={17} /> New Sample
            </button>
          )}
        </div>
      </div>

      {/* ═══════════ CONTENT GRID ═══════════ */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      {/* ═══════════ LEFT COLUMN ═══════════ */}
      <div className="flex min-w-0 flex-col gap-6">
        {/* Top band: compact KPIs next to Urgent Flagged + Automation */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_1fr_1fr]">
          <div className="grid grid-cols-2 gap-4">
            <Kpi label="New Samples" value={newToday}
              delta={`${newDelta >= 0 ? '↑ +' : '↓ '}${newDelta}% vs yesterday`}
              deltaColor={newDelta >= 0 ? '#16A34A' : '#E11D48'}
              icon={<Plus size={15} />} iconBg="#EEF2FF" iconFg={PRIMARY} />
            <Kpi label="Completed" value={completedCount}
              delta={`${accuracy}% Accuracy`} deltaColor="#16A34A"
              icon={<CheckCircle size={15} />} iconBg="#F0FDF4" iconFg="#16A34A" borderLeft="#65A30D" />
            <Kpi label="Processing" value={processingCount}
              delta="Active in lab" deltaColor={PRIMARY}
              icon={<FlaskConical size={15} />} iconBg="#EEF2FF" iconFg={PRIMARY} />
            <Kpi label="Urgent" value={urgentAll.length}
              delta="Requires attention" deltaColor="#E11D48"
              icon={<AlertTriangle size={15} />} iconBg="#FFF1F2" iconFg="#E11D48" borderLeft="#E11D48" />
          </div>

          {/* Urgent Flagged Cases */}
          <div style={{ ...glass, padding: 20 }}>
            <div style={{ ...cardHead, fontSize: 16 }}>Urgent Flagged Cases</div>
            <div style={{ marginTop: 12 }}>
              {urgentAll.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '18px 0', color: '#16A34A', fontSize: 14, fontWeight: 600 }}>✓ No urgent cases</div>
              ) : (
                urgentAll.slice(0, 4).map((r) => (
                  <div key={r.id} onClick={() => router.push(`/records/${r.id}`)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px', background: '#fff1f2', borderRadius: 10, marginBottom: 8, cursor: 'pointer' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: HEAD, whiteSpace: 'nowrap' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: '#E11D48' }} />LAB# {r.labNumber ?? '—'}
                    </span>
                    <span style={{ fontSize: 12, color: '#E11D48', fontWeight: 600, whiteSpace: 'nowrap' }}>{overdueH(r.createdAt)}h overdue</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Automation Overview */}
          <div style={{ ...glass, padding: 20 }}>
            <div style={{ ...cardHead, fontSize: 16 }}>Automation Overview</div>
            <div style={{ fontSize: 12, color: SECONDARY, marginTop: 2 }}>Instrument efficiency for current shift</div>
            <Bar label="Analyzer Performance" pct={analyzerPct} color={PRIMARY} />
            <FeatureGate feature="TAT_ALERTS">
              <Bar label="Avg TAT Performance" pct={tatPct} color="#16A34A" />
            </FeatureGate>
          </div>
        </div>

        {/* Active Worklist */}
        <div style={{ ...glass, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #ebeef1' }}>
            <span style={cardHead}>Active Worklist</span>
            <button onClick={openChoose} title="New sample" style={{ color: SECONDARY, background: 'none', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
              <MoreHorizontal size={18} />
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Patient', 'Accession / Lab ID', 'Status', 'Details'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px 24px', borderBottom: '1px solid #ebeef1', fontFamily: GEIST, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: SECONDARY }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {worklist.length === 0 && (
                <tr><td colSpan={4} style={{ padding: '40px 24px', textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>No active samples.</td></tr>
              )}
              {worklist.map((r) => {
                const av = avatarFor(patientName(r));
                const sb = statusBadge(r.status);
                return (
                  <tr key={r.id} onClick={() => router.push(`/records/${r.id}`)}
                    style={{ cursor: 'pointer', borderBottom: '1px solid #f1f4f7' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f7fafd')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                    {/* Patient */}
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <FormTypeIcon gyn={r.formType === 'Gynecology'} />
                        <div style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0, background: av.bg, color: av.fg, display: 'grid', placeItems: 'center', fontFamily: GEIST, fontSize: 15, fontWeight: 700 }}>{initials(r)}</div>
                        <div>
                          <div style={{ fontSize: 17, fontWeight: 600, color: HEAD }}>{patientName(r)}</div>
                          {r.patient?.registrationNo && <div style={{ fontSize: 13, color: SECONDARY, marginTop: 2 }}>Reg No: {r.patient.registrationNo}</div>}
                        </div>
                      </div>
                    </td>
                    {/* Accession / Lab ID */}
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ fontFamily: GEIST, fontSize: 16, fontWeight: 700, color: HEAD }}>LAB# {r.labNumber ?? '—'}</div>
                      <div style={{ fontSize: 13, color: SECONDARY, marginTop: 2 }}>{clientLabel(r)}</div>
                    </td>
                    {/* Status */}
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 13px', borderRadius: 999, fontSize: 13, fontWeight: 700, background: sb.bg, color: sb.fg }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: sb.fg }} />{r.status}
                      </span>
                      {r.urgent && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 11, fontWeight: 700, color: '#E11D48' }}>
                          <AlertCircle size={11} /> URGENT
                        </div>
                      )}
                    </td>
                    {/* Details */}
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ fontSize: 16, color: HEAD }}>{specLabel(r.specimens?.[0]?.type) ?? (r.formType === 'Gynecology' ? 'Gynaecology' : 'Non-Gynaecology')}</div>
                      <div style={{ fontSize: 13, color: SECONDARY, marginTop: 2 }}>{dateFmt(r.specimenDate ?? r.createdAt)}</div>
                    </td>
                  </tr>
                );
              })}
              <tr ref={sentinelRef}>
                <td colSpan={4} style={{ padding: '14px 24px', textAlign: 'center', color: '#94A3B8', fontSize: 13, fontWeight: 500 }}>
                  {hasMore ? 'Loading more…' : activeRecs.length > 0 ? `Showing all ${activeRecs.length} active samples` : ''}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>

      {/* ═══════════ RIGHT COLUMN ═══════════ */}
      <div className="flex flex-col gap-6">
        {/* Samples Processed */}
        <div style={{ ...glass, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={cardHead}>Samples Processed</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #ebeef1', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: SECONDARY, cursor: 'pointer' }}>Week <ChevronDown size={13} /></span>
          </div>
          <div style={{ fontFamily: GEIST, fontSize: 56, fontWeight: 700, lineHeight: 1, color: HEAD, marginTop: 12 }}>{all.length}</div>
          <div style={{ fontSize: 13, color: SECONDARY, marginTop: 4 }}>Total samples today</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120, marginTop: 18 }}>
            {bars.map((b, i) => (
              <div key={i} style={{ flex: 1, height: `${(b.v / barPeak) * 100}%`, minHeight: 4, background: b.cur ? PRIMARY : '#e2dfff', borderRadius: '6px 6px 0 0' }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {bars.map((b, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', fontFamily: GEIST, fontSize: 12, fontWeight: b.cur ? 700 : 500, color: b.cur ? PRIMARY : '#94A3B8' }}>{b.l}</div>
            ))}
          </div>
        </div>

        {/* Completion Rate */}
        <div style={{ ...glass, padding: 24 }}>
          <div style={cardHead}>Completion Rate</div>
          <div style={{ fontSize: 13, color: SECONDARY, marginTop: 2 }}>Shift objective status</div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}><Gauge value={approvedRecs.length} goal={goal} /></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid #ebeef1', paddingTop: 16, marginTop: 16 }}>
            <span style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: '#f1f4f7', color: SECONDARY, display: 'grid', placeItems: 'center' }}><Pencil size={15} /></span>
            {editingGoal ? (
              <input autoFocus type="number" defaultValue={goal}
                onBlur={(e) => { setGoal(Math.max(1, +e.target.value || goal)); setEditingGoal(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { setGoal(Math.max(1, +(e.target as HTMLInputElement).value || goal)); setEditingGoal(false); } }}
                style={{ flex: 1, height: 40, borderRadius: 12, border: `1px solid ${PRIMARY}`, padding: '0 12px', fontSize: 14, fontWeight: 600, color: HEAD, outline: 'none' }} />
            ) : (
              <button onClick={() => setEditingGoal(true)} style={{ flex: 1, background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, padding: '10px 20px', fontFamily: GEIST, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Change Target</button>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div style={{ ...glass, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={cardHead}>Recent Activity</span>
            <button onClick={() => router.push('/records')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: PRIMARY, fontFamily: GEIST, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>VIEW ALL</button>
          </div>
          <div style={{ marginTop: 12 }}>
            {events.length === 0 && <div style={{ padding: '16px 0', textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>No recent activity.</div>}
            {events.map((ev, i) => {
              const ui = ((ev.user?.firstName?.[0] ?? '') + (ev.user?.lastName?.[0] ?? '')).toUpperCase();
              return (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #f1f4f7' }}>
                  <span style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: '#EEF2FF', color: PRIMARY, display: 'grid', placeItems: 'center', fontFamily: GEIST, fontSize: 12, fontWeight: 700 }}>
                    {ui || <FlaskConical size={15} />}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: HEAD }}>
                      Sample <span style={{ background: '#EEF2FF', color: PRIMARY, padding: '2px 8px', borderRadius: 999, fontFamily: GEIST, fontSize: 11, fontWeight: 700 }}>{ev.labNumber ?? '—'}</span> {statusAction(ev.status)}
                    </div>
                    <div style={{ fontSize: 12, color: SECONDARY, marginTop: 2 }}>{relTime(ev.createdAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Choose form (New Sample) */}
      {chooseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setChooseOpen(false)}>
          <div className="w-full max-w-md rounded-card bg-white p-6 shadow-float" onClick={(e) => e.stopPropagation()}>
            <div style={{ ...cardHead, fontSize: 20 }}>New sample</div>
            <div style={{ fontSize: 14, color: SECONDARY, marginTop: 2 }}>Choose the form type to begin.</div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {(['Gynecology', 'NonGynecology'] as FormType[]).map((ft) => (
                <button key={ft} onClick={() => { setChooseOpen(false); setDrawer({ formType: ft }); }}
                  className="flex flex-col items-center gap-2 rounded-control border border-card py-7 transition-colors hover:border-primary hover:bg-primary-soft">
                  <FlaskConical size={26} className="text-primary" />
                  <span className="text-small font-bold text-text">{ft === 'Gynecology' ? 'Gynecology' : 'Non-Gynecology'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {drawer && <RecordFormDrawer open onClose={() => { setDrawer(null); qc.invalidateQueries({ queryKey: ['records-all'] }); }} formType={drawer.formType} recordId={drawer.recordId} />}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 text-[14px] font-semibold text-white shadow-lg"
          style={{ background: toast.type === 'ok' ? '#16A34A' : '#DC2626' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function Gauge({ value, goal }: { value: number; goal: number }) {
  const size = 190, sw = 14, r = (size - sw) / 2 - 6, cx = size / 2, cy = size / 2;
  const c = 2 * Math.PI * r;
  const arc = 0.72; // 260° sweep, gap at the bottom
  const frac = Math.min(1, goal ? value / goal : 0);
  const start = 135; // degrees (7–8 o'clock)
  const ang = (start + frac * arc * 360) * (Math.PI / 180);
  const mx = cx + r * Math.cos(ang), my = cy + r * Math.sin(ang);
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef2f7" strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={`${arc * c} ${c}`} transform={`rotate(${start} ${cx} ${cy})`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#4F46E5" strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={`${frac * arc * c} ${c}`} transform={`rotate(${start} ${cx} ${cy})`} />
        <circle cx={mx} cy={my} r={5} fill="#fff" stroke="#4F46E5" strokeWidth={3} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: GEIST, fontSize: 48, fontWeight: 700, color: HEAD, letterSpacing: '-0.02em' }}>{value}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: SECONDARY }}>Goal {goal}</span>
      </div>
    </div>
  );
}
