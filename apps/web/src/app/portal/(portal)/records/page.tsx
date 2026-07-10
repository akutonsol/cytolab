'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Eye, FileText, Search, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { portalApi } from '@/lib/portal-api';
import { fmtDate, hueFor, isAuthorized, specLabel, StatusBadge } from '@/lib/portal-ui';

// Zero-orange specimen-type dot colors (CSF uses safe amber, not #f59e0b).
const DOT: Record<string, string> = {
  ENDOCERV_ASP: '#4F46E5', CERV_SCRAP: '#E63946', PLEURAL_FLD: '#16A34A', CSF: '#92400E', URINE: '#8b5cf6',
};
const dotColor = (t?: string | null) => (t && DOT[t]) || hueFor(t || 'x');
import { useInfiniteScroll, clientPage } from '@/hooks/useInfiniteScroll';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { IconAction, Th, Td, TableEmpty } from '@/components/ui';

const PAGE_SIZE = 10;

export default function PortalRecordsPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'pending' | 'authorized'>('all');
  const [specType, setSpecType] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [selected, setSelected] = useState<any | null>(null);

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
    if (specType !== 'all') rows = rows.filter((r) => r.specimens?.[0]?.type === specType);
    if (dateRange !== 'all') {
      const days = dateRange === '30' ? 30 : dateRange === '90' ? 90 : 183;
      const cutoff = Date.now() - days * 864e5;
      rows = rows.filter((r) => new Date(r.dateStatus ?? r.createdAt).getTime() >= cutoff);
    }
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      rows = rows.filter((r) => `${r.labNumber ?? ''} ${r.identifier ?? ''} ${specLabel(r.specimens?.[0]?.type)} ${r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : ''}`.toLowerCase().includes(s));
    }
    return rows;
  }, [all, q, status, specType, dateRange]);

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

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-[#EEF2F7] bg-[#F1F4F7] p-1">
          {tab('all', 'All')}{tab('pending', 'Pending')}{tab('authorized', 'Authorized')}
        </div>

        <select value={specType} onChange={(e) => setSpecType(e.target.value)}
          className="ml-auto h-11 rounded-lg border border-[#E5E7EB] bg-white px-3.5 text-[13px] text-[#374151] outline-none">
          <option value="all">All Specimen Types</option>
          <option value="ENDOCERV_ASP">Endocervical asp.</option>
          <option value="CERV_SCRAP">Cervical scrape</option>
          <option value="PLEURAL_FLD">Pleural fluid</option>
          <option value="CSF">CSF</option>
          <option value="URINE">Urine cytology</option>
        </select>

        <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}
          className="h-11 rounded-lg border border-[#E5E7EB] bg-white px-3.5 text-[13px] text-[#374151] outline-none">
          <option value="all">All time</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="183">Last 6 months</option>
        </select>

        <div className="flex h-11 w-[220px] max-w-full items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3 text-[#94A3B8]">
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
                <Th density="compact" family="reference">Lab#</Th>
                <Th density="compact" family="reference">Specimen</Th>
                <Th density="compact" family="reference">Status</Th>
                <Th density="compact" family="reference">Received</Th>
                <Th density="compact" family="reference" className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {isFetching && all.length === 0 && Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-outline-variant/10"><Td colSpan={5} className="px-4 py-3"><div className="h-5 w-full animate-pulse rounded-md bg-surface-container" /></Td></tr>
              ))}
              {!isFetching && !initialLoading && rows.length === 0 && (
                <TableEmpty colSpan={5} tone="reference" tight>No records found.</TableEmpty>
              )}
              {rows.map((r) => {
                const auth = isAuthorized(r.status);
                return (
                  <tr key={r.id}
                    onClick={auth ? () => setSelected(r) : undefined}
                    className={`border-b border-outline-variant/10 transition-colors hover:bg-surface-container-low/60 ${auth ? 'cursor-pointer' : ''}`}>
                    <Td density="compact" family="reference" className="py-3.5 font-mono font-bold">{r.labNumber ?? r.identifier}</Td>
                    <Td density="compact" family="reference" className="py-3.5">
                      <span className="inline-flex items-center gap-2">
                        <span style={{ background: dotColor(r.specimens?.[0]?.type) }} className="h-2 w-2 shrink-0 rounded-full" />
                        {specLabel(r.specimens?.[0]?.type)}
                      </span>
                    </Td>
                    <Td density="compact" family="reference" className="py-3.5"><StatusBadge status={r.status} /></Td>
                    <Td density="compact" family="reference" className="py-3.5 whitespace-nowrap">{fmtDate(r.dateStatus ?? r.createdAt)}</Td>
                    <Td density="compact" family="reference" className="py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <IconAction icon={<Eye size={15} />} tone="strong" size="lg" shape="soft" className="hover:bg-surface-container-low text-secondary border border-outline-variant/30 hover:text-primary" title="View" onClick={(e) => { e.stopPropagation(); router.push(`/portal/records/${r.id}`); }} />
                        {auth && (
                          <IconAction icon={<Download size={15} />} tone="strong" size="lg" shape="soft" className="hover:bg-surface-container-low text-secondary border border-outline-variant/30 hover:text-primary" title="Download report" onClick={(e) => { e.stopPropagation(); download(r); }} />
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Infinite scroll: auto-loads more records on scroll. */}
        {rows.length > 0 && (
          <ScrollSentinel ref={sentinelRef} loading={loading && !initialLoading} hasMore={hasMore} />
        )}
      </div>

      {/* Result preview slide-in (authorized records) */}
      {selected && <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setSelected(null)} />}
      <div
        style={{ transform: selected ? 'translateX(0)' : 'translateX(100%)' }}
        className="fixed inset-y-0 right-0 z-50 w-[420px] max-w-full overflow-y-auto border-l border-[#E5E7EB] bg-white p-8 shadow-[-8px_0_32px_rgba(0,0,0,0.08)] transition-transform duration-300 ease-out">
        {selected && (
          <>
            <button onClick={() => setSelected(null)} aria-label="Close"
              className="absolute right-5 top-5 grid h-8 w-8 place-items-center rounded-lg text-[#64748b] transition-colors hover:bg-[#F3F4F6]"><X size={18} /></button>

            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#4F46E5]">Result Preview</div>
            <div className="mt-2 text-[20px] font-bold text-[#0a0b1a]">{selected.labNumber ?? selected.identifier}</div>
            <div className="mt-1 text-[13px] text-[#64748b]">{specLabel(selected.specimens?.[0]?.type)} · {fmtDate(selected.dateStatus ?? selected.createdAt)}</div>

            <div className="mt-6 rounded-xl bg-[#F8F8FA] p-4">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">Patient Information</div>
              {[
                { label: 'Name', value: selected.patient ? `${selected.patient.firstName} ${selected.patient.lastName}` : '—' },
                { label: 'DOB', value: selected.patient?.dob ? fmtDate(selected.patient.dob) : '—' },
                { label: 'Clinician', value: selected.client?.name ?? selected.client?.officeName ?? '—' },
              ].map((row) => (
                <div key={row.label} className="flex justify-between py-1.5 text-[13px]">
                  <span className="text-[#64748b]">{row.label}</span>
                  <span className="font-medium text-[#0a0b1a]">{row.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] p-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#16A34A]">Report status</div>
              <div className="text-[16px] font-bold text-[#0a0b1a]">Authorized &amp; ready</div>
              <div className="mt-1 text-[12px] text-[#64748b]">Download the PDF for the full diagnostic result.</div>
            </div>

            <button onClick={() => download(selected)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#4F46E5] py-3.5 text-[14px] font-semibold text-white transition-[filter] hover:brightness-110">
              <FileText size={16} /> Download Full Report (PDF)
            </button>
          </>
        )}
      </div>
    </div>
  );
}
