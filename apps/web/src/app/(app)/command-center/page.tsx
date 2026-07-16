'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CommandCenterHeader } from './components/CommandCenterHeader';
import { SummaryCards } from './components/SummaryCards';
import { QueueRail } from './components/QueueRail';
import { DISCARD_SELECTION_MESSAGE, QueueDetailPanel } from './components/QueueDetailPanel';

/**
 * Phase 5 · E3B — Enterprise Command Center work surface.
 *
 * A pure presentation layer over the three certified E2 endpoints. It computes no
 * queue membership, counts, status, overdue, or urgency — everything shown
 * originates from E2. Header · Summary · Queue rail · Detail, each with an
 * INDEPENDENT loading/failure boundary (own query) so one failing region never
 * collapses the page. The detail panel takes the dominant width at `lg+`; regions
 * stack on smaller screens. Row selection navigates only via `ownerPath`.
 */
export default function CommandCenterPage() {
  const qc = useQueryClient();
  // Initial selection = the first frozen queue key (a presentational default only).
  const [selected, setSelected] = useState<string | null>('my-work');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // E4C — the detail panel reports its page-scoped bulk selection count so a queue
  // switch that would discard a non-empty selection can be confirmed first.
  const [ccSelectionCount, setCcSelectionCount] = useState(0);
  const handleSelectQueue = (key: string) => {
    if (key !== selected && ccSelectionCount > 0 && !window.confirm(DISCARD_SELECTION_MESSAGE)) return;
    setSelected(key);
  };

  // Client-only timestamp (avoids SSR hydration mismatch; deterministic first render).
  useEffect(() => {
    setLastRefreshed(new Date());
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['enterprise-summary'] }),
      qc.invalidateQueries({ queryKey: ['enterprise-queues'] }),
      qc.invalidateQueries({ queryKey: ['enterprise-queue'] }),
    ]);
    setLastRefreshed(new Date());
    setRefreshing(false);
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
      <CommandCenterHeader lastRefreshed={lastRefreshed} onRefresh={onRefresh} refreshing={refreshing} />

      <section aria-labelledby="cc-summary-heading" className="mt-2">
        <h2 id="cc-summary-heading" className="sr-only">Queue summary</h2>
        <SummaryCards />
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <section aria-labelledby="cc-rail-heading" className="min-w-0">
          <h2 id="cc-rail-heading" className="sr-only">Queues</h2>
          <QueueRail selected={selected} onSelect={handleSelectQueue} />
        </section>

        <section aria-labelledby="cc-detail-heading" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
          <h2 id="cc-detail-heading" className="sr-only">Queue records</h2>
          <QueueDetailPanel queue={selected} onSelectionCountChange={setCcSelectionCount} />
        </section>
      </div>
    </div>
  );
}
