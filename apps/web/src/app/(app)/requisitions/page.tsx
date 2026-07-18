'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  AlertCircle, Calendar, CheckCircle2, ChevronsUpDown, CircleDashed, FileText,
  Inbox, Plus, RotateCcw, Search, Upload,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell } from 'recharts';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useInfiniteScroll, clientPage } from '@/hooks/useInfiniteScroll';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { RequisitionFormDrawer } from '@/components/RequisitionFormDrawer';
import { RequisitionDetailDrawer } from '@/components/RequisitionDetailDrawer';
import { RequisitionReportModal } from '@/components/RequisitionReportModal';
import { PendingBatchesTab } from '@/components/requisitions/PendingBatchesTab';
import { Card, Button, TableEmpty } from '@/components/ui';

interface RequisitionLine { id: string; isCompleted: boolean; referenceNo?: string | null; record?: { labNumber?: string | null } | null }
interface Requisition {
  id: string;
  referenceNo?: string | null;
  status: string;
  amount: number; // cents
  client?: { id?: string; firstName: string; lastName: string; officeName?: string | null; accountNo?: string | null } | null;
  dateReceived?: string | null;
  lines: RequisitionLine[];
  _count?: { lines: number };
  createdAt: string;
}

// Status → badge. PARTIAL uses amber per the reference (explicitly requested,
// "NOT orange") — the one warm accent on this page.
const STATUS_UI: Record<string, { bg: string; fg: string; label: string }> = {
  // ZERO-ORANGE: --color-warning (#A16207) is safe on white but its anti-aliased
  // edges trip when blended over amber-100. --status-warning-strong (#854D0E) is
  // safe at every alpha over both.
  Partial: { bg: 'var(--status-warning-soft-100)', fg: 'var(--status-warning-strong)', label: 'PARTIAL' },
  Completed: { bg: '#DCFCE7', fg: '#15803D', label: 'COMPLETE' },
  Active: { bg: '#DBEAFE', fg: '#1D4ED8', label: 'RECEIVED' },
  Received: { bg: '#DBEAFE', fg: '#1D4ED8', label: 'RECEIVED' },
  Pending: { bg: '#F1F5F9', fg: '#475569', label: 'PENDING' },
  Disabled: { bg: '#F1F5F9', fg: '#475569', label: 'DISABLED' },
};
const statusUI = (s: string) => STATUS_UI[s] ?? { bg: '#F1F5F9', fg: '#475569', label: s.toUpperCase() };
// Detector-safe amber (not orange) — matches the PARTIAL badge accent.
const AMBER = 'var(--color-warning)', GREEN = '#22C55E';

