'use client';

import { useQuery } from '@tanstack/react-query';
import { getEnterpriseQueues } from '../enterprise-api';
import { CountValue, QueueStateTag } from './QueueStateTag';

/**
 * Queue rail — rendered DIRECTLY from GET /enterprise/queues in the FROZEN order
 * supplied by the API. Never sorted/reordered by count or state; empty and
 * deferred queues are never hidden or collapsed. Shows label + count + state.
 * Independent loading boundary.
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
      <div className="space-y-2" aria-hidden>
        {Array.from({ length: 13 }).map((_, i) => (
          <div key={i} className="h-10 rounded-md bg-slate-100" />
        ))}
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="text-sm text-[var(--status-danger-strong)]">
        Queue rail could not be loaded.{' '}
        <button className="underline" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <nav className="space-y-1" aria-label="Enterprise queues">
      {data.queues.map((q) => {
        const active = selected === q.key;
        return (
          <button
            key={q.key}
            type="button"
            aria-current={active}
            onClick={() => onSelect(q.key)}
            className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm ${
              active ? 'bg-[var(--indigo-50)] text-primary' : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span className="truncate">{q.label}</span>
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
