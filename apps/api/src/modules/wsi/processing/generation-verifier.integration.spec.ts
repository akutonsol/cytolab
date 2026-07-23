import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../../database/prisma.service';
import { LocalSourceObjectStore } from '../storage/local-source-object-store';
import { LocalDerivativeObjectStore } from '../storage/local-derivative-object-store';
import { DerivativeObjectStore, ObjectRead } from '../storage/derivative-object-store';
import { LocalSourceMaterializer } from './local-source-materializer';
import { FakeTilingEngine } from './fake-tiling-engine';
import { JobLeaseService, ClaimedJob } from './job-lease.service';
import { loadProcessingConfig } from './processing-config';
import { SlideProcessingProcessor } from './slide-processing.processor';
import { GenerationSealer } from './generation-sealer';
import { GenerationVerifier, VerificationOutcome } from './generation-verifier';
import { canonicalSerialize } from './manifest/canonical-json';
import { boundedAssetKey, generationManifestKey, generationPrefix, generationPyramidPrefix } from './derivative-keys';

/**
 * P5-3B.3A — the read-only GenerationVerifier against the isolated test DB + real local stores.
 *
 * Each case produces a genuine SEALED (QC_PENDING) generation via a full processor run, then tampers
 * exactly one persisted representation (storage bytes, DB rows, or the manifest) and asserts the typed
 * VerificationOutcome. The verifier NEVER transitions state — every case additionally confirms the
 * generation is still QC_PENDING/unverified afterward. Integrity → QC_FAILED; indeterminate storage
 * failure → RETRYABLE (never a permanent QC failure).
 */
const prisma = createTestPrisma();
const leaseCfg = { ...loadProcessingConfig({} as any), leaseDurationMs: 60_000 };
const lease = new JobLeaseService(prisma as unknown as PrismaService, leaseCfg);

const WORKER = 'worker-1';
let roots: string[] = [];
let labIds: string[] = [];

function mkTmp(tag: string): string {
  const p = path.join(os.tmpdir(), `p5-3a-${tag}-${randomUUID()}`);
  roots.push(p);
  return p;
}
function newStores() {
  const store = new LocalSourceObjectStore(mkTmp('src'));
  const materializer = new LocalSourceMaterializer(store, mkTmp('mat'));
  const derivStore = new LocalDerivativeObjectStore(mkTmp('deriv'));
  return { store, materializer, derivStore };
}

async function seed(store: LocalSourceObjectStore) {
  const lab = await prisma.lab.create({ data: { name: 'p5-3a', slug: `p5-3a-${randomUUID()}` } });
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
  return { labId: lab.id, slideId: slide.id, ingestionId: ingestion.id };
}

async function seedRunningJob(labId: string, ingestionId: string): Promise<ClaimedJob> {
  const future = new Date(Date.now() + 60_000);
  const job = await prisma.slideProcessingJob.create({
    data: { labId, ingestionId, status: 'RUNNING', workerId: WORKER, attempt: 1, startedAt: new Date(), heartbeatAt: new Date(), leaseExpiresAt: future } as any,
  });
  return { id: job.id, ingestionId, labId, attempt: 1, leaseExpiresAt: future };
}

/** Produce + seal a real generation, leaving it QC_PENDING/sealed. */
async function sealed() {
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
  const { generationId } = await proc.process(job, WORKER);
  const prefix = generationPrefix(ids.labId, ids.slideId, generationId);
  const verifier = new GenerationVerifier(prisma as unknown as PrismaService, stores.derivStore);
  return { stores, ids, generationId, prefix, manifestKey: generationManifestKey(prefix), verifier };
}

/** Overwrite a persisted object's bytes (test-only; bypasses write-once via delete + put). */
async function overwrite(store: LocalDerivativeObjectStore, key: string, bytes: Buffer) {
  await store.delete(key);
  await store.putImmutableObject(key, Readable.from(bytes));
}
/** Overwrite the manifest bytes AND sync DB checksums so the foundational checksum passes (isolate a downstream reason). */
async function replaceManifest(store: LocalDerivativeObjectStore, generationId: string, manifestKey: string, bytes: Buffer) {
  await overwrite(store, manifestKey, bytes);
  const cs = createHash('sha256').update(bytes).digest('hex');
  await prisma.$executeRaw`UPDATE "SlideAsset" SET checksum = ${cs}, "sizeBytes" = ${bytes.length} WHERE "generationId" = ${generationId} AND role = 'MANIFEST'::"SlideAssetRole"`;
  await prisma.$executeRaw`UPDATE "DerivativeGeneration" SET "derivativeManifestChecksum" = ${cs} WHERE id = ${generationId}`;
}
async function readManifestObj(store: LocalDerivativeObjectStore, manifestKey: string): Promise<Record<string, unknown>> {
  const r = await store.readObject(manifestKey);
  if (r.status !== 'FOUND') throw new Error('manifest missing in test setup');
  return JSON.parse(r.bytes.toString('utf8'));
}

