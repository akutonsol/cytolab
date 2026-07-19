/**
 * Program 2 · P2-7A — typed, allow-listed audit-query filter contract (pure validation; no Prisma).
 * No free-text / metadata / JSON-path / patientRef / hash / IP / token search. A bounded time range
 * is always enforced. `now` is injected for determinism (no Date.now at the contract boundary).
 */
import { BadRequestException } from '@nestjs/common';
import { AuditCategory, AuditActorType, AuditOutcome } from '../audit.contract';

export const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000; // 24h
export const MAX_LOOKBACK_MS = 31 * 24 * 60 * 60 * 1000; // 31d
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
export const MAX_FILTER_VALUES = 25;

/** Raw filters as they arrive (already coarse-validated by a DTO in P2-7B); all optional. */
export interface RawAuditQueryFilters {
  timeFrom?: string | Date;
  timeTo?: string | Date;
  category?: AuditCategory[];
  actionCode?: string[];
  actorType?: AuditActorType;
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
  outcome?: AuditOutcome;
  correlationId?: string;
  pageSize?: number;
}

export interface NormalizedAuditQueryFilters {
  timeFrom: Date;
  timeTo: Date;
  category?: AuditCategory[];
  actionCode?: string[];
  actorType?: AuditActorType;
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
  outcome?: AuditOutcome;
  correlationId?: string;
  pageSize: number;
}

function toDate(v: string | Date | undefined): Date | undefined {
  if (v === undefined) return undefined;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid date in audit query filter');
  return d;
}

function boundedArray<T>(v: T[] | undefined, name: string): T[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) throw new BadRequestException(`${name} must be an array`);
  if (v.length === 0) return undefined;
  if (v.length > MAX_FILTER_VALUES) {
    throw new BadRequestException(`${name} accepts at most ${MAX_FILTER_VALUES} values`);
  }
  return v;
}

/**
 * Validate + normalize. Defaults the time window to the last 24h; enforces the 31-day max lookback,
 * from ≤ to ordering, bounded multi-value filters, and page-size clamping.
 */
export function validateAuditQueryFilters(
  raw: RawAuditQueryFilters,
  now: Date,
): NormalizedAuditQueryFilters {
  let timeFrom = toDate(raw.timeFrom);
  let timeTo = toDate(raw.timeTo);
  if (!timeTo) timeTo = now;
  if (!timeFrom) timeFrom = new Date(timeTo.getTime() - DEFAULT_LOOKBACK_MS);
  if (timeFrom.getTime() > timeTo.getTime()) {
    throw new BadRequestException('timeFrom must not be after timeTo');
  }
  if (timeTo.getTime() - timeFrom.getTime() > MAX_LOOKBACK_MS) {
    throw new BadRequestException('Audit query time range exceeds the 31-day maximum');
  }

  let pageSize = raw.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1) pageSize = DEFAULT_PAGE_SIZE;
  if (pageSize > MAX_PAGE_SIZE) pageSize = MAX_PAGE_SIZE;

  return {
    timeFrom,
    timeTo,
    category: boundedArray(raw.category, 'category'),
    actionCode: boundedArray(raw.actionCode, 'actionCode'),
    actorType: raw.actorType,
    actorId: raw.actorId,
    resourceType: raw.resourceType,
    resourceId: raw.resourceId,
    outcome: raw.outcome,
    correlationId: raw.correlationId,
    pageSize,
  };
}
