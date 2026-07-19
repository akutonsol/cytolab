/**
 * Program 2 · P2-8B — pure filter model for the Audit Event List. Filters live in the URL; these
 * helpers parse/serialize them and produce the exact allow-listed API param object. There is NO
 * free-text/metadata/patient search and NO client-side filtering — the server is authoritative.
 * Bounds mirror the frozen P2-7 validator (advisory on the client; the API re-enforces).
 */
import type { AuditQueryScopeKind } from './audit-types';
import type { AuditExportFormat, AuditExportProjection } from './audit-export';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const MAX_MULTI_VALUES = 25;
export const MAX_LOOKBACK_DAYS = 31;

/** URL-/state-backed filter shape. `cursor` is NOT part of this — it is separate (keyset paging). */
export interface AuditFilterState {
  scope?: AuditQueryScopeKind; // only meaningful for audit:read_system holders
  labIds?: string[];
  category?: string[];
  actionCode?: string[];
  actorType?: string;
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
  outcome?: string;
  correlationId?: string;
  timeFrom?: string; // ISO
  timeTo?: string; // ISO
  pageSize: number;
  phi: boolean;
}

const SCOPE_FROM_URL: Record<string, AuditQueryScopeKind> = { lab: 'LAB', system: 'SYSTEM', cross_lab: 'CROSS_LAB' };
const SCOPE_TO_URL: Record<AuditQueryScopeKind, string> = { LAB: 'lab', SYSTEM: 'system', CROSS_LAB: 'cross_lab' };

const csvToArray = (v: string | null): string[] | undefined => {
  if (!v) return undefined;
  const parts = v.split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_MULTI_VALUES);
  return parts.length ? parts : undefined;
};

const clampPageSize = (raw: string | null): number => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
};

/** Read a normalized filter state from URL search params. Unknown params are ignored. */
export function parseAuditFilters(sp: URLSearchParams): AuditFilterState {
  const scopeRaw = (sp.get('scope') ?? '').toLowerCase();
  return {
    scope: SCOPE_FROM_URL[scopeRaw],
    labIds: csvToArray(sp.get('labIds')),
    category: csvToArray(sp.get('category')),
    actionCode: csvToArray(sp.get('action')),
    actorType: sp.get('actorType') || undefined,
    actorId: sp.get('actorId') || undefined,
    resourceType: sp.get('resourceType') || undefined,
    resourceId: sp.get('resourceId') || undefined,
    outcome: sp.get('outcome') || undefined,
    correlationId: sp.get('correlationId') || undefined,
    timeFrom: sp.get('from') || undefined,
    timeTo: sp.get('to') || undefined,
    pageSize: clampPageSize(sp.get('pageSize')),
    phi: sp.get('phi') === '1',
  };
}

/** Serialize a filter state back to URL params (omitting empties + defaults). Cursor is added by the page. */
export function serializeAuditFilters(state: AuditFilterState): Record<string, string> {
  const out: Record<string, string> = {};
  if (state.scope) out.scope = SCOPE_TO_URL[state.scope];
  if (state.labIds?.length) out.labIds = state.labIds.join(',');
  if (state.category?.length) out.category = state.category.join(',');
  if (state.actionCode?.length) out.action = state.actionCode.join(',');
  if (state.actorType) out.actorType = state.actorType;
  if (state.actorId) out.actorId = state.actorId;
  if (state.resourceType) out.resourceType = state.resourceType;
  if (state.resourceId) out.resourceId = state.resourceId;
  if (state.outcome) out.outcome = state.outcome;
  if (state.correlationId) out.correlationId = state.correlationId;
  if (state.timeFrom) out.from = state.timeFrom;
  if (state.timeTo) out.to = state.timeTo;
  if (state.pageSize !== DEFAULT_PAGE_SIZE) out.pageSize = String(state.pageSize);
  if (state.phi) out.phi = '1';
  return out;
}

/** The exact allow-listed API params for GET /audit/events (CSV joins, lowercase scope, includePhi). */
export function filtersToApiParams(state: AuditFilterState): Record<string, string> {
  const p: Record<string, string> = { pageSize: String(state.pageSize) };
  if (state.scope) p.scope = SCOPE_TO_URL[state.scope];
  if (state.labIds?.length) p.labIds = state.labIds.join(',');
  if (state.category?.length) p.category = state.category.join(',');
  if (state.actionCode?.length) p.actionCode = state.actionCode.join(',');
  if (state.actorType) p.actorType = state.actorType;
  if (state.actorId) p.actorId = state.actorId;
  if (state.resourceType) p.resourceType = state.resourceType;
  if (state.resourceId) p.resourceId = state.resourceId;
  if (state.outcome) p.outcome = state.outcome;
  if (state.correlationId) p.correlationId = state.correlationId;
  if (state.timeFrom) p.timeFrom = state.timeFrom;
  if (state.timeTo) p.timeTo = state.timeTo;
  if (state.phi) p.includePhi = 'true';
  return p;
}

/**
 * A stable key for the query PREDICATE (everything except the cursor). Changing any predicate value
 * must invalidate the cursor stack and mint a new query key — this string drives both.
 */
export function auditPredicateKey(state: AuditFilterState): string {
  return JSON.stringify(serializeAuditFilters(state));
}

/** POST body for the governed export endpoint — the same predicate contract as GET /audit/events. */
export interface AuditExportBody {
  timeFrom?: string;
  timeTo?: string;
  category?: string[];
  actionCode?: string[];
  actorType?: string;
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
  outcome?: string;
  correlationId?: string;
  scope?: 'lab' | 'system' | 'cross_lab';
  labIds?: string[];
  format: AuditExportFormat;
  projection: AuditExportProjection;
}

/**
 * Program 2 · P2-9B — map the CURRENT list predicate + explicit format/projection to the export POST
 * body. Reuses this module's field set + scope mapping (NOT a second parser). Deliberately EXCLUDES:
 *   - `cursor`  — not part of the predicate; the server owns bounded assembly;
 *   - `pageSize`— the server controls the export page size and cap;
 *   - `phi`     — the export projection is an EXPLICIT choice, never inherited from the list toggle.
 * `projection` is the single source of truth for whether PHI leaves.
 */
export function filtersToExportBody(
  state: AuditFilterState,
  opts: { format: AuditExportFormat; projection: AuditExportProjection },
): AuditExportBody {
  const b: AuditExportBody = { format: opts.format, projection: opts.projection };
  if (state.scope) b.scope = SCOPE_TO_URL[state.scope] as AuditExportBody['scope'];
  if (state.labIds?.length) b.labIds = state.labIds.slice(0, MAX_MULTI_VALUES);
  if (state.category?.length) b.category = state.category.slice(0, MAX_MULTI_VALUES);
  if (state.actionCode?.length) b.actionCode = state.actionCode.slice(0, MAX_MULTI_VALUES);
  if (state.actorType) b.actorType = state.actorType;
  if (state.actorId) b.actorId = state.actorId;
  if (state.resourceType) b.resourceType = state.resourceType;
  if (state.resourceId) b.resourceId = state.resourceId;
  if (state.outcome) b.outcome = state.outcome;
  if (state.correlationId) b.correlationId = state.correlationId;
  if (state.timeFrom) b.timeFrom = state.timeFrom;
  if (state.timeTo) b.timeTo = state.timeTo;
  return b;
}
