import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createTestPrisma } from '@test/test-database';
import { DeliveryScope } from '@prisma/client';
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
import { SlidePublicationService } from '../processing/slide-publication.service';
import { PublishedGenerationResolver, IllegalPublishedGenerationError, PublicationDivergenceError, SlideNotPublishedError } from './published-generation.resolver';
import {
  BoundGenerationUnavailableError,
  DeliverySessionService,
  ExpiredTokenError,
  InvalidTtlError,
  loadDeliverySessionConfig,
  RevokedTokenError,
  ScopeError,
  SessionBindingError,
} from './delivery-session.service';

/**
 * P5-5A-ii — delivery-session runtime against the isolated test DB + real local stores. Proves issuance
 * binding, redemption validity, supersession-vs-archived asymmetry, scope enforcement, binding
 * re-verification, bounded TTL, and tenant-safe neutral revocation. Service-only (no HTTP).
 */
const prisma = createTestPrisma();
const leaseCfg = { ...loadProcessingConfig({} as any), leaseDurationMs: 60_000 };
const lease = new JobLeaseService(prisma as unknown as PrismaService, leaseCfg);
const cfg = loadDeliverySessionConfig({} as any);
const svc = new DeliverySessionService(prisma as unknown as PrismaService, new PublishedGenerationResolver(), cfg);
const publication = new SlidePublicationService(prisma as unknown as PrismaService);
const ACTOR = 'user-viewer-1';
const WORKER = 'worker-1';
let roots: string[] = [];
let labIds: string[] = [];

function mkTmp(tag: string): string {
  const p = path.join(os.tmpdir(), `p5-5aii-${tag}-${randomUUID()}`);
  roots.push(p);
  return p;
}
function newStores() {
  const store = new LocalSourceObjectStore(mkTmp('src'));
  const materializer = new LocalSourceMaterializer(store, mkTmp('mat'));
  const derivStore = new LocalDerivativeObjectStore(mkTmp('deriv'));
  return { store, materializer, derivStore };
}
async function newSlide() {
  const stores = newStores();
  const lab = await prisma.lab.create({ data: { name: 'p5-5aii', slug: `p5-5aii-${randomUUID()}` } });
  labIds.push(lab.id);
  const patient = await prisma.patient.create({ data: { labId: lab.id, registrationNo: randomUUID(), firstName: 'P', lastName: 'X' } });
  const record = await prisma.record.create({ data: { labId: lab.id, identifier: randomUUID(), patientId: patient.id } });
  const slide = await prisma.digitalSlide.create({ data: { labId: lab.id, recordId: record.id, slideUrl: '', availabilityStatus: 'DRAFT', sourceKind: 'UPLOAD' } });
  return { stores, labId: lab.id, slideId: slide.id };
}
async function addReadyGen(ctx: { stores: ReturnType<typeof newStores>; labId: string; slideId: string }): Promise<string> {
  const key = `slides/${ctx.labId}/${ctx.slideId}/source/i/${randomUUID()}.svs`;
  await ctx.stores.store.createUploadSession(key);
  await ctx.stores.store.writeChunk(key, 0, Buffer.from('fake-wsi-source-bytes'));
  const { checksum } = await ctx.stores.store.completeUpload(key);
  const ing = await prisma.slideIngestion.create({ data: { labId: ctx.labId, slideId: ctx.slideId, sourceKind: 'UPLOAD', status: 'VERIFIED', sourceObjectKey: key, sourceChecksum: checksum } });
  const future = new Date(Date.now() + 60_000);
  const job = await prisma.slideProcessingJob.create({ data: { labId: ctx.labId, ingestionId: ing.id, status: 'RUNNING', workerId: WORKER, attempt: 1, startedAt: new Date(), heartbeatAt: new Date(), leaseExpiresAt: future } as any });
  const sealer = new GenerationSealer(prisma as unknown as PrismaService, lease, ctx.stores.derivStore);
  const proc = new SlideProcessingProcessor(prisma as unknown as PrismaService, lease, ctx.stores.materializer, new FakeTilingEngine('none'), ctx.stores.derivStore, sealer);
  const { generationId } = await proc.process({ id: job.id, ingestionId: ing.id, labId: ctx.labId, attempt: 1, leaseExpiresAt: future }, WORKER);
  const verdict = new GenerationVerdictService(prisma as unknown as PrismaService, new GenerationVerifier(prisma as unknown as PrismaService, ctx.stores.derivStore));
  const r = await verdict.applyVerdict(generationId);
  expect(r.outcome).toBe('READY');
  return generationId;
}
async function publishedSlide() {
  const ctx = await newSlide();
  const gen = await addReadyGen(ctx);
  await publication.publish(gen, ACTOR);
  return { ...ctx, generationId: gen };
}
const countSessions = (labId: string) => prisma.deliverySession.count({ where: { labId } });