/** Store decorator that throws an indeterminate error for chosen keys on readObject (models a transient fault). */
class FaultyReadStore implements DerivativeObjectStore {
  constructor(private readonly inner: DerivativeObjectStore, private readonly faultKeys: Set<string>) {}
  putImmutableObject(k: string, s: Readable) { return this.inner.putImmutableObject(k, s); }
  putImmutableTree(p: string, d: string) { return this.inner.putImmutableTree(p, d); }
  openReadStream(k: string) { return this.inner.openReadStream(k); }
  stat(k: string) { return this.inner.stat(k); }
  listPrefix(p: string) { return this.inner.listPrefix(p); }
  delete(k: string) { return this.inner.delete(k); }
  async readObject(k: string): Promise<ObjectRead> {
    if (this.faultKeys.has(k)) throw new Error('simulated indeterminate I/O error');
    return this.inner.readObject(k);
  }
}

async function assertStillQcPending(generationId: string) {
  const gen = await prisma.derivativeGeneration.findUniqueOrThrow({ where: { id: generationId } });
  expect(gen.status).toBe('QC_PENDING'); // the verifier never transitions
  expect(gen.verified).toBe(false);
  expect(gen.publishedAt).toBeNull();
}
function codes(outcome: VerificationOutcome): string[] {
  return outcome.status === 'QC_FAILED' ? outcome.reasons.map((r) => r.code) : [];
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

it('certifies a valid sealed generation as READY without mutating it', async () => {
  const { verifier, generationId } = await sealed();
  const outcome = await verifier.verify({ generationId });
  expect(outcome.status).toBe('READY');
  await assertStillQcPending(generationId);
});

it('is deterministic — repeated verification yields the identical outcome', async () => {
  const { verifier, generationId } = await sealed();
  const a = await verifier.verify({ generationId });
  const b = await verifier.verify({ generationId });
  expect(b).toEqual(a);
});

it('detects manifest byte tampering → MANIFEST_CHECKSUM_MISMATCH', async () => {
  const { verifier, generationId, stores, manifestKey } = await sealed();
  await overwrite(stores.derivStore, manifestKey, Buffer.from('tampered-bytes')); // DB checksums NOT updated
  const outcome = await verifier.verify({ generationId });
  expect(codes(outcome)).toEqual(['MANIFEST_CHECKSUM_MISMATCH']);
  await assertStillQcPending(generationId);
});

it('detects DB checksum tampering → MANIFEST_CHECKSUM_MISMATCH', async () => {
  const { verifier, generationId } = await sealed();
  await prisma.$executeRaw`UPDATE "DerivativeGeneration" SET "derivativeManifestChecksum" = ${'0'.repeat(64)} WHERE id = ${generationId}`;
  const outcome = await verifier.verify({ generationId });
  expect(codes(outcome)).toContain('MANIFEST_CHECKSUM_MISMATCH');
});

it('detects a non-canonical manifest whose checksums still agree → MANIFEST_NON_CANONICAL', async () => {
  const { verifier, generationId, stores, manifestKey } = await sealed();
  const obj = await readManifestObj(stores.derivStore, manifestKey);
  const reordered = Object.fromEntries(Object.keys(obj).reverse().map((k) => [k, obj[k]])); // valid content, non-canonical order
  await replaceManifest(stores.derivStore, generationId, manifestKey, Buffer.from(JSON.stringify(reordered), 'utf8'));
  const outcome = await verifier.verify({ generationId });
  expect(codes(outcome)).toEqual(['MANIFEST_NON_CANONICAL']);
});

it('rejects an unknown manifest schema → UNKNOWN_MANIFEST_SCHEMA (never RETRYABLE)', async () => {
  const { verifier, generationId, stores, manifestKey } = await sealed();
  const obj = await readManifestObj(stores.derivStore, manifestKey);
  const bumped = canonicalSerialize({ ...obj, schemaId: 'pathology.manifest.v2' }); // canonical, but unknown schema
  await replaceManifest(stores.derivStore, generationId, manifestKey, Buffer.from(bumped, 'utf8'));
  const outcome = await verifier.verify({ generationId });
  expect(outcome.status).toBe('QC_FAILED');
  expect(codes(outcome)).toEqual(['UNKNOWN_MANIFEST_SCHEMA']);
});

it('detects descriptor byte tampering → ASSET_CHECKSUM_MISMATCH', async () => {
  const { verifier, generationId, prefix, stores } = await sealed();
  await overwrite(stores.derivStore, boundedAssetKey(prefix, 'DZI_DESCRIPTOR'), Buffer.from('corrupt-descriptor'));
  const outcome = await verifier.verify({ generationId });
  expect(codes(outcome)).toContain('ASSET_CHECKSUM_MISMATCH');
  await assertStillQcPending(generationId);
});

it('detects a missing pyramid tile → PYRAMID_AGGREGATE_MISMATCH', async () => {
  const { verifier, generationId, prefix, stores } = await sealed();
  const tiles = await stores.derivStore.listPrefix(generationPyramidPrefix(prefix));
  await stores.derivStore.delete(tiles[0]);
  const outcome = await verifier.verify({ generationId });
  expect(codes(outcome)).toContain('PYRAMID_AGGREGATE_MISMATCH');
});

it('detects a same-length tile mutation → PYRAMID_DIGEST_MISMATCH (aggregate still matches)', async () => {
  const { verifier, generationId, prefix, stores } = await sealed();
  const tiles = await stores.derivStore.listPrefix(generationPyramidPrefix(prefix));
  const r = await stores.derivStore.readObject(tiles[0]);
  if (r.status !== 'FOUND') throw new Error('tile missing');
  await overwrite(stores.derivStore, tiles[0], Buffer.alloc(r.bytes.length, 0x41)); // same length, different content
  const outcome = await verifier.verify({ generationId });
  expect(codes(outcome)).toContain('PYRAMID_DIGEST_MISMATCH');
  expect(codes(outcome)).not.toContain('PYRAMID_AGGREGATE_MISMATCH');
});

it('detects an unexpected stray object under the generation prefix → EXTRA_OBJECT', async () => {
  const { verifier, generationId, prefix, stores } = await sealed();
  await stores.derivStore.putImmutableObject(`${prefix}/rogue-object`, Readable.from(Buffer.from('stray')));
  const outcome = await verifier.verify({ generationId });
  expect(codes(outcome)).toContain('EXTRA_OBJECT');
});

it('detects DB↔manifest divergence with storage bytes intact → DB_MANIFEST_DIVERGENCE', async () => {
  const { verifier, generationId } = await sealed();
  await prisma.$executeRaw`UPDATE "SlideAsset" SET "sizeBytes" = "sizeBytes" + 1 WHERE "generationId" = ${generationId} AND role = 'DZI_DESCRIPTOR'::"SlideAssetRole"`;
  const outcome = await verifier.verify({ generationId });
  expect(codes(outcome)).toContain('DB_MANIFEST_DIVERGENCE');
  expect(codes(outcome)).not.toContain('ASSET_CHECKSUM_MISMATCH'); // storage still matches the manifest
});

it('leaves the generation QC_PENDING and returns RETRYABLE on an indeterminate storage failure', async () => {
  const { generationId, stores, manifestKey } = await sealed();
  const faulty = new FaultyReadStore(stores.derivStore, new Set([manifestKey]));
  const verifier = new GenerationVerifier(prisma as unknown as PrismaService, faulty);
  const outcome = await verifier.verify({ generationId });
  expect(outcome.status).toBe('RETRYABLE');
  await assertStillQcPending(generationId);
});

it('REGRESSION (OD-D): an indeterminate read error on an otherwise-missing object is RETRYABLE, never ASSET_MISSING', async () => {
  const { generationId, prefix, stores } = await sealed();
  const descriptorKey = boundedAssetKey(prefix, 'DZI_DESCRIPTOR');
  await stores.derivStore.delete(descriptorKey); // the object is genuinely gone…
  const faulty = new FaultyReadStore(stores.derivStore, new Set([descriptorKey])); // …but the read is indeterminate
  const verifier = new GenerationVerifier(prisma as unknown as PrismaService, faulty);
  const outcome = await verifier.verify({ generationId });
  expect(outcome.status).toBe('RETRYABLE'); // must NOT be QC_FAILED / ASSET_MISSING
  await assertStillQcPending(generationId);
});
