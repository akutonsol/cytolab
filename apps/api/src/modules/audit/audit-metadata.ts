/**
 * Program 2 · P2-1 — Typed, bounded audit metadata (contract §11).
 *
 * STORAGE DECISION (recorded here and in the deliverable): the persistence column is a
 * nullable `Json` for forward-compatible, event-specific evolution — BUT it is NOT an
 * unrestricted map. Every write passes through {@link validateMetadata}, which enforces a
 * per-event typed contract resolved from the registry (`metadataContractId`):
 *   - only declared keys are allowed (no arbitrary keys);
 *   - values are scalars (string | number | boolean | null) — no nested objects/arrays
 *     that could smuggle a PHI-bearing payload;
 *   - string values are length-bounded and rejected if they look like free-text prose or
 *     direct identifiers (email / long free text). This is defense-in-depth, not the
 *     primary control; the primary control is the closed key set.
 *
 * Enforcement of this boundary at capture time is wired in P2-3; P2-1 defines the boundary
 * and proves it with tests. The guarantee is "prohibited by contract now", not yet
 * "impossible by construction".
 */

export type AuditMetadataContractId =
  | 'phi.access.v1' // retired from active registry use (P2-5B); kept as a historical definition
  | 'phi.access.v2'
  | 'record.status_change.v1'
  | 'maintenance.disposition.v1'
  | 'config.setting_change.v1'
  | 'admin.state_change.v1' // P2-6C — administrative activation/block state transitions
  | 'authz.role_assignment.v1' // P2-6D — role-set replacement on a principal (counts only)
  | 'security.session_termination.v1' // P2-6E — administrative session termination (scope + count)
  | 'security.ip_block.v1'; // P2-6E — administrative IP block add (durability flag only)

export type AuditMetadataScalar = string | number | boolean | null;
export type AuditMetadataValue = Record<string, AuditMetadataScalar>;

type FieldKind = 'string' | 'number' | 'boolean';
interface FieldSpec {
  kind: FieldKind;
  required?: boolean;
  maxLength?: number; // strings only
  values?: readonly string[]; // strings: closed, bounded enum (P2-5B) — the primary guard
  min?: number; // numbers only
  max?: number; // numbers only
  integer?: boolean; // numbers only
}

// ---------------------------------------------------------------------------
// P2-5B — bounded enums for the PHI-access metadata contract (phi.access.v2).
// Exported so future producers (P2-5C/D) and tests reference constants, never string
// literals. Every value is a short, non-PHI code — no names, DOB, MRN, or free text.
// ---------------------------------------------------------------------------
export const PHI_ACCESS_SURFACES = [
  'patient_detail',
  'record_detail',
  'result_sheet',
  'report_pdf',
  'sign_out_case',
  'diagnostic_case',
  'slide',
  'coding',
  'list',
  'search',
  'export',
] as const;
export const PHI_ACCESS_MODES = ['view', 'download', 'print', 'export'] as const;
export const PHI_DOCUMENT_TYPES = [
  'report',
  'result_sheet',
  'slide',
  'attachment',
  'coding',
  'patient',
  'record',
  'none',
] as const;
export const PHI_FILTER_CLASSES = ['none', 'status', 'date_range', 'client', 'patient', 'text', 'mixed'] as const;
export const PHI_REDACTION_STATES = ['none', 'partial', 'redacted'] as const;
export const PHI_REASON_CODES = [
  'clinical_review',
  'quality_control',
  'billing',
  'administrative',
  'correction',
  'disclosure',
] as const;
export const PHI_PRODUCER_MODULES = [
  'patients',
  'records',
  'result-sheets',
  'reports',
  'signout',
  'diagnostic-case',
  'bethesda',
  'wsi',
  'coding',
  'search',
  'files',
  'portal',
] as const;

// ---------------------------------------------------------------------------
// P2-6C — bounded state-key enum for the administrative state-change contract
// (admin.state_change.v1). Each value names the boolean flag whose transition is being
// recorded — never a value, secret, or free text. Exported so owners/tests reference the
// constant, never a string literal.
// ---------------------------------------------------------------------------
export const ADMIN_STATE_KEYS = [
  'account_active', // User.isActive — activation/deactivation of a staff login
  'client_active', // Client.active — client activation/deactivation
  'client_blocked', // Client.blocked — client block/unblock
  'lab_active', // Lab activation flag (reserved; no owner emits it in P2-6C)
] as const;
export type AdminStateKey = (typeof ADMIN_STATE_KEYS)[number];

