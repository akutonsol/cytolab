'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Award, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, Clock, Download,
  ExternalLink, Eye, FileText, Filter, Search, X,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';

interface Summary { total: number; thisMonth: number; authorized: number; pending: number }
interface Report {
  id: string;
  releasedAt: string;
  writtenBy?: { firstName?: string; lastName?: string } | null;
  resultSheet?: {
    recordId: string;
    record?: {
      identifier: string;
      formType?: string | null;
      patient?: { firstName?: string; lastName?: string } | null;
      client?: { firstName?: string; lastName?: string; officeName?: string | null } | null;
    } | null;
  } | null;
}

const CARD = 'rounded-[20px] border border-[#EEF2F7] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)]';
const PAGE_SIZE = 20;

const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(/,([^,]*)$/, ' at$1') : '—';
const patientName = (r: Report) => { const p = r.resultSheet?.record?.patient; return p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || '—' : '—'; };
const clientName = (r: Report) => { const c = r.resultSheet?.record?.client; return c ? (c.officeName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || '—') : '—'; };
const authorName = (r: Report) => (r.writtenBy ? `${r.writtenBy.firstName ?? ''} ${r.writtenBy.lastName ?? ''}`.trim() || '—' : '—');

export default function ReportsPage() {
  // useSearchParams requires a Suspense boundary for the production build.
  return <Suspense fallback={null}><ReportsWorkspace /></Suspense>;
}

