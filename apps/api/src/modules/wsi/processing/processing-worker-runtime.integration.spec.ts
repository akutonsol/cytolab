import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Logger } from '@nestjs/common';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../../database/prisma.service';
import { LocalSourceObjectStore } from '../storage/local-source-object-store';
import { LocalDerivativeObjectStore } from '../storage/local-derivative-object-store';
import { LocalSourceMaterializer } from './local-source-materializer';
import { FakeTilingEngine, FakeCorruption } from './fake-tiling-engine';
import { TilingEngine, TilingInput, TilingResult } from './tiling-engine';
import { JobLeaseService } from './job-lease.service';
import { loadProcessingConfig, validateProcessingConfig, ProcessingConfig } from './processing-config';
import { SlideProcessingProcessor } from './slide-processing.processor';
import { GenerationSealer } from './generation-sealer';
import { SlideProcessingQueueService } from './slide-processing-queue.service';
import { ProcessingWorkerRuntime, classifyProcessingError } from './processing-worker-runtime';
import { SlideProcessingScheduler } from './slide-processing.scheduler';
import { GenerationVerdictService } from './generation-verdict.service';
import { GenerationVerifier } from './generation-verifier';
import { AcquisitionMetadataConflictError } from './slide-processing.processor';
import { TilingEngineError } from './tiling-engine';
import { InvalidEngineOutputError } from './tiling-output-validator';

const base = loadProcessingConfig({} as any);
function cfg(over: Partial<ProcessingConfig> = {}): ProcessingConfig {
  return { ...base, leaseDurationMs: 60_000, heartbeatIntervalMs: 20_000, workerConcurrency: 2, claimIntervalMs: 10, claimJitterMs: 0, drainTimeoutMs: 10_000, ...over };
}
const prisma = createTestPrisma();
const WORKER = 'worker-A';
let roots: string[] = [];
let labIds: string[] = [];

function mkTmp(tag: string): string {
  const p = path.join(os.tmpdir(), `p5w-${tag}-${randomUUID()}`);
  roots.push(p);
  return p;
}
function newStores() {
  const store = new LocalSourceObjectStore(mkTmp('src'));
  const materializer = new LocalSourceMaterializer(store, mkTmp('mat'));
  const derivStore = new LocalDerivativeObjectStore(mkTmp('deriv'));
  return { store, materializer, derivStore };
}
/** A tiling engine that delays before delegating (for drain-timeout timing), abort-agnostic. */
class DelayedEngine implements TilingEngine {
  constructor(private readonly inner: FakeTilingEngine, private readonly ms: number) {}
  identity() { return this.inner.identity(); }
  async tile(input: TilingInput): Promise<TilingResult> {
    await new Promise((r) => setTimeout(r, this.ms));
    return this.inner.tile(input);
  }
}

async function seedQueued(stores: ReturnType<typeof newStores>, opts: { slideOver?: Record<string, unknown> } = {}) {
  const lab = await prisma.lab.create({ data: { name: 'p5w', slug: `p5w-${randomUUID()}` } });
  labIds.push(lab.id);
  const patient = await prisma.patient.create({ data: { labId: lab.id, registrationNo: randomUUID(), firstName: 'P', lastName: 'X' } });
  const record = await prisma.record.create({ data: { labId: lab.id, identifier: randomUUID(), patientId: patient.id } });
  const slide = await prisma.digitalSlide.create({ data: { labId: lab.id, recordId: record.id, slideUrl: '', availabilityStatus: 'DRAFT', sourceKind: 'UPLOAD', ...(opts.slideOver ?? {}) } });
  const key = `slides/${lab.id}/${slide.id}/source/i/${randomUUID()}.svs`;
  await stores.store.createUploadSession(key);
  await stores.store.writeChunk(key, 0, Buffer.from('fake-wsi-source-bytes'));
  const { checksum } = await stores.store.completeUpload(key);
  const ing = await prisma.slideIngestion.create({ data: { labId: lab.id, slideId: slide.id, sourceKind: 'UPLOAD', status: 'VERIFIED', sourceObjectKey: key, sourceChecksum: checksum } });
  const job = await prisma.slideProcessingJob.create({ data: { labId: lab.id, ingestionId: ing.id, status: 'QUEUED', attempt: 1 } as any });
  return { labId: lab.id, slideId: slide.id, ingestionId: ing.id, jobId: job.id };
}
function makeRuntime(stores: ReturnType<typeof newStores>, c: ProcessingConfig, engine: TilingEngine, workerId = WORKER) {
  const lease = new JobLeaseService(prisma as unknown as PrismaService, c);
  const sealer = new GenerationSealer(prisma as unknown as PrismaService, lease, stores.derivStore);
  const processor = new SlideProcessingProcessor(prisma as unknown as PrismaService, lease, stores.materializer, engine, stores.derivStore, sealer);
  const runtime = new ProcessingWorkerRuntime(lease, processor, c, workerId, new Logger('test'));
  const queue = new SlideProcessingQueueService(prisma as unknown as PrismaService, c);
  const verdict = new GenerationVerdictService(prisma as unknown as PrismaService, new GenerationVerifier(prisma as unknown as PrismaService, stores.derivStore));
  return { lease, processor, runtime, queue, verdict };
}
const getJob = (id: string) => prisma.slideProcessingJob.findUniqueOrThrow({ where: { id } });

