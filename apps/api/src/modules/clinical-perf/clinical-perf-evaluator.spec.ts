import { StubClinicalPerfEvaluator, ClinicalPerfRunRequest, CpMember } from './clinical-perf-evaluator';
import { validateClinicalPerfMetric } from './clinical-perf-metrics';

/**
 * Program 6 · Phase 6H — the default evaluator is deterministic and non-clinical. OBSERVED metrics aggregate the real
 * member set; agreement/concordance are consistency (never correctness); workload-reduction is SYNTHETIC_STUB;
 * review/turnaround are UNAVAILABLE (timing not read); an empty window is truthful.
 */
describe('P6-6H StubClinicalPerfEvaluator (deterministic, non-clinical)', () => {
  const ev = new StubClinicalPerfEvaluator();
  const decision = (i: number, d: 'ACCEPT' | 'REJECT' | 'MODIFY'): CpMember => ({ source: 'HUMAN_REVIEW_DECISION', inferenceRecordId: null, humanReviewDecisionId: `d-${i}`, outcome: null, reviewDecision: d, subjectInferenceRecordId: `ir-${i}` });
  const inference = (i: number): CpMember => ({ source: 'INFERENCE_RECORD', inferenceRecordId: `ir-${i}`, humanReviewDecisionId: null, outcome: 'SUCCEEDED', reviewDecision: null, subjectInferenceRecordId: `ir-${i}` });
  const base = (members: CpMember[]): ClinicalPerfRunRequest => ({
    model: { modelVersionUuid: 'mv', modelUuid: 'm', lifecycleState: 'APPROVED' }, cohort: 'CLINICAL', members,
    windowStart: '2026-06-01T00:00:00.000Z', windowEnd: '2026-06-02T00:00:00.000Z', timeBasis: 'UTC', windowDefinitionVersion: 'clinicalperf-window-1.0',
    baselineCalculationId: null, operationalDataUsed: false, configDigest: null, windowDurationHours: 24,
  });

  it('is deterministic (identical output + calculationId for identical inputs)', async () => {
    const members = [decision(0, 'ACCEPT'), decision(1, 'ACCEPT'), decision(2, 'REJECT'), inference(0), inference(1)];
    const a = await ev.evaluate(base(members));
    const b = await ev.evaluate(base([...members]));
    expect(a.calculationId).toBe(b.calculationId);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    for (const m of a.metrics) expect(validateClinicalPerfMetric(m)).toBeNull();
  });

  it('computes agreement + concordance as consistency (never correctness) with OBSERVED provenance', async () => {
    const g = await ev.evaluate(base([decision(0, 'ACCEPT'), decision(1, 'ACCEPT'), decision(2, 'ACCEPT'), decision(3, 'REJECT')]));
    const agr = g.metrics.find((m) => m.metricKind === 'READER_AGREEMENT')!;
    expect(agr.provenance).toBe('OBSERVED'); expect(agr.value).toBeCloseTo(0.75, 4); // modal 3/4
    const con = g.metrics.find((m) => m.metricKind === 'CONCORDANCE')!;
    expect(con.provenance).toBe('OBSERVED'); expect(con.value).toBeCloseTo(0.75, 4); // 3 ACCEPT / 4
  });

  it('marks workload-reduction SYNTHETIC_STUB and review/turnaround UNAVAILABLE (no invented observed values)', async () => {
    const g = await ev.evaluate(base([inference(0), inference(1)]));
    expect(g.metrics.find((m) => m.metricKind === 'WORKLOAD_REDUCTION')!.provenance).toBe('SYNTHETIC_STUB');
    expect(g.metrics.find((m) => m.metricKind === 'REVIEW_DURATION')!.provenance).toBe('UNAVAILABLE');
    expect(g.metrics.find((m) => m.metricKind === 'TURNAROUND_DURATION')!.provenance).toBe('UNAVAILABLE');
    expect(g.metrics.find((m) => m.metricKind === 'OPERATIONAL_THROUGHPUT')!.provenance).toBe('OBSERVED'); // 2 / 24h
  });

  it('records an EMPTY window truthfully — WORKLOAD_COUNT 0 observed, everything else UNAVAILABLE/synthetic', async () => {
    const g = await ev.evaluate(base([]));
    expect(g.coverageStatus).toBe('EMPTY');
    expect(g.metrics.find((m) => m.metricKind === 'WORKLOAD_COUNT')!.value).toBe(0);
    expect(g.metrics.filter((m) => m.metricKind === 'READER_AGREEMENT' || m.metricKind === 'CONCORDANCE').every((m) => m.provenance === 'UNAVAILABLE' && m.value == null)).toBe(true);
  });
});