afterEach(async () => {
  for (const labId of labIds) {
    await prisma.$executeRaw`DELETE FROM "DeliverySession" WHERE "labId" = ${labId}`;
    await prisma.$executeRaw`DELETE FROM "GenerationPublication" WHERE "labId" = ${labId}`;
    await prisma.$executeRaw`DELETE FROM "GenerationVerification" WHERE "labId" = ${labId}`;
    await prisma.$executeRaw`UPDATE "DigitalSlide" SET "publishedGenerationId" = NULL WHERE "labId" = ${labId}`;
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

it('issues a session bound to the current published generation, storing only the token hash', async () => {
  const s = await publishedSlide();
  const res = await svc.issue({ labId: s.labId, actorUserId: ACTOR, slideId: s.slideId, scopes: [DeliveryScope.DESCRIPTOR, DeliveryScope.TILES] });
  expect(res.session.generationId).toBe(s.generationId);
  // 256-bit token: base64url of 32 bytes; raw never persisted.
  expect(Buffer.from(res.rawToken, 'base64url').length).toBe(32);
  const row = await prisma.deliverySession.findUniqueOrThrow({ where: { id: res.session.sessionId } });
  expect(row.tokenHash).toBe(createHash('sha256').update(res.rawToken).digest('hex'));
  expect(JSON.stringify(row)).not.toContain(res.rawToken); // no column holds the raw token
  expect(row.scopes).toEqual([DeliveryScope.DESCRIPTOR, DeliveryScope.TILES]);
  expect(row.generationId).toBe(s.generationId);
});

it('rejects issuance for an unpublished slide (SlideNotPublishedError)', async () => {
  const ctx = await newSlide();
  await addReadyGen(ctx); // READY but never published
  await expect(svc.issue({ labId: ctx.labId, actorUserId: ACTOR, slideId: ctx.slideId, scopes: [DeliveryScope.TILES] })).rejects.toBeInstanceOf(SlideNotPublishedError);
});

it('rejects issuance for a cross-lab / missing slide (SlideNotAccessibleError via non-matching lab)', async () => {
  const s = await publishedSlide();
  await expect(svc.issue({ labId: 'some-other-lab', actorUserId: ACTOR, slideId: s.slideId, scopes: [DeliveryScope.TILES] })).rejects.toThrow(/not accessible/);
  expect(await countSessions(s.labId)).toBe(0);
});

it('rejects issuance on publication divergence (slide points to a non-PUBLISHED generation)', async () => {
  const s = await publishedSlide();
  await prisma.$executeRaw`UPDATE "DerivativeGeneration" SET status = 'SUPERSEDED'::"GenerationStatus" WHERE id = ${s.generationId}`; // pointer unchanged
  await expect(svc.issue({ labId: s.labId, actorUserId: ACTOR, slideId: s.slideId, scopes: [DeliveryScope.TILES] })).rejects.toBeInstanceOf(PublicationDivergenceError);
});

it('rejects issuance when the published generation is unsealed or unverified (IllegalPublishedGenerationError)', async () => {
  const s = await publishedSlide();
  await prisma.$executeRaw`UPDATE "DerivativeGeneration" SET verified = false WHERE id = ${s.generationId}`;
  await expect(svc.issue({ labId: s.labId, actorUserId: ACTOR, slideId: s.slideId, scopes: [DeliveryScope.TILES] })).rejects.toBeInstanceOf(IllegalPublishedGenerationError);
});

it('rejects a TTL above the configured maximum without creating a session', async () => {
  const s = await publishedSlide();
  await expect(
    svc.issue({ labId: s.labId, actorUserId: ACTOR, slideId: s.slideId, scopes: [DeliveryScope.TILES], ttlMs: cfg.maxTtlMs + 1 }),
  ).rejects.toBeInstanceOf(InvalidTtlError);
  expect(await countSessions(s.labId)).toBe(0);
});

it('redeems a valid token to the bound capability', async () => {
  const s = await publishedSlide();
  const { rawToken } = await svc.issue({ labId: s.labId, actorUserId: ACTOR, slideId: s.slideId, scopes: [DeliveryScope.DESCRIPTOR, DeliveryScope.MANIFEST] });
  const cap = await svc.redeem(rawToken);
  expect(cap).toMatchObject({ labId: s.labId, slideId: s.slideId, generationId: s.generationId, actorUserId: ACTOR });
  expect(cap.scopes).toEqual([DeliveryScope.DESCRIPTOR, DeliveryScope.MANIFEST]);
});

it('rejects an expired token', async () => {
  const s = await publishedSlide();
  const { rawToken, session } = await svc.issue({ labId: s.labId, actorUserId: ACTOR, slideId: s.slideId, scopes: [DeliveryScope.TILES] });
  await prisma.$executeRaw`UPDATE "DeliverySession" SET "expiresAt" = ${new Date(Date.now() - 1000)} WHERE id = ${session.sessionId}`;
  await expect(svc.redeem(rawToken)).rejects.toBeInstanceOf(ExpiredTokenError);
});

it('rejects a revoked token', async () => {
  const s = await publishedSlide();
  const { rawToken, session } = await svc.issue({ labId: s.labId, actorUserId: ACTOR, slideId: s.slideId, scopes: [DeliveryScope.TILES] });
  expect(await svc.revoke(session.sessionId, s.labId)).toBe('REVOKED');
  await expect(svc.redeem(rawToken)).rejects.toBeInstanceOf(RevokedTokenError);
});

it('keeps a SUPERSEDED bound generation redeemable, but rejects an ARCHIVED one', async () => {
  const s = await publishedSlide();
  const { rawToken } = await svc.issue({ labId: s.labId, actorUserId: ACTOR, slideId: s.slideId, scopes: [DeliveryScope.TILES] });
  // A newer publication supersedes the bound generation…
  const g2 = await addReadyGen({ stores: s.stores, labId: s.labId, slideId: s.slideId });
  await publication.publish(g2, ACTOR);
  expect((await prisma.derivativeGeneration.findUniqueOrThrow({ where: { id: s.generationId } })).status).toBe('SUPERSEDED');
  const cap = await svc.redeem(rawToken); // still deliverable (immutable)
  expect(cap.generationId).toBe(s.generationId);
  // …but ARCHIVED is not.
  await prisma.$executeRaw`UPDATE "DerivativeGeneration" SET status = 'ARCHIVED'::"GenerationStatus" WHERE id = ${s.generationId}`;
  await expect(svc.redeem(rawToken)).rejects.toBeInstanceOf(BoundGenerationUnavailableError);
});

it('enforces scopes with no implication between capabilities', async () => {
  const s = await publishedSlide();
  const { rawToken } = await svc.issue({ labId: s.labId, actorUserId: ACTOR, slideId: s.slideId, scopes: [DeliveryScope.DESCRIPTOR, DeliveryScope.TILES] });
  const cap = await svc.redeem(rawToken);
  expect(() => svc.requireScope(cap, DeliveryScope.TILES)).not.toThrow();
  expect(() => svc.requireScope(cap, DeliveryScope.MANIFEST)).toThrow(ScopeError);
});

it('rejects a token whose persisted binding no longer holds (SessionBindingError)', async () => {
  const s1 = await publishedSlide();
  const s2 = await publishedSlide();
  const { rawToken, session } = await svc.issue({ labId: s1.labId, actorUserId: ACTOR, slideId: s1.slideId, scopes: [DeliveryScope.TILES] });
  // Point the session at a generation belonging to a DIFFERENT slide.
  await prisma.$executeRaw`UPDATE "DeliverySession" SET "generationId" = ${s2.generationId} WHERE id = ${session.sessionId}`;
  await expect(svc.redeem(rawToken)).rejects.toBeInstanceOf(SessionBindingError);
});

it('revocation is tenant-safe and neutral: nonexistent / cross-lab / already-revoked all report NOT_CHANGED', async () => {
  const s = await publishedSlide();
  const { session } = await svc.issue({ labId: s.labId, actorUserId: ACTOR, slideId: s.slideId, scopes: [DeliveryScope.TILES] });
  expect(await svc.revoke(randomUUID(), s.labId)).toBe('NOT_CHANGED'); // does not exist
  expect(await svc.revoke(session.sessionId, 'another-lab')).toBe('NOT_CHANGED'); // wrong lab — no existence leak
  expect(await svc.revoke(session.sessionId, s.labId)).toBe('REVOKED'); // first real revoke
  expect(await svc.revoke(session.sessionId, s.labId)).toBe('NOT_CHANGED'); // already revoked
});
