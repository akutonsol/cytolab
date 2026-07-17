import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AUDIT_HASH_ALGORITHM, GENESIS_PREV_HASH, GENESIS_SEQUENCE } from './audit-chain';
import { AuditCanonicalFields, computeSelfHash } from './audit-hash';
import { AuditMetadataValue } from './audit-metadata';

/**
 * Program 2 · P2-4D — internal, READ-ONLY audit hash-chain verifier.
 *
 * Detects integrity failures; it NEVER modifies, repairs, re-chains, deletes, or appends audit
 * evidence. It uses Prisma read operations only, never calls AuditRecorder / AuditPersistence.append,
 * and never touches AuditChainHead. Provided inside AuditModule and NOT exported.
 *
 * The event ledger is authoritative — AuditChainHead is not consulted as proof of validity.
 * Recomputation reuses the committed P2-4B `computeSelfHash`; there is no second canonicalization.
 */

export interface AuditVerificationRequest {
  chainId: string;
  fromSequence?: bigint;
  toSequence?: bigint;
}

export type AuditVerificationErrorKind =
  | 'empty_chain'
  | 'invalid_range'
  | 'missing_sequence'
  | 'duplicate_sequence'
  | 'prev_hash_mismatch'
  | 'self_hash_mismatch'
  | 'invalid_hash_format'
  | 'invalid_algorithm'
  | 'incomplete_integrity'
  | 'anchor_unavailable';

export interface AuditVerificationError {
  kind: AuditVerificationErrorKind;
  /** Decimal string of the sequence in question, when known. */
  sequence?: string;
  expected?: string;
  actual?: string;
  detail: string;
}

export interface AuditVerificationResult {
  chainId: string;
  verified: boolean;
  checkedCount: number;
  /** Legacy (NULL-integrity) rows counted only by a broader query; 0 for chain verification. */
  legacyCount: number;
  range: { fromSequence: string | null; toSequence: string | null };
  firstError?: AuditVerificationError;
}

/** The stored fields the verifier reads. Integrity fields are nullable to detect incompleteness. */
export interface VerifiableAuditRow {
  id: string;
  occurredAt: Date;
  recordedAt: Date;
  schemaVersion: number;
  eventVersion: number;
  category: string;
  actionCode: string;
  detailCode: string | null;
  severity: string;
  phiIndicator: boolean;
  dataClass: string;
  retentionClass: string;
  durabilityClass: string;
  actorType: string;
  actorId: string | null;
  onBehalfOfActorId: string | null;
  servicePrincipal: string | null;
  organizationScope: string;
  scopeLabId: string | null;
  organizationId: string | null;
  resourceType: string;
  resourceId: string | null;
  resourceLabId: string | null;
  parentResourceType: string | null;
  parentResourceId: string | null;
  patientRef: string | null;
  outcome: string;
  statusCode: number | null;
  errorCode: string | null;
  reasonCode: string | null;
  changedFields: string[];
  beforeHash: string | null;
  afterHash: string | null;
  producerModule: string;
  executionId: string | null;
  metadata: AuditMetadataValue | null;
  sequence: bigint | null;
  chainId: string | null;
  prevHash: string | null;
  selfHash: string | null;
  hashAlgorithm: string | null;
}

const HEX64 = /^[a-f0-9]{64}$/;

const error = (
  kind: AuditVerificationErrorKind,
  detail: string,
  extra: { sequence?: bigint; expected?: string; actual?: string } = {},
): AuditVerificationError => ({
  kind,
  detail,
  ...(extra.sequence !== undefined ? { sequence: extra.sequence.toString() } : {}),
  ...(extra.expected !== undefined ? { expected: extra.expected } : {}),
  ...(extra.actual !== undefined ? { actual: extra.actual } : {}),
});