afterEach(async () => {
  for (const labId of labIds) {
    await prisma.$executeRaw`DELETE FROM "GenerationVerification" WHERE "labId" = ${labId}`;
    await prisma.$executeRaw`DELETE FROM "SlideAsset" WHERE "labId" = ${labId}`;
    await prisma.$executeRaw`DELETE FROM "DerivativeGeneration" WHERE "labId" = ${labId}`;
    await prisma.$executeRaw`DELETE FROM "SlideProcessingJob" WHERE "labId" = ${labId}`;
    await prisma.$executeRaw`DELETE FROM "SlideIngestion" WHERE "labId" = ${labId}`;
    await prisma.$executeRaw`DELETE FROM "DigitalSlide" WHERE "labId" = ${labId}`;
    await prisma.$executeRaw`DELETE FROM "Record" WHERE "labId" = ${labId}`;
    await prisma.$executeRaw`DELETE FROM "Patient" WHERE "labId" = ${labId}`;
    await prisma.$executeRaw`DELETE FROM "Lab" WHERE id = ${labId}`;
  }
  labIds = [];
  for (const r of roots) await fs.rm(r, { recursive: true, force: true }).catch(() => undefined);
  roots = [];
});

// ── pure helpers ────────────────────────────────────────────────────────────────────────────────────
it('classifies each processing failure to its stable, durable code', () => {
  expect(classifyProcessingError(new TilingEngineError('UNSUPPORTED_FORMAT', 'x'))).toBe('UNSUPPORTED_FORMAT');
  expect(classifyProcessingError(new TilingEngineError('ENGINE_UNAVAILABLE', 'x'))).toBe('ENGINE_UNAVAILABLE');
  expect(classifyProcessingError(new TilingEngineError('ENGINE_CRASH', 'x'))).toBe('ENGINE_CRASH');
  expect(classifyProcessingError(new InvalidEngineOutputError('x'))).toBe('INVALID_OUTPUT');
  expect(classifyProcessingError(new AcquisitionMetadataConflictError(['sourceWidth']))).toBe('ACQUISITION_CONFLICT');
  expect(classifyProcessingError(new Error('boom'))).toBe('UNKNOWN');
});
it('fails fast on an unsafe worker configuration (heartbeat must be <= lease/3)', () => {
  expect(() => validateProcessingConfig(cfg({ leaseDurationMs: 30_000, heartbeatIntervalMs: 30_000 }))).toThrow(/heartbeatIntervalMs/);
  expect(() => validateProcessingConfig(cfg({ leaseDurationMs: 60_000, heartbeatIntervalMs: 20_000 }))).not.toThrow();
});

