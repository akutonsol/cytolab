import { isMonitorableLifecycle, classifyCoverage, validateEvalMetric, SPARSE_SAMPLE_THRESHOLD } from './continuous-eval-metrics';

/** Program 6 · Phase 6G — pure eligibility + coverage + metric-bounding rules. */
describe('P6-6G continuous-eval metrics', () => {
  it('monitors VALIDATION/APPROVED/DEPRECATED, not DRAFT/RETIRED', () => {
    for (const s of ['VALIDATION', 'APPROVED', 'DEPRECATED'] as const) expect(isMonitorableLifecycle(s)).toBe(true);
    for (const s of ['DRAFT', 'RETIRED'] as const) expect(isMonitorableLifecycle(s)).toBe(false);
  });

  it('classifies coverage truthfully from the sample count', () => {
    expect(classifyCoverage(0)).toBe('EMPTY');
    expect(classifyCoverage(1)).toBe('SPARSE');
    expect(classifyCoverage(SPARSE_SAMPLE_THRESHOLD - 1)).toBe('SPARSE');
    expect(classifyCoverage(SPARSE_SAMPLE_THRESHOLD)).toBe('COVERED');
  });

  it('requires an UNAVAILABLE metric to have a null value + a reason', () => {
    expect(validateEvalMetric({ metricKind: 'FAILURE_RATE', provenance: 'UNAVAILABLE', value: null, unavailableReason: 'no data' })).toBeNull();
    expect(validateEvalMetric({ metricKind: 'FAILURE_RATE', provenance: 'UNAVAILABLE', value: 0.2, unavailableReason: 'x' })).toMatch(/null value/);
    expect(validateEvalMetric({ metricKind: 'FAILURE_RATE', provenance: 'UNAVAILABLE', value: null })).toMatch(/reason/);
  });

  it('bounds observed/synthetic rate + confidence metrics to [0,1] and counts/latency to >= 0', () => {
    expect(validateEvalMetric({ metricKind: 'SUCCESS_RATE', provenance: 'OBSERVED', value: 0.9 })).toBeNull();
    expect(validateEvalMetric({ metricKind: 'FAILURE_RATE', provenance: 'OBSERVED', value: 1.5 })).toMatch(/\[0,1\]/);
    expect(validateEvalMetric({ metricKind: 'CONFIDENCE_BIN', provenance: 'SYNTHETIC_STUB', value: 0.4 })).toBeNull();
    expect(validateEvalMetric({ metricKind: 'INFERENCE_COUNT', provenance: 'OBSERVED', value: 42 })).toBeNull();
    expect(validateEvalMetric({ metricKind: 'LATENCY_PERCENTILE', provenance: 'OBSERVED', value: -1 })).toMatch(/non-negative/);
  });
});
