import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../../database/prisma.service';
import { LocalSourceObjectStore } from '../storage/local-source-object-store';
import { LocalDerivativeObjectStore } from '../storage/local-derivative-object-store';
import { LocalSourceMaterializer } from './local-source-materializer';
import { FakeTilingEngine } from './fake-tiling-engine';
import { JobLeaseService, ClaimedJob } from './job-lease.service';
import { loadProcessingConfig } from './processing-config';
import { loadTilingConfig } from './tiling-config';
import { TilingResult } from './tiling-engine';
import { SlideProcessingProcessor } from './slide-processing.processor';
import { generationManifestKey, generationPrefix } from './derivative-keys';
import {
  AssetRoleInvariantError,
  GenerationAlreadySealedError,
  GenerationSealer,
  ManifestRoundTripError,
  PyramidAggregateMismatchError,
  SealInput,
  SealLeaseLostError,
} from './generation-sealer';

/**
 * P5-3B.2B — the GenerationSealer against the isolated test DB + real local stores + the fake engine.
 *
 * Each case first produces a genuine PROCESSING generation (via a full processor.process() run, then a
 * "rewind" that removes the manifest + unseals) so the sealer is driven against REAL persisted pyramid
 * bytes and asset rows. Proves: PROCESSING → QC_PENDING with exactly one MANIFEST + checksum + SUCCEEDED
 * job; deterministic canonical manifest bytes; the OD-8 already-sealed vs lost-ownership distinction;
 * integrity aborts (pyramid mismatch, role invariant, round-trip conflict) with zero DB mutation. No
 * verification, READY, or publication is exercised.
 */
const prisma = createTestPrisma();
const leaseCfg = { ...loadProcessingConfig({} as any), leaseDurationMs: 60_000 };
const lease = new JobLeaseService(prisma as unknown as PrismaService, leaseCfg);
const tilingCfg = loadTilingConfig({} as any);

const WORKER = 'worker-1';
let roots: string[] = [];
let labIds: string[] = [];

function mkTmp(tag: string): string {
  const p = path.join(os.tmpdir(), `p5-2b-${tag}-${randomUUID()}`);
  roots.push(p);
  return p;
}
function newStores() {
  const store = new LocalSourceObjectStore(mkTmp('src'));
  const materializer = new LocalSourceMaterializer(store, mkTmp('mat'));
  const derivStore = new LocalDerivativeObjectStore(mkTmp('deriv'));
  return { store, materializer, derivStore };
}
function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (d) => chunks.push(d as Buffer));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function seed(store: LocalSourceObjectStore) {
  const lab = await prisma.lab.create({ data: { name: 'p5-2b', slug: `p5-2b-${randomUUID()}` } });
  labIds.push(lab.id);
  const patient = await prisma.patient.create({ data: { labId: lab.id, registrationNo: randomUUID(), firstName: 'P', lastName: 'X' } });
  const record = await prisma.record.create({ data: { labId: lab.id, identifier: randomUUID(), patientId: patient.id } });
  const slide = await prisma.digitalSlide.create({
    data: { labId: lab.id, recordId: record.id, slideUrl: '', availabilityStatus: 'DRAFT', sourceKind: 'UPLOAD' },
  });
  const key = `slides/${lab.id}/${slide.id}/source/i/image.svs`;
  await store.createUploadSession(key);
  await store.writeChunk(key, 0, Buffer.from('fake-wsi-source-bytes'));
  const { checksum } = await store.completeUpload(key);
  const ingestion = await prisma.slideIngestion.create({
    data: { labId: lab.id, slideId: slide.id, sourceKind: 'UPLOAD', status: 'VERIFIED', sourceObjectKey: key, sourceChecksum: checksum },
  });
  return { labId: lab.id, slideId: slide.id, ingestionId: ingestion.id, sourceObjectKey: key, sourceChecksum: checksum };
}

async function seedRunningJob(labId: string, ingestionId: string): Promise<ClaimedJob> {
  const future = new Date(Date.now() + 60_000);
  const job = await prisma.slideProcessingJob.create({
    data: { labId, ingestionId, status: 'RUNNING', workerId: WORKER, attempt: 1, startedAt: new Date(), heartbeatAt: new Date(), leaseExpiresAt: future } as any,
  });
  return { id: job.id, ingestionId, labId, attempt: 1, leaseExpiresAt: future };
}

/** Deterministic fake TilingResult (structure/acquisition/engine are constants; assets are unused by the sealer). */
async function fakeResult(): Promise<TilingResult> {
  const out = mkTmp('fake-out');
  await fs.mkdir(out, { recursive: true });
  return new FakeTilingEngine('none').tile({ workingFilePath: '/dev/null', outputDirectory: out, config: tilingCfg, abortSignal: new AbortController().signal });
}

