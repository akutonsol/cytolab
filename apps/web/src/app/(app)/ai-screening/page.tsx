'use client';

import { ScanSearch } from 'lucide-react';
import { EmptyState, PageHeader } from '@/components/ui';

/**
 * Diagnostic Image Analysis — future-capability shell (Program 1 · P1-2).
 *
 * PathOS performs NO slide-image analysis today. The previous simulated AI-screening
 * dashboard (fabricated confidence, findings, flagged regions, agreement analytics) has
 * been replaced by this honest "not currently available" surface. The runtime is
 * contained (feature-flag off + controller guard + service backstop); real image
 * inference is a future capability (Program 6). Do NOT reintroduce result cards,
 * findings, confidence, flagged regions, or review actions here.
 */
export default function DiagnosticImageAnalysisPage() {
  return (
    <div className="min-h-full pt-4" style={{ background: '#F8FAFC' }}>
      <PageHeader
        title="Diagnostic Image Analysis"
        description="Whole-slide image inference is not part of PathOS today."
      />
      <EmptyState
        className="mt-16"
        icon={<ScanSearch size={28} />}
        title={<>Not currently available</>}
        description={
          <>
            No slide-image analysis is performed. This capability is not enabled for
            clinical use. Diagnostic categories are entered by the pathologist; AI is used
            only to assist report drafting, always with human review and authorization.
          </>
        }
      />
    </div>
  );
}
