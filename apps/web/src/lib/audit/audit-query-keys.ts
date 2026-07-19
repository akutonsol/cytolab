/**
 * Program 2 · P2-8B — TanStack Query keys for the Audit UI. The key includes the full predicate
 * (via auditPredicateKey — which already encodes scope + all filters + page size + the phi flag) and
 * the cursor, so PHI and base caches are COMPLETELY separate (phi is inside the predicate key) and
 * each keyset page caches independently (enabling instant Prev from cache).
 */
import { AuditFilterState, auditPredicateKey } from './audit-filters';

export function auditEventsQueryKey(state: AuditFilterState, cursor: string | null) {
  return ['audit-events', auditPredicateKey(state), cursor ?? 'first'] as const;
}
