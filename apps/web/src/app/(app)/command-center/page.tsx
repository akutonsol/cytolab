'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CommandCenterHeader } from './components/CommandCenterHeader';
import { SummaryCards } from './components/SummaryCards';
import { QueueRail } from './components/QueueRail';
import { QueueDetailPanel } from './components/QueueDetailPanel';

/**
 * Phase 5 · E3A — Enterprise Command Center shell.
 *
 * A pure presentation layer over the three certified E2 endpoints. It computes
 * no queue membership, counts, status, overdue, or urgency — everything shown
 * originates from E2. Header · Summary cards · Queue rail · Detail panel, each
 * with an INDEPENDENT loading/failure boundary (own query) so one failing region
 * never collapses the page. Row selection navigates only via `ownerPath`.
 */
export default function CommandCenterPage() {
  const qc = useQueryClient();
  // Initial selection = the first frozen queue key (a presentational default only).
  const [selected, setSelected] = useState<string | null>('my-work');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
    <div className="space-y-5 p-5">
      <CommandCenterHeader lastRefreshed={lastRefreshed} onRefresh={onRefresh} refreshing={refreshing} />

      <SummaryCards />

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside>
          <QueueRail selected={selected} onSelect={setSelected} />
        </aside>
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <QueueDetailPanel queue={selected} />
        </section>
      </div>
    </div>
  );
}
