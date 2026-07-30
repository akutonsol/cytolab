import { ExplainabilityRegionType } from '@prisma/client';
import { PROBABILITY_SUM_TOLERANCE } from './explainability-tokens';

/**
 * Program 6 · Phase 6D — pure validation for explainability content (dependency-free, unit-testable).
 *
 * These enforce the charter invariant structurally: content is coded + numeric + bounded — never a diagnosis,
 * correctness, accuracy, or confidence claim. A probability distribution is a coded, deterministic numeric vector
 * that sums to 1 within tolerance (Decision 6). A feature region is validated slide-pixel geometry — bounding box or
 * polygon, finite, non-negative, bounded by the slide when its dimensions are known (Decision 7 / Guardrail 1).
 */
export interface SlideBounds {
  width: number | null;
  height: number | null;
}

export interface ProbabilityEntry {
  classCode: string;
  value: number;
  ordinal: number;
}

/** Returns an error string, or null when the distribution is valid. */
export function validateProbabilityDistribution(entries: ProbabilityEntry[], tolerance = PROBABILITY_SUM_TOLERANCE): string | null {
  if (!Array.isArray(entries) || entries.length === 0) return 'probability distribution must have at least one entry';
  const codes = new Set<string>();
  let sum = 0;
  for (const e of entries) {
    if (typeof e.classCode !== 'string' || e.classCode.length === 0) return 'each probability entry needs a coded classCode';
    if (codes.has(e.classCode)) return `duplicate probability classCode: ${e.classCode}`;
    codes.add(e.classCode);
    if (!Number.isFinite(e.value) || e.value < 0) return `probability value must be a finite, non-negative number (classCode ${e.classCode})`;
    if (!Number.isInteger(e.ordinal)) return 'probability entries need an integer ordinal (deterministic ordering)';
    sum += e.value;
  }
  if (Math.abs(sum - 1) > tolerance) return `probability distribution must sum to 1.0 ± ${tolerance} (got ${sum})`;
  return null;
}

export interface BoxGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface PolygonGeometry {
  points: Array<{ x: number; y: number }>;
}

const finiteNonNeg = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/** Returns an error string, or null when the region geometry is valid for its type + slide bounds. */
export function validateRegionGeometry(regionType: ExplainabilityRegionType, geometry: unknown, bounds: SlideBounds): string | null {
  if (geometry == null || typeof geometry !== 'object') return 'region geometry must be an object';
  if (regionType === 'BOUNDING_BOX') {
    const g = geometry as BoxGeometry;
    if (![g.x, g.y, g.w, g.h].every(finiteNonNeg)) return 'bounding box requires finite, non-negative x/y/w/h';
    if (!(g.w > 0 && g.h > 0)) return 'bounding box requires positive width and height';
    if (bounds.width != null && g.x + g.w > bounds.width) return `bounding box exceeds slide width (${bounds.width})`;
    if (bounds.height != null && g.y + g.h > bounds.height) return `bounding box exceeds slide height (${bounds.height})`;
    return null;
  }
  // POLYGON
  const g = geometry as PolygonGeometry;
  if (!Array.isArray(g.points) || g.points.length < 3) return 'polygon requires at least 3 points';
  for (const p of g.points) {
    if (!p || !finiteNonNeg(p.x) || !finiteNonNeg(p.y)) return 'polygon points require finite, non-negative x/y';
    if (bounds.width != null && p.x > bounds.width) return `polygon point exceeds slide width (${bounds.width})`;
    if (bounds.height != null && p.y > bounds.height) return `polygon point exceeds slide height (${bounds.height})`;
  }
  return null;
}
