import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../../database/prisma.service';
import { LocalSourceObjectStore } from '../storage/local-source-object-store';
import { LocalDerivativeObjectStore } from '../storage/local-derivative-object-store';
import { LocalSourceMaterializer } from './local-source-materializer';
import { FakeTilingEngine } from './fake-tiling-engine';
import { JobLeaseService, ClaimedJob } from './job-lease.service';
import { loadProcessingConfig } from './processing-config';
import { AcquisitionMetadataConflictError, LeaseLostError, SlideProcessingProcessor } from './slide-processing.processor';
import { InvalidEngineOutputError } from './tiling-output-validator';

/**
 * P5-3B.1C-ii — the JobProcessor against the isolated test DB + real local stores + the fake engine.
 * Proves: a claimed job → an UNSEALED PROCESSING generation with derivative bytes stored + SlideAsset
 * rows registered; lease-safe aborts; metadata conflict handling; retry → new generation. No sealing,
 * verification, or SUCCEEDED is exercised.
 */
const prisma = createTestPrisma();
const cfg = { ...loadProcessingConfig({} as any), leaseDurationMs: 60_000 };
const lease = new JobLeaseService(prisma as unknown as PrismaService, cfg);

const WORKER = 'worker-1';
let roots: string[] = [];
let labIds: string[] = [];

function newStores() {
  const sourceRoot = mkTmp('src');
  const store = new LocalSourceObjectStore(sourceRoot);
  const materializer = new LocalSourceMaterializer(store, mkTmp('mat'));
  const derivStore = new LocalDerivativeObjectStore(mkTmp('deriv'));
  return { store, materializer, derivStore };
}
function mkTmp(tag: string): string {
  const p = path.join(os.tmpdir(), `p5c-${tag}-${randomUUID()}`);
  roots.push(p);
  return p;
}
function processor(stores: ReturnType<typeof newStores>, corruption: ConstructorParameters<typeof FakeTilingEngine>[0] = 'none') {
  return new SlideProcessingProcessor(
    prisma as unknown as PrismaService,
    lease,
    stores.materializer,
    new FakeTilingEngine(corruption),
    stores.derivStore,
  );
}

async function seed(store: LocalSourceObjectStore, opts: { slideOver?: Record<string, unknown> } = {}) {
  const lab = await prisma.lab.create({ data: { name: 'p5c', slug: `p5c-${randomUUID()}` } });
  labIds.push(lab.id);
  const patient = await prisma.patient.create({ data: { labId: lab.id, registrationNo: randomUUID(), firstName: 'P', lastName: 'X' } });
  const record = await prisma.record.create({ data: { labId: lab.id, identifier: randomUUID(), patientId: patient.id } });
  const slide = await prisma.digitalSlide.create({
    data: { labId: lab.id, recordId: record.id, slideUrl: '', availabilityStatus: 'DRAFT', sourceKind: 'UPLOAD', ...(opts.slideOver ?? {}) },
  });
  // seed the private source object so the materializer can read + re-verify it
  const key = `slides/${lab.id}/${slide.id}/source/i/image.svs`;
  await store.createUploadSession(key);
  await store.writeChunk(key, 0, Buffer.from('fake-wsi-source-bytes'));
  const { checksum } = await store.completeUpload(key);
  const ingestion = await prisma.slideIngestion.create({
    data: { labId: lab.id, slideId: slide.id, sourceKind: 'UPLOAD', status: 'VERIFIED', sourceObjectKey: key, sourceChecksum: checksum },
  });
  return { labId: lab.id, slideId: slide.id, ingestionId: ingestion.id };
}

async function seedRunningJob(labId: string, ingestionId: string, workerId = WORKER, attempt = 1): Promise<ClaimedJob> {
  const future = new Date(Date.now() + 60_000);
  const job = await prisma.slideProcessingJob.create({
    data: { labId, ingestionId, status: 'RUNNING', workerId, attempt, startedAt: new Date(), heartbeatAt: new Date(), leaseExpiresAt: future } as any,
  });
  return { id: job.id, ingestionId, labId, attempt, leaseExpiresAt: future };
}

