'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCheck, CheckCircle2, ClipboardCheck, Clock, Eye, FlaskConical, Filter,
  MoreVertical, RefreshCw, Search, ShieldCheck, TrendingUp,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { AuthorizationModal } from '@/components/AuthorizationModal';
import { useFeatures } from '@/lib/feature-context';
import { FeatureGate } from '@/components/FeatureGate';
import { useInfiniteScroll, clientPage } from '@/hooks/useInfiniteScroll';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';

interface Rec {
  id: string;
  labNumber?: string | null;
  formType?: string | null;
  status: string;
  urgent: boolean;
  specimenDate?: string | null;
  createdAt: string;
  patientId?: string | null;
  patient?: { firstName: string; lastName: string; registrationNo?: string | null; gender?: string | null; dateOfBirth?: string | null } | null;
  client?: { firstName: string; lastName: string; officeName?: string | null; accountNo?: string | null } | null;
  specimens?: Array<{ id: string; type: string }>;
  resultSheets?: Array<{ id: string; authorized: boolean; authorizedAt?: string | null }>;
  statusHistory?: Array<{ status: string; createdAt: string }>;
  assignedToId?: string | null;
  assignedTo?: { id: string; firstName: string; lastName: string } | null;
}

type Tab = 'awaiting' | 'approved';
type Priority = 'High' | 'Medium' | 'Low' | 'Normal';

const TAB_STATUS: Record<Tab, string> = { awaiting: 'Resulted', approved: 'Approved' };

// Zero-orange palette (amber → detector-safe yellow #FACC15 / red per standing rule).
const PRIORITY_META: Record<Priority, { color: string; label: string }> = {
  High: { color: '#EF4444', label: 'High Priority' },
  Medium: { color: '#FACC15', label: 'Medium Priority' },
  Low: { color: '#84CC16', label: 'Low Priority' },
  Normal: { color: '#94A3B8', label: 'Normal' },
};
const PRIORITY_ORDER: Priority[] = ['High', 'Medium', 'Low', 'Normal'];

// Deterministic specimen-dot colour (no orange in the palette).
const SPEC_DOTS = ['#4F46E5', '#2563EB', '#0D9488', '#7C3AED', '#16A34A', '#DB2777', '#0EA5E9'];
const specDot = (t?: string) => {
  const s = t ?? '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return SPEC_DOTS[h % SPEC_DOTS.length];
};

// Deterministic avatar colour from a name hash.
const AVATAR_COLORS = ['bg-indigo-500', 'bg-violet-500', 'bg-blue-500', 'bg-teal-500', 'bg-green-500', 'bg-purple-500'];

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const relTime = (d?: string | null) => {
  if (!d) return '';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
const timeOfDay = (d?: string | null) => (d ? new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');
const specLabel = (t?: string) => (t ? t.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : '—');
const patientName = (r: Rec) => (r.patient ? `${r.patient.firstName} ${r.patient.lastName}`.trim() : '—');
const clientOffice = (r: Rec) => (r.client ? r.client.officeName || `${r.client.firstName} ${r.client.lastName}`.trim() : '—');
const doctorName = (r: Rec) => (r.client ? `${r.client.firstName} ${r.client.lastName}`.trim() : '');
const ageOf = (dob?: string | null) => {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(+d)) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 86_400_000));
};
const initialsOf = (name: string) => name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
const avatarClass = (name: string) => {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};
// Priority derived from urgency + time-in-queue (no explicit priority field exists).
const priorityOf = (r: Rec): Priority => {
  if (r.urgent) return 'High';
  const days = (Date.now() - new Date(r.createdAt).getTime()) / 86_400_000;
  if (days > 14) return 'Medium';
  if (days > 5) return 'Low';
  return 'Normal';
};
const firstEventAt = (hist: Rec['statusHistory'], status: string): number | null => {
  const t = (hist ?? []).filter((h) => h.status === status).map((h) => new Date(h.createdAt).getTime()).sort((a, b) => a - b)[0];
  return t ?? null;
};
const authorizedAtOf = (r: Rec) => r.resultSheets?.find((s) => s.authorized)?.authorizedAt ?? r.createdAt;

const CARD = 'rounded-xl border border-slate-100 bg-white shadow-sm';

function Sparkline({ color, data, w = 96, h = 34 }: { color: string; data: number[]; w?: number; h?: number }) {
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
    </svg>
  );
}

