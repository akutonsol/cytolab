'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Building2, Clock, FileText, Loader2, Receipt, Search, User, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Hit {
  id: string; type: 'patient' | 'record' | 'client' | 'bill';
  title: string; subtitle: string; status?: string; urgent?: boolean; link: string;
}
interface Results { patients: Hit[]; records: Hit[]; clients: Hit[]; bills: Hit[]; total: number }

const RECENT_KEY = 'cytolab-recent-searches';
// Per-type icon + tint. Bill amber uses --color-warning (#A16207) for the glyph:
// #B45309 passes as a solid but trips the detector when anti-aliased.
const ICON: Record<Hit['type'], { bg: string; color: string; Icon: any }> = {
  patient: { bg: '#EEF2FF', color: '#4F46E5', Icon: User },
  record: { bg: '#F0FDF4', color: '#16A34A', Icon: FileText },
  client: { bg: '#FFF1F2', color: '#E11D48', Icon: Building2 },
  bill: { bg: '#FFFBEB', color: 'var(--color-warning)', Icon: Receipt },
};
const SECTIONS: { key: keyof Results; label: string; type: Hit['type']; badgeBg: string; badgeColor: string }[] = [
  { key: 'patients', label: 'Patients', type: 'patient', badgeBg: '#EEF2FF', badgeColor: '#4F46E5' },
  { key: 'records', label: 'Records', type: 'record', badgeBg: '#F0FDF4', badgeColor: '#16A34A' },
  { key: 'clients', label: 'Clients', type: 'client', badgeBg: '#FFF1F2', badgeColor: '#E11D48' },
  { key: 'bills', label: 'Bills', type: 'bill', badgeBg: '#FFFBEB', badgeColor: 'var(--color-warning)' },
];
const QUICK = [
  { label: 'All Patients', href: '/patients', ...ICON.patient },
  { label: 'All Records', href: '/records', ...ICON.record },
  { label: 'All Clients', href: '/clients', ...ICON.client },
  { label: 'All Bills', href: '/billing', ...ICON.bill },
];
// Detector-safe record status tints.
const STATUS: Record<string, { bg: string; color: string }> = {
  Approved: { bg: '#F0FDF4', color: '#16A34A' }, Billed: { bg: '#F0FDF4', color: '#16A34A' }, Paid: { bg: '#F0FDF4', color: '#16A34A' },
  Processing: { bg: '#EEF2FF', color: '#4F46E5' }, Resulted: { bg: '#EEF2FF', color: '#4F46E5' }, Partial: { bg: '#EEF2FF', color: '#4F46E5' },
  OnHold: { bg: '#FEF3C7', color: '#92400E' }, Failed: { bg: '#FEF2F2', color: '#DC2626' },
};
const statusTint = (s?: string) => (s && STATUS[s]) || { bg: '#F5F4F0', color: '#475569' };

function readRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}

export default function SearchPage() {
  return <Suspense fallback={null}><SearchWorkspace /></Suspense>;
}

