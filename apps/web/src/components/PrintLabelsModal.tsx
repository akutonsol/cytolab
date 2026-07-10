'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Plus, Printer, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { LabelPreview } from './LabelPreview';
import { LABEL_FORMATS, expandLabels, formatById, type LabelData, type LabelFormatId } from '@/lib/labels';
import { IconAction } from '@/components/ui';

interface Props {
  recordIds: string[];
  onClose: () => void;
}

/** Print CSS: isolate the label print area and size the page to the format. */
function printCss(formatId: LabelFormatId): string {
  const f = formatById(formatId);
  const page = f.sheet ? '@page { size: A4; margin: 8mm; }' : `@page { size: ${f.widthMm}mm ${f.heightMm}mm; margin: 0; }`;
  const layout = f.sheet
    ? '.label-print-area { display: grid !important; grid-template-columns: 1fr 1fr; gap: 0; } .print-label { page-break-inside: avoid; }'
    : '.print-label { page-break-after: always; } .print-label:last-child { page-break-after: auto; }';
  return `
@media print {
  body * { visibility: hidden !important; }
  .label-print-area, .label-print-area * { visibility: visible !important; }
  .label-print-area { position: absolute !important; left: 0 !important; top: 0 !important; width: auto !important; }
  ${layout}
  ${page}
}`;
}

export function PrintLabelsModal({ recordIds, onClose }: Props) {
  const single = recordIds.length === 1;
  const [formatId, setFormatId] = useState<LabelFormatId>('dymo30252');
  const [copies, setCopies] = useState(2);
  const format = formatById(formatId);

  const { data: labels = [], isLoading } = useQuery<LabelData[]>({
    queryKey: ['labels', recordIds.join(',')],
    queryFn: () =>
      single
        ? api.get(`/records/${recordIds[0]}/label`).then((r) => [r.data])
        : api.get('/records/batch-labels', { params: { recordIds: recordIds.join(',') } }).then((r) => r.data),
  });

  const expanded = useMemo(() => expandLabels(labels, copies), [labels, copies]);
  const previewLabels = single ? expanded.slice(0, 1) : expanded.slice(0, 3);

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 2200, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <style dangerouslySetInnerHTML={{ __html: printCss(formatId) }} />
      <div className="flex max-h-[90vh] w-full max-w-[720px] flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <h3 className="flex items-center gap-2 text-[18px] font-bold text-[#0F172A]"><Printer size={20} className="text-[#4F46E5]" /> Print Slide Labels</h3>
          <IconAction icon={<X size={16} />} tone="strong" onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Format selector */}
          <div className="mb-4">
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#475569]">Label Format</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {LABEL_FORMATS.map((f) => (
                <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px]"
                  style={formatId === f.id ? { borderColor: '#4F46E5', background: '#EEF2FF' } : { borderColor: '#E2E8F0' }}>
                  <input type="radio" name="labelformat" checked={formatId === f.id} onChange={() => setFormatId(f.id)} style={{ accentColor: '#4F46E5' }} />
                  <span className="font-medium text-[#334155]">{f.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Copies */}
          <div className="mb-4 flex items-center gap-3">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-[#475569]">Copies per record</span>
            <div className="flex items-center gap-2">
              <IconAction icon={<Minus size={14} />} tone="strong" hover={false} className="border border-[#E2E8F0]" onClick={() => setCopies((c) => Math.max(1, c - 1))} />
              <span className="w-6 text-center text-[15px] font-bold text-[#0F172A]">{copies}</span>
              <IconAction icon={<Plus size={14} />} tone="strong" hover={false} className="border border-[#E2E8F0]" onClick={() => setCopies((c) => Math.min(5, c + 1))} />
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#475569]">
              {single ? 'Preview (actual size)' : `Printing ${expanded.length} labels (${copies} copies each) — showing first ${previewLabels.length}`}
            </div>
            {isLoading ? (
              <div className="py-8 text-center text-[13px] text-[#475569]">Loading…</div>
            ) : (
              <div className="flex flex-wrap items-start gap-3">
                {previewLabels.map((l, i) => <LabelPreview key={i} label={l} format={format} />)}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button onClick={onClose} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#475569]">Cancel</button>
          <button disabled={isLoading || expanded.length === 0} onClick={() => window.print()} className="rounded-lg border border-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-[#4F46E5] disabled:opacity-40">Download PDF</button>
          <button disabled={isLoading || expanded.length === 0} onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40"><Printer size={16} /> Print</button>
        </div>
      </div>

      {/* Hidden print area — all labels; revealed by @media print. */}
      <div className="label-print-area" style={{ position: 'absolute', left: -99999, top: 0 }}>
        {expanded.map((l, i) => <LabelPreview key={i} label={l} format={format} />)}
      </div>
    </div>,
    document.body,
  );
}
