'use client';

import { useState } from 'react';
import { Brain, Check, Loader2, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ConfidenceRing } from '@/components/ConfidenceRing';
import { ReviewScreeningModal } from '@/components/ReviewScreeningModal';
import { LEVEL_META, shortDate, type AIScreening } from '@/lib/ai-screening';
import { notify } from '@/lib/notify';

export function AIScreeningCard({ recordId }: { recordId: string }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canRun = can('record:change');
  const [reviewOpen, setReviewOpen] = useState(false);

  const { data: result, isLoading } = useQuery<AIScreening | null>({
    queryKey: ['ai-record', recordId],
    queryFn: () => api.get(`/ai-screening/record/${recordId}`).then((r) => r.data),
    // Poll while the simulated analysis is in flight.
    refetchInterval: (q) => (['Pending', 'Processing'].includes((q.state.data as AIScreening | null)?.status ?? '') ? 1200 : false),
  });

  const run = useMutation({
    mutationFn: () => api.post(`/ai-screening/record/${recordId}`).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ai-record', recordId] }); },
    onError: () => notify.error('Could not start screening'),
  });

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="rounded-[10px] border border-[#E2E8F0] bg-white p-3.5">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#475569]">
        <Brain size={13} className="text-[#7C3AED]" /> AI Screening
      </div>
      {children}
    </div>
  );

  if (isLoading) {
    return <Shell><div className="flex items-center gap-2 py-1 text-[13px] text-[#475569]"><Loader2 size={14} className="animate-spin" /> Loading…</div></Shell>;
  }

  if (!result || result.status === 'Skipped' || result.status === 'Failed') {
    return (
      <Shell>
        <div className="text-[13px] text-[#475569]">{result?.status === 'Failed' ? 'Screening failed.' : 'Not yet screened.'}</div>
        {canRun && (
          <button onClick={() => run.mutate()} disabled={run.isPending}
            className="mt-2 rounded-lg bg-[#4F46E5] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
            {run.isPending ? 'Starting…' : 'Run Screening'}
          </button>
        )}
      </Shell>
    );
  }

  if (result.status === 'Pending' || result.status === 'Processing') {
    return (
      <Shell>
        <div className="flex items-center gap-2 py-1 text-[13px] font-semibold text-[#7C3AED]">
          <Loader2 size={15} className="animate-spin" /> AI analysis in progress…
        </div>
      </Shell>
    );
  }

  // Completed
  const meta = result.confidenceLevel ? LEVEL_META[result.confidenceLevel] : null;
  const reviewed = result.reviewedAt != null;
  return (
    <Shell>
      <div className="flex items-center gap-3">
        <ConfidenceRing value={result.confidence} level={result.confidenceLevel} size={64} stroke={5} />
        <div className="min-w-0 flex-1">
          {meta && <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: meta.bg, color: meta.fg }}>{meta.label}</span>}
          <div className="mt-1 truncate text-[13px] font-semibold text-[#0F172A]">{result.primaryFinding ?? '—'}</div>
          <div className="text-[12px] text-[#475569]">{result.flaggedAreas} flagged area{result.flaggedAreas === 1 ? '' : 's'}</div>
        </div>
      </div>

      {reviewed ? (
        <div className="mt-2.5 flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: result.agreedWithAI ? '#16A34A' : '#B91C1C' }}>
          {result.agreedWithAI ? <><Check size={14} /> Pathologist agreed</> : <><X size={14} /> Pathologist disagreed</>}
          <span className="font-normal text-[#475569]">· {result.reviewerName ?? '—'}, {shortDate(result.reviewedAt)}</span>
        </div>
      ) : (
        <button onClick={() => setReviewOpen(true)} className="mt-2.5 w-full rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-[12px] font-semibold text-[#4F46E5] hover:bg-[#EEF2FF]">
          Review AI Findings
        </button>
      )}

      {reviewOpen && <ReviewScreeningModal result={result} onClose={() => setReviewOpen(false)} />}
    </Shell>
  );
}
