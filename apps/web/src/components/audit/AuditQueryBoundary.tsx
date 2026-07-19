'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Lock, Inbox } from 'lucide-react';
import { EmptyState, Button, Skeleton } from '@/components/ui';

/**
 * Program 2 · P2-8B — the list state machine. Precedence: unauthorized → error → loading → empty →
 * data. NEVER a false empty state while loading (loading wins over empty). "Unauthorized" is the
 * 403 (no audit access / scope beyond grant); it is distinct from the detail 404 concealment (P2-8C).
 */
export function AuditQueryBoundary({
  unauthorized,
  isLoading,
  isError,
  isEmpty,
  onRetry,
  children,
}: {
  unauthorized: boolean;
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (unauthorized) {
    return (
      <EmptyState
        icon={<Lock size={22} />}
        title="You don’t have access to the audit log"
        description="This view requires audit read permission. Ask a superuser to grant it."
      />
    );
  }
  if (isError) {
    return (
      <EmptyState
        icon={<AlertTriangle size={22} />}
        title="Couldn’t load audit events"
        description="Something went wrong loading this page."
        action={<Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button>}
      />
    );
  }
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4" aria-busy="true" aria-label="Loading audit events">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
    );
  }
  if (isEmpty) {
    return (
      <EmptyState
        icon={<Inbox size={22} />}
        title="No audit events match these filters"
        description="Adjust the filters or widen the time range (max 31 days)."
      />
    );
  }
  return <>{children}</>;
}
