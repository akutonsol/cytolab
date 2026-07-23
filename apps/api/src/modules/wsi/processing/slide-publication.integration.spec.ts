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
import { JobLeaseService } from './job-lease.service';
import { loadProcessingConfig } from './processing-config';
import { SlideProcessingProcessor } from './slide-processing.processor';
import { GenerationSealer } from './generation-sealer';
import { GenerationVerifier } from './generation-verifier';
import { GenerationVerdictService } from './generation-verdict.service';
import { IllegalPublicationTargetError, PublicationStateError, SlidePublicationService } from './slide-publication.service';

/**
 * P5-4b — publication applier against the isolated test DB + real local stores. Proves: first publication,
 * supersession/replacement (shared publicationEventId + timestamp + actor), exactly-one-PUBLISHED +
 * slide-pointer consistency, illegal READY invariant, non-READY rejection, divergence-aware idempotency,
 * per-slide concurrency, atomic rollback, and no sealing/verification mutation. Service-only (no controller).
 */
const prisma = createTestPrisma();
const leaseCfg = { ...loadProcessingConfig({} as any), leaseDurationMs: 60_000 };
const lease = new JobLeaseService(prisma as unknown as PrismaService, leaseCfg);
const publication = new SlidePublicationService(prisma as unknown as PrismaService);
const ACTOR = 'user-pathologist-1';
const WORKER = 'worker-1';
let roots: string[] = [];
let labIds: string[] = [];

function mkTmp(tag: string): string {
  const p = path.join(os.tmpdir(), `p5-4b-${tag}-${randomUUID()}`);
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
  const lab = await prisma.lab.create({ data: { name: 'p5-4b', slug: `p5-4b-${randomUUID()}` } });
  labIds.push(lab.id);
  const patient = await prisma.patient.create({ data: { labId: lab.id, registrationNo: randomUUID(), firstName: 'P', lastName: 'X' } });
  const record = await prisma.record.create({ data: { labId: lab.id, identifier: randomUUID(), patientId: patient.id } });
  const slide = await prisma.digitalSlide.create({
    data: { labId: lab.id, recordId: record.id, slideUrl: '', availabilityStatus: 'DRAFT', sourceKind: 'UPLOAD' },
  });
  return { stores, labId: lab.id, slideId: slide.id };
}

/** Produce + seal a generation for the slide, leaving it QC_PENDING (no verdict). */
async function addSealedGen(ctx: { stores: ReturnType<typeof newStores>; labId: string; slideId: string }): Promise<string> {
  const key = `slides/${ctx.labId}/${ctx.slideId}/source/i/${randomUUID()}.svs`;
  await ctx.stores.store.createUploadSession(key);
  await ctx.stores.store.writeChunk(key, 0, Buffer.from('fake-wsi-source-bytes'));
  const { checksum } = await ctx.stores.store.completeUpload(key);
  const ing = await prisma.slideIngestion.create({
    data: { labId: ctx.labId, slideId: ctx.slideId, sourceKind: 'UPLOAD', status: 'VERIFIED', sourceObjectKey: key, sourceChecksum: checksum },
  });
  const future = new Date(Date.now() + 60_000);
  const job = await prisma.slideProcessingJob.create({
    data: { labId: ctx.labId, ingestionId: ing.id, status: 'RUNNING', workerId: WORKER, attempt: 1, startedAt: new Date(), heartbeatAt: new Date(), leaseExpiresAt: future } as any,
  });
  const sealer = new GenerationSealer(prisma as unknown as PrismaService, lease, ctx.stores.derivStore);
  const proc = new SlideProcessingProcessor(prisma as unknown as PrismaService, lease, ctx.stores.materializer, new FakeTilingEngine('none'), ctx.stores.derivStore, sealer);
  const { generationId } = await proc.process({ id: job.id, ingestionId: ing.id, labId: ctx.labId, attempt: 1, leaseExpiresAt: future }, WORKER);
  return generationId;
}

/** Produce + seal + verify a generation to READY. */
async function addReadyGen(ctx: { stores: ReturnType<typeof newStores>; labId: string; slideId: string }): Promise<string> {
  const generationId = await addSealedGen(ctx);
  const verdict = new GenerationVerdictService(prisma as unknown as PrismaService, new GenerationVerifier(prisma as unknown as PrismaService, ctx.stores.derivStore));
  const res = await verdict.applyVerdict(generationId);
  expect(res.outcome).toBe('READY');
  return generationId;
}

