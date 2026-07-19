/**
 * Program 2 · P2-8B — AuditQueryClient: the FROZEN, single transport boundary for the Audit UI.
 * It is the ONLY module allowed to talk to `GET /api/v1/audit/events`. Responsibilities: normalize
 * the filter state → allow-listed params, invoke the endpoint, validate the response shape, and
 * return a typed AuditEventPage. No component or hook may call `api`/`fetch` directly; none derives
 * authorization (the server is authoritative — 403/404 flow back as errors).
 */
import { api } from '../api';
import type { AuditEventPage, AuditEventView } from './audit-types';
import { AuditFilterState, filtersToApiParams } from './audit-filters';

export class AuditQueryResponseError extends Error {
  constructor(message: string) {
    super(`Malformed audit query response: ${message}`);
    this.name = 'AuditQueryResponseError';
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Validate the endpoint payload into a typed page; throws on a shape mismatch (fail visibly, never guess). */
export function validateAuditEventPage(data: unknown): AuditEventPage {
  if (!isObj(data)) throw new AuditQueryResponseError('not an object');
  if (!Array.isArray(data.items)) throw new AuditQueryResponseError('items is not an array');
  const nextCursor = data.nextCursor;
  if (nextCursor !== null && typeof nextCursor !== 'string') {
    throw new AuditQueryResponseError('nextCursor must be string | null');
  }
  for (const it of data.items) {
    if (!isObj(it) || typeof it.id !== 'string' || typeof it.category !== 'string' || !isObj(it.actor)) {
      throw new AuditQueryResponseError('malformed item envelope');
    }
  }
  return data as unknown as AuditEventPage;
}

/** Validate a single detail response into a typed view (symmetric with validateAuditEventPage). */
export function validateAuditEvent(data: unknown): AuditEventView {
  if (!isObj(data)) throw new AuditQueryResponseError('event is not an object');
  const s = (k: string) => typeof data[k] === 'string';
  const n = (k: string) => typeof data[k] === 'number';
  const nullableStr = (v: unknown) => v === null || typeof v === 'string';
  if (!(s('id') && s('occurredAt') && s('recordedAt') && s('category') && s('actionCode') && s('severity') && s('dataClass') && s('outcome') && s('producerModule'))) {
    throw new AuditQueryResponseError('missing/!string envelope field');
  }
  if (!(n('schemaVersion') && n('eventVersion'))) throw new AuditQueryResponseError('missing/!number version');
  if (typeof data.phiIndicator !== 'boolean') throw new AuditQueryResponseError('phiIndicator must be boolean');
  if (!['included', 'redacted_phi', 'redacted_unknown_version'].includes(data.metadataStatus as string)) {
    throw new AuditQueryResponseError('invalid metadataStatus');
  }
  if (!(data.metadata === null || isObj(data.metadata))) throw new AuditQueryResponseError('metadata must be object|null');
  const actor = data.actor, org = data.organization, res = data.resource, req = data.request, sess = data.session;
  if (!isObj(actor) || typeof actor.type !== 'string' || !nullableStr(actor.id)) throw new AuditQueryResponseError('malformed actor');
  if (!isObj(org) || typeof org.scope !== 'string' || !nullableStr(org.labId) || !nullableStr(org.organizationId)) throw new AuditQueryResponseError('malformed organization');
  if (!isObj(res) || typeof res.type !== 'string' || !nullableStr(res.id)) throw new AuditQueryResponseError('malformed resource');
  if (!isObj(req) || !nullableStr(req.requestId)) throw new AuditQueryResponseError('malformed request');
  if (!isObj(sess) || !nullableStr(sess.sessionId)) throw new AuditQueryResponseError('malformed session');
  if (!nullableStr(data.correlationId)) throw new AuditQueryResponseError('malformed correlationId');
  // patientRef is validated ONLY when present (never synthesized/inferred).
  if ('patientRef' in data && !nullableStr(data.patientRef)) throw new AuditQueryResponseError('malformed patientRef');
  return data as unknown as AuditEventView;
}

export const AuditQueryClient = {
  /** List audit events under a governed scope + allow-listed filters, keyset-paginated by `cursor`. */
  async list(state: AuditFilterState, cursor: string | null): Promise<AuditEventPage> {
    const params = { ...filtersToApiParams(state), ...(cursor ? { cursor } : {}) };
    const { data } = await api.get<unknown>('/audit/events', { params });
    return validateAuditEventPage(data);
  },

  /** Fetch one audit event by id under the same scope + PHI policy as list (server-authoritative). */
  async getById(id: string, phi: boolean): Promise<AuditEventView> {
    const params = phi ? { includePhi: 'true' } : {};
    const { data } = await api.get<unknown>(`/audit/events/${encodeURIComponent(id)}`, { params });
    return validateAuditEvent(data);
  },
};

export type { AuditEventPage, AuditEventView };