afterEach(async () => {
  for (const labId of labIds) {
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

it('produces an UNSEALED PROCESSING generation with registered assets, bytes, and acquisition metadata', async () => {
  const stores = newStores();
  const { labId, slideId, ingestionId } = await seed(stores.store);
  const job = await seedRunningJob(labId, ingestionId);

  const { generationId } = await processor(stores).process(job, WORKER);

  const gen = await prisma.derivativeGeneration.findUniqueOrThrow({ where: { id: generationId } });
  expect(gen.status).toBe('PROCESSING');
  expect(gen.sealed).toBe(false);
  expect(gen.verified).toBe(false);
  expect(gen.tileSourceType).toBe('DZI');
  expect(gen.tiledWidth).toBe(300);
  expect(gen.levelCount).toBe(2);

  const assets = await prisma.slideAsset.findMany({ where: { generationId }, orderBy: { role: 'asc' } });
  const byRole = Object.fromEntries(assets.map((a) => [a.role, a]));
  expect(new Set(assets.map((a) => a.role))).toEqual(new Set(['TILE_PYRAMID', 'DZI_DESCRIPTOR', 'LABEL', 'THUMBNAIL']));
  expect(byRole['TILE_PYRAMID'].checksum).toBeNull(); // per-level integrity is B.2
  expect(byRole['TILE_PYRAMID'].sizeBytes).toBeGreaterThan(0);
  expect(byRole['DZI_DESCRIPTOR'].checksum).not.toBeNull();

  expect((await stores.derivStore.listPrefix(byRole['TILE_PYRAMID'].storageKey)).length).toBeGreaterThan(0);

  const slide = await prisma.digitalSlide.findUniqueOrThrow({ where: { id: slideId } });
  expect(slide.sourceWidth).toBe(300);
  expect(slide.mpp).toBe(0.25);
  expect(slide.objectivePower).toBe(40);
  expect(slide.scanner).toBe('FakeScanner');
  expect(slide.availabilityStatus).toBe('DRAFT'); // never published

  const jobRow = await prisma.slideProcessingJob.findUniqueOrThrow({ where: { id: job.id } });
  expect(jobRow.status).toBe('RUNNING'); // never SUCCEEDED (that is B.2)
});

it('rejects invalid engine output and registers no assets', async () => {
  const stores = newStores();
  const { labId, ingestionId } = await seed(stores.store);
  const job = await seedRunningJob(labId, ingestionId);
  await expect(processor(stores, 'bad-level-count').process(job, WORKER)).rejects.toBeInstanceOf(InvalidEngineOutputError);
  expect(await prisma.slideAsset.count({ where: { labId } })).toBe(0);
});

it('aborts before any generation when the lease is not held', async () => {
  const stores = newStores();
  const { labId, ingestionId } = await seed(stores.store);
  const job = await seedRunningJob(labId, ingestionId, 'someone-else'); // owned by another worker
  await expect(processor(stores).process(job, WORKER)).rejects.toBeInstanceOf(LeaseLostError);
  expect(await prisma.derivativeGeneration.count({ where: { labId } })).toBe(0);
});

it('a metadata conflict in the FINAL transaction rolls back everything; promoted bytes remain orphans', async () => {
  const stores = newStores();
  const { labId, slideId, ingestionId } = await seed(stores.store, { slideOver: { sourceWidth: 999 } }); // conflicts with fake's 300
  const job = await seedRunningJob(labId, ingestionId);

  await expect(processor(stores).process(job, WORKER)).rejects.toBeInstanceOf(AcquisitionMetadataConflictError);

  // The whole final transaction rolled back: no assets, generation metadata unchanged, slide metadata unchanged.
  expect(await prisma.slideAsset.count({ where: { labId } })).toBe(0);
  const gen = await prisma.derivativeGeneration.findFirstOrThrow({ where: { slideId } });
  expect(gen.tiledWidth).toBeNull();
  const slide = await prisma.digitalSlide.findUniqueOrThrow({ where: { id: slideId } });
  expect(slide.sourceWidth).toBe(999); // never overwritten
  // Promotion happened before the final tx → bytes remain as safe orphans under the generation prefix.
  expect((await stores.derivStore.listPrefix(`slides/${labId}/${slideId}/derivatives/${gen.id}`)).length).toBeGreaterThan(0);
});

it('an existing generation never bypasses lease ownership — a stale worker aborts (no engine, no assets)', async () => {
  const stores = newStores();
  const { labId, slideId, ingestionId } = await seed(stores.store);
  const job = await seedRunningJob(labId, ingestionId, WORKER);
  // A generation already exists for this job (as if an earlier in-lease step created it)…
  await prisma.derivativeGeneration.create({
    data: { id: randomUUID(), labId, slideId, jobId: job.id, status: 'PROCESSING', tileSourceType: 'DZI', sealed: false, verified: false } as any,
  });
  // …but the lease has been transferred away.
  await prisma.slideProcessingJob.update({ where: { id: job.id }, data: { workerId: 'thief' } });

  const tileSpy = jest.spyOn((await import('./fake-tiling-engine')).FakeTilingEngine.prototype, 'tile');
  await expect(processor(stores).process(job, WORKER)).rejects.toBeInstanceOf(LeaseLostError);
  expect(tileSpy).not.toHaveBeenCalled(); // ownership dominated: no engine execution
  expect(await prisma.slideAsset.count({ where: { labId } })).toBe(0);
  const gen = await prisma.derivativeGeneration.findFirstOrThrow({ where: { slideId } });
  expect(gen.tiledWidth).toBeNull(); // unchanged
  tileSpy.mockRestore();
});

it('a retry mints a NEW generation (one per job attempt)', async () => {
  const stores = newStores();
  const { labId, ingestionId } = await seed(stores.store);
  const job1 = await seedRunningJob(labId, ingestionId, WORKER, 1);
  const g1 = await processor(stores).process(job1, WORKER);
  // terminalize job1 + a fresh attempt (as reclamation would)
  await prisma.slideProcessingJob.update({ where: { id: job1.id }, data: { status: 'TIMED_OUT' } });
  const job2 = await seedRunningJob(labId, ingestionId, WORKER, 2);
  const g2 = await processor(stores).process(job2, WORKER);

  expect(g2.generationId).not.toBe(g1.generationId);
  expect(await prisma.derivativeGeneration.count({ where: { slideId: (await prisma.slideIngestion.findUniqueOrThrow({ where: { id: ingestionId } })).slideId } })).toBe(2);
});
