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

const CARD = 'glass-card rounded-2xl';
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
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      <style>{`@keyframes rowflash{0%{background:#EEF3FF}100%{background:transparent}}`}</style>

      {/* Header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-charcoal-heading">Specimen Reports</h1>
          <p className="mt-1 font-body-sm text-body-sm text-secondary">Released laboratory reports and PDF downloads.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-[280px] items-center gap-2 rounded-full border border-outline-variant/30 bg-white px-4 text-secondary">
            <Search size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reports…"
              className="w-full border-none bg-transparent font-body-sm text-body-sm text-on-surface outline-none placeholder:text-secondary/60" />
            {search && (
              <button onClick={() => setSearch('')}><X size={14} className="text-secondary" /></button>
            )}
          </div>
          <button className="flex h-11 items-center gap-2 rounded-xl border border-outline-variant/30 bg-white px-4 font-label-md text-label-md text-secondary transition-all hover:bg-surface-container-low"><Filter size={15} /> Filters</button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={FileText} label="Total Reports" value={summary?.total ?? 0} />
        <Kpi icon={CheckCircle} label="This Month" value={summary?.thisMonth ?? 0} accent="#16A34A" />
        <Kpi icon={Award} label="Authorized" value={summary?.authorized ?? 0} accent="#4F46E5" />
        <Kpi icon={Clock} label="Pending Release" value={summary?.pending ?? 0} accent={(summary?.pending ?? 0) > 0 ? '#DC2626' : '#16A34A'} />
      </div>

      {/* Table card */}
      <div className={`${CARD} p-6`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-headline-sm text-headline-sm text-charcoal-heading">Released Reports · {total}</h2>
          <div className="flex items-center gap-2">
            <select value={formFilter} onChange={(e) => setFormFilter(e.target.value as any)}
              className="cursor-pointer rounded-xl border border-outline-variant/30 bg-white px-3 py-2 font-label-md text-label-md text-secondary outline-none hover:bg-surface-container-low">
              <option value="all">All Forms</option>
              <option value="Gynecology">Gynecology</option>
              <option value="NonGynecology">Non-Gynecology</option>
            </select>
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as any)}
              className="cursor-pointer rounded-xl border border-outline-variant/30 bg-white px-3 py-2 font-label-md text-label-md text-secondary outline-none hover:bg-surface-container-low">
              <option value="all">All Time</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="grid h-40 place-items-center text-[13px] text-[#9CA3AF]">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-container-low">
              <FileText size={28} className="text-secondary/40" />
            </div>
            <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">No reports yet</h3>
            <p className="max-w-xs text-center font-body-sm text-body-sm text-secondary">Reports appear here once result sheets are authorized and released.</p>
            <button onClick={() => router.push('/authorizer')}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-label-md text-label-md text-on-primary transition-all hover:brightness-110">
              Go to Authorizer <ChevronDown size={14} className="rotate-[-90deg]" />
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr>
                  {['Report#', 'Patient', 'Client', 'Form', 'Released', 'Authorized By'].map((c) => (
                    <th key={c} className="border-b border-outline-variant/20 px-4 py-3 text-left font-label-sm text-label-sm text-secondary uppercase tracking-wider">{c}</th>
                  ))}
                  <th className="border-b border-outline-variant/20 px-4 py-3 text-right font-label-sm text-label-sm text-secondary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const rec = r.resultSheet?.record;
                  const recordId = r.resultSheet?.recordId ?? '';
                  const isGyn = rec?.formType === 'Gynecology';
                  return (
                    <tr key={r.id} ref={(el) => { rowRefs.current[r.id] = el; }}
                      className="cursor-pointer border-b border-surface-container-low transition-colors hover:bg-surface-container-low/50"
                      style={highlightId === r.id ? { animation: 'rowflash 2.2s ease-out forwards' } : undefined}>
                      <td className="px-4 py-3.5"><span className="font-mono font-label-md text-label-md text-charcoal-heading">{rec?.identifier ?? '—'}</span></td>
                      <td className="px-4 py-3.5 font-body-sm text-body-sm font-medium text-on-surface">{patientName(r)}</td>
                      <td className="px-4 py-3.5 font-body-sm text-body-sm text-secondary">{clientName(r)}</td>
                      <td className="px-4 py-3.5">
                        {rec?.formType ? (
                          <span className={`inline-flex items-center rounded-full px-3 py-1 font-label-sm text-label-sm ${isGyn ? 'bg-primary-fixed text-primary' : 'bg-status-sage/10 text-status-sage'}`}>
                            {isGyn ? 'GYN' : 'NON-GYN'}
                          </span>
                        ) : <span className="text-outline-variant">—</span>}
                      </td>
                      <td className="px-4 py-3.5 font-body-sm text-body-sm text-secondary">{fmtDateTime(r.releasedAt)}</td>
                      <td className="px-4 py-3.5 font-body-sm text-body-sm text-secondary">{authorName(r)}</td>
                      <td className="px-4 py-3.5">
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
        {total > 0 && (
          <div className="mt-6 flex items-center justify-between">
            <p className="font-body-sm text-body-sm text-secondary">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="grid h-9 w-9 place-items-center rounded-lg border border-outline-variant/20 bg-white hover:bg-surface-container-low disabled:opacity-40"><ChevronLeft size={16} /></button>
              <span className="px-4 font-label-md text-label-md text-on-surface">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="grid h-9 w-9 place-items-center rounded-lg border border-outline-variant/20 bg-white hover:bg-surface-container-low disabled:opacity-40"><ChevronRight size={16} /></button>
            </div>
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
function Kpi({ icon: Icon, label, value, accent }: { icon: any; label: string; value: number; accent?: string }) {
  return (
    <div className="glass-card relative overflow-hidden rounded-2xl p-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="font-label-sm text-label-sm text-secondary uppercase tracking-wider">{label}</p>
          <h3 className="mt-2 font-display text-display leading-none" style={{ color: accent || '#0F172A' }}>{value}</h3>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: accent ? `${accent}15` : '#EEF2FF' }}>
          <Icon size={20} style={{ color: accent || '#4F46E5' }} />
        </div>
      </div>
    </div>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick} className="grid h-8 w-8 place-items-center rounded-lg border border-outline-variant/20 bg-white text-secondary transition-all hover:bg-surface-container-low hover:text-primary">{children}</button>
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
