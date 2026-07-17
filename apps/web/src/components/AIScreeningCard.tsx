'use client';

import { ScanSearch } from 'lucide-react';

/**
 * Diagnostic image analysis placeholder (Program 1 · P1-2). PathOS performs no
 * slide-image inference today, so this card renders no results, confidence, findings,
 * flagged regions, or review actions — only an honest "not currently available" state.
 * It is gated by `<FeatureGate feature="AI_SCREENING">` at every call site and the flag
 * is held off; real inference is a future capability (Program 6). The `recordId` prop is
 * retained so call sites stay unchanged for a future honest rebuild.
 */
export function AIScreeningCard(_props: { recordId: string }) {
  return (
    <div className="rounded-[10px] border border-[#E2E8F0] bg-white p-3.5">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#475569]">
        <ScanSearch size={13} className="text-[#7C3AED]" /> Diagnostic Image Analysis
      </div>
      <div className="text-[13px] text-[#475569]">
        Not currently available. No slide-image analysis is performed.
      </div>
    </div>
  );
}
