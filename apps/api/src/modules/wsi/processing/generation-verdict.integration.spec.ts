import { randomUUID } from 'node:crypto';
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
import { GenerationVerifier, VerificationOutcome, VERIFICATION_VERSION } from './generation-verifier';
import { GenerationVerdictService } from './generation-verdict.service';
import { boundedAssetKey, generationPrefix } from './derivative-keys';

/**
 * P5-3B.3B-ii-b — the verdict applier against the isolated test DB + real local stores.
 *
 * Produces a genuine sealed QC_PENDING generation, then drives GenerationVerdictService. Proves: atomic
 * READY|QC_FAILED + one provenance row with a shared verifiedAt; RETRYABLE/stale never mutate and never
 * mark QC_FAILED; terminal idempotency; and — the key acceptance test — a PASSED-then-FAILED race cannot
 * flip a terminal generation. No publication/scheduling.
 */
const prisma = createTestPrisma();
const leaseCfg = { ...loadProcessingConfig({} as any), leaseDurationMs: 60_000 };
const lease = new JobLeaseService(prisma as unknown as PrismaService, leaseCfg);

const WORKER = 'worker-1';
let roots: string[] = [];
let labIds: string[] = [];

function mkTmp(tag: string): string {
  const p = path.join(os.tmpdir(), `p5-3bii-${tag}-${randomUUID()}`);
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
  const lab = await prisma.lab.create({ data: { name: 'p5-3bii', slug: `p5-3bii-${randomUUID()}` } });
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
  const verifier = new GenerationVerifier(prisma as unknown as PrismaService, stores.derivStore);
  const service = new GenerationVerdictService(prisma as unknown as PrismaService, verifier);
  return { stores, ids, generationId, prefix: generationPrefix(ids.labId, ids.slideId, generationId), verifier, service };
}

async function overwrite(store: LocalDerivativeObjectStore, key: string, bytes: Buffer) {
  await store.delete(key);
  await store.putImmutableObject(key, Readable.from(bytes));
}
function countVerifications(generationId: string) {
  return prisma.generationVerification.count({ where: { generationId } });
}
function getGen(generationId: string) {
  return prisma.derivativeGeneration.findUniqueOrThrow({ where: { id: generationId } });
}

/** Store decorator that throws indeterminate on readObject for a key (drives a verifier RETRYABLE). */
class FaultyReadStore implements DerivativeObjectStore {
  constructor(private readonly inner: DerivativeObjectStore, private readonly faultKeys: Set<string>) {}
  putImmutableObject(k: string, s: Readable) { return this.inner.putImmutableObject(k, s); }
  putImmutableTree(p: string, d: string) { return this.inner.putImmutableTree(p, d); }
  openReadStream(k: string) { return this.inner.openReadStream(k); }
  stat(k: string) { return this.inner.stat(k); }
  listPrefix(p: string) { return this.inner.listPrefix(p); }
  delete(k: string) { return this.inner.delete(k); }
  async readObject(k: string): Promise<ObjectRead> {
    if (this.faultKeys.has(k)) throw new Error('simulated indeterminate I/O');
    return this.inner.readObject(k);
  }
}

