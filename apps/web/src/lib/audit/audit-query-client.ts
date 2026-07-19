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

export const AuditQueryClient = {
  /** List audit events under a governed scope + allow-listed filters, keyset-paginated by `cursor`. */
  async list(state: AuditFilterState, cursor: string | null): Promise<AuditEventPage> {
    const params = { ...filtersToApiParams(state), ...(cursor ? { cursor } : {}) };
    const { data } = await api.get<unknown>('/audit/events', { params });
    return validateAuditEventPage(data);
  },
};

export type { AuditEventPage, AuditEventView };
