/**
 * Program 2 · P2-8C — useAuditEvent(): the detail data hook. Consumes AuditQueryClient.getById ONLY.
 * Keyed by id + phi (base/PHI caches separate); disabled for an empty id; does NOT retry 4xx (a 403/
 * 404 is a terminal state, not a transient error). It NEVER prefetches PHI and holds no authorization.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { AuditQueryClient } from './audit-query-client';
import { auditEventQueryKey } from './audit-query-keys';

export type AuditDetailErrorKind = 'unauthorized' | 'concealed' | 'error';

/** Classify a detail fetch failure. 403 → unauthorized (base perm); 404 → concealed (one neutral
 *  state for missing/out-of-scope/concealed); anything else → a generic operational error. Pure. */
export function classifyAuditDetailError(err: unknown): AuditDetailErrorKind {
  const status = (err as { response?: { status?: number } } | null)?.response?.status;
  if (status === 403) return 'unauthorized';
  if (status === 404) return 'concealed';
  return 'error';
}

export function useAuditEvent(id: string, phi: boolean, enabled = true) {
  return useQuery({
    queryKey: auditEventQueryKey(id, phi),
    queryFn: () => AuditQueryClient.getById(id, phi),
    enabled: enabled && !!id,
    retry: false, // 403/404/malformed are terminal — never retry (and never re-attempt a PHI read)
    staleTime: 15_000,
    // Detail renders its own state (concealed / unauthorized / error / fail-closed) — suppress the
    // global first-load toast so concealment is one experience (P2-8C/8D).
    meta: { silent: true },
  });
}
