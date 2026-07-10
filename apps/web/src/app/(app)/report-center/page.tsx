'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity, ArrowUpRight, DollarSign, FileBarChart, FlaskConical, LayoutGrid, List as ListIcon,
  Lock, MoreVertical, Play, Search, Share2, ShieldCheck, Sliders, Star, TrendingDown, TrendingUp,
  Users, UserCog, type LucideIcon,
} from 'lucide-react';
import { Area, AreaChart } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/feature-context';
import { CATEGORIES, REPORTS, fmtValue, type ReportCategory, type ReportDef } from '@/lib/report-center';
import { Card, IconAction } from '@/components/ui';


// ── Category coding (color + icon + full label) ──────────────────────────────
// Zero-orange: Quality uses --color-warning (#A16207); #B45309 is NOT sanctioned —
// it anti-aliases into the trip box. Every tint is a
// low-alpha wash of the category colour (never a standalone orange).
const CAT: Record<ReportCategory, { color: string; Icon: LucideIcon; label: string }> = {
  Specimen: { color: '#3f97ef', Icon: FlaskConical, label: 'Specimen' },
  Clinical: { color: '#4F46E5', Icon: Activity, label: 'Clinical' },
  Financial: { color: '#059669', Icon: DollarSign, label: 'Financial' },
  Patient: { color: '#7C3AED', Icon: Users, label: 'Patient' },
  Staff: { color: '#475569', Icon: UserCog, label: 'Staff' },
  Quality: { color: 'var(--color-warning)', Icon: ShieldCheck, label: 'Quality & Compliance' },
};
const tint = (color: string) => `${color}1A`; // ~10% wash over white

// ── Deterministic decorative data (stable per report id) ─────────────────────
const hashOf = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
function seriesFor(id: string): { v: number }[] {
  let h = hashOf(id);
  let v = 30 + (h % 40);
  const out: { v: number }[] = [];
  for (let i = 0; i < 8; i++) { h = (h * 1103515245 + 12345) & 0x7fffffff; v = Math.max(6, v + ((h % 22) - 9)); out.push({ v }); }
  return out;
}
const trendPct = (id: string) => { const s = seriesFor(id); const first = s[0].v || 1; return Math.round(((s[s.length - 1].v - first) / first) * 100); };
const updatedFor = (id: string) => Date.now() - (hashOf(id + 'u') % (6 * 86_400_000)); // within the last ~6 days
const relTime = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
};
const numFmt = (n: number) => n.toLocaleString();

// ── localStorage-backed personalization ──────────────────────────────────────
const FAV_KEY = 'cytolab-report-favorites';
const RECENT_KEY = 'cytolab-report-recent';
const RUNS_KEY = 'cytolab-report-runs';
const readJson = <T,>(k: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const writeJson = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore quota */ } };

type TopTab = 'all' | 'favorites' | 'recent' | 'dashboards' | 'saved';
const TOP_TABS: { key: TopTab; label: string }[] = [
  { key: 'favorites', label: 'Favorites' },
  { key: 'recent', label: 'Recent' },
  { key: 'dashboards', label: 'Dashboards' },
  { key: 'saved', label: 'Saved' },
  { key: 'all', label: 'All Reports' },
];
type CatFilter = '' | 'Recommended' | ReportCategory;
const CAT_FILTERS: CatFilter[] = ['Recommended', ...CATEGORIES];
type Sort = 'used' | 'updated' | 'alpha';
const SORTS: { key: Sort; label: string }[] = [
  { key: 'used', label: 'Most Used' },
  { key: 'updated', label: 'Recently Updated' },
  { key: 'alpha', label: 'Alphabetical' },
];

