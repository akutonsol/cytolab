'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity, AlertTriangle, CheckCircle2, Droplet, Droplets, Eye, Filter,
  FlaskConical, Microscope, MoreHorizontal, Plus, Printer, Search, Settings, Syringe, TestTube, Trash2, X,
  type LucideIcon,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PieChart, Pie, Cell } from 'recharts';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { RecordFormDrawer } from '@/components/RecordFormDrawer';
import { PrintLabelsModal } from '@/components/PrintLabelsModal';
import { useFeatures } from '@/lib/feature-context';
import { useInfiniteScroll, clientPage } from '@/hooks/useInfiniteScroll';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import type { FormType } from '@/lib/specimen-types';

interface Rec {
  id: string; labNumber?: string | null; identifier?: string; formType?: string | null; status: string; urgent: boolean;
  specimenDate?: string | null; createdAt: string; updatedAt?: string | null;
  patient?: { firstName: string; lastName: string; registrationNo?: string | null; gender?: string | null; dateOfBirth?: string | null };
  assignedToId?: string | null;
  assignedTo?: { id: string; firstName: string; lastName: string } | null;
  specimens?: { id: string; type?: string }[];
  resultSheets?: { id: string; authorized: boolean }[];
  statusHistory?: { status: string; createdAt: string; user?: { firstName?: string; lastName?: string } | null }[];
  client?: { firstName: string; lastName: string; officeName?: string | null; accountNo?: string | null };
}

const SPECIMEN: Record<string, string> = {
  ENDOCERV_ASP: 'Endocervical Asp.', CERV_SCRAP: 'Cervical Scrape', VAG_POOL: 'Vaginal Pool', URINE: 'Urine Cytology',
  CSF: 'CSF', PLEURAL_FLD: 'Pleural Fluid', BREAST_ASP: 'Breast Aspirate', JOINT_ASP: 'Joint Asp.', SYNOVIAL_FLD: 'Synovial Fluid', OTHER: 'Other',
  BODY_FLUID: 'Body Fluid', SPUTUM: 'Sputum', BRONCHIAL_WASH: 'Bronchial Wash', THYROID_FNA: 'Thyroid FNA', LYMPH_NODE: 'Lymph Node FNA', BONE_MARROW: 'Bone Marrow', SKIN_SCRAPING: 'Skin Scraping',
};
const SPEC_COLOR: Record<string, string> = {
  PLEURAL_FLD: '#3B82F6', URINE: '#FACC15', BREAST_ASP: '#EC4899', CERV_SCRAP: '#22C55E', ENDOCERV_ASP: '#8B5CF6', VAG_POOL: '#8B5CF6',
  CSF: '#06B6D4', SYNOVIAL_FLD: '#14B8A6', JOINT_ASP: '#14B8A6', BODY_FLUID: '#14B8A6', SPUTUM: '#3B82F6', BRONCHIAL_WASH: '#3B82F6',
  THYROID_FNA: '#0D9488', LYMPH_NODE: '#0D9488', OTHER: '#475569',
};
const specColor = (t?: string) => SPEC_COLOR[t ?? ''] ?? '#475569';
const specLabel = (t?: string | null) => (t ? SPECIMEN[t] ?? t : 'Other');

// Specimen enum → Lucide icon + chip colours (inline hex so JIT can't purge them).
// Urine keeps a detector-safe yellow (#EAB308) per the zero-orange rule.
const SPEC_UI: Record<string, { Icon: LucideIcon; bg: string; fg: string }> = {
  PLEURAL_FLD: { Icon: Droplets, bg: '#DBEAFE', fg: '#2563EB' },
  SPUTUM: { Icon: Droplets, bg: '#DBEAFE', fg: '#2563EB' },
  BRONCHIAL_WASH: { Icon: Droplets, bg: '#DBEAFE', fg: '#2563EB' },
  URINE: { Icon: FlaskConical, bg: '#FEF9C3', fg: '#EAB308' },
  BREAST_ASP: { Icon: Syringe, bg: '#FCE7F3', fg: '#DB2777' },
  THYROID_FNA: { Icon: Syringe, bg: '#FCE7F3', fg: '#DB2777' },
  LYMPH_NODE: { Icon: Syringe, bg: '#FCE7F3', fg: '#DB2777' },
  CERV_SCRAP: { Icon: Microscope, bg: '#DCFCE7', fg: '#16A34A' },
  ENDOCERV_ASP: { Icon: TestTube, bg: '#F3E8FF', fg: '#9333EA' },
  VAG_POOL: { Icon: TestTube, bg: '#F3E8FF', fg: '#9333EA' },
  BODY_FLUID: { Icon: Droplet, bg: '#CCFBF1', fg: '#0D9488' },
  CSF: { Icon: Droplet, bg: '#CCFBF1', fg: '#0D9488' },
  SYNOVIAL_FLD: { Icon: Droplet, bg: '#CCFBF1', fg: '#0D9488' },
  JOINT_ASP: { Icon: Droplet, bg: '#CCFBF1', fg: '#0D9488' },
  OTHER: { Icon: FlaskConical, bg: '#F1F5F9', fg: '#475569' },
};
const specUI = (t?: string) => SPEC_UI[t ?? ''] ?? { Icon: FlaskConical, bg: '#F1F5F9', fg: '#475569' };

