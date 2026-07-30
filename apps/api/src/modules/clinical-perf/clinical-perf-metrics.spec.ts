import { isEligibleForClinicalPerf, classifyCoverage, validateClinicalPerfMetric, SPARSE_SAMPLE_THRESHOLD } from './clinical-perf-metrics';

/** Program 6 · Phase 6H — pure eligibility + coverage + metric-bounding rules. */
describe('P6-6H clinical-performance metrics', () => {
  it('measures VALIDATION/APPROVED/DEPRECATED, not DRAFT/RETIRED', () => {
    for (const s of ['VALIDATION', 'APPROVED', 'DEPRECATED'] as const) expect(isEligibleForClinicalPerf(s)).toBe(true);
    for (const s of ['DRAFT', 'RETIRED'] as const) expect(isEligibleForClinicalPerf(s)).toBe(false);
  });

  it('classifies coverage truthfully from the sample count', () => {
    expect(classifyCoverage(0)).toBe('EMPTY');
    expect(classifyCoverage(1)).toBe('SPARSE');
    expect(classifyCoverage(SPARSE_SAMPLE_THRESHOLD)).toBe('COVERED');
  });

  it('requires an UNAVAILABLE metric to have a null value + a reason', () => {
    expect(validateClinicalPerfMetric({ metricKind: 'TURNAROUND_DURATION', provenance: 'UNAVAILABLE', value: null, unavailableReason: 'not read' })).toBeNull();
    expect(validateClinicalPerfMetric({ metricKind: 'TURNAROUND_DURATION', provenance: 'UNAVAILABLE', value: 5, unavailableReason: 'x' })).toMatch(/null value/);
    expect(validateClinicalPerfMetric({ metricKind: 'TURNAROUND_DURATION', provenance: 'UNAVAILABLE', value: null })).toMatch(/reason/);
  });

  it('bounds fraction metrics (agreement/concordance/reduction) to [0,1] and durations/counts to >= 0', () => {
    expect(validateClinicalPerfMetric({ metricKind: 'READER_AGREEMENT', provenance: 'OBSERVED', value: 0.8 })).toBeNull();
    expect(validateClinicalPerfMetric({ metricKind: 'CONCORDANCE', provenance: 'OBSERVED', value: 1.2 })).toMatch(/\[0,1\]/);
    expect(validateClinicalPerfMetric({ metricKind: 'WORKLOAD_REDUCTION', provenance: 'SYNTHETIC_STUB', value: 0.3 })).toBeNull();
    expect(validateClinicalPerfMetric({ metricKind: 'WORKLOAD_COUNT', provenance: 'OBSERVED', value: 42 })).toBeNull();
    expect(validateClinicalPerfMetric({ metricKind: 'REVIEW_DURATION', provenance: 'OBSERVED', value: -1 })).toMatch(/non-negative/);
  });
});