// P2-6E — bounded scope enum for administrative session termination. `single` = one session;
// `all` = every active session for a user. Never a session id or token.
export const SESSION_TERMINATION_SCOPES = ['single', 'all'] as const;
export type SessionTerminationScope = (typeof SESSION_TERMINATION_SCOPES)[number];

// Member types for typed producer/owner call sites (P2-5C).
export type PhiAccessSurface = (typeof PHI_ACCESS_SURFACES)[number];
export type PhiAccessMode = (typeof PHI_ACCESS_MODES)[number];
export type PhiDocumentType = (typeof PHI_DOCUMENT_TYPES)[number];
export type PhiFilterClass = (typeof PHI_FILTER_CLASSES)[number];
export type PhiRedactionState = (typeof PHI_REDACTION_STATES)[number];
export type PhiReasonCode = (typeof PHI_REASON_CODES)[number];
export type PhiProducerModule = (typeof PHI_PRODUCER_MODULES)[number];

interface MetadataContract {
  id: AuditMetadataContractId;
  fields: Record<string, FieldSpec>;
}

const MAX_STRING = 128;

const CONTRACTS: Record<AuditMetadataContractId, MetadataContract> = {
  'phi.access.v1': {
    id: 'phi.access.v1',
    fields: {
      accessReason: { kind: 'string', required: true, maxLength: 64 },
      viewScope: { kind: 'string', maxLength: 32 }, // e.g. "summary" | "full"
    },
  },
  'record.status_change.v1': {
    id: 'record.status_change.v1',
    fields: {
      fromStatus: { kind: 'string', required: true, maxLength: 32 },
      toStatus: { kind: 'string', required: true, maxLength: 32 },
    },
  },
  'maintenance.disposition.v1': {
    id: 'maintenance.disposition.v1',
    fields: {
      operation: { kind: 'string', required: true, maxLength: 48 },
      affectedCount: { kind: 'number', required: true },
      approvalReference: { kind: 'string', required: true, maxLength: 96 },
    },
  },
  'config.setting_change.v1': {
    id: 'config.setting_change.v1',
    fields: {
      settingKey: { kind: 'string', required: true, maxLength: 64 },
      scope: { kind: 'string', maxLength: 24 }, // e.g. "lab" | "system"
    },
  },
  // P2-6C — administrative activation/block state transitions. Bounded state key + before/after
  // booleans ONLY. No entity attribute values, names, PHI, or free text.
  'admin.state_change.v1': {
    id: 'admin.state_change.v1',
    fields: {
      stateKey: { kind: 'string', required: true, values: ADMIN_STATE_KEYS },
      previousValue: { kind: 'boolean' }, // prior flag value, when known
      newValue: { kind: 'boolean', required: true },
    },
  },
  // P2-6D — role-set replacement on a principal. COUNTS ONLY — never role ids, role names,
  // permission lists, user names, or free text (the scalar-only rule forbids arrays outright).
  'authz.role_assignment.v1': {
    id: 'authz.role_assignment.v1',
    fields: {
      rolesAddedCount: { kind: 'number', required: true, integer: true, min: 0 },
      rolesRemovedCount: { kind: 'number', required: true, integer: true, min: 0 },
      resultingRoleCount: { kind: 'number', integer: true, min: 0 }, // optional
    },
  },
  // P2-6E — administrative session termination. Bounded scope + non-negative count ONLY. Never a
  // session id, token, user name, IP, or free text.
  'security.session_termination.v1': {
    id: 'security.session_termination.v1',
    fields: {
      terminationScope: { kind: 'string', required: true, values: SESSION_TERMINATION_SCOPES },
      terminatedCount: { kind: 'number', required: true, integer: true, min: 0 },
    },
  },
  // P2-6E — administrative IP block add. Durability flag ONLY. NEVER the raw IP, block reason,
  // notes, or request source.
  'security.ip_block.v1': {
    id: 'security.ip_block.v1',
    fields: {
      permanent: { kind: 'boolean', required: true },
    },
  },
  // P2-5B — PHI-access metadata: bounded enums + counts only. No free text, no reason prompt,
  // no raw search terms, no patient identifiers. accessSurface + accessMode + producerModule are
  // required; the rest are optional bounded fields.
  'phi.access.v2': {
    id: 'phi.access.v2',
    fields: {
      accessSurface: { kind: 'string', required: true, values: PHI_ACCESS_SURFACES },
      accessMode: { kind: 'string', required: true, values: PHI_ACCESS_MODES },
      producerModule: { kind: 'string', required: true, values: PHI_PRODUCER_MODULES },
      documentType: { kind: 'string', values: PHI_DOCUMENT_TYPES },
      resultCount: { kind: 'number', min: 0, integer: true },
      pageSize: { kind: 'number', min: 1, max: 1000, integer: true },
      filterClass: { kind: 'string', values: PHI_FILTER_CLASSES },
      redactionState: { kind: 'string', values: PHI_REDACTION_STATES },
      reasonCode: { kind: 'string', values: PHI_REASON_CODES },
    },
  },
};