function SearchWorkspace() {
  const router = useRouter();
  const urlQ = useSearchParams().get('q') ?? '';
  const [text, setText] = useState(urlQ);
  const [q, setQ] = useState(urlQ);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastPushed = useRef(urlQ);

  useEffect(() => { setRecent(readRecent()); inputRef.current?.focus(); }, []);

  // Adopt EXTERNAL url changes (e.g. typing in the top-nav search bar) without
  // clobbering in-progress typing — our own pushes are recorded in lastPushed.
  useEffect(() => {
    if (urlQ !== lastPushed.current) setText(urlQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQ]);

  // Debounce the input into the active query + reflect it in the URL.
  useEffect(() => {
    const t = setTimeout(() => {
      lastPushed.current = text;
      setQ(text);
      router.replace(text ? `/search?q=${encodeURIComponent(text)}` : '/search');
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const { data, isFetching } = useQuery<Results>({
    queryKey: ['search', q],
    queryFn: () => api.get('/search', { params: { q } }).then((r) => r.data),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  });

  const active = q.trim().length >= 2;
  const total = data?.total ?? 0;

  const saveRecent = (term: string) => {
    const t = term.trim();
    if (!t) return;
    const next = [t, ...readRecent().filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    setRecent(next);
  };
  const removeRecent = (term: string) => {
    const next = readRecent().filter((r) => r !== term);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    setRecent(next);
  };
  const clearRecent = () => { localStorage.removeItem(RECENT_KEY); setRecent([]); };

  const open = (hit: Hit) => { saveRecent(q); router.push(hit.link); };
  const clear = () => { setText(''); inputRef.current?.focus(); };

  const sections = useMemo(() => SECTIONS.map((s) => ({ ...s, hits: (data?.[s.key] as Hit[]) ?? [] })).filter((s) => s.hits.length > 0), [data]);

  return (
    <div className="min-h-full" style={{ background: '#F8FAFC' }}>
      <div className="mx-auto max-w-[900px] px-6 py-10">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-display text-[28px] font-bold tracking-tight text-[#0F172A]">Search</h1>
          <p className="mt-1 font-body-sm text-body-sm text-secondary">Find patients, records, clients and bills.</p>
        </div>

        {/* Search bar */}
        <div className="flex h-14 items-center gap-3 rounded-full bg-white px-5 transition-[background-color,border-color,color,box-shadow,transform,opacity] focus-within:!border-[#4F46E5]"
          style={{ border: '2px solid transparent', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <Search size={20} className="shrink-0 text-[#475569]" />
          <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') clear(); }}
            placeholder="Search patients, records, clients..."
            className="w-full border-none bg-transparent text-[16px] text-[#0F172A] outline-none placeholder:text-[#475569]" />
          {isFetching ? <Loader2 size={18} className="shrink-0 animate-spin text-[#475569]" />
            : text ? <button onClick={clear} aria-label="Clear"><X size={18} className="shrink-0 text-[#475569] hover:text-[#0F172A]" /></button>
            : null}
        </div>

        {/* Body */}
        {!active ? (
          <div className="mt-8 flex flex-col gap-8">
            {recent.length > 0 && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-label-sm text-label-sm text-secondary uppercase tracking-wider">Recent searches</span>
                  <button onClick={clearRecent} className="font-label-sm text-label-sm text-[#4F46E5] hover:underline">Clear all</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recent.map((r) => (
                    <span key={r} className="inline-flex items-center gap-2 rounded-full border border-outline-variant/30 bg-white px-3 py-1.5">
                      <button onClick={() => setText(r)} className="flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface">
                        <Clock size={13} className="text-[#475569]" /> {r}
                      </button>
                      <button onClick={() => removeRecent(r)} aria-label="Remove"><X size={12} className="text-[#475569] hover:text-[#0F172A]" /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="mb-3 font-label-sm text-label-sm text-secondary uppercase tracking-wider">Quick links</div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {QUICK.map((qk) => (
                  <button key={qk.label} onClick={() => router.push(qk.href)}
                    className="glass-card flex items-center gap-3.5 rounded-2xl p-5 text-left transition-colors hover:bg-surface-container-low/50">
                    <span style={{ background: qk.bg, color: qk.color }} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"><qk.Icon size={20} /></span>
                    <span className="flex-1 font-body-md text-body-md font-semibold text-on-surface">{qk.label}</span>
                    <ArrowRight size={16} className="text-secondary" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : isFetching && !data ? (
          <div className="mt-8 flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass-card rounded-2xl p-5">
                <div className="h-4 w-40 animate-pulse rounded bg-surface-container" />
                <div className="mt-4 flex flex-col gap-3">
                  {Array.from({ length: 3 }).map((__, j) => <div key={j} className="h-10 animate-pulse rounded-lg bg-surface-container" />)}
                </div>
              </div>
            ))}
          </div>
        ) : total === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <Search size={48} className="text-[#E2E8F0]" />
            <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">No results for “{q}”</h3>
            <p className="font-body-sm text-body-sm text-secondary">Try searching by name, lab number, or account number.</p>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            <p className="font-body-sm text-body-sm text-secondary">{total} result{total === 1 ? '' : 's'} for “{q}”</p>
            {sections.map((s) => {
              const ic = ICON[s.type];
              return (
                <div key={s.key} className="glass-card overflow-hidden rounded-2xl">
                  <div className="flex items-center gap-2 border-b border-[#F1F0EA] px-5 py-3.5">
                    <ic.Icon size={16} style={{ color: ic.color }} />
                    <span className="font-headline-sm text-headline-sm text-charcoal-heading">{s.label}</span>
                    <span style={{ background: s.badgeBg, color: s.badgeColor }} className="rounded-full px-2 py-0.5 font-label-sm text-label-sm">{s.hits.length}</span>
                  </div>
                  <div>
                    {s.hits.map((hit) => {
                      const st = statusTint(hit.status);
                      return (
                        <button key={hit.id} onClick={() => open(hit)}
                          className="flex w-full items-center gap-3.5 border-b border-[#F5F4F0] px-5 py-3.5 text-left transition-colors last:border-0 hover:bg-surface-container-low">
                          <span style={{ background: ic.bg, color: ic.color }} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"><ic.Icon size={18} /></span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[14px] font-semibold text-[#0F172A]">{hit.title}</span>
                              {hit.status && <span style={{ background: st.bg, color: st.color }} className="rounded-full px-2 py-0.5 font-label-sm text-label-sm">{hit.status}</span>}
                              {hit.urgent && <span className="rounded-full bg-error-container px-2 py-0.5 font-label-sm text-label-sm text-error">Urgent</span>}
                            </div>
                            <div className="truncate font-body-sm text-body-sm text-secondary">{hit.subtitle}</div>
                          </div>
                          <ArrowRight size={16} className="shrink-0 text-secondary" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
