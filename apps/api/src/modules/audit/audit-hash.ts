/**
 * Program 2 · P2-4B — the ONE shared canonical hash builder for audit integrity.
 *
 * This is the single source of truth used by BOTH the future writer (P2-4C) and the future
 * verifier (P2-4D). There must never be a second canonicalization implementation.
 *
 * Design (per P2-4A + the P2-4B directive): build ONE canonical OBJECT containing every field
 * that participates in integrity — including sequence, chainId, and prevHash as ordinary fields
 * — then hash the canonical serialization of that single object. No string concatenation of the
 * previous hash, no framing delimiters. `selfHash` is the only excluded field (self-reference).
 *
 * Determinism (closes JSON key-order, null/undefined, locale, timezone, float, and nested-object
 * ambiguities): keys sorted lexicographically; `undefined` omitted, explicit `null` preserved;
 * timestamps as UTC ISO-8601 with milliseconds; BigInt as a decimal string; metadata flattened
 * into namespaced scalar keys; changedFields deterministically ordered. The low-level
 * {@link canonicalize} (P2-1) enforces flat-scalar-only, so metadata is flattened and
 * changedFields is pre-serialized before it is handed over.
 *
 * P2-4B ONLY builds and hashes. No allocation, no transaction, no append, no verification.
 */
import { sha256 } from '../../common/crypto/phi-crypto';
import {
  CanonicalInput,
  CanonicalScalar,
  canonicalize,
} from './audit-canonicalization';
import { AuditMetadataValue } from './audit-metadata';

/**
 * The integrity-participating fields, in a shape both the writer's create-data and the verifier's
 * stored row can produce. Deliberately NOT the Prisma model type. `selfHash` is absent by design.
 */
export interface AuditCanonicalFields {
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
  hashAlgorithm: string;
  metadata: AuditMetadataValue | null;
  sequence: bigint;
  chainId: string;
  prevHash: string;
}

/** UTC ISO-8601 with milliseconds. `Date.toISOString()` is always UTC and always ms-precision. */
const iso = (d: Date): string => d.toISOString();

/**
 * Build the single flat canonical object. Metadata is flattened into `meta.<key>` scalar entries
 * (namespaced so it can never collide with a fixed field), and changedFields is deterministically
 * sorted and serialized to one scalar string. BigInt → decimal string. `null` is preserved;
 * `undefined` is omitted by {@link canonicalize}.
 */
export function buildCanonicalObject(f: AuditCanonicalFields): CanonicalInput {
  const obj: Record<string, CanonicalScalar | undefined> = {
    id: f.id,
    occurredAt: iso(f.occurredAt),
    recordedAt: iso(f.recordedAt),
    schemaVersion: f.schemaVersion,
    eventVersion: f.eventVersion,
    category: f.category,
    actionCode: f.actionCode,
    detailCode: f.detailCode,
    severity: f.severity,
    phiIndicator: f.phiIndicator,
    dataClass: f.dataClass,
    retentionClass: f.retentionClass,
    durabilityClass: f.durabilityClass,
    actorType: f.actorType,
    actorId: f.actorId,
    onBehalfOfActorId: f.onBehalfOfActorId,
    servicePrincipal: f.servicePrincipal,
    organizationScope: f.organizationScope,
    scopeLabId: f.scopeLabId,
    organizationId: f.organizationId,
    resourceType: f.resourceType,
    resourceId: f.resourceId,
    resourceLabId: f.resourceLabId,
    parentResourceType: f.parentResourceType,
    parentResourceId: f.parentResourceId,
    patientRef: f.patientRef,
    outcome: f.outcome,
    statusCode: f.statusCode,
    errorCode: f.errorCode,
    reasonCode: f.reasonCode,
    // Deterministically ordered — changedFields is a set of names; order is not significant.
    changedFields: JSON.stringify([...f.changedFields].sort()),
    beforeHash: f.beforeHash,
    afterHash: f.afterHash,
    producerModule: f.producerModule,
    executionId: f.executionId,
    hashAlgorithm: f.hashAlgorithm,
    sequence: f.sequence.toString(), // BigInt → decimal string (JSON.stringify(BigInt) throws)
    chainId: f.chainId,
    prevHash: f.prevHash,
  };

  if (f.metadata) {
    for (const key of Object.keys(f.metadata)) {
      const v = f.metadata[key];
      obj[`meta.${key}`] = v === undefined ? null : v; // preserve null; drop undefined defensively
    }
  }

  return obj;
}

/**
 * Compute the SHA-256 (lowercase hex, 64 chars) of the canonical object. Reuses the existing
 * `phi-crypto.sha256`. No HMAC, no signatures, no secrets.
 */
export function computeSelfHash(f: AuditCanonicalFields): string {
  return sha256(canonicalize(buildCanonicalObject(f)));
}
