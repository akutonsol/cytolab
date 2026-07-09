'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Download, Eye, FileText, FolderOpen, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { portalApi } from '@/lib/portal-api';
import { fmtDate, isAuthorized, specLabel } from '@/lib/portal-ui';
import { Card } from '@/components/ui';


type Range = 'all' | 'month' | 'quarter';

export default function PortalReportsPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [range, setRange] = useState<Range>('all');

  const { data, isFetching } = useQuery({
    queryKey: ['portal-records', 'reports'],
    queryFn: () => portalApi.get('/portal/records', { params: { pageSize: 200 } }).then((r) => r.data),
  });

  const reports = useMemo(() => {
    const all: any[] = (data?.data ?? []).filter((r: any) => isAuthorized(r.status));
    const now = Date.now();
    const cutoff = range === 'month' ? now - 31 * 864e5 : range === 'quarter' ? now - 92 * 864e5 : 0;
    let rows = all;
    if (cutoff) rows = rows.filter((r) => new Date(r.dateStatus ?? r.createdAt).getTime() >= cutoff);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      rows = rows.filter((r) => `${r.labNumber ?? ''} ${r.identifier ?? ''} ${specLabel(r.specimens?.[0]?.type)} ${r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : ''}`.toLowerCase().includes(s));
    }
    return rows;
  }, [data, q, range]);

  const download = async (r: any) => {
    try {
      const res = await portalApi.get(`/portal/records/${r.id}/report.pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `report-${r.labNumber ?? r.identifier}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { /* not available */ }
  };

  const tab = (v: Range, label: string) => (
    <button onClick={() => setRange(v)}
      className={`rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors ${range === v ? 'bg-white text-[#4F46E5] shadow-sm' : 'text-[#64748b] hover:text-[#0a0b1a]'}`}>
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[28px] font-bold tracking-tight text-[#0a0b1a]">Reports</h1>
        <p className="mt-1 text-[14px] text-[#64748b]">Download your authorized laboratory reports.</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-[#E5E7EB] bg-[#F1F4F7] p-1">
          {tab('all', 'All')}{tab('month', 'This Month')}{tab('quarter', 'Last 3 Months')}
        </div>
        <div className="flex h-11 w-[260px] max-w-full items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[#94A3B8]">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reports"
            className="w-full border-none bg-transparent text-[14px] text-[#0a0b1a] outline-none placeholder:text-[#94A3B8]" />
        </div>
      </div>

      {/* Grid */}
      {isFetching && reports.length === 0 ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Card radius="md" elevation="none" border="gray" className="h-[220px] animate-pulse" key={i} />)}
        </div>
      ) : reports.length === 0 ? (
        <Card radius="md" elevation="none" border="gray" className="flex flex-col items-center gap-2 px-10 py-20 text-center">
          <FolderOpen size={40} className="text-[#CBD5E1]" />
          <div className="mt-2 text-[18px] font-semibold text-[#0a0b1a]">No reports yet</div>
          <div className="text-[14px] text-[#64748b]">Authorized reports will appear here, ready to download.</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {reports.map((r) => {
            const spec = specLabel(r.specimens?.[0]?.type);
            const pages = r.specimens?.length ? Math.max(2, r.specimens.length + 1) : 2;
            return (
              <Card radius="md" elevation="none" border="gray" className="flex flex-col p-6" key={r.id}>
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-[15px] font-bold text-[#0a0b1a]">{r.labNumber ?? r.identifier}</span>
                      <span className="rounded-full bg-[#F0FDF4] px-2.5 py-0.5 text-[11px] font-semibold text-[#16A34A]">{r.status}</span>
                    </div>
                    <div className="mt-1 text-[13px] text-[#64748b]">{spec} · {fmtDate(r.dateStatus ?? r.createdAt)}</div>
                  </div>
                  <div className="text-right text-[12px] text-[#94a3b8]">{pages} pages</div>
                </div>

                <div className="mb-4 rounded-lg bg-[#F8F8FA] px-4 py-3">
                  <div className="mb-0.5 text-[11px] text-[#94a3b8]">Result</div>
                  <div className="flex items-center gap-1.5 text-[14px] font-semibold text-[#0a0b1a]">
                    <Check size={15} className="text-[#16A34A]" /> Authorized · ready to download
                  </div>
                </div>

                <div className="mb-4 text-[13px] text-[#64748b]">
                  Patient: <span className="font-medium text-[#374151]">{r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : '—'}</span>
                </div>

                <div className="mt-auto flex gap-2.5">
                  <button onClick={() => download(r)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#4F46E5] py-2.5 text-[13px] font-semibold text-white transition-[filter] hover:brightness-110">
                    <Download size={15} /> Download PDF
                  </button>
                  <button onClick={() => router.push(`/portal/records/${r.id}`)} aria-label="View report"
                    className="grid h-10 w-10 place-items-center rounded-lg border border-[#E5E7EB] text-[#64748b] transition-colors hover:bg-[#F8FAFC] hover:text-[#4F46E5]">
                    <Eye size={16} />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