export class InvalidAuditMetadataError extends Error {
  constructor(message: string) {
    super(`Invalid audit metadata: ${message}`);
    this.name = 'InvalidAuditMetadataError';
  }
}

// Heuristics that flag likely free-text prose or a direct identifier. Not exhaustive —
// the closed key set + scalar-only rule is the real guard; this catches obvious misuse.
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const looksLikeFreeText = (v: string): boolean =>
  v.length > MAX_STRING || EMAIL_RE.test(v) || v.trim().split(/\s+/).length > 12;

/**
 * Validate a metadata payload against its event's declared contract. Throws on any
 * undeclared key, wrong scalar type, over-length string, or free-text/identifier smell.
 * `contractId === null` means the event declares no metadata: any payload is rejected.
 */
export function validateMetadata(
  contractId: AuditMetadataContractId | null,
  value: AuditMetadataValue | undefined,
): AuditMetadataValue | null {
  if (contractId === null) {
    if (value && Object.keys(value).length > 0) {
      throw new InvalidAuditMetadataError(
        'event declares no metadata contract but a payload was supplied',
      );
    }
    return null;
  }

  const contract = CONTRACTS[contractId];
  const payload = value ?? {};

  for (const key of Object.keys(payload)) {
    const spec = contract.fields[key];
    if (!spec) {
      throw new InvalidAuditMetadataError(
        `undeclared key "${key}" for contract ${contractId}`,
      );
    }
    const v = payload[key];
    if (v === null) continue;
    if (spec.kind === 'string') {
      if (typeof v !== 'string') {
        throw new InvalidAuditMetadataError(`key "${key}" must be a string`);
      }
      if (spec.values && !spec.values.includes(v)) {
        // Closed enum is the primary guard — anything outside it (incl. raw search terms or
        // identifiers) is rejected without relying on a heuristic.
        throw new InvalidAuditMetadataError(
          `key "${key}" is not an allowed value`,
        );
      }
      if (spec.maxLength && v.length > spec.maxLength) {
        throw new InvalidAuditMetadataError(
          `key "${key}" exceeds ${spec.maxLength} chars`,
        );
      }
      if (looksLikeFreeText(v)) {
        throw new InvalidAuditMetadataError(
          `key "${key}" looks like free text or a direct identifier; only bounded codes are allowed`,
        );
      }
    } else if (spec.kind === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new InvalidAuditMetadataError(`key "${key}" must be a finite number`);
      }
      if (spec.integer && !Number.isInteger(v)) {
        throw new InvalidAuditMetadataError(`key "${key}" must be an integer`);
      }
      if (spec.min !== undefined && v < spec.min) {
        throw new InvalidAuditMetadataError(`key "${key}" must be >= ${spec.min}`);
      }
      if (spec.max !== undefined && v > spec.max) {
        throw new InvalidAuditMetadataError(`key "${key}" must be <= ${spec.max}`);
      }
    } else if (spec.kind === 'boolean') {
      if (typeof v !== 'boolean') {
        throw new InvalidAuditMetadataError(`key "${key}" must be a boolean`);
      }
    }
  }

  for (const [key, spec] of Object.entries(contract.fields)) {
    if (spec.required && (payload[key] === undefined || payload[key] === null)) {
      throw new InvalidAuditMetadataError(
        `missing required key "${key}" for contract ${contractId}`,
      );
    }
  }

  return payload;
}