// Specimen options shown in the worklist filter popover (enum → label).
const SPEC_FILTER_OPTS: [string, string][] = [
  ['PLEURAL_FLD', 'Pleural Fluid'], ['URINE', 'Urine Cytology'], ['BREAST_ASP', 'Breast Aspirate'],
  ['CERV_SCRAP', 'Cervical Scrape'], ['ENDOCERV_ASP', 'Endocervical Asp.'], ['BODY_FLUID', 'Body Fluid'], ['OTHER', 'Other'],
];

const ACTIVE = ['Pending', 'Submitted', 'Processing', 'Partial', 'Completed', 'Resulted'];
const COMPLETED_SET = ['Approved', 'Billed', 'Paid', 'Viewed'];
const PROCESSING_SET = ['Processing', 'Partial'];
const GREEN = '#16A34A', RED = '#E11D48', INDIGO = '#4F46E5', BLUE = '#3B82F6', TEAL = '#14B8A6', SLATE = '#475569';

const AVATAR_HEX = ['#4F46E5', '#7C3AED', '#2563EB', '#0D9488', '#16A34A', '#9333EA'];
const avatarBg = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h += s.charCodeAt(i); return AVATAR_HEX[h % AVATAR_HEX.length]; };
const patientName = (r: Rec) => (r.patient ? `${r.patient.firstName} ${r.patient.lastName}`.trim() : '—');
const initialsOf = (name: string) => name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
const clientLabel = (r: Rec) => (r.client ? (r.client.officeName || `${r.client.firstName} ${r.client.lastName}`.trim()) : '—');
const physician = (r: Rec) => (r.client ? `${r.client.firstName} ${r.client.lastName}`.trim() : '');
const ageOf = (dob?: string | null) => { if (!dob) return null; const d = new Date(dob); return Number.isNaN(+d) ? null : Math.floor((Date.now() - d.getTime()) / (365.25 * 86_400_000)); };
const dateFmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const clock = (d?: string | null) => (d ? new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');
const sameDay = (a: string | number, b: string | number) => new Date(a).toDateString() === new Date(b).toDateString();
const relTime = (d: string) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (sameDay(d, Date.now())) return `Today, ${clock(d)}`;
  if (sameDay(d, Date.now() - 86_400_000)) return 'Yesterday';
  return `${Math.floor(s / 86400)}d ago`;
};
// Real elapsed time since the sample was received (no fabricated TAT target).
const elapsedLabel = (d: string) => { const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); return m < 90 ? `${m}m in lab` : m < 1440 ? `${Math.floor(m / 60)}h in lab` : `${Math.floor(m / 1440)}d in lab`; };
const STATUS_ACTION: Record<string, string> = { Pending: 'created', Submitted: 'submitted', Processing: 'processing', Partial: 'partially resulted', Completed: 'completed', Resulted: 'resulted', Approved: 'approved', Billed: 'billed', Paid: 'paid', Viewed: 'viewed', OnHold: 'on hold', Failed: 'failed', Disabled: 'cancelled' };
const statusAction = (s: string) => STATUS_ACTION[s] ?? s.toLowerCase();

const STATUS_PILL: Record<string, { bg: string; fg: string }> = {
  Processing: { bg: '#EDE9FE', fg: '#7C3AED' }, Partial: { bg: '#EDE9FE', fg: '#7C3AED' },
  Completed: { bg: '#DCFCE7', fg: GREEN }, Resulted: { bg: '#EEF2FF', fg: INDIGO },
  Approved: { bg: '#DCFCE7', fg: GREEN }, Billed: { bg: '#DCFCE7', fg: GREEN }, Paid: { bg: '#DCFCE7', fg: GREEN }, Viewed: { bg: '#DCFCE7', fg: GREEN },
  Submitted: { bg: '#E0F2FE', fg: '#0284C7' }, Failed: { bg: '#FEE2E2', fg: '#DC2626' }, Disabled: { bg: '#F1F5F9', fg: '#475569' },
  OnHold: { bg: '#FEF9C3', fg: '#854D0E' }, Pending: { bg: '#F1F5F9', fg: '#475569' },
};
const statusPill = (s: string) => STATUS_PILL[s] ?? { bg: '#F1F5F9', fg: '#475569' };

