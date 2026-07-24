import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { BadRequestException, ForbiddenException, StreamableFile } from '@nestjs/common';
import { DeliveryScope } from '@prisma/client';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../../database/prisma.service';
import { LocalSourceObjectStore } from '../storage/local-source-object-store';
import { LocalDerivativeObjectStore } from '../storage/local-derivative-object-store';
import { LocalSourceMaterializer } from '../processing/local-source-materializer';
import { FakeTilingEngine } from '../processing/fake-tiling-engine';
import { JobLeaseService } from '../processing/job-lease.service';
import { loadProcessingConfig } from '../processing/processing-config';
import { SlideProcessingProcessor } from '../processing/slide-processing.processor';
import { GenerationSealer } from '../processing/generation-sealer';
import { GenerationVerifier } from '../processing/generation-verifier';
import { GenerationVerdictService } from '../processing/generation-verdict.service';
import { ValidatedCapability } from './delivery-session.service';
import {
  ArtifactDeliveryService,
  ArtifactNotRegisteredError,
  ArtifactObjectMissingError,
  AssetRegistryIntegrityError,
  CoordinateError,
  ManifestStateError,
  TileBoundsError,
} from './artifact-delivery.service';
import { ArtifactDeliveryController } from './artifact-delivery.controller';

const ALL_SCOPES = [DeliveryScope.DESCRIPTOR, DeliveryScope.TILES, DeliveryScope.ASSOCIATED_IMAGES, DeliveryScope.MANIFEST];
const prisma = createTestPrisma();
const leaseCfg = { ...loadProcessingConfig({} as any), leaseDurationMs: 60_000 };
const lease = new JobLeaseService(prisma as unknown as PrismaService, leaseCfg);
const WORKER = 'worker-1';
let roots: string[] = [];
let labIds: string[] = [];

function mkTmp(tag: string): string {
  const p = path.join(os.tmpdir(), `p5-5bii-${tag}-${randomUUID()}`);
  roots.push(p);
  return p;
}
function newStores() {
  const store = new LocalSourceObjectStore(mkTmp('src'));
  const materializer = new LocalSourceMaterializer(store, mkTmp('mat'));
  const derivStore = new LocalDerivativeObjectStore(mkTmp('deriv'));
  return { store, materializer, derivStore };
}
function drain(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c) => chunks.push(c as Buffer));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/** Produce + seal + verify a READY generation with real derivative assets; return a delivery context. */
async function readyGen() {
  const stores = newStores();
  const lab = await prisma.lab.create({ data: { name: 'p5-5bii', slug: `p5-5bii-${randomUUID()}` } });
  labIds.push(lab.id);
  const patient = await prisma.patient.create({ data: { labId: lab.id, registrationNo: randomUUID(), firstName: 'P', lastName: 'X' } });
  const record = await prisma.record.create({ data: { labId: lab.id, identifier: randomUUID(), patientId: patient.id } });
  const slide = await prisma.digitalSlide.create({ data: { labId: lab.id, recordId: record.id, slideUrl: '', availabilityStatus: 'DRAFT', sourceKind: 'UPLOAD' } });
  const key = `slides/${lab.id}/${slide.id}/source/i/${randomUUID()}.svs`;
  await stores.store.createUploadSession(key);
  await stores.store.writeChunk(key, 0, Buffer.from('fake-wsi-source-bytes'));
  const { checksum } = await stores.store.completeUpload(key);
  const ing = await prisma.slideIngestion.create({ data: { labId: lab.id, slideId: slide.id, sourceKind: 'UPLOAD', status: 'VERIFIED', sourceObjectKey: key, sourceChecksum: checksum } });
  const future = new Date(Date.now() + 60_000);
  const job = await prisma.slideProcessingJob.create({ data: { labId: lab.id, ingestionId: ing.id, status: 'RUNNING', workerId: WORKER, attempt: 1, startedAt: new Date(), heartbeatAt: new Date(), leaseExpiresAt: future } as any });
  const sealer = new GenerationSealer(prisma as unknown as PrismaService, lease, stores.derivStore);
  const proc = new SlideProcessingProcessor(prisma as unknown as PrismaService, lease, stores.materializer, new FakeTilingEngine('none'), stores.derivStore, sealer);
  const { generationId } = await proc.process({ id: job.id, ingestionId: ing.id, labId: lab.id, attempt: 1, leaseExpiresAt: future }, WORKER);
  const verdict = new GenerationVerdictService(prisma as unknown as PrismaService, new GenerationVerifier(prisma as unknown as PrismaService, stores.derivStore));
  expect((await verdict.applyVerdict(generationId)).outcome).toBe('READY');
  const service = new ArtifactDeliveryService(prisma as unknown as PrismaService, stores.derivStore);
  return { labId: lab.id, slideId: slide.id, generationId, stores, service };
}
function cap(ctx: { labId: string; slideId: string; generationId: string }, scopes = ALL_SCOPES): ValidatedCapability {
  return { sessionId: 'sess', labId: ctx.labId, slideId: ctx.slideId, generationId: ctx.generationId, actorUserId: 'u', scopes };
}

