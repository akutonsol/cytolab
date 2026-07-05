'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Archive, Clock, Database, FileSearch, FileText, Globe, HelpCircle, Layers, Pencil, Plus, Search, ShieldCheck, Tag, Trash2, X,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useInfiniteScroll, clientPage } from '@/hooks/useInfiniteScroll';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { useAuth } from '@/lib/auth';

interface LabCode {
  id: string;
  code: string;
  region?: string | null;
  createdAt: string;
  updatedAt: string;
  clientsUsing?: number;
}

const truncate = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n)}…` : s);

// Deterministic avatar colour from the code (sum of char codes % palette).
// Inline hex (not Tailwind bg-* classes) so the colour can't be purged by JIT.
const AVATAR_HEX = ['#4F46E5', '#7C3AED', '#2563EB', '#0D9488', '#16A34A', '#9333EA']; // indigo · violet · blue · teal · green · purple
const avatarBg = (s: string) => {
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
  return AVATAR_HEX[sum % AVATAR_HEX.length];
};
const initialsOf = (code: string) => code.replace(/\s+/g, '').slice(0, 2).toUpperCase() || '?';
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const fmtTime = (d?: string | null) => (d ? new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');

const CARD = 'rounded-xl border border-slate-100 bg-white shadow-sm';

function Sparkline({ color, data = [3, 4, 4, 5, 6, 6, 7], w = 84, h = 30 }: { color: string; data?: number[]; w?: number; h?: number }) {
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
    </svg>
  );
}

function KpiCard({ icon, iconClass, label, value, sub, spark }: {
  icon: React.ReactNode; iconClass: string; label: string; value: React.ReactNode; sub: string; spark: string;
}) {
  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${iconClass}`}>{icon}</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
          </div>
          <div className="mt-2 text-4xl font-bold leading-none text-charcoal-heading">{value}</div>
          <div className="mt-1.5 text-xs text-slate-500">{sub}</div>
        </div>
        <Sparkline color={spark} />
      </div>
    </div>
  );
}

