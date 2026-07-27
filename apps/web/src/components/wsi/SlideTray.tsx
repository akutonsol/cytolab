'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DigitalSlide, SlideLifecycleState } from '@/lib/wsi';

/**
 * P5-6 Part A — case-aware slide tray. Renders the record-scoped orchestration set (from the P5-5
 * `GET /wsi?recordId=` discovery API) and lets the reviewer switch the active slide, with prev/next.
 *
 * Truthful by construction: every tray item shows the slide's own lifecycle (from the backend, per-slide);
 * membership in the tray is discovery only — it never implies image access. Switching is handled by the
 * page (each active slide issues its OWN authenticated delivery session; a non-viewable slide stays
 * non-viewable). The tray shows metadata only — no image bytes, no tile/descriptor requests.
 */

// Orange-safe lifecycle chips (no r>200 & g∈[100,190] & b<90).
const LC: Record<SlideLifecycleState, { label: string; fg: string; bg: string }> = {
  DRAFT: { label: 'Draft', fg: '#94A3B8', bg: '#1E293B' },
  PROCESSING: { label: 'Processing', fg: '#A5B4FC', bg: '#312E81' },
  READY: { label: 'Ready — awaiting publish', fg: '#FDE68A', bg: '#713F12' },
  QC_FAILED: { label: 'QC failed', fg: '#FCA5A5', bg: '#7F1D1D' },
  PUBLISHED: { label: 'Published', fg: '#86EFAC', bg: '#14532D' },
};

interface Props {
  slides: DigitalSlide[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function SlideTray({ slides, activeId, onSelect }: Props) {
  const idx = slides.findIndex((s) => s.id === activeId);
  const go = (delta: number) => {
    const n = idx + delta;
    if (n >= 0 && n < slides.length) onSelect(slides[n].id);
  };

  return (
    <div data-testid="wsi-tray" className="flex items-center gap-2 border-t border-slate-800 bg-slate-900 px-3 py-2">
      <button data-testid="wsi-tray-prev" aria-label="Previous slide" disabled={idx <= 0} onClick={() => go(-1)}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-300 hover:bg-white/10 disabled:opacity-30">
        <ChevronLeft size={16} />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        {slides.map((s) => {
          const lc = LC[s.lifecycle.state];
          const active = s.id === activeId;
          return (
            <button
              key={s.id}
              data-testid="wsi-tray-slide"
              data-slide-id={s.id}
              data-active={String(active)}
              data-state={s.lifecycle.state}
              data-viewable={String(s.lifecycle.viewable)}
              onClick={() => onSelect(s.id)}
              className={`flex shrink-0 flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-colors ${active ? 'border-[#4F46E5] bg-[#4F46E5]/15' : 'border-slate-700 bg-slate-800/60 hover:bg-slate-800'}`}
              style={{ minWidth: 150 }}
            >
              <span className="truncate text-[12px] font-semibold text-slate-100">{s.stain ?? s.tileSourceType ?? s.format ?? 'Slide'}</span>
              <span className="inline-flex w-fit items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: lc.fg, background: lc.bg }}>{lc.label}</span>
            </button>
          );
        })}
      </div>

      <span data-testid="wsi-tray-count" className="shrink-0 px-1 text-[12px] tabular-nums text-slate-400">
        {idx >= 0 ? idx + 1 : '—'} / {slides.length}
      </span>
      <button data-testid="wsi-tray-next" aria-label="Next slide" disabled={idx < 0 || idx >= slides.length - 1} onClick={() => go(1)}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-300 hover:bg-white/10 disabled:opacity-30">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
