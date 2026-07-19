'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import { EmptyState, Button, Skeleton } from '@/components/ui';
import { classifyAuditDetailError } from '@/lib/audit/use-audit-event';
import { AuditConcealedState } from './AuditConcealedState';

/**
 * Program 2 · P2-8C — detail state machine. Loading wins over everything (no false concealed while
 * loading). On error: 403 → unauthorized; 404 → the single neutral concealed state; else → a generic
 * operational error (with retry). Backend concealment/error detail is never surfaced.
 */
export function AuditDetailBoundary({
  unauthorized,
  isLoading,
  isError,
  error,
  hasData,
  onRetry,
  children,
}: {
  unauthorized: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  hasData: boolean;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (unauthorized) {
    return (
      <EmptyState
        icon={<Lock size={22} />}
        title="You don’t have access to the audit log"
        description="This view requires audit read permission."
      />
    );
  }
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5" aria-busy="true" aria-label="Loading audit event">
        <Skeleton className="h-6 w-56" />
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }
  if (isError) {
    const kind = classifyAuditDetailError(error);
    if (kind === 'unauthorized') {
      return (
        <EmptyState
          icon={<Lock size={22} />}
          title="You don’t have access to the audit log"
          description="This view requires audit read permission."
        />
      );
    }
    if (kind === 'concealed') return <AuditConcealedState />;
    return (
      <EmptyState
        icon={<AlertTriangle size={22} />}
        title="Couldn’t load this audit event"
        description="Something went wrong loading this page."
        action={<Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button>}
      />
    );
  }
  if (!hasData) return <AuditConcealedState />;
  return <>{children}</>;
}
