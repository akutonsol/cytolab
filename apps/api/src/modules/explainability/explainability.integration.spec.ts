import { randomUUID } from 'node:crypto';
import { Prisma, AiModelLifecycleState, InferenceOutcome } from '@prisma/client';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { ExplainabilityService } from './explainability.service';
import { StubExplainabilityGenerator, ExplainabilityGenerator } from './explainability-generator';
import { validateProbabilityDistribution } from './explainability-artifact';

/**
 * Program 6 · Phase 6D — explainability against the REAL test Postgres via the tenancy-scoped PrismaService. Proves:
 * lab scoping + cross-lab fail-closed; eligibility (SUCCEEDED only); atomic full-set persistence (Guardrail 2) with a
 * shared generation identity; validation-only provenance inherited immutably; coordinate-space provenance snapshot
 * (Guardrail 1); deterministic content across regenerations (new identities, identical digests); probability Σ=1;
 * bounded coded region geometry; NO support inference (InferenceRecord never mutated); no rewrite path; no PHI columns;
 * every 6D provenance FK ON DELETE RESTRICT.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('P6-6D explainability (integration)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const audit = { recordEntityCreated: jest.fn(async () => undefined) } as any;
  const svc = new ExplainabilityService(prisma, audit, new StubExplainabilityGenerator());
  const asLab = <T>(labId: string, fn: () => Promise<T>) => labContext.runLabScoped(labId, fn) as Promise<T>;
  const labIds: string[] = [];

  const mkLab = async () => { const l = await raw.lab.create({ data: { name: 'p6d', slug: `p6d-${randomUUID()}` } }); labIds.push(l.id); return l.id; };
  const mkVersion = async (labId: string, state: AiModelLifecycleState = 'APPROVED') => {
    const m = await raw.aiModel.create({ data: { labId, key: `m-${randomUUID()}`, displayName: 'M', task: 'demo' } });
    const v = await raw.aiModelVersion.create({ data: { labId, modelId: m.id, semverMajor: 1, semverMinor: 0, semverPatch: 0, lifecycleState: state } });
    return v.id;
  };
  const mkSlide = async (labId: string, w = 1000, h = 800) => {
    const p = await raw.patient.create({ data: { labId, registrationNo: randomUUID(), firstName: '6D', lastName: 'DS' } });
    const r = await raw.record.create({ data: { labId, identifier: randomUUID(), patientId: p.id } });
    const s = await raw.digitalSlide.create({ data: { labId, recordId: r.id, slideUrl: '', sourceKind: 'DICOM', availabilityStatus: 'DRAFT', sourceWidth: w, sourceHeight: h } });
    return s.id;
  };
  const mkRecord = async (labId: string, opts: { outcome?: InferenceOutcome | null; validationOnly?: boolean; withSlide?: boolean } = {}) => {
    const modelVersionId = await mkVersion(labId);
    const subjectSlideId = opts.withSlide === false ? null : await mkSlide(labId);
    const rec = await raw.inferenceRecord.create({
      data: { labId, modelVersionId, subjectSlideId, inputDigest: 'a'.repeat(64), resultDigest: 'b'.repeat(64), outcome: opts.outcome === undefined ? 'SUCCEEDED' : opts.outcome, validationOnly: opts.validationOnly ?? false, adapterId: 'stub', adapterVersion: '1.0.0', engineVersion: '6c.1.0' },
    });
    return rec.id;
  };

  afterAll(async () => {
    for (const labId of labIds) {
      for (const t of ['ExplainabilityProbability', 'ExplainabilityRegion', 'ExplainabilityArtifact', 'ExplainabilityGeneration', 'InferenceRecord', 'AiModelVersion', 'AiModel', 'DigitalSlide', 'Record', 'Patient']) {
        await raw.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, labId);
      }
      await raw.$executeRaw`DELETE FROM "Lab" WHERE id = ${labId}`;
    }
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('is lab-scoped and fails closed cross-lab', async () => {
    const A = await mkLab(); const B = await mkLab();
    const rec = await mkRecord(A);
    const gen = await asLab(A, () => svc.generate({ inferenceRecordId: rec }));
    await expect(asLab(B, () => svc.getGeneration(gen.id))).rejects.toThrow(/not found/i);
    const recB = await mkRecord(B);
    await expect(asLab(A, () => svc.generate({ inferenceRecordId: recB }))).rejects.toThrow(/not found/i); // A cannot see B's record
  });

  it('enforces eligibility: SUCCEEDED only; FAILED / incomplete rejected', async () => {
    const A = await mkLab();
    const failed = await mkRecord(A, { outcome: 'FAILED' });
    const incomplete = await mkRecord(A, { outcome: null });
    const ok = await mkRecord(A, { outcome: 'SUCCEEDED' });
    await expect(asLab(A, () => svc.generate({ inferenceRecordId: failed }))).rejects.toThrow(/SUCCEEDED/);
    await expect(asLab(A, () => svc.generate({ inferenceRecordId: incomplete }))).rejects.toThrow(/SUCCEEDED/);
    await expect(asLab(A, () => svc.generate({ inferenceRecordId: ok }))).resolves.toBeTruthy();
  });

  it('atomically persists the complete artifact set under one shared generation identity', async () => {
    const A = await mkLab();
    const rec = await mkRecord(A);
    const gen = await asLab(A, () => svc.generate({ inferenceRecordId: rec }));
    const artifacts = await raw.explainabilityArtifact.findMany({ where: { generationId: gen.id } });
    expect(artifacts.map((a) => a.kind).sort()).toEqual(['ATTENTION_OVERLAY', 'FEATURE_REGION', 'HEATMAP', 'PROBABILITY_DISTRIBUTION']);
    expect(artifacts.every((a) => a.generationId === gen.id)).toBe(true); // shared set identity
    // feature-region artifact has bounded coded regions; probability artifact sums to 1
    const fr = artifacts.find((a) => a.kind === 'FEATURE_REGION')!;
    const regions = await raw.explainabilityRegion.findMany({ where: { artifactId: fr.id } });
    expect(regions.length).toBeGreaterThan(0);
    for (const r of regions) { const g = r.geometry as any; expect(g.x + g.w).toBeLessThanOrEqual(1000); expect(r.categoryCode).toMatch(/^region-/); }
    const pd = artifacts.find((a) => a.kind === 'PROBABILITY_DISTRIBUTION')!;
    const probs = await raw.explainabilityProbability.findMany({ where: { artifactId: pd.id } });
    expect(validateProbabilityDistribution(probs.map((p) => ({ classCode: p.classCode, value: p.value, ordinal: p.ordinal })))).toBeNull();
  });

  it('a validation invalidation persists NOTHING (all-or-nothing atomicity)', async () => {
    const A = await mkLab();
    const rec = await mkRecord(A);
    const badGen: ExplainabilityGenerator = {
      generatorId: 'bad', generatorVersion: '0.0.0',
      generate: async () => [{ kind: 'PROBABILITY_DISTRIBUTION', contentDigest: 'a'.repeat(64), contentRef: null, probabilities: [{ classCode: 'x', value: 2, ordinal: 0 }] }],
    };
    const badSvc = new ExplainabilityService(prisma, audit, badGen);
    await expect(asLab(A, () => badSvc.generate({ inferenceRecordId: rec }))).rejects.toThrow(/sum to 1/);
    expect(await raw.explainabilityGeneration.count({ where: { inferenceRecordId: rec } })).toBe(0); // nothing persisted
    expect(await raw.explainabilityArtifact.count({ where: { inferenceRecordId: rec } })).toBe(0);
  });

  it('inherits validation-only provenance immutably from the record', async () => {
    const A = await mkLab();
    const rec = await mkRecord(A, { validationOnly: true });
    const gen = await asLab(A, () => svc.generate({ inferenceRecordId: rec }));
    expect(gen.validationOnly).toBe(true);
    const artifacts = await raw.explainabilityArtifact.findMany({ where: { generationId: gen.id } });
    expect(artifacts.every((a) => a.validationOnly === true)).toBe(true);
  });

  it('records immutable coordinate-space provenance (Guardrail 1)', async () => {
    const A = await mkLab();
    const rec = await mkRecord(A);
    const gen = await asLab(A, () => svc.generate({ inferenceRecordId: rec }));
    expect(gen.coordinateSpace).toMatch(/^slide-pixel@1000x800$/);
    expect(gen.slideWidthPx).toBe(1000);
    expect(gen.slideHeightPx).toBe(800);
    const fr = (await raw.explainabilityArtifact.findMany({ where: { generationId: gen.id, kind: 'FEATURE_REGION' } }))[0];
    expect(fr.coordinateSpace).toMatch(/^slide-pixel@1000x800$/);
    expect(fr.slideId).toBeTruthy();
  });

  it('regeneration is deterministic content with NEW identities; prior artifacts are untouched (append-only)', async () => {
    const A = await mkLab();
    const rec = await mkRecord(A);
    const g1 = await asLab(A, () => svc.generate({ inferenceRecordId: rec }));
    const g2 = await asLab(A, () => svc.generate({ inferenceRecordId: rec }));
    expect(g2.generationUuid).not.toBe(g1.generationUuid); // new set identity
    const digestsOf = (g: any) => g.artifacts.map((a: any) => `${a.kind}:${a.contentDigest}`).sort();
    expect(digestsOf(g2)).toEqual(digestsOf(g1)); // identical semantic content (Decision 10)
    expect(g2.artifacts.map((a: any) => a.artifactUuid).sort()).not.toEqual(g1.artifacts.map((a: any) => a.artifactUuid).sort());
    expect(await raw.explainabilityGeneration.count({ where: { inferenceRecordId: rec } })).toBe(2); // both sets retained
    // no service path mutates a prior artifact
    for (const s of ['updateArtifact', 'editArtifact', 'deleteGeneration', 'overwrite']) expect((svc as any)[s]).toBeUndefined();
  });

  it('performs NO support inference — the InferenceRecord is never mutated', async () => {
    const A = await mkLab();
    const rec = await mkRecord(A);
    const before = await raw.inferenceRecord.findUnique({ where: { id: rec } });
    await asLab(A, () => svc.generate({ inferenceRecordId: rec }));
    const after = await raw.inferenceRecord.findUnique({ where: { id: rec } });
    expect(after).toEqual(before); // byte-identical: outcome/result/validationOnly/etc unchanged
  });

  it('stores no PHI / no diagnostic-correctness columns and uses ON DELETE RESTRICT on every provenance FK', async () => {
    const phi = /patient|birth|\bdob\b|ssn|mrn|firstname|lastname|demographic|address|phone/i;
    const forbidden = /diagnos|disease|malign|benign|\bgrade\b|bethesda|correct|accuracy|clinicalConfidence|groundTruth|validated|approvedInterpretation/i;
    for (const m of ['ExplainabilityGeneration', 'ExplainabilityArtifact', 'ExplainabilityRegion', 'ExplainabilityProbability']) {
      const fields = Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields.map((f) => f.name);
      expect(fields.filter((f) => phi.test(f))).toEqual([]);
      expect(fields.filter((f) => forbidden.test(f))).toEqual([]);
    }
    const fks = (await raw.$queryRawUnsafe(
      `SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype='f' AND conname ~ '^(ExplainabilityGeneration|ExplainabilityArtifact|ExplainabilityRegion|ExplainabilityProbability)_.*_fkey$'`,
    )) as Array<{ conname: string; d: string }>;
    expect(fks.length).toBeGreaterThanOrEqual(11);
    expect(fks.every((r) => r.d === 'r')).toBe(true);
  });
});
