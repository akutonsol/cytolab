'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Eye, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { portalApi } from '@/lib/portal-api';
import { fmtDate, isAuthorized, specLabel, StatusBadge } from '@/lib/portal-ui';
import { useInfiniteScroll, clientPage } from '@/hooks/useInfiniteScroll';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';

const TH = 'px-4 py-3 text-left font-label-sm text-label-sm text-secondary uppercase tracking-wider whitespace-nowrap';
const CELL = 'px-4 py-3.5 font-body-sm text-body-sm text-on-surface align-middle';
const PAGE_SIZE = 10;

export default function PortalRecordsPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'pending' | 'authorized'>('all');

  const { data, isFetching } = useQuery({
    queryKey: ['portal-records', 'all'],
    queryFn: () => portalApi.get('/portal/records', { params: { pageSize: 100 } }).then((r) => r.data),
  });
  // useMemo keeps `all` stable while loading so the infinite-scroll fetchFn
  // (derived from `filtered`) doesn't reload every render.
  const all: any[] = useMemo(() => data?.data ?? [], [data]);

  const filtered = useMemo(() => {
    let rows = all;
    if (status === 'authorized') rows = rows.filter((r) => isAuthorized(r.status));
    else if (status === 'pending') rows = rows.filter((r) => !isAuthorized(r.status));
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      rows = rows.filter((r) => `${r.labNumber ?? ''} ${r.identifier ?? ''} ${specLabel(r.specimens?.[0]?.type)} ${r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : ''}`.toLowerCase().includes(s));
    }
    return rows;
  }, [all, q, status]);

  // Infinite scroll over the client-side filtered records.
  const fetchFn = useCallback((p: number, ps: number) => Promise.resolve(clientPage(filtered, p, ps)), [filtered]);
  const { items: rows, loading, initialLoading, hasMore, sentinelRef } = useInfiniteScroll<any>({ fetchFn, pageSize: PAGE_SIZE });

  const download = async (r: any) => {
    try {
      const res = await portalApi.get(`/portal/records/${r.id}/report.pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `report-${r.labNumber ?? r.identifier}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { /* not authorized / not available */ }
  };

  const tab = (v: typeof status, label: string) => (
    <button onClick={() => { setStatus(v); }}
      className={`rounded-lg px-4 py-2 font-label-md text-label-md transition-colors ${status === v ? 'bg-white text-primary shadow-sm' : 'text-secondary hover:text-on-surface'}`}>
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-[28px] font-bold tracking-tight text-[#0F172A]">My Records</h1>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-[#EEF2F7] bg-[#F1F4F7] p-1">
          {tab('all', 'All')}{tab('pending', 'Pending')}{tab('authorized', 'Authorized')}
        </div>
        <div className="flex h-11 w-[260px] max-w-full items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3 text-[#94A3B8]">
          <Search size={16} />
          <input value={q} onChange={(e) => { setQ(e.target.value); }} placeholder="Search records"
            className="w-full border-none bg-transparent text-[14px] text-[#0F172A] outline-none placeholder:text-[#94A3B8]" />
        </div>
      </div>

      <div className="glass-card rounded-2xl p-4 sm:p-6">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/20">
                <th className={TH}>Lab#</th>
                <th className={TH}>Specimen</th>
                <th className={TH}>Status</th>
                <th className={TH}>Received</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isFetching && all.length === 0 && Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-outline-variant/10"><td colSpan={5} className="px-4 py-3"><div className="h-5 w-full animate-pulse rounded-md bg-surface-container" /></td></tr>
              ))}
              {!isFetching && !initialLoading && rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center font-body-sm text-body-sm text-secondary">No records found.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-outline-variant/10 transition-colors hover:bg-surface-container-low/60">
                  <td className={`${CELL} font-mono font-bold`}>{r.labNumber ?? r.identifier}</td>
                  <td className={CELL}>{specLabel(r.specimens?.[0]?.type)}</td>
                  <td className={CELL}><StatusBadge status={r.status} /></td>
                  <td className={`${CELL} whitespace-nowrap`}>{fmtDate(r.dateStatus ?? r.createdAt)}</td>
                  <td className={CELL}>
                    <div className="flex items-center justify-end gap-1.5">
                      <button title="View" onClick={() => router.push(`/portal/records/${r.id}`)} className="grid h-9 w-9 place-items-center rounded-xl border border-outline-variant/30 text-secondary transition-colors hover:bg-surface-container-low hover:text-primary"><Eye size={15} /></button>
                      {isAuthorized(r.status) && (
                        <button title="Download report" onClick={() => download(r)} className="grid h-9 w-9 place-items-center rounded-xl border border-outline-variant/30 text-secondary transition-colors hover:bg-surface-container-low hover:text-primary"><Download size={15} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Infinite scroll: auto-loads more records on scroll. */}
        {rows.length > 0 && (
          <ScrollSentinel ref={sentinelRef} loading={loading && !initialLoading} hasMore={hasMore} />
        )}
      </div>
    </div>
  );
}
