/**
 * Program 2 · P2-R016B-A2 — Dry-Run Recovery Planner: PURE logic (no DB, no I/O).
 *
 * Classifies audit chains, computes a versioned canonical verification digest, and builds a
 * deterministic recovery PLAN for the generation-rollover model (A1.5). It NEVER mutates anything;
 * it does not open transactions, write files, or touch the chain head. All functions are pure so
 * every classification/digest/plan is unit-testable with synthetic fixtures.
 *
 * Reuses the ONE canonical hash builder (computeSelfHash) and the ONE canonical verifier core
 * (verifyChainRows). There is deliberately no second canonicalization or verification path here.
 */
import { computeSelfHash } from '../../../src/modules/audit/audit-hash';
import {
  verifyChainRows,
  type VerifiableAuditRow,
  type AuditVerificationErrorKind,
} from '../../../src/modules/audit/audit-verification.service';
import {
  GENESIS_SEQUENCE,
  GENESIS_PREV_HASH,
} from '../../../src/modules/audit/audit-chain';
import { sha256 } from '../../../src/common/crypto/phi-crypto';

/** Versioned so the digest can be reproduced even if the verifier evolves later. */
export const RECOVERY_DIGEST_ALGORITHM = 'sha256';
export const RECOVERY_DIGEST_SCHEMA_VERSION = 1;

export type VerificationResult = 'VERIFIED' | 'COMPROMISED' | 'AMBIGUOUS';
/** The generation status the backfill/registration (A3) would assign this chain's g1. */
export type ProposedGenerationStatus = 'ACTIVE' | 'COMPROMISED';
export type PlanAction = 'REGISTER_ACTIVE' | 'REGISTER_COMPROMISED_AND_ROLLOVER';

export interface ChainHeadState {
  lastSequence: bigint;
  lastSelfHash: string;
}

export interface ChainVerification {
  result: VerificationResult;
  /** Number of events that verified contiguously from genesis before the first error (honest raw count). */
  verifiedPrefixLength: number;
  eventCount: number;
  terminalCount: number;
  terminalSequence: string | null;
  terminalSelfHash: string | null;
  headPresent: boolean;
  headMatchesTerminal: boolean;
  failure?: {
    kind: AuditVerificationErrorKind;
    sequence?: string;
    expected?: string;
    actual?: string;
    /** For prev_hash_mismatch: the prevHash that references an absent predecessor. */
    missingPredecessorHash?: string;
  };
}

export interface VerificationDigest {
  digestAlgorithm: string;
  digestSchemaVersion: number;
  digest: string;
}

