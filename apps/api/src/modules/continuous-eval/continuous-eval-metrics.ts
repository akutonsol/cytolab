import { AiModelLifecycleState, EvaluationCoverageStatus, EvaluationEvidenceProvenance, EvaluationMetricKind } from '@prisma/client';

/**
 * Program 6 · Phase 6G — pure continuous-evaluation rules (dependency-free, unit-testable).
 *
 * Model eligibility for monitoring is VALIDATION/APPROVED/DEPRECATED (Decision 10). Coverage is classified truthfully
 * from the real sample count (Decision 7). Metric values are bounded by kind and provenance: an UNAVAILABLE metric
 * MUST have a null value + a reason (never an invented number); rate metrics are finite in [0,1]; latency/count are
 * finite and non-negative. These rules never assert authority — they only bound + classify recorded evidence.
 */
export const EVAL_METRICS_SCHEMA_VERSION = 'eval-metrics-1.0';
export const EVAL_COMPUTATION_VERSION = '6g.1.0';
export const EVAL_WINDOW_DEFINITION_VERSION = 'eval-window-1.0';
/** Below this many eligible inferences a window is SPARSE (evidence is numerically calculable but not sufficient). */
export const SPARSE_SAMPLE_THRESHOLD = 30;

/** Model lifecycle states eligible for continuous evaluation (Decision 10). */
export function isMonitorableLifecycle(state: AiModelLifecycleState): boolean {
  return state === 'VALIDATION' || state === 'APPROVED' || state === 'DEPRECATED';
}

/** Truthful coverage classification from the real sample count (Decision 7). */
export function classifyCoverage(sampleCount: number): EvaluationCoverageStatus {
  if (sampleCount <= 0) return 'EMPTY';
  if (sampleCount < SPARSE_SAMPLE_THRESHOLD) return 'SPARSE';
  return 'COVERED';
}

/** Metric kinds whose `value` is a rate bounded to [0,1]. */
export const RATE_METRIC_KINDS: EvaluationMetricKind[] = ['SUCCESS_RATE', 'FAILURE_RATE', 'TIMEOUT_RATE'];

export interface EvalMetricShape {
  metricKind: EvaluationMetricKind;
  provenance: EvaluationEvidenceProvenance;
  value?: number | null;
  unavailableReason?: string | null;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Returns an error string, or null when a metric is valid for its kind + provenance. */
export function validateEvalMetric(m: EvalMetricShape): string | null {
  if (m.provenance === 'UNAVAILABLE') {
    if (m.value != null) return `${m.metricKind}: an UNAVAILABLE metric must have a null value`;
    if (!m.unavailableReason) return `${m.metricKind}: an UNAVAILABLE metric must carry a reason`;
    return null;
  }
  // OBSERVED / SYNTHETIC_STUB → a value is expected and bounded by kind.
  if (RATE_METRIC_KINDS.includes(m.metricKind) || m.metricKind === 'CALIBRATION_DECAY' || m.metricKind === 'DRIFT_INDICATOR' || m.metricKind === 'CONFIDENCE_BIN') {
    if (!finite(m.value ?? NaN) || (m.value as number) < 0 || (m.value as number) > 1) return `${m.metricKind}: value must be a finite number in [0,1]`;
  } else if (m.metricKind === 'LATENCY_PERCENTILE' || m.metricKind === 'INFERENCE_COUNT') {
    if (!finite(m.value ?? NaN) || (m.value as number) < 0) return `${m.metricKind}: value must be a finite, non-negative number`;
  }
  return null;
}