// ── claim → process → seal ─────────────────────────────────────────────────────────────────────────
it('claims a QUEUED job, processes it, and ends at a sealed QC_PENDING generation + SUCCEEDED job', async () => {
  const stores = newStores();
  const { jobId, slideId } = await seedQueued(stores);
  const { runtime } = makeRuntime(stores, cfg(), new FakeTilingEngine('none'));
  expect(await runtime.claimAndProcess()).toBe(1);
  await runtime.awaitInFlight();
  const gen = await prisma.derivativeGeneration.findFirstOrThrow({ where: { slideId } });
  expect(gen.status).toBe('QC_PENDING');
  expect(gen.sealed).toBe(true);
  expect((await getJob(jobId)).status).toBe('SUCCEEDED');
});

it('respects the concurrency cap (only freeSlots attempts started per tick)', async () => {
  const stores1 = newStores();
  const stores2 = newStores();
  await seedQueued(stores1);
  await seedQueued(stores2); // two claimable jobs (share the source store? no — but claim is by job row)
  // Use ONE runtime whose processor reads whichever source store... both slides live in the same DB; the
  // processor uses the store it was built with. To keep it simple, give concurrency=1 and one runtime.
  const { runtime } = makeRuntime(stores1, cfg({ workerConcurrency: 1 }), new FakeTilingEngine('none'));
  const started = await runtime.claimAndProcess();
  expect(started).toBe(1); // capped at 1 even though 2 jobs are claimable
  expect(runtime.inFlightCount).toBeLessThanOrEqual(1);
  await runtime.awaitInFlight();
});

// ── failure disposition (durable, via errorCode + reconcile) ─────────────────────────────────────────
it('a deterministic failure (UNSUPPORTED_FORMAT) is FAILED non-retryable and reconcile does NOT re-enqueue', async () => {
  const stores = newStores();
  const { jobId, ingestionId } = await seedQueued(stores);
  const c = cfg({ backoffMs: [0], maxAttempts: 3 });
  const { runtime, queue } = makeRuntime(stores, c, new FakeTilingEngine('unsupported-format'));
  await runtime.claimAndProcess();
  await runtime.awaitInFlight();
  const job = await getJob(jobId);
  expect(job.status).toBe('FAILED');
  expect(job.errorCode).toBe('UNSUPPORTED_FORMAT');
  const enqueued = await queue.reconcile();
  expect(enqueued).toBe(0); // non-retryable → never re-enqueued (durable across ticks/restart)
  expect(await prisma.slideProcessingJob.count({ where: { ingestionId, status: 'QUEUED' } })).toBe(0);
});

it('an acquisition-metadata conflict is FAILED non-retryable (ACQUISITION_CONFLICT)', async () => {
  const stores = newStores();
  const { jobId } = await seedQueued(stores, { slideOver: { sourceWidth: 999 } }); // conflicts with fake's 300
  const c = cfg({ backoffMs: [0] });
  const { runtime, queue } = makeRuntime(stores, c, new FakeTilingEngine('none'));
  await runtime.claimAndProcess();
  await runtime.awaitInFlight();
  const job = await getJob(jobId);
  expect(job.status).toBe('FAILED');
  expect(job.errorCode).toBe('ACQUISITION_CONFLICT');
  expect(await queue.reconcile()).toBe(0);
});

it('a retryable failure (INVALID_OUTPUT) re-enqueues within the attempt budget, then stops', async () => {
  const stores = newStores();
  const { jobId, ingestionId } = await seedQueued(stores);
  const c = cfg({ backoffMs: [0], maxAttempts: 2 });
  const { runtime, queue } = makeRuntime(stores, c, new FakeTilingEngine('bad-level-count')); // → InvalidEngineOutputError
  await runtime.claimAndProcess();
  await runtime.awaitInFlight();
  expect((await getJob(jobId)).errorCode).toBe('INVALID_OUTPUT');
  // attempt 1 FAILED (retryable) + budget available + backoff 0 → reconcile enqueues attempt 2.
  expect(await queue.reconcile()).toBe(1);
  const a2 = await prisma.slideProcessingJob.findFirstOrThrow({ where: { ingestionId, attempt: 2 } });
  // Process attempt 2 → also fails → attempt == maxAttempts → reconcile stops.
  await runtime.claimAndProcess();
  await runtime.awaitInFlight();
  expect((await getJob(a2.id)).status).toBe('FAILED');
  expect(await queue.reconcile()).toBe(0); // budget exhausted
});

