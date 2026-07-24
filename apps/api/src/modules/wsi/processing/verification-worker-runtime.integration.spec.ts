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
import { FakeTilingEngine } from './fake-tiling-engine';
import { JobLeaseService, ClaimedJob } from './job-lease.service';
import { loadProcessingConfig, ProcessingConfig } from './processing-config';
import { SlideProcessingProcessor } from './slide-processing.processor';
import { GenerationSealer } from './generation-sealer';
import { GenerationVerifier } from './generation-verifier';
import { GenerationVerdictService, VerdictResult } from './generation-verdict.service';
import { ProcessingWorkerRuntime } from './processing-worker-runtime';
import { VerificationWorkerRuntime } from './verification-worker-runtime';

const base = loadProcessingConfig({} as any);
const cfg = (over: Partial<ProcessingConfig> = {}): ProcessingConfig => ({
  ...base, leaseDurationMs: 60_000, heartbeatIntervalMs: 20_000, workerConcurrency: 1, claimIntervalMs: 10, claimJitterMs: 0, drainTimeoutMs: 10_000,
  verifyMaxConcurrent: 1, verifyBatchSize: 20, verifyIntervalMs: 10_000, ...over,
});
const prisma = createTestPrisma();
const WORKER = 'worker-A';
const LOG = new Logger('test');
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
let roots: string[] = [];
let labIds: string[] = [];

function mkTmp(t: string): string {
  const p = path.join(os.tmpdir(), `p5wv-${t}-${randomUUID()}`);
  roots.push(p);
  return p;
}
function newStores() {
  const store = new LocalSourceObjectStore(mkTmp('src'));
  return { store, materializer: new LocalSourceMaterializer(store, mkTmp('mat')), derivStore: new LocalDerivativeObjectStore(mkTmp('deriv')) };
}
function verdictFor(stores: ReturnType<typeof newStores>): GenerationVerdictService {
  return new GenerationVerdictService(prisma as unknown as PrismaService, new GenerationVerifier(prisma as unknown as PrismaService, stores.derivStore));
}
async function seedSlide(stores: ReturnType<typeof newStores>) {
  const lab = await prisma.lab.create({ data: { name: 'p5wv', slug: `p5wv-${randomUUID()}` } });
  labIds.push(lab.id);
  const patient = await prisma.patient.create({ data: { labId: lab.id, registrationNo: randomUUID(), firstName: 'P', lastName: 'X' } });
  const record = await prisma.record.create({ data: { labId: lab.id, identifier: randomUUID(), patientId: patient.id } });
  const slide = await prisma.digitalSlide.create({ data: { labId: lab.id, recordId: record.id, slideUrl: '', availabilityStatus: 'DRAFT', sourceKind: 'UPLOAD' } });
  const key = `slides/${lab.id}/${slide.id}/source/i/${randomUUID()}.svs`;
  await stores.store.createUploadSession(key);
  await stores.store.writeChunk(key, 0, Buffer.from('fake-wsi-source-bytes'));
  const { checksum } = await stores.store.completeUpload(key);
  const ing = await prisma.slideIngestion.create({ data: { labId: lab.id, slideId: slide.id, sourceKind: 'UPLOAD', status: 'VERIFIED', sourceObjectKey: key, sourceChecksum: checksum } });
  return { labId: lab.id, slideId: slide.id, ingestionId: ing.id };
}
/** Produce + seal a generation (no verdict) → QC_PENDING + job SUCCEEDED. */
async function seedAndSeal(stores: ReturnType<typeof newStores>) {
  const ctx = await seedSlide(stores);
  const future = new Date(Date.now() + 60_000);
  const job = await prisma.slideProcessingJob.create({ data: { labId: ctx.labId, ingestionId: ctx.ingestionId, status: 'RUNNING', workerId: WORKER, attempt: 1, startedAt: new Date(), heartbeatAt: new Date(), leaseExpiresAt: future } as any });
  const sealer = new GenerationSealer(prisma as unknown as PrismaService, new JobLeaseService(prisma as unknown as PrismaService, cfg()), stores.derivStore);
  const proc = new SlideProcessingProcessor(prisma as unknown as PrismaService, new JobLeaseService(prisma as unknown as PrismaService, cfg()), stores.materializer, new FakeTilingEngine('none'), stores.derivStore, sealer);
  const { generationId } = await proc.process({ id: job.id, ingestionId: ctx.ingestionId, labId: ctx.labId, attempt: 1, leaseExpiresAt: future } as ClaimedJob, WORKER);
  return { ...ctx, generationId, jobId: job.id };
}
const getGen = (id: string) => prisma.derivativeGeneration.findUniqueOrThrow({ where: { id } });
const getSlide = (id: string) => prisma.digitalSlide.findUniqueOrThrow({ where: { id } });
const getJob = (id: string) => prisma.slideProcessingJob.findUniqueOrThrow({ where: { id } });
const verifications = (generationId: string) => prisma.generationVerification.findMany({ where: { generationId } });

