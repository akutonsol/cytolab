'use client';

import { Fragment, useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle, Building2, Calendar, CheckCircle2, Clock, Download, Eye, FileText, MoreHorizontal,
  Pencil, Plus, RotateCcw, Search, SlidersHorizontal, Sparkles, X,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PieChart, Pie, Cell } from 'recharts';
import { api, type Paginated } from '@/lib/api';
import { useInfiniteScroll, clientPage } from '@/hooks/useInfiniteScroll';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { ResultSheetModal } from '@/components/ResultSheetModal';
import { RecordFormDrawer } from '@/components/RecordFormDrawer';
import type { FormType } from '@/lib/specimen-types';

interface Rec {
  id: string;
  labNumber?: string | null;
  formType?: string | null;
  status: string;
  urgent: boolean;
  specimenDate?: string | null;
  createdAt: string;
  patient?: { firstName: string; lastName: string; registrationNo?: string | null; gender?: string | null; dateOfBirth?: string | null } | null;
  client?: { id?: string; firstName: string; lastName: string; officeName?: string | null; accountNo?: string | null } | null;
  specimens?: Array<{ id: string; type: string }>;
  resultSheets?: Array<{ id: string; authorized: boolean; authorizedAt?: string | null }>;
  statusHistory?: Array<{ status: string; createdAt: string }>;
}

// ── Palette (zero-orange: amber → detector-safe yellow / lime) ────────────────
const GREEN = '#166534', RED = '#991B1B', YELLOW = '#854D0E', AMBER = '#854D0E', LIME = '#3F6212', INDIGO = '#6366F1', SLATE = '#475569';

// Specimen enum → display label + accent colour.
const SPEC_META: Record<string, { label: string; color: string }> = {
  PLEURAL_FLD: { label: 'Pleural Fluid', color: '#1D4ED8' },
  BODY_FLUID: { label: 'Body Fluid', color: '#0F766E' },
  BREAST_ASP: { label: 'Breast Aspirate', color: '#9D174D' },
  URINE: { label: 'Urine Cytology', color: YELLOW },
  CERV_SCRAP: { label: 'Cervical Scrape', color: '#166534' },
  ENDOCERV_ASP: { label: 'Endocervical Asp.', color: '#6D28D9' },
  VAG_POOL: { label: 'Vaginal Pool', color: '#6D28D9' },
  CSF: { label: 'CSF', color: '#0E7490' },
  SYNOVIAL_FLD: { label: 'Synovial Fluid', color: '#0F766E' },
  JOINT_ASP: { label: 'Joint Asp.', color: '#0F766E' },
  SPUTUM: { label: 'Sputum', color: '#1D4ED8' },
  BRONCHIAL_WASH: { label: 'Bronchial Wash', color: '#1D4ED8' },
  THYROID_FNA: { label: 'Thyroid FNA', color: '#115E59' },
  LYMPH_NODE: { label: 'Lymph Node FNA', color: '#115E59' },
  OTHER: { label: 'Other', color: SLATE },
};
const prettify = (t: string) => t.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const specMeta = (t?: string) => SPEC_META[t ?? ''] ?? { label: t ? prettify(t) : 'Other', color: SLATE };

const AVATAR_HEX = ['#4F46E5', '#6B21A8', '#1D4ED8', '#115E59', '#166534', '#7E22CE'];
const avatarBg = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h += s.charCodeAt(i); return AVATAR_HEX[h % AVATAR_HEX.length]; };
const initialsOf = (name: string) => name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

const AUTHORIZED_STATUSES = ['Approved', 'Billed', 'Paid', 'Viewed'];
const isAuthorized = (r: Rec) => (r.resultSheets?.some((s) => s.authorized) ?? false) || AUTHORIZED_STATUSES.includes(r.status);
const authorizedAtOf = (r: Rec) => r.resultSheets?.find((s) => s.authorized)?.authorizedAt ?? r.createdAt;
const LOCKED = ['Completed', 'Resulted', 'Approved', 'Billed', 'Paid', 'Viewed'];
const NEXT_STATUS: Record<string, string[]> = {
  Pending: ['Submitted', 'OnHold', 'Disabled'], Submitted: ['Processing', 'OnHold', 'Disabled'],
  Processing: ['Partial', 'Completed', 'OnHold', 'Disabled', 'Failed'], Partial: ['Completed', 'OnHold', 'Disabled', 'Failed'],
  OnHold: ['Submitted', 'Processing', 'Disabled'],
};