// ── New / Edit modal ─────────────────────────────────────────────────────────
function LabCodeModal({ editing, onClose }: { editing: LabCode | 'new'; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = editing === 'new';
  const [code, setCode] = useState(isNew ? '' : editing.code);
  const [region, setRegion] = useState(isNew ? '' : (editing.region ?? ''));
  const [err, setErr] = useState('');

  const save = useMutation({
    mutationFn: () =>
      isNew
        ? api.post('/labcodes', { code: code.trim(), region: region.trim() || undefined })
        : api.put(`/labcodes/update/${editing.id}`, { code: code.trim(), region: region.trim() || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['labcodes'] }); onClose(); },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Save failed'),
  });

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-charcoal-heading">{isNew ? 'New Lab Code' : 'Edit Lab Code'}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <label className="mb-1 block text-sm font-medium text-slate-600">Code</label>
        <input autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODE"
          className="mb-4 h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm text-slate-700 outline-none focus:border-primary" />
        <label className="mb-1 block text-sm font-medium text-slate-600">Region</label>
        <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Kingston"
          className="mb-2 h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm text-slate-700 outline-none focus:border-primary" />
        {err && <div className="mb-2 text-sm text-error">{err}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => save.mutate()} disabled={!code.trim() || save.isPending} className="btn-primary" style={{ opacity: !code.trim() || save.isPending ? 0.5 : 1 }}>
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Lab Codes tab ────────────────────────────────────────────────────────────
function LabCodesTab() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [sort, setSort] = useState<'az' | 'za' | 'recent'>('az');
  const [modal, setModal] = useState<LabCode | 'new' | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { data: codesData } = useQuery<LabCode[]>({
    queryKey: ['labcodes'],
    queryFn: () => api.get('/labcodes').then((r) => r.data),
  });
  const codes = useMemo(() => codesData ?? [], [codesData]);

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/labcodes/delete/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['labcodes'] }); setConfirmId(null); },
  });

  // KPIs (all real; every existing code is treated as Active — no draft/archived concept).
  const total = codes.length;
  const regions = useMemo(() => Array.from(new Set(codes.map((c) => c.region).filter(Boolean) as string[])), [codes]);
  const activeCount = total; // all codes are live
  const activePct = total ? Math.round((activeCount / total) * 100) : 0;
  const codesInUse = codes.filter((c) => (c.clientsUsing ?? 0) > 0).length;
  const totalClientsUsing = codes.reduce((s, c) => s + (c.clientsUsing ?? 0), 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = codes.filter((c) =>
      (!q || `${c.code} ${c.region ?? ''}`.toLowerCase().includes(q)) &&
      (regionFilter === 'all' || c.region === regionFilter));
    list = [...list].sort((a, b) =>
      sort === 'az' ? a.code.localeCompare(b.code)
        : sort === 'za' ? b.code.localeCompare(a.code)
          : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return list;
  }, [codes, search, regionFilter, sort]);

  const fetchFn = useCallback((p: number, ps: number) => Promise.resolve(clientPage(filtered, p, ps)), [filtered]);
  const { items: pageRows, loading, initialLoading, hasMore, sentinelRef } = useInfiniteScroll<LabCode>({ fetchFn, pageSize: 20 });

  const recent = useMemo(
    () => [...codes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5),
    [codes],
  );

  const canEdit = can('labcode:change');
  const canDelete = can('labcode:delete');
  const SELECT = 'h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary';
  const TH = 'px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap';
  const CELL = 'px-6 py-4 align-middle';

  return (
    <div className="flex flex-col gap-6 xl:flex-row">
      {/* LEFT */}
      <div className="min-w-0 flex-1">
        {/* KPI strip */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={<Tag size={20} />} iconClass="bg-violet-50 text-violet-600" label="Total Lab Codes" value={total} sub="All lab region codes" spark="#475569" />
          <KpiCard icon={<Globe size={20} />} iconClass="bg-green-50 text-green-700" label="Regions" value={regions.length} sub="Covered regions" spark="#16A34A" />
          <KpiCard icon={<ShieldCheck size={20} />} iconClass="bg-blue-50 text-blue-600" label="Active Codes" value={activeCount} sub={`${activePct}% active`} spark="#2563EB" />
          <KpiCard icon={<Database size={20} />} iconClass="bg-yellow-50 text-yellow-400" label="Codes In Use" value={codesInUse} sub="Referenced by clients" spark="#FACC15" />
        </div>

        {/* Filter bar */}
        <div className={`${CARD} mb-6 flex flex-wrap items-center gap-3 p-4`}>
          <div className="flex h-11 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-slate-500">
            <Search size={16} />
            <input value={search} onChange={(e) => { setSearch(e.target.value); }} placeholder="Search lab code..."
              className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-500" />
          </div>
          <select className={SELECT} value={regionFilter} onChange={(e) => { setRegionFilter(e.target.value); }}>
            <option value="all">All Regions</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select className={SELECT} value="all" disabled>
            <option value="all">All Statuses</option>
          </select>
          <select className={SELECT} value={sort} onChange={(e) => setSort(e.target.value as any)}>
            <option value="az">Code (A–Z)</option>
            <option value="za">Code (Z–A)</option>
            <option value="recent">Recently Updated</option>
          </select>
          {can('labcode:create') && (
            <button onClick={() => setModal('new')} className="btn-primary ml-auto"><Plus size={16} /> New Lab Code</button>
          )}
        </div>

        {/* Table */}
        <div className={`${CARD} p-0`}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className={TH}>Code</th><th className={TH}>Region</th><th className={TH}>Status</th>
                  <th className={TH}>Records Using</th><th className={TH}>Last Updated</th><th className={`${TH} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {!initialLoading && pageRows.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">No lab codes found.</td></tr>
                )}
                {pageRows.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                    <td className={CELL}>
                      <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-semibold text-white" style={{ background: avatarBg(c.code) }}>{initialsOf(c.code)}</span>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-charcoal-heading">{c.code}</div>
                          <div className="text-xs text-slate-500">Created {fmtDate(c.createdAt)}</div>
                        </div>
                      </div>
                    </td>
                    <td className={CELL}>
                      <div className="text-sm text-charcoal-heading">{c.region || '—'}</div>
                    </td>
                    <td className={CELL}>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Active
                      </span>
                    </td>
                    <td className={CELL}>
                      <div className="text-sm font-semibold text-charcoal-heading">{c.clientsUsing ?? 0}</div>
                      <div className="text-xs text-slate-500">records</div>
                    </td>
                    <td className={CELL}>
                      <div className="text-sm text-charcoal-heading">{fmtDate(c.updatedAt)}</div>
                      <div className="text-xs text-slate-500">{fmtTime(c.updatedAt)}</div>
                    </td>
                    <td className={CELL}>
                      <div className="flex items-center justify-end gap-1.5">
                        {canEdit && (
                          <button aria-label="Edit" onClick={() => setModal(c)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-primary"><Pencil size={15} /></button>
                        )}
                        {canDelete && (
                          confirmId === c.id ? (
                            <span className="flex items-center gap-1">
                              <button onClick={() => del.mutate(c.id)} disabled={del.isPending} className="rounded-lg bg-error px-2.5 py-1.5 text-xs font-semibold text-white">Delete</button>
                              <button onClick={() => setConfirmId(null)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-500">Cancel</button>
                            </span>
                          ) : (
                            <button aria-label="Delete" onClick={() => setConfirmId(c.id)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-error-container hover:text-error"><Trash2 size={15} /></button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Infinite scroll: auto-loads more codes on scroll. */}
          {filtered.length > 0 && (
            <ScrollSentinel ref={sentinelRef} loading={loading && !initialLoading} hasMore={hasMore} />
          )}
        </div>
      </div>

      {/* RIGHT sidebar */}
      <div className="flex w-full shrink-0 flex-col gap-6 xl:w-[300px]">
        {/* Overview */}
        <div className={`${CARD} p-5`}>
          <div className="mb-4 text-sm font-semibold text-charcoal-heading">Lab Codes Overview</div>
          <div className="flex flex-col gap-3.5">
            {[
              { icon: <Tag size={16} className="text-violet-600" />, label: 'Total Lab Codes', value: total },
              { icon: <ShieldCheck size={16} className="text-green-700" />, label: 'Active Codes', value: activeCount },
              { icon: <Archive size={16} className="text-slate-500" />, label: 'Archived Codes', value: 0 },
              { icon: <Globe size={16} className="text-blue-600" />, label: 'Regions Covered', value: regions.length },
              { icon: <Database size={16} className="text-indigo-600" />, label: 'Records Using Codes', value: totalClientsUsing },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between">
                <span className="flex items-center gap-2.5 text-sm text-slate-600">{r.icon} {r.label}</span>
                <span className="text-sm font-bold text-charcoal-heading">{r.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recently updated */}
        <div className={`${CARD} p-5`}>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-charcoal-heading">Recently Updated Codes</div>
            <button onClick={() => setSort('recent')} className="text-xs font-semibold text-primary hover:underline">View all</button>
          </div>
          <div className="flex flex-col gap-3">
            {recent.length === 0 && <div className="text-sm text-slate-500">No codes yet.</div>}
            {recent.map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white" style={{ background: avatarBg(c.code) }}>{initialsOf(c.code)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-charcoal-heading">{c.code}</div>
                  <div className="truncate text-xs text-slate-500">{c.region || '—'}</div>
                </div>
                <div className="shrink-0 text-xs text-slate-500">{fmtDate(c.updatedAt)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Need help */}
        <div className={`${CARD} p-5`}>
          <div className="mb-2 flex items-center gap-2">
            <HelpCircle size={18} className="text-primary" />
            <div className="text-sm font-semibold text-charcoal-heading">Need Help?</div>
          </div>
          <p className="mb-4 text-sm text-slate-500">Lab codes are used when creating or updating client records and linked cases.</p>
          <a href="https://docs.cytolab.app" target="_blank" rel="noreferrer" className="btn-secondary w-full justify-center">View Documentation</a>
        </div>
      </div>

      {modal && <LabCodeModal editing={modal} onClose={() => setModal(null)} />}
    </div>
  );
}

// ── Code Sheets / Code Findings catalog (shared table + slide-over) ──────────
interface CodeItem { id: string; abbreviation: string; description?: string | null; createdAt: string; updatedAt: string }

const CATALOG_CFG = {
  sheets: {
    queryKey: 'codesheets', base: '/codesheets', noun: 'code sheets',
    codeHeader: 'Abbreviation', codeLabel: 'Abbreviation', codePlaceholder: 'NC SS',
    addLabel: 'Add Code Sheet', totalLabel: 'Total Code Sheets', totalSub: 'All code sheets',
    midLabel: 'Active Sheets', midSub: '100% active', midIcon: ShieldCheck,
    emptyIcon: FileText, emptyText: 'No code sheets yet. Add your first sheet.',
  },
  findings: {
    queryKey: 'codefindings', base: '/codefindings', noun: 'findings',
    codeHeader: 'Code', codeLabel: 'Abbreviated Code', codePlaceholder: 'CANDIS-H',
    addLabel: 'Add Code Finding', totalLabel: 'Total Findings', totalSub: 'All findings',
    midLabel: 'Categories', midSub: 'Distinct code prefixes', midIcon: Layers,
    emptyIcon: FileSearch, emptyText: 'No code findings yet. Add your first finding.',
  },
} as const;

function CodeSlideOver({ cfg, editing, onClose }: { cfg: typeof CATALOG_CFG[keyof typeof CATALOG_CFG]; editing: CodeItem | 'new'; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = editing === 'new';
  const [abbr, setAbbr] = useState(isNew ? '' : editing.abbreviation);
  const [desc, setDesc] = useState(isNew ? '' : (editing.description ?? ''));
  const [err, setErr] = useState('');

  const save = useMutation({
    mutationFn: () =>
      isNew
        ? api.post(cfg.base, { abbreviation: abbr.trim(), description: desc.trim() })
        : api.put(`${cfg.base}/update/${editing.id}`, { abbreviation: abbr.trim(), description: desc.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [cfg.queryKey] }); onClose(); },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Save failed'),
  });

  return (
    <div className="fixed inset-0 z-[120] flex justify-end bg-black/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-bold text-charcoal-heading">{isNew ? cfg.addLabel : `Edit ${cfg.codeLabel}`}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <label className="mb-1 block text-sm font-medium text-slate-600">{cfg.codeLabel}</label>
          <input autoFocus value={abbr} onChange={(e) => setAbbr(e.target.value.toUpperCase())} placeholder={cfg.codePlaceholder}
            className="mb-4 h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm text-slate-700 outline-none focus:border-primary" />
          <label className="mb-1 block text-sm font-medium text-slate-600">Description</label>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} placeholder="Description"
            className="w-full rounded-xl border border-slate-200 p-3.5 text-sm text-slate-700 outline-none focus:border-primary" style={{ resize: 'vertical' }} />
          {err && <div className="mt-2 text-sm text-error">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => save.mutate()} disabled={!abbr.trim() || save.isPending} className="btn-primary" style={{ opacity: !abbr.trim() || save.isPending ? 0.5 : 1 }}>
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CodeCatalogTab({ variant }: { variant: 'sheets' | 'findings' }) {
  const cfg = CATALOG_CFG[variant];
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [slideOver, setSlideOver] = useState<CodeItem | 'new' | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { data: rowsData } = useQuery<CodeItem[]>({
    queryKey: [cfg.queryKey],
    queryFn: () => api.get(cfg.base).then((r) => r.data),
  });
  const rows = useMemo(() => rowsData ?? [], [rowsData]);

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`${cfg.base}/delete/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [cfg.queryKey] }); setConfirmId(null); },
  });

  const total = rows.length;
  const monthAgo = Date.now() - 30 * 86_400_000;
  const recentlyAdded = rows.filter((r) => r.createdAt && new Date(r.createdAt).getTime() >= monthAgo).length;
  const mid = variant === 'sheets'
    ? total
    : new Set(rows.map((r) => (r.abbreviation.split('-')[0] || '').trim()).filter(Boolean)).size;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => `${r.abbreviation} ${r.description ?? ''}`.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const fetchFn = useCallback((p: number, ps: number) => Promise.resolve(clientPage(filtered, p, ps)), [filtered]);
  const { items: pageRows, loading, initialLoading, hasMore, sentinelRef } = useInfiniteScroll<CodeItem>({ fetchFn, pageSize: 20 });

  const TH = 'px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap';
  const CELL = 'px-6 py-4 align-middle';

  return (
    <div>
      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard icon={<cfg.emptyIcon size={20} />} iconClass="bg-violet-50 text-violet-600" label={cfg.totalLabel} value={total} sub={cfg.totalSub} spark="#475569" />
        <KpiCard icon={<cfg.midIcon size={20} />} iconClass="bg-green-50 text-green-700" label={cfg.midLabel} value={mid} sub={cfg.midSub} spark="#16A34A" />
        <KpiCard icon={<Clock size={20} />} iconClass="bg-blue-50 text-blue-600" label="Recently Added" value={recentlyAdded} sub="Last 30 days" spark="#2563EB" />
      </div>

      {/* Filter bar */}
      <div className={`${CARD} mb-6 flex flex-wrap items-center gap-3 p-4`}>
        <div className="flex h-11 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-slate-500">
          <Search size={16} />
          <input value={search} onChange={(e) => { setSearch(e.target.value); }} placeholder={`Search ${cfg.noun}...`}
            className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-500" />
        </div>
        <button onClick={() => setSlideOver('new')} className="btn-primary ml-auto"><Plus size={16} /> {cfg.addLabel}</button>
      </div>

      {/* Table */}
      <div className={`${CARD} p-0`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-100">
                <th className={TH}>{cfg.codeHeader}</th><th className={TH}>Description</th>
                <th className={TH}>Created</th><th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!initialLoading && pageRows.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-500"><cfg.emptyIcon size={26} /></div>
                    <div className="text-sm text-slate-500">{search ? 'No matches found.' : cfg.emptyText}</div>
                  </div>
                </td></tr>
              )}
              {pageRows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                  <td className={CELL}><span className="font-mono text-sm font-bold text-primary">{r.abbreviation}</span></td>
                  <td className={CELL}><span className="text-sm text-slate-600">{r.description ? truncate(r.description) : '—'}</span></td>
                  <td className={CELL}><span className="text-sm text-charcoal-heading">{fmtDate(r.createdAt)}</span></td>
                  <td className={CELL}>
                    <div className="flex items-center justify-end gap-1.5">
                      <button aria-label="Edit" onClick={() => setSlideOver(r)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-primary"><Pencil size={15} /></button>
                      {confirmId === r.id ? (
                        <span className="flex items-center gap-1">
                          <button onClick={() => del.mutate(r.id)} disabled={del.isPending} className="rounded-lg bg-error px-2.5 py-1.5 text-xs font-semibold text-white">Delete</button>
                          <button onClick={() => setConfirmId(null)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-500">Cancel</button>
                        </span>
                      ) : (
                        <button aria-label="Delete" onClick={() => setConfirmId(r.id)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-error-container hover:text-error"><Trash2 size={15} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Infinite scroll: auto-loads more on scroll. */}
        {filtered.length > 0 && (
          <ScrollSentinel ref={sentinelRef} loading={loading && !initialLoading} hasMore={hasMore} />
        )}
      </div>

      {slideOver && <CodeSlideOver cfg={cfg} editing={slideOver} onClose={() => setSlideOver(null)} />}
    </div>
  );
}

export default function LabCodesPage() {
  const [tab, setTab] = useState<'codes' | 'sheets' | 'findings'>('codes');

  return (
    <div className="w-full">
      <div className="mb-4">
        <h1 className="font-headline-md text-headline-md text-charcoal-heading">Code Vault</h1>
        <p className="font-body-sm text-body-sm text-secondary">Manage lab codes, code sheets, and findings.</p>
      </div>

      {/* Tabs — clean underline style */}
      <div className="mb-6 flex gap-8 border-b border-slate-200">
        {([['codes', 'Lab Codes'], ['sheets', 'Code Sheets'], ['findings', 'Code Findings']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`relative -mb-px cursor-pointer border-0 bg-transparent px-1 pb-3 text-sm font-semibold transition-colors ${tab === v ? 'text-primary' : 'text-slate-500 hover:text-slate-700'}`}>
            {l}
            {tab === v && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      {tab === 'codes' && <LabCodesTab />}
      {tab === 'sheets' && <CodeCatalogTab variant="sheets" />}
      {tab === 'findings' && <CodeCatalogTab variant="findings" />}
    </div>
  );
}
