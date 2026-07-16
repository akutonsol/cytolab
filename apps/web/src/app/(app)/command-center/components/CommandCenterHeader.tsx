'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { useAuthStore } from '@/lib/auth';

/**
 * Header — title, current lab, refresh, and a CLIENT refresh timestamp only.
 * No "Live" / "Connected" / heartbeat / health indicator (no such signal exists).
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
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Enterprise Case Management</h1>
        <p className="text-sm text-slate-500">Current lab{labId ? ` · ${labId}` : ''}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400">
          {lastRefreshed ? `Last refreshed ${lastRefreshed.toLocaleTimeString()}` : '—'}
        </span>
        <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} loading={refreshing} onClick={onRefresh}>
          Refresh
        </Button>
      </div>
    </header>
  );
}
