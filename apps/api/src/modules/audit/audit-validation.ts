/**
 * Program 2 · P2-1 — Envelope validation boundary (scope invariants + change evidence).
 *
 * These guards enforce contract §5/§7 at the Audit owner boundary. They are pure and
 * synchronous so they can run inside the future capture transaction (P2-3) without I/O.
 */
import {
  AuditChangeInput,
  AuditOrganizationInput,
} from './audit.contract';

export class AuditScopeError extends Error {
  constructor(message: string) {
    super(`Audit scope invariant violated: ${message}`);
    this.name = 'AuditScopeError';
  }
}

export class AuditChangeEvidenceError extends Error {
  constructor(message: string) {
    super(`Audit change-evidence invalid: ${message}`);
    this.name = 'AuditChangeEvidenceError';
  }
}

/**
 * Organization scope invariants (contract §5, P2-1 requirement 3):
 *   LAB       → labId REQUIRED
 *   SYSTEM    → labId ABSENT (no sentinel tenant)
 *   CROSS_LAB → labId ABSENT (spans labs; never masquerades as one)
 */
export function assertOrganizationScope(org: AuditOrganizationInput): void {
  const hasLab = org.labId !== undefined && org.labId !== null && org.labId !== '';
  if (org.scope === 'LAB') {
    if (!hasLab) throw new AuditScopeError('LAB scope requires a labId');
  } else {
    if (hasLab) {
      throw new AuditScopeError(
        `${org.scope} scope must not carry a labId (no sentinel tenant)`,
      );
    }
  }
}

// A change-evidence entry must be a bare field NAME: a bounded identifier/path, never a
// value. This blocks the obvious "changedFields: ['diagnosis: cancer']" misuse that would
// leak content into the audit trail.
const FIELD_NAME_RE = /^[A-Za-z_][A-Za-z0-9_.[\]]*$/;
const MAX_FIELD_NAME = 64;

/**
 * Change evidence must be NAMES AND HASHES ONLY (contract §7, P2-1 requirement 7).
 * Rejects value-bearing entries, over-long tokens, and duplicates. Raw before/after
 * values have no field to live in — only their hashes do.
 */
export function validateChangeEvidence(change?: AuditChangeInput): void {
  if (!change) return;
  const fields = change.changedFields ?? [];
  const seen = new Set<string>();
  for (const f of fields) {
    if (typeof f !== 'string' || f.length === 0 || f.length > MAX_FIELD_NAME) {
      throw new AuditChangeEvidenceError(
        `changedFields entry must be a 1..${MAX_FIELD_NAME} char field name`,
      );
    }
    if (!FIELD_NAME_RE.test(f)) {
      throw new AuditChangeEvidenceError(
        `changedFields entry "${f}" is not a bare field name (values are prohibited)`,
      );
    }
    if (seen.has(f)) {
      throw new AuditChangeEvidenceError(`duplicate changed field "${f}"`);
    }
    seen.add(f);
  }
  for (const [label, h] of [
    ['beforeHash', change.beforeHash],
    ['afterHash', change.afterHash],
  ] as const) {
    if (h !== undefined && h !== null && !/^[a-f0-9]{64}$/.test(h)) {
      throw new AuditChangeEvidenceError(
        `${label} must be a SHA-256 hex digest (raw values are prohibited)`,
      );
    }
  }
}
