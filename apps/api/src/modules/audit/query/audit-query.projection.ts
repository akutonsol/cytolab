/**
 * Program 2 · P2-7A — version-tolerant, PHI-safe projection from a stored row to the public view.
 * Pure: takes a plain row shape (never the Prisma model type is re-exported to consumers) and emits
 * only allow-listed fields. Integrity, PII, hashes, raw metadata, and patientRef are excluded by
 * default; unknown historical versions never throw (metadata is redacted, the row still projects).
 */
import { resolveExact } from '../audit.registry';
import { AuditEventView, AuditEventPhiView } from './audit-query.types';

/**
 * The full stored row (superset). Forbidden fields (hashes/chain/PII) are present here on purpose so
 * the projection provably drops them; they are NEVER copied into a view.
 */
export interface RawAuditEventRow {
  id: string;
  occurredAt: Date;
  recordedAt: Date;
  sequence?: bigint | null;
  schemaVersion: number;
  eventVersion: number;
  category: any;
  severity: string;
  phiIndicator: boolean;
  dataClass: string;
  actorType: any;
  actorId?: string | null;
  onBehalfOfActorId?: string | null;
  servicePrincipal?: string | null;
  organizationScope: any;
  scopeLabId?: string | null;
  organizationId?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  ipAddress?: string | null; // EXCLUDED from views (PII)
  userAgent?: string | null; // EXCLUDED (PII)
  deviceId?: string | null; // EXCLUDED (device fingerprint)
  route?: string | null;
  httpMethod?: string | null;
  sessionId?: string | null;
  sessionKind?: string | null;
  resourceType: string;
  resourceId?: string | null;
  resourceLabId?: string | null;
  parentResourceType?: string | null;
  parentResourceId?: string | null;
  patientRef?: string | null; // PHI — only via the PHI projection
  actionCode: string;
  detailCode?: string | null;
  outcome: any;
  statusCode?: number | null;
  errorCode?: string | null;
  reasonCode?: string | null;
  changedFields?: string[];
  beforeHash?: string | null; // EXCLUDED (hash)
  afterHash?: string | null; // EXCLUDED (hash)
  chainId?: string | null; // EXCLUDED (chain internal)
  prevHash?: string | null; // EXCLUDED (chain internal)
  selfHash?: string | null; // EXCLUDED (chain internal)
  hashAlgorithm?: string | null; // EXCLUDED (chain internal)
  producerModule: string;
  executionId?: string | null;
  metadata?: Record<string, string | number | boolean | null> | null;
}

/**
 * Resolve how metadata may be exposed for this row's exact (category, actionCode, eventVersion):
 *  - unknown version → redacted (never fabricate a classification).
 *  - known + PHI-bearing (phiIndicator) → only under the PHI projection.
 *  - known + non-PHI → the typed bounded payload is safe to include.
 */
function metadataDecision(
  row: RawAuditEventRow,
  includePhi: boolean,
): { status: AuditEventView['metadataStatus']; metadata: AuditEventView['metadata'] } {
  let entryPhi: boolean;
  try {
    entryPhi = resolveExact(row.category, row.actionCode, row.eventVersion).phiIndicator;
  } catch {
    return { status: 'redacted_unknown_version', metadata: null };
  }
  if (entryPhi) {
    return includePhi
      ? { status: 'included', metadata: row.metadata ?? null }
      : { status: 'redacted_phi', metadata: null };
  }
  return { status: 'included', metadata: row.metadata ?? null };
}

/** Project to the safe base view (no patientRef, no PHI metadata). */
export function projectAuditEvent(row: RawAuditEventRow): AuditEventView {
  const md = metadataDecision(row, false);
  return {
    id: row.id,
    occurredAt: row.occurredAt,
    recordedAt: row.recordedAt,
    schemaVersion: row.schemaVersion,
    eventVersion: row.eventVersion,
    category: row.category,
    actionCode: row.actionCode,
    severity: row.severity,
    dataClass: row.dataClass,
    phiIndicator: row.phiIndicator,
    outcome: row.outcome,
    actor: { type: row.actorType, id: row.actorId ?? null },
    organization: {
      scope: row.organizationScope,
      labId: row.scopeLabId ?? null,
      organizationId: row.organizationId ?? null,
    },
    resource: { type: row.resourceType, id: row.resourceId ?? null },
    request: { requestId: row.requestId ?? null },
    session: { sessionId: row.sessionId ?? null },
    correlationId: row.correlationId ?? null,
    producerModule: row.producerModule,
    metadataStatus: md.status,
    metadata: md.metadata,
  };
}

/** Project to the PHI view (adds patientRef + PHI-bearing metadata). Caller must already be PHI-authorized. */
export function projectAuditEventPhi(row: RawAuditEventRow): AuditEventPhiView {
  const base = projectAuditEvent(row);
  const md = metadataDecision(row, true);
  return { ...base, metadataStatus: md.status, metadata: md.metadata, patientRef: row.patientRef ?? null };
}