export default function ReportCenterPage() {
  const { isEnabled } = useFeatures();
  const enabled = isEnabled('REPORT_CENTER');
  const router = useRouter();

  const [topTab, setTopTab] = useState<TopTab>('all');
  const [cat, setCat] = useState<CatFilter>('');
  const [sort, setSort] = useState<Sort>('used');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [expandedFeatured, setExpandedFeatured] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);

  // Personalization (hydrated on the client to avoid SSR mismatch).
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [runs, setRuns] = useState<Record<string, number>>({});
  useEffect(() => {
    setFavorites(readJson<string[]>(FAV_KEY, []));
    setRecent(readJson<string[]>(RECENT_KEY, []));
    setRuns(readJson<Record<string, number>>(RUNS_KEY, {}));
  }, []);

  const favSet = useMemo(() => new Set(favorites), [favorites]);
  const runCount = useCallback((r: ReportDef) => (r.runCount ?? 0) + (runs[r.id] ?? 0), [runs]);

  // Module gating: a report only shows when its required feature is enabled for
  // the lab (undefined requiredFeature = core, always visible). Everything below
  // filters from this set, so featured/sections/search/counts all stay consistent.
  const visibleReports = useMemo(() => REPORTS.filter((r) => !r.requiredFeature || isEnabled(r.requiredFeature)), [isEnabled]);
  // True when a category still has visible reports but others are hidden by a
  // disabled module — drives the small lock indicator on the section header.
  const hiddenInCat = useCallback(
    (c: ReportCategory) => REPORTS.some((r) => r.category === c && r.requiredFeature && !isEnabled(r.requiredFeature)),
    [isEnabled],
  );

  const { data: summary } = useQuery({ queryKey: ['rc-summary'], queryFn: () => api.get('/report-center/summary').then((r) => r.data), enabled });

  const toggleFav = (id: string) => setFavorites((prev) => {
    const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev];
    writeJson(FAV_KEY, next);
    return next;
  });
  // Record a run (increment count + push to the front of Recent, capped at 10).
  const recordRun = (id: string) => {
    setRuns((prev) => { const next = { ...prev, [id]: (prev[id] ?? 0) + 1 }; writeJson(RUNS_KEY, next); return next; });
    setRecent((prev) => { const next = [id, ...prev.filter((x) => x !== id)].slice(0, 10); writeJson(RECENT_KEY, next); return next; });
  };
  const runReport = (id: string) => { recordRun(id); router.push(`/report-center/${id}`); };
  const customize = (id: string) => { setMenuId(null); router.push(`/report-center/${id}`); };
  const share = (id: string) => {
    setMenuId(null);
    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/report-center/${id}`;
    navigator.clipboard?.writeText(url).catch(() => {});
  };

  // Base set for the active top tab — always drawn from the module-visible set.
  const baseSet = useMemo<ReportDef[]>(() => {
    switch (topTab) {
      case 'favorites': return visibleReports.filter((r) => favSet.has(r.id));
      case 'recent': return recent.map((id) => visibleReports.find((r) => r.id === id)).filter((r): r is ReportDef => !!r);
      case 'dashboards': return visibleReports.filter((r) => r.recommended);
      case 'saved': return visibleReports.filter((r) => (runs[r.id] ?? 0) > 0);
      default: return visibleReports;
    }
  }, [topTab, favSet, recent, runs, visibleReports]);

  const sortFn = useCallback((a: ReportDef, b: ReportDef) => {
    if (sort === 'alpha') return a.name.localeCompare(b.name);
    if (sort === 'updated') return updatedFor(b.id) - updatedFor(a.id);
    return runCount(b) - runCount(a);
  }, [sort, runCount]);

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return baseSet.filter((r) => !q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
  }, [baseSet, search]);

  // Recent keeps its recency order; everything else is sorted.
  const flatList = useMemo(() => {
    const pool = cat ? searched.filter((r) => (cat === 'Recommended' ? r.recommended : r.category === cat)) : searched;
    return topTab === 'recent' && !cat && sort === 'used' ? pool : [...pool].sort(sortFn);
  }, [searched, cat, topTab, sort, sortFn]);

  const featured = useMemo(() => [...searched].sort((a, b) => runCount(b) - runCount(a)).slice(0, 4), [searched, runCount]);
  const showLanding = topTab === 'all' && !cat && !expandedFeatured;

  if (!enabled) {
    return (
      <div className="min-h-full pt-4" style={{ background: '#F8FAFC' }}>
        <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[#EEF2F7] bg-white p-8 text-center shadow-sm">
          <FileBarChart size={28} className="mx-auto text-[#9CA3AF]" />
          <div className="mt-3 text-[18px] font-bold text-[#0F172A]">Feature not enabled</div>
          <div className="mt-1 text-[14px] text-[#6B7280]">The Report Center is disabled for this lab.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }} onClick={() => setMenuId(null)}>
      {/* Header + KPI bar */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#0F172A]">Report Center</h1>
          <p className="mt-1.5 text-[15px] text-[#6B7280]">Run, customize, and export analytics across every area of the lab.</p>
        </div>
        <div className="flex items-stretch gap-3">
          {[
            { label: 'Gross Revenue', value: fmtValue(summary?.revenue?.total ?? 0, 'money'), fg: '#16A34A' },
            { label: 'GYN', value: fmtValue(summary?.specimens?.gyn ?? 0, 'number'), fg: '#4F46E5' },
            { label: 'Non-GYN', value: fmtValue(summary?.specimens?.nonGyn ?? 0, 'number'), fg: '#7C3AED' },
          ].map((s) => (
            <Card radius="md" elevation="soft" border="hairline" className="px-4 py-2.5" key={s.label}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#475569]">{s.label}</div>
              <div className="text-[18px] font-bold" style={{ color: s.fg }}>{s.value}</div>
            </Card>
          ))}
        </div>
      </div>

      {/* Top navigation tabs (pill, active = indigo filled) */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {TOP_TABS.map((t) => {
          const active = topTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => { setTopTab(t.key); setCat(''); setExpandedFeatured(false); }}
              className="rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors"
              style={active ? { background: '#4F46E5', color: '#fff' } : { background: '#fff', color: '#475569', border: '1px solid #E2E8F0' }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Category filter pills + search + sort + view toggle */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          <FilterPill label="All" active={!cat} onClick={() => { setCat(''); setExpandedFeatured(false); }} />
          {CAT_FILTERS.map((c) => (
            <FilterPill key={c} label={c === 'Recommended' ? 'Recommended' : CAT[c as ReportCategory].label} active={cat === c} onClick={() => { setCat(cat === c ? '' : c); setExpandedFeatured(false); }} />
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#475569]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a report…" className="h-9 w-60 rounded-lg border border-[#E2E8F0] bg-white pl-9 pr-3 text-[14px] outline-none focus:border-[#4F46E5]" />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-[13px] font-medium text-[#475569] outline-none focus:border-[#4F46E5]">
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <div className="flex items-center gap-0.5 rounded-lg border border-[#E2E8F0] bg-white p-0.5">
            <button aria-label="Grid view" onClick={() => setView('grid')} className="grid h-8 w-8 place-items-center rounded-md" style={view === 'grid' ? { background: '#EEF2FF', color: '#4F46E5' } : { color: '#475569' }}><LayoutGrid size={16} /></button>
            <button aria-label="List view" onClick={() => setView('list')} className="grid h-8 w-8 place-items-center rounded-md" style={view === 'list' ? { background: '#EEF2FF', color: '#4F46E5' } : { color: '#475569' }}><ListIcon size={16} /></button>
          </div>
        </div>
      </div>

      {searched.length === 0 ? (
        <Card radius="md" elevation="soft" border="hairline" className="p-12 text-center text-[#475569]">
          {topTab === 'favorites' ? 'No favorite reports yet — tap the star on any report to add it here.'
            : topTab === 'recent' ? 'No reports run yet — reports you run will appear here.'
            : topTab === 'saved' ? 'Nothing saved yet — reports you run are kept here.'
            : 'No reports match your search.'}
        </Card>
      ) : showLanding ? (
        <>
          {/* Featured Reports */}
          <SectionHeader title="Featured Reports" onViewAll={() => { setExpandedFeatured(true); setSort('used'); }} viewAllLabel="View all featured" />
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {featured.map((r) => (
              <FeaturedCard key={r.id} r={r} runs={runCount(r)} onRun={() => runReport(r.id)} />
            ))}
          </div>

          {/* Category sections */}
          {CATEGORIES.map((c) => {
            const items = searched.filter((r) => r.category === c);
            if (!items.length) return null;
            return (
              <div key={c} className="mb-8">
                <SectionHeader title={CAT[c].label} color={CAT[c].color} onViewAll={() => setCat(c)} locked={hiddenInCat(c)} />
                {view === 'list'
                  ? <ReportTable items={[...items].sort(sortFn)} favSet={favSet} runCount={runCount} onRun={runReport} onCustomize={customize} onToggleFav={toggleFav} />
                  : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      {[...items].sort(sortFn).map((r) => (
                        <ReportCard key={r.id} r={r} runs={runCount(r)} fav={favSet.has(r.id)} menuOpen={menuId === r.id}
                          onRun={() => runReport(r.id)} onCustomize={() => customize(r.id)} onShare={() => share(r.id)}
                          onToggleFav={() => toggleFav(r.id)} onMenu={(e) => { e.stopPropagation(); setMenuId(menuId === r.id ? null : r.id); }} />
                      ))}
                    </div>
                  )}
              </div>
            );
          })}
        </>
      ) : view === 'list' ? (
        <ReportTable items={flatList} favSet={favSet} runCount={runCount} onRun={runReport} onCustomize={customize} onToggleFav={toggleFav} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {flatList.map((r) => (
            <ReportCard key={r.id} r={r} runs={runCount(r)} fav={favSet.has(r.id)} menuOpen={menuId === r.id}
              onRun={() => runReport(r.id)} onCustomize={() => customize(r.id)} onShare={() => share(r.id)}
              onToggleFav={() => toggleFav(r.id)} onMenu={(e) => { e.stopPropagation(); setMenuId(menuId === r.id ? null : r.id); }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Small building blocks ────────────────────────────────────────────────────
function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors"
      style={active ? { background: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE' } : { background: '#F1F5F9', color: '#475569', border: '1px solid transparent' }}>
      {label}
    </button>
  );
}

function SectionHeader({ title, color, onViewAll, viewAllLabel = 'View all', locked }: { title: string; color?: string; onViewAll: () => void; viewAllLabel?: string; locked?: boolean }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {color && <span className="h-4 w-1.5 rounded-full" style={{ background: color }} />}
        <h2 className="text-[16px] font-bold text-[#0F172A]">{title}</h2>
        {locked && (
          <span className="text-[#94A3B8]" title="Some reports in this category require additional modules. Enable them in Settings → Modules.">
            <Lock size={13} />
          </span>
        )}
      </div>
      <button onClick={onViewAll} className="text-[13px] font-semibold text-[#4F46E5] hover:underline">{viewAllLabel} →</button>
    </div>
  );
}

function CatIcon({ category, size = 40 }: { category: ReportCategory; size?: number }) {
  const { color, Icon } = CAT[category];
  return (
    <span className="grid shrink-0 place-items-center rounded-xl" style={{ width: size, height: size, background: tint(color), color }}>
      <Icon size={size * 0.5} />
    </span>
  );
}

function TrendBadge({ id }: { id: string }) {
  const t = trendPct(id);
  const up = t >= 0;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={up ? { background: '#DCFCE7', color: '#16A34A' } : { background: '#FEE2E2', color: '#DC2626' }}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{up ? '↑' : '↓'} {Math.abs(t)}%
    </span>
  );
}

function Spark({ id, color }: { id: string; color: string }) {
  const data = useMemo(() => seriesFor(id), [id]);
  const gid = `spark-${id}`;
  return (
    <AreaChart width={120} height={50} data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${gid})`} dot={false} isAnimationActive={false} />
    </AreaChart>
  );
}