function ReportsWorkspace() {
  const router = useRouter();
  const qc = useQueryClient();
  const recordIdParam = useSearchParams().get('recordId');

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [formFilter, setFormFilter] = useState<'all' | 'Gynecology' | 'NonGynecology'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'week' | 'month'>('all');
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const notify = (type: 'ok' | 'err', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3200); };

  const { data: summary } = useQuery<Summary>({ queryKey: ['reports-summary'], queryFn: () => api.get('/reports/summary').then((r) => r.data) });
  const { data: list, isLoading } = useQuery<Paginated<Report>>({
    queryKey: ['reports', page],
    queryFn: () => api.get('/reports', { params: { page, pageSize: PAGE_SIZE } }).then((r) => r.data),
  });

  const rows = list?.data ?? [];
  const total = list?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Client-side filters over the current page.
  const filtered = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86_400_000;
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    return rows.filter((r) => {
      if (formFilter !== 'all' && r.resultSheet?.record?.formType !== formFilter) return false;
      if (dateFilter === 'week' && new Date(r.releasedAt).getTime() < weekAgo) return false;
      if (dateFilter === 'month' && new Date(r.releasedAt).getTime() < monthStart.getTime()) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${r.resultSheet?.record?.identifier ?? ''} ${patientName(r)} ${clientName(r)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, formFilter, dateFilter, search]);

  // PDF blob fetch (auth token attached by the api interceptor).
  const openPdf = async (recordId: string) => {
    const win = window.open('', '_blank');
    try {
      const res = await api.get(`/report/pdf/${recordId}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      if (win) win.location.href = url; else window.open(url, '_blank');
    } catch { win?.close(); notify('err', 'Could not open PDF'); }
  };
  const downloadPdf = async (recordId: string, identifier: string) => {
    try {
      const res = await api.get(`/report/pdf/${recordId}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `report-${identifier}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { notify('err', 'Could not download PDF'); }
  };

  // ?recordId= — open the release modal if no report yet, else highlight the row.
  const { data: recordForRelease } = useQuery<any>({
    queryKey: ['record-for-release', recordIdParam],
    enabled: !!recordIdParam,
    queryFn: () => api.get(`/specimens/${recordIdParam}`).then((r) => r.data),
  });
  useEffect(() => {
    if (!recordIdParam || !recordForRelease) return;
    const existing = rows.find((r) => r.resultSheet?.recordId === recordIdParam);
    if (existing) {
      setHighlightId(existing.id);
      rowRefs.current[existing.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const t = setTimeout(() => setHighlightId(null), 2200);
      return () => clearTimeout(t);
    }
    if (recordForRelease.resultSheets?.length) setReleaseOpen(true);
  }, [recordIdParam, recordForRelease, rows]);

  const clearParam = () => router.replace('/reports');

  return (
    <div className="min-h-full px-6 pb-10 pt-4 lg:px-9" style={{ background: '#F8FAFC' }}>
      <style>{`@keyframes rowflash{0%{background:#EEF3FF}100%{background:transparent}}`}</style>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[#0F172A]">Reports</h1>
          <p className="mt-1.5 text-[14px] text-[#6B7280]">Released laboratory reports</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-[280px] items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-4 text-[#9CA3AF]">
            <Search size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reports…"
              className="w-full border-none bg-transparent text-[14px] text-[#0F172A] outline-none placeholder:text-[#9CA3AF]" />
          </div>
          <button className="grid h-10 w-10 place-items-center rounded-lg border border-[#EEF2F7] bg-white text-[#6B7280] hover:bg-[#F5F7FF]"><Filter size={16} /></button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={FileText} label="Total Reports" value={summary?.total ?? 0} />
        <Kpi icon={CheckCircle} label="This Month" value={summary?.thisMonth ?? 0} />
        <Kpi icon={Award} label="Authorized" value={summary?.authorized ?? 0} />
        <Kpi icon={Clock} label="Pending Release" value={summary?.pending ?? 0} />
      </div>

      {/* Table card */}
      <div className={`${CARD} p-6`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold text-[#0F172A]">Released Reports · {total}</h2>
          <div className="flex items-center gap-2">
            <Pill value={formFilter} onChange={(v) => setFormFilter(v as any)} options={[['all', 'All Forms'], ['Gynecology', 'Gynecology'], ['NonGynecology', 'Non-Gynecology']]} />
            <Pill value={dateFilter} onChange={(v) => setDateFilter(v as any)} options={[['all', 'All Time'], ['week', 'This Week'], ['month', 'This Month']]} />
          </div>
        </div>

        {isLoading ? (
          <div className="grid h-40 place-items-center text-[13px] text-[#9CA3AF]">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <FileText size={30} className="text-[#D1D5DB]" />
            <div className="text-[15px] font-semibold text-[#0F172A]">No reports released yet</div>
            <div className="max-w-sm text-[13px] text-[#9CA3AF]">Reports appear here once a result sheet is authorized and released.</div>
            <button onClick={() => router.push('/authorizer')} className="mt-2 text-[13px] font-semibold text-[#4F46E5] hover:underline">Go to Authorizer →</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[#F3F4F6] text-[12px] font-medium uppercase tracking-wide text-[#9CA3AF]">
                  <th className="pb-3 font-medium">Report#</th><th className="pb-3 font-medium">Patient</th>
                  <th className="pb-3 font-medium">Client</th><th className="pb-3 font-medium">Form</th>
                  <th className="pb-3 font-medium">Released</th><th className="pb-3 font-medium">Authorized By</th>
                  <th className="pb-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const rec = r.resultSheet?.record;
                  const recordId = r.resultSheet?.recordId ?? '';
                  const isGyn = rec?.formType === 'Gynecology';
                  return (
                    <tr key={r.id} ref={(el) => { rowRefs.current[r.id] = el; }}
                      className="cursor-pointer border-b border-[#F3F4F6] transition-colors hover:bg-[#F9FAFB]"
                      style={highlightId === r.id ? { animation: 'rowflash 2.2s ease-out' } : undefined}>
                      <td className="py-3.5"><span className="font-mono text-[13px] font-bold text-[#0F172A]">{rec?.identifier ?? '—'}</span></td>
                      <td className="py-3.5 text-[14px] font-semibold text-[#0F172A]">{patientName(r)}</td>
                      <td className="py-3.5 text-[14px] text-[#6B7280]">{clientName(r)}</td>
                      <td className="py-3.5">
                        {rec?.formType ? (
                          <span className="rounded-md px-2.5 py-1 text-[12px] font-bold" style={isGyn ? { background: '#EEF3FF', color: '#4F46E5' } : { background: '#F0FDF4', color: '#16A34A' }}>
                            {isGyn ? 'GYN' : 'NON-GYN'}
                          </span>
                        ) : <span className="text-[#D1D5DB]">—</span>}
                      </td>
                      <td className="py-3.5 text-[14px] text-[#6B7280]">{fmtDateTime(r.releasedAt)}</td>
                      <td className="py-3.5 text-[14px] text-[#6B7280]">{authorName(r)}</td>
                      <td className="py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <IconBtn title="Preview" onClick={() => openPdf(recordId)}><Eye size={15} /></IconBtn>
                          <IconBtn title="Download" onClick={() => downloadPdf(recordId, rec?.identifier ?? 'report')}><Download size={15} /></IconBtn>
                          <IconBtn title="Open record" onClick={() => router.push(`/records/${recordId}`)}><ExternalLink size={15} /></IconBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="grid h-9 w-9 place-items-center rounded-full border border-[#EEF2F7] text-[#6B7280] disabled:opacity-40 hover:bg-[#F5F7FF]"><ChevronLeft size={16} /></button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <button key={n} onClick={() => setPage(n)} className="grid h-9 min-w-9 place-items-center rounded-full px-2 text-[13px] font-bold" style={{ background: n === page ? '#EEF3FF' : 'transparent', color: n === page ? '#4F46E5' : '#6B7280' }}>{n}</button>
            ))}
            <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="grid h-9 w-9 place-items-center rounded-full border border-[#EEF2F7] text-[#6B7280] disabled:opacity-40 hover:bg-[#F5F7FF]"><ChevronRight size={16} /></button>
          </div>
        )}
      </div>

      {releaseOpen && recordForRelease && (
        <ReleaseModal
          record={recordForRelease}
          onClose={() => { setReleaseOpen(false); clearParam(); }}
          onReleased={() => {
            setReleaseOpen(false);
            notify('ok', 'Report released successfully');
            qc.invalidateQueries({ queryKey: ['reports'] });
            qc.invalidateQueries({ queryKey: ['reports-summary'] });
            clearParam();
          }}
          onError={(m) => notify('err', m)}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[110] rounded-xl px-4 py-3 text-[14px] font-semibold text-white shadow-lg" style={{ background: toast.type === 'ok' ? '#16A34A' : '#DC2626' }}>{toast.msg}</div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function Kpi({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#EEF2F7] bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-2 text-[#6B7280]"><Icon size={18} /><span className="text-[13px]">{label}</span></div>
      <div className="mt-3 text-[32px] font-bold leading-none text-[#0F172A]">{value}</div>
    </div>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick} className="grid h-8 w-8 place-items-center rounded-full border border-[#EEF2F7] text-[#6B7280] transition-colors hover:bg-[#F5F7FF] hover:text-[#4F46E5]">{children}</button>
  );
}

function Pill({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="h-9 cursor-pointer appearance-none rounded-lg border border-[#EEF2F7] bg-white pl-3 pr-8 text-[13px] font-medium text-[#374151] outline-none hover:bg-[#F9FAFB]">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
    </div>
  );
}

function ReleaseModal({ record, onClose, onReleased, onError }: { record: any; onClose: () => void; onReleased: () => void; onError: (m: string) => void }) {
  const [authorizerReference, setAuthorizerReference] = useState('');
  const [content, setContent] = useState('');
  const [signature, setSignature] = useState('');
  const [medicalEntry, setMedicalEntry] = useState('');
  const resultSheetId = record.resultSheets?.[0]?.id as string | undefined;

  const release = useMutation({
    mutationFn: () => api.post('/reports/create', { resultSheetId, authorizerReference: authorizerReference || undefined, content: content || undefined, signature: signature || undefined, medicalEntry: medicalEntry || undefined }).then((r) => r.data),
    onSuccess: onReleased,
    onError: (e: any) => onError(e?.response?.data?.message ?? 'Could not release report'),
  });

  const input = 'h-10 w-full rounded-lg border border-[#E2E8F0] px-3 text-[14px] text-[#0F172A] outline-none focus:border-[#4F46E5]';
  const label = 'text-[13px] font-semibold text-[#0F172A]';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[20px] font-bold text-[#0F172A]">Release Report</div>
            <div className="mt-0.5 text-[14px] text-[#6B7280]">{record.labNumber ?? record.identifier} · {record.patient?.firstName} {record.patient?.lastName}</div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#9CA3AF] hover:bg-[#F3F4F6]"><X size={18} /></button>
        </div>
        {!resultSheetId ? (
          <div className="mt-5 rounded-xl bg-[#FEF2F2] p-4 text-[13px] text-[#991B1B]">This record has no authorized result sheet to release.</div>
        ) : (
          <div className="mt-5 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5"><span className={label}>Authorizer Reference</span><input value={authorizerReference} onChange={(e) => setAuthorizerReference(e.target.value)} placeholder="Optional" className={input} /></label>
            <label className="flex flex-col gap-1.5"><span className={label}>Content / Notes</span><textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="Optional" className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[14px] text-[#0F172A] outline-none focus:border-[#4F46E5]" /></label>
            <label className="flex flex-col gap-1.5"><span className={label}>Signature</span><input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Optional" className={input} /></label>
            <label className="flex flex-col gap-1.5"><span className={label}>Medical Entry</span><input value={medicalEntry} onChange={(e) => setMedicalEntry(e.target.value)} placeholder="Optional" className={input} /></label>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2.5">
          <button onClick={onClose} className="h-10 rounded-lg border border-[#E5E7EB] px-4 text-[14px] font-semibold text-[#6B7280] hover:text-[#0F172A]">Cancel</button>
          <button onClick={() => release.mutate()} disabled={!resultSheetId || release.isPending} className="h-10 rounded-lg bg-[#4F46E5] px-5 text-[14px] font-semibold text-white hover:bg-[#4338CA] disabled:opacity-50">{release.isPending ? 'Releasing…' : 'Release Report'}</button>
        </div>
      </div>
    </div>
  );
}
