/**
 * Program 2 · P2-7A — audit-query domain types (CONTRACT only; no persistence, no Prisma coupling).
 */
import { AuditCategory, AuditOrganizationScope, AuditActorType, AuditOutcome } from '../audit.contract';

/** The authenticated reader, as the owner derives it from the execution context (never the body). */
export interface AuditReaderPrincipal {
  /** The reader's own lab, from the authenticated context. Absent for a lab-less principal. */
  labId?: string | null;
  permissions: readonly string[];
  isSuperRole?: boolean;
}

/**
 * Resolved query scope (discriminated union). Produced ONLY by the policy resolver from the
 * principal + an explicit request — never accepted verbatim from the HTTP caller. Each maps to a
 * bounded set of stored rows (see audit-query.policy §row-matching):
 *   LAB{labId}       → organizationScope = LAB   AND scopeLabId = labId
 *   SYSTEM           → organizationScope IN (SYSTEM, CROSS_LAB)   (these rows carry scopeLabId = null)
 *   CROSS_LAB{labIds}→ organizationScope = LAB   AND scopeLabId IN labIds
 */
export type ResolvedAuditScope =
  | { kind: 'LAB'; labId: string }
  | { kind: 'SYSTEM' }
  | { kind: 'CROSS_LAB'; labIds: readonly string[] };

/** What a caller may ASK for (validated against permissions by the resolver). */
export interface RequestedAuditScope {
  scope?: 'LAB' | 'SYSTEM' | 'CROSS_LAB';
  /** SYSTEM-authorized requests only; a LAB reader may never select another lab. */
  labIds?: readonly string[];
}

/** Safe base projection (non-PHI). Field names/shape are the public contract. */
export interface AuditEventView {
  id: string;
  occurredAt: Date;
  recordedAt: Date;
  schemaVersion: number;
  eventVersion: number;
  category: AuditCategory;
  actionCode: string;
  severity: string;
  dataClass: string;
  phiIndicator: boolean;
  outcome: AuditOutcome;
  actor: { type: AuditActorType; id: string | null };
  organization: { scope: AuditOrganizationScope; labId: string | null; organizationId: string | null };
  resource: { type: string; id: string | null };
  request: { requestId: string | null };
  session: { sessionId: string | null };
  correlationId: string | null;
  producerModule: string;
  /**
   * Metadata is version-tolerant + policy-gated:
   *  - 'included'  → a known, non-PHI registry contract; `metadata` is the typed bounded payload.
   *  - 'redacted_phi' → a known PHI-bearing contract; withheld unless the PHI projection is used.
   *  - 'redacted_unknown_version' → the (category, actionCode, eventVersion) is not in the registry.
   */
  metadataStatus: 'included' | 'redacted_phi' | 'redacted_unknown_version';
  metadata: Record<string, string | number | boolean | null> | null;
}

/** PHI projection: the base view plus the pseudonymous patientRef and any PHI-bearing metadata. */
export interface AuditEventPhiView extends AuditEventView {
  patientRef: string | null;
}

export interface AuditEventPage<T extends AuditEventView = AuditEventView> {
  items: T[];
  nextCursor: string | null;
  effective: {
    scope: ResolvedAuditScope;
    timeFrom: Date;
    timeTo: Date;
    pageSize: number;
    phi: boolean;
  };
}
