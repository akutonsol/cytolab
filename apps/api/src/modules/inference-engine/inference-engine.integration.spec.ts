import { randomUUID } from 'node:crypto';
import { Prisma, AiModelLifecycleState } from '@prisma/client';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { InferenceEngineService } from './inference-engine.service';
import { InferenceLeaseService } from './inference-lease.service';
import { StubInferenceAdapter, InferenceAdapter } from './inference-adapter';
import { loadInferenceConfig } from './inference-config';

/**
 * Program 6 · Phase 6C — the inference engine against the REAL test Postgres, driven through the tenancy-scoped
 * PrismaService (dispatch) + the system-level worker path (claimAndRun). Proves: lab scoping + cross-lab
 * fail-closed; model-eligibility (VALIDATION/APPROVED only; validation-only provenance); single-active idempotency;
 * execution writes the immutable InferenceRecord ONCE + an append-only InferenceEvent with the full deterministic
 * contract; result is digest/reference only; failure is recorded without throwing; reclaim → TIMED_OUT (no retry);
 * no PHI columns; every 6C provenance FK is ON DELETE RESTRICT; and the record has no service rewrite path.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('P6-6C inference engine (integration)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const audit = { recordEntityCreated: jest.fn(async () => undefined), recordEntityUpdated: jest.fn(async () => undefined) } as any;
  const cfg = loadInferenceConfig({});
  const lease = new InferenceLeaseService(prisma, cfg);
  const svc = new InferenceEngineService(prisma, audit, lease, new StubInferenceAdapter());
  const asLab = <T>(labId: string, fn: () => Promise<T>) => labContext.runLabScoped(labId, fn) as Promise<T>;
  const labIds: string[] = [];

  const mkLab = async () => { const l = await raw.lab.create({ data: { name: 'p6c', slug: `p6c-${randomUUID()}` } }); labIds.push(l.id); return l.id; };
  const mkVersion = async (labId: string, state: AiModelLifecycleState) => {
    const m = await raw.aiModel.create({ data: { labId, key: `k-${randomUUID()}`, displayName: 'M', task: 'demo detector' } });
    const v = await raw.aiModelVersion.create({ data: { labId, modelId: m.id, semverMajor: 1, semverMinor: 0, semverPatch: 0, lifecycleState: state } });
    return v.id;
  };
  const mkSlide = async (labId: string) => {
    const p = await raw.patient.create({ data: { labId, registrationNo: randomUUID(), firstName: '6C', lastName: 'DS' } });
    const r = await raw.record.create({ data: { labId, identifier: randomUUID(), patientId: p.id } });
    const s = await raw.digitalSlide.create({ data: { labId, recordId: r.id, slideUrl: '', sourceKind: 'DICOM', availabilityStatus: 'DRAFT' } });
    return s.id;
  };

  // The partial-unique active-job index (Decision 5) is raw SQL — Prisma's datamodel cannot express a WHERE index,
  // so the datamodel-diff build the test harness uses omits it (exactly as it omits the audit CHECK constraint,
  // which global-setup re-applies). Apply it here from the SAME authoritative DDL as migrations/..._p6_6c/migration.sql
  // so idempotency is verified against production-equivalent DB truth. `migrate deploy` installs it in real runtimes.
  beforeAll(async () => {
    await raw.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "InferenceJob_active_subject_input_key"
        ON "InferenceJob" ("modelVersionId", COALESCE("subjectSlideId", ''), "inputDigest")
        WHERE "status" IN ('QUEUED'::"InferenceJobStatus", 'RUNNING'::"InferenceJobStatus")
    `);
  });

  afterAll(async () => {
    for (const labId of labIds) {
      for (const t of ['InferenceEvent', 'InferenceRecord', 'InferenceJob', 'AiModelLifecycleEvent', 'AiModelVersion', 'AiModel', 'DigitalSlide', 'Record', 'Patient']) {
        await raw.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, labId);
      }
      await raw.$executeRaw`DELETE FROM "Lab" WHERE id = ${labId}`;
    }
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('is lab-scoped and fails closed cross-lab', async () => {
    const A = await mkLab(); const B = await mkLab();
    const vA = await mkVersion(A, 'APPROVED');
    const job = await asLab(A, () => svc.dispatch({ modelVersionId: vA, inputRef: 'ref://x' }));
    await expect(asLab(B, () => svc.getJob(job.id))).rejects.toThrow(/not found/i);
    expect((await raw.inferenceJob.findUnique({ where: { id: job.id }, select: { labId: true } }))?.labId).toBe(A);
    // a model version from lab B cannot be dispatched from lab A (findFirst is lab-scoped)
    const vB = await mkVersion(B, 'APPROVED');
    await expect(asLab(A, () => svc.dispatch({ modelVersionId: vB, inputRef: 'ref://y' }))).rejects.toThrow(/not found/i);
  });

  it('enforces model eligibility: DRAFT/DEPRECATED/RETIRED rejected; VALIDATION+APPROVED allowed', async () => {
    const A = await mkLab();
    for (const s of ['DRAFT', 'DEPRECATED', 'RETIRED'] as const) {
      const v = await mkVersion(A, s);
      await expect(asLab(A, () => svc.dispatch({ modelVersionId: v, inputRef: 'r' }))).rejects.toThrow(/VALIDATION or APPROVED/i);
    }
    const vVal = await mkVersion(A, 'VALIDATION');
    const vApp = await mkVersion(A, 'APPROVED');
    await expect(asLab(A, () => svc.dispatch({ modelVersionId: vVal, inputRef: 'r1' }))).resolves.toBeTruthy();
    await expect(asLab(A, () => svc.dispatch({ modelVersionId: vApp, inputRef: 'r2' }))).resolves.toBeTruthy();
  });

  it('is idempotent: one active inference per (modelVersion, subject, input)', async () => {
    const A = await mkLab();
    const v = await mkVersion(A, 'APPROVED');
    const slide = await mkSlide(A);
    await asLab(A, () => svc.dispatch({ modelVersionId: v, subjectSlideId: slide, inputRef: 'same' }));
    await expect(asLab(A, () => svc.dispatch({ modelVersionId: v, subjectSlideId: slide, inputRef: 'same' }))).rejects.toThrow(/already exists/i);
    // a DIFFERENT input digest is a distinct inference
    await expect(asLab(A, () => svc.dispatch({ modelVersionId: v, subjectSlideId: slide, inputRef: 'different' }))).resolves.toBeTruthy();
  });

  it('executes → immutable InferenceRecord written once + append-only InferenceEvent + full deterministic contract', async () => {
    const A = await mkLab();
    const v = await mkVersion(A, 'APPROVED');
    const slide = await mkSlide(A);
    const job = await asLab(A, () => svc.dispatch({ modelVersionId: v, subjectSlideId: slide, inputRef: 'payload', config: { threshold: 0.5, mode: 'demo' } }));
    await svc.drain('w1'); // system path (not lab-scoped): process my job (and clear any queued stragglers)

    const jobRow = await raw.inferenceJob.findUnique({ where: { id: job.id } });
    expect(jobRow?.status).toBe('SUCCEEDED');
    expect(jobRow?.finishedAt && jobRow?.startedAt).toBeTruthy();
    expect(jobRow?.leaseExpiresAt).toBeNull();

    const records = await raw.inferenceRecord.findMany({ where: { jobId: job.id } });
    expect(records.length).toBe(1); // written EXACTLY once at terminalization
    const rec = records[0];
    // deterministic execution contract (Decision 10)
    expect(rec.adapterId).toBe('stub');
    expect(rec.adapterVersion).toBe('1.0.0');
    expect(rec.engineVersion).toMatch(/^6c\./);
    expect(rec.configDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(rec.modelLifecycleStateAtRun).toBe('APPROVED');
    expect(rec.validationOnly).toBe(false);
    expect(rec.outcome).toBe('SUCCEEDED');
    expect(rec.resultDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(rec.resultRef).toMatch(/^stub:\/\/inference\//);
    expect(rec.durationMs == null || rec.durationMs >= 0).toBe(true);
    // deterministic result: re-running the stub over the same (version,input,config) yields the same digest
    const restated = await new StubInferenceAdapter().execute({ modelVersionId: v, inputDigest: rec.inputDigest!, configDigest: rec.configDigest });
    expect(restated.resultDigest).toBe(rec.resultDigest);

    const events = await raw.inferenceEvent.findMany({ where: { jobId: job.id } });
    expect(events.length).toBe(1);
    expect(events[0].toStatus).toBe('SUCCEEDED');
    expect(events[0].fromStatus).toBe('RUNNING');
    expect(events[0].eventId).toBeTruthy();

    // draining again finds nothing (job no longer active)
    expect(await svc.claimAndRun('w1')).toBeNull();
  });

  it('records VALIDATION runs as validation-only (immutable provenance)', async () => {
    const A = await mkLab();
    const v = await mkVersion(A, 'VALIDATION');
    const job = await asLab(A, () => svc.dispatch({ modelVersionId: v, inputRef: 'val-run' }));
    await svc.drain('w1');
    const rec = await raw.inferenceRecord.findFirst({ where: { jobId: job.id } });
    expect(rec?.validationOnly).toBe(true);
    expect(rec?.modelLifecycleStateAtRun).toBe('VALIDATION');
  });

  it('a completed inference frees a re-dispatch of the same tuple (a distinct second record)', async () => {
    const A = await mkLab();
    const v = await mkVersion(A, 'APPROVED');
    const slide = await mkSlide(A);
    const j1 = await asLab(A, () => svc.dispatch({ modelVersionId: v, subjectSlideId: slide, inputRef: 'again' }));
    await svc.drain('w1');
    // now the prior job is terminal → the partial-unique index permits a new active job for the same tuple
    const j2 = await asLab(A, () => svc.dispatch({ modelVersionId: v, subjectSlideId: slide, inputRef: 'again' }));
    expect(j2.id).not.toBe(j1.id);
    await svc.drain('w1');
    expect(await raw.inferenceRecord.count({ where: { subjectSlideId: slide } })).toBe(2);
  });

  it('records adapter failure as FAILED evidence WITHOUT throwing into a clinical path', async () => {
    const A = await mkLab();
    const v = await mkVersion(A, 'APPROVED');
    const throwing: InferenceAdapter = { adapterId: 'boom', adapterVersion: '9.9.9', execute: async () => { throw new Error('adapter exploded'); } };
    const failSvc = new InferenceEngineService(prisma, audit, lease, throwing);
    await svc.drain('pre-fail'); // clear any queued stragglers with the GOOD adapter first
    const job = await asLab(A, () => failSvc.dispatch({ modelVersionId: v, inputRef: 'will-fail' }));
    const outcomes = await failSvc.drain('w-fail'); // must NOT throw
    expect(outcomes.find((o) => o.jobId === job.id)?.outcome).toBe('FAILED');
    const rec = await raw.inferenceRecord.findFirst({ where: { jobId: job.id } });
    expect(rec?.outcome).toBe('FAILED');
    expect(rec?.resultDigest).toBeNull();
    const jobRow = await raw.inferenceJob.findUnique({ where: { id: job.id } });
    expect(jobRow?.status).toBe('FAILED');
    expect(jobRow?.errorCode).toBe('ADAPTER_ERROR');
    expect(await raw.inferenceEvent.count({ where: { jobId: job.id, toStatus: 'FAILED' } })).toBe(1);
  });

  it('reclaims an expired RUNNING lease as TIMED_OUT with no retry enqueued (manual dispatch only)', async () => {
    const A = await mkLab();
    const v = await mkVersion(A, 'APPROVED');
    const job = await asLab(A, () => svc.dispatch({ modelVersionId: v, inputRef: 'stuck' }));
    // simulate a crashed worker: RUNNING with an already-expired lease
    await raw.$executeRaw`UPDATE "InferenceJob" SET status='RUNNING', "workerId"='dead', "startedAt"=now(), "leaseExpiresAt"=now() - interval '1 minute' WHERE id=${job.id}`;
    const before = await raw.inferenceJob.count({ where: { labId: A } });
    const reclaimed = await svc.reclaimExpired();
    expect(reclaimed).toBeGreaterThanOrEqual(1);
    const jobRow = await raw.inferenceJob.findUnique({ where: { id: job.id } });
    expect(jobRow?.status).toBe('TIMED_OUT');
    expect(await raw.inferenceJob.count({ where: { labId: A } })).toBe(before); // NO retry row was enqueued
  });

  it('stores no PHI columns, has no record-rewrite service path, and every 6C provenance FK is ON DELETE RESTRICT', async () => {
    const phi = /patient|birth|\bdob\b|ssn|mrn|firstname|lastname|demographic|address|phone/i;
    for (const name of ['InferenceJob', 'InferenceEvent', 'InferenceRecord']) {
      const fields = Prisma.dmmf.datamodel.models.find((x) => x.name === name)!.fields.map((f) => f.name);
      expect(fields.filter((f) => phi.test(f))).toEqual([]);
    }
    // the immutable evidence has no service surface that rewrites it
    for (const surface of ['updateRecord', 'updateJob', 'setResult', 'editRecord']) {
      expect((svc as any)[surface]).toBeUndefined();
    }
    // DB truth: every 6C provenance FK is ON DELETE RESTRICT (confdeltype 'r')
    const fks = (await raw.$queryRawUnsafe(
      `SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype='f' AND conname ~ '^(InferenceJob|InferenceEvent|InferenceRecord)_.*_fkey$'`,
    )) as Array<{ conname: string; d: string }>;
    expect(fks.length).toBeGreaterThanOrEqual(6);
    expect(fks.every((r) => r.d === 'r')).toBe(true);
  });
});
