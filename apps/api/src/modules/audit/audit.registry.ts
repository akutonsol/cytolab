/**
 * Program 2 · P2-1 — Audit category/action registry foundation (version-aware).
 *
 * Canonical registry identity is (category, actionCode, eventVersion) (contract §Registry).
 * Every registered version is retained forever: making a new version current NEVER
 * overwrites the meaning of an older one, so exported/historical evidence stays interpretable.
 *
 * Two deliberate resolution paths:
 *   - resolveCurrent(category, actionCode)          → producer convenience: the definition a
 *                                                      producer gets today, at its declared
 *                                                      current version.
 *   - resolveExact(category, actionCode, version)   → historical/verification: the precise
 *                                                      semantic contract for an old event.
 *
 * P2-1 seeds only enough entries to PROVE the architecture, including one event carried at
 * two versions to demonstrate that a superseded version remains resolvable. Wiring every
 * domain event is P2-3..P2-6 — deliberately NOT done here.
 */
import {
  AuditAttributionPolicy,
  AuditCategory,
  AuditDataClass,
  AuditDurabilityClass,
  AuditRetentionClass,
  AuditSeverity,
} from './audit.contract';
import { AuditMetadataContractId } from './audit-metadata';

export interface AuditRegistryEntry {
  category: AuditCategory;
  actionCode: string;
  /** The semantic version this definition describes. Part of the canonical identity. */
  eventVersion: number;
  defaultSeverity: AuditSeverity;
  phiIndicator: boolean;
  dataClass: AuditDataClass;
  retentionClass: AuditRetentionClass;
  durabilityClass: AuditDurabilityClass;
  attributionPolicy: AuditAttributionPolicy;
  /** Typed metadata contract for this event/version, or null when it carries no metadata. */
  metadataContractId: AuditMetadataContractId | null;
}

/** Exact composite key: `${category}:${actionCode}:v${eventVersion}`. */
export type AuditExactKey = `${AuditCategory}:${string}:v${number}`;
/** Convenience key (current pointer): `${category}:${actionCode}`. */
export type AuditEventKey = `${AuditCategory}:${string}`;

export const eventKey = (
  category: AuditCategory,
  actionCode: string,
): AuditEventKey => `${category}:${actionCode}`;

export const exactKey = (
  category: AuditCategory,
  actionCode: string,
  eventVersion: number,
): AuditExactKey => `${category}:${actionCode}:v${eventVersion}`;

/**
 * P2-3R durability truthfulness. A registry `durabilityClass` describes the guarantee the
 * CURRENT runtime provides, not a desired future one:
 *   - OPERATIONAL          → best-effort synchronous append; a failure is logged and dropped,
 *                            no eventual-delivery claim. All wired Phase-1 pilot events are here.
 *   - CRITICAL_TRANSACTIONAL → append only inside a supplied owner transaction; without one the
 *                            recorder fails closed. Held by events NOT wired to a non-transactional
 *                            owner (e.g. RECORD_STATUS_CHANGED, GOVERNED_DELETION_EXECUTED).
 *   - REQUIRED_DURABLE     → NOT supported in P2-3 (no durable outbox exists); the recorder fails
 *                            CLOSED if such an event is emitted — it is never log-and-swallowed.
 *                            Held only by events NOT wired to a live owner (LAB_FEATURE_TOGGLED,
 *                            EVIDENCE_EXPORTED v1), so no live path fails.
 * PROMOTION CANDIDATES (after a durable outbox / owner transactions land, P2-3+): LOGIN_SUCCEEDED,
 * LOGIN_FAILED → REQUIRED_DURABLE; RECORD_CREATED, RECORD_SUBMITTED, SETTING_CHANGED →
 * CRITICAL_TRANSACTIONAL (per contract §9, which lists clinical-lifecycle + authorization changes
 * as durable). Promotion changes a delivery guarantee; because no event was ever emitted under the
 * pre-P2-3R classification (capture activates only in the uncommitted P2-3), correcting v1 in place
 * rewrites no historical evidence — a new event version is NOT required for this correction.
 */

