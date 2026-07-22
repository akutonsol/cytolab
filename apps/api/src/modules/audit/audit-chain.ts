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
 * R-016a — SYSTEM chain generations.
 *
 * Generation 0 (the bare `"system"` chainId) holds a small set of pre-P2-4C rows whose interior
 * linkage predates the atomic head allocator, and whose `selfHash` covers `chainId` (verified in the
 * R-016 forensic) — so they can be neither re-linked nor relocated without breaking their own hashes.
 * That generation is FROZEN: nothing appends to it again. All new SYSTEM audit events route to the
 * ACTIVE generation, which is genesis-fresh and fully verifiable from sequence 1.
 *
 * Boundary note (R-016a): the existing integrity monitor still enumerates the frozen generation and,
 * under UNCHANGED semantics, reports it COMPROMISED. That is a known, accepted condition; the
 * sealed-generation architecture that reclassifies it is deferred to R-016b. R-016a changes only the
 * active write route — no monitor/verifier semantics, no historical rows, no hashes.
 *
 * Bump {@link ACTIVE_SYSTEM_CHAIN_ID} ONLY under an authorized generation rollover.
 */
export const LEGACY_SYSTEM_CHAIN_ID = 'system';
export const ACTIVE_SYSTEM_CHAIN_ID = 'system:g1';

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
      // Route to the ACTIVE SYSTEM generation, never the frozen generation-0 "system" chain (R-016a).
      return ACTIVE_SYSTEM_CHAIN_ID;
    case 'CROSS_LAB':
      return 'cross-lab';
    default: {
      // Exhaustiveness guard — a new scope must consciously choose a chain partition.
      const never: never = scope;
      throw new AuditChainScopeError(`unhandled organization scope: ${String(never)}`);
    }
  }
}
