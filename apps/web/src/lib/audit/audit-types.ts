/**
 * Program 2 · P2-8B — typed mirror of the frozen P2-7 `AuditEventView` (JSON transport shape; dates
 * arrive as ISO strings). The UI consumes ONLY these types + the two frozen endpoints via
 * AuditQueryClient. No backend type is imported; no PHI is synthesized here.
 */
export type AuditQueryScopeKind = 'LAB' | 'SYSTEM' | 'CROSS_LAB';
export type AuditMetadataStatus = 'included' | 'redacted_phi' | 'redacted_unknown_version';

export interface AuditEventView {
  id: string;
  occurredAt: string; // ISO
  recordedAt: string; // ISO
  schemaVersion: number;
  eventVersion: number;
  category: string;
  actionCode: string;
  severity: string;
  dataClass: string;
  phiIndicator: boolean;
  outcome: string;
  actor: { type: string; id: string | null };
  organization: { scope: AuditQueryScopeKind; labId: string | null; organizationId: string | null };
  resource: { type: string; id: string | null };
  request: { requestId: string | null };
  session: { sessionId: string | null };
  correlationId: string | null;
  producerModule: string;
  metadataStatus: AuditMetadataStatus;
  metadata: Record<string, string | number | boolean | null> | null;
  // Present ONLY in the PHI projection (P2-8D surfaces it; P2-8B never renders it).
  patientRef?: string | null;
}

export interface AuditEventPage {
  items: AuditEventView[];
  nextCursor: string | null;
  effective: {
    scope: { kind: AuditQueryScopeKind; labId?: string; labIds?: string[] };
    timeFrom: string;
    timeTo: string;
    pageSize: number;
    phi: boolean;
  };
}

// Allow-listed enum values mirrored from the frozen contract (for filter option lists only).
export const AUDIT_CATEGORIES = [
  'AUTHENTICATION', 'AUTHORIZATION', 'PHI_ACCESS', 'RECORD_LIFECYCLE', 'CLINICAL_WORKFLOW',
  'ADMINISTRATIVE', 'CONFIGURATION', 'DATA_EXPORT', 'SECURITY', 'DATA_MAINTENANCE', 'SYSTEM',
] as const;
export const AUDIT_OUTCOMES = ['SUCCESS', 'FAILURE', 'DENIED', 'ERROR'] as const;
export const AUDIT_ACTOR_TYPES = ['STAFF', 'PORTAL', 'SERVICE', 'SYSTEM', 'ANONYMOUS'] as const;