/**
 * All registered definitions (every version of every event). `DATA_EXPORT/EVIDENCE_EXPORTED`
 * is intentionally carried at v1 (historical) AND v2 (current) to prove version-aware
 * resolution: v2 raised severity to CRITICAL, but v1 must remain resolvable for old evidence.
 */
const ENTRIES: AuditRegistryEntry[] = [
  {
    category: 'AUTHENTICATION',
    actionCode: 'LOGIN_SUCCEEDED',
    eventVersion: 1,
    defaultSeverity: 'INFO',
    phiIndicator: false,
    dataClass: 'INTERNAL',
    retentionClass: 'STANDARD',
    // P2-3R: OPERATIONAL (best-effort) — the login flow has no durable delivery. Promotion
    // candidate to REQUIRED_DURABLE once a durable audit outbox exists (see durability note).
    durabilityClass: 'OPERATIONAL',
    attributionPolicy: 'HTTP_REQUEST',
    metadataContractId: null,
  },
  // P2-5B PHI-access taxonomy (small + stable): single-subject VIEWED, aggregate LIST_QUERIED,
  // and multi-subject EXPORTED. All are OPERATIONAL (PHI reads are non-transactional and
  // side-effect-free; CRITICAL_TRANSACTIONAL would be untruthful, REQUIRED_DURABLE is unsupported).
  // Promotion target OPERATIONAL → REQUIRED_DURABLE only after a governed durable outbox exists.
  {
    category: 'PHI_ACCESS',
    actionCode: 'PATIENT_RECORD_VIEWED', // successful single-subject access; surface in metadata
    eventVersion: 1,
    defaultSeverity: 'NOTICE',
    phiIndicator: true,
    dataClass: 'PHI',
    retentionClass: 'PERMANENT',
    // P2-5B: reclassified CRITICAL_TRANSACTIONAL → OPERATIONAL (in-place; never emitted, so no
    // historical evidence is reinterpreted and no new event version is required).
    durabilityClass: 'OPERATIONAL',
    attributionPolicy: 'HTTP_REQUEST',
    metadataContractId: 'phi.access.v2',
  },
  {
    category: 'PHI_ACCESS',
    actionCode: 'PATIENT_LIST_QUERIED', // aggregate multi-patient read; ONE event per request, patientRef null
    eventVersion: 1,
    defaultSeverity: 'NOTICE',
    phiIndicator: true,
    dataClass: 'PHI',
    retentionClass: 'PERMANENT',
    durabilityClass: 'OPERATIONAL',
    attributionPolicy: 'HTTP_REQUEST',
    metadataContractId: 'phi.access.v2',
  },
  {
    category: 'PHI_ACCESS',
    actionCode: 'PHI_EXPORTED', // multi-subject export artifact; ONE event per export operation
    eventVersion: 1,
    defaultSeverity: 'WARNING',
    phiIndicator: true,
    dataClass: 'PHI',
    retentionClass: 'PERMANENT',
    durabilityClass: 'OPERATIONAL',
    attributionPolicy: 'HTTP_REQUEST',
    metadataContractId: 'phi.access.v2',
  },
  {
    category: 'RECORD_LIFECYCLE',
    actionCode: 'RECORD_STATUS_CHANGED',
    eventVersion: 1,
    defaultSeverity: 'NOTICE',
    phiIndicator: false,
    dataClass: 'CONFIDENTIAL',
    retentionClass: 'EXTENDED',
    durabilityClass: 'CRITICAL_TRANSACTIONAL',
    attributionPolicy: 'HTTP_REQUEST',
    metadataContractId: 'record.status_change.v1',
  },
  {
    category: 'DATA_MAINTENANCE',
    actionCode: 'GOVERNED_DELETION_EXECUTED',
    eventVersion: 1,
    defaultSeverity: 'CRITICAL',
    phiIndicator: false,
    dataClass: 'CONFIDENTIAL',
    retentionClass: 'PERMANENT',
    durabilityClass: 'CRITICAL_TRANSACTIONAL',
    attributionPolicy: 'GOVERNED_MAINTENANCE',
    metadataContractId: 'maintenance.disposition.v1',
  },
  {
    category: 'CONFIGURATION',
    actionCode: 'LAB_FEATURE_TOGGLED',
    eventVersion: 1,
    defaultSeverity: 'WARNING',
    phiIndicator: false,
    dataClass: 'INTERNAL',
    retentionClass: 'EXTENDED',
    durabilityClass: 'REQUIRED_DURABLE',
    attributionPolicy: 'HTTP_REQUEST',
    metadataContractId: null,
  },
  // --- P2-3 Phase-1 owner capture set --------------------------------------
  {
    category: 'AUTHENTICATION',
    actionCode: 'LOGIN_FAILED',
    eventVersion: 1,
    defaultSeverity: 'WARNING',
    phiIndicator: false,
    dataClass: 'INTERNAL',
    retentionClass: 'STANDARD',
    // P2-3R: OPERATIONAL (best-effort). Promotion candidate to REQUIRED_DURABLE (security signal)
    // once a durable audit outbox exists.
    durabilityClass: 'OPERATIONAL',
    attributionPolicy: 'HTTP_REQUEST',
    metadataContractId: null,
  },
  {
    category: 'AUTHENTICATION',
    actionCode: 'LOGOUT',
    eventVersion: 1,
    defaultSeverity: 'INFO',
    phiIndicator: false,
    dataClass: 'INTERNAL',
    retentionClass: 'STANDARD',
    durabilityClass: 'OPERATIONAL',
    attributionPolicy: 'HTTP_REQUEST',
    metadataContractId: null,
  },
  {
    category: 'RECORD_LIFECYCLE',
    actionCode: 'RECORD_CREATED',
    eventVersion: 1,
    defaultSeverity: 'NOTICE',
    phiIndicator: false,
    dataClass: 'CONFIDENTIAL',
    retentionClass: 'EXTENDED',
    // P2-3R: OPERATIONAL (best-effort) — records.create is not transactional. Promotion candidate
    // to CRITICAL_TRANSACTIONAL once the create runs in an owner transaction (contract §9 lists
    // clinical-lifecycle actions as durable).
    durabilityClass: 'OPERATIONAL',
    attributionPolicy: 'HTTP_REQUEST',
    metadataContractId: null,
  },
  {
    category: 'RECORD_LIFECYCLE',
    actionCode: 'RECORD_UPDATED',
    eventVersion: 1,
    defaultSeverity: 'INFO',
    phiIndicator: false,
    dataClass: 'CONFIDENTIAL',
    retentionClass: 'EXTENDED',
    durabilityClass: 'OPERATIONAL',
    attributionPolicy: 'HTTP_REQUEST',
    metadataContractId: null,
  },
  {
    category: 'RECORD_LIFECYCLE',
    actionCode: 'RECORD_SUBMITTED',
    eventVersion: 1,
    defaultSeverity: 'NOTICE',
    phiIndicator: false,
    dataClass: 'CONFIDENTIAL',
    retentionClass: 'EXTENDED',
    // P2-3R: OPERATIONAL (best-effort) — the status transition is not transactional. Promotion
    // candidate to CRITICAL_TRANSACTIONAL once transition() runs in an owner transaction.
    durabilityClass: 'OPERATIONAL',
    attributionPolicy: 'HTTP_REQUEST',
    metadataContractId: null,
  },
  {
    category: 'SYSTEM',
    actionCode: 'JOB_STARTED',
    eventVersion: 1,
    defaultSeverity: 'INFO',
    phiIndicator: false,
    dataClass: 'INTERNAL',
    retentionClass: 'SHORT',
    durabilityClass: 'OPERATIONAL',
    attributionPolicy: 'BACKGROUND_JOB',
    metadataContractId: null,
  },
  {
    category: 'SYSTEM',
    actionCode: 'JOB_COMPLETED',
    eventVersion: 1,
    defaultSeverity: 'INFO',
    phiIndicator: false,
    dataClass: 'INTERNAL',
    retentionClass: 'SHORT',
    durabilityClass: 'OPERATIONAL',
    attributionPolicy: 'BACKGROUND_JOB',
    metadataContractId: null,
  },
  {
    category: 'CONFIGURATION',
    actionCode: 'SETTING_CHANGED',
    eventVersion: 1,
    defaultSeverity: 'WARNING',
    phiIndicator: false,
    dataClass: 'INTERNAL',
    retentionClass: 'EXTENDED',
    // P2-3R: OPERATIONAL (best-effort) — toggle() is not transactional. Promotion candidate to
    // CRITICAL_TRANSACTIONAL once the feature upsert runs in an owner transaction.
    durabilityClass: 'OPERATIONAL',
    attributionPolicy: 'HTTP_REQUEST',
    metadataContractId: 'config.setting_change.v1',
  },
  // --- P2-6C Administrative lifecycle capture -------------------------------
  // Entity-neutral lifecycle verbs; the entity is carried by resourceType (User | Client |
  // ClientType | Lab | Workspace), mirroring the RECORD_* precedent. All OPERATIONAL
  // (best-effort) — no owner transaction / durable outbox exists (P2-6B §durability). Non-PHI.
  {
    category: 'ADMINISTRATIVE',
    actionCode: 'ENTITY_CREATED',
    eventVersion: 1,
    defaultSeverity: 'NOTICE',
    phiIndicator: false,
    dataClass: 'CONFIDENTIAL',
    retentionClass: 'EXTENDED',
    durabilityClass: 'OPERATIONAL',
    attributionPolicy: 'HTTP_REQUEST',
    metadataContractId: null,
  },
  {
    category: 'ADMINISTRATIVE',
    actionCode: 'ENTITY_UPDATED',
    eventVersion: 1,
    defaultSeverity: 'INFO',
    phiIndicator: false,
    dataClass: 'CONFIDENTIAL',
    retentionClass: 'EXTENDED',
    durabilityClass: 'OPERATIONAL',
    attributionPolicy: 'HTTP_REQUEST',
    // "What changed" rides the change-evidence channel (change.changedFields — names only).
    metadataContractId: null,
  },
  {
    category: 'ADMINISTRATIVE',
    actionCode: 'ENTITY_STATE_CHANGED',
    eventVersion: 1,
    defaultSeverity: 'NOTICE',
    phiIndicator: false,
    dataClass: 'CONFIDENTIAL',
    retentionClass: 'EXTENDED',
    durabilityClass: 'OPERATIONAL',
    attributionPolicy: 'HTTP_REQUEST',
    metadataContractId: 'admin.state_change.v1',
  },
  {
    category: 'ADMINISTRATIVE',
    actionCode: 'ENTITY_DELETED',
    eventVersion: 1,
    defaultSeverity: 'WARNING',
    phiIndicator: false,
    dataClass: 'CONFIDENTIAL',
    // Deletion is irreversible governance — retained permanently.
    retentionClass: 'PERMANENT',
    durabilityClass: 'OPERATIONAL',
    attributionPolicy: 'HTTP_REQUEST',
    metadataContractId: null,
  },
  // Two-version demonstration event (see note above).
  {
    category: 'DATA_EXPORT',
    actionCode: 'EVIDENCE_EXPORTED',
    eventVersion: 1,
    defaultSeverity: 'WARNING',
    phiIndicator: false,
    dataClass: 'CONFIDENTIAL',
    retentionClass: 'EXTENDED',
    durabilityClass: 'REQUIRED_DURABLE',
    attributionPolicy: 'HTTP_REQUEST',
    metadataContractId: null,
  },
  {
    category: 'DATA_EXPORT',
    actionCode: 'EVIDENCE_EXPORTED',
    eventVersion: 2,
    defaultSeverity: 'CRITICAL',
    phiIndicator: false,
    dataClass: 'CONFIDENTIAL',
    retentionClass: 'PERMANENT',
    durabilityClass: 'CRITICAL_TRANSACTIONAL',
    attributionPolicy: 'HTTP_REQUEST',
    metadataContractId: null,
  },
];

