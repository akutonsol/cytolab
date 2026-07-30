import { randomUUID } from 'node:crypto';
import { Prisma, AiModelLifecycleState, HumanReviewDecisionType, InferenceOutcome } from '@prisma/client';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { ClinicalPerfService } from './clinical-perf.service';
import { StubClinicalPerfEvaluator, ClinicalPerfEvaluator } from './clinical-perf-evaluator';

/**
 * Program 6 · Phase 6H — clinical performance against the REAL test Postgres via the tenancy-scoped PrismaService.
 * Proves: lab scoping + cross-lab fail-closed; eligibility; immutable window + dual-source membership snapshot; cohort
 * separation; observed measurements + synthetic/unavailable provenance; truthful empty windows; baseline
 * compatibility; deterministic calculationId + windowSignature; atomic persistence; NO diagnostic authority / NO
 * clinical or lifecycle mutation; NO recommendation entity; no PHI / no clinical-authority columns; RESTRICT FKs.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;
const WSTART = '2026-06-01T00:00:00.000Z';
const WEND = '2026-06-02T00:00:00.000Z';
const IN_WINDOW = new Date('2026-06-01T12:00:00.000Z');

describeIf('P6-6H clinical performance (integration)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const audit = { recordEntityCreated: jest.fn(async () => undefined) } as any;
  const svc = new ClinicalPerfService(prisma, audit, new StubClinicalPerfEvaluator());
  const asLab = <T>(labId: string, fn: () => Promise<T>) => labContext.runLabScoped(labId, fn) as Promise<T>;
  const labIds: string[] = [];
  const accountByLab = new Map<string, string>();

  const mkLab = async () => { const l = await raw.lab.create({ data: { name: 'p6h', slug: `p6h-${randomUUID()}` } }); labIds.push(l.id); return l.id; };
  const mkVersion = async (labId: string, state: AiModelLifecycleState = 'APPROVED') => {
    const m = await raw.aiModel.create({ data: { labId, key: `m-${randomUUID()}`, displayName: 'M', task: 'demo' } });
    const v = await raw.aiModelVersion.create({ data: { labId, modelId: m.id, semverMajor: 1, semverMinor: 0, semverPatch: 0, lifecycleState: state, artifactDigest: 'a'.repeat(64) } });
    return { id: v.id, versionUuid: v.versionUuid, modelUuid: m.modelUuid };
  };
  const mkUser = async (labId: string) => {
    if (!accountByLab.has(labId)) accountByLab.set(labId, (await raw.account.create({ data: { labId, name: 'p6h-acct' } })).id);
    return (await raw.user.create({ data: { labId, accountId: accountByLab.get(labId)!, email: `u-${randomUUID()}@t.test`, passwordHash: 'x', firstName: 'R', lastName: 'V' } })).id;
  };
  const mkInference = async (labId: string, mvId: string, opts: { outcome?: InferenceOutcome; validationOnly?: boolean } = {}) =>
    (await raw.inferenceRecord.create({ data: { labId, modelVersionId: mvId, inputDigest: 'a'.repeat(64), outcome: opts.outcome ?? 'SUCCEEDED', validationOnly: opts.validationOnly ?? false, durationMs: 100, adapterId: 'stub', adapterVersion: '1.0.0', engineVersion: '6c.1.0', createdAt: IN_WINDOW } })).id;
  const mkDecision = async (labId: string, mvId: string, reviewerId: string, opts: { decision?: HumanReviewDecisionType; validationOnly?: boolean }) => {
    const irId = await mkInference(labId, mvId, { validationOnly: opts.validationOnly });
    const req = await raw.humanReviewRequest.create({ data: { labId, inferenceRecordId: irId, state: 'COMPLETED', validationOnly: opts.validationOnly ?? false, completedAt: IN_WINDOW } });
    return (await raw.humanReviewDecision.create({ data: { labId, requestId: req.id, inferenceRecordId: irId, reviewerUserId: reviewerId, reviewDecision: opts.decision ?? 'ACCEPT', validationOnly: opts.validationOnly ?? false, reviewedModelVersionId: mvId, reviewedResultDigest: 'b'.repeat(64), eventId: randomUUID(), submittedAt: IN_WINDOW } })).id;
  };
  const mkValidationRun = async (labId: string, mv: { id: string; versionUuid: string; modelUuid: string }) => {
    const d = await raw.dataset.create({ data: { labId, key: `k-${randomUUID()}`, displayName: 'D', kind: 'VALIDATION' } });
    const dv = await raw.datasetVersion.create({ data: { labId, datasetId: d.id, versionNumber: 1, state: 'FROZEN', purpose: 'ALGORITHM_VALIDATION', manifestDigest: 'm'.repeat(64), frozenAt: new Date() } });
    return (await raw.validationRun.create({ data: { labId, modelVersionId: mv.id, datasetVersionId: dv.id, groundTruthDigest: 'g'.repeat(64), modelVersionUuid: mv.versionUuid, modelUuid: mv.modelUuid, modelLifecycleStateAtRun: 'APPROVED', validatorId: 'stub', validatorVersion: '1.0.0', computationVersion: '6f.1.0', metricSchemaVersion: 'validation-metrics-1.0', calculationId: 'c'.repeat(64), eventId: randomUUID() } })).id;
  };
  const run = (labId: string, dto: any) => asLab(labId, () => svc.runMeasurement(dto));

  afterAll(async () => {
    for (const labId of labIds) {
      for (const t of ['ClinicalPerfMetric', 'ClinicalPerfWindowMember', 'ClinicalPerfWindow', 'ValidationCurvePoint', 'ValidationConfusionCell', 'ValidationMetric', 'ValidationRun', 'DatasetVersion', 'Dataset', 'HumanReviewModifiedFinding', 'HumanReviewDecision', 'HumanReviewRequestEvent', 'HumanReviewRequest', 'InferenceRecord', 'AiModelVersion', 'AiModel', 'User', 'Account']) {
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
    await mkInference(A, mv.id);
    const w = await run(A, { modelVersionId: mv.id, windowStart: WSTART, windowEnd: WEND, cohort: 'CLINICAL' });
    await expect(asLab(B, () => svc.getWindow(w.id))).rejects.toThrow(/not found/i);
    const bmv = await mkVersion(B, 'APPROVED');
    await expect(run(A, { modelVersionId: bmv.id, windowStart: WSTART, windowEnd: WEND, cohort: 'CLINICAL' })).rejects.toThrow(/not found/i);
    for (const s of ['DRAFT', 'RETIRED'] as const) {
      const bad = await mkVersion(A, s);
      await expect(run(A, { modelVersionId: bad.id, windowStart: WSTART, windowEnd: WEND, cohort: 'CLINICAL' })).rejects.toThrow(/VALIDATION, APPROVED, or DEPRECATED/);
    }
    await expect(run(A, { modelVersionId: mv.id, windowStart: WEND, windowEnd: WSTART, cohort: 'CLINICAL' })).rejects.toThrow(/before/);
  });

  it('snapshots dual-source membership (6C + 6E) and separates cohorts', async () => {
    const A = await mkLab();
    const mv = await mkVersion(A, 'APPROVED');
    const reviewer = await mkUser(A);
    await mkInference(A, mv.id, { validationOnly: false });
    await mkDecision(A, mv.id, reviewer, { decision: 'ACCEPT', validationOnly: false }); // adds 1 inference + 1 decision
    await mkDecision(A, mv.id, reviewer, { decision: 'ACCEPT', validationOnly: true }); // validation-only cohort
    const wClin = await run(A, { modelVersionId: mv.id, windowStart: WSTART, windowEnd: WEND, cohort: 'CLINICAL' });
    // clinical cohort: 2 inferences (standalone + the decision's) + 1 decision = 3 members
    expect(wClin.sampleCount).toBe(3);
    const members = await raw.clinicalPerfWindowMember.findMany({ where: { windowId: wClin.id } });
    expect(members.filter((m) => m.source === 'HUMAN_REVIEW_DECISION').length).toBe(1);
    expect(members.filter((m) => m.source === 'INFERENCE_RECORD').length).toBe(2);
    expect(members.every((m) => (m.source === 'HUMAN_REVIEW_DECISION') === !!m.humanReviewDecisionId)).toBe(true);
    const wVal = await run(A, { modelVersionId: mv.id, windowStart: WSTART, windowEnd: WEND, cohort: 'VALIDATION_ONLY' });
    expect(wVal.sampleCount).toBe(2); // 1 validation-only inference + 1 validation-only decision
    expect(wVal.metrics.every((m) => m.cohort === 'VALIDATION_ONLY')).toBe(true);
  });

  it('records observed measurements + synthetic/unavailable provenance (agreement/concordance are consistency)', async () => {
    const A = await mkLab();
    const mv = await mkVersion(A, 'APPROVED');
    const reviewer = await mkUser(A);
    for (const d of ['ACCEPT', 'ACCEPT', 'ACCEPT', 'REJECT'] as const) await mkDecision(A, mv.id, reviewer, { decision: d });
    const w = await run(A, { modelVersionId: mv.id, windowStart: WSTART, windowEnd: WEND, cohort: 'CLINICAL' });
    const agr = w.metrics.find((m) => m.metricKind === 'READER_AGREEMENT')!;
    expect(agr.provenance).toBe('OBSERVED'); expect(agr.value).toBeCloseTo(0.75, 4);
    expect(w.metrics.find((m) => m.metricKind === 'WORKLOAD_REDUCTION')!.provenance).toBe('SYNTHETIC_STUB');
    expect(w.metrics.find((m) => m.metricKind === 'TURNAROUND_DURATION')!.provenance).toBe('UNAVAILABLE');
    expect(w.metrics.find((m) => m.metricKind === 'OPERATIONAL_THROUGHPUT')!.provenance).toBe('OBSERVED');
    expect(w.metrics.every((m) => ['6c', '6e', '6c+6e', '6f', 'program5-operational', 'synthetic'].includes(m.sourceSubsystem))).toBe(true);
  });

  it('records an EMPTY window truthfully; a same-model baseline is compatible', async () => {
    const A = await mkLab();
    const mv = await mkVersion(A, 'APPROVED');
    const empty = await run(A, { modelVersionId: mv.id, windowStart: '2020-01-01T00:00:00.000Z', windowEnd: '2020-01-02T00:00:00.000Z', cohort: 'CLINICAL' });
    expect(empty.sampleCount).toBe(0); expect(empty.coverageStatus).toBe('EMPTY');
    expect(empty.metrics.find((m) => m.metricKind === 'WORKLOAD_COUNT')!.value).toBe(0);
    await mkInference(A, mv.id);
    const other = await mkVersion(A, 'APPROVED');
    await expect(run(A, { modelVersionId: mv.id, windowStart: WSTART, windowEnd: WEND, cohort: 'CLINICAL', baselineValidationRunId: await mkValidationRun(A, other) })).rejects.toThrow(/different model version/);
    const w = await run(A, { modelVersionId: mv.id, windowStart: WSTART, windowEnd: WEND, cohort: 'CLINICAL', baselineValidationRunId: await mkValidationRun(A, mv) });
    expect(w.evidenceCompatibility).toBe('OBSERVED');
  });

  it('is deterministic with a stable windowSignature; re-measurement is a new window; atomic on invalid output', async () => {
    const A = await mkLab();
    const mv = await mkVersion(A, 'APPROVED');
    await mkInference(A, mv.id); await mkInference(A, mv.id);
    const dto = { modelVersionId: mv.id, windowStart: WSTART, windowEnd: WEND, cohort: 'CLINICAL' as const };
    const w1 = await run(A, dto); const w2 = await run(A, dto);
    expect(w2.windowUuid).not.toBe(w1.windowUuid);
    expect(w2.calculationId).toBe(w1.calculationId); expect(w2.windowSignature).toBe(w1.windowSignature);
    expect(w2.completionState).toBe('COMPLETE');
    const badEvaluator: ClinicalPerfEvaluator = { evaluatorId: 'bad', evaluatorVersion: '0', evaluate: async () => ({ calculationId: 'a'.repeat(64), coverageStatus: 'SPARSE', metrics: [{ metricKind: 'READER_AGREEMENT', provenance: 'OBSERVED', cohort: 'CLINICAL', sourceSubsystem: '6e', value: 2, ordinal: 0 }] }) };
    const badSvc = new ClinicalPerfService(prisma, audit, badEvaluator);
    const before = await raw.clinicalPerfWindow.count({ where: { labId: A } });
    await expect(asLab(A, () => badSvc.runMeasurement({ modelVersionId: mv.id, windowStart: WSTART, windowEnd: WEND, cohort: 'CLINICAL' } as any))).rejects.toThrow(/\[0,1\]/);
    expect(await raw.clinicalPerfWindow.count({ where: { labId: A } })).toBe(before);
  });

  it('has NO diagnostic authority: never mutates the model/inference/decision; no recommendation/claim columns; RESTRICT FKs', async () => {
    const A = await mkLab();
    const mv = await mkVersion(A, 'DEPRECATED');
    const reviewer = await mkUser(A);
    const irId = await mkInference(A, mv.id);
    const decId = await mkDecision(A, mv.id, reviewer, { decision: 'ACCEPT' });
    const mvBefore = await raw.aiModelVersion.findUnique({ where: { id: mv.id } });
    const irBefore = await raw.inferenceRecord.findUnique({ where: { id: irId } });
    const decBefore = await raw.humanReviewDecision.findUnique({ where: { id: decId } });
    await run(A, { modelVersionId: mv.id, windowStart: WSTART, windowEnd: WEND, cohort: 'CLINICAL' });
    expect(await raw.aiModelVersion.findUnique({ where: { id: mv.id } })).toEqual(mvBefore); // lifecycle unchanged (still DEPRECATED)
    expect(await raw.inferenceRecord.findUnique({ where: { id: irId } })).toEqual(irBefore); // inference untouched
    expect(await raw.humanReviewDecision.findUnique({ where: { id: decId } })).toEqual(decBefore); // decision untouched

    // no recommendation entity (Guardrail 5); no claim/clinical-authority/PHI columns (Decision 1)
    expect(Prisma.dmmf.datamodel.models.find((x) => /ClinicalPerf.*Recommendation/i.test(x.name))).toBeUndefined();
    const models = ['ClinicalPerfWindow', 'ClinicalPerfWindowMember', 'ClinicalPerfMetric'];
    const phi = /patient|birth|\bdob\b|ssn|mrn|firstname|lastname|demographic|address|phone/i;
    const forbidden = /clinicallyValid|clinicallyApproved|clinicallyVerified|clinicallySafe|clinicallyEffective|FDA|certified|diagnosticAccuracy|superiorTo|nonInferior|\bdiagnosis\b|\bcorrect\b|recommend/i;
    for (const m of models) {
      const fields = Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields;
      expect(fields.map((f) => f.name).filter((f) => phi.test(f))).toEqual([]);
      expect(fields.map((f) => f.name).filter((f) => forbidden.test(f))).toEqual([]);
      // membership references only AI-evidence layers, never a Program-5 clinical object (Guardrail 1)
      expect(fields.some((f) => ['ResultSheet', 'Record', 'RecordStatusEvent', 'AiDraft', 'Patient'].includes(f.type))).toBe(false);
    }
    const fks = (await raw.$queryRawUnsafe(
      `SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype='f' AND conname ~ '^(ClinicalPerfWindow|ClinicalPerfWindowMember|ClinicalPerfMetric)_.*_fkey$'`,
    )) as Array<{ conname: string; d: string }>;
    expect(fks.length).toBeGreaterThanOrEqual(9);
    expect(fks.every((r) => r.d === 'r')).toBe(true);
  });
});
