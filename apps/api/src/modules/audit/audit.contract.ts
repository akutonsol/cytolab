/**
 * Program 2 · P2-1 — Canonical Audit Event contract (producer-facing published language).
 *
 * Binding authority: docs/architecture/AUDIT_EVENT_CONTRACT.md. These types are the
 * ONLY shape a producer may hand to the Audit owner. They are deliberately decoupled
 * from Prisma: the Prisma `AuditEvent` model type is NEVER the producer contract
 * (a leaked Prisma type would let a producer set platform-owned fields). The Audit
 * owner maps this input onto its private persistence model.
 *
 * P2-1 SCOPE: shape, enums, registry key, and the input/envelope types only. Capture
 * wiring (AuditRecorder), request enrichment, hash-chain computation, and query API are
 * P2-2..P2-10 and are intentionally NOT implemented here.
 */

// ---------------------------------------------------------------------------
// Enumerations (string-literal unions; the Prisma schema enums mirror these values
// exactly). SCREAMING_SNAKE is used deliberately: these are registry/wire codes, not
// human labels, so consistency with the contract document is preferred over the
// PascalCase style used by older domain enums (e.g. RecordStatus). Kept in sync with
// the Prisma enums by audit-architecture.spec.ts.
// ---------------------------------------------------------------------------

export type AuditCategory =
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'PHI_ACCESS'
  | 'RECORD_LIFECYCLE'
  | 'CLINICAL_WORKFLOW'
  | 'ADMINISTRATIVE'
  | 'CONFIGURATION'
  | 'DATA_EXPORT'
  | 'SECURITY'
  | 'DATA_MAINTENANCE'
  | 'SYSTEM';

export type AuditActorType =
  | 'STAFF'
  | 'PORTAL'
  | 'SERVICE'
  | 'SYSTEM'
  | 'ANONYMOUS';

export type AuditOrganizationScope = 'LAB' | 'SYSTEM' | 'CROSS_LAB';

export type AuditOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED' | 'ERROR';

export type AuditSeverity = 'INFO' | 'NOTICE' | 'WARNING' | 'CRITICAL';

export type AuditDataClass = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'PHI';

export type AuditRetentionClass = 'SHORT' | 'STANDARD' | 'EXTENDED' | 'PERMANENT';

/** Durability classes per contract §9. Concrete delivery model (outbox/sync/async) is a P2-3 decision. */
export type AuditDurabilityClass =
  | 'CRITICAL_TRANSACTIONAL'
  | 'REQUIRED_DURABLE'
  | 'OPERATIONAL';

/**
 * Attribution policy (contract §7): which request/session context an event REQUIRES.
 * The storage envelope keeps request/session OPTIONAL; the recorder (P2-3) enforces the
 * per-event policy resolved from the registry.
 */
export type AuditAttributionPolicy =
  | 'HTTP_REQUEST' // authenticated HTTP: requestId + actor required
  | 'PORTAL_SESSION' // external portal: session + client scope required
  | 'SERVICE_ACTOR' // internal service-to-service: service principal required
  | 'BACKGROUND_JOB' // async job: executionId + correlationId (no requestId)
  | 'SYSTEM_EVENT' // platform-internal: no request/session
  | 'GOVERNED_MAINTENANCE'; // data-remediation tooling: executionId + approvalReference

// ---------------------------------------------------------------------------
// Platform-owned fields — producers MUST NOT set these (contract §3). They exist only
// on the stored envelope; the input type below structurally omits them.
// ---------------------------------------------------------------------------

export const PLATFORM_OWNED_FIELDS = [
  'eventId',
  'recordedAt',
  'sequence',
  'schemaVersion',
  'eventVersion',
  'chainId',
  'prevHash',
  'selfHash',
  'hashAlgorithm',
] as const;
export type PlatformOwnedField = (typeof PLATFORM_OWNED_FIELDS)[number];

// ---------------------------------------------------------------------------
// Producer-supplied sub-shapes (all bounded; no free-text catch-alls).
// ---------------------------------------------------------------------------

