import { randomUUID } from 'node:crypto';
import { Prisma, AiModelLifecycleState, InferenceOutcome } from '@prisma/client';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { ContinuousEvalService } from './continuous-eval.service';
import { StubContinuousEvaluator, ContinuousEvaluator } from './continuous-evaluator';

/**
 * Program 6 · Phase 6G — continuous evaluation against the REAL test Postgres via the tenancy-scoped PrismaService.
 * Proves: lab scoping + cross-lab fail-closed; monitorable-lifecycle eligibility; immutable membership snapshot
 * (Guardrail 1); explicit cohort separation (Guardrail 9); OBSERVED metrics from real records + SYNTHETIC_STUB
 * confidence + UNAVAILABLE drift without a baseline; truthful empty windows; baseline compatibility (Guardrail 3);
 * deterministic calculation + windowSignature (Guardrails 6/8); atomic persistence (Guardrails 5/12); NO support
 * lifecycle mutation; advisory recommendation provenance (Guardrail 4); no PHI/clinical columns; RESTRICT FKs.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;
const WSTART = '2026-06-01T00:00:00.000Z';
const WEND = '2026-06-02T00:00:00.000Z';
const IN_WINDOW = new Date('2026-06-01T12:00:00.000Z');

describeIf('P6-6G continuous evaluation (integration)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const audit = { recordEntityCreated: jest.fn(async () => undefined) } as any;
  const svc = new ContinuousEvalService(prisma, audit, new StubContinuousEvaluator());
  const asLab = <T>(labId: string, fn: () => Promise<T>) => labContext.runLabScoped(labId, fn) as Promise<T>;
  const labIds: string[] = [];

  const mkLab = async () => { const l = await raw.lab.create({ data: { name: 'p6g', slug: `p6g-${randomUUID()}` } }); labIds.push(l.id); return l.id; };
  const mkVersion = async (labId: string, state: AiModelLifecycleState = 'APPROVED') => {
    const m = await raw.aiModel.create({ data: { labId, key: `m-${randomUUID()}`, displayName: 'M', task: 'demo' } });
    const v = await raw.aiModelVersion.create({ data: { labId, modelId: m.id, semverMajor: 1, semverMinor: 0, semverPatch: 0, lifecycleState: state, artifactDigest: 'a'.repeat(64) } });
    return { id: v.id, versionUuid: v.versionUuid, modelUuid: m.modelUuid };
  };
  const mkInferences = async (labId: string, modelVersionId: string, opts: { count: number; failCount?: number; validationOnly?: boolean; when?: Date }) => {
    for (let i = 0; i < opts.count; i++) {
      const outcome: InferenceOutcome = i < (opts.failCount ?? 0) ? 'FAILED' : 'SUCCEEDED';
      await raw.inferenceRecord.create({ data: { labId, modelVersionId, inputDigest: 'a'.repeat(64), outcome, validationOnly: opts.validationOnly ?? false, durationMs: 100 + i, adapterId: 'stub', adapterVersion: '1.0.0', engineVersion: '6c.1.0', createdAt: opts.when ?? IN_WINDOW } });
    }
  };
  const mkValidationRun = async (labId: string, mv: { id: string; versionUuid: string; modelUuid: string }) => {
    const d = await raw.dataset.create({ data: { labId, key: `k-${randomUUID()}`, displayName: 'D', kind: 'VALIDATION' } });
    const dv = await raw.datasetVersion.create({ data: { labId, datasetId: d.id, versionNumber: 1, state: 'FROZEN', purpose: 'ALGORITHM_VALIDATION', manifestDigest: 'm'.repeat(64), frozenAt: new Date() } });
    const vr = await raw.validationRun.create({ data: { labId, modelVersionId: mv.id, datasetVersionId: dv.id, groundTruthDigest: 'g'.repeat(64), modelVersionUuid: mv.versionUuid, modelUuid: mv.modelUuid, modelLifecycleStateAtRun: 'APPROVED', validatorId: 'stub', validatorVersion: '1.0.0', computationVersion: '6f.1.0', metricSchemaVersion: 'validation-metrics-1.0', calculationId: 'c'.repeat(64), eventId: randomUUID() } });
    return vr.id;
  };
  const run = (labId: string, dto: any) => asLab(labId, () => svc.runEvaluation(dto));

  afterAll(async () => {
    for (const labId of labIds) {
      for (const t of ['EvaluationRecommendationEvidence', 'EvaluationRecommendation', 'EvaluationMetric', 'EvaluationWindowMember', 'EvaluationWindow', 'ValidationCurvePoint', 'ValidationConfusionCell', 'ValidationMetric', 'ValidationRun', 'DatasetVersion', 'Dataset', 'InferenceRecord', 'AiModelVersion', 'AiModel']) {
        await raw.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, labId);
      }
      await raw.$executeRaw`DELETE FROM "Lab" WHERE id = ${labId}`;
    }
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('is lab-scoped, eligibility-checked, and fails closed cross-lab', async () => {
    const A = await mkLab(); const B = await mkLab();
    const mv = await mkVersion(A, 'APPROVED');
    await mkInferences(A, mv.id, { count: 3 });
    const w = await run(A, { modelVersionId: mv.id, windowStart: WSTART, windowEnd: WEND, cohort: 'NON_VALIDATION' });
    await expect(asLab(B, () => svc.getWindow(w.id))).rejects.toThrow(/not found/i);
    const bmv = await mkVersion(B, 'APPROVED');
    await expect(run(A, { modelVersionId: bmv.id, windowStart: WSTART, windowEnd: WEND, cohort: 'NON_VALIDATION' })).rejects.toThrow(/not found/i);
    for (const s of ['DRAFT', 'RETIRED'] as const) {
      const bad = await mkVersion(A, s);
      await expect(run(A, { modelVersionId: bad.id, windowStart: WSTART, windowEnd: WEND, cohort: 'NON_VALIDATION' })).rejects.toThrow(/VALIDATION, APPROVED, or DEPRECATED/);
    }
    await expect(run(A, { modelVersionId: mv.id, windowStart: WEND, windowEnd: WSTART, cohort: 'NON_VALIDATION' })).rejects.toThrow(/before/);
  });

  it('snapshots the exact member population (Guardrail 1) and separates cohorts (Guardrail 9)', async () => {
    const A = await mkLab();
    const mv = await mkVersion(A, 'APPROVED');
    await mkInferences(A, mv.id, { count: 4, validationOnly: false });
    await mkInferences(A, mv.id, { count: 2, validationOnly: true });
    const wNon = await run(A, { modelVersionId: mv.id, windowStart: WSTART, windowEnd: WEND, cohort: 'NON_VALIDATION' });
    expect(wNon.sampleCount).toBe(4);
    expect(await raw.evaluationWindowMember.count({ where: { windowId: wNon.id } })).toBe(4);
    expect(wNon.metrics.every((m) => m.cohort === 'NON_VALIDATION')).toBe(true);
    const wVal = await run(A, { modelVersionId: mv.id, windowStart: WSTART, windowEnd: WEND, cohort: 'VALIDATION_ONLY' });
    expect(wVal.sampleCount).toBe(2);
    expect(wVal.metrics.every((m) => m.cohort === 'VALIDATION_ONLY')).toBe(true);
    // membership references real InferenceRecords, not copied data
    const memberField = Prisma.dmmf.datamodel.models.find((x) => x.name === 'EvaluationWindowMember')!.fields.find((f) => f.name === 'inferenceRecord');
    expect(memberField?.type).toBe('InferenceRecord');
  });

  it('records OBSERVED rates from real records, SYNTHETIC_STUB confidence, and UNAVAILABLE drift without a baseline', async () => {
    const A = await mkLab();
    const mv = await mkVersion(A, 'APPROVED');
    await mkInferences(A, mv.id, { count: 40, failCount: 10 });
    const w = await run(A, { modelVersionId: mv.id, windowStart: WSTART, windowEnd: WEND, cohort: 'NON_VALIDATION' });
    expect(w.coverageStatus).toBe('COVERED');
    const fr = w.metrics.find((m) => m.metricKind === 'FAILURE_RATE')!;
    expect(fr.provenance).toBe('OBSERVED'); expect(fr.value).toBeCloseTo(0.25, 4);
    expect(w.metrics.filter((m) => m.metricKind === 'CONFIDENCE_BIN').every((m) => m.provenance === 'SYNTHETIC_STUB')).toBe(true);
    expect(w.metrics.find((m) => m.metricKind === 'DRIFT_INDICATOR')!.provenance).toBe('UNAVAILABLE');
  });

  it('records an EMPTY window truthfully — no invented metrics', async () => {
    const A = await mkLab();
    const mv = await mkVersion(A, 'APPROVED'); // no inferences in the window
    const w = await run(A, { modelVersionId: mv.id, windowStart: '2020-01-01T00:00:00.000Z', windowEnd: '2020-01-02T00:00:00.000Z', cohort: 'NON_VALIDATION' });
    expect(w.sampleCount).toBe(0); expect(w.coverageStatus).toBe('EMPTY');
    expect(w.metrics.find((m) => m.metricKind === 'INFERENCE_COUNT')!.value).toBe(0);
    const rates = w.metrics.filter((m) => ['SUCCESS_RATE', 'FAILURE_RATE', 'TIMEOUT_RATE'].includes(m.metricKind));
    expect(rates.every((m) => m.provenance === 'UNAVAILABLE' && m.value === null && !!m.unavailableReason)).toBe(true);
    expect(w.recommendations).toHaveLength(0);
  });

  it('accepts a same-model-version baseline (drift OBSERVED) and rejects a foreign one (Guardrail 3)', async () => {
    const A = await mkLab();
    const mv = await mkVersion(A, 'APPROVED');
    const other = await mkVersion(A, 'APPROVED');
    await mkInferences(A, mv.id, { count: 5 });
    const goodBaseline = await mkValidationRun(A, mv);
    const foreignBaseline = await mkValidationRun(A, other);
    await expect(run(A, { modelVersionId: mv.id, windowStart: WSTART, windowEnd: WEND, cohort: 'NON_VALIDATION', baselineValidationRunId: foreignBaseline })).rejects.toThrow(/different model version/);
    const w = await run(A, { modelVersionId: mv.id, windowStart: WSTART, windowEnd: WEND, cohort: 'NON_VALIDATION', baselineValidationRunId: goodBaseline });
    expect(w.baselineCompatibility).toBe('OBSERVED');
    expect(w.metrics.find((m) => m.metricKind === 'DRIFT_INDICATOR')!.provenance).toBe('OBSERVED');
  });

  it('is deterministic (Guardrail 6) with a stable windowSignature (Guardrail 8); re-eval = a new window', async () => {
    const A = await mkLab();
    const mv = await mkVersion(A, 'APPROVED');
    await mkInferences(A, mv.id, { count: 10, failCount: 2 });
    const dto = { modelVersionId: mv.id, windowStart: WSTART, windowEnd: WEND, cohort: 'NON_VALIDATION' as const };
    const w1 = await run(A, dto); const w2 = await run(A, dto);
    expect(w2.windowUuid).not.toBe(w1.windowUuid);
    expect(w2.calculationId).toBe(w1.calculationId);
    expect(w2.windowSignature).toBe(w1.windowSignature); // duplicate detectable via provenance
    expect(w2.completionState).toBe('COMPLETE');
    const sig = (w: any) => JSON.stringify(w.metrics.map((m: any) => [m.metricKind, m.provenance, m.value, m.ordinal]));
    expect(sig(w2)).toBe(sig(w1));
  });

  it('issues an advisory recommendation on COVERED evidence with supporting metric provenance (Guardrail 4)', async () => {
    const A = await mkLab();
    const mv = await mkVersion(A, 'APPROVED');
    await mkInferences(A, mv.id, { count: 40, failCount: 30 }); // 0.75 failure, COVERED
    const w = await run(A, { modelVersionId: mv.id, windowStart: WSTART, windowEnd: WEND, cohort: 'NON_VALIDATION' });
    expect(w.recommendations).toHaveLength(1);
    expect(w.recommendations[0].recommendationCode).toBe('LIFECYCLE_REVIEW_RECOMMENDED');
    expect(w.recommendations[0].evidence.length).toBeGreaterThan(0); // supporting metric references
  });

  it('is atomic — an invalid evaluator output persists NOTHING (Guardrails 5/12)', async () => {
    const A = await mkLab();
    const mv = await mkVersion(A, 'APPROVED');
    await mkInferences(A, mv.id, { count: 3 });
    const badEvaluator: ContinuousEvaluator = {
      evaluatorId: 'bad', evaluatorVersion: '0.0.0',
      evaluate: async () => ({ calculationId: 'a'.repeat(64), coverageStatus: 'SPARSE', metrics: [{ metricKind: 'FAILURE_RATE', provenance: 'OBSERVED', cohort: 'NON_VALIDATION', value: 2, ordinal: 0 }], recommendations: [] }),
    };
    const badSvc = new ContinuousEvalService(prisma, audit, badEvaluator);
    const before = await raw.evaluationWindow.count({ where: { labId: A } });
    await expect(asLab(A, () => badSvc.runEvaluation({ modelVersionId: mv.id, windowStart: WSTART, windowEnd: WEND, cohort: 'NON_VALIDATION' } as any))).rejects.toThrow(/\[0,1\]/);
    expect(await raw.evaluationWindow.count({ where: { labId: A } })).toBe(before);
    expect(await raw.evaluationMetric.count({ where: { labId: A } })).toBe(0);
  });

  it('performs NO support lifecycle mutation, stores no PHI/clinical columns, RESTRICT FKs', async () => {
    const A = await mkLab();
    const mv = await mkVersion(A, 'DEPRECATED');
    await mkInferences(A, mv.id, { count: 3 });
    const before = await raw.aiModelVersion.findUnique({ where: { id: mv.id } });
    await run(A, { modelVersionId: mv.id, windowStart: WSTART, windowEnd: WEND, cohort: 'NON_VALIDATION' });
    const after = await raw.aiModelVersion.findUnique({ where: { id: mv.id } });
    expect(after).toEqual(before); // no lifecycle mutation; still DEPRECATED, byte-identical
    expect(after?.lifecycleState).toBe('DEPRECATED');

    const models = ['EvaluationWindow', 'EvaluationWindowMember', 'EvaluationMetric', 'EvaluationRecommendation', 'EvaluationRecommendationEvidence'];
    const phi = /patient|birth|\bdob\b|ssn|mrn|firstname|lastname|demographic|address|phone/i;
    const forbidden = /shouldRetire|autoRetire|retirementApproved|certified|clinicalConfidence|\bdiagnosis\b/i;
    for (const m of models) {
      const fields = Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields;
      expect(fields.map((f) => f.name).filter((f) => phi.test(f))).toEqual([]);
      expect(fields.map((f) => f.name).filter((f) => forbidden.test(f))).toEqual([]);
    }
    for (const s of ['updateWindow', 'deleteWindow', 'retire', 'deprecate', 'promote']) expect((svc as any)[s]).toBeUndefined();
    const fks = (await raw.$queryRawUnsafe(
      `SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype='f' AND conname ~ '^(EvaluationWindow|EvaluationWindowMember|EvaluationMetric|EvaluationRecommendation|EvaluationRecommendationEvidence)_.*_fkey$'`,
    )) as Array<{ conname: string; d: string }>;
    expect(fks.length).toBeGreaterThanOrEqual(13);
    expect(fks.every((r) => r.d === 'r')).toBe(true);
  });
});
