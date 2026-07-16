'use client';

import { RefreshCw } from 'lucide-react';
import { Button, PageHeader } from '@/components/ui';
import { useAuthStore } from '@/lib/auth';

/**
 * Header — the page's single <h1> via the shared PageHeader primitive. Shows the
 * title, current lab, a client-only "Last refreshed" timestamp, and Refresh.
 * No "Live" / "Connected" / heartbeat / health / backend-evaluation language
 * (no such signal exists). Refresh keeps E3A's invalidation behavior; the button
 * stays mounted in its busy state, so focus is never lost after a refresh.
 */
export function CommandCenterHeader({
  lastRefreshed,
  onRefresh,
  refreshing,
}: {
  lastRefreshed: Date | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const labId = useAuthStore((s) => s.claims?.labId ?? null);
  return (
    <PageHeader
      title="Enterprise Case Management"
      description={labId ? `Current lab · ${labId}` : 'Current lab'}
      meta={
        <span className="text-xs text-slate-500" aria-live="polite">
          {lastRefreshed ? `Last refreshed ${lastRefreshed.toLocaleTimeString()}` : 'Not yet refreshed'}
        </span>
      }
      actions={
        <Button
          variant="secondary"
          size="sm"
          icon={<RefreshCw size={14} />}
          loading={refreshing}
          loadingLabel="Refreshing…"
          onClick={onRefresh}
          aria-label="Refresh enterprise queues"
        >
          Refresh
        </Button>
      }
    />
  );
}
