'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, MapPin, X } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ConfidenceRing } from '@/components/ConfidenceRing';
import { LEVEL_META, shortDate, type AIScreening } from '@/lib/ai-screening';

export function ReviewScreeningModal({ result, onClose, readOnly = false }: { result: AIScreening; onClose: () => void; readOnly?: boolean }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const alreadyReviewed = result.reviewedAt != null;
  const [agree, setAgree] = useState<boolean | null>(result.agreedWithAI);
  const [note, setNote] = useState(result.pathologistNote ?? '');
  const meta = result.confidenceLevel ? LEVEL_META[result.confidenceLevel] : null;

  const submit = useMutation({
    mutationFn: () => api.patch(`/ai-screening/${result.id}/review`, { agreedWithAI: agree, pathologistNote: note || undefined }).then((r) => r.data),
    onSuccess: () => {
      message.success('Review submitted');
      ['ai-queue', 'ai-analytics', 'ai-record', 'ai-screening'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Could not submit review'),
  });

  const editable = !readOnly && !alreadyReviewed;

  return createPortal(
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: 2200, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="flex h-full w-full max-w-[560px] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-200 p-5">
          <div>
            <h3 className="text-[18px] font-bold text-[#0F172A]">Review AI Findings</h3>
            <p className="mt-0.5 text-[13px] text-[#64748B]">{result.patientName} · <span className="font-mono">{result.labNo}</span></p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#64748B] hover:bg-slate-100"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Confidence + primary finding */}
          <div className="flex items-center gap-4 rounded-2xl border border-[#EEF2F7] bg-[#F8FAFC] p-4">
            <ConfidenceRing value={result.confidence} level={result.confidenceLevel} size={72} stroke={6} />
            <div className="min-w-0 flex-1">
              {meta && <span className="inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: meta.bg, color: meta.fg }}>{meta.label} Confidence</span>}
              <div className="mt-1.5 text-[15px] font-bold text-[#0F172A]">{result.primaryFinding ?? '—'}</div>
              <div className="mt-0.5 text-[13px] text-[#64748B]">{result.flaggedAreas} flagged area{result.flaggedAreas === 1 ? '' : 's'}</div>
            </div>
          </div>

          {/* Flagged areas list */}
          {(result.findings ?? []).length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#94A3B8]">Flagged Areas</div>
              <div className="flex flex-col gap-1.5">
                {(result.findings ?? []).map((f, i) => (
                  <div key={i} className="flex items-center gap-2.5 rounded-xl border border-[#EEF2F7] px-3 py-2">
                    <MapPin size={14} className="shrink-0 text-[#94A3B8]" />
                    <span className="flex-1 text-[13px] text-[#334155]"><span className="font-semibold">{f.region}</span> — {f.finding}</span>
                    <span className="text-[12px] font-semibold tabular-nums text-[#64748B]">{Math.round(f.confidence)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pathologist response */}
          <div className="mt-6 border-t border-slate-200 pt-5">
            <div className="text-[14px] font-bold text-[#0F172A]">Do you agree with the AI finding?</div>
            <div className="mt-3 flex flex-col gap-2">
              {[
                { val: true, label: 'Yes — I agree with the AI assessment' },
                { val: false, label: 'No — My diagnosis differs' },
              ].map((opt) => {
                const selected = agree === opt.val;
                return (
                  <button key={String(opt.val)} disabled={!editable} onClick={() => setAgree(opt.val)}
                    className="flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-[13px] font-semibold transition-colors disabled:cursor-default"
                    style={{ borderColor: selected ? (opt.val ? '#16A34A' : '#DC2626') : '#E2E8F0', background: selected ? (opt.val ? '#F0FDF4' : '#FEF2F2') : '#fff', color: selected ? (opt.val ? '#16A34A' : '#B91C1C') : '#334155' }}>
                    <span className="grid h-5 w-5 place-items-center rounded-full border-2" style={{ borderColor: selected ? (opt.val ? '#16A34A' : '#DC2626') : '#CBD5E1' }}>
                      {selected && <span className="h-2.5 w-2.5 rounded-full" style={{ background: opt.val ? '#16A34A' : '#DC2626' }} />}
                    </span>
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={!editable} rows={3} placeholder="Notes (optional)…"
              className="mt-3 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-[14px] outline-none focus:border-[#4F46E5] disabled:bg-[#F8FAFC]" />
          </div>

          {alreadyReviewed && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#F0FDF4] px-3 py-2 text-[13px] font-semibold text-[#16A34A]">
              <Check size={15} /> Reviewed by {result.reviewerName ?? '—'} · {shortDate(result.reviewedAt)}
            </div>
          )}
        </div>

        {editable && (
          <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
            <button onClick={onClose} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#64748B]">Cancel</button>
            <button disabled={agree === null || submit.isPending} onClick={() => submit.mutate()}
              className="rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40">Submit Review</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