// ── heartbeat lease loss ─────────────────────────────────────────────────────────────────────────────
it('a heartbeat-detected lease loss aborts engine work and makes NO stale terminal mutation', async () => {
  const stores = newStores();
  const { jobId, slideId } = await seedQueued(stores);
  const c = cfg({ leaseDurationMs: 60_000, heartbeatIntervalMs: 15 });
  const { runtime } = makeRuntime(stores, c, new FakeTilingEngine('hang')); // tile() waits for abort
  await runtime.claimAndProcess(); // starts the attempt; createGeneration ok, then tile() hangs
  await new Promise((r) => setTimeout(r, 5));
  await prisma.$executeRaw`UPDATE "SlideProcessingJob" SET "workerId" = 'thief' WHERE id = ${jobId}`; // ownership transferred
  await runtime.awaitInFlight(); // heartbeat renew→0 rows → abort → hang rejects → runtime leaves it

  const job = await getJob(jobId);
  expect(job.workerId).toBe('thief'); // our worker did NOT terminalize it
  expect(job.status).toBe('RUNNING'); // left for reclaim, not FAILED
  const gen = await prisma.derivativeGeneration.findFirstOrThrow({ where: { slideId } });
  expect(gen.sealed).toBe(false); // never sealed by the stale worker
});

// ── drain ────────────────────────────────────────────────────────────────────────────────────────────
it('graceful drain awaits a normal in-flight attempt and never marks it FAILED', async () => {
  const stores = newStores();
  const { jobId } = await seedQueued(stores);
  const { runtime } = makeRuntime(stores, cfg(), new FakeTilingEngine('none'));
  await runtime.claimAndProcess();
  await runtime.drain();
  expect((await getJob(jobId)).status).toBe('SUCCEEDED'); // completed, not FAILED-on-shutdown
});

// ── scheduler gating ─────────────────────────────────────────────────────────────────────────────────
it('scheduler: a disabled worker starts no claim loop (no jobs claimed)', async () => {
  const stores = newStores();
  const { lease, processor, queue, verdict } = makeRuntime(stores, cfg(), new FakeTilingEngine('none'));
  const claimSpy = jest.spyOn(lease, 'claim');
  const sched = new SlideProcessingScheduler(prisma as unknown as PrismaService, queue, lease, processor, verdict, cfg({ workerEnabled: false }));
  sched.onApplicationBootstrap();
  expect(claimSpy).not.toHaveBeenCalled();
  await sched.onModuleDestroy();
  claimSpy.mockRestore();
});
it('scheduler: an enabled worker with unsafe heartbeat config fails fast at bootstrap', () => {
  const stores = newStores();
  const { lease, processor, queue, verdict } = makeRuntime(stores, cfg(), new FakeTilingEngine('none'));
  const sched = new SlideProcessingScheduler(prisma as unknown as PrismaService, queue, lease, processor, verdict, cfg({ workerEnabled: true, leaseDurationMs: 30_000, heartbeatIntervalMs: 30_000 }));
  expect(() => sched.onApplicationBootstrap()).toThrow(/heartbeatIntervalMs/);
});

it('drain timeout stops heartbeat renewal so reclaim can recover the attempt', async () => {
  const stores = newStores();
  await seedQueued(stores);
  const c = cfg({ leaseDurationMs: 60_000, heartbeatIntervalMs: 15, drainTimeoutMs: 20 });
  const { lease, runtime } = makeRuntime(stores, c, new DelayedEngine(new FakeTilingEngine('none'), 200));
  const renewSpy = jest.spyOn(lease, 'renew');
  await runtime.claimAndProcess();
  await runtime.drain(); // returns after ~20ms; work still delayed → heartbeats cleared
  const countAfterDrain = renewSpy.mock.calls.length;
  await new Promise((r) => setTimeout(r, 80)); // several heartbeat intervals
  expect(renewSpy.mock.calls.length).toBe(countAfterDrain); // no further renewals — lease left to expire
  await runtime.awaitInFlight(); // let the delayed attempt settle (lease lapsed → no seal) to avoid a leak
  renewSpy.mockRestore();
});
