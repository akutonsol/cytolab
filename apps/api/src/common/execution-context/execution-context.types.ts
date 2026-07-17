/**
 * Program 2 · P2-2 — Execution attribution types (transport-agnostic).
 *
 * These describe the trusted attribution that every execution carries so a future audit
 * event (P2-3) can inherit it automatically. They are attribution ONLY — they never
 * determine permissions. They deliberately do NOT depend on the Audit module; P2-3 maps
 * these onto the AuditRecordInput contract. The unions mirror the audit contract's values
 * by intent, but the layering stays one-directional (audit may read attribution, attribution
 * never reads audit).
 *
 * No PHI: nothing here may hold patient names, accession numbers, diagnoses, reports,
 * request bodies, or any clinical payload — only opaque attribution.
 */

/** Where an execution originated. `requestId` is transport-specific; correlationId is universal. */
export type ExecutionSource = 'http' | 'portal' | 'job' | 'system';

export type ExecutionActorType =
  | 'STAFF'
  | 'PORTAL'
  | 'SERVICE'
  | 'SYSTEM'
  | 'ANONYMOUS';

export type ExecutionOrgScope = 'LAB' | 'SYSTEM' | 'CROSS_LAB';

export interface ExecutionOrganization {
  scope: ExecutionOrgScope;
  labId?: string;
  organizationId?: string;
}

export interface ExecutionActor {
  actorType: ExecutionActorType;
  actorId?: string;
  /** Set only for genuine delegation; the real actor is retained. */
  onBehalfOfActorId?: string;
  servicePrincipal?: string;
}

/** Transport (HTTP/portal) request fingerprint. Absent for jobs and system executions. */
export interface ExecutionRequest {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
  /** Normalized route TEMPLATE (e.g. /records/:id) — never a concrete URL with ids. */
  apiRoute?: string;
  httpMethod?: string;
}

export interface ExecutionSession {
  sessionId?: string;
  sessionKind?: string;
}

export interface ExecutionMeta {
  executionId?: string;
  jobName?: string;
  source: ExecutionSource;
}

/**
 * The structured attribution stored on the shared AsyncLocalStorage tenant store. A single
 * platform-controlled `correlationId` spans the whole execution (HTTP request, job, or nested
 * child); `request.requestId` is transport-specific and present only for HTTP/portal.
 */
export interface ExecutionAttribution {
  correlationId: string;
  organization?: ExecutionOrganization;
  actor?: ExecutionActor;
  request?: ExecutionRequest;
  session?: ExecutionSession;
  execution: ExecutionMeta;
}

/** A minimal principal shape as populated on `request.user` by the JWT strategies. */
export interface PrincipalLike {
  kind?: 'staff' | 'portal' | 'service' | 'system';
  userId?: string;
  portalUserId?: string;
  servicePrincipal?: string;
  labId?: string;
  clientId?: string;
  sessionId?: string;
}
