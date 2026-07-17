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
  | 'phi.access.v1'
  | 'record.status_change.v1'
  | 'maintenance.disposition.v1'
  | 'config.setting_change.v1';

export type AuditMetadataScalar = string | number | boolean | null;
export type AuditMetadataValue = Record<string, AuditMetadataScalar>;

type FieldKind = 'string' | 'number' | 'boolean';
interface FieldSpec {
  kind: FieldKind;
  required?: boolean;
  maxLength?: number; // strings only
}

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