/** Deterministic canonical JSON: recursively sorted keys, BigInt→decimal string, Date→UTC ISO. */
export function canonicalJson(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'bigint') return v.toString();
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(norm);
    if (typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        out[k] = norm((v as Record<string, unknown>)[k]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(norm(value));
}

const KIND_TO_REASON: Record<AuditVerificationErrorKind, string> = {
  empty_chain: 'EMPTY_CHAIN',
  invalid_range: 'INVALID_RANGE',
  missing_sequence: 'MISSING_SEQUENCE',
  duplicate_sequence: 'DUPLICATE_SEQUENCE',
  prev_hash_mismatch: 'PREV_HASH_MISMATCH',
  self_hash_mismatch: 'SELF_HASH_MISMATCH',
  invalid_hash_format: 'INVALID_HASH_FORMAT',
  invalid_algorithm: 'INVALID_ALGORITHM',
  incomplete_integrity: 'INCOMPLETE_INTEGRITY',
  anchor_unavailable: 'ANCHOR_UNAVAILABLE',
};

/**
 * Verify a chain from genesis using the canonical verifier core, and derive terminal + head
 * correspondence. Read-only inputs; returns a structured classification. AMBIGUOUS is reserved for
 * a non-unique terminal (more than one row at max sequence) — a state where no single terminal can
 * be trusted even if linkage otherwise held.
 */
export function verifyChain(rows: VerifiableAuditRow[], head: ChainHeadState | null): ChainVerification {
  const outcome = verifyChainRows(rows, { sequence: GENESIS_SEQUENCE, prevHash: GENESIS_PREV_HASH });

  const maxSeq = rows.reduce<bigint>((m, r) => (r.sequence != null && r.sequence > m ? r.sequence : m), -1n);
  const terminals = rows.filter((r) => r.sequence != null && r.sequence === maxSeq);
  const terminalUnique = terminals.length === 1;
  const terminalSelfHash = terminalUnique ? terminals[0].selfHash : null;
  const headMatchesTerminal =
    !!head && terminalUnique && head.lastSequence === maxSeq && head.lastSelfHash === terminalSelfHash;

  let result: VerificationResult;
  if (outcome.verified && terminalUnique) result = 'VERIFIED';
  else if (!terminalUnique) result = 'AMBIGUOUS';
  else result = 'COMPROMISED';

  const failure = outcome.firstError
    ? {
        kind: outcome.firstError.kind,
        sequence: outcome.firstError.sequence,
        expected: outcome.firstError.expected,
        actual: outcome.firstError.actual,
        ...(outcome.firstError.kind === 'prev_hash_mismatch' && outcome.firstError.actual
          ? { missingPredecessorHash: outcome.firstError.actual }
          : {}),
      }
    : undefined;

  return {
    result,
    verifiedPrefixLength: outcome.checkedCount,
    eventCount: rows.length,
    terminalCount: terminals.length,
    terminalSequence: maxSeq === -1n ? null : maxSeq.toString(),
    terminalSelfHash,
    headPresent: !!head,
    headMatchesTerminal,
    failure,
  };
}

/** Per-event forensic row for the digest: stored vs independently recomputed selfHash. */
function digestEvents(rows: VerifiableAuditRow[]): Array<Record<string, unknown>> {
  return rows.map((r) => {
    const complete =
      r.sequence != null && r.chainId != null && r.prevHash != null && r.hashAlgorithm != null;
    const recomputed = complete
      ? computeSelfHash({
          ...(r as unknown as Record<string, unknown>),
          sequence: r.sequence as bigint,
          chainId: r.chainId as string,
          prevHash: r.prevHash as string,
          hashAlgorithm: r.hashAlgorithm as string,
        } as any)
      : null;
    return {
      id: r.id,
      sequence: r.sequence == null ? null : r.sequence.toString(),
      storedPrevHash: r.prevHash,
      storedSelfHash: r.selfHash,
      recomputedSelfHash: recomputed,
      recomputeMatches: recomputed != null && recomputed === r.selfHash,
    };
  });
}

/**
 * Versioned verification digest over a canonical representation of the chain's integrity-relevant
 * state: ordered event IDs/sequences/stored+recomputed hashes, head state, and the verifier result +
 * failure metadata. Deterministic for a fixed DB snapshot; binds a recovery decision to exact state.
 */
export function computeVerificationDigest(
  chainId: string,
  rows: VerifiableAuditRow[],
  head: ChainHeadState | null,
  verification: ChainVerification,
): VerificationDigest {
  const input = {
    digestSchemaVersion: RECOVERY_DIGEST_SCHEMA_VERSION,
    chainId,
    events: digestEvents(rows),
    head: head ? { lastSequence: head.lastSequence.toString(), lastSelfHash: head.lastSelfHash } : null,
    verification: {
      result: verification.result,
      verifiedPrefixLength: verification.verifiedPrefixLength,
      terminalCount: verification.terminalCount,
      terminalSequence: verification.terminalSequence,
      terminalSelfHash: verification.terminalSelfHash,
      headMatchesTerminal: verification.headMatchesTerminal,
      failure: verification.failure ?? null,
    },
  };
  return {
    digestAlgorithm: RECOVERY_DIGEST_ALGORITHM,
    digestSchemaVersion: RECOVERY_DIGEST_SCHEMA_VERSION,
    digest: sha256(canonicalJson(input)),
  };
}

/**
 * The recovery record the rollover would seal (A1.5 §4). Deterministic fields only — the
 * execution-time fields (new generationId, recoveredAt, authorizedBy, new opaque chainId) are NOT
 * decided here; they are listed under `executionTimeFields` for A3. Never claims a "terminal verified
 * event" for a compromised chain.
 */
export interface RecoveryRecordPlan {
  previousGenerationChainId: string;
  verificationResult: VerificationResult;
  failureReason: string | null;
  failureSequence: string | null;
  missingPredecessorHash: string | null;
  /** Honest raw count of the contiguous-from-genesis verified prefix (may include a re-genesis artifact). */
  verifiedPrefixLength: number;
  /** Deliberately null for a compromised/ambiguous chain — no fabricated "last good event". */
  terminalVerifiedSequence: string | null;
  verificationDigest: string;
  digestAlgorithm: string;
  digestSchemaVersion: number;
  note: string;
  executionTimeFields: string[];
}

export interface RecoveryPlanEntry {
  chainId: string;
  /** For legacy chains, the partition equals the chainId (system / lab:<id> / cross-lab). */
  partition: string;
  eventCount: number;
  maxSequence: string | null;
  verification: ChainVerification;
  verificationDigest: VerificationDigest;
  proposedG1Status: ProposedGenerationStatus;
  action: PlanAction;
  recoveryRecord: RecoveryRecordPlan | null;
}

export interface RecoveryPlan {
  planSchemaVersion: number;
  chains: RecoveryPlanEntry[];
  summary: {
    totalChains: number;
    active: number;
    compromised: number;
    ambiguous: number;
    rolloversRequired: number;
  };
}

/** partition for a legacy (pre-generation) chain === its chainId (system / lab:<id> / cross-lab). */
export function partitionOfLegacyChain(chainId: string): string {
  return chainId;
}

export function buildRecoveryPlanEntry(
  chainId: string,
  rows: VerifiableAuditRow[],
  head: ChainHeadState | null,
): RecoveryPlanEntry {
  const verification = verifyChain(rows, head);
  const digest = computeVerificationDigest(chainId, rows, head, verification);
  const compromised = verification.result !== 'VERIFIED';
  const proposedG1Status: ProposedGenerationStatus = compromised ? 'COMPROMISED' : 'ACTIVE';
  const action: PlanAction = compromised ? 'REGISTER_COMPROMISED_AND_ROLLOVER' : 'REGISTER_ACTIVE';

  const recoveryRecord: RecoveryRecordPlan | null = compromised
    ? {
        previousGenerationChainId: chainId,
        verificationResult: verification.result,
        failureReason: verification.failure ? KIND_TO_REASON[verification.failure.kind] : null,
        failureSequence: verification.failure?.sequence ?? null,
        missingPredecessorHash: verification.failure?.missingPredecessorHash ?? null,
        verifiedPrefixLength: verification.verifiedPrefixLength,
        terminalVerifiedSequence: null,
        verificationDigest: digest.digest,
        digestAlgorithm: digest.digestAlgorithm,
        digestSchemaVersion: digest.digestSchemaVersion,
        note:
          verification.result === 'AMBIGUOUS'
            ? 'Chain has more than one terminal event; no single terminal can be trusted.'
            : 'Chain failed canonical verification; history is frozen as evidence. No terminal verified event is designated.',
        executionTimeFields: ['newGenerationId', 'newGenerationChainId', 'recoveredAt', 'authorizedBy'],
      }
    : null;

  return {
    chainId,
    partition: partitionOfLegacyChain(chainId),
    eventCount: rows.length,
    maxSequence: verification.terminalSequence,
    verification,
    verificationDigest: digest,
    proposedG1Status,
    action,
    recoveryRecord,
  };
}

export const RECOVERY_PLAN_SCHEMA_VERSION = 1;

export function buildRecoveryPlan(
  chains: Array<{ chainId: string; rows: VerifiableAuditRow[]; head: ChainHeadState | null }>,
): RecoveryPlan {
  const entries = chains
    .slice()
    .sort((a, b) => (a.chainId < b.chainId ? -1 : a.chainId > b.chainId ? 1 : 0))
    .map((c) => buildRecoveryPlanEntry(c.chainId, c.rows, c.head));
  const active = entries.filter((e) => e.proposedG1Status === 'ACTIVE').length;
  const compromised = entries.filter((e) => e.verification.result === 'COMPROMISED').length;
  const ambiguous = entries.filter((e) => e.verification.result === 'AMBIGUOUS').length;
  return {
    planSchemaVersion: RECOVERY_PLAN_SCHEMA_VERSION,
    chains: entries,
    summary: {
      totalChains: entries.length,
      active,
      compromised,
      ambiguous,
      rolloversRequired: entries.filter((e) => e.action === 'REGISTER_COMPROMISED_AND_ROLLOVER').length,
    },
  };
}
