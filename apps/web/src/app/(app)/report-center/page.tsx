'use client';

import { Suspense, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FileBarChart, Play, Search, Sliders } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/feature-context';
import { ReportThumb } from '@/components/ReportThumb';
import { REPORTS, fmtValue, type ReportCategory, type ReportDef } from '@/lib/report-center';

const CARD = 'rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]';

type Tab = 'Recommended' | ReportCategory | 'All';
const TABS: { key: Tab; label: string }[] = [
  { key: 'Recommended', label: 'Recommended' },
  { key: 'Specimen', label: 'Specimen Reports' },
  { key: 'Clinical', label: 'Clinical' },
  { key: 'Financial', label: 'Financial' },
  { key: 'Patient', label: 'Patient' },
  { key: 'Staff', label: 'Staff' },
  { key: 'Quality', label: 'Quality' },
  { key: 'All', label: 'All Reports' },
];

function ReportCenterInner() {
  const { isEnabled } = useFeatures();
  const enabled = isEnabled('REPORT_CENTER');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');

  // Active tab is persisted in the URL (?tab=clinical) so the back button and
  // direct navigation restore it. Stored lowercase; matched case-insensitively.
  const tabParam = (searchParams.get('tab') || 'recommended').toLowerCase();
  const tab: Tab = TABS.find((t) => t.key.toLowerCase() === tabParam)?.key ?? 'Recommended';
  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next.toLowerCase());
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const { data: summary } = useQuery({ queryKey: ['rc-summary'], queryFn: () => api.get('/report-center/summary').then((r) => r.data), enabled });

  const filtered = useMemo(() => {
    let list: ReportDef[] = REPORTS;
    if (tab === 'Recommended') list = list.filter((r) => r.recommended);
    else if (tab !== 'All') list = list.filter((r) => r.category === tab);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r) => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
    return list;
  }, [tab, search]);

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
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      {/* Header + revenue summary strip */}
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
            <div key={s.label} className={`${CARD} px-4 py-2.5`}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">{s.label}</div>
              <div className="text-[18px] font-bold" style={{ color: s.fg }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Search + tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a report…" className="h-10 w-72 rounded-lg border border-[#E2E8F0] bg-white pl-9 pr-3 text-[14px] outline-none focus:border-[#4F46E5]" />
        </div>
        <div className="flex flex-wrap gap-1 rounded-full bg-[#F1F5F9] p-1">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors" style={tab === t.key ? { background: '#fff', color: '#0F172A', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } : { color: '#64748B' }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Card grid */}
      {filtered.length === 0 ? (
        <div className={`${CARD} p-12 text-center text-[#94A3B8]`}>No reports match your search.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtered.map((r) => (
            <div key={r.id} className={`${CARD} flex items-start gap-4 p-4 transition-shadow hover:shadow-md`}>
              <ReportThumb category={r.category} />
              <div className="min-w-0 flex-1">
                <button onClick={() => router.push(`/report-center/${r.id}`)} className="text-[15px] font-semibold text-[#4F46E5] hover:underline">{r.name}</button>
                <p className="mt-1 text-[13px] leading-relaxed text-[#64748B]">{r.description}</p>
                <div className="mt-2.5 flex items-center gap-4">
                  <button onClick={() => router.push(`/report-center/${r.id}`)} className="flex items-center gap-1 text-[13px] font-semibold text-[#4F46E5] hover:underline"><Play size={13} /> Run</button>
                  <button onClick={() => router.push(`/report-center/${r.id}`)} className="flex items-center gap-1 text-[13px] font-semibold text-[#64748B] hover:text-[#4F46E5]"><Sliders size={13} /> Customize</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// useSearchParams requires a Suspense boundary.
export default function ReportCenterPage() {
  return (
    <Suspense fallback={null}>
      <ReportCenterInner />
    </Suspense>
  );
}
