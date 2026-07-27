'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ScanEye, Trash2 } from 'lucide-react';
import { Popconfirm } from 'antd';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { useFeatures } from '@/lib/feature-context';
import { SlideUploadModal } from '@/components/SlideUploadModal';
import { formatBytes, shortDate, SLIDE_FORMATS, type DigitalSlide, type SlideLifecycleState, type WsiSummary } from '@/lib/wsi';
import { Card, EmptyState, SearchField } from '@/components/ui';
import { notify } from '@/lib/notify';

function Kpi({ label, value }: { label: string; value: number }) {
  return <Card radius="md" elevation="soft" border="hairline" className="p-4"><div className="text-[24px] font-bold leading-none text-[#0F172A]">{value}</div><div className="mt-1.5 text-[13px] text-[#475569]">{label}</div></Card>;
}

// Truthful lifecycle badge — colour is orange-safe by construction (no r>200 & g∈[100,190] & b<90).
const LIFECYCLE: Record<SlideLifecycleState, { label: string; fg: string; bg: string }> = {
  DRAFT:      { label: 'Draft',                     fg: '#475569', bg: '#F1F5F9' },
  PROCESSING: { label: 'Processing',                fg: '#4F46E5', bg: '#EEF2FF' },
  READY:      { label: 'Ready — awaiting publish',  fg: '#854D0E', bg: '#FEF9C3' },
  QC_FAILED:  { label: 'QC failed',                 fg: '#B91C1C', bg: '#FEE2E2' },
  PUBLISHED:  { label: 'Published — viewable',      fg: '#15803D', bg: '#DCFCE7' },
};

const inp = 'h-9 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-[13px] outline-none focus:border-[#4F46E5]';
const PAGE_SIZE = 20;

