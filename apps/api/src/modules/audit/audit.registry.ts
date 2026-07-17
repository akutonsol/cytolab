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
    durabilityClass: 'REQUIRED_DURABLE',
    attributionPolicy: 'HTTP_REQUEST',
    metadataContractId: null,
  },
  {
    category: 'PHI_ACCESS',
    actionCode: 'PATIENT_RECORD_VIEWED',
    eventVersion: 1,
    defaultSeverity: 'NOTICE',
    phiIndicator: true,
    dataClass: 'PHI',
    retentionClass: 'PERMANENT',
    durabilityClass: 'CRITICAL_TRANSACTIONAL',
    attributionPolicy: 'HTTP_REQUEST',
    metadataContractId: 'phi.access.v1',
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
  'PHI_ACCESS:PATIENT_RECORD_VIEWED': 1,
  'RECORD_LIFECYCLE:RECORD_STATUS_CHANGED': 1,
  'DATA_MAINTENANCE:GOVERNED_DELETION_EXECUTED': 1,
  'CONFIGURATION:LAB_FEATURE_TOGGLED': 1,
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
