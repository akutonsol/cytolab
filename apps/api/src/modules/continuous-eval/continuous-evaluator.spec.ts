import { StubContinuousEvaluator, EvaluationRunRequest, EvalMemberRecord } from './continuous-evaluator';
import { validateEvalMetric } from './continuous-eval-metrics';

/**
 * Program 6 · Phase 6G — the default evaluator is deterministic and non-clinical (Guardrail 6). Observed metrics are
 * real aggregations of the member set; confidence is SYNTHETIC_STUB; drift needs a baseline else UNAVAILABLE; an
 * empty window records truthful absence; recommendations only appear on COVERED evidence.
 */
describe('P6-6G StubContinuousEvaluator (deterministic, non-clinical)', () => {
  const ev = new StubContinuousEvaluator();
  const mk = (n: number, fail: number): EvalMemberRecord[] =>
    Array.from({ length: n }, (_, i) => ({ inferenceRecordId: `ir-${i}`, outcome: i < fail ? 'FAILED' : 'SUCCEEDED', durationMs: 100 + i }));
  const base = (members: EvalMemberRecord[], over: Partial<EvaluationRunRequest> = {}): EvaluationRunRequest => ({
    model: { modelVersionUuid: 'mv', modelUuid: 'm', lifecycleState: 'APPROVED' },
    cohort: 'NON_VALIDATION', members, windowStart: '2026-01-01T00:00:00.000Z', windowEnd: '2026-01-02T00:00:00.000Z',
    timeBasis: 'UTC', windowDefinitionVersion: 'eval-window-1.0', baseline: null, configDigest: null, failureRateThreshold: 0.5, thresholdConfigDigest: 't'.repeat(64), ...over,
  });

  it('is deterministic (identical output + calculationId for identical inputs)', async () => {
    const a = await ev.evaluate(base(mk(40, 5)));
    const b = await ev.evaluate(base(mk(40, 5)));
    expect(a.calculationId).toBe(b.calculationId);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    for (const m of a.metrics) expect(validateEvalMetric(m)).toBeNull();
  });

  it('computes OBSERVED rates from the member set; confidence is SYNTHETIC_STUB', async () => {
    const g = await ev.evaluate(base(mk(40, 10))); // 10 failed / 40
    const fr = g.metrics.find((m) => m.metricKind === 'FAILURE_RATE')!;
    expect(fr.provenance).toBe('OBSERVED');
    expect(fr.value).toBeCloseTo(0.25, 4);
    expect(g.metrics.filter((m) => m.metricKind === 'CONFIDENCE_BIN').every((m) => m.provenance === 'SYNTHETIC_STUB')).toBe(true);
  });

  it('marks drift/calibration UNAVAILABLE without a baseline; OBSERVED with one', async () => {
    const noBase = await ev.evaluate(base(mk(40, 5)));
    expect(noBase.metrics.find((m) => m.metricKind === 'DRIFT_INDICATOR')!.provenance).toBe('UNAVAILABLE');
    const withBase = await ev.evaluate(base(mk(40, 5), { baseline: { validationRunId: 'vr', calculationId: 'c'.repeat(64) } }));
    expect(withBase.metrics.find((m) => m.metricKind === 'DRIFT_INDICATOR')!.provenance).toBe('OBSERVED');
  });

  it('records an EMPTY window truthfully — no invented values', async () => {
    const g = await ev.evaluate(base([]));
    expect(g.coverageStatus).toBe('EMPTY');
    expect(g.metrics.find((m) => m.metricKind === 'INFERENCE_COUNT')!.value).toBe(0); // 0 is a real observation
    expect(g.metrics.filter((m) => m.metricKind !== 'INFERENCE_COUNT').every((m) => m.provenance === 'UNAVAILABLE' && m.value == null)).toBe(true);
    expect(g.recommendations).toHaveLength(0);
  });

  it('issues an advisory recommendation ONLY on COVERED evidence over threshold; never on SPARSE', async () => {
    const covered = await ev.evaluate(base(mk(40, 30))); // 0.75 failure, covered
    expect(covered.recommendations[0]?.recommendationCode).toBe('LIFECYCLE_REVIEW_RECOMMENDED');
    expect(covered.recommendations[0]?.supportingMetricOrdinals.length).toBeGreaterThan(0);
    const sparse = await ev.evaluate(base(mk(5, 5))); // 1.0 failure but SPARSE
    expect(sparse.recommendations).toHaveLength(0);
  });
});