async function assertNeverPublished(slideId: string, generationId: string) {
  const slide = await getSlide(slideId);
  expect(slide.publishedGenerationId).toBeNull();
  expect(slide.availabilityStatus).toBe('DRAFT');
  expect((await getGen(generationId)).status).not.toBe('PUBLISHED');
}

afterEach(async () => {
  for (const labId of labIds) {
    for (const t of ['GenerationVerification', 'SlideAsset', 'DerivativeGeneration', 'SlideProcessingJob', 'SlideIngestion', 'DigitalSlide', 'Record', 'Patient']) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, labId);
    }
    await prisma.$executeRaw`DELETE FROM "Lab" WHERE id = ${labId}`;
  }
  labIds = [];
  for (const r of roots) await fs.rm(r, { recursive: true, force: true }).catch(() => undefined);
  roots = [];
});

// ── reconciler → terminal ────────────────────────────────────────────────────────────────────────────
it('the reconciler drives a sealed QC_PENDING generation to READY with a PASSED provenance row', async () => {
  const stores = newStores();
  const ctx = await seedAndSeal(stores);
  const vr = new VerificationWorkerRuntime(prisma as unknown as PrismaService, verdictFor(stores), cfg(), WORKER, LOG);
  expect(await vr.reconcileTick()).toBe(1);
  await vr.awaitInFlight();

  const gen = await getGen(ctx.generationId);
  expect(gen.status).toBe('READY');
  expect(gen.sealed && gen.verified).toBe(true);
  expect((await getJob(ctx.jobId)).status).toBe('SUCCEEDED');
  const rows = await verifications(ctx.generationId);
  expect(rows).toHaveLength(1);
  expect(rows[0].outcome).toBe('PASSED');
  await assertNeverPublished(ctx.slideId, ctx.generationId);
});

it('an integrity failure → QC_FAILED with a FAILED provenance row; the processing job stays SUCCEEDED; no publish', async () => {
  const stores = newStores();
  const ctx = await seedAndSeal(stores);
  // Tamper a derivative before verification.
  const desc = await prisma.slideAsset.findFirstOrThrow({ where: { generationId: ctx.generationId, role: 'DZI_DESCRIPTOR' } });
  await stores.derivStore.delete(desc.storageKey);
  await stores.derivStore.putImmutableObject(desc.storageKey, (await import('node:stream')).Readable.from(Buffer.from('corrupt')));

  const vr = new VerificationWorkerRuntime(prisma as unknown as PrismaService, verdictFor(stores), cfg(), WORKER, LOG);
  await vr.reconcileTick();
  await vr.awaitInFlight();

  expect((await getGen(ctx.generationId)).status).toBe('QC_FAILED');
  expect((await getJob(ctx.jobId)).status).toBe('SUCCEEDED'); // processing success is NOT reopened
  const rows = await verifications(ctx.generationId);
  expect(rows).toHaveLength(1);
  expect(rows[0].outcome).toBe('FAILED');
  await assertNeverPublished(ctx.slideId, ctx.generationId);
});