/** Actor attribution. Never carries a name/email — identifiers only. */
export interface AuditActorInput {
  type: AuditActorType;
  /** Stable id of the acting principal (user id, service id). Absent for ANONYMOUS/SYSTEM. */
  id?: string | null;
  /** Delegation: the principal on whose behalf the actor acted, if any. */
  onBehalfOfId?: string | null;
  /** Named service principal for SERVICE actors. */
  servicePrincipal?: string | null;
}

/**
 * Organization scope. LAB requires labId; SYSTEM/CROSS_LAB MUST omit it — there is no
 * sentinel tenant (contract §5). Stored as `scopeLabId` so the tenancy extension, which
 * auto-scopes any model carrying a real `labId` column, never forces a lab onto a
 * SYSTEM/CROSS_LAB event.
 */
export interface AuditOrganizationInput {
  scope: AuditOrganizationScope;
  labId?: string | null;
  /** Optional coarse org grouping (e.g. parent network) — never a tenant substitute. */
  organizationId?: string | null;
}

/** Request context — OPTIONAL at the envelope level (contract §7). */
export interface AuditRequestInput {
  requestId?: string | null;
  correlationId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceId?: string | null;
  route?: string | null;
  httpMethod?: string | null;
}

/** Session context — OPTIONAL at the envelope level (contract §7). */
export interface AuditSessionInput {
  sessionId?: string | null;
  sessionKind?: string | null;
}

/**
 * Resource the action targeted. `patientRef` is an OPAQUE pseudonymous token (contract
 * §11) — never a raw name/MRN. No free-text description field exists by design.
 */
export interface AuditResourceInput {
  type: string;
  id?: string | null;
  labId?: string | null;
  parentType?: string | null;
  parentId?: string | null;
  patientRef?: string | null;
}

/** Action verb — the ONLY place the action code lives (contract §2). */
export interface AuditActionInput {
  code: string;
  detailCode?: string | null;
}

export interface AuditOutcomeInput {
  status: AuditOutcome;
  statusCode?: number | null;
  errorCode?: string | null;
  reasonCode?: string | null;
}

/**
 * Change evidence — NAMES AND HASHES ONLY (contract §7 / P2-1 requirement 7). Raw
 * before/after values are prohibited; only field names and content hashes are persisted.
 */
export interface AuditChangeInput {
  changedFields?: string[];
  beforeHash?: string | null;
  afterHash?: string | null;
}

/**
 * The producer-facing input. Structurally EXCLUDES every platform-owned field — there is
 * no `eventId`/`recordedAt`/`sequence`/`schemaVersion`/`eventVersion`/integrity slot to
 * set. `category` lives only in classification; the action verb lives only in `action.code`.
 * `eventVersion` is resolved by the owner from the registry, never supplied.
 */
export interface AuditRecordInput {
  category: AuditCategory;
  action: AuditActionInput;
  actor: AuditActorInput;
  organization: AuditOrganizationInput;
  resource: AuditResourceInput;
  outcome: AuditOutcomeInput;
  request?: AuditRequestInput;
  session?: AuditSessionInput;
  change?: AuditChangeInput;
  /**
   * Module that produced the event (owner boundary attribution). Producers should pass a
   * registry-derived constant, not an invented string (contract §Registry-4).
   */
  producerModule: string;
  /** Governed-maintenance / background execution id, when the attribution policy needs one. */
  executionId?: string | null;
  /** Optional earlier fact time; defaults to recordedAt when omitted. */
  occurredAt?: Date | null;
  /**
   * Typed, bounded metadata keyed by a registry metadata-contract id. NOT an arbitrary
   * PHI-bearing map — see audit-metadata.ts. Absent unless the event's registry entry
   * declares a metadata contract.
   */
  metadata?: Record<string, string | number | boolean | null>;
}

// A compile-time proof that AuditRecordInput cannot carry a platform-owned field.
// If someone adds e.g. `sequence` to AuditRecordInput, this line fails to compile.
type _NoPlatformFields = Extract<keyof AuditRecordInput, PlatformOwnedField>;
const _assertNoPlatformFields: _NoPlatformFields[] = [];
void _assertNoPlatformFields;
