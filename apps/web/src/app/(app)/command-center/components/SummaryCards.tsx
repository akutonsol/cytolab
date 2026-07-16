'use client';

import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui';
import { getEnterpriseSummary } from '../enterprise-api';
import { CountValue, QueueStateTag } from './QueueStateTag';

/**
 * Summary — one card per queue, rendered DIRECTLY from GET /enterprise/summary in
 * API order (never sorted; zero/deferred/error cards never hidden). Card = count
 * (prominent, neutral — not count-coloured) + state tag + queue key label.
 * No percentages, trends, or count-based urgency colour. Independent loading /
 * failure boundary — never blocks the rail or detail panel.
 */
export function SummaryCards() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['enterprise-summary'],
    queryFn: getEnterpriseSummary,
  });

  if (isLoading) {
    return (
      <div role="status" aria-live="polite" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <span className="sr-only">Loading queue summary…</span>
        {Array.from({ length: 13 }).map((_, i) => (
          <Skeleton key={i} height="h-[76px]" />
        ))}
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="rounded-xl border border-[var(--status-danger-soft)] bg-white p-4 text-sm text-[var(--status-danger-strong)]">
        Summary could not be loaded.{' '}
        <button
          className="rounded font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          onClick={() => refetch()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {data.counts.map((c) => (
        <li
          key={c.key}
          className="flex min-h-[76px] flex-col justify-between rounded-xl border border-slate-200 bg-white p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-2xl font-semibold leading-none tracking-tight text-slate-900 tabular-nums">
              <CountValue count={c.count} />
            </span>
            <QueueStateTag status={c.count.status} />
          </div>
          <div className="mt-2 truncate text-xs font-medium text-slate-500" title={c.key}>
            {c.key}
          </div>
        </li>
      ))}
    </ul>
  );
}
