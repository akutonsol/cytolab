/**
 * R-016b — Full-generation snapshot fingerprint (PURE; no DB, no I/O).
 *
 * A sealed generation is a FROZEN prior chain generation that is NOT required to verify as a live
 * chain (its interior linkage may predate the atomic allocator). Its integrity invariant is instead
 * "unchanged since sealing". Proving that needs a fingerprint over the WHOLE generation, not just the
 * terminal event + count: a terminal-only fingerprint cannot detect an interior-row change that leaves
 * the row count, terminal sequence, and terminal selfHash untouched.
 *
 * `snapshotDigest` is therefore computed over EVERY event in canonical sequence order. Per event we
 * hash BOTH:
 *   • the canonical CONTENT — via the committed, reviewed {@link buildCanonicalObject}/{@link canonicalize}
 *     (the same canonicalization the verifier uses; it covers id, sequence, chainId, prevHash, every
 *     classification/actor/resource/action field, the change-evidence hashes, and metadata) — so any
 *     interior content change alters the digest; PLUS
 *   • the STORED `selfHash` — so an edit to the stored hash column alone (content untouched) is caught too.
 *
 * Rows and units are length-prefixed before hashing, so no field or row boundary is ambiguous and no
 * value can be crafted to impersonate a delimiter. This module never touches the verifier and never
 * reads the DB; callers load the rows and pass them in.
 */
import { sha256 } from '../../common/crypto/phi-crypto';
import { AuditCanonicalFields, buildCanonicalObject } from './audit-hash';
import { canonicalize } from './audit-canonicalization';
import { VerifiableAuditRow } from './audit-verification.service';

/** Preimage version tag — bump only under an authorized snapshot-format change. */
export const GENERATION_SNAPSHOT_ALGORITHM = 'gen-snapshot/v1';

/** The four values that fingerprint a frozen generation; compared field-by-field against a seal. */
export interface GenerationSnapshot {
  eventCount: number;
  /** Decimal string of the terminal (highest) sequence. */
  terminalSequence: string;
  terminalSelfHash: string;
  /** sha256 over every event in canonical sequence order (content + stored selfHash). */
  snapshotDigest: string;
}

/**
 * Local row → canonical-fields mapping. Intentionally a private copy of the verifier's reader-side
 * mapping so this module can compute the canonical content WITHOUT importing or modifying the canonical
 * verification service (R-016b forbids touching it). Field-for-field identical to the verifier's.
 */
function rowToCanonicalFields(row: VerifiableAuditRow): AuditCanonicalFields {
  return {
    id: row.id,
    occurredAt: row.occurredAt,
    recordedAt: row.recordedAt,
    schemaVersion: row.schemaVersion,
    eventVersion: row.eventVersion,
    category: row.category,
    actionCode: row.actionCode,
    detailCode: row.detailCode,
    severity: row.severity,
    phiIndicator: row.phiIndicator,
    dataClass: row.dataClass,
    retentionClass: row.retentionClass,
    durabilityClass: row.durabilityClass,
    actorType: row.actorType,
    actorId: row.actorId,
    onBehalfOfActorId: row.onBehalfOfActorId,
    servicePrincipal: row.servicePrincipal,
    organizationScope: row.organizationScope,
    scopeLabId: row.scopeLabId,
    organizationId: row.organizationId,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    resourceLabId: row.resourceLabId,
    parentResourceType: row.parentResourceType,
    parentResourceId: row.parentResourceId,
    patientRef: row.patientRef,
    outcome: row.outcome,
    statusCode: row.statusCode,
    errorCode: row.errorCode,
    reasonCode: row.reasonCode,
    changedFields: row.changedFields,
    beforeHash: row.beforeHash,
    afterHash: row.afterHash,
    producerModule: row.producerModule,
    executionId: row.executionId,
    hashAlgorithm: row.hashAlgorithm as string,
    metadata: row.metadata,
    sequence: row.sequence as bigint,
    chainId: row.chainId as string,
    prevHash: row.prevHash as string,
  };
}

/** Order rows by sequence ascending (nulls last — a frozen generation carries real sequences). */
function bySequenceAsc(a: VerifiableAuditRow, b: VerifiableAuditRow): number {
  if (a.sequence == null && b.sequence == null) return 0;
  if (a.sequence == null) return 1;
  if (b.sequence == null) return -1;
  return a.sequence < b.sequence ? -1 : a.sequence > b.sequence ? 1 : 0;
}

/** Length-prefixed framing: `<len>:<value>` removes any concatenation/delimiter ambiguity. */
const framed = (s: string): string => `${s.length}:${s}`;

/**
 * Compute the full-generation snapshot digest. `rows` may be in any order; they are sorted by sequence
 * ascending before hashing so the digest is order-independent of how they were queried.
 */
export function computeGenerationSnapshotDigest(rows: VerifiableAuditRow[]): string {
  const ordered = [...rows].sort(bySequenceAsc);
  const body = ordered
    .map((row) => {
      const content = canonicalize(buildCanonicalObject(rowToCanonicalFields(row)));
      const stored = row.selfHash ?? '';
      return `${framed(content)}|${framed(stored)}`;
    })
    .join(';');
  return sha256(`${GENERATION_SNAPSHOT_ALGORITHM};count=${ordered.length};${body}`);
}

/**
 * Reduce a loaded generation to its four-field snapshot fingerprint. Throws on an empty generation —
 * there is nothing to seal, and a zero-row "snapshot" must never be treated as a valid seal.
 */
export function snapshotGeneration(rows: VerifiableAuditRow[]): GenerationSnapshot {
  if (rows.length === 0) {
    throw new Error('cannot snapshot an empty generation');
  }
  const ordered = [...rows].sort(bySequenceAsc);
  const terminal = ordered[ordered.length - 1];
  if (terminal.sequence == null || terminal.selfHash == null) {
    throw new Error('terminal event is missing sequence/selfHash — not a snapshottable generation');
  }
  return {
    eventCount: ordered.length,
    terminalSequence: terminal.sequence.toString(),
    terminalSelfHash: terminal.selfHash,
    snapshotDigest: computeGenerationSnapshotDigest(ordered),
  };
}

/**
 * Exact, field-by-field equality of two snapshots (the four sealed fields). `terminalSequence` is
 * normalized to a decimal string so a `bigint` seal column and a computed string compare cleanly.
 */
export function snapshotsEqual(
  a: GenerationSnapshot,
  b: { eventCount: number; terminalSequence: bigint | string; terminalSelfHash: string; snapshotDigest: string },
): boolean {
  return (
    a.eventCount === b.eventCount &&
    a.terminalSequence === b.terminalSequence.toString() &&
    a.terminalSelfHash === b.terminalSelfHash &&
    a.snapshotDigest === b.snapshotDigest
  );
}