function FeaturedCard({ r, runs, onRun }: { r: ReportDef; runs: number; onRun: () => void }) {
  const { color } = CAT[r.category];
  return (
    <Card radius="md" elevation="soft" border="hairline" className="flex flex-col p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <CatIcon category={r.category} />
        <TrendBadge id={r.id} />
      </div>
      <div className="mt-3 text-[15px] font-bold text-[#0F172A]">{r.name}</div>
      <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[#475569]">{r.description}</p>
      <div className="mt-2"><Spark id={r.id} color={color} /></div>
      <div className="mt-2 flex items-end justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>Most Used · {numFmt(runs)}</div>
          <div className="text-[11px] text-[#475569]">Updated {relTime(updatedFor(r.id))}</div>
        </div>
        <IconAction icon={<ArrowUpRight size={16} />} tone="inverse" size="lg" shape="circle" hover={false} className="transition-transform hover:scale-105" aria-label={`Run ${r.name}`} onClick={onRun} style={{ background: color }} />
      </div>
    </Card>
  );
}

function ReportCard({ r, runs, fav, menuOpen, onRun, onCustomize, onShare, onToggleFav, onMenu }: {
  r: ReportDef; runs: number; fav: boolean; menuOpen: boolean;
  onRun: () => void; onCustomize: () => void; onShare: () => void; onToggleFav: () => void; onMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <Card radius="md" elevation="soft" border="hairline" className="relative flex flex-col p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <CatIcon category={r.category} size={36} />
        <div className="min-w-0 flex-1">
          <button onClick={onRun} className="text-left text-[14px] font-semibold text-[#4F46E5] hover:underline">{r.name}</button>
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-[#475569]">{r.description}</p>
        </div>
        <button aria-label={fav ? 'Remove from favorites' : 'Add to favorites'} onClick={onToggleFav} className="shrink-0 text-[#CBD5E1] hover:text-[#FACC15]">
          <Star size={16} fill={fav ? '#FACC15' : 'none'} stroke={fav ? '#FACC15' : 'currentColor'} />
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[12px] font-medium text-[#475569]">{numFmt(runs)} runs</span>
        <div className="relative">
          <IconAction icon={<MoreVertical size={15} />} tone="strong" size="sm" className="hover:text-[#475569]" aria-label="More actions" onClick={onMenu} />
          {menuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-[#EEF2F7] bg-white py-1 shadow-lg" onClick={(e) => e.stopPropagation()}>
              <MenuItem icon={<Play size={13} />} label="Run" onClick={onRun} />
              <MenuItem icon={<Sliders size={13} />} label="Customize" onClick={onCustomize} />
              <MenuItem icon={<Star size={13} />} label={fav ? 'Remove Favorite' : 'Add to Favorites'} onClick={onToggleFav} />
              <MenuItem icon={<Share2 size={13} />} label="Share" onClick={onShare} />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[13px] text-[#334155] hover:bg-[#F5F7FF]">
      <span className="text-[#475569]">{icon}</span>{label}
    </button>
  );
}

function ReportTable({ items, favSet, runCount, onRun, onCustomize, onToggleFav }: {
  items: ReportDef[]; favSet: Set<string>; runCount: (r: ReportDef) => number;
  onRun: (id: string) => void; onCustomize: (id: string) => void; onToggleFav: (id: string) => void;
}) {
  const TH = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#475569] whitespace-nowrap';
  return (
    <Card radius="md" elevation="soft" border="hairline" className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[#EEF2F7]">
              <th className={TH} />
              <th className={TH}>Name</th>
              <th className={TH}>Description</th>
              <th className={TH}>Category</th>
              <th className={`${TH} text-right`}>Runs</th>
              <th className={TH}>Last Updated</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-b border-[#F1F5F9] transition-colors hover:bg-[#F8FAFC]">
                <td className="px-4 py-3"><CatIcon category={r.category} size={30} /></td>
                <td className="px-4 py-3">
                  <button onClick={() => onRun(r.id)} className="flex items-center gap-1.5 text-left font-semibold text-[#4F46E5] hover:underline">
                    <Star size={13} fill={favSet.has(r.id) ? '#FACC15' : 'none'} stroke={favSet.has(r.id) ? '#FACC15' : '#CBD5E1'} onClick={(e) => { e.stopPropagation(); onToggleFav(r.id); }} />
                    {r.name}
                  </button>
                </td>
                <td className="max-w-[320px] truncate px-4 py-3 text-[#475569]" title={r.description}>{r.description}</td>
                <td className="px-4 py-3"><span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: tint(CAT[r.category].color), color: CAT[r.category].color }}>{CAT[r.category].label}</span></td>
                <td className="px-4 py-3 text-right font-semibold text-[#0F172A]">{numFmt(runCount(r))}</td>
                <td className="px-4 py-3 text-[#475569]">{relTime(updatedFor(r.id))}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => onRun(r.id)} className="inline-flex items-center gap-1 rounded-lg bg-[#4F46E5] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#4338CA]"><Play size={12} /> Run</button>
                    <button onClick={() => onCustomize(r.id)} className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-[12px] font-semibold text-[#475569] hover:bg-[#F8FAFC]"><Sliders size={12} /> Customize</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
