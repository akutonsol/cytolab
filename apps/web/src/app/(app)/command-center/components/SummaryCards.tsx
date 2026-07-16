'use client';

import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui';
import { getEnterpriseSummary } from '../enterprise-api';
import { CountValue, QueueStateTag } from './QueueStateTag';

/**
 * Summary — one card per queue rendered DIRECTLY from GET /enterprise/summary.
 * Card = label (queue key, the only label the summary carries) + count + state.
 * No derived metrics, percentages, trends, or count-based colouring. Independent
 * loading boundary (its own query) — never blocks the rail or detail panel.
 */
export function SummaryCards() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['enterprise-summary'],
    queryFn: getEnterpriseSummary,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 13 }).map((_, i) => (
          <Skeleton key={i} height="h-[68px]" />
        ))}
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="rounded-lg border border-[var(--status-danger-soft)] bg-white p-4 text-sm text-[var(--status-danger-strong)]">
        Summary could not be loaded.{' '}
        <button className="underline" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {data.counts.map((c) => (
        <div key={c.key} className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold text-slate-900">
              <CountValue count={c.count} />
            </span>
            <QueueStateTag status={c.count.status} />
          </div>
          <div className="mt-1 truncate text-xs text-slate-500">{c.key}</div>
        </div>
      ))}
    </div>
  );
}
