'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ScanEye, Trash2 } from 'lucide-react';
import { App as AntdApp, Popconfirm } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/feature-context';
import { AddSlideModal } from '@/components/AddSlideModal';
import { formatBytes, shortDate, type DigitalSlide, type WsiSummary } from '@/lib/wsi';

const CARD = 'rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]';

function Kpi({ label, value }: { label: string; value: number }) {
  return <div className={`${CARD} p-4`}><div className="text-[24px] font-bold leading-none text-[#0F172A]">{value}</div><div className="mt-1.5 text-[13px] text-[#64748B]">{label}</div></div>;
}

export default function WsiPage() {
  const { isEnabled } = useFeatures();
  const enabled = isEnabled('WSI_VIEWER');
  const router = useRouter();
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data: summary } = useQuery<WsiSummary>({ queryKey: ['wsi-summary'], queryFn: () => api.get('/wsi/summary').then((r) => r.data), enabled });
  const { data: slides = [] } = useQuery<DigitalSlide[]>({ queryKey: ['wsi-slides'], queryFn: () => api.get('/wsi').then((r) => r.data), enabled });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/wsi/${id}`),
    onSuccess: () => { message.success('Slide deleted'); ['wsi-slides', 'wsi-summary'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); },
    onError: () => message.error('Could not delete slide'),
  });

  if (!enabled) {
    return (
      <div className="min-h-full px-6 pt-4 lg:px-9" style={{ background: '#F8FAFC' }}>
        <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[#EEF2F7] bg-white p-8 text-center shadow-sm">
          <ScanEye size={28} className="mx-auto text-[#9CA3AF]" />
          <div className="mt-3 text-[18px] font-bold text-[#0F172A]">Feature not enabled</div>
          <div className="mt-1 text-[14px] text-[#6B7280]">Whole Slide Imaging is disabled for this lab.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full px-6 pb-10 pt-4 lg:px-9" style={{ background: '#F8FAFC' }}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#0F172A]">Digital Slides</h1>
          <p className="mt-1.5 text-[15px] text-[#6B7280]">Whole-slide images for remote review and annotation.</p>
        </div>
        <button onClick={() => setUploadOpen(true)} className="rounded-lg bg-[#4F46E5] px-4 py-2.5 text-[14px] font-semibold text-white">Upload Slide</button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label="Total Slides" value={summary?.totalSlides ?? 0} />
        <Kpi label="Records with Slides" value={summary?.recordsWithSlides ?? 0} />
        <Kpi label="Total Annotations" value={summary?.totalAnnotations ?? 0} />
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#EEF2F7] text-[11px] uppercase tracking-wide text-[#94A3B8]">
                <th className="px-3 py-2.5 font-semibold">Record</th>
                <th className="px-3 py-2.5 font-semibold">Patient</th>
                <th className="px-3 py-2.5 font-semibold">Stain</th>
                <th className="px-3 py-2.5 font-semibold">Magnification</th>
                <th className="px-3 py-2.5 font-semibold">Format</th>
                <th className="px-3 py-2.5 font-semibold">Size</th>
                <th className="px-3 py-2.5 font-semibold">Uploaded</th>
                <th className="px-3 py-2.5 font-semibold">Annotations</th>
                <th className="px-3 py-2.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {slides.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-12 text-center text-[#94A3B8]">No digital slides yet.</td></tr>
              ) : slides.map((s) => (
                <tr key={s.id} className="border-b border-[#F1F5F9] transition-colors hover:bg-[#F8FAFC]">
                  <td className="px-3 py-2.5 font-mono font-semibold text-[#4F46E5]">{s.labNo}</td>
                  <td className="px-3 py-2.5 font-semibold text-[#0F172A]">{s.patientName}</td>
                  <td className="px-3 py-2.5 text-[#334155]">{s.stain ?? '—'}</td>
                  <td className="px-3 py-2.5 text-[#334155]">{s.magnification ?? '—'}</td>
                  <td className="px-3 py-2.5 uppercase text-[#64748B]">{s.format}</td>
                  <td className="px-3 py-2.5 text-[#64748B]">{formatBytes(s.fileSizeBytes)}</td>
                  <td className="px-3 py-2.5 text-[#64748B]">{shortDate(s.uploadedAt)}</td>
                  <td className="px-3 py-2.5 text-[#334155]">{s.annotationCount}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <button onClick={() => router.push(`/wsi/${s.id}`)} className="rounded-lg bg-[#EEF2FF] px-2.5 py-1 text-[12px] font-semibold text-[#4F46E5]">View</button>
                      <button onClick={() => router.push(`/wsi/${s.id}?annotate=1`)} className="rounded-lg border border-[#E2E8F0] px-2.5 py-1 text-[12px] font-semibold text-[#334155]">Annotate</button>
                      <Popconfirm title="Delete this slide?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => del.mutate(s.id)}>
                        <button className="grid h-7 w-7 place-items-center rounded-lg text-[#B91C1C] hover:bg-[#FEF2F2]"><Trash2 size={14} /></button>
                      </Popconfirm>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {uploadOpen && <AddSlideModal onClose={() => setUploadOpen(false)} onSaved={(id) => router.push(`/wsi/${id}`)} />}
    </div>
  );
}
