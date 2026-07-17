/**
 * Program 2 · P2-4B — Audit chain constants + chainId derivation (integrity infrastructure).
 *
 * This file defines the chain PARTITION and GENESIS constants only. It performs NO sequence
 * allocation, NO locking, NO transactions, and NO append — that is P2-4C. Nothing here is wired
 * into the recorder or persistence flow yet.
 */
import { AuditOrganizationScope } from './audit.contract';

/** Hash scheme identifier, bound into the canonical object so the algorithm can evolve. */
export const AUDIT_HASH_ALGORITHM = 'sha256/v1';

/** First sequence number assigned to a chain's genesis event. `0` means "no events yet". */
export const GENESIS_SEQUENCE = 1n;

/**
 * prevHash of a genesis event: a definite, hex-shaped sentinel (64 zeros) rather than NULL, so
 * the genesis event's hash still covers a concrete previous-hash value. Matches the SHA-256 hex
 * shape (`/^[0-9a-f]{64}$/`).
 */
export const GENESIS_PREV_HASH = '0'.repeat(64);

export class AuditChainScopeError extends Error {
  constructor(message: string) {
    super(`Audit chain partition error: ${message}`);
    this.name = 'AuditChainScopeError';
  }
}

/**
 * Derive the chain partition key from the TRUSTED organization scope (resolved from the
 * ExecutionContext, validated by the organization-scope CHECK) — never from a producer.
 *   LAB       → "lab:<scopeLabId>"   (per-tenant chain; requires scopeLabId)
 *   SYSTEM    → "system"
 *   CROSS_LAB → "cross-lab"
 * This is pure derivation; it neither reads nor writes any chain state.
 */
export function deriveChainId(
  scope: AuditOrganizationScope,
  scopeLabId: string | null | undefined,
): string {
  switch (scope) {
    case 'LAB':
      if (!scopeLabId) {
        throw new AuditChainScopeError('LAB scope requires a scopeLabId to derive a chain');
      }
      return `lab:${scopeLabId}`;
    case 'SYSTEM':
      return 'system';
    case 'CROSS_LAB':
      return 'cross-lab';
    default: {
      // Exhaustiveness guard — a new scope must consciously choose a chain partition.
      const never: never = scope;
      throw new AuditChainScopeError(`unhandled organization scope: ${String(never)}`);
    }
  }
}
