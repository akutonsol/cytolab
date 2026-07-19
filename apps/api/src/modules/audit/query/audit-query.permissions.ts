/**
 * Program 2 · P2-7A — audit-query permission gates (CONTRACT; PROPOSED catalog additions).
 *
 * GAP: no existing permission governs audit-ledger READ access. The catalog (prisma/seed.ts) has no
 * `audit` object; `system:security` governs the Security Center (sessions/IPs/alerts/MFA admin), NOT
 * the immutable audit ledger, so reusing it would be misleading. These three semantic gates are
 * therefore NEW and defined here as the query contract. Registering them in the seed catalog
 * (SPECIAL_OBJECTS.audit = ['read','read_system','read_phi']) is an ADDITIVE governance change that
 * REQUIRES architectural approval before P2-7B wiring — it is intentionally NOT performed in P2-7A.
 *
 * The three gates are INDEPENDENT dimensions (scope ≠ PHI): SYSTEM read does not imply PHI read.
 */
export const AUDIT_READ = 'audit:read' as const; // lab-scoped ledger read (own lab only)
export const AUDIT_SYSTEM_READ = 'audit:read_system' as const; // SYSTEM/CROSS_LAB + other-lab visibility
export const AUDIT_PHI_READ = 'audit:read_phi' as const; // patientRef + PHI-bearing metadata projection

export type AuditQueryPermission =
  | typeof AUDIT_READ
  | typeof AUDIT_SYSTEM_READ
  | typeof AUDIT_PHI_READ;

/** Proposed seed-catalog change (for the deliverable / P2-7B), not applied here. */
export const PROPOSED_AUDIT_CATALOG = {
  object: 'audit',
  actions: ['read', 'read_system', 'read_phi'],
} as const;
