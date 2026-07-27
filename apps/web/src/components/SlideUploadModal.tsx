'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, UploadCloud, Loader2, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { notify } from '@/lib/notify';
import {
  completeUpload,
  deriveLifecycle,
  getIngestion,
  getReview,
  initiateUpload,
  sha256Hex,
  uploadChunks,
  type Lifecycle,
  type LifecyclePhase,
  type ReviewState,
} from '@/lib/wsi-upload';

const inp = 'h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-[14px] outline-none focus:border-[#4F46E5]';

interface Props {
  /** When provided, the slide attaches to this record and the picker is hidden. */
  recordId?: string;
  onClose: () => void;
}

const toneStyle: Record<Lifecycle['tone'], { icon: JSX.Element; color: string }> = {
  progress: { icon: <Loader2 size={16} className="animate-spin" />, color: '#4F46E5' },
  wait: { icon: <Clock size={16} />, color: '#A16207' },
  ok: { icon: <CheckCircle2 size={16} />, color: '#15803D' },
  error: { icon: <AlertTriangle size={16} />, color: '#B91C1C' },
};

export function SlideUploadModal({ recordId: fixedRecordId, onClose }: Props) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canReview = can('wsi:review');
  const [recordId, setRecordId] = useState(fixedRecordId ?? '');
  // P5-7: optional specimen anchor. Empty = record-level (specimenId null). The server re-validates that the
  // specimen belongs to this record; a browser-supplied id is never trusted on its own.
  const [specimenId, setSpecimenId] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const [phase, setPhase] = useState<LifecyclePhase>('idle');
  const [progress, setProgress] = useState(0);
  const [slideId, setSlideId] = useState<string | null>(null);
  const [ingestionId, setIngestionId] = useState<string | null>(null);
  const [ingestionStatus, setIngestionStatus] = useState<string | undefined>(undefined);
  const [review, setReview] = useState<ReviewState | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: recordsPage } = useQuery<Paginated<any>>({
    queryKey: ['wsi-records'],
    enabled: !fixedRecordId && phase === 'idle',
    queryFn: () => api.get('/specimens', { params: { pageSize: 300 } }).then((r) => r.data),
  });

  // P5-7: the selected record's specimens, from the existing record-detail read (no new discovery service).
  const { data: recordDetail } = useQuery<any>({
    queryKey: ['record-specimens', recordId],
    enabled: phase === 'idle' && !!recordId,
    queryFn: () => api.get(`/specimens/${recordId}`).then((r) => r.data),
  });
  const specimens: any[] = recordDetail?.specimens ?? [];

  // Poll the REAL backend state after VERIFIED — never manufacture progress. Stops when published.
  useEffect(() => {
    if (phase !== 'tracking' || !ingestionId || !slideId) return;
    let alive = true;
    const tick = async () => {
      const [ing, rev] = await Promise.all([getIngestion(ingestionId).catch(() => null), canReview ? getReview(slideId) : Promise.resolve(null)]);
      if (!alive) return;
      if (ing) setIngestionStatus(ing.status);
      setReview(rev);
      if (rev?.currentPublishedGenerationId && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
    void tick();
    pollRef.current = setInterval(tick, 2500);
    return () => { alive = false; if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [phase, ingestionId, slideId, canReview]);

  const lifecycle = deriveLifecycle({ phase, ingestionStatus, review, canReview });

  async function start() {
    if (!recordId || !file) return;
    try {
      const buf = await file.arrayBuffer(); // Part 1: whole-file read for the checksum (small uploads).
      const checksum = await sha256Hex(buf);
      setPhase('uploading');
      setProgress(0);
      const { slideId: sid, ingestionId: iid } = await initiateUpload(recordId, { filename: file.name, sizeBytes: file.size, ...(specimenId ? { specimenId } : {}) });
      setSlideId(sid);
      setIngestionId(iid);
      await uploadChunks(iid, buf, setProgress);
      setPhase('verifying');
      const ing = await completeUpload(iid, checksum);
      setIngestionStatus(ing.status);
      ['wsi-slides', 'wsi-summary', 'wsi-record'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setPhase('tracking');
    } catch (e: any) {
      setPhase('idle');
      notify.error(e?.response?.data?.message ?? 'Upload failed');
    }
  }

  const busy = phase === 'uploading' || phase === 'verifying';
  const t = toneStyle[lifecycle.tone];

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 2200, background: 'rgba(15,23,42,0.55)' }} onClick={busy ? undefined : onClose}>
      <div data-testid="wsi-upload-modal" className="w-full max-w-[520px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[18px] font-bold text-[#0F172A]"><UploadCloud size={18} className="text-[#4F46E5]" /> Upload Digital Slide</h3>
          {!busy && <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-[#475569] hover:bg-[#F1F5F9]"><X size={16} /></button>}
        </div>

        {phase === 'idle' && (
          <div className="flex flex-col gap-3">
            {!fixedRecordId && (
              <select value={recordId} onChange={(e) => { setRecordId(e.target.value); setSpecimenId(''); }} className={inp}>
                <option value="">Select record…</option>
                {(recordsPage?.data ?? []).map((r: any) => (
                  <option key={r.id} value={r.id}>{(r.labNumber ?? r.identifier)}{r.patient ? ` · ${r.patient.firstName} ${r.patient.lastName}` : ''}</option>
                ))}
              </select>
            )}
            {/* P5-7: optional specimen anchor (only when the record has specimens). Empty = record-level. */}
            {recordId && specimens.length > 0 && (
              <select data-testid="wsi-upload-specimen" value={specimenId} onChange={(e) => setSpecimenId(e.target.value)} className={inp}>
                <option value="">No specimen (record-level)</option>
                {specimens.map((s: any) => (
                  <option key={s.id} value={s.id}>{(s.label && String(s.label).trim()) || s.type}</option>
                ))}
              </select>
            )}
            <div>
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#475569]">Slide file</label>
              <input data-testid="wsi-upload-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={inp + ' py-2'} />
            </div>
            <p className="text-[12px] text-[#6B7280]">The file is uploaded and integrity-verified, then processed. It becomes viewable only after authorized clinical review and publication.</p>
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#475569]">Cancel</button>
              <button data-testid="wsi-upload-start" disabled={!recordId || !file} onClick={start} className="rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40">Upload</button>
            </div>
          </div>
        )}

        {phase !== 'idle' && (
          <div className="flex flex-col gap-4">
            {busy && (
              <div>
                <div className="mb-1 flex items-center justify-between text-[12px] text-[#475569]"><span>{phase === 'uploading' ? 'Uploading' : 'Verifying'}</span><span className="tabular-nums">{Math.round(progress * 100)}%</span></div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#EEF2F7]"><div className="h-full rounded-full bg-[#4F46E5] transition-[width] duration-200" style={{ width: `${Math.round((phase === 'verifying' ? 1 : progress) * 100)}%` }} /></div>
              </div>
            )}

            <div className="flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-3">
              <span style={{ color: t.color }}>{t.icon}</span>
              <div>
                <div data-testid="wsi-upload-lifecycle" data-lifecycle-key={lifecycle.key} data-viewable={String(lifecycle.viewable)} className="text-[14px] font-semibold" style={{ color: t.color }}>{lifecycle.label}</div>
                {!lifecycle.viewable && phase === 'tracking' && (
                  <div className="text-[12px] text-[#6B7280]">Publication is a deliberate clinical action requiring the <span className="font-semibold">wsi:publish</span> permission on the slide’s Clinical Review panel. This slide is not yet viewable.</div>
                )}
                {lifecycle.viewable && <div className="text-[12px] text-[#6B7280]">A published generation exists — the slide can now be viewed.</div>}
              </div>
            </div>

            {phase === 'tracking' && slideId && (
              <div className="flex justify-end gap-2">
                <button onClick={onClose} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#475569]">Done</button>
                <a data-testid="wsi-upload-open-slide" href={`/wsi/${slideId}`} className="rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white">Open slide</a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
