import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { AiRegistryService } from './ai-registry.service';

/**
 * Program 6 · Phase 6A — the AI registry against the REAL test Postgres, driven through the tenancy-scoped
 * PrismaService. Proves: lab scoping (cross-lab fail-closed), per-(lab,model) semver uniqueness, permanent-UUID
 * identity independent of key/name/semver, version content/provenance immutability, legal-only lifecycle
 * transitions with exactly one append-only event each, RETIRED terminal, the inference SHELL has no write path
 * and stays empty, and no PHI columns exist.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('P6-6A AI registry (integration)', () => {
  const raw = createTestPrisma(); // unscoped — seed + teardown + cross-lab truth
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext); // lab-scoped client (tenancy guard applied)
  const audit = { recordEntityUpdated: jest.fn(async () => undefined) } as any;
  const svc = new AiRegistryService(prisma, audit);
  const asLab = <T>(labId: string, fn: () => Promise<T>) => labContext.runLabScoped(labId, fn) as Promise<T>;
  const labIds: string[] = [];
  const mkLab = async () => { const l = await raw.lab.create({ data: { name: 'p6', slug: `p6-${randomUUID()}` } }); labIds.push(l.id); return l.id; };

  afterAll(async () => {
    for (const labId of labIds) {
      await raw.$executeRaw`DELETE FROM "AiModelLifecycleEvent" WHERE "labId" = ${labId}`;
      await raw.$executeRaw`DELETE FROM "InferenceRecord" WHERE "labId" = ${labId}`;
      await raw.$executeRaw`DELETE FROM "AiModelVersion" WHERE "labId" = ${labId}`;
      await raw.$executeRaw`DELETE FROM "AiModel" WHERE "labId" = ${labId}`;
      await raw.$executeRaw`DELETE FROM "Lab" WHERE id = ${labId}`;
    }
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('is lab-scoped and fails closed cross-lab', async () => {
    const A = await mkLab(); const B = await mkLab();
    const m = await asLab(A, () => svc.createModel({ key: 'tumor-detect', displayName: 'Model A', task: 'demo detector' }));
    await expect(asLab(B, () => svc.getModel(m.id))).rejects.toThrow(/not found/i); // Lab B cannot read Lab A's model
    await expect(asLab(A, () => svc.getModel(m.id))).resolves.toMatchObject({ id: m.id });
    const bList = await asLab(B, () => svc.listModels());
    expect(bList.find((x) => x.id === m.id)).toBeUndefined();
  });

  it('enforces semver uniqueness per (lab, model); permanent UUIDs are stable across metadata edits', async () => {
    const A = await mkLab();
    const m1 = await asLab(A, () => svc.createModel({ key: 'k1', displayName: 'D1', task: 't1' }));
    const v = await asLab(A, () => svc.createVersion(m1.id, { semverMajor: 1, semverMinor: 0, semverPatch: 0 }));
    await expect(asLab(A, () => svc.createVersion(m1.id, { semverMajor: 1, semverMinor: 0, semverPatch: 0 }))).rejects.toThrow(/already exists/i);
    await expect(asLab(A, () => svc.createVersion(m1.id, { semverMajor: 1, semverMinor: 0, semverPatch: 1 }))).resolves.toBeTruthy();
    // the same semver is allowed for a DIFFERENT logical model (uniqueness is per model, not per lab)
    const m2 = await asLab(A, () => svc.createModel({ key: 'k2', displayName: 'D2', task: 't2' }));
    await expect(asLab(A, () => svc.createVersion(m2.id, { semverMajor: 1, semverMinor: 0, semverPatch: 0 }))).resolves.toBeTruthy();
    // permanent identity independent of key/displayName/semver
    const updated = await asLab(A, () => svc.updateModel(m1.id, { displayName: 'D1-renamed', task: 't1-b' }));
    expect(updated.modelUuid).toBe(m1.modelUuid);
    expect(updated.key).toBe('k1');
    expect(updated.displayName).toBe('D1-renamed');
    expect((await asLab(A, () => svc.getVersion(v.id))).versionUuid).toBe(v.versionUuid);
  });

  it('version content/provenance is immutable after creation (no rewrite path)', async () => {
    const A = await mkLab();
    const m = await asLab(A, () => svc.createModel({ key: 'prov', displayName: 'P', task: 't' }));
    const digest = 'a'.repeat(64);
    const v = await asLab(A, () => svc.createVersion(m.id, { semverMajor: 2, semverMinor: 1, semverPatch: 3, artifactDigest: digest, provenanceRef: 'ref://model/x' }));
    expect(v.artifactDigest).toBe(digest);
    expect((svc as any).updateVersion).toBeUndefined(); // no service surface can rewrite a version
    await asLab(A, () => svc.updateModel(m.id, { displayName: 'P2' })); // a model edit must not touch version provenance
    const after = await asLab(A, () => svc.getVersion(v.id));
    expect(after.artifactDigest).toBe(digest);
    expect(after.provenanceRef).toBe('ref://model/x');
    expect([after.semverMajor, after.semverMinor, after.semverPatch]).toEqual([2, 1, 3]);
  });

  it('advances through legal transitions with exactly one append-only event each; VALIDATION→DRAFT send-back works', async () => {
    const A = await mkLab();
    const m = await asLab(A, () => svc.createModel({ key: 'lc', displayName: 'L', task: 't' }));
    const v = await asLab(A, () => svc.createVersion(m.id, { semverMajor: 1, semverMinor: 0, semverPatch: 0 }));
    for (const to of ['VALIDATION', 'DRAFT', 'VALIDATION', 'APPROVED', 'DEPRECATED', 'RETIRED'] as const) {
      await asLab(A, () => svc.transitionVersion(v.id, to, 'u1', `-> ${to}`));
    }
    const final = await asLab(A, () => svc.getVersion(v.id));
    expect(final.lifecycleState).toBe('RETIRED');
    expect(final.validatedAt && final.approvedAt && final.deprecatedAt && final.retiredAt).toBeTruthy();
    const events = await raw.aiModelLifecycleEvent.findMany({ where: { modelVersionId: v.id } });
    expect(events.length).toBe(6); // exactly one event per successful transition
    expect(events.filter((e) => e.toState === 'DRAFT').length).toBe(1); // the send-back
    expect(events.filter((e) => e.toState === 'VALIDATION').length).toBe(2);
    expect(events.every((e) => !!e.eventId)).toBe(true);
  });

  it('rejects an illegal transition with NO state or event mutation', async () => {
    const A = await mkLab();
    const m = await asLab(A, () => svc.createModel({ key: 'ill', displayName: 'I', task: 't' }));
    const v = await asLab(A, () => svc.createVersion(m.id, { semverMajor: 1, semverMinor: 0, semverPatch: 0 }));
    await expect(asLab(A, () => svc.transitionVersion(v.id, 'APPROVED'))).rejects.toThrow(/illegal/i); // DRAFT→APPROVED
    expect((await asLab(A, () => svc.getVersion(v.id))).lifecycleState).toBe('DRAFT');
    expect(await raw.aiModelLifecycleEvent.count({ where: { modelVersionId: v.id } })).toBe(0);
  });

  it('RETIRED cannot be reactivated', async () => {
    const A = await mkLab();
    const m = await asLab(A, () => svc.createModel({ key: 'ret', displayName: 'R', task: 't' }));
    const v = await asLab(A, () => svc.createVersion(m.id, { semverMajor: 1, semverMinor: 0, semverPatch: 0 }));
    for (const to of ['VALIDATION', 'APPROVED', 'DEPRECATED', 'RETIRED'] as const) await asLab(A, () => svc.transitionVersion(v.id, to));
    for (const to of ['DRAFT', 'VALIDATION', 'APPROVED', 'DEPRECATED'] as const) {
      await expect(asLab(A, () => svc.transitionVersion(v.id, to))).rejects.toThrow(/illegal/i);
    }
    expect((await asLab(A, () => svc.getVersion(v.id))).lifecycleState).toBe('RETIRED');
  });

  it('creates NO InferenceRecord by registering/promoting, has no execution path, and stores no PHI', async () => {
    const A = await mkLab();
    const m = await asLab(A, () => svc.createModel({ key: 'inf', displayName: 'N', task: 't' }));
    const v = await asLab(A, () => svc.createVersion(m.id, { semverMajor: 1, semverMinor: 0, semverPatch: 0 }));
    await asLab(A, () => svc.transitionVersion(v.id, 'VALIDATION'));
    await asLab(A, () => svc.transitionVersion(v.id, 'APPROVED'));
    expect(await raw.inferenceRecord.count({ where: { labId: A } })).toBe(0); // no execution/result-writing path
    for (const surface of ['createInference', 'runInference', 'infer', 'predict', 'execute']) {
      expect((svc as any)[surface]).toBeUndefined();
    }
    const phi = /patient|birth|\bdob\b|ssn|mrn|firstname|lastname|demographic|address|phone/i;
    for (const name of ['AiModel', 'AiModelVersion', 'AiModelLifecycleEvent', 'InferenceRecord']) {
      const fields = Prisma.dmmf.datamodel.models.find((x) => x.name === name)!.fields.map((f) => f.name);
      expect(fields.filter((f) => phi.test(f))).toEqual([]);
    }
    // the slide link is a nullable reference to DigitalSlide (id only), not denormalized slide/patient data
    const infFields = Prisma.dmmf.datamodel.models.find((x) => x.name === 'InferenceRecord')!.fields;
    const slideRel = infFields.find((f) => f.name === 'subjectSlide');
    expect(slideRel?.type).toBe('DigitalSlide');
    expect(infFields.find((f) => f.name === 'subjectSlideId')?.isRequired).toBe(false);
  });
});