/**
 * Declared current version per (category, actionCode). Current is DECLARED, not inferred as
 * max — a new version must be explicitly promoted here, which is the single controlled point
 * where "what current means" changes. EVIDENCE_EXPORTED is declared current at v2.
 */
const CURRENT_VERSIONS: Record<AuditEventKey, number> = {
  'AUTHENTICATION:LOGIN_SUCCEEDED': 1,
  'AUTHENTICATION:LOGIN_FAILED': 1,
  'AUTHENTICATION:LOGOUT': 1,
  'PHI_ACCESS:PATIENT_RECORD_VIEWED': 1,
  'PHI_ACCESS:PATIENT_LIST_QUERIED': 1,
  'PHI_ACCESS:PHI_EXPORTED': 1,
  'RECORD_LIFECYCLE:RECORD_STATUS_CHANGED': 1,
  'RECORD_LIFECYCLE:RECORD_CREATED': 1,
  'RECORD_LIFECYCLE:RECORD_UPDATED': 1,
  'RECORD_LIFECYCLE:RECORD_SUBMITTED': 1,
  'DATA_MAINTENANCE:GOVERNED_DELETION_EXECUTED': 1,
  'CONFIGURATION:LAB_FEATURE_TOGGLED': 1,
  'CONFIGURATION:SETTING_CHANGED': 1,
  'ADMINISTRATIVE:ENTITY_CREATED': 1,
  'ADMINISTRATIVE:ENTITY_UPDATED': 1,
  'ADMINISTRATIVE:ENTITY_STATE_CHANGED': 1,
  'ADMINISTRATIVE:ENTITY_DELETED': 1,
  'SYSTEM:JOB_STARTED': 1,
  'SYSTEM:JOB_COMPLETED': 1,
  'DATA_EXPORT:EVIDENCE_EXPORTED': 2,
};

