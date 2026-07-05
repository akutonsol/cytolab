'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { SLIDE_FORMATS } from '@/lib/wsi';

const inp = 'h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-[14px] outline-none focus:border-[#4F46E5]';

interface Props {
  /** When provided, the slide attaches to this record and the picker is hidden. */
  recordId?: string;
  onClose: () => void;
  onSaved?: (slideId: string) => void;
}

export function AddSlideModal({ recordId: fixedRecordId, onClose, onSaved }: Props) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [recordId, setRecordId] = useState(fixedRecordId ?? '');
  const [slideUrl, setSlideUrl] = useState('');
  const [format, setFormat] = useState('image');
  const [magnification, setMagnification] = useState('');
  const [stain, setStain] = useState('');
  const [scanner, setScanner] = useState('');

  const { data: recordsPage } = useQuery<Paginated<any>>({
    queryKey: ['wsi-records'],
    enabled: !fixedRecordId,
    queryFn: () => api.get('/specimens', { params: { pageSize: 300 } }).then((r) => r.data),
  });

  const save = useMutation({
    mutationFn: () => api.post(`/wsi/record/${recordId}`, {
      slideUrl, format,
      magnification: magnification || undefined,
      stain: stain || undefined,
      scanner: scanner || undefined,
    }).then((r) => r.data),
    onSuccess: (slide) => {
      message.success('Slide added');
      ['wsi-slides', 'wsi-summary', 'wsi-record'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onSaved?.(slide.id);
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Could not add slide'),
  });

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 2200, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="w-full max-w-[480px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[18px] font-bold text-[#0F172A]">Add Digital Slide</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#64748B] hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="flex flex-col gap-3">
          {!fixedRecordId && (
            <select value={recordId} onChange={(e) => setRecordId(e.target.value)} className={inp}>
              <option value="">Select record…</option>
              {(recordsPage?.data ?? []).map((r: any) => (
                <option key={r.id} value={r.id}>
                  {(r.labNumber ?? r.identifier)}{r.patient ? ` · ${r.patient.firstName} ${r.patient.lastName}` : ''}
                </option>
              ))}
            </select>
          )}
          <div>
            <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#94A3B8]">Slide URL</label>
            <input value={slideUrl} onChange={(e) => setSlideUrl(e.target.value)} placeholder="https://…/slide.dzi" className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#94A3B8]">Format</label>
              <select value={format} onChange={(e) => setFormat(e.target.value)} className={inp}>
                {SLIDE_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#94A3B8]">Magnification</label>
              <input value={magnification} onChange={(e) => setMagnification(e.target.value)} placeholder="40x" className={inp} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#94A3B8]">Stain</label>
              <input value={stain} onChange={(e) => setStain(e.target.value)} placeholder="H&E, Pap…" className={inp} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#94A3B8]">Scanner</label>
              <input value={scanner} onChange={(e) => setScanner(e.target.value)} placeholder="Aperio AT2…" className={inp} />
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#64748B]">Cancel</button>
          <button disabled={!recordId || !slideUrl || save.isPending} onClick={() => save.mutate()}
            className="rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40">Save</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