afterEach(async () => {
  for (const labId of labIds) {
    await prisma.$executeRaw`DELETE FROM "DeliverySession" WHERE "labId" = ${labId}`;
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

it('streams the DZI descriptor bytes with an XML content type', async () => {
  const ctx = await readyGen();
  const a = await ctx.service.descriptor(cap(ctx));
  expect(a.contentType).toBe('application/xml');
  expect((await drain(a.stream)).toString('utf8')).toBe('<Image TileSize="256" Overlap="1"/>');
});

it('streams tile bytes for in-bounds coordinates with an image content type', async () => {
  const ctx = await readyGen();
  const t0 = await ctx.service.tile(cap(ctx), { level: '0', x: '0', y: '0' });
  expect(t0.contentType).toBe('image/jpeg');
  expect((await drain(t0.stream)).toString('utf8')).toBe('L0-0_0');
  const t1 = await ctx.service.tile(cap(ctx), { level: '1', x: '1', y: '0' });
  expect((await drain(t1.stream)).toString('utf8')).toBe('L1-1_0');
});

it('rejects out-of-bounds tiles (404) and malformed coordinates (400)', async () => {
  const ctx = await readyGen();
  await expect(ctx.service.tile(cap(ctx), { level: '0', x: '1', y: '0' })).rejects.toBeInstanceOf(TileBoundsError); // level0 is 1x1
  await expect(ctx.service.tile(cap(ctx), { level: '5', x: '0', y: '0' })).rejects.toBeInstanceOf(TileBoundsError);
  for (const bad of ['01', '+1', '1.0', '1e3', '0x10', ' 1', '..']) {
    await expect(ctx.service.tile(cap(ctx), { level: bad, x: '0', y: '0' })).rejects.toBeInstanceOf(CoordinateError);
  }
});

it('serves the manifest only with the MANIFEST scope', async () => {
  const ctx = await readyGen();
  await expect(ctx.service.manifest(cap(ctx, [DeliveryScope.TILES]))).rejects.toThrow(/scope/);
  const m = await ctx.service.manifest(cap(ctx));
  expect(m.contentType).toBe('application/json');
  const parsed = JSON.parse((await drain(m.stream)).toString('utf8'));
  expect(parsed.schemaId).toBe('pathology.manifest.v1');
  expect(parsed.generationId).toBe(ctx.generationId);
});

it('enforces scopes on every artifact (descriptor without DESCRIPTOR → scope error)', async () => {
  const ctx = await readyGen();
  await expect(ctx.service.descriptor(cap(ctx, [DeliveryScope.TILES]))).rejects.toThrow(/scope/);
});

it('serves a registered associated image and 404s a non-registered one', async () => {
  const ctx = await readyGen();
  const label = await ctx.service.associated(cap(ctx), 'LABEL');
  expect(label.contentType).toBe('application/octet-stream');
  expect((await drain(label.stream)).toString('utf8')).toBe('LABEL');
  await expect(ctx.service.associated(cap(ctx), 'MACRO')).rejects.toBeInstanceOf(ArtifactNotRegisteredError); // fake has no MACRO
});

it('treats a duplicate registry role as an integrity error (500 class)', async () => {
  const ctx = await readyGen();
  await prisma.$executeRaw`
    INSERT INTO "SlideAsset" (id, "labId", "generationId", role, "storageKey", checksum, "sizeBytes", "createdAt")
    VALUES (${randomUUID()}, ${ctx.labId}, ${ctx.generationId}, 'DZI_DESCRIPTOR'::"SlideAssetRole", 'dup', 'x', 1, ${new Date()})
  `;
  await expect(ctx.service.descriptor(cap(ctx))).rejects.toBeInstanceOf(AssetRegistryIntegrityError);
});

it('404s a tile that is within bounds but physically missing (logged as an anomaly)', async () => {
  const ctx = await readyGen();
  const pyramid = await prisma.slideAsset.findFirstOrThrow({ where: { generationId: ctx.generationId, role: 'TILE_PYRAMID' } });
  const tiles = await ctx.stores.derivStore.listPrefix(pyramid.storageKey);
  await ctx.stores.derivStore.delete(tiles[0]);
  await expect(ctx.service.tile(cap(ctx), { level: '0', x: '0', y: '0' })).rejects.toBeInstanceOf(ArtifactObjectMissingError);
});

it('rejects a manifest whose checksum no longer matches the generation (manifest state error)', async () => {
  const ctx = await readyGen();
  await prisma.$executeRaw`UPDATE "DerivativeGeneration" SET "derivativeManifestChecksum" = ${'0'.repeat(64)} WHERE id = ${ctx.generationId}`;
  await expect(ctx.service.tile(cap(ctx), { level: '0', x: '0', y: '0' })).rejects.toBeInstanceOf(ManifestStateError);
});

it('SOURCE ISOLATION: a registry key that escapes the generation prefix is rejected, never served', async () => {
  const ctx = await readyGen();
  // Tamper the descriptor row to point at the private SOURCE object of the same slide.
  const sourceKey = `slides/${ctx.labId}/${ctx.slideId}/source/i/secret.svs`;
  await prisma.$executeRaw`UPDATE "SlideAsset" SET "storageKey" = ${sourceKey} WHERE "generationId" = ${ctx.generationId} AND role = 'DZI_DESCRIPTOR'::"SlideAssetRole"`;
  await expect(ctx.service.descriptor(cap(ctx))).rejects.toBeInstanceOf(ManifestStateError); // escapes derivatives/<gen> prefix
});

it('exposes ONLY the four typed artifact methods publicly — no generic object accessor', async () => {
  const ctx = await readyGen();
  const publicApi = Object.getOwnPropertyNames(Object.getPrototypeOf(ctx.service)).filter((n) => n !== 'constructor' && !n.startsWith('_'));
  // The typed surface + guarded internals; crucially, no method takes a caller-supplied raw key/path.
  expect(publicApi).toEqual(expect.arrayContaining(['descriptor', 'tile', 'manifest', 'associated']));
  expect(publicApi).not.toContain('getObject');
  expect(publicApi).not.toContain('getArtifact');
  expect(publicApi).not.toContain('read');
});

// ── Controller mapping (typed errors → HTTP, StreamableFile on success) ─────────────────────────────────
it('the controller returns a StreamableFile and maps typed errors to HTTP', async () => {
  const ctx = await readyGen();
  const controller = new ArtifactDeliveryController(ctx.service);
  const ok = await controller.descriptor(cap(ctx));
  expect(ok).toBeInstanceOf(StreamableFile);
  await expect(controller.manifest(cap(ctx, [DeliveryScope.TILES]))).rejects.toBeInstanceOf(ForbiddenException); // ScopeError → 403
  expect(() => controller.associated(cap(ctx), 'NONSENSE' as any)).toThrow(BadRequestException); // closed role enum → 400
});
