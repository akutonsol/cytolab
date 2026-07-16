'use client';

import { useQuery } from '@tanstack/react-query';
import { cn, Skeleton } from '@/components/ui';
import { getEnterpriseQueues } from '../enterprise-api';
import { CountValue, QueueStateTag } from './QueueStateTag';

/**
 * Queue rail — rendered DIRECTLY from GET /enterprise/queues in the FROZEN order
 * supplied by the API (never sorted/regrouped; empty and deferred queues never
 * hidden and remain selectable). Semantic <button>s with a visible focus ring and
 * programmatic selection (`aria-current`). Responsive: a horizontal scroll strip
 * below `lg`, a vertical list at `lg+` — no Drawer/Modal, no page overflow.
 * Independent loading / failure boundary.
 */
export function QueueRail({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['enterprise-queues'],
    queryFn: getEnterpriseQueues,
  });

  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0"
      >
        <span className="sr-only">Loading queues…</span>
        {Array.from({ length: 13 }).map((_, i) => (
          <Skeleton key={i} height="h-11" width="w-40" className="shrink-0 lg:w-full" />
        ))}
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="text-sm text-[var(--status-danger-strong)]">
        Queue rail could not be loaded.{' '}
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
    <nav
      aria-label="Enterprise queues"
      className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0"
    >
      {data.queues.map((q) => {
        const active = selected === q.key;
        return (
          <button
            key={q.key}
            type="button"
            aria-current={active ? 'true' : undefined}
            onClick={() => onSelect(q.key)}
            className={cn(
              'flex shrink-0 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 lg:w-full lg:shrink',
              active
                ? 'border-indigo-200 bg-[var(--indigo-50)] text-primary'
                : 'border-slate-200 text-slate-700 hover:bg-slate-50 lg:border-transparent',
            )}
          >
            <span className="truncate font-medium">{q.label}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="tabular-nums text-slate-500">
                <CountValue count={q.count} />
              </span>
              <QueueStateTag status={q.count.status} />
            </span>
          </button>
        );
      })}
    </nav>
  );
}