/** Rewind a just-sealed generation back to PROCESSING/unsealed so the sealer can be driven directly. */
async function rewind(labId: string, slideId: string, generationId: string, jobId: string, derivStore: LocalDerivativeObjectStore) {
  const key = generationManifestKey(generationPrefix(labId, slideId, generationId));
  await derivStore.delete(key).catch(() => undefined);
  await prisma.$executeRaw`DELETE FROM "SlideAsset" WHERE "generationId" = ${generationId} AND role = 'MANIFEST'::"SlideAssetRole"`;
  await prisma.$executeRaw`
    UPDATE "DerivativeGeneration" SET status = 'PROCESSING'::"GenerationStatus", sealed = false, "sealedAt" = NULL, "derivativeManifestChecksum" = NULL
    WHERE id = ${generationId}
  `;
  const future = new Date(Date.now() + 60_000);
  await prisma.$executeRaw`
    UPDATE "SlideProcessingJob" SET status = 'RUNNING'::"ProcessingJobStatus", "finishedAt" = NULL, "workerId" = ${WORKER}, "leaseExpiresAt" = ${future}, "heartbeatAt" = ${new Date()}
    WHERE id = ${jobId}
  `;
}

async function setup() {
  const stores = newStores();
  const ids = await seed(stores.store);
  const job = await seedRunningJob(ids.labId, ids.ingestionId);
  const sealer = new GenerationSealer(prisma as unknown as PrismaService, lease, stores.derivStore);
  const proc = new SlideProcessingProcessor(
    prisma as unknown as PrismaService,
    lease,
    stores.materializer,
    new FakeTilingEngine('none'),
    stores.derivStore,
    sealer,
  );
  const { generationId } = await proc.process(job, WORKER); // produces + seals a real generation
  await rewind(ids.labId, ids.slideId, generationId, job.id, stores.derivStore);
  const result = await fakeResult();
  const input: SealInput = {
    jobId: job.id,
    workerId: WORKER,
    generationId,
    labId: ids.labId,
    slideId: ids.slideId,
    ingestionId: ids.ingestionId,
    sourceObjectKey: ids.sourceObjectKey,
    sourceChecksum: ids.sourceChecksum,
    result,
    config: tilingCfg,
  };
  return { stores, sealer, ids, jobId: job.id, generationId, input };
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

it('seals PROCESSING → QC_PENDING with exactly one MANIFEST, a matching checksum, and a SUCCEEDED job', async () => {
  const { sealer, input, stores, generationId, jobId } = await setup();

  const res = await sealer.seal(input);

  const gen = await prisma.derivativeGeneration.findUniqueOrThrow({ where: { id: generationId } });
  expect(gen.status).toBe('QC_PENDING');
  expect(gen.sealed).toBe(true);
  expect(gen.verified).toBe(false); // verification is B.3
  expect(gen.sealedAt).not.toBeNull();
  expect(gen.publishedAt).toBeNull();
  expect(gen.derivativeManifestChecksum).toBe(res.manifestChecksum);

  const manifestAssets = await prisma.slideAsset.findMany({ where: { generationId, role: 'MANIFEST' } });
  expect(manifestAssets).toHaveLength(1); // exactly one canonical manifest
  expect(manifestAssets[0].storageKey).toBe(res.manifestKey);
  expect(manifestAssets[0].checksum).toBe(res.manifestChecksum);

  // The generation checksum is sha256 of the PERSISTED manifest bytes.
  const bytes = await streamToBuffer(stores.derivStore.openReadStream(res.manifestKey));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(res.manifestChecksum);
  expect(manifestAssets[0].sizeBytes).toBe(bytes.length);

  // The persisted manifest is the canonical schema and excludes itself.
  const parsed = JSON.parse(bytes.toString('utf8'));
  expect(parsed.schemaId).toBe('pathology.manifest.v1');
  expect(parsed.generationId).toBe(generationId);
  expect(parsed.levels).toHaveLength(2);
  expect(parsed.assets.map((a: { role: string }) => a.role)).not.toContain('MANIFEST');

  const job = await prisma.slideProcessingJob.findUniqueOrThrow({ where: { id: jobId } });
  expect(job.status).toBe('SUCCEEDED');
  expect(job.finishedAt).not.toBeNull();
  expect(job.workerId).toBe(WORKER); // historical lease field preserved (OD-7)
});

it('persists byte-for-byte identical canonical manifest bytes across repeated seals (determinism)', async () => {
  const { sealer, input, stores, ids, generationId, jobId } = await setup();

  const first = await sealer.seal(input);
  const bytes1 = await streamToBuffer(stores.derivStore.openReadStream(first.manifestKey));

  await rewind(ids.labId, ids.slideId, generationId, jobId, stores.derivStore);
  const second = await sealer.seal(input);
  const bytes2 = await streamToBuffer(stores.derivStore.openReadStream(second.manifestKey));

  expect(second.manifestChecksum).toBe(first.manifestChecksum);
  expect(bytes2.equals(bytes1)).toBe(true); // byte-for-byte identical through the full storage path
});

it('distinguishes already-sealed (OD-8) from lost-ownership: a sealed generation with a live lease throws GenerationAlreadySealedError', async () => {
  const { sealer, input, generationId, jobId } = await setup();
  await sealer.seal(input); // seals; job now SUCCEEDED

  // Reset ONLY the job to a live RUNNING lease, leaving the generation sealed (an illegal-but-constructible state).
  const future = new Date(Date.now() + 60_000);
  await prisma.$executeRaw`
    UPDATE "SlideProcessingJob" SET status = 'RUNNING'::"ProcessingJobStatus", "finishedAt" = NULL, "leaseExpiresAt" = ${future}
    WHERE id = ${jobId}
  `;

  await expect(sealer.seal(input)).rejects.toBeInstanceOf(GenerationAlreadySealedError);
  expect(await prisma.slideAsset.count({ where: { generationId, role: 'MANIFEST' } })).toBe(1); // still exactly one
});

it('aborts with SealLeaseLostError and mutates no DB state when the lease is not held', async () => {
  const { sealer, input, generationId, jobId } = await setup();
  await prisma.$executeRaw`UPDATE "SlideProcessingJob" SET "workerId" = 'thief' WHERE id = ${jobId}`;

  await expect(sealer.seal(input)).rejects.toBeInstanceOf(SealLeaseLostError);

  const gen = await prisma.derivativeGeneration.findUniqueOrThrow({ where: { id: generationId } });
  expect(gen.sealed).toBe(false);
  expect(gen.status).toBe('PROCESSING');
  expect(await prisma.slideAsset.count({ where: { generationId, role: 'MANIFEST' } })).toBe(0);
  const job = await prisma.slideProcessingJob.findUniqueOrThrow({ where: { id: jobId } });
  expect(job.status).toBe('RUNNING'); // never completed
});

it('aborts with PyramidAggregateMismatchError when persisted pyramid bytes diverge from the registered size', async () => {
  const { sealer, input, generationId } = await setup();
  await prisma.$executeRaw`
    UPDATE "SlideAsset" SET "sizeBytes" = "sizeBytes" + 1 WHERE "generationId" = ${generationId} AND role = 'TILE_PYRAMID'::"SlideAssetRole"
  `;
  await expect(sealer.seal(input)).rejects.toBeInstanceOf(PyramidAggregateMismatchError);

  const gen = await prisma.derivativeGeneration.findUniqueOrThrow({ where: { id: generationId } });
  expect(gen.sealed).toBe(false);
  expect(await prisma.slideAsset.count({ where: { generationId, role: 'MANIFEST' } })).toBe(0);
});

it('aborts with AssetRoleInvariantError when a required asset role is missing at seal', async () => {
  const { sealer, input, generationId } = await setup();
  await prisma.$executeRaw`
    DELETE FROM "SlideAsset" WHERE "generationId" = ${generationId} AND role = 'DZI_DESCRIPTOR'::"SlideAssetRole"
  `;
  await expect(sealer.seal(input)).rejects.toBeInstanceOf(AssetRoleInvariantError);

  const gen = await prisma.derivativeGeneration.findUniqueOrThrow({ where: { id: generationId } });
  expect(gen.sealed).toBe(false);
});

it('aborts with ManifestRoundTripError when a conflicting object already occupies the canonical manifest key', async () => {
  const { sealer, input, stores, ids, generationId } = await setup();
  const key = generationManifestKey(generationPrefix(ids.labId, ids.slideId, generationId));
  await stores.derivStore.putImmutableObject(key, Readable.from(Buffer.from('not-the-manifest')));

  await expect(sealer.seal(input)).rejects.toBeInstanceOf(ManifestRoundTripError);

  const gen = await prisma.derivativeGeneration.findUniqueOrThrow({ where: { id: generationId } });
  expect(gen.sealed).toBe(false);
  expect(await prisma.slideAsset.count({ where: { generationId, role: 'MANIFEST' } })).toBe(0);
});