const getGen = (id: string) => prisma.derivativeGeneration.findUniqueOrThrow({ where: { id } });
const getSlide = (id: string) => prisma.digitalSlide.findUniqueOrThrow({ where: { id } });
const pubRows = (slideId: string) => prisma.generationPublication.findMany({ where: { slideId }, orderBy: { action: 'asc' } });
const countPublished = (slideId: string) => prisma.derivativeGeneration.count({ where: { slideId, status: 'PUBLISHED' } });

/** Proxy that fails the SECOND $executeRaw inside a transaction (the slide repoint, after demote+promote). */
function makeFailAtRepointPrisma(real: any): any {
  return new Proxy(real, {
    get(target, prop) {
      if (prop === '$transaction') {
        return (fn: any, opts?: any) =>
          real.$transaction(async (realTx: any) => {
            let exec = 0;
            const txProxy = new Proxy(realTx, {
              get(t, p) {
                if (p === '$executeRaw') {
                  return (...args: any[]) => {
                    exec += 1;
                    if (exec === 2) throw new Error('injected mid-tx failure at slide repoint');
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

it('publishes a READY generation: slide repointed, availability PUBLISHED, one PUBLISHED provenance row', async () => {
  const ctx = await newSlide();
  const gen = await addReadyGen(ctx);
  const res = await publication.publish(gen, ACTOR);
  expect(res).toMatchObject({ outcome: 'PUBLISHED', applied: true, supersededGenerationId: null });

  const g = await getGen(gen);
  const slide = await getSlide(ctx.slideId);
  expect(g.status).toBe('PUBLISHED');
  expect(g.publishedAt).not.toBeNull();
  expect(slide.publishedGenerationId).toBe(gen);
  expect(slide.availabilityStatus).toBe('PUBLISHED');
  expect(slide.publishedById).toBe(ACTOR);
  expect(slide.publishedAt!.getTime()).toBe(g.publishedAt!.getTime()); // shared instant

  const rows = await pubRows(ctx.slideId);
  expect(rows).toHaveLength(1);
  expect(rows[0].action).toBe('PUBLISHED');
  expect(rows[0].generationId).toBe(gen);
  expect(rows[0].actorUserId).toBe(ACTOR);
  expect(rows[0].publicationEventId).toBe((res as any).publicationEventId);
  expect(rows[0].at.getTime()).toBe(g.publishedAt!.getTime());
});

it('replaces the published generation: old → SUPERSEDED, new → PUBLISHED, shared event/timestamp/actor', async () => {
  const ctx = await newSlide();
  const g1 = await addReadyGen(ctx);
  const g2 = await addReadyGen(ctx);
  await publication.publish(g1, ACTOR);
  const res = await publication.publish(g2, ACTOR);
  expect(res).toMatchObject({ outcome: 'PUBLISHED', applied: true, supersededGenerationId: g1 });

  const old = await getGen(g1);
  const neu = await getGen(g2);
  expect(old.status).toBe('SUPERSEDED');
  expect(old.supersededAt).not.toBeNull();
  expect(old.publishedAt).not.toBeNull(); // historical publishedAt is NOT cleared
  expect(neu.status).toBe('PUBLISHED');

  expect(await countPublished(ctx.slideId)).toBe(1); // exactly one PUBLISHED
  const slide = await getSlide(ctx.slideId);
  expect(slide.publishedGenerationId).toBe(g2);

  const rows = await pubRows(ctx.slideId); // ordered by action: PUBLISHED..., SUPERSEDED...
  const event2 = rows.filter((r) => r.publicationEventId === (res as any).publicationEventId);
  expect(event2).toHaveLength(2);
  const superseded = event2.find((r) => r.action === 'SUPERSEDED')!;
  const published = event2.find((r) => r.action === 'PUBLISHED')!;
  expect(superseded.generationId).toBe(g1);
  expect(published.generationId).toBe(g2);
  // shared event id, actor, timestamp; matches the persisted transition timestamps
  expect(superseded.at.getTime()).toBe(published.at.getTime());
  expect(published.at.getTime()).toBe(neu.publishedAt!.getTime());
  expect(superseded.at.getTime()).toBe(old.supersededAt!.getTime());
  expect(event2.every((r) => r.actorUserId === ACTOR)).toBe(true);
});

it('is idempotent for the already-published generation (no new provenance, no change)', async () => {
  const ctx = await newSlide();
  const gen = await addReadyGen(ctx);
  await publication.publish(gen, ACTOR);
  const before = await getSlide(ctx.slideId);
  const again = await publication.publish(gen, 'someone-else');
  expect(again).toEqual({ outcome: 'ALREADY_PUBLISHED', applied: false });
  expect(await pubRows(ctx.slideId)).toHaveLength(1); // no second row
  const after = await getSlide(ctx.slideId);
  expect(after.publishedById).toBe(before.publishedById); // unchanged (actor not overwritten)
  expect(after.publishedAt!.getTime()).toBe(before.publishedAt!.getTime());
});

it('rejects a non-READY generation as NOT_PUBLISHABLE without mutation', async () => {
  const ctx = await newSlide();
  const gen = await addSealedGen(ctx); // QC_PENDING (sealed, not verified)
  const res = await publication.publish(gen, ACTOR);
  expect(res).toEqual({ outcome: 'NOT_PUBLISHABLE', generationStatus: 'QC_PENDING' });
  expect((await getSlide(ctx.slideId)).publishedGenerationId).toBeNull();
  expect(await pubRows(ctx.slideId)).toHaveLength(0);
});

it('treats a READY generation with a broken seal/verify invariant as an illegal state', async () => {
  const ctx = await newSlide();
  const gen = await addReadyGen(ctx);
  await prisma.$executeRaw`UPDATE "DerivativeGeneration" SET verified = false WHERE id = ${gen}`; // READY but not verified
  await expect(publication.publish(gen, ACTOR)).rejects.toBeInstanceOf(IllegalPublicationTargetError);
  expect((await getSlide(ctx.slideId)).publishedGenerationId).toBeNull(); // no mutation
  expect(await pubRows(ctx.slideId)).toHaveLength(0);
});

it('rejects a divergent already-published state instead of silently normalizing it', async () => {
  const ctx = await newSlide();
  const gen = await addReadyGen(ctx);
  await publication.publish(gen, ACTOR);
  await prisma.$executeRaw`UPDATE "DigitalSlide" SET "publishedGenerationId" = NULL WHERE id = ${ctx.slideId}`; // pointer diverges
  await expect(publication.publish(gen, ACTOR)).rejects.toBeInstanceOf(PublicationStateError);
});

it('serializes concurrent publication of two READY generations to a single consistent PUBLISHED state', async () => {
  const ctx = await newSlide();
  const g1 = await addReadyGen(ctx);
  const g2 = await addReadyGen(ctx);
  const [r1, r2] = await Promise.all([publication.publish(g1, ACTOR), publication.publish(g2, ACTOR)]);
  expect([r1.outcome, r2.outcome].every((o) => o === 'PUBLISHED')).toBe(true);

  expect(await countPublished(ctx.slideId)).toBe(1); // exactly one PUBLISHED after the race
  const slide = await getSlide(ctx.slideId);
  const published = await prisma.derivativeGeneration.findFirstOrThrow({ where: { slideId: ctx.slideId, status: 'PUBLISHED' } });
  expect(slide.publishedGenerationId).toBe(published.id); // pointer agrees with the surviving PUBLISHED
  expect(await pubRows(ctx.slideId)).toHaveLength(3); // first publish (1) + replacement (2)
});

it('rolls back demotion, promotion, slide repoint, and provenance together on a mid-transaction failure', async () => {
  const ctx = await newSlide();
  const g1 = await addReadyGen(ctx);
  const g2 = await addReadyGen(ctx);
  await publication.publish(g1, ACTOR); // g1 PUBLISHED, slide → g1, 1 provenance row

  const failing = new SlidePublicationService(makeFailAtRepointPrisma(prisma));
  await expect(failing.publish(g2, ACTOR)).rejects.toThrow(/injected mid-tx failure/);

  expect((await getGen(g1)).status).toBe('PUBLISHED'); // demotion rolled back
  expect((await getGen(g2)).status).toBe('READY'); // promotion rolled back
  expect((await getSlide(ctx.slideId)).publishedGenerationId).toBe(g1); // repoint rolled back
  expect(await pubRows(ctx.slideId)).toHaveLength(1); // no new provenance
});

it('does not mutate sealing or verification state on publication', async () => {
  const ctx = await newSlide();
  const gen = await addReadyGen(ctx);
  const before = await getGen(gen);
  await publication.publish(gen, ACTOR);
  const after = await getGen(gen);
  expect(after.sealed).toBe(before.sealed);
  expect(after.verified).toBe(before.verified);
  expect(after.verifiedAt!.getTime()).toBe(before.verifiedAt!.getTime());
  expect(after.derivativeManifestChecksum).toBe(before.derivativeManifestChecksum);
});