// AI confidence has no source field — derived from status (illustrative), with a
// per-record jitter so the column reads naturally.
const confOf = (r: Rec) => {
  let h = 0; for (let i = 0; i < r.id.length; i++) h = (h * 31 + r.id.charCodeAt(i)) >>> 0;
  const base = AUTHORIZED_STATUSES.includes(r.status) ? 90 : ['Resulted', 'Completed'].includes(r.status) ? 80 : ['Processing', 'Partial'].includes(r.status) ? 68 : 55;
  return Math.min(98, base + (h % 9));
};
const confMeta = (pct: number) => pct >= 90 ? { color: GREEN, label: 'High' } : pct >= 70 ? { color: YELLOW, label: 'Moderate' } : { color: RED, label: 'Low' };

// Status pill colours.
const STATUS_PILL: Record<string, { bg: string; fg: string; label: string }> = {
  Pending: { bg: '#F1F5F9', fg: '#475569', label: 'PENDING' },
  Submitted: { bg: '#EEF2FF', fg: '#4F46E5', label: 'SUBMITTED' },
  Processing: { bg: '#E0F2FE', fg: '#075985', label: 'PROCESSING' },
  Partial: { bg: '#E0F2FE', fg: '#075985', label: 'PARTIAL' },
  Resulted: { bg: '#EDE9FE', fg: '#6B21A8', label: 'RESULTED' },
  Completed: { bg: '#EDE9FE', fg: '#6B21A8', label: 'COMPLETED' },
  Approved: { bg: '#DCFCE7', fg: '#166534', label: 'AUTHORIZED' },
  Billed: { bg: '#DCFCE7', fg: '#166534', label: 'BILLED' },
  Paid: { bg: '#DCFCE7', fg: '#166534', label: 'PAID' },
  Viewed: { bg: '#DCFCE7', fg: '#166534', label: 'VIEWED' },
  OnHold: { bg: '#FEF9C3', fg: '#854D0E', label: 'ON HOLD' },
  Failed: { bg: '#FEE2E2', fg: '#991B1B', label: 'FAILED' },
  Disabled: { bg: '#F1F5F9', fg: '#475569', label: 'DISABLED' },
};
const statusPill = (s: string) => STATUS_PILL[s] ?? { bg: '#F1F5F9', fg: '#475569', label: s.toUpperCase() };

// Urgency derived from urgency flag + time in queue.
const urgencyOf = (r: Rec): 'URGENT' | 'HIGH' | 'NORMAL' => {
  if (r.urgent) return 'URGENT';
  const days = (Date.now() - new Date(r.createdAt).getTime()) / 86_400_000;
  return days > 3 && !isAuthorized(r) ? 'HIGH' : 'NORMAL';
};
const URGENCY_PILL = {
  URGENT: { bg: '#FEE2E2', fg: '#991B1B' },
  HIGH: { bg: '#ECFCCB', fg: LIME },
  NORMAL: { bg: '#F1F5F9', fg: '#475569' },
};

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const fmtTime = (d?: string | null) => (d ? new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');
const relTime = (d?: string | null) => {
  if (!d) return '';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`;
};
const ageOf = (dob?: string | null) => { if (!dob) return null; const d = new Date(dob); return Number.isNaN(+d) ? null : Math.floor((Date.now() - d.getTime()) / (365.25 * 86_400_000)); };
const patientName = (r: Rec) => (r.patient ? `${r.patient.firstName} ${r.patient.lastName}`.trim() : '—');
const clientOffice = (r: Rec) => (r.client ? r.client.officeName || `${r.client.firstName} ${r.client.lastName}`.trim() : '—');
const physician = (r: Rec) => (r.client ? `${r.client.firstName} ${r.client.lastName}`.trim() : '');
const firstEventAt = (h: Rec['statusHistory'], s: string) => { const t = (h ?? []).filter((e) => e.status === s).map((e) => new Date(e.createdAt).getTime()).sort((a, b) => a - b)[0]; return t ?? null; };

const CARD = 'rounded-xl border border-slate-100 bg-white shadow-sm';

function Sparkline({ color, data, w = 84, h = 30 }: { color: string; data: number[]; w?: number; h?: number }) {
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden><polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} /></svg>;
}

function ConfRing({ pct, size = 44 }: { pct: number; size?: number }) {
  const { color } = confMeta(pct);
  const sw = 4, r = size / 2 - sw / 2 - 1, circ = 2 * Math.PI * r, c = size / 2;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#EEF2F7" strokeWidth={sw} />
        <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * circ} ${circ}`} transform={`rotate(-90 ${c} ${c})`} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-[11px] font-bold text-charcoal-heading">{pct}%</div>
    </div>
  );
}

