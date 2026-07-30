import { AiModelLifecycleState, ClinicalPerfCoverageStatus, ClinicalPerfEvidenceProvenance, ClinicalPerfMetricKind } from '@prisma/client';

/**
 * Program 6 · Phase 6H — pure clinical-performance MEASUREMENT rules (dependency-free, unit-testable).
 *
 * Measurement evidence only — never correctness, validity, safety, effectiveness, regulatory, or diagnostic authority
 * (Decision 1). Agreement/concordance/workload-reduction are fractions in [0,1] (consistency, not correctness);
 * durations/counts/throughput are finite and non-negative; an UNAVAILABLE metric MUST have a null value + a reason
 * (never an invented number — Decision 8). Model eligibility mirrors the monitorable set (VALIDATION/APPROVED/
 * DEPRECATED); DRAFT/RETIRED are ineligible.
 */
export const CLINICAL_PERF_METRICS_SCHEMA_VERSION = 'clinicalperf-metrics-1.0';
export const CLINICAL_PERF_COMPUTATION_VERSION = '6h.1.0';
export const CLINICAL_PERF_WINDOW_DEFINITION_VERSION = 'clinicalperf-window-1.0';
export const SPARSE_SAMPLE_THRESHOLD = 30;

export function isEligibleForClinicalPerf(state: AiModelLifecycleState): boolean {
  return state === 'VALIDATION' || state === 'APPROVED' || state === 'DEPRECATED';
}

export function classifyCoverage(sampleCount: number): ClinicalPerfCoverageStatus {
  if (sampleCount <= 0) return 'EMPTY';
  if (sampleCount < SPARSE_SAMPLE_THRESHOLD) return 'SPARSE';
  return 'COVERED';
}

/** Metric kinds whose `value` is a fraction bounded to [0,1] (consistency/estimate — NOT correctness). */
export const FRACTION_METRIC_KINDS: ClinicalPerfMetricKind[] = ['READER_AGREEMENT', 'CONCORDANCE', 'WORKLOAD_REDUCTION'];

export interface ClinicalPerfMetricShape {
  metricKind: ClinicalPerfMetricKind;
  provenance: ClinicalPerfEvidenceProvenance;
  value?: number | null;
  unavailableReason?: string | null;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Returns an error string, or null when a metric is valid for its kind + provenance. */
export function validateClinicalPerfMetric(m: ClinicalPerfMetricShape): string | null {
  if (m.provenance === 'UNAVAILABLE') {
    if (m.value != null) return `${m.metricKind}: an UNAVAILABLE metric must have a null value`;
    if (!m.unavailableReason) return `${m.metricKind}: an UNAVAILABLE metric must carry a reason`;
    return null;
  }
  if (FRACTION_METRIC_KINDS.includes(m.metricKind)) {
    if (!finite(m.value ?? NaN) || (m.value as number) < 0 || (m.value as number) > 1) return `${m.metricKind}: value must be a finite number in [0,1]`;
  } else {
    // durations / counts / throughput
    if (!finite(m.value ?? NaN) || (m.value as number) < 0) return `${m.metricKind}: value must be a finite, non-negative number`;
  }
  return null;
}