/** Reader-side field mapping (integrity asserted present by the caller) → shared canonical fields. */
function toCanonicalFields(row: VerifiableAuditRow): AuditCanonicalFields {
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

/**
 * Pure verification core — no DB. Verifies rows (already ordered by sequence ascending) against a
 * trusted first-expected {sequence, prevHash} (genesis constant or a trusted anchor's selfHash).
 * Fails fast at the first integrity error; never repairs. Exported so every corruption kind can be
 * unit-tested with synthetic rows, independent of the production UNIQUE(chainId, sequence) guard.
 */
export function verifyChainRows(
  rows: VerifiableAuditRow[],
  firstExpected: { sequence: bigint; prevHash: string },
): { verified: boolean; checkedCount: number; firstError?: AuditVerificationError } {
  let expectedSeq = firstExpected.sequence;
  let expectedPrev = firstExpected.prevHash;
  let lastSeq: bigint | null = null;
  let checked = 0;

  for (const row of rows) {
    // Completeness: a row claiming chain membership must carry every integrity field.
    if (
      row.sequence === null ||
      row.chainId === null ||
      row.prevHash === null ||
      row.selfHash === null ||
      row.hashAlgorithm === null
    ) {
      return {
        verified: false,
        checkedCount: checked,
        firstError: error('incomplete_integrity', 'event has one or more NULL integrity fields', {
          sequence: row.sequence ?? undefined,
        }),
      };
    }

    const seq = row.sequence;

    if (lastSeq !== null && seq === lastSeq) {
      return {
        verified: false,
        checkedCount: checked,
        firstError: error('duplicate_sequence', 'sequence appears more than once', { sequence: seq }),
      };
    }
    if (seq > expectedSeq) {
      return {
        verified: false,
        checkedCount: checked,
        firstError: error('missing_sequence', 'sequence is not contiguous', {
          sequence: expectedSeq,
          expected: expectedSeq.toString(),
          actual: seq.toString(),
        }),
      };
    }
    if (seq < expectedSeq) {
      return {
        verified: false,
        checkedCount: checked,
        firstError: error('duplicate_sequence', 'sequence is out of order / repeated', { sequence: seq }),
      };
    }

    if (row.hashAlgorithm !== AUDIT_HASH_ALGORITHM) {
      return {
        verified: false,
        checkedCount: checked,
        firstError: error('invalid_algorithm', 'unsupported hash algorithm', {
          sequence: seq,
          expected: AUDIT_HASH_ALGORITHM,
          actual: row.hashAlgorithm,
        }),
      };
    }
    if (!HEX64.test(row.selfHash) || !HEX64.test(row.prevHash)) {
      return {
        verified: false,
        checkedCount: checked,
        firstError: error('invalid_hash_format', 'selfHash/prevHash is not lowercase 64-char hex', {
          sequence: seq,
        }),
      };
    }
    if (row.prevHash !== expectedPrev) {
      return {
        verified: false,
        checkedCount: checked,
        firstError: error('prev_hash_mismatch', 'prevHash does not link to the prior selfHash', {
          sequence: seq,
          expected: expectedPrev,
          actual: row.prevHash,
        }),
      };
    }

    const recomputed = computeSelfHash(toCanonicalFields(row));
    if (recomputed !== row.selfHash) {
      return {
        verified: false,
        checkedCount: checked,
        firstError: error('self_hash_mismatch', 'recomputed selfHash does not match the stored value', {
          sequence: seq,
          expected: row.selfHash,
          actual: recomputed,
        }),
      };
    }

    expectedPrev = row.selfHash;
    expectedSeq = seq + 1n;
    lastSeq = seq;
    checked++;
  }

  return { verified: true, checkedCount: checked };
}

@Injectable()
export class AuditVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verify a chain (full, or a bounded [fromSequence, toSequence] range) read-only. For a bounded
   * range starting above 1, the row at `fromSequence - 1` is loaded as a trusted anchor whose
   * selfHash becomes the expected prevHash; a missing/incomplete/malformed anchor yields
   * `anchor_unavailable` (the portion before the anchor is never claimed as verified).
   */
  async verifyChain(req: AuditVerificationRequest): Promise<AuditVerificationResult> {
    if (!req.chainId || req.chainId.trim() === '') {
      throw new Error('AuditVerificationService.verifyChain: chainId is required');
    }

    const range = {
      fromSequence: req.fromSequence !== undefined ? req.fromSequence.toString() : null,
      toSequence: req.toSequence !== undefined ? req.toSequence.toString() : null,
    };
    const base: AuditVerificationResult = {
      chainId: req.chainId,
      verified: false,
      checkedCount: 0,
      legacyCount: 0,
      range,
    };

    if (
      (req.fromSequence !== undefined && req.fromSequence < 1n) ||
      (req.toSequence !== undefined && req.toSequence < 1n) ||
      (req.fromSequence !== undefined && req.toSequence !== undefined && req.fromSequence > req.toSequence)
    ) {
      return { ...base, firstError: error('invalid_range', 'range bounds are invalid') };
    }

    const rows = (await this.prisma.auditEvent.findMany({
      where: {
        chainId: req.chainId,
        ...(req.fromSequence !== undefined || req.toSequence !== undefined
          ? {
              sequence: {
                ...(req.fromSequence !== undefined ? { gte: req.fromSequence } : {}),
                ...(req.toSequence !== undefined ? { lte: req.toSequence } : {}),
              },
            }
          : {}),
      },
      orderBy: { sequence: 'asc' },
    })) as unknown as VerifiableAuditRow[];

    if (rows.length === 0) {
      return { ...base, firstError: error('empty_chain', 'no chained events for this chain/range') };
    }

    // Establish the trusted starting point.
    const rangeFrom = req.fromSequence ?? GENESIS_SEQUENCE;
    let firstExpected: { sequence: bigint; prevHash: string };
    if (rangeFrom === GENESIS_SEQUENCE) {
      firstExpected = { sequence: GENESIS_SEQUENCE, prevHash: GENESIS_PREV_HASH };
    } else {
      const anchor = (await this.prisma.auditEvent.findFirst({
        where: { chainId: req.chainId, sequence: rangeFrom - 1n },
      })) as unknown as VerifiableAuditRow | null;
      if (
        !anchor ||
        anchor.selfHash === null ||
        anchor.hashAlgorithm === null ||
        !HEX64.test(anchor.selfHash) ||
        anchor.hashAlgorithm !== AUDIT_HASH_ALGORITHM
      ) {
        return {
          ...base,
          firstError: error('anchor_unavailable', 'trusted anchor is missing or has invalid integrity', {
            sequence: rangeFrom - 1n,
          }),
        };
      }
      firstExpected = { sequence: rangeFrom, prevHash: anchor.selfHash };
    }

    const outcome = verifyChainRows(rows, firstExpected);
    return { ...base, verified: outcome.verified, checkedCount: outcome.checkedCount, firstError: outcome.firstError };
  }
}
