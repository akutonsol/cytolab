import { randomUUID } from 'node:crypto';
import { Prisma, AiModelLifecycleState, DatasetVersionState } from '@prisma/client';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { ValidationService } from './validation.service';
import { StubValidationValidator, ValidationValidator } from './validation-validator';

/**
 * Program 6 · Phase 6F — validation against the REAL test Postgres via the tenancy-scoped PrismaService. Proves:
 * lab scoping + cross-lab fail-closed; eligibility (FROZEN dataset + VALIDATION/APPROVED model); dataset + model +
 * config identity snapshots (Guardrails 1/2/5); metric provenance + schema version (Guardrails 3/7); deterministic
 * reproducibility (Guardrail 4); atomic all-or-nothing persistence (Guardrail 6); cross-run independence
 * (Guardrail 8); structured validated metrics/cells/points; validation attached to the model version; NO support
 * lifecycle promotion (model lifecycle unchanged); no PHI / clinical-authority columns; every FK RESTRICT.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('P6-6F validation (integration)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const audit = { recordEntityCreated: jest.fn(async () => undefined) } as any;
  const svc = new ValidationService(prisma, audit, new StubValidationValidator());
  const asLab = <T>(labId: string, fn: () => Promise<T>) => labContext.runLabScoped(labId, fn) as Promise<T>;
  const labIds: string[] = [];

  const mkLab = async () => { const l = await raw.lab.create({ data: { name: 'p6f', slug: `p6f-${randomUUID()}` } }); labIds.push(l.id); return l.id; };
  const mkVersion = async (labId: string, state: AiModelLifecycleState = 'APPROVED') => {
    const m = await raw.aiModel.create({ data: { labId, key: `m-${randomUUID()}`, displayName: 'M', task: 'demo' } });
    const v = await raw.aiModelVersion.create({ data: { labId, modelId: m.id, semverMajor: 1, semverMinor: 0, semverPatch: 0, lifecycleState: state, artifactDigest: 'a'.repeat(64) } });
    return { id: v.id, versionUuid: v.versionUuid, modelUuid: m.modelUuid };
  };
  const mkSlide = async (labId: string) => {
    const p = await raw.patient.create({ data: { labId, registrationNo: randomUUID(), firstName: '6F', lastName: 'V' } });
    const r = await raw.record.create({ data: { labId, identifier: randomUUID(), patientId: p.id } });
    const s = await raw.digitalSlide.create({ data: { labId, recordId: r.id, slideUrl: '', sourceKind: 'DICOM', availabilityStatus: 'DRAFT' } });
    return s.id;
  };
  const mkDatasetVersion = async (labId: string, state: DatasetVersionState = 'FROZEN') => {
    const d = await raw.dataset.create({ data: { labId, key: `k-${randomUUID()}`, displayName: 'D', kind: 'VALIDATION' } });
    const v = await raw.datasetVersion.create({ data: { labId, datasetId: d.id, versionNumber: 1, state, purpose: 'ALGORITHM_VALIDATION', manifestDigest: state === 'FROZEN' ? 'm'.repeat(64) : null, frozenAt: state === 'FROZEN' ? new Date() : null } });
    if (state === 'FROZEN') {
      for (let i = 0; i < 2; i++) {
        const slide = await mkSlide(labId);
        await raw.groundTruthLabel.create({ data: { labId, datasetVersionId: v.id, slideId: slide, labelSchemaKey: 'dx', labelSchemaVersion: '1', labelValue: `class-${i}` } });
      }
    }
    return v.id;
  };

  afterAll(async () => {
    for (const labId of labIds) {
      for (const t of ['ValidationCurvePoint', 'ValidationConfusionCell', 'ValidationMetric', 'ValidationRun', 'GroundTruthLabel', 'DatasetVersion', 'Dataset', 'AiModelVersion', 'AiModel', 'DigitalSlide', 'Record', 'Patient']) {
        await raw.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, labId);
      }
      await raw.$executeRaw`DELETE FROM "Lab" WHERE id = ${labId}`;
    }
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('is lab-scoped and fails closed cross-lab', async () => {
    const A = await mkLab(); const B = await mkLab();
    const mv = await mkVersion(A); const dv = await mkDatasetVersion(A);
    const run = await asLab(A, () => svc.runValidation({ modelVersionId: mv.id, datasetVersionId: dv }));
    await expect(asLab(B, () => svc.getRun(run.id))).rejects.toThrow(/not found/i);
    const bmv = await mkVersion(B);
    await expect(asLab(A, () => svc.runValidation({ modelVersionId: bmv.id, datasetVersionId: dv }))).rejects.toThrow(/not found/i);
  });

  it('enforces eligibility: FROZEN dataset + VALIDATION/APPROVED model only', async () => {
    const A = await mkLab();
    const dvFrozen = await mkDatasetVersion(A, 'FROZEN');
    const dvDraft = await mkDatasetVersion(A, 'DRAFT');
    for (const s of ['DRAFT', 'DEPRECATED', 'RETIRED'] as const) {
      const mv = await mkVersion(A, s);
      await expect(asLab(A, () => svc.runValidation({ modelVersionId: mv.id, datasetVersionId: dvFrozen }))).rejects.toThrow(/VALIDATION or APPROVED/);
    }
    const mvOk = await mkVersion(A, 'VALIDATION');
    await expect(asLab(A, () => svc.runValidation({ modelVersionId: mvOk.id, datasetVersionId: dvDraft }))).rejects.toThrow(/FROZEN/);
    await expect(asLab(A, () => svc.runValidation({ modelVersionId: mvOk.id, datasetVersionId: dvFrozen }))).resolves.toBeTruthy();
  });

  it('records an immutable evidence graph + identity snapshots (Guardrails 1/2/5/7) + metric provenance (Guardrail 3)', async () => {
    const A = await mkLab();
    const mv = await mkVersion(A, 'APPROVED');
    const dv = await mkDatasetVersion(A);
    const run = await asLab(A, () => svc.runValidation({ modelVersionId: mv.id, datasetVersionId: dv, config: { thresholds: { t: 0.5 }, metrics: { set: 'core' }, computation: { mode: 'demo' } } }));
    // Guardrail 2 — model snapshot
    expect(run.modelVersionUuid).toBe(mv.versionUuid);
    expect(run.modelUuid).toBe(mv.modelUuid);
    expect(run.modelArtifactDigest).toBe('a'.repeat(64));
    expect(run.modelLifecycleStateAtRun).toBe('APPROVED');
    // Guardrail 1 — dataset snapshot
    expect(run.datasetManifestDigest).toBe('m'.repeat(64));
    expect(run.groundTruthDigest).toMatch(/^[a-f0-9]{64}$/);
    // Guardrail 5 — config snapshot digests
    for (const d of [run.configDigest, run.thresholdConfigDigest, run.metricSelectionDigest, run.computationConfigDigest]) expect(d).toMatch(/^[a-f0-9]{64}$/);
    // Guardrails 3/7 — computation + metric-schema provenance
    expect(run.computationVersion).toBe('6f.1.0');
    expect(run.metricSchemaVersion).toBe('validation-metrics-1.0');
    expect(run.calculationId).toMatch(/^[a-f0-9]{64}$/);
    // structured evidence graph
    const metrics = await raw.validationMetric.findMany({ where: { runId: run.id } });
    const cells = await raw.validationConfusionCell.findMany({ where: { runId: run.id } });
    const points = await raw.validationCurvePoint.findMany({ where: { runId: run.id } });
    expect(metrics.length).toBeGreaterThanOrEqual(6);
    expect(cells.length).toBe(4);
    expect(points.length).toBeGreaterThanOrEqual(4);
    // metric provenance + in-range
    for (const m of metrics.filter((x) => x.metricKind !== 'OPERATING_THRESHOLD')) expect(m.numeratorSource).toBeTruthy();
    for (const m of metrics.filter((x) => x.value != null)) expect(m.value! >= 0 && m.value! <= 1).toBe(true);
    for (const c of cells) expect(c.count >= 0 && Number.isInteger(c.count)).toBe(true);
    for (const p of points) expect(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1).toBe(true);
  });

  it('is deterministic and creates fully independent evidence per run (Guardrails 4/8)', async () => {
    const A = await mkLab();
    const mv = await mkVersion(A, 'APPROVED');
    const dv = await mkDatasetVersion(A);
    const cfg = { thresholds: { t: 0.5 } };
    const r1 = await asLab(A, () => svc.runValidation({ modelVersionId: mv.id, datasetVersionId: dv, config: cfg }));
    const r2 = await asLab(A, () => svc.runValidation({ modelVersionId: mv.id, datasetVersionId: dv, config: cfg }));
    expect(r2.runUuid).not.toBe(r1.runUuid); // new independent run
    expect(r2.calculationId).toBe(r1.calculationId); // deterministic semantic content
    const sig = async (id: string) => JSON.stringify((await raw.validationMetric.findMany({ where: { runId: id }, select: { metricKind: true, value: true, ordinal: true }, orderBy: { ordinal: 'asc' } })));
    expect(await sig(r2.id)).toBe(await sig(r1.id)); // identical metric values
    // cross-run independence: each run owns its own child rows (disjoint), and revalidation added a full second graph
    const c1 = await raw.validationConfusionCell.findMany({ where: { runId: r1.id }, select: { id: true } });
    const c2 = await raw.validationConfusionCell.findMany({ where: { runId: r2.id }, select: { id: true } });
    expect(c1.length).toBe(4); expect(c2.length).toBe(4);
    expect(c1.some((a) => c2.find((b) => b.id === a.id))).toBe(false); // no shared child entities
  });

  it('is atomic — an invalid validator output persists NOTHING (Guardrail 6)', async () => {
    const A = await mkLab();
    const mv = await mkVersion(A, 'APPROVED');
    const dv = await mkDatasetVersion(A);
    const badValidator: ValidationValidator = {
      validatorId: 'bad', validatorVersion: '0.0.0',
      validate: async () => ({ calculationId: 'a'.repeat(64), metrics: [{ metricKind: 'SENSITIVITY', value: 2, ordinal: 0 }], confusionCells: [{ trueClassCode: 'a', predClassCode: 'a', count: 1 }], curvePoints: [] }),
    };
    const badSvc = new ValidationService(prisma, audit, badValidator);
    const before = await raw.validationRun.count({ where: { labId: A } });
    await expect(asLab(A, () => badSvc.runValidation({ modelVersionId: mv.id, datasetVersionId: dv }))).rejects.toThrow(/\[0,1\]/);
    expect(await raw.validationRun.count({ where: { labId: A } })).toBe(before); // nothing persisted
    expect(await raw.validationMetric.count({ where: { labId: A } })).toBe(0);
  });

  it('performs NO support lifecycle promotion — the model version is never mutated', async () => {
    const A = await mkLab();
    const mv = await mkVersion(A, 'VALIDATION');
    const dv = await mkDatasetVersion(A);
    const before = await raw.aiModelVersion.findUnique({ where: { id: mv.id } });
    await asLab(A, () => svc.runValidation({ modelVersionId: mv.id, datasetVersionId: dv }));
    const after = await raw.aiModelVersion.findUnique({ where: { id: mv.id } });
    expect(after).toEqual(before); // lifecycle unchanged; model version byte-identical
    expect(after?.lifecycleState).toBe('VALIDATION'); // NOT promoted to APPROVED
  });

  it('attaches to the model version, stores no PHI / clinical-authority columns, has no rewrite path, RESTRICT FKs', async () => {
    const models = ['ValidationRun', 'ValidationMetric', 'ValidationConfusionCell', 'ValidationCurvePoint'];
    const phi = /patient|birth|\bdob\b|ssn|mrn|firstname|lastname|demographic|address|phone/i;
    const claim = /certified|\bapproved\b|clinicallyAccurate|fdaValidated|diagnosticQuality|provenSafe|\bdiagnosis\b|clinicalConfidence/i;
    for (const m of models) {
      const fields = Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields;
      expect(fields.map((f) => f.name).filter((f) => phi.test(f))).toEqual([]);
      expect(fields.map((f) => f.name).filter((f) => claim.test(f))).toEqual([]);
    }
    // validation is attached to the model version, not a slide/patient/inference
    const runFields = Prisma.dmmf.datamodel.models.find((x) => x.name === 'ValidationRun')!.fields;
    expect(runFields.find((f) => f.name === 'modelVersion')?.type).toBe('AiModelVersion');
    expect(runFields.some((f) => ['DigitalSlide', 'Patient', 'InferenceRecord'].includes(f.type))).toBe(false);
    for (const s of ['updateRun', 'editRun', 'deleteRun', 'promote']) expect((svc as any)[s]).toBeUndefined();
    const fks = (await raw.$queryRawUnsafe(
      `SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype='f' AND conname ~ '^(ValidationRun|ValidationMetric|ValidationConfusionCell|ValidationCurvePoint)_.*_fkey$'`,
    )) as Array<{ conname: string; d: string }>;
    expect(fks.length).toBeGreaterThanOrEqual(9);
    expect(fks.every((r) => r.d === 'r')).toBe(true);
  });
});