export default function WsiPage() {
  const { isEnabled } = useFeatures();
  const enabled = isEnabled('WSI_VIEWER');
  const router = useRouter();
  const qc = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);

  // Server-side query state.
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [format, setFormat] = useState('');
  const [tileSourceType, setTileSourceType] = useState('');
  const [stain, setStain] = useState('');
  const [scanner, setScanner] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [page, setPage] = useState(1);

  // Debounce free-text; reset to page 1 whenever any query input changes.
  useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 300); return () => clearTimeout(t); }, [qInput]);
  useEffect(() => { setPage(1); }, [q, status, format, tileSourceType, stain, scanner, sort]);

  const params = useMemo(() => {
    const p: Record<string, string | number> = { page, pageSize: PAGE_SIZE, sort };
    if (q) p.q = q;
    if (status) p.status = status;
    if (format) p.format = format;
    if (tileSourceType) p.tileSourceType = tileSourceType;
    if (stain.trim()) p.stain = stain.trim();
    if (scanner.trim()) p.scanner = scanner.trim();
    return p;
  }, [page, sort, q, status, format, tileSourceType, stain, scanner]);

  const { data: summary } = useQuery<WsiSummary>({ queryKey: ['wsi-summary'], queryFn: () => api.get('/wsi/summary').then((r) => r.data), enabled });
  const { data: result, isFetching } = useQuery<Paginated<DigitalSlide>>({
    queryKey: ['wsi-slides', params],
    queryFn: () => api.get('/wsi', { params }).then((r) => r.data),
    enabled,
    placeholderData: keepPreviousData,
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/wsi/${id}`),
    onSuccess: () => { notify.success('Slide deleted'); ['wsi-slides', 'wsi-summary'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); },
    onError: () => notify.error('Could not delete slide'),
  });

  if (!enabled) {
    return (
      <div className="min-h-full pt-4" style={{ background: '#F8FAFC' }}>
        <EmptyState className="mt-16" icon={<ScanEye size={28} />} title={<>Feature not enabled</>} description={<>Whole Slide Imaging is disabled for this lab.</>} />
      </div>
    );
  }

  const slides = result?.data ?? [];
  const total = result?.total ?? 0;
  const totalPages = result?.totalPages ?? 1;

  return (
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#0F172A]">Digital Slides</h1>
          <p className="mt-1.5 text-[15px] text-[#6B7280]">Whole-slide images for remote review and annotation.</p>
        </div>
        <button data-testid="wsi-upload-open" onClick={() => setUploadOpen(true)} className="rounded-lg bg-[#4F46E5] px-4 py-2.5 text-[14px] font-semibold text-white">Upload Slide</button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label="Total Slides" value={summary?.totalSlides ?? 0} />
        <Kpi label="Records with Slides" value={summary?.recordsWithSlides ?? 0} />
        <Kpi label="Total Annotations" value={summary?.totalAnnotations ?? 0} />
      </div>

      {/* Server-side search + filters + sort */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchField label="Search slides" hideLabel className="h-9 w-[300px]"
          inputProps={{ value: qInput, onChange: (e: ChangeEvent<HTMLInputElement>) => setQInput(e.target.value), placeholder: 'Search patient, accession, stain, scanner, format', ...({ 'data-testid': 'wsi-search' } as object) }} />
        <select data-testid="wsi-filter-status" value={status} onChange={(e) => setStatus(e.target.value)} className={inp}>
          <option value="">All statuses</option>
          {(['DRAFT', 'PROCESSING', 'READY', 'QC_FAILED', 'PUBLISHED'] as SlideLifecycleState[]).map((s) => <option key={s} value={s}>{LIFECYCLE[s].label}</option>)}
        </select>
        <select data-testid="wsi-filter-format" value={format} onChange={(e) => setFormat(e.target.value)} className={inp}>
          <option value="">All formats</option>
          {SLIDE_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <select data-testid="wsi-filter-tilesource" value={tileSourceType} onChange={(e) => setTileSourceType(e.target.value)} className={inp}>
          <option value="">All tile sources</option>
          {['IMAGE', 'DZI', 'IIIF', 'DICOMWEB'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input data-testid="wsi-filter-stain" value={stain} onChange={(e) => setStain(e.target.value)} placeholder="Stain" className={inp + ' w-[110px]'} />
        <input data-testid="wsi-filter-scanner" value={scanner} onChange={(e) => setScanner(e.target.value)} placeholder="Scanner" className={inp + ' w-[120px]'} />
        <select data-testid="wsi-sort" value={sort} onChange={(e) => setSort(e.target.value as 'newest' | 'oldest')} className={inp}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
        <span className="ml-auto text-[12px] text-[#6B7280]" data-testid="wsi-result-count">{total} slide{total === 1 ? '' : 's'}</span>
      </div>

      <Card radius="md" elevation="soft" border="hairline" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#EEF2F7] text-[11px] uppercase tracking-wide text-[#475569]">
                <th className="px-3 py-2.5 font-semibold">Record</th>
                <th className="px-3 py-2.5 font-semibold">Patient</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Stain</th>
                <th className="px-3 py-2.5 font-semibold">Magnification</th>
                <th className="px-3 py-2.5 font-semibold">Format</th>
                <th className="px-3 py-2.5 font-semibold">Size</th>
                <th className="px-3 py-2.5 font-semibold">Uploaded</th>
                <th className="px-3 py-2.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody data-testid="wsi-slide-rows">
              {slides.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-12 text-center text-[#475569]">{isFetching ? 'Loading…' : (q || status || format || tileSourceType || stain || scanner) ? 'No slides match your search.' : 'No digital slides yet.'}</td></tr>
              ) : slides.map((s) => {
                const lc = LIFECYCLE[s.lifecycle.state];
                return (
                  <tr key={s.id} data-testid="wsi-slide-row" className="border-b border-[#F1F5F9] transition-colors hover:bg-[#F8FAFC]">
                    <td className="px-3 py-2.5 font-mono font-semibold text-[#4F46E5]">{s.labNo}</td>
                    <td className="px-3 py-2.5 font-semibold text-[#0F172A]">{s.patientName}</td>
                    <td className="px-3 py-2.5"><span data-testid="wsi-lifecycle" data-state={s.lifecycle.state} data-viewable={String(s.lifecycle.viewable)} className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: lc.fg, background: lc.bg }}>{lc.label}</span></td>
                    <td className="px-3 py-2.5 text-[#334155]">{s.stain ?? '—'}</td>
                    <td className="px-3 py-2.5 text-[#334155]">{s.magnification ?? '—'}</td>
                    <td className="px-3 py-2.5 uppercase text-[#475569]">{s.tileSourceType ?? s.format}</td>
                    <td className="px-3 py-2.5 text-[#475569]">{formatBytes(s.fileSizeBytes)}</td>
                    <td className="px-3 py-2.5 text-[#475569]">{shortDate(s.uploadedAt)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <button onClick={() => router.push(`/wsi/${s.id}`)} className="rounded-lg bg-[#EEF2FF] px-2.5 py-1 text-[12px] font-semibold text-[#4F46E5]">Open</button>
                        <Popconfirm title="Delete this slide?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => del.mutate(s.id)}>
                          <button className="grid h-7 w-7 place-items-center rounded-lg text-[#B91C1C] hover:bg-[#FEF2F2]"><Trash2 size={14} /></button>
                        </Popconfirm>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Server-side pagination */}
      <div className="mt-3 flex items-center justify-end gap-3 text-[13px] text-[#475569]">
        <span data-testid="wsi-page-info">Page {page} of {totalPages}</span>
        <button data-testid="wsi-page-prev" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 font-semibold disabled:opacity-40">Prev</button>
        <button data-testid="wsi-page-next" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 font-semibold disabled:opacity-40">Next</button>
      </div>

      {uploadOpen && <SlideUploadModal onClose={() => setUploadOpen(false)} />}
    </div>
  );
}