const CARD = 'rounded-xl border border-slate-100 bg-white shadow-sm';

// Real 7-day trend line — no data means no line (nothing fabricated).
function Sparkline({ color, data, w = 72, h = 30 }: { color: string; data: number[]; w?: number; h?: number }) {
  if (data.length < 2 || data.every((v) => v === data[0])) return <div style={{ width: w, height: h }} className="shrink-0" />;
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden><polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} /></svg>;
}

function KpiCard({ icon, iconClass, label, value, sub, subColor, spark, sparkData }: { icon: React.ReactNode; iconClass: string; label: string; value: React.ReactNode; sub: string; subColor: string; spark: string; sparkData: number[] }) {
  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${iconClass}`}>{icon}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
          </div>
          <div className="mt-2 text-3xl font-bold leading-none text-charcoal-heading">{value}</div>
          <div className="mt-1.5 text-[11px] font-semibold" style={{ color: subColor }}>{sub}</div>
        </div>
        <Sparkline color={spark} data={sparkData} />
      </div>
    </div>
  );
}

type Tab = 'all' | 'urgent' | 'processing' | 'submitted' | 'completed';

export default function SamplesPage() {
  const { can, claims } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const { isEnabled } = useFeatures();

  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [fMine, setFMine] = useState(false);
  const [fSpecTypes, setFSpecTypes] = useState<Set<string>>(new Set());
  const [fPriority, setFPriority] = useState<'all' | 'urgent' | 'normal'>('all');
  const [fDate, setFDate] = useState<'today' | '7' | '30' | 'all'>('7');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [chooseOpen, setChooseOpen] = useState(false);
  const [drawer, setDrawer] = useState<{ formType: FormType; recordId?: string } | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [labelSel, setLabelSel] = useState<Set<string>>(new Set());
  const [printIds, setPrintIds] = useState<string[] | null>(null);
  const [confirmDel, setConfirmDel] = useState<Rec | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const notify = (type: 'ok' | 'err', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };

  const { data } = useQuery({
    queryKey: ['records-all'],
    queryFn: () => api.get<Paginated<Rec>>('/specimens', { params: { page: 1, pageSize: 500 } }).then((r) => r.data),
  });
  // useMemo keeps `all` referentially stable while loading (a fresh [] each
  // render would retrigger the infinite-scroll fetchFn via `filtered`).
  const all = useMemo(() => data?.data ?? [], [data]);

  const { data: openEscalations } = useQuery({
    queryKey: ['escalations', 'open'],
    queryFn: () => api.get<Array<{ record: { id: string }; severity: string }>>('/escalations', { params: { open: true } }).then((r) => r.data),
    enabled: can('record:view') && isEnabled('ABNORMAL_ESCALATION'),
  });
  const escalatedRecordIds = useMemo(() => { const m = new Map<string, string>(); (openEscalations ?? []).forEach((e) => m.set(e.record.id, e.severity)); return m; }, [openEscalations]);

  const { data: qcFailures } = useQuery({
    queryKey: ['qc-failures-records'],
    queryFn: () => api.get<Paginated<{ recordId: string | null }>>('/qc', { params: { result: 'Fail', pageSize: 500 } }).then((r) => r.data),
    enabled: can('record:view') && isEnabled('QC_MODULE'),
  });
  const qcFailedRecordIds = useMemo(() => new Set((qcFailures?.data ?? []).map((c) => c.recordId).filter(Boolean) as string[]), [qcFailures]);

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/specimen/delete/${id}`),
    onSuccess: () => { notify('ok', 'Sample deleted'); qc.invalidateQueries({ queryKey: ['records-all'] }); setConfirmDel(null); },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Could not delete'),
  });

  const showAssignee = isEnabled('CASE_ASSIGNMENT');
  const showLabels = isEnabled('SLIDE_LABEL_PRINTING');
  const toggleLabelSel = (id: string) => setLabelSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const newToday = all.filter((r) => new Date(r.createdAt) >= startToday).length;
  const newSamples = all.filter((r) => ['Pending', 'Submitted'].includes(r.status)).length;
  const completedCount = all.filter((r) => COMPLETED_SET.includes(r.status)).length;
  const authorized = all.filter((r) => (r.resultSheets ?? []).some((s) => s.authorized)).length;
  const accuracy = all.length ? Math.round((authorized / all.length) * 1000) / 10 : 0;
  const processingCount = all.filter((r) => PROCESSING_SET.includes(r.status)).length;
  const urgentAll = all.filter((r) => r.urgent);
  const onHoldCount = all.filter((r) => r.status === 'OnHold').length;

  const approvedRecs = all.filter((r) => COMPLETED_SET.includes(r.status));
  const tatHours = approvedRecs.map((r) => {
    const sub = r.statusHistory?.find((h) => h.status === 'Submitted')?.createdAt;
    const app = r.statusHistory?.find((h) => h.status === 'Approved')?.createdAt;
    return sub && app ? (new Date(app).getTime() - new Date(sub).getTime()) / 3_600_000 : null;
  }).filter((v): v is number => v != null);
  const avgTat = tatHours.length ? Math.round((tatHours.reduce((s, v) => s + v, 0) / tatHours.length) * 10) / 10 : null;
  const tatPct = tatHours.length ? Math.round((tatHours.filter((h) => h <= 72).length / tatHours.length) * 100) : 0;

  // Completion-rate donut (proportional workload).
  const completionSegs = [
    { label: 'Completed', value: completedCount, color: GREEN },
    { label: 'Processing', value: processingCount, color: '#7C3AED' },
    { label: 'Urgent', value: urgentAll.length, color: RED },
    { label: 'On Hold', value: onHoldCount, color: SLATE },
  ];
  const completionRate = all.length ? Math.round((completedCount / all.length) * 1000) / 10 : 0;

  // Specimen distribution donut.
  const specDist = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of all) counts.set(specLabel(r.specimens?.[0]?.type), (counts.get(specLabel(r.specimens?.[0]?.type)) ?? 0) + 1);
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 4).map(([label, value]) => ({ label, value }));
    const others = sorted.slice(4).reduce((s, [, v]) => s + v, 0);
    const rows = others > 0 ? [...top, { label: 'Other', value: others }] : top;
    const sum = rows.reduce((s, x) => s + x.value, 0) || 1;
    const colorFor = (label: string) => Object.entries(SPECIMEN).find(([, l]) => l === label)?.[0];
    return rows.map((x) => ({ ...x, pct: Math.round((x.value / sum) * 100), color: x.label === 'Other' ? SLATE : specColor(colorFor(x.label)) }));
  }, [all]);

  // Real last-7-calendar-days buckets (used by KPI sparklines + the summary bars).
  const WD_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const last7 = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); return d; });
  const daySeries = (pred: (r: Rec) => boolean) => last7.map((d) => {
    const next = new Date(d); next.setDate(d.getDate() + 1);
    return all.filter((r) => { const t = new Date(r.createdAt); return pred(r) && t >= d && t < next; }).length;
  });
  const newSeries = daySeries(() => true);
  const completedSeries = daySeries((r) => COMPLETED_SET.includes(r.status));
  const urgentSeries = daySeries((r) => r.urgent);
  const processingSeries = daySeries((r) => PROCESSING_SET.includes(r.status));
  const todayIdx = 6;
  const bars = last7.map((d, i) => ({ l: WD_LABEL[d.getDay()], v: newSeries[i], cur: i === todayIdx }));
  const barPeak = Math.max(1, ...bars.map((b) => b.v));

  // Recent activity: real records ordered by updatedAt.
  const recent = useMemo(() => [...all].sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime()).slice(0, 4), [all]);

  // ── Worklist filtering ─────────────────────────────────────────────────────
  const tabPred: Record<Tab, (r: Rec) => boolean> = {
    all: (r) => ACTIVE.includes(r.status), urgent: (r) => r.urgent, processing: (r) => PROCESSING_SET.includes(r.status),
    submitted: (r) => r.status === 'Submitted', completed: (r) => COMPLETED_SET.includes(r.status),
  };
  const tabCount = (t: Tab) => all.filter(tabPred[t]).length;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const startTodayMs = new Date().setHours(0, 0, 0, 0);
    return all.filter(tabPred[tab])
      .filter((r) => (fMine ? r.assignedToId === claims?.userId : true))
      .filter((r) => fSpecTypes.size === 0 || fSpecTypes.has(r.specimens?.[0]?.type ?? ''))
      .filter((r) => (fPriority === 'all' ? true : fPriority === 'urgent' ? r.urgent : !r.urgent))
      .filter((r) => {
        if (fDate === 'all') return true;
        const t = new Date(r.createdAt).getTime();
        return fDate === 'today' ? t >= startTodayMs : t >= Date.now() - Number(fDate) * 86_400_000;
      })
      .filter((r) => !q || `${patientName(r)} ${r.labNumber ?? ''} ${r.client?.accountNo ?? ''}`.toLowerCase().includes(q));
  }, [all, tab, search, fMine, claims?.userId, fSpecTypes, fPriority, fDate]);
  const activeFilterCount = (fMine ? 1 : 0) + (fSpecTypes.size > 0 ? 1 : 0) + (fPriority !== 'all' ? 1 : 0) + (fDate !== '7' ? 1 : 0);
  const toggleSpec = (t: string) => setFSpecTypes((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const clearFilters = () => { setFMine(false); setFSpecTypes(new Set()); setFPriority('all'); setFDate('7'); };

  // Infinite scroll over the client-side filtered worklist (aggregates use the
  // full `all`). Any filter/tab/search change recomputes `filtered` → new
  // fetchFn → the hook reloads from the first window.
  const fetchFn = useCallback(
    (p: number, ps: number) => Promise.resolve(clientPage(filtered, p, ps)),
    [filtered],
  );
  const { items: pageRows, loading, initialLoading, hasMore, sentinelRef } =
    useInfiniteScroll<Rec>({ fetchFn, pageSize: 20 });

  const openChoose = () => { if (can('record:create')) setChooseOpen(true); };
  const TH = 'px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap';
  const CELL = 'px-5 py-4 align-middle';
  const TABS: [Tab, string][] = [['all', 'All'], ['urgent', 'Urgent'], ['processing', 'Processing'], ['submitted', 'Submitted'], ['completed', 'Completed']];

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-charcoal-heading">Sample Management</h1>
          <p className="mt-1 text-sm text-secondary">Real-time status tracking for clinical diagnostic samples.</p>
        </div>
        <div className="flex items-center gap-2.5">
          {can('record:create') && <button onClick={openChoose} className="btn-primary"><Plus size={16} /> New Sample</button>}
        </div>
      </div>

      {/* Main grid */}
      <div className="flex flex-col gap-6 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            <KpiCard icon={<FlaskConical size={18} />} iconClass="bg-indigo-50 text-indigo-600" label="New Samples" value={newSamples} sub={`+${newToday} today`} subColor={GREEN} spark={INDIGO} sparkData={newSeries} />
            <KpiCard icon={<CheckCircle2 size={18} />} iconClass="bg-green-50 text-green-700" label="Completed" value={completedCount} sub={`${accuracy}% authorized`} subColor={GREEN} spark={GREEN} sparkData={completedSeries} />
            <KpiCard icon={<AlertTriangle size={18} />} iconClass="bg-red-50 text-red-600" label="Urgent" value={urgentAll.length} sub="Needs attention" subColor={RED} spark={RED} sparkData={urgentSeries} />
            <KpiCard icon={<Settings size={18} />} iconClass="bg-blue-50 text-blue-600" label="Processing" value={processingCount} sub="Active in lab" subColor={BLUE} spark={BLUE} sparkData={processingSeries} />
            <KpiCard icon={<Activity size={18} />} iconClass="bg-teal-50 text-teal-600" label="Avg TAT" value={avgTat != null ? `${avgTat} hrs` : '—'} sub={avgTat != null ? 'avg turnaround' : 'no data yet'} subColor={SLATE} spark={TEAL} sparkData={completedSeries} />
          </div>

          {/* Urgent Flagged + Automation */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
            <div className={`${CARD} p-5`}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="text-base font-semibold text-charcoal-heading">Urgent Flagged Cases</span><span className="rounded-full bg-error-container px-2 py-0.5 text-xs font-bold text-error">{urgentAll.length}</span></div>
                <button onClick={() => setTab('urgent')} className="text-xs font-semibold text-primary hover:underline">View all urgent →</button>
              </div>
              <div className="flex flex-col gap-2">
                {urgentAll.length === 0 && <div className="py-6 text-center text-sm font-semibold text-green-700">✓ No urgent cases</div>}
                {urgentAll.slice(0, 4).map((r) => (
                  <div key={r.id} onClick={() => router.push(`/records/${r.id}`)} className="flex cursor-pointer items-center gap-3 rounded-lg border-l-4 bg-red-50/60 px-3 py-2.5 hover:bg-red-50" style={{ borderColor: RED }}>
                    {(() => { const { Icon } = specUI(r.specimens?.[0]?.type); return (
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: '#FEE2E2', color: '#EF4444' }}><Icon size={20} /></span>
                    ); })()}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-charcoal-heading">{specLabel(r.specimens?.[0]?.type)}</div>
                      {physician(r) && <div className="truncate text-xs text-slate-500">{physician(r)}</div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-charcoal-heading">LAB# {r.labNumber ?? '—'}</div>
                      <div className="truncate text-xs text-slate-500">{clientLabel(r)}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold" style={{ color: RED }}>{elapsedLabel(r.createdAt)}</div>
                      <div className="text-xs text-slate-500">Since {clock(r.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={`${CARD} p-5`}>
              <span className="text-base font-semibold text-charcoal-heading">Automation Overview</span>
              {/* Analyzer instrument metrics are not available from the API yet —
                  placeholder instead of fabricated performance numbers. */}
              <div className="mt-3 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-6 text-center">
                <Settings size={22} className="text-slate-300" />
                <div className="text-sm font-semibold text-slate-500">Analyzer performance — coming soon</div>
                <div className="text-xs text-slate-500">Live instrument metrics aren&apos;t available yet.</div>
              </div>
              <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Average Turnaround (real)</div>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${tatPct}%`, background: GREEN }} /></div>
                <span className="text-sm font-bold text-charcoal-heading">{avgTat != null ? `${avgTat} hrs` : '—'}</span>
              </div>
              <div className="mt-2 text-xs text-slate-500">{tatHours.length > 0 ? `${tatPct}% of ${tatHours.length} authorized within 72h` : 'No completed turnaround data yet'}</div>
            </div>
          </div>

          {/* Active Worklist */}
          <div className={`${CARD} p-0`}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
              <span className="text-base font-semibold text-charcoal-heading">Active Worklist ({tabCount('all')})</span>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-56 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-slate-500"><Search size={15} /><input value={search} onChange={(e) => { setSearch(e.target.value); }} placeholder="Search by patient, ID, accession..." className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-500" /></div>
                <div className="relative">
                  <button onClick={() => setFiltersOpen((v) => !v)} className="relative grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" style={activeFilterCount > 0 ? { borderColor: INDIGO, color: INDIGO } : undefined}>
                    <Filter size={15} />
                    {activeFilterCount > 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white" style={{ background: INDIGO }} />}
                  </button>
                  {filtersOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setFiltersOpen(false)} />
                      <div className="absolute right-0 top-11 z-50 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
                        <div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold text-charcoal-heading">Filters</span>{activeFilterCount > 0 && <span className="text-xs text-slate-500">{activeFilterCount} active</span>}</div>
                        {showAssignee && <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={fMine} onChange={(e) => { setFMine(e.target.checked); }} style={{ accentColor: INDIGO }} /> My Cases only</label>}
                        <div className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Specimen Type</div>
                        <div className="flex max-h-44 flex-col gap-1.5 overflow-auto pr-1">
                          {SPEC_FILTER_OPTS.map(([v, l]) => <label key={v} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={fSpecTypes.has(v)} onChange={() => toggleSpec(v)} style={{ accentColor: INDIGO }} /> {l}</label>)}
                        </div>
                        <div className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Priority</div>
                        <div className="flex flex-col gap-1.5">
                          {([['all', 'All'], ['urgent', 'Urgent only'], ['normal', 'Normal only']] as const).map(([v, l]) => <label key={v} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"><input type="radio" name="wl-priority" checked={fPriority === v} onChange={() => { setFPriority(v); }} style={{ accentColor: INDIGO }} /> {l}</label>)}
                        </div>
                        <div className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Date Range</div>
                        <div className="flex flex-col gap-1.5">
                          {([['today', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['all', 'All time']] as const).map(([v, l]) => <label key={v} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"><input type="radio" name="wl-date" checked={fDate === v} onChange={() => { setFDate(v); }} style={{ accentColor: INDIGO }} /> {l}</label>)}
                        </div>
                        <div className="mt-4 flex gap-2">
                          <button onClick={clearFilters} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Clear filters</button>
                          <button onClick={() => setFiltersOpen(false)} className="btn-primary flex-1 justify-center">Apply</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 px-5">
              {TABS.map(([v, l]) => (
                <button key={v} onClick={() => { setTab(v); }} className="rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors" style={tab === v ? { background: INDIGO, color: '#fff', borderColor: INDIGO } : { background: '#fff', color: '#475569', borderColor: '#E2E8F0' }}>{l} ({tabCount(v)})</button>
              ))}
            </div>

            {showLabels && labelSel.size > 0 && (
              <div className="mt-3 flex items-center gap-2 px-5">
                <button onClick={() => setPrintIds(Array.from(labelSel))} className="flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-white"><Printer size={15} /> Print Labels ({labelSel.size})</button>
                <button onClick={() => setLabelSel(new Set())} className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-500">Clear</button>
              </div>
            )}

            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-y border-slate-100">
                    <th className={`${TH} w-10`} />
                    <th className={TH}>Patient</th><th className={TH}>Specimen Type</th><th className={TH}>Accession / Lab ID</th>
                    <th className={TH}>Priority</th><th className={TH}>Status</th>{showAssignee && <th className={TH}>Assigned To</th>}
                    <th className={TH}>Received</th><th className={`${TH} text-right`}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {!initialLoading && pageRows.length === 0 && <tr><td colSpan={9} className="px-5 py-14 text-center text-sm text-slate-500">No samples found.</td></tr>}
                  {pageRows.map((r) => {
                    const name = patientName(r);
                    const age = ageOf(r.patient?.dateOfBirth);
                    const sp = statusPill(r.status);
                    return (
                      <tr key={r.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                        <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={labelSel.has(r.id)} onChange={() => toggleLabelSel(r.id)} style={{ accentColor: INDIGO }} /></td>
                        <td className={CELL}>
                          <div className="flex items-center gap-3">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white" style={{ background: avatarBg(name) }}>{initialsOf(name)}</span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-sm font-semibold text-charcoal-heading">
                                {name}
                                {escalatedRecordIds.has(r.id) && <span title={`${escalatedRecordIds.get(r.id)} escalation`} className="grid h-4 w-4 place-items-center rounded bg-red-100 text-red-700"><AlertTriangle size={11} /></span>}
                                {qcFailedRecordIds.has(r.id) && <span title="QC failure" className="grid h-4 w-4 place-items-center rounded bg-yellow-100 text-yellow-700"><AlertTriangle size={11} /></span>}
                              </div>
                              <div className="text-[11px] text-slate-500">Reg No: {r.patient?.registrationNo ?? '—'}{r.patient?.gender ? ` • ${r.patient.gender[0]}` : ''}{age != null ? ` / ${age}` : ''}</div>
                            </div>
                          </div>
                        </td>
                        <td className={CELL}>{(() => { const u = specUI(r.specimens?.[0]?.type); return (
                          <div className="flex items-center gap-2.5">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: u.bg, color: u.fg }}><u.Icon size={16} /></span>
                            <span className="text-sm text-slate-600">{specLabel(r.specimens?.[0]?.type)}</span>
                          </div>
                        ); })()}</td>
                        <td className={CELL}><div className="text-sm font-bold text-charcoal-heading">LAB# {r.labNumber ?? '—'}</div><div className="text-[11px] text-slate-500">{clientLabel(r)}</div></td>
                        <td className={CELL}><span className="flex items-center gap-1.5 text-sm" style={{ color: r.urgent ? RED : '#475569' }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: r.urgent ? RED : SLATE }} />{r.urgent ? 'Urgent' : 'Normal'}</span></td>
                        <td className={CELL}>
                          <div className="flex items-center gap-1.5">
                            <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase" style={{ background: sp.bg, color: sp.fg }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: sp.fg }} />{r.status}</span>
                            {r.urgent && <span className="rounded-full bg-error-container px-2 py-1 text-[10px] font-bold text-error">URGENT</span>}
                          </div>
                        </td>
                        {showAssignee && <td className={CELL}><span className="text-sm text-slate-600">{r.assignedTo ? `${r.assignedTo.firstName} ${r.assignedTo.lastName?.[0] ?? ''}.` : <span className="text-slate-500">Unassigned</span>}</span></td>}
                        <td className={CELL}><div className="text-sm text-charcoal-heading">{dateFmt(r.specimenDate ?? r.createdAt)}</div><div className="text-[11px] text-slate-500">{clock(r.specimenDate ?? r.createdAt)}</div></td>
                        <td className={CELL}>
                          <div className="relative flex justify-end">
                            <button aria-label="Details" onClick={() => setMenuId(menuId === r.id ? null : r.id)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-600"><MoreHorizontal size={16} /></button>
                            {menuId === r.id && (
                              <>
                                <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
                                <div className="absolute right-0 top-10 z-20 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                                  <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" onClick={() => { setMenuId(null); router.push(`/records/${r.id}`); }}><Eye size={14} /> View Details</button>
                                  {showLabels && <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" onClick={() => { setMenuId(null); setPrintIds([r.id]); }}><Printer size={14} /> Print Labels</button>}
                                  <div className="my-1 border-t border-slate-100" />
                                  <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-error hover:bg-error-container" onClick={() => { setMenuId(null); setConfirmDel(r); }}><Trash2 size={14} /> Delete</button>
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Small count label + infinite-scroll sentinel (auto-loads on scroll). */}
            {filtered.length > 0 && (
              <>
                <div className="border-t border-slate-100 px-5 pt-3 text-sm text-secondary">Showing {pageRows.length} of {filtered.length} samples</div>
                <ScrollSentinel ref={sentinelRef} loading={loading && !initialLoading} hasMore={hasMore} />
              </>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex w-full shrink-0 flex-col gap-6 xl:w-[300px]">
          {/* Sample Summary */}
          <div className={`${CARD} p-5`}>
            <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold text-charcoal-heading">Sample Summary</span><span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-500">Last 7 days</span></div>
            <div className="text-4xl font-bold text-charcoal-heading">{all.length.toLocaleString()}</div>
            <div className="text-xs text-slate-500">Total samples</div>
            <div className="mt-4 grid grid-cols-4 gap-2 text-center">
              {([['Completed', completedCount, GREEN], ['Urgent', urgentAll.length, RED], ['Processing', processingCount, '#0284C7'], ['On Hold', onHoldCount, SLATE]] as const).map(([l, v, c]) => (
                <div key={l}><div className="text-lg font-bold" style={{ color: c }}>{v}</div><div className="text-[10px] text-slate-500">{l}</div></div>
              ))}
            </div>
            <div className="mt-4 flex items-end gap-1.5" style={{ height: 90 }}>
              {bars.map((b, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[9px] font-semibold text-slate-500">{b.v}</span>
                  <div className="w-full rounded-t" style={{ height: `${(b.v / barPeak) * 60}px`, minHeight: 3, background: b.cur ? INDIGO : '#C7D2FE' }} />
                  <span className="text-[9px]" style={{ color: b.cur ? INDIGO : '#475569', fontWeight: b.cur ? 700 : 500 }}>{b.l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Completion Rate */}
          <div className={`${CARD} p-5`}>
            <div className="mb-3 text-sm font-semibold text-charcoal-heading">Completion Rate</div>
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <PieChart width={110} height={110}><Pie data={completionSegs} dataKey="value" cx="50%" cy="50%" innerRadius={38} outerRadius={52} paddingAngle={2} stroke="none">{completionSegs.map((s, i) => <Cell key={i} fill={s.color} />)}</Pie></PieChart>
                <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-lg font-bold text-charcoal-heading">{completionRate}%</span><span className="text-[9px] text-slate-500">completed</span></div>
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                {completionSegs.map((s) => <div key={s.label} className="flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 text-slate-600"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} /> {s.label}</span><span className="font-semibold text-charcoal-heading">{s.value}</span></div>)}
              </div>
            </div>
          </div>

          {/* Specimen Distribution */}
          <div className={`${CARD} p-5`}>
            <div className="mb-2 text-sm font-semibold text-charcoal-heading">Specimen Distribution</div>
            <div className="flex items-center gap-3">
              <PieChart width={110} height={110}><Pie data={specDist} dataKey="value" cx="50%" cy="50%" innerRadius={32} outerRadius={50} paddingAngle={2} stroke="none">{specDist.map((s, i) => <Cell key={i} fill={s.color} />)}</Pie></PieChart>
              <div className="flex flex-1 flex-col gap-1.5">
                {specDist.map((s) => <div key={s.label} className="flex items-center justify-between text-[12px]"><span className="flex items-center gap-1.5 text-slate-600"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} /> {s.label}</span><span className="font-semibold text-charcoal-heading">{s.pct}%</span></div>)}
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className={`${CARD} p-5`}>
            <div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold text-charcoal-heading">Recent Activity</span><button onClick={() => router.push('/records')} className="text-xs font-semibold text-primary hover:underline">View all</button></div>
            <div className="flex flex-col gap-3">
              {recent.length === 0 && <div className="text-sm text-slate-500">No recent activity.</div>}
              {recent.map((r) => {
                const name = patientName(r);
                return (
                  <div key={r.id} className="flex items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white" style={{ background: avatarBg(name) }}>{initialsOf(name)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] text-charcoal-heading">Sample <span className="font-bold text-primary">{r.labNumber ?? '—'}</span> {statusAction(r.status)}</div>
                      <div className="text-[11px] text-slate-500">{relTime(r.updatedAt ?? r.createdAt)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* New Sample chooser */}
      {chooseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setChooseOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-bold text-charcoal-heading">New sample</div>
            <div className="mt-1 text-sm text-secondary">Choose the form type to begin.</div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {(['Gynecology', 'NonGynecology'] as FormType[]).map((ft) => (
                <button key={ft} onClick={() => { setChooseOpen(false); setDrawer({ formType: ft }); }} className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 py-7 transition-colors hover:border-primary hover:bg-indigo-50">
                  <FlaskConical size={26} className="text-primary" /><span className="text-sm font-bold text-charcoal-heading">{ft === 'Gynecology' ? 'Gynecology' : 'Non-Gynecology'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setConfirmDel(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between"><h3 className="text-lg font-bold text-charcoal-heading">Delete this sample?</h3><button onClick={() => setConfirmDel(null)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X size={16} /></button></div>
            <p className="mt-1 text-sm text-secondary">{confirmDel.labNumber ?? 'This sample'} will be permanently deleted.</p>
            <div className="mt-5 flex justify-end gap-2"><button className="btn-secondary" onClick={() => setConfirmDel(null)}>Cancel</button><button className="btn-primary" style={{ background: '#DC2626' }} disabled={del.isPending} onClick={() => del.mutate(confirmDel.id)}>{del.isPending ? 'Deleting…' : 'Delete'}</button></div>
          </div>
        </div>
      )}

      {drawer && <RecordFormDrawer open onClose={() => { setDrawer(null); qc.invalidateQueries({ queryKey: ['records-all'] }); }} formType={drawer.formType} recordId={drawer.recordId} />}
      {printIds && <PrintLabelsModal recordIds={printIds} onClose={() => setPrintIds(null)} />}

      {toast && <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg" style={{ background: toast.type === 'ok' ? '#16A34A' : '#DC2626' }}>{toast.msg}</div>}
    </div>
  );
}