// ── retryable / infra: leave QC_PENDING, no job/provenance mutation ────────────────────────────────────
it('a RETRYABLE verification leaves QC_PENDING with no provenance; a later pass completes it', async () => {
  const stores = newStores();
  const ctx = await seedAndSeal(stores);
  // Faulty store: the verifier hits a transient read on the manifest → RETRYABLE.
  const manifestKey = `slides/${ctx.labId}/${ctx.slideId}/derivatives/${ctx.generationId}/manifest.json`;
  const faulty = new Proxy(stores.derivStore, { get: (t: any, p) => (p === 'readObject' ? (k: string) => (k === manifestKey ? Promise.reject(new Error('transient')) : t.readObject(k)) : t[p]?.bind(t)) });
  const faultyVerdict = new GenerationVerdictService(prisma as unknown as PrismaService, new GenerationVerifier(prisma as unknown as PrismaService, faulty));
  const vr1 = new VerificationWorkerRuntime(prisma as unknown as PrismaService, faultyVerdict, cfg(), WORKER, LOG);
  await vr1.reconcileTick();
  await vr1.awaitInFlight();
  expect((await getGen(ctx.generationId)).status).toBe('QC_PENDING');
  expect(await verifications(ctx.generationId)).toHaveLength(0);

  // A healthy pass completes it.
  const vr2 = new VerificationWorkerRuntime(prisma as unknown as PrismaService, verdictFor(stores), cfg(), WORKER, LOG);
  await vr2.reconcileTick();
  await vr2.awaitInFlight();
  expect((await getGen(ctx.generationId)).status).toBe('READY');
});

it('an infrastructure exception in applyVerdict leaves QC_PENDING and never reopens the job', async () => {
  const stores = newStores();
  const ctx = await seedAndSeal(stores);
  const throwing = { applyVerdict: async () => { throw new Error('DB down'); } } as unknown as GenerationVerdictService;
  const vr = new VerificationWorkerRuntime(prisma as unknown as PrismaService, throwing, cfg(), WORKER, LOG);
  await vr.reconcileTick();
  await vr.awaitInFlight();
  expect((await getGen(ctx.generationId)).status).toBe('QC_PENDING');
  expect((await getJob(ctx.jobId)).status).toBe('SUCCEEDED');
  expect(await verifications(ctx.generationId)).toHaveLength(0);
});

// ── end-to-end via the processing runtime's immediate trigger ─────────────────────────────────────────
it('END-TO-END: claim → process → seal → immediate verify → READY (never published)', async () => {
  const stores = newStores();
  const ctx = await seedSlide(stores);
  await prisma.slideProcessingJob.create({ data: { labId: ctx.labId, ingestionId: ctx.ingestionId, status: 'QUEUED', attempt: 1 } as any });
  const lease = new JobLeaseService(prisma as unknown as PrismaService, cfg());
  const sealer = new GenerationSealer(prisma as unknown as PrismaService, lease, stores.derivStore);
  const proc = new SlideProcessingProcessor(prisma as unknown as PrismaService, lease, stores.materializer, new FakeTilingEngine('none'), stores.derivStore, sealer);
  const verification = new VerificationWorkerRuntime(prisma as unknown as PrismaService, verdictFor(stores), cfg(), WORKER, LOG);
  const processing = new ProcessingWorkerRuntime(lease, proc, cfg(), WORKER, LOG, (id) => verification.enqueue(id));

  expect(await processing.claimAndProcess()).toBe(1);
  await processing.awaitInFlight(); // completes process()+seal, then fires onProcessed → verification.enqueue
  await verification.awaitInFlight();

  const gen = await prisma.derivativeGeneration.findFirstOrThrow({ where: { slideId: ctx.slideId } });
  expect(gen.status).toBe('READY');
  expect(gen.verified).toBe(true);
  expect(await verifications(gen.id)).toHaveLength(1);
  await assertNeverPublished(ctx.slideId, gen.id);
});