/** Proxy that fails the SECOND $executeRaw inside a transaction (the UPDATE, after the INSERT) to test rollback. */
function makeFailAfterInsertPrisma(real: any): any {
  return new Proxy(real, {
    get(target, prop) {
      if (prop === '$transaction') {
        return (fn: any, opts?: any) =>
          real.$transaction(async (realTx: any) => {
            let execCount = 0;
            const txProxy = new Proxy(realTx, {
              get(t, p) {
                if (p === '$executeRaw') {
                  return (...args: any[]) => {
                    execCount += 1;
                    if (execCount === 2) throw new Error('injected mid-tx failure after INSERT');
                    return t.$executeRaw(...args);
                  };
                }
                const v = (t as any)[p];
                return typeof v === 'function' ? v.bind(t) : v;
              },
            });
            return fn(txProxy);
          }, opts);
      }
      const v = target[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

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

it('applies PASSED → READY with one provenance row, atomically, sharing verifiedAt', async () => {
  const { service, generationId } = await sealed();
  const res = await service.applyVerdict(generationId);
  expect(res).toMatchObject({ outcome: 'READY', applied: true });

  const gen = await getGen(generationId);
  expect(gen.status).toBe('READY');
  expect(gen.verified).toBe(true);
  expect(gen.verifiedAt).not.toBeNull();
  expect(gen.publishedAt).toBeNull(); // never published

  const rows = await prisma.generationVerification.findMany({ where: { generationId } });
  expect(rows).toHaveLength(1);
  expect(rows[0].outcome).toBe('PASSED');
  expect(rows[0].reasons).toEqual([]);
  expect(rows[0].verifierVersion).toBe(VERIFICATION_VERSION);
  expect(rows[0].manifestChecksum).toBe(gen.derivativeManifestChecksum);
  expect(rows[0].verifiedAt.getTime()).toBe(gen.verifiedAt!.getTime()); // one logical verification instant
});

it('applies FAILED → QC_FAILED with deterministic reasons persisted, atomically', async () => {
  const { service, generationId, prefix, stores } = await sealed();
  await overwrite(stores.derivStore, boundedAssetKey(prefix, 'DZI_DESCRIPTOR'), Buffer.from('corrupt'));
  const res = await service.applyVerdict(generationId);
  expect(res).toMatchObject({ outcome: 'QC_FAILED', applied: true });

  const gen = await getGen(generationId);
  expect(gen.status).toBe('QC_FAILED');
  expect(gen.verified).toBe(false);
  expect(gen.verifiedAt).not.toBeNull();

  const rows = await prisma.generationVerification.findMany({ where: { generationId } });
  expect(rows).toHaveLength(1);
  expect(rows[0].outcome).toBe('FAILED');
  const codes = (rows[0].reasons as { code: string }[]).map((r) => r.code);
  expect(codes).toContain('ASSET_CHECKSUM_MISMATCH');
  expect(rows[0].verifiedAt.getTime()).toBe(gen.verifiedAt!.getTime());
});

it('RETRYABLE leaves the generation QC_PENDING with no provenance row', async () => {
  const { generationId, stores, prefix } = await sealed();
  const manifestKey = `${prefix}/manifest.json`;
  const faulty = new FaultyReadStore(stores.derivStore, new Set([manifestKey]));
  const service = new GenerationVerdictService(prisma as unknown as PrismaService, new GenerationVerifier(prisma as unknown as PrismaService, faulty));
  const res = await service.applyVerdict(generationId);
  expect(res.outcome).toBe('RETRYABLE');
  expect((await getGen(generationId)).status).toBe('QC_PENDING');
  expect(await countVerifications(generationId)).toBe(0);
});

it('a stale SlideAsset mutation between compute and commit yields STALE, never a terminal verdict', async () => {
  const { service, verifier, generationId } = await sealed();
  const outcome = await verifier.verify({ generationId }); // certified against current DB
  await prisma.$executeRaw`UPDATE "SlideAsset" SET "sizeBytes" = "sizeBytes" + 1 WHERE "generationId" = ${generationId} AND role = 'DZI_DESCRIPTOR'::"SlideAssetRole"`;
  const res = await service.commitVerdict(generationId, outcome);
  expect(res.outcome).toBe('STALE');
  expect((await getGen(generationId)).status).toBe('QC_PENDING');
  expect(await countVerifications(generationId)).toBe(0);
});

it('a stale ingestion-provenance mutation yields STALE', async () => {
  const { service, verifier, generationId, ids } = await sealed();
  const outcome = await verifier.verify({ generationId });
  await prisma.$executeRaw`UPDATE "SlideIngestion" SET "sourceChecksum" = ${'9'.repeat(64)} WHERE id = ${ids.ingestionId}`;
  const res = await service.commitVerdict(generationId, outcome);
  expect(res.outcome).toBe('STALE');
  expect((await getGen(generationId)).status).toBe('QC_PENDING');
});

it('a stale structural-metadata mutation yields STALE', async () => {
  const { service, verifier, generationId } = await sealed();
  const outcome = await verifier.verify({ generationId });
  await prisma.$executeRaw`UPDATE "DerivativeGeneration" SET "tiledWidth" = "tiledWidth" + 1 WHERE id = ${generationId}`;
  const res = await service.commitVerdict(generationId, outcome);
  expect(res.outcome).toBe('STALE');
});

it('a mid-transaction failure rolls back BOTH the transition and the provenance row', async () => {
  const { verifier, generationId } = await sealed();
  const outcome = await verifier.verify({ generationId });
  const failing = new GenerationVerdictService(makeFailAfterInsertPrisma(prisma), verifier);
  await expect(failing.commitVerdict(generationId, outcome)).rejects.toThrow(/injected mid-tx failure/);
  expect((await getGen(generationId)).status).toBe('QC_PENDING'); // no transition
  expect(await countVerifications(generationId)).toBe(0); // no provenance row
});

it('concurrent identical PASSED commits produce exactly one transition and one provenance row', async () => {
  const { service, verifier, generationId } = await sealed();
  const outcome = await verifier.verify({ generationId });
  const [a, b] = await Promise.all([service.commitVerdict(generationId, outcome), service.commitVerdict(generationId, outcome)]);
  const applied = [a, b].filter((r) => 'applied' in r && r.applied === true).length;
  expect(applied).toBe(1); // first wins; the other is idempotent
  expect([a, b].every((r) => r.outcome === 'READY')).toBe(true);
  expect(await countVerifications(generationId)).toBe(1);
  expect((await getGen(generationId)).status).toBe('READY');
});

it('REQUIRED: a PASSED-then-FAILED race cannot flip a terminal generation (persistence enforces immutability)', async () => {
  const { service, verifier, generationId } = await sealed();
  const passOutcome = await verifier.verify({ generationId });
  expect(passOutcome.status).toBe('READY');
  // A FAILED verdict carrying the SAME certified state (valid against the still-unchanged DB).
  const failOutcome: VerificationOutcome = {
    status: 'QC_FAILED',
    reasons: [{ code: 'PYRAMID_DIGEST_MISMATCH', detail: 'synthetic-race' }],
    certifiedState: passOutcome.status === 'READY' ? passOutcome.certifiedState : { manifestChecksum: '', fingerprint: '' },
  };

  const first = await service.commitVerdict(generationId, passOutcome);
  const second = await service.commitVerdict(generationId, failOutcome);

  expect(first).toMatchObject({ outcome: 'READY', applied: true });
  expect(second).toMatchObject({ outcome: 'READY', applied: false }); // terminal READY observed; NOT flipped to QC_FAILED
  const gen = await getGen(generationId);
  expect(gen.status).toBe('READY');
  expect(gen.verified).toBe(true);
  const rows = await prisma.generationVerification.findMany({ where: { generationId } });
  expect(rows).toHaveLength(1); // exactly one provenance row (PASSED); the FAILED verdict was never recorded
  expect(rows[0].outcome).toBe('PASSED');
});

it('already-READY generations are idempotent (no second row)', async () => {
  const { service, generationId } = await sealed();
  await service.applyVerdict(generationId);
  const again = await service.applyVerdict(generationId);
  expect(again).toEqual({ outcome: 'READY', applied: false });
  expect(await countVerifications(generationId)).toBe(1);
});

it('already-QC_FAILED generations are idempotent (no second row)', async () => {
  const { service, generationId, prefix, stores } = await sealed();
  await overwrite(stores.derivStore, boundedAssetKey(prefix, 'DZI_DESCRIPTOR'), Buffer.from('corrupt'));
  await service.applyVerdict(generationId);
  const again = await service.applyVerdict(generationId);
  expect(again).toEqual({ outcome: 'QC_FAILED', applied: false });
  expect(await countVerifications(generationId)).toBe(1);
});