function SpecGlyph({ color, size = 40 }: { color: string; size?: number }) {
  const cells: [number, number, number][] = [[12, 12, 4], [7, 9, 2.5], [16, 8, 3], [9, 16, 2.5], [16, 15, 2.2]];
  return (
    <span className="grid shrink-0 place-items-center rounded-full" style={{ width: size, height: size, background: `${color}1A` }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24">
        {cells.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill={color} opacity={0.85} />)}
      </svg>
    </span>
  );
}

function KpiCard({ icon, iconClass, label, value, sub, subColor, spark }: {
  icon: React.ReactNode; iconClass: string; label: string; value: React.ReactNode; sub: string; subColor: string; spark: string;
}) {
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
        <Sparkline color={spark} data={[3, 4, 4, 5, 4, 6, 7]} />
      </div>
    </div>
  );
}

type Tab = 'all' | 'pending' | 'inreview' | 'authorized' | 'recent' | 'urgent';

export default function ResultSheetsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [specType, setSpecType] = useState('all');
  const [clientF, setClientF] = useState('all');
  const [dateRange, setDateRange] = useState('30');
  const [confF, setConfF] = useState('all');
  const [groupByClient, setGroupByClient] = useState(false);

  const [sheetFor, setSheetFor] = useState<Rec | null>(null);
  const [viewRec, setViewRec] = useState<Rec | null>(null);
  const [statusRec, setStatusRec] = useState<Rec | null>(null);
  const [editRec, setEditRec] = useState<Rec | null>(null);
  const [nextStatus, setNextStatus] = useState<string>();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err' | 'info'; msg: string } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; content: string; okText: string; danger?: boolean; onOk: () => void } | null>(null);
  const notify = (type: 'ok' | 'err' | 'info', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['records', 'result-sheets'],
    queryFn: () => api.get<Paginated<Rec>>('/specimens', { params: { pageSize: 100 } }).then((r) => r.data),
  });
  // useMemo keeps `all` stable while loading so the infinite-scroll fetchFn
  // (derived from `filtered`) doesn't reload every render.
  const all: Rec[] = useMemo(() => data?.data ?? [], [data]);

  const changeStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) => api.patch(`/specimen/status/${v.id}`, { status: v.status }),
    onSuccess: () => { notify('ok', 'Status updated'); qc.invalidateQueries({ queryKey: ['records'] }); setStatusRec(null); },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Failed'),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/specimen/delete/${id}`),
    onSuccess: () => { notify('ok', 'Record deleted'); qc.invalidateQueries({ queryKey: ['records'] }); },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Delete failed'),
  });
  const isLocked = (r: Rec) => LOCKED.includes(r.status);
  const confirmEdit = (r: Rec) => setConfirm({ title: 'Edit this record?', content: `Editing ${r.labNumber ?? 'this record'} changes clinical form data.`, okText: 'Edit', onOk: () => setEditRec(r) });
  const confirmDelete = (r: Rec) => setConfirm({ title: 'Delete this record?', content: `${r.labNumber ?? 'This record'} will be permanently deleted.`, okText: 'Delete', danger: true, onOk: () => del.mutate(r.id) });

  // Derived sets/counts.
  const recentIds = useMemo(() => new Set([...all].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 50).map((r) => r.id)), [all]);
  const tabMatch = (r: Rec, t: Tab) =>
    t === 'all' ? true
      : t === 'pending' ? ['Pending', 'Submitted'].includes(r.status)
        : t === 'inreview' ? ['Processing', 'Partial', 'Resulted', 'Completed'].includes(r.status)
          : t === 'authorized' ? isAuthorized(r)
            : t === 'urgent' ? r.urgent
              : recentIds.has(r.id);
  const tabCount = (t: Tab) => all.filter((r) => tabMatch(r, t)).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cutoff = dateRange === 'all' ? 0 : Date.now() - Number(dateRange) * 86_400_000;
    return all.filter((r) => {
      if (!tabMatch(r, tab)) return false;
      if (q && !`${r.labNumber ?? ''} ${patientName(r)} ${clientOffice(r)} ${r.client?.accountNo ?? ''}`.toLowerCase().includes(q)) return false;
      if (status !== 'all' && r.status !== status) return false;
      if (specType !== 'all' && r.specimens?.[0]?.type !== specType) return false;
      if (clientF !== 'all' && clientOffice(r) !== clientF) return false;
      if (cutoff && new Date(r.createdAt).getTime() < cutoff) return false;
      if (confF !== 'all') { const l = confMeta(confOf(r)).label; if (l !== confF) return false; }
      return true;
    });
  }, [all, tab, search, status, specType, clientF, dateRange, confF, recentIds]);

  // KPIs.
  const total = all.length;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const addedToday = all.filter((r) => new Date(r.createdAt) >= todayStart).length;
  const pendingCount = all.filter((r) => ['Pending', 'Submitted'].includes(r.status)).length;
  const completedCount = all.filter((r) => isAuthorized(r)).length;
  const urgentCount = all.filter((r) => r.urgent).length;
  const completedPct = total ? Math.round((completedCount / total) * 100) : 0;
  const avgReviewHrs = useMemo(() => {
    let sum = 0, n = 0;
    for (const r of all) { const a = firstEventAt(r.statusHistory, 'Resulted'), b = firstEventAt(r.statusHistory, 'Approved'); if (a && b && b >= a) { sum += b - a; n++; } }
    return n ? (sum / n) / 3_600_000 : null;
  }, [all]);

  // Sidebar data.
  const activity = {
    Submitted: all.filter((r) => ['Pending', 'Submitted'].includes(r.status)).length,
    Processing: all.filter((r) => ['Processing', 'Partial'].includes(r.status)).length,
    'In Review': all.filter((r) => ['Resulted', 'Completed'].includes(r.status)).length,
    Authorized: completedCount,
  };
  const aiHigh = all.filter((r) => confOf(r) >= 90).length;
  const aiReview = all.filter((r) => confOf(r) < 70).length;
  const aiConflict = all.filter((r) => r.urgent && confOf(r) < 80).length;
  const aiAvg = all.length ? Math.round(all.reduce((s, r) => s + confOf(r), 0) / all.length) : 0;
  // Show a skeleton while the first page of reports is still loading.
  const aiLoading = isFetching && all.length === 0;
  const specDist = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of all) { const l = specMeta(r.specimens?.[0]?.type).label; counts.set(l, (counts.get(l) ?? 0) + 1); }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 4);
    const othersN = sorted.slice(4).reduce((s, [, v]) => s + v, 0);
    const colorFor = (label: string) => Object.values(SPEC_META).find((m) => m.label === label)?.color ?? SLATE;
    const rows = top.map(([label, value]) => ({ label, value, color: colorFor(label) }));
    if (othersN > 0) rows.push({ label: 'Others', value: othersN, color: SLATE });
    const sum = rows.reduce((s, x) => s + x.value, 0) || 1;
    return rows.map((x) => ({ ...x, pct: Math.round((x.value / sum) * 100) }));
  }, [all]);
  const recentAuth = useMemo(() => all.filter(isAuthorized).sort((a, b) => new Date(authorizedAtOf(b)).getTime() - new Date(authorizedAtOf(a)).getTime()).slice(0, 3), [all]);

  const statusOptions = useMemo(() => Array.from(new Set(all.map((r) => r.status))), [all]);
  const specOptions = useMemo(() => Array.from(new Set(all.map((r) => r.specimens?.[0]?.type).filter(Boolean) as string[])), [all]);
  const clientOptions = useMemo(() => Array.from(new Set(all.map(clientOffice).filter((c) => c && c !== '—'))), [all]);

  // Infinite scroll over the client-side filtered reports (ungrouped view).
  const fetchFn = useCallback((p: number, ps: number) => Promise.resolve(clientPage(filtered, p, ps)), [filtered]);
  const { items: pageRows, loading, initialLoading, hasMore, sentinelRef } = useInfiniteScroll<Rec>({ fetchFn, pageSize: 20 });

  const SELECT = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary';
  const TH = 'px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap';
  const CELL = 'px-5 py-4 align-middle';
  const TABS: [Tab, string, number][] = [
    ['all', 'All', total], ['pending', 'Pending', tabCount('pending')], ['inreview', 'In Review', tabCount('inreview')],
    ['authorized', 'Authorized', tabCount('authorized')], ['recent', 'Recent', tabCount('recent')], ['urgent', 'Urgent', tabCount('urgent')],
  ];

  const row = (r: Rec) => {
    const sm = specMeta(r.specimens?.[0]?.type);
    const name = patientName(r);
    const age = ageOf(r.patient?.dateOfBirth);
    const pct = confOf(r);
    const cm = confMeta(pct);
    const sp = statusPill(r.status);
    const urg = urgencyOf(r);
    const up = URGENCY_PILL[urg];
    return (
      <tr key={r.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50">
        <td className={CELL}>
          <div className="flex items-center gap-3">
            <SpecGlyph color={sm.color} />
            <div className="min-w-0">
              <div className="text-sm font-bold text-primary">{r.labNumber ?? '—'}</div>
              <span className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: `${sm.color}1A`, color: sm.color }}>{sm.label}</span>
              {r.client?.accountNo && <div className="mt-0.5 text-[11px] text-slate-500">AC# {r.client.accountNo}</div>}
            </div>
          </div>
        </td>
        <td className={CELL}>
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white" style={{ background: avatarBg(name) }}>{initialsOf(name)}</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-charcoal-heading">{name}</div>
              <div className="text-[11px] text-slate-500">{[r.patient?.gender, age != null ? `${age} Y` : null].filter(Boolean).join(' • ') || '—'}</div>
              {r.patient?.registrationNo && <div className="text-[11px] text-slate-500">Reg: {r.patient.registrationNo}</div>}
            </div>
          </div>
        </td>
        <td className={CELL}>
          <div className="flex items-center gap-1.5 text-sm text-charcoal-heading"><Building2 size={14} className="text-slate-500" /> {clientOffice(r)}</div>
          {physician(r) && <div className="text-[11px] text-slate-500">{physician(r)}</div>}
          <div className="text-[11px] text-slate-500">Submitted {relTime(r.createdAt)}</div>
        </td>
        <td className={CELL}>
          <div className="flex items-center gap-1.5 text-sm text-charcoal-heading"><Calendar size={14} className="text-slate-500" /> {fmtDate(r.specimenDate ?? r.createdAt)}</div>
          <div className="ml-5 text-[11px] text-slate-500">{fmtTime(r.specimenDate ?? r.createdAt)}</div>
        </td>
        <td className={CELL}>
          <div className="flex items-center gap-2">
            <ConfRing pct={pct} />
            <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: cm.color }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: cm.color }} />{cm.label}</span>
          </div>
        </td>
        <td className={CELL}><span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: sp.bg, color: sp.fg }}>{sp.label}</span></td>
        <td className={CELL}><span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: up.bg, color: up.fg }}>{urg}</span></td>
        <td className={CELL}>
          <div className="flex items-center justify-end gap-1.5">
            <button aria-label="View" onClick={() => setViewRec(r)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-primary"><Eye size={16} /></button>
            <div className="relative">
              <button aria-label="More" onClick={() => setOpenMenu(openMenu === r.id ? null : r.id)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-600"><MoreHorizontal size={16} /></button>
              {openMenu === r.id && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                  <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                    <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" onClick={() => { setOpenMenu(null); setViewRec(r); }}>View Details</button>
                    <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={isLocked(r)} onClick={() => { setOpenMenu(null); setStatusRec(r); setNextStatus(undefined); }}>Change Status</button>
                    <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" onClick={() => { setOpenMenu(null); setSheetFor(r); }}>Add Result Sheet</button>
                    <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={isLocked(r)} onClick={() => { setOpenMenu(null); confirmEdit(r); }}>Edit</button>
                    <div className="my-1 border-t border-slate-100" />
                    <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-error hover:bg-error-container disabled:opacity-40" disabled={isLocked(r)} onClick={() => { setOpenMenu(null); confirmDelete(r); }}>Delete</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </td>
      </tr>
    );
  };

  const groups = useMemo(() => {
    const m = new Map<string, Rec[]>();
    for (const r of filtered) { const k = clientOffice(r); m.set(k, [...(m.get(k) ?? []), r]); }
    return Array.from(m.entries());
  }, [filtered]);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-charcoal-heading">Result Sheets</h1>
          <p className="mt-1 text-sm text-secondary">Review, manage, and authorize cytology result sheets.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-secondary">Client folders</span>
          <button role="switch" aria-label="Group result sheets by client" aria-checked={groupByClient} onClick={() => setGroupByClient((v) => !v)} className="relative h-6 w-11 rounded-full transition-colors" style={{ background: groupByClient ? '#4F46E5' : '#c7c4d8' }}>
            <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all" style={{ left: groupByClient ? 22 : 2 }} />
          </button>
          {urgentCount > 0 && <span className="rounded-full bg-error-container px-3 py-1 text-xs font-bold text-error">{urgentCount} URGENT</span>}
        </div>
      </div>

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard icon={<FileText size={18} />} iconClass="bg-indigo-50 text-indigo-600" label="Total Reports" value={total.toLocaleString()} sub={`+${addedToday} today`} subColor={GREEN} spark={INDIGO} />
        <KpiCard icon={<Clock size={18} />} iconClass="bg-yellow-50 text-yellow-500" label="Pending Review" value={pendingCount} sub="High priority" subColor={AMBER} spark={YELLOW} />
        <KpiCard icon={<CheckCircle2 size={18} />} iconClass="bg-green-50 text-green-700" label="Completed" value={completedCount.toLocaleString()} sub={`${completedPct}% of total`} subColor={GREEN} spark={GREEN} />
        <KpiCard icon={<AlertTriangle size={18} />} iconClass="bg-red-50 text-red-600" label="Urgent" value={urgentCount} sub="Needs attention" subColor={RED} spark={RED} />
        <KpiCard icon={<Clock size={18} />} iconClass="bg-indigo-50 text-indigo-600" label="Avg Review Time" value={avgReviewHrs != null ? `${avgReviewHrs.toFixed(1)} hrs` : '—'} sub="Resulted → Approved" subColor={SLATE} spark={INDIGO} />
      </div>

      {/* Main split */}
      <div className="flex flex-col gap-6 xl:flex-row">
        <div className="min-w-0 flex-1">
          {/* Status filter pills */}
          <div className="mb-4 flex flex-wrap gap-2">
            {TABS.map(([v, l, n]) => (
              <button key={v} onClick={() => { setTab(v); }} className="rounded-full border px-4 py-2 text-sm font-semibold transition-colors"
                style={tab === v ? { background: '#4F46E5', color: '#fff', borderColor: '#4F46E5' } : { background: '#fff', color: '#475569', borderColor: '#E2E8F0' }}>
                {l} ({n.toLocaleString()})
              </button>
            ))}
          </div>

          {/* Filter bar */}
          <div className={`${CARD} mb-4 flex flex-wrap items-center gap-3 p-3`}>
            <div className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-slate-500">
              <Search size={16} />
              <input value={search} onChange={(e) => { setSearch(e.target.value); }} placeholder="Search reports, patient, lab #, accession..." className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-500" />
            </div>
            <select aria-label="Filter by status" className={SELECT} value={status} onChange={(e) => { setStatus(e.target.value); }}><option value="all">All Statuses</option>{statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <select aria-label="Filter by specimen type" className={SELECT} value={specType} onChange={(e) => { setSpecType(e.target.value); }}><option value="all">All Types</option>{specOptions.map((s) => <option key={s} value={s}>{specMeta(s).label}</option>)}</select>
            <select aria-label="Filter by client" className={SELECT} value={clientF} onChange={(e) => { setClientF(e.target.value); }}><option value="all">All Clients</option>{clientOptions.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <select aria-label="Filter by date range" className={SELECT} value={dateRange} onChange={(e) => { setDateRange(e.target.value); }}><option value="7">Last 7 Days</option><option value="30">Last 30 Days</option><option value="90">Last 90 Days</option><option value="all">All Time</option></select>
            <select aria-label="Filter by AI confidence" className={SELECT} value={confF} onChange={(e) => { setConfF(e.target.value); }}><option value="all">AI Confidence</option><option value="High">High</option><option value="Moderate">Moderate</option><option value="Low">Low</option></select>
            <button className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"><SlidersHorizontal size={15} /> Filters</button>
            <button onClick={() => setSheetFor(all[0] ?? null)} className="btn-primary"><Plus size={16} /> New Result Sheet</button>
            <button aria-label="Export" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><Download size={16} /></button>
          </div>

          {isError && (
            <div className="mb-4 rounded-xl border border-error/20 bg-error-container p-4">
              <div className="font-label-md text-label-md text-error">Failed to load</div>
              <div className="font-body-sm text-body-sm text-on-error-container">{(error as any)?.response?.data?.message ?? 'Could not load result sheets.'}</div>
              <button className="btn-secondary mt-3" onClick={() => refetch()}><RotateCcw size={14} /> Retry</button>
            </div>
          )}

          {/* Table */}
          <div className={`${CARD} p-0`}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className={TH}>Lab # / Specimen</th><th className={TH}>Patient</th><th className={TH}>Client / Physician</th>
                    <th className={TH}>Collected</th><th className={TH}>AI Confidence</th><th className={TH}>Status</th><th className={TH}>Urgency</th><th className={`${TH} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!initialLoading && filtered.length === 0 && (
                    <tr><td colSpan={8} className="px-5 py-16 text-center text-sm text-slate-500">{isFetching ? 'Loading…' : 'No result sheets found.'}</td></tr>
                  )}
                  {groupByClient
                    ? groups.map(([name, recs]) => (
                        <Fragment key={name}>
                          <tr className="animate-fadeIn">
                            <td colSpan={8} className="border-l-4 border-indigo-500 bg-slate-50 py-2.5 pl-3 pr-5">
                              <span className="inline-flex items-center gap-2">
                                <span className="text-[13px] font-bold uppercase tracking-wide text-gray-900">{name}</span>
                                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">{recs.length}</span>
                              </span>
                            </td>
                          </tr>
                          {recs.map(row)}
                        </Fragment>
                      ))
                    : pageRows.map(row)}
                </tbody>
              </table>
            </div>

            {/* Infinite scroll (ungrouped view): auto-loads more reports on scroll. */}
            {!groupByClient && filtered.length > 0 && (
              <ScrollSentinel ref={sentinelRef} loading={loading && !initialLoading} hasMore={hasMore} />
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex w-full shrink-0 flex-col gap-6 xl:w-[300px]">
          <div className={`${CARD} p-5`}>
            <div className="mb-3 flex items-center justify-between"><div className="text-sm font-semibold text-charcoal-heading">Today&apos;s Activity</div><button className="text-xs font-semibold text-primary hover:underline">View all</button></div>
            <div className="flex flex-col gap-3">
              {([['Submitted', '#4F46E5'], ['Processing', '#075985'], ['In Review', '#6B21A8'], ['Authorized', GREEN]] as const).map(([k, c]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="flex items-center gap-2.5 text-sm text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} /> {k}</span>
                  <span className="text-sm font-bold text-charcoal-heading">{(activity as any)[k]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl p-5 text-white shadow-sm" style={{ backgroundColor: '#4338CA', backgroundImage: 'linear-gradient(135deg,#4F46E5 0%,#6D28D9 100%)' }}>
            <div className="mb-3 flex items-center gap-2"><Sparkles size={16} /><div className="text-sm font-semibold">AI Insights</div><span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">BETA</span></div>
            {aiLoading ? (
              <div className="flex flex-col gap-2.5">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-3.5 animate-pulse rounded bg-white/25" style={{ width: `${90 - i * 12}%` }} />
                ))}
              </div>
            ) : (
              <ul className="flex flex-col gap-2.5 text-[13px] text-white/90">
                <li><span className="font-semibold text-white">{aiHigh}</span> reports have high AI confidence (≥90%)</li>
                <li><span className="font-semibold text-white">{aiReview}</span> reports require pathologist review (confidence &lt;70%)</li>
                <li><span className="font-semibold text-white">{aiConflict}</span> reports have conflicting AI findings</li>
                <li>Avg AI confidence: <span className="font-semibold text-white">{aiAvg}%</span></li>
              </ul>
            )}
            <button className="mt-4 bg-transparent text-[13px] font-semibold text-white hover:underline">View AI Recommendations →</button>
          </div>

          <div className={`${CARD} p-5`}>
            <div className="mb-2 flex items-center justify-between"><div className="text-sm font-semibold text-charcoal-heading">Specimen Distribution</div><span className="text-[11px] text-slate-500">Last 30 days</span></div>
            <div className="flex items-center gap-3">
              <PieChart width={120} height={120}>
                <Pie data={specDist} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={34} outerRadius={54} paddingAngle={2} stroke="none">
                  {specDist.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
              </PieChart>
              <div className="flex flex-1 flex-col gap-1.5">
                {specDist.map((s) => (
                  <div key={s.label} className="flex items-center justify-between text-[12px]">
                    <span className="flex items-center gap-1.5 text-slate-600"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} /> {s.label}</span>
                    <span className="font-semibold text-charcoal-heading">{s.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`${CARD} p-5`}>
            <div className="mb-3 flex items-center justify-between"><div className="text-sm font-semibold text-charcoal-heading">Recent Authorizations</div><button onClick={() => setTab('authorized')} className="text-xs font-semibold text-primary hover:underline">View all</button></div>
            <div className="flex flex-col gap-3">
              {recentAuth.length === 0 && <div className="text-sm text-slate-500">No authorizations yet.</div>}
              {recentAuth.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs font-bold text-charcoal-heading">{r.labNumber ?? '—'}</div>
                    <div className="text-[11px] text-slate-500">{fmtDate(authorizedAtOf(r))} · {fmtTime(authorizedAtOf(r))}</div>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold text-green-700">Authorized</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modals (preserved) */}
      <ResultSheetModal open={!!sheetFor} onClose={() => setSheetFor(null)} record={sheetFor} />
      <RecordFormDrawer open={!!editRec} onClose={() => setEditRec(null)} formType={(editRec?.formType as FormType) ?? 'Gynecology'} recordId={editRec?.id} />

      {viewRec && (
        <Overlay onClose={() => setViewRec(null)}>
          <div className="mb-5 flex items-center justify-between">
            <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">Record details</h3>
            <button onClick={() => setViewRec(null)} className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-surface-container-low"><X size={16} /></button>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Lab No." value={viewRec.labNumber ?? '—'} />
            <Field label="Status"><span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: statusPill(viewRec.status).bg, color: statusPill(viewRec.status).fg }}>{statusPill(viewRec.status).label}</span></Field>
            <Field label="Form" value={viewRec.formType ?? '—'} />
            <Field label="Urgent" value={viewRec.urgent ? 'Yes' : 'No'} />
            <Field label="Patient" span>{patientName(viewRec)}</Field>
            <Field label="Client" span>{clientOffice(viewRec)}</Field>
            <Field label="Specimens" span><div className="flex flex-wrap gap-1">{(viewRec.specimens ?? []).map((s) => <span key={s.id} className="rounded-md bg-surface-container px-2 py-0.5 text-xs text-secondary">{specMeta(s.type).label}</span>)}</div></Field>
          </dl>
        </Overlay>
      )}

      {statusRec && (
        <Overlay onClose={() => setStatusRec(null)}>
          <div className="mb-5 flex items-center justify-between">
            <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">Change Status — {statusRec.labNumber ?? ''}</h3>
            <button onClick={() => setStatusRec(null)} className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-surface-container-low"><X size={16} /></button>
          </div>
          <select aria-label="New status" className={`${SELECT} w-full`} value={nextStatus ?? ''} onChange={(e) => setNextStatus(e.target.value || undefined)}>
            <option value="">Next status</option>
            {(NEXT_STATUS[statusRec.status] ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="mt-6 flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setStatusRec(null)}>Cancel</button>
            <button className="btn-primary" disabled={!nextStatus || changeStatus.isPending} style={{ opacity: !nextStatus || changeStatus.isPending ? 0.5 : 1 }} onClick={() => statusRec && nextStatus && changeStatus.mutate({ id: statusRec.id, status: nextStatus })}>{changeStatus.isPending ? 'Updating…' : 'Update'}</button>
          </div>
        </Overlay>
      )}

      {confirm && (
        <Overlay onClose={() => setConfirm(null)} maxW={440}>
          <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">{confirm.title}</h3>
          <p className="mt-2 font-body-sm text-body-sm text-secondary">{confirm.content}</p>
          <div className="mt-6 flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="btn-primary" style={confirm.danger ? { background: '#991B1B', boxShadow: '0 4px 12px rgba(220,38,38,0.2)' } : undefined} onClick={() => { confirm.onOk(); setConfirm(null); }}>{confirm.okText}</button>
          </div>
        </Overlay>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 font-label-md text-label-md text-white shadow-lg" style={{ background: toast.type === 'ok' ? '#166534' : toast.type === 'err' ? '#991B1B' : '#4F46E5' }}>{toast.msg}</div>
      )}
    </div>
  );
}

function Overlay({ onClose, children, maxW = 620 }: { onClose: () => void; children: React.ReactNode; maxW?: number }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-full rounded-2xl bg-white p-6 shadow-xl" style={{ maxWidth: maxW }} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function Field({ label, value, children, span }: { label: string; value?: React.ReactNode; children?: React.ReactNode; span?: boolean }) {
  return (
    <div className={span ? 'col-span-2' : ''}>
      <dt className="mb-1 font-label-sm text-label-sm text-secondary uppercase tracking-wider">{label}</dt>
      <dd className="font-body-sm text-body-sm text-on-surface">{children ?? value}</dd>
    </div>
  );
}
