'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { Button, SkeletonText } from '@/components/ui';
import { api } from '@/lib/api';
import { shortDate } from '@/lib/wsi';
import type { SlidePublicationHistory } from '@/lib/wsi-review';

/**
 * Publication timeline for a slide — keyset "Load more" driven purely by the server's `nextCursor`
 * (no client-side offset reconstruction). Distinguishes the first-page load, an in-flight next page,
 * exhausted history, and a failed next-page request.
 */
export function PublicationHistory({ slideId, enabled }: { slideId: string; enabled: boolean }) {
  const q = useInfiniteQuery({
    queryKey: ['wsi-publications', slideId],
    queryFn: ({ pageParam }) =>
      api
        .get(`/wsi/slides/${slideId}/publications`, { params: { limit: 20, cursor: pageParam || undefined } })
        .then((r) => r.data as SlidePublicationHistory),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });

  if (q.isLoading) return <SkeletonText lines={4} />;
  if (q.isError) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
        <span>Could not load publication history.</span>
        <button className="font-semibold underline" onClick={() => q.refetch()}>Retry</button>
      </div>
    );
  }

  const events = (q.data?.pages ?? []).flatMap((p) => p.events);
  if (events.length === 0) return <p className="text-[13px] text-text-secondary">No publications yet.</p>;

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {events.map((e) => (
          <li key={e.publicationEventId} className="rounded-lg border border-card p-3 text-[13px]">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-text">Published</span>
              <span className="text-text-secondary">{shortDate(e.at)}</span>
            </div>
            <div className="mt-1 font-mono text-[11px] text-text-secondary">{e.publishedGenerationId}</div>
            {e.supersededGenerationId && (
              <div className="mt-1 text-[12px] text-text-secondary">
                superseded <span className="font-mono">{e.supersededGenerationId}</span>
              </div>
            )}
          </li>
        ))}
      </ul>

      {q.hasNextPage ? (
        <Button variant="secondary" size="sm" block loading={q.isFetchingNextPage} loadingLabel="Loading…" onClick={() => q.fetchNextPage()}>
          Load more
        </Button>
      ) : (
        <p className="py-1 text-center text-[12px] text-text-secondary">End of history</p>
      )}
    </div>
  );
}