const BY_EXACT: ReadonlyMap<AuditExactKey, AuditRegistryEntry> = new Map(
  ENTRIES.map((e) => [exactKey(e.category, e.actionCode, e.eventVersion), e]),
);

export class UnknownAuditEventError extends Error {
  constructor(category: AuditCategory, actionCode: string) {
    super(
      `Unknown audit event (${category}, ${actionCode}). Producers must reference a ` +
        `registered (category, actionCode); inventing event strings is prohibited by contract.`,
    );
    this.name = 'UnknownAuditEventError';
  }
}

export class UnknownAuditEventVersionError extends Error {
  constructor(category: AuditCategory, actionCode: string, eventVersion: number) {
    super(
      `Unknown audit event version (${category}, ${actionCode}, v${eventVersion}). ` +
        `Historical versions are never removed; an unknown version fails closed.`,
    );
    this.name = 'UnknownAuditEventVersionError';
  }
}

/**
 * Producer convenience: resolve the CURRENT definition. This is what the owner stamps onto a
 * freshly recorded event — the producer never supplies a version.
 */
export function resolveCurrent(
  category: AuditCategory,
  actionCode: string,
): AuditRegistryEntry {
  const version = CURRENT_VERSIONS[eventKey(category, actionCode)];
  if (version === undefined) throw new UnknownAuditEventError(category, actionCode);
  // Invariant: a declared-current version must exist as a registered definition.
  return BY_EXACT.get(exactKey(category, actionCode, version))!;
}

/**
 * Historical / verification path: resolve the EXACT semantic contract for a stored or exported
 * event. Fails closed on an unknown (category, actionCode) or an unknown version.
 */
export function resolveExact(
  category: AuditCategory,
  actionCode: string,
  eventVersion: number,
): AuditRegistryEntry {
  if (CURRENT_VERSIONS[eventKey(category, actionCode)] === undefined) {
    throw new UnknownAuditEventError(category, actionCode);
  }
  const entry = BY_EXACT.get(exactKey(category, actionCode, eventVersion));
  if (!entry) {
    throw new UnknownAuditEventVersionError(category, actionCode, eventVersion);
  }
  return entry;
}

export function isRegisteredAuditEvent(
  category: AuditCategory,
  actionCode: string,
): boolean {
  return CURRENT_VERSIONS[eventKey(category, actionCode)] !== undefined;
}

/** All registered definitions across every version (read-only) — for tests and tooling. */
export function allRegistryEntries(): readonly AuditRegistryEntry[] {
  return ENTRIES;
}
