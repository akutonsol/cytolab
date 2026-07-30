import { AiModelLifecycleState, ValidationMetricKind } from '@prisma/client';

/**
 * Program 6 · Phase 6F — pure validation-evidence rules (dependency-free, unit-testable).
 *
 * Enforces the charter boundary structurally: metrics are coded + numeric + bounded — never a diagnosis, correctness,
 * or clinical claim. Ratio metrics (sensitivity/specificity/precision/recall/F/operating-threshold) are finite in
 * [0,1]; confusion counts are non-negative integers; ROC/calibration coordinates are finite in [0,1]. Model
 * eligibility for validation is VALIDATION or APPROVED (Decision 7); the dataset must be FROZEN (enforced in the
 * service). These rules never assert authority — they only bound the recorded evidence.
 */
export const VALIDATION_METRICS_SCHEMA_VERSION = 'validation-metrics-1.0'; // Guardrail 7
export const VALIDATION_COMPUTATION_VERSION = '6f.1.0'; // Guardrail 3

/** Metric kinds whose `value` is a ratio bounded to [0,1]. */
export const RATIO_METRIC_KINDS: ValidationMetricKind[] = ['SENSITIVITY', 'SPECIFICITY', 'PRECISION', 'RECALL', 'F_SCORE', 'OPERATING_THRESHOLD'];

/** Lifecycle states a model version must be in to be validated (Decision 7). */
export function isValidatableLifecycle(state: AiModelLifecycleState): boolean {
  return state === 'VALIDATION' || state === 'APPROVED';
}

const inUnit = (n: unknown): boolean => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;

export interface ScalarMetric {
  metricKind: ValidationMetricKind;
  value?: number | null;
}
export interface ConfusionCell {
  trueClassCode: string;
  predClassCode: string;
  count: number;
}
export interface CurvePoint {
  curveKind: ValidationMetricKind;
  x: number;
  y: number;
  threshold?: number | null;
}

/** Returns an error string, or null when a scalar metric value is valid for its kind. */
export function validateScalarMetric(m: ScalarMetric): string | null {
  if (m.metricKind === 'CONFUSION_MATRIX' || m.metricKind === 'ROC_POINT' || m.metricKind === 'CALIBRATION_POINT') {
    return null; // represented as structured cells / curve points, not a scalar value
  }
  if (RATIO_METRIC_KINDS.includes(m.metricKind)) {
    if (!inUnit(m.value ?? NaN)) return `${m.metricKind} value must be a finite number in [0,1]`;
  }
  return null;
}

/** Returns an error string, or null when a confusion cell is valid. */
export function validateConfusionCell(c: ConfusionCell): string | null {
  if (!c.trueClassCode || !c.predClassCode) return 'confusion cell requires coded true/pred class codes';
  if (!Number.isInteger(c.count) || c.count < 0) return `confusion count must be a non-negative integer (got ${c.count})`;
  return null;
}

/** Returns an error string, or null when a curve point is valid. */
export function validateCurvePoint(p: CurvePoint): string | null {
  if (p.curveKind !== 'ROC_POINT' && p.curveKind !== 'CALIBRATION_POINT') return `curve point kind must be ROC_POINT or CALIBRATION_POINT (got ${p.curveKind})`;
  if (!inUnit(p.x) || !inUnit(p.y)) return 'curve point coordinates must be finite in [0,1]';
  if (p.threshold != null && !inUnit(p.threshold)) return 'curve point threshold must be finite in [0,1]';
  return null;
}