const AVATAR_HEX = ['#4F46E5', '#7C3AED', '#2563EB', '#0D9488', '#16A34A', '#9333EA'];
const avatarBg = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h += s.charCodeAt(i); return AVATAR_HEX[h % AVATAR_HEX.length]; };
const clientName = (r: Requisition) => (r.client ? (r.client.officeName || `${r.client.firstName} ${r.client.lastName}`.trim()) : '—');
const initialsOf = (name: string) => name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
const ordered = (r: Requisition) => r._count?.lines ?? r.lines?.length ?? 0;
const fulfilled = (r: Requisition) => (r.lines ?? []).filter((l) => l.isCompleted).length;
const money = (cents?: number) => `$${((Number(cents) || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const fmtTime = (d?: string | null) => (d ? new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');

// Stable empty fallback: a fresh [] each render would change the filtered-list
// identity and retrigger the infinite-scroll fetchFn on every render.
const NO_REQS: Requisition[] = [];

function StatusBadge({ status }: { status: string }) {
  const u = statusUI(status);
  return <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: u.bg, color: u.fg }}>{u.label}</span>;
}

export default function RequisitionsPage() {
  const { can } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [tab, setTab] = useState<'requisitions' | 'batches'>('requisitions');
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('all');
  const [clientF, setClientF] = useState('all');
  const [dateRange, setDateRange] = useState('30');
  const [sortDesc, setSortDesc] = useState(true);

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['requisitions', 'all'],
    queryFn: () => api.get<Paginated<Requisition>>('/requisitions', { params: { page: 1, pageSize: 500 } }).then((r) => r.data),
  });
  const all = data?.data ?? NO_REQS;
  const errorMessage = (error as any)?.code === 'ECONNABORTED' ? 'The request timed out. Please try again.'
    : (error as any)?.response?.data?.message ?? 'Could not load requisitions. Please try again.';

  // ── Aggregates (all real, from the fetched requisitions) ───────────────────
  const totalCount = all.length;
  const partialCount = all.filter((r) => r.status === 'Partial').length;
  const completeCount = all.filter((r) => r.status === 'Completed').length;
  const receivedCount = all.filter((r) => r.status === 'Active' || r.status === 'Received').length;
  const totalAmount = all.reduce((s, r) => s + (r.amount || 0), 0);
  const partialAmount = all.filter((r) => r.status === 'Partial').reduce((s, r) => s + (r.amount || 0), 0);
  const completedAmount = all.filter((r) => r.status === 'Completed').reduce((s, r) => s + (r.amount || 0), 0);
  const donutBase = partialAmount + completedAmount || 1;
  const partialPct = Math.round((partialAmount / donutBase) * 1000) / 10;
  const completePct = Math.round((completedAmount / donutBase) * 1000) / 10;
  const donut = [{ label: 'Partial', value: partialAmount, color: AMBER }, { label: 'Complete', value: completedAmount, color: GREEN }];
  const recent = useMemo(() => [...all].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5), [all]);

  const statusOptions = useMemo(() => Array.from(new Set(all.map((r) => r.status))), [all]);
  const clientOptions = useMemo(() => Array.from(new Set(all.map(clientName).filter((c) => c && c !== '—'))), [all]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cutoff = dateRange === 'all' ? 0 : Date.now() - Number(dateRange) * 86_400_000;
    const list = all.filter((r) => {
      // Searchable text: requisition ref, client, accession, AND every item's
      // reference number + linked Lab No. — so a copied item ref finds its batch.
      const itemRefs = (r.lines ?? []).map((l) => `${l.referenceNo ?? ''} ${l.record?.labNumber ?? ''}`).join(' ');
      if (q && !`${r.referenceNo ?? ''} ${clientName(r)} ${r.client?.accountNo ?? ''} ${itemRefs}`.toLowerCase().includes(q)) return false;
      if (statusF !== 'all' && r.status !== statusF) return false;
      if (clientF !== 'all' && clientName(r) !== clientF) return false;
      if (cutoff) { const d = r.dateReceived ?? r.createdAt; if (new Date(d).getTime() < cutoff) return false; }
      return true;
    });
    return list.sort((a, b) => {
      const av = new Date(a.dateReceived ?? a.createdAt).getTime(), bv = new Date(b.dateReceived ?? b.createdAt).getTime();
      return sortDesc ? bv - av : av - bv;
    });
  }, [all, search, statusF, clientF, dateRange, sortDesc]);

  // Infinite scroll over the client-side filtered set (aggregates still use the
  // full `all`). Changing any filter recomputes `filtered` → new fetchFn → the
  // hook reloads from page 1 automatically.
  const fetchFn = useCallback(
    (page: number, pageSize: number) => Promise.resolve(clientPage(filtered, page, pageSize)),
    [filtered],
  );
  const { items: pageRows, loading, initialLoading, hasMore, sentinelRef } =
    useInfiniteScroll<Requisition>({ fetchFn, pageSize: 20 });

  const clearFilters = () => { setSearch(''); setStatusF('all'); setClientF('all'); setDateRange('30'); };
  // Client {id,name} list for the report modal's client filter.
  const reportClients = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of all) if (r.client?.id) m.set(r.client.id, clientName(r));
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [all]);

  const SELECT = 'h-12 rounded-xl border border-slate-200 bg-white px-3.5 text-base text-slate-600 outline-none focus:border-primary';
  const TH = 'px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap';
  const CELL = 'px-5 py-4 align-middle';

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[38px] font-bold leading-tight tracking-tight text-charcoal-heading">Requisitions</h1>
        <p className="mt-1.5 text-base text-secondary">Manage and track all lab requisitions and their status.</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {can('requisition:create') && <Button onClick={() => setDrawerOpen(true)}><Plus size={16} /> New Requisition</Button>}
          <Button variant="outline" onClick={() => setReportOpen(true)}><Upload size={15} /> Export Report</Button>
        </div>
      </div>

      {/* Tabs: standard requisitions vs incoming portal batches */}
      <div className="mb-6 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
        <button onClick={() => setTab('requisitions')} className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${tab === 'requisitions' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Requisitions</button>
        <button onClick={() => setTab('batches')} className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${tab === 'batches' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Pending Batches</button>
      </div>

      {tab === 'batches' ? (
        <PendingBatchesTab can={can} />
      ) : (
      <>
      {/* Filter bar */}
      <Card radius="sm" elevation="sm" border="subtle" className="mb-6 flex flex-wrap items-center gap-3 p-4">
        <div className="flex h-12 min-w-[280px] flex-1 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 text-slate-500">
          <Search size={18} />
          <input value={search} onChange={(e) => { setSearch(e.target.value); }} placeholder="Search by ref #, item #, Lab No., client, or accession..." className="w-full border-none bg-transparent text-base text-slate-700 outline-none placeholder:text-slate-500" />
        </div>
        <select className={SELECT} value={statusF} onChange={(e) => { setStatusF(e.target.value); }}><option value="all">All Statuses</option>{statusOptions.map((s) => <option key={s} value={s}>{statusUI(s).label}</option>)}</select>
        <select className={SELECT} value={clientF} onChange={(e) => { setClientF(e.target.value); }}><option value="all">All Clients</option>{clientOptions.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <div className="relative">
          <select className={`${SELECT} pl-9`} value={dateRange} onChange={(e) => { setDateRange(e.target.value); }}><option value="7">Last 7 Days</option><option value="30">Last 30 Days</option><option value="90">Last 90 Days</option><option value="all">All Time</option></select>
          <Calendar size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        </div>
        <button onClick={clearFilters} className="flex h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-base font-medium text-slate-600 hover:bg-slate-50"><RotateCcw size={16} /> Clear filters</button>
      </Card>

      {isError && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-error/20 bg-error-container p-4">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-error" />
          <div className="flex-1">
            <div className="font-label-md text-label-md text-error">Failed to load</div>
            <div className="font-body-sm text-body-sm text-on-error-container">{errorMessage}</div>
            <Button variant="secondary" className="mt-3" onClick={() => refetch()}><RotateCcw size={14} /> Retry</Button>
          </div>
        </div>
      )}

      {/* Main split */}
      <div className="flex flex-col gap-6 xl:flex-row">
        <div className="min-w-0 flex-1">
          <Card radius="sm" elevation="sm" border="subtle" className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className={TH}>Ref #</th><th className={TH}>Client</th><th className={TH}>Items</th><th className={TH}>Amount</th><th className={TH}>Status</th>
                    <th className={TH}><button onClick={() => setSortDesc((v) => !v)} className="flex items-center gap-1 uppercase tracking-wide hover:text-slate-600">Received <ChevronsUpDown size={12} /></button></th>
                  </tr>
                </thead>
                <tbody>
                  {isFetching && all.length === 0 && Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-100"><td colSpan={6} className="px-5 py-4"><div className="h-5 w-full animate-pulse rounded-md bg-surface-container" /></td></tr>
                  ))}
                  {!isFetching && !initialLoading && filtered.length === 0 && <TableEmpty colSpan={6} pad="lg">No requisitions found.</TableEmpty>}
                  {pageRows.map((r) => {
                    const name = clientName(r);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setDetailId(r.id)}
                        className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50"
                      >
                        <td className={CELL}><span className="text-sm font-bold text-primary hover:underline">{r.referenceNo ?? '—'}</span></td>
                        <td className={CELL}>
                          <div className="flex items-center gap-3">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white" style={{ background: avatarBg(name) }}>{initialsOf(name)}</span>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-charcoal-heading">{name}</div>
                              {r.client?.accountNo && <div className="text-[11px] text-slate-500">AC# {r.client.accountNo}</div>}
                            </div>
                          </div>
                        </td>
                        <td className={CELL}><div className="text-sm text-charcoal-heading">Ordered: {ordered(r)}</div><div className="text-[11px] text-slate-500">Fulfilled: {fulfilled(r)}</div></td>
                        <td className={CELL}><span className="text-sm font-bold text-primary">{money(r.amount)}</span></td>
                        <td className={CELL}><StatusBadge status={r.status} /></td>
                        <td className={CELL}><div className="text-sm font-semibold text-charcoal-heading">{fmtDate(r.dateReceived ?? r.createdAt)}</div><div className="text-[11px] text-slate-500">{fmtTime(r.dateReceived ?? r.createdAt)}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Infinite scroll: auto-loads more of the filtered list on scroll. */}
            {filtered.length > 0 && (
              <ScrollSentinel ref={sentinelRef} loading={loading && !initialLoading} hasMore={hasMore} />
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="flex w-full shrink-0 flex-col gap-6 xl:w-[380px]">
          <Card radius="sm" elevation="sm" border="subtle" className="p-6">
            <div className="mb-5 text-base font-semibold text-charcoal-heading">Requisitions Overview</div>
            <div className="flex flex-col gap-4">
              {[
                { icon: <FileText size={20} className="text-indigo-600" />, label: 'Total Requisitions', value: totalCount },
                { icon: <CircleDashed size={20} style={{ color: 'var(--color-warning)' }} />, label: 'Partial', value: partialCount },
                { icon: <CheckCircle2 size={20} className="text-green-700" />, label: 'Complete', value: completeCount },
                { icon: <Inbox size={20} className="text-blue-600" />, label: 'Received', value: receivedCount },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between">
                  <span className="flex items-center gap-3 text-base text-slate-600">{r.icon} {r.label}</span>
                  <span className="text-lg font-bold text-charcoal-heading">{r.value}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card radius="sm" elevation="sm" border="subtle" className="p-6">
            <div className="text-base font-semibold text-charcoal-heading">Total Amount</div>
            <div className="mt-1 text-[40px] font-bold leading-tight text-charcoal-heading">{money(totalAmount)}</div>
            <div className="text-sm text-slate-500">Across {totalCount} requisitions</div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div><div className="text-xs font-semibold" style={{ color: 'var(--color-warning)' }}>Partial Amount</div><div className="text-base font-bold text-charcoal-heading">{money(partialAmount)}</div></div>
              <div><div className="text-xs font-semibold text-green-700">Completed Amount</div><div className="text-base font-bold text-charcoal-heading">{money(completedAmount)}</div></div>
            </div>
            <div className="mt-5 flex items-center gap-5">
              <PieChart width={128} height={128}><Pie data={donut} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={62} paddingAngle={2} stroke="none">{donut.map((s, i) => <Cell key={i} fill={s.color} />)}</Pie></PieChart>
              <div className="flex flex-1 flex-col gap-3">
                <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: AMBER }} /> Partial</span><span className="font-semibold text-charcoal-heading">{partialPct}%</span></div>
                <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: GREEN }} /> Complete</span><span className="font-semibold text-charcoal-heading">{completePct}%</span></div>
              </div>
            </div>
          </Card>

          <Card radius="sm" elevation="sm" border="subtle" className="p-6">
            <div className="mb-4 flex items-center justify-between"><span className="text-base font-semibold text-charcoal-heading">Recent Requisitions</span><button onClick={() => { setTab('requisitions'); clearFilters(); }} className="text-sm font-semibold text-primary hover:underline">View all</button></div>
            <div className="flex flex-col gap-4">
              {recent.length === 0 && <div className="text-base text-slate-500">No requisitions yet.</div>}
              {recent.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-charcoal-heading">#{r.referenceNo ?? '—'} <span className="font-normal text-slate-500">{clientName(r)}</span></div>
                    <div className="text-xs text-slate-500">{fmtDate(r.dateReceived ?? r.createdAt)} · {fmtTime(r.dateReceived ?? r.createdAt)}</div>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      </>
      )}

      <RequisitionFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <RequisitionDetailDrawer requisitionId={detailId} open={!!detailId} onClose={() => setDetailId(null)} canEdit={can('requisition:create')} />
      <RequisitionReportModal open={reportOpen} onClose={() => setReportOpen(false)} clients={reportClients} />
    </div>
  );
}
