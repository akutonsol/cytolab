import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { DatasetGovernanceService } from './dataset-governance.service';

/**
 * Program 6 · Phase 6B — dataset governance against the REAL test Postgres via the tenancy-scoped PrismaService.
 * Proves: lab scoping + cross-lab fail-closed, per-lab key + per-dataset version uniqueness, VALIDATION vs
 * TRAINING_REFERENCE kind enforcement, DRAFT→FROZEN immutability (frozen versions reject mutation; corrections =
 * new version), membership referenced by id (no PHI), structured labels + append-only lineage, immutable purpose,
 * RESTRICT on every provenance FK, and no PHI columns.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('P6-6B dataset governance (integration)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const audit = { recordEntityUpdated: jest.fn(async () => undefined) } as any;
  const svc = new DatasetGovernanceService(prisma, audit);
  const asLab = <T>(labId: string, fn: () => Promise<T>) => labContext.runLabScoped(labId, fn) as Promise<T>;
  const labIds: string[] = [];
  const mkLab = async () => { const l = await raw.lab.create({ data: { name: 'p6b', slug: `p6b-${randomUUID()}` } }); labIds.push(l.id); return l.id; };
  const mkSlide = async (labId: string) => {
    const p = await raw.patient.create({ data: { labId, registrationNo: randomUUID(), firstName: '6B', lastName: 'DS' } });
    const r = await raw.record.create({ data: { labId, identifier: randomUUID(), patientId: p.id } });
    const s = await raw.digitalSlide.create({ data: { labId, recordId: r.id, slideUrl: '', sourceKind: 'DICOM', availabilityStatus: 'DRAFT' } });
    return s.id;
  };

  afterAll(async () => {
    for (const labId of labIds) {
      for (const t of ['AnnotationLineageEvent', 'GroundTruthLabel', 'DatasetSlide', 'TrainingDatasetReference', 'DatasetVersion', 'Dataset', 'DigitalSlide', 'Record', 'Patient']) {
        await raw.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, labId);
      }
      await raw.$executeRaw`DELETE FROM "Lab" WHERE id = ${labId}`;
    }
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('is lab-scoped and fails closed cross-lab', async () => {
    const A = await mkLab(); const B = await mkLab();
    const d = await asLab(A, () => svc.createDataset({ key: 'val-set', displayName: 'Val A', kind: 'VALIDATION' }, 'op-a'));
    await expect(asLab(B, () => svc.getDataset(d.id))).rejects.toThrow(/not found/i);
    expect((await raw.dataset.findUnique({ where: { id: d.id }, select: { labId: true } }))?.labId).toBe(A);
    // a slide from lab B cannot be added to a lab-A dataset version (referenced slide not found in lab)
    const v = await asLab(A, () => svc.createVersion(d.id, { purpose: 'ALGORITHM_VALIDATION' }, 'op-a'));
    const bSlide = await mkSlide(B);
    await expect(asLab(A, () => svc.addSlide(v.id, { slideId: bSlide }))).rejects.toThrow(/not found in this lab/i);
  });

  it('enforces per-lab key uniqueness and per-dataset version numbering', async () => {
    const A = await mkLab();
    const d = await asLab(A, () => svc.createDataset({ key: 'k1', displayName: 'D1', kind: 'VALIDATION' }));
    await expect(asLab(A, () => svc.createDataset({ key: 'k1', displayName: 'dup', kind: 'VALIDATION' }))).rejects.toThrow(/already exists/i);
    const v1 = await asLab(A, () => svc.createVersion(d.id, { purpose: 'CLINICAL_QA' }));
    const v2 = await asLab(A, () => svc.createVersion(d.id, { purpose: 'CLINICAL_QA' }));
    expect([v1.versionNumber, v2.versionNumber]).toEqual([1, 2]);
  });

  it('enforces dataset kind: versions only for VALIDATION; training refs only for TRAINING_REFERENCE', async () => {
    const A = await mkLab();
    const tref = await asLab(A, () => svc.createDataset({ key: 'train-ref', displayName: 'T', kind: 'TRAINING_REFERENCE' }));
    await expect(asLab(A, () => svc.createVersion(tref.id, { purpose: 'RESEARCH' }))).rejects.toThrow(/only VALIDATION/i);
    const okRef = await asLab(A, () => svc.addTrainingReference(tref.id, { descriptor: 'external corpus', provenanceUri: 'ext://corpus/x' }));
    expect(okRef.provenanceUri).toBe('ext://corpus/x');
    const val = await asLab(A, () => svc.createDataset({ key: 'val2', displayName: 'V', kind: 'VALIDATION' }));
    await expect(asLab(A, () => svc.addTrainingReference(val.id, { descriptor: 'x', provenanceUri: 'ext://y' }))).rejects.toThrow(/only.*TRAINING_REFERENCE/i);
  });

  it('freezes DRAFT→FROZEN (immutable); mutation after freeze is rejected; corrections require a new version', async () => {
    const A = await mkLab();
    const d = await asLab(A, () => svc.createDataset({ key: 'imm', displayName: 'I', kind: 'VALIDATION' }));
    const v = await asLab(A, () => svc.createVersion(d.id, { purpose: 'REGULATORY_SUBMISSION' }));
    const slide = await mkSlide(A);
    await asLab(A, () => svc.addSlide(v.id, { slideId: slide }));
    const frozen = await asLab(A, () => svc.freezeVersion(v.id, 'op-a'));
    expect(frozen?.state).toBe('FROZEN');
    expect(frozen?.frozenAt && frozen?.manifestDigest).toBeTruthy();
    // mutation after freeze rejected
    const slide2 = await mkSlide(A);
    await expect(asLab(A, () => svc.addSlide(v.id, { slideId: slide2 }))).rejects.toThrow(/immutable/i);
    await expect(asLab(A, () => svc.setLabel(v.id, { slideId: slide, labelSchemaKey: 'dx', labelSchemaVersion: '1', labelValue: 'benign' }))).rejects.toThrow(/immutable/i);
    // re-freeze rejected (terminal)
    await expect(asLab(A, () => svc.freezeVersion(v.id))).rejects.toThrow(/already FROZEN/i);
    // correction = a NEW version
    const v2 = await asLab(A, () => svc.createVersion(d.id, { purpose: 'REGULATORY_SUBMISSION' }));
    expect(v2.versionNumber).toBe(2);
    expect(v2.state).toBe('DRAFT');
  });

  it('records structured ground-truth labels with append-only lineage (one event per assertion)', async () => {
    const A = await mkLab();
    const d = await asLab(A, () => svc.createDataset({ key: 'gt', displayName: 'G', kind: 'VALIDATION' }));
    const v = await asLab(A, () => svc.createVersion(d.id, { purpose: 'ALGORITHM_VALIDATION' }));
    const slide = await mkSlide(A);
    await asLab(A, () => svc.addSlide(v.id, { slideId: slide }));
    // label must reference a member
    const orphan = await mkSlide(A);
    await expect(asLab(A, () => svc.setLabel(v.id, { slideId: orphan, labelSchemaKey: 'dx', labelSchemaVersion: '1', labelValue: 'x' }))).rejects.toThrow(/not a member/i);
    await asLab(A, () => svc.setLabel(v.id, { slideId: slide, labelSchemaKey: 'dx', labelSchemaVersion: '1', labelValue: 'HSIL' }));
    await asLab(A, () => svc.setLabel(v.id, { slideId: slide, labelSchemaKey: 'dx', labelSchemaVersion: '1', labelValue: 'LSIL' })); // correction during DRAFT
    const labels = await raw.groundTruthLabel.findMany({ where: { datasetVersionId: v.id } });
    expect(labels.length).toBe(1); // one label per (version,slide,schemaKey)
    expect(labels[0].labelValue).toBe('LSIL');
    const lineage = await raw.annotationLineageEvent.findMany({ where: { groundTruthLabelId: labels[0].id } });
    expect(lineage.length).toBe(2); // append-only: one event per assertion (incl. the correction)
    expect(lineage.every((e) => !!e.eventId)).toBe(true);
  });

  it('purpose is immutable provenance; no service path rewrites version content', async () => {
    const A = await mkLab();
    const d = await asLab(A, () => svc.createDataset({ key: 'pp', displayName: 'P', kind: 'VALIDATION' }));
    const v = await asLab(A, () => svc.createVersion(d.id, { purpose: 'INTERNAL_BENCHMARKING' }));
    expect(v.purpose).toBe('INTERNAL_BENCHMARKING');
    expect((svc as any).updateVersion).toBeUndefined();
    expect((svc as any).setPurpose).toBeUndefined();
  });

  it('references slides/specimens by id only, stores NO PHI, and uses ON DELETE RESTRICT on every provenance FK', async () => {
    const models = ['Dataset', 'DatasetVersion', 'DatasetSlide', 'GroundTruthLabel', 'AnnotationLineageEvent', 'TrainingDatasetReference'];
    const phi = /patient|birth|\bdob\b|ssn|mrn|firstname|lastname|demographic|address|phone/i;
    for (const name of models) {
      const fields = Prisma.dmmf.datamodel.models.find((x) => x.name === name)!.fields.map((f) => f.name);
      expect(fields.filter((f) => phi.test(f))).toEqual([]);
    }
    // DB-level truth: every 6B provenance FK is ON DELETE RESTRICT (confdeltype 'r') — including the implicit
    // required-relation lab FKs (DMMF omits relationOnDelete for implicit defaults, but the DDL is RESTRICT).
    const fks = (await raw.$queryRawUnsafe(
      `SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype = 'f' AND conname ~ '^(Dataset|DatasetVersion|DatasetSlide|GroundTruthLabel|AnnotationLineageEvent|TrainingDatasetReference)_.*_fkey$'`,
    )) as Array<{ conname: string; d: string }>;
    expect(fks.length).toBeGreaterThanOrEqual(14);
    expect(fks.every((r) => r.d === 'r')).toBe(true);
    // DatasetSlide links to DigitalSlide/Specimen by reference (relation fields), not denormalized data
    const ds = Prisma.dmmf.datamodel.models.find((x) => x.name === 'DatasetSlide')!.fields;
    expect(ds.find((f) => f.name === 'slide')?.type).toBe('DigitalSlide');
    expect(ds.find((f) => f.name === 'specimen')?.type).toBe('Specimen');
  });
});