it('OPTION B: a slow verification does not hold the processing slot — a new job is claimed meanwhile', async () => {
  const stores = newStores();
  const c = cfg({ workerConcurrency: 1, verifyMaxConcurrent: 1 });
  // Two independent QUEUED jobs (each its own slide/source, but the same deriv store for simplicity).
  const a = await seedSlide(stores);
  await prisma.slideProcessingJob.create({ data: { labId: a.labId, ingestionId: a.ingestionId, status: 'QUEUED', attempt: 1 } as any });
  const b = await seedSlide(stores);
  await prisma.slideProcessingJob.create({ data: { labId: b.labId, ingestionId: b.ingestionId, status: 'QUEUED', attempt: 1 } as any });
  const lease = new JobLeaseService(prisma as unknown as PrismaService, c);
  const sealer = new GenerationSealer(prisma as unknown as PrismaService, lease, stores.derivStore);
  const proc = new SlideProcessingProcessor(prisma as unknown as PrismaService, lease, stores.materializer, new FakeTilingEngine('none'), stores.derivStore, sealer);
  const real = verdictFor(stores);
  const slowVerdict = { applyVerdict: async (id: string): Promise<VerdictResult> => { await delay(150); return real.applyVerdict(id); } } as unknown as GenerationVerdictService;
  const verification = new VerificationWorkerRuntime(prisma as unknown as PrismaService, slowVerdict, c, WORKER, LOG);
  const processing = new ProcessingWorkerRuntime(lease, proc, c, WORKER, LOG, (id) => verification.enqueue(id));

  await processing.claimAndProcess(); // job 1 → seal → enqueue slow verify (150ms)
  await processing.awaitInFlight();
  expect(verification.inFlightCount).toBe(1); // verification busy…
  const started2 = await processing.claimAndProcess(); // …yet the processing slot is free → claim job 2
  expect(started2).toBe(1);
  await processing.awaitInFlight();
  await verification.awaitInFlight();
  expect(await prisma.derivativeGeneration.count({ where: { status: { in: ['READY', 'QC_PENDING'] } } })).toBeGreaterThanOrEqual(2);
});

it('a dropped/failing immediate trigger is recovered by the periodic reconciler', async () => {
  const stores = newStores();
  const ctx = await seedSlide(stores);
  await prisma.slideProcessingJob.create({ data: { labId: ctx.labId, ingestionId: ctx.ingestionId, status: 'QUEUED', attempt: 1 } as any });
  const lease = new JobLeaseService(prisma as unknown as PrismaService, cfg());
  const sealer = new GenerationSealer(prisma as unknown as PrismaService, lease, stores.derivStore);
  const proc = new SlideProcessingProcessor(prisma as unknown as PrismaService, lease, stores.materializer, new FakeTilingEngine('none'), stores.derivStore, sealer);
  const verification = new VerificationWorkerRuntime(prisma as unknown as PrismaService, verdictFor(stores), cfg(), WORKER, LOG);
  // onProcessed throws → processing still succeeds; the generation stays QC_PENDING for the reconciler.
  const processing = new ProcessingWorkerRuntime(lease, proc, cfg(), WORKER, LOG, () => { throw new Error('immediate trigger failed'); });
  await processing.claimAndProcess();
  await processing.awaitInFlight();
  const gen = await prisma.derivativeGeneration.findFirstOrThrow({ where: { slideId: ctx.slideId } });
  expect(gen.status).toBe('QC_PENDING'); // immediate verify dropped

  await verification.reconcileTick();
  await verification.awaitInFlight();
  expect((await getGen(gen.id)).status).toBe('READY'); // reconciler recovered it
});

it('concurrent verification of the same generation yields exactly one terminal provenance row', async () => {
  const stores = newStores();
  const ctx = await seedAndSeal(stores);
  const vrA = new VerificationWorkerRuntime(prisma as unknown as PrismaService, verdictFor(stores), cfg(), 'wA', LOG);
  const vrB = new VerificationWorkerRuntime(prisma as unknown as PrismaService, verdictFor(stores), cfg(), 'wB', LOG);
  vrA.enqueue(ctx.generationId);
  vrB.enqueue(ctx.generationId);
  await Promise.all([vrA.awaitInFlight(), vrB.awaitInFlight()]);
  expect((await getGen(ctx.generationId)).status).toBe('READY');
  expect(await verifications(ctx.generationId)).toHaveLength(1); // one terminal provenance, no flip
});

it('reconciler fills all free verification slots even when leading candidates are already in-flight', async () => {
  const stores = newStores();
  const c = cfg({ verifyMaxConcurrent: 2, verifyBatchSize: 20 });
  const a = await seedAndSeal(stores);
  const b = await seedAndSeal(stores);
  const vr = new VerificationWorkerRuntime(prisma as unknown as PrismaService, verdictFor(stores), c, WORKER, LOG);
  vr.enqueue(a.generationId); // a already in-flight; b's slot must still be filled by the reconciler
  const started = await vr.reconcileTick();
  expect(started).toBe(1); // b started (a skipped as in-flight) — did not stop at the first duplicate
  await vr.awaitInFlight();
  expect((await getGen(a.generationId)).status).toBe('READY');
  expect((await getGen(b.generationId)).status).toBe('READY');
});