function PriorityDonut({ segments, total, size = 150 }: { segments: { value: number; color: string }[]; total: number; size?: number }) {
  const sw = 16, r = size / 2 - sw / 2 - 2, circ = 2 * Math.PI * r, c = size / 2;
  const sum = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#EEF2F7" strokeWidth={sw} />
        {segments.map((seg, i) => {
          const dash = (seg.value / sum) * circ;
          const el = (
            <circle key={i} cx={c} cy={c} r={r} fill="none" stroke={seg.color} strokeWidth={sw}
              strokeDasharray={`${Math.max(0, dash - 2)} ${circ - Math.max(0, dash - 2)}`}
              strokeDashoffset={-(offset / sum) * circ} transform={`rotate(-90 ${c} ${c})`} />
          );
          offset += seg.value;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-bold text-charcoal-heading">{total}</div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total</div>
      </div>
    </div>
  );
}

export default function AuthorizerPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('awaiting');
  const [authorizeRec, setAuthorizeRec] = useState<Rec | null>(null);
  const { isEnabled } = useFeatures();
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const toggleBatch = (id: string) => setBatchSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [search, setSearch] = useState('');
  const [formFilter, setFormFilter] = useState('all');
  const [specimenFilter, setSpecimenFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');

  const { data, isFetching } = useQuery({
    queryKey: ['records', 'authorizer', tab],
    queryFn: () => api.get<Paginated<Rec>>('/specimens', { params: { pageSize: 100, status: TAB_STATUS[tab] } }).then((r) => r.data),
  });
  // useMemo keeps `rows` stable while loading so the infinite-scroll fetchFn
  // (derived from `filtered`) doesn't reload every render.
  const rows: Rec[] = useMemo(() => data?.data ?? [], [data]);

  const { data: awaitingData } = useQuery({
    queryKey: ['records', 'authorizer', 'awaiting'],
    queryFn: () => api.get<Paginated<Rec>>('/specimens', { params: { pageSize: 100, status: 'Resulted' } }).then((r) => r.data),
  });
  const { data: approvedData } = useQuery({
    queryKey: ['records', 'authorizer', 'approved'],
    queryFn: () => api.get<Paginated<Rec>>('/specimens', { params: { pageSize: 100, status: 'Approved' } }).then((r) => r.data),
  });

  const awaiting = awaitingData?.data ?? [];
  const approved = approvedData?.data ?? [];
  const awaitingUrgent = awaiting.filter((r) => r.urgent).length;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const approvedToday = approved.filter((r) => new Date(authorizedAtOf(r)) >= todayStart).length;
  const oldestDays = awaiting.length ? Math.floor((Date.now() - Math.min(...awaiting.map((r) => new Date(r.createdAt).getTime()))) / 86_400_000) : null;

  // Authorized this week + trend vs the prior week (real, from authorizedAt).
  const now = Date.now(), WEEK = 7 * 86_400_000;
  const thisWeek = approved.filter((r) => now - new Date(authorizedAtOf(r)).getTime() <= WEEK).length;
  const lastWeek = approved.filter((r) => { const t = now - new Date(authorizedAtOf(r)).getTime(); return t > WEEK && t <= 2 * WEEK; }).length;
  const weekTrend = lastWeek ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : (thisWeek > 0 ? 100 : 0);

  // Average review time (Resulted → Approved), real, from statusHistory.
  const avgReviewHrs = useMemo(() => {
    let sum = 0, n = 0;
    for (const r of approved) {
      const res = firstEventAt(r.statusHistory, 'Resulted');
      const app = firstEventAt(r.statusHistory, 'Approved');
      if (res && app && app >= res) { sum += (app - res); n++; }
    }
    return n ? (sum / n) / 3_600_000 : null;
  }, [approved]);

  // Priority distribution over the awaiting queue (drives donut + column).
  const priorityCounts = useMemo(() => {
    const c: Record<Priority, number> = { High: 0, Medium: 0, Low: 0, Normal: 0 };
    for (const r of awaiting) c[priorityOf(r)]++;
    return c;
  }, [awaiting]);

  const recentAuth = useMemo(
    () => [...approved].sort((a, b) => new Date(authorizedAtOf(b)).getTime() - new Date(authorizedAtOf(a)).getTime()).slice(0, 3),
    [approved],
  );

  // AI confidence has no source field — illustrative sample distribution.
  const aiTotal = awaiting.length;
  const aiHigh = Math.round(aiTotal * 0.55);
  const aiMed = Math.round(aiTotal * 0.31);
  const aiLow = Math.max(0, aiTotal - aiHigh - aiMed);
  const aiPct = (n: number) => (aiTotal ? Math.round((n / aiTotal) * 100) : 0);

  // Filter option lists derived from the loaded rows.
  const specimenOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.specimens?.[0]?.type).filter(Boolean) as string[])), [rows]);
  const clientOptions = useMemo(() => Array.from(new Set(rows.map(clientOffice).filter((v) => v && v !== '—'))), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !`${r.labNumber ?? ''} ${patientName(r)} ${clientOffice(r)} ${specLabel(r.specimens?.[0]?.type)}`.toLowerCase().includes(q)) return false;
      if (formFilter !== 'all' && r.formType !== formFilter) return false;
      if (specimenFilter !== 'all' && r.specimens?.[0]?.type !== specimenFilter) return false;
      if (clientFilter !== 'all' && clientOffice(r) !== clientFilter) return false;
      return true;
    });
  }, [rows, search, formFilter, specimenFilter, clientFilter]);

  const totalRecords = filtered.length;
  // Infinite scroll over the client-side filtered records.
  const fetchFn = useCallback(
    (p: number, ps: number) => Promise.resolve(clientPage(filtered, p, ps)),
    [filtered],
  );
  const { items: pageRows, loading, initialLoading, hasMore, sentinelRef } =
    useInfiniteScroll<Rec>({ fetchFn, pageSize: 20 });

  const kpis = [
    { label: 'Awaiting Authorization', value: String(awaiting.length), sub: `${awaitingUrgent} urgent`, subColor: awaitingUrgent > 0 ? '#EF4444' : '#94A3B8', icon: ClipboardCheck, spark: '#94A3B8', data: [3, 5, 4, 6, 5, 7, 6] },
    { label: 'Approved Today', value: String(approvedToday), sub: 'authorized today', subColor: '#94A3B8', icon: CheckCircle2, spark: '#16A34A', data: [2, 3, 3, 4, 5, 5, 6] },
    { label: 'Oldest Pending', value: oldestDays != null ? `${oldestDays}d` : '—', sub: oldestDays != null ? `${oldestDays} days waiting` : 'none pending', subColor: (oldestDays ?? 0) > 3 ? '#EF4444' : '#94A3B8', icon: Clock, spark: '#EF4444', data: [4, 3, 5, 4, 6, 5, 7] },
    { label: 'Authorized This Week', value: String(thisWeek), sub: `${weekTrend >= 0 ? '↑' : '↓'} ${Math.abs(weekTrend)}% vs last week`, subColor: weekTrend >= 0 ? '#16A34A' : '#EF4444', icon: TrendingUp, spark: '#6366F1', data: [3, 4, 4, 5, 4, 6, 7] },
  ];

  const SELECT = 'h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary';
  const TH = 'px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap';
  const CELL = 'px-5 py-4 align-middle';

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-[30px] font-bold leading-tight tracking-tight text-charcoal-heading">
            Authorizer Workspace <ShieldCheck size={24} className="text-primary" />
          </h1>
          <p className="mt-1 text-sm text-secondary">Review and authorize cytology result sheets</p>
        </div>
        <div className="flex items-center gap-3">
          <FeatureGate feature="BATCH_AUTHORIZATION">
            {batchMode && batchSelected.size > 0 && (
              <button onClick={() => router.push(`/batch-authorize?recordIds=${Array.from(batchSelected).join(',')}`)}
                className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white">
                <CheckCheck size={16} /> Authorize Selected ({batchSelected.size})
              </button>
            )}
            {tab === 'awaiting' && (
              <button onClick={() => { setBatchMode((v) => !v); setBatchSelected(new Set()); }}
                className="rounded-full border px-4 py-2 text-sm font-semibold transition-colors"
                style={batchMode ? { background: '#EEF2FF', color: '#4F46E5', borderColor: '#C7D2FE' } : { background: '#fff', color: '#64748B', borderColor: '#E5E7EB' }}>
                Batch {batchMode ? 'On' : 'Off'}
              </button>
            )}
          </FeatureGate>
          <button onClick={() => qc.invalidateQueries({ queryKey: ['records', 'authorizer'] })} title="Refresh"
            className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-primary">
            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
          </button>
          <div className="inline-flex gap-1 rounded-full bg-slate-100 p-1">
            {([['awaiting', 'Awaiting'], ['approved', 'Approved']] as const).map(([v, l]) => (
              <button key={v} onClick={() => { setTab(v); }} className="rounded-full px-5 py-2 text-sm transition-colors"
                style={{ background: tab === v ? '#fff' : 'transparent', color: tab === v ? '#0F172A' : '#64748B', fontWeight: tab === v ? 700 : 600, boxShadow: tab === v ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, value, sub, subColor, icon: Icon, spark, data: sd }) => (
          <div key={label} className={`${CARD} p-5`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><Icon size={18} /></span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
                </div>
                <div className="mt-2 text-4xl font-bold leading-none text-charcoal-heading">{value}</div>
                <div className="mt-1.5 text-xs font-semibold" style={{ color: subColor }}>{sub}</div>
              </div>
              <Sparkline color={spark} data={sd} />
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className={`${CARD} mb-6 flex flex-wrap items-center gap-3 p-4`}>
        <div className="flex h-11 min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-slate-500">
          <Search size={16} />
          <input value={search} onChange={(e) => { setSearch(e.target.value); }} placeholder="Search lab #, patient, client, specimen..."
            className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-500" />
        </div>
        <select className={SELECT} value={formFilter} onChange={(e) => { setFormFilter(e.target.value); }}>
          <option value="all">All Forms</option>
          <option value="Gynecology">GYN</option>
          <option value="NonGynecology">Non-GYN</option>
        </select>
        <select className={SELECT} value={tab} disabled>
          <option value="awaiting">All Statuses</option>
        </select>
        <select className={SELECT} value={specimenFilter} onChange={(e) => { setSpecimenFilter(e.target.value); }}>
          <option value="all">All Types</option>
          {specimenOptions.map((t) => <option key={t} value={t}>{specLabel(t)}</option>)}
        </select>
        <select className={SELECT} value={clientFilter} onChange={(e) => { setClientFilter(e.target.value); }}>
          <option value="all">All Clients</option>
          {clientOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 hover:bg-slate-50">
          <Filter size={15} /> More Filters
        </button>
      </div>

      {/* Main split */}
      <div className="flex flex-col gap-6 xl:flex-row">
        {/* LEFT — records table */}
        <div className="min-w-0 flex-1">
          <div className={`${CARD} p-0`}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
              <h2 className="text-base font-semibold text-charcoal-heading">Records · {totalRecords}</h2>
            </div>
            {!initialLoading && pageRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <ClipboardCheck size={48} className="text-slate-200" />
                <div className="text-sm font-medium text-slate-500">{tab === 'awaiting' ? 'No records awaiting authorization' : 'No authorized records'}</div>
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-y border-slate-100">
                      {batchMode && tab === 'awaiting' && <th className={TH} />}
                      <th className={TH}>Lab #</th><th className={TH}>Patient</th><th className={TH}>Client</th>
                      <th className={TH}>Form</th><th className={TH}>Specimen</th><th className={TH}>Date</th>
                      <th className={TH}>Priority</th><th className={`${TH} text-right`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => {
                      const gyn = r.formType === 'Gynecology';
                      const name = patientName(r);
                      const age = ageOf(r.patient?.dateOfBirth);
                      const pr = priorityOf(r);
                      const meta = PRIORITY_META[pr];
                      return (
                        <tr key={r.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                          {batchMode && tab === 'awaiting' && (
                            <td className="pl-5"><input type="checkbox" checked={batchSelected.has(r.id)} onChange={() => toggleBatch(r.id)} style={{ accentColor: '#4F46E5' }} /></td>
                          )}
                          <td className={CELL}>
                            <div className="font-mono text-sm font-bold text-charcoal-heading">{r.labNumber ?? '—'}</div>
                            {r.urgent && <span className="mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ background: '#FEF2F2', color: '#DC2626' }}>Urgent</span>}
                          </td>
                          <td className={CELL}>
                            <div className="flex items-center gap-3">
                              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-semibold text-white ${avatarClass(name)}`}>{initialsOf(name)}</span>
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-charcoal-heading">{name}</div>
                                <div className="text-xs text-slate-500">
                                  {[r.patient?.gender, age != null ? `${age} Y` : null].filter(Boolean).join(' • ') || '—'}
                                </div>
                                {r.patient?.registrationNo && <div className="text-xs text-slate-500">{r.patient.registrationNo}</div>}
                              </div>
                            </div>
                          </td>
                          <td className={CELL}>
                            <div className="text-sm text-charcoal-heading">{clientOffice(r)}</div>
                            {r.client?.accountNo && <div className="text-xs text-slate-500">{r.client.accountNo}</div>}
                            {doctorName(r) && <div className="text-xs text-slate-500">{doctorName(r)}</div>}
                          </td>
                          <td className={CELL}>
                            {r.formType
                              ? <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={gyn ? { background: '#EEF3FF', color: '#4F46E5' } : { background: '#F1F5F9', color: '#64748B' }}>{gyn ? 'GYN' : 'NON-GYN'}</span>
                              : <span className="text-sm text-slate-500">—</span>}
                          </td>
                          <td className={CELL}>
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: specDot(r.specimens?.[0]?.type) }} />
                              <span className="text-sm text-slate-600">{specLabel(r.specimens?.[0]?.type)}</span>
                            </div>
                          </td>
                          <td className={CELL}>
                            <div className="text-sm text-charcoal-heading">{fmtDate(r.specimenDate ?? r.createdAt)}</div>
                            <div className="text-xs text-slate-500">{relTime(r.createdAt)}</div>
                          </td>
                          <td className={CELL}>
                            <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: meta.color }}>
                              <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} /> {pr}
                            </span>
                          </td>
                          <td className={CELL}>
                            <div className="flex items-center justify-end gap-1.5">
                              {tab === 'awaiting'
                                ? <button onClick={() => setAuthorizeRec(r)} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"><CheckCircle2 size={15} /> Authorize</button>
                                : <button onClick={() => setAuthorizeRec(r)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-primary hover:bg-indigo-50"><Eye size={15} /> Review</button>}
                              <button aria-label="View record" onClick={() => router.push(`/records/${r.id}`)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-primary"><Eye size={16} /></button>
                              <button aria-label="More actions" onClick={() => router.push(`/records/${r.id}`)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-600"><MoreVertical size={16} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Infinite scroll: auto-loads more filtered records on scroll. */}
            {filtered.length > 0 && (
              <ScrollSentinel ref={sentinelRef} loading={loading && !initialLoading} hasMore={hasMore} />
            )}
          </div>
        </div>

        {/* RIGHT — sidebar */}
        <div className="flex w-full shrink-0 flex-col gap-6 xl:w-[320px]">
          {/* Priority Breakdown */}
          <div className={`${CARD} p-5`}>
            <div className="mb-4 text-sm font-semibold text-charcoal-heading">Priority Breakdown</div>
            <div className="flex items-center gap-5">
              <PriorityDonut total={awaiting.length} segments={PRIORITY_ORDER.map((p) => ({ value: priorityCounts[p], color: PRIORITY_META[p].color }))} />
              <div className="flex flex-1 flex-col gap-2.5">
                {PRIORITY_ORDER.map((p) => (
                  <div key={p} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: PRIORITY_META[p].color }} /> {PRIORITY_META[p].label}
                    </span>
                    <span className="text-sm font-semibold text-charcoal-heading">{priorityCounts[p]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Average Review Time */}
          <div className={`${CARD} p-5`}>
            <div className="mb-3 text-sm font-semibold text-charcoal-heading">Average Review Time</div>
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Clock size={20} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-2xl font-bold text-charcoal-heading">{avgReviewHrs != null ? `${avgReviewHrs.toFixed(1)} hrs` : '—'}</div>
                <div className="text-xs text-slate-500">Resulted → Approved</div>
              </div>
              <Sparkline color="#6366F1" data={[5, 4, 4, 3, 4, 3, 2]} />
            </div>
          </div>

          {/* Recent Authorizations */}
          <div className={`${CARD} p-5`}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-charcoal-heading">Recent Authorizations</div>
              <button onClick={() => setTab('approved')} className="text-xs font-semibold text-primary hover:underline">View all</button>
            </div>
            <div className="flex flex-col gap-3">
              {recentAuth.length === 0 && <div className="text-sm text-slate-500">No authorizations yet.</div>}
              {recentAuth.map((r) => (
                <div key={r.id} className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><FlaskConical size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-xs font-bold text-charcoal-heading">{r.labNumber ?? '—'}</span>
                      <span className="shrink-0 text-[11px] font-semibold text-green-700">Authorized</span>
                    </div>
                    <div className="truncate text-xs text-slate-500">{patientName(r)} · {relTime(authorizedAtOf(r))} {timeOfDay(authorizedAtOf(r))}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Confidence Overview */}
          <div className={`${CARD} p-5`}>
            <div className="mb-3 flex items-center gap-2">
              <div className="text-sm font-semibold text-charcoal-heading">AI Confidence Overview</div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Sample</span>
            </div>
            <div className="flex flex-col gap-3">
              {[
                { label: 'High (≥90%)', n: aiHigh, color: '#16A34A' },
                { label: 'Medium (70–89%)', n: aiMed, color: '#FACC15' },
                { label: 'Low (<70%)', n: aiLow, color: '#EF4444' },
              ].map(({ label, n, color }) => (
                <div key={label}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-semibold text-charcoal-heading">{n} ({aiPct(n)}%)</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${aiPct(n)}%`, background: color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <AuthorizationModal open={!!authorizeRec} onClose={() => setAuthorizeRec(null)} record={authorizeRec} />
    </div>
  );
}
