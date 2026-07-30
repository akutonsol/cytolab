import { StubValidationValidator } from './validation-validator';
import { validateScalarMetric, validateConfusionCell, validateCurvePoint } from './validation-metrics';

/**
 * Program 6 · Phase 6F — the default validator is deterministic and non-clinical (Guardrail 4). Identical
 * (model snapshot, dataset snapshot, config digest) → identical metrics + calculationId; every metric is derived from
 * self-consistent confusion counts (real numerator/denominator provenance — Guardrail 3); all values are in range.
 */
describe('P6-6F StubValidationValidator (deterministic, non-clinical)', () => {
  const v = new StubValidationValidator();
  const req = {
    model: { modelVersionUuid: 'mv-uuid', modelUuid: 'm-uuid', artifactDigest: 'a'.repeat(64), lifecycleState: 'APPROVED' as const },
    dataset: { datasetVersionId: 'ds-1', manifestDigest: 'b'.repeat(64), groundTruthDigest: 'c'.repeat(64) },
    configDigest: 'd'.repeat(64),
  };

  it('is deterministic (identical output + calculationId for identical inputs)', async () => {
    const a = await v.validate(req);
    const b = await v.validate({ ...req, model: { ...req.model }, dataset: { ...req.dataset } });
    expect(a.calculationId).toBe(b.calculationId);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.calculationId).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes output when the model, dataset, or config snapshot changes', async () => {
    const base = (await v.validate(req)).calculationId;
    expect((await v.validate({ ...req, model: { ...req.model, modelVersionUuid: 'other' } })).calculationId).not.toBe(base);
    expect((await v.validate({ ...req, dataset: { ...req.dataset, groundTruthDigest: 'e'.repeat(64) } })).calculationId).not.toBe(base);
    expect((await v.validate({ ...req, configDigest: 'f'.repeat(64) })).calculationId).not.toBe(base);
  });

  it('produces in-range metrics with numerator/denominator provenance, consistent with the confusion matrix', async () => {
    const g = await v.validate(req);
    for (const m of g.metrics) expect(validateScalarMetric(m)).toBeNull();
    for (const c of g.confusionCells) expect(validateConfusionCell(c)).toBeNull();
    for (const p of g.curvePoints) expect(validateCurvePoint(p)).toBeNull();
    // every ratio metric carries provenance (Guardrail 3)
    const ratio = g.metrics.filter((m) => m.metricKind !== 'OPERATING_THRESHOLD');
    expect(ratio.every((m) => !!m.numeratorSource)).toBe(true);
    // sensitivity == tp/(tp+fn) recomputed from the confusion cells
    const cell = (t: string, p: string) => g.confusionCells.find((c) => c.trueClassCode === t && c.predClassCode === p)!.count;
    const tp = cell('class-a', 'class-a'), fn = cell('class-a', 'class-b');
    const sens = g.metrics.find((m) => m.metricKind === 'SENSITIVITY')!.value!;
    expect(Math.abs(sens - tp / (tp + fn))).toBeLessThan(1e-3);
    // no diagnostic/clinical vocabulary in coded classes
    expect(g.confusionCells.every((c) => /^class-/.test(c.trueClassCode) && /^class-/.test(c.predClassCode))).toBe(true);
  });
});
