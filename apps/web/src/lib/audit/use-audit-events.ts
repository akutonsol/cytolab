/**
 * Program 2 · P2-8B — useAuditEvents(): the list data hook. Consumes AuditQueryClient ONLY (never
 * fetches directly). Keyed by predicate + cursor (PHI/base caches separate). `keepPreviousData`
 * keeps the current page visible during a cursor transition (avoids a flash / false empty state).
 */
'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { AuditQueryClient } from './audit-query-client';
import { auditEventsQueryKey } from './audit-query-keys';
import { AuditFilterState } from './audit-filters';

export function useAuditEvents(state: AuditFilterState, cursor: string | null, enabled = true) {
  return useQuery({
    queryKey: auditEventsQueryKey(state, cursor),
    queryFn: () => AuditQueryClient.list(state, cursor),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    // In PHI mode, a failure is handled by the fail-closed auto-revert (which shows one clear
    // "PHI unavailable" message), so suppress the generic global toast. Base failures still toast.
    meta: state.phi ? { silent: true } : undefined,
  });
}
