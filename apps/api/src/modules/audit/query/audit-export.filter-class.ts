/**
 * Program 2 · P2-9A — coarse, value-free classification of an audit-export predicate. This is the
 * ONLY thing about the predicate that enters capture metadata: it records the SHAPE of the filter
 * (how many dimensions were constrained), never the raw filter values, lab ids, or any user string.
 *
 * `time` is treated separately from the "dimensions" because a bounded time window is always present
 * (defaulted when unspecified) — only an EXPLICIT time bound counts as a constrained time dimension.
 */
import { RawAuditQueryFilters } from './audit-query.filters';
import { AuditExportFilterClass } from '../audit-metadata';

/** The non-time predicate dimensions a caller may constrain (presence only — values are irrelevant). */
const DIMENSION_KEYS = [
  'category',
  'actionCode',
  'actorType',
  'actorId',
  'resourceType',
  'resourceId',
  'outcome',
  'correlationId',
] as const;

function isPresent(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return v.trim().length > 0;
  return true;
}

/**
 * Classify by how many predicate dimensions are constrained — nothing about their values:
 *   none            → no explicit time bound and no dimension.
 *   time_only       → only an explicit time bound (from/to), no dimension.
 *   single_dimension→ exactly one non-time dimension constrained.
 *   multi_dimension → two or more non-time dimensions constrained.
 */
export function deriveExportFilterClass(raw: RawAuditQueryFilters): AuditExportFilterClass {
  const dimensions = DIMENSION_KEYS.reduce((n, k) => (isPresent((raw as Record<string, unknown>)[k]) ? n + 1 : n), 0);
  if (dimensions >= 2) return 'multi_dimension';
  if (dimensions === 1) return 'single_dimension';
  const explicitTime = isPresent(raw.timeFrom) || isPresent(raw.timeTo);
  return explicitTime ? 'time_only' : 'none';
}
