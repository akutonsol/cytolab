import { randomUUID } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../../database/prisma.service';
import { AuditRecorder } from '../../audit/audit-recorder.service';
import { SlideReviewService } from './slide-review.service';

/**
 * P5-6.1 — read-only clinical review projection against the isolated test DB. Proves the three read
 * contracts, deterministic not-found/cross-lab/cross-slide behavior, reported (never-thrown) publication
 * divergence, keyset pagination, single-subject PHI audit, and — AUTHORITATIVELY — that every read leaves
 * the database byte-for-byte unchanged (row counts + slide.updatedAt snapshot).
 */
const prisma = createTestPrisma();
const audit = { recordPhiRead: jest.fn().mockResolvedValue(undefined) } as unknown as AuditRecorder;
const service = new SlideReviewService(prisma as unknown as PrismaService, audit);

let labIds: string[] = [];

interface Ctx { labId: string; slideId: string; patientId: string; recordId: string }

async function newSlide(): Promise<Ctx> {
  const lab = await prisma.lab.create({ data: { name: 'p561', slug: `p561-${randomUUID()}` } });
  labIds.push(lab.id);
  const patient = await prisma.patient.create({ data: { labId: lab.id, registrationNo: randomUUID(), firstName: 'P', lastName: 'X' } });
  const record = await prisma.record.create({ data: { labId: lab.id, identifier: randomUUID(), patientId: patient.id } });
  const slide = await prisma.digitalSlide.create({ data: { labId: lab.id, recordId: record.id, slideUrl: '', availabilityStatus: 'DRAFT', sourceKind: 'UPLOAD' } });
  return { labId: lab.id, slideId: slide.id, patientId: patient.id, recordId: record.id };
}

async function addGen(
  ctx: Ctx,
  opts: { status: string; sealed?: boolean; verified?: boolean; createdAt?: Date },
): Promise<string> {
  const ing = await prisma.slideIngestion.create({ data: { labId: ctx.labId, slideId: ctx.slideId, sourceKind: 'UPLOAD', status: 'VERIFIED', sourceObjectKey: `k-${randomUUID()}`, sourceChecksum: 'c'.repeat(64) } });
  const job = await prisma.slideProcessingJob.create({ data: { labId: ctx.labId, ingestionId: ing.id, status: 'SUCCEEDED', workerId: 'w', attempt: 1 } as any });
  const g = await prisma.derivativeGeneration.create({
    data: {
      labId: ctx.labId, slideId: ctx.slideId, jobId: job.id, tileSourceType: 'DZI', status: opts.status as any,
      sealed: opts.sealed ?? false, verified: opts.verified ?? false,
      derivativeManifestChecksum: opts.sealed ? 'a'.repeat(64) : null,
      tiledWidth: 100, tiledHeight: 80, tileSize: 256, levelCount: 3,
      sealedAt: opts.sealed ? new Date() : null, verifiedAt: opts.verified ? new Date() : null,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    } as any,
  });
  return g.id;
}

async function addVerification(ctx: Ctx, generationId: string, outcome: 'PASSED' | 'FAILED', reasons: { code: string; detail: string }[], verifiedAt: Date): Promise<string> {
  const v = await prisma.generationVerification.create({
    data: { labId: ctx.labId, generationId, outcome, reasons: reasons as any, manifestChecksum: 'a'.repeat(64), verifierVersion: 'test-v1', verifiedAt },
  });
  return v.id;
}

async function addPublicationEvent(ctx: Ctx, opts: { publishedGenerationId: string; supersededGenerationId?: string; at: Date; actor: string | null }): Promise<string> {
  const publicationEventId = randomUUID();
  await prisma.generationPublication.create({ data: { publicationEventId, labId: ctx.labId, slideId: ctx.slideId, generationId: opts.publishedGenerationId, action: 'PUBLISHED', actorUserId: opts.actor, at: opts.at } });
  if (opts.supersededGenerationId) {
    await prisma.generationPublication.create({ data: { publicationEventId, labId: ctx.labId, slideId: ctx.slideId, generationId: opts.supersededGenerationId, action: 'SUPERSEDED', actorUserId: opts.actor, at: opts.at } });
  }
  return publicationEventId;
}

/** Authoritative zero-mutation snapshot: table counts + the slide's updatedAt. */
async function snapshot(ctx: Ctx) {
  const [gen, ver, pub, slide] = await Promise.all([
    prisma.derivativeGeneration.count({ where: { labId: ctx.labId } }),
    prisma.generationVerification.count({ where: { labId: ctx.labId } }),
    prisma.generationPublication.count({ where: { labId: ctx.labId } }),
    prisma.digitalSlide.findUniqueOrThrow({ where: { id: ctx.slideId }, select: { updatedAt: true, publishedGenerationId: true, availabilityStatus: true } }),
  ]);
  return { gen, ver, pub, updatedAt: slide.updatedAt.getTime(), publishedGenerationId: slide.publishedGenerationId, availabilityStatus: slide.availabilityStatus };
}

afterEach(async () => {
  jest.clearAllMocks();
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
});

// ── R1 review summary ─────────────────────────────────────────────────────────
describe('getReviewSummary', () => {
  it('returns generations newest-first with per-gen status + latest-verification summary', async () => {
    const ctx = await newSlide();
    const older = await addGen(ctx, { status: 'QC_FAILED', sealed: true, createdAt: new Date(Date.now() - 60_000) });
    const newer = await addGen(ctx, { status: 'READY', sealed: true, verified: true, createdAt: new Date() });
    await addVerification(ctx, older, 'FAILED', [{ code: 'LEVEL_DIGEST_MISMATCH', detail: 'level 2' }], new Date(Date.now() - 55_000));
    await addVerification(ctx, newer, 'PASSED', [], new Date());

    const res = await service.getReviewSummary(ctx.labId, ctx.slideId);

    expect(res.slideId).toBe(ctx.slideId);
    expect(res.generations.map((g) => g.generationId)).toEqual([newer, older]); // newest-first
    expect(res.generations[0]).toMatchObject({ status: 'READY', sealed: true, verified: true, isCurrentPublished: false });
    expect(res.generations[0].latestVerification).toMatchObject({ outcome: 'PASSED', reasonCount: 0 });
    expect(res.generations[1]).toMatchObject({ status: 'QC_FAILED' });
    expect(res.generations[1].latestVerification).toMatchObject({ outcome: 'FAILED', reasonCount: 1 });
    expect(res.publicationIntegrity).toBe('OK');
    expect(res.generationsTruncated).toBe(false);
    expect(res.currentPublishedGenerationId).toBeNull();
  });

  it('marks the live generation and reports publicationIntegrity OK when the pointer is consistent', async () => {
    const ctx = await newSlide();
    const gen = await addGen(ctx, { status: 'PUBLISHED', sealed: true, verified: true });
    await prisma.digitalSlide.update({ where: { id: ctx.slideId }, data: { publishedGenerationId: gen, availabilityStatus: 'PUBLISHED', publishedAt: new Date() } });

    const res = await service.getReviewSummary(ctx.labId, ctx.slideId);
    expect(res.currentPublishedGenerationId).toBe(gen);
    expect(res.generations.find((g) => g.generationId === gen)!.isCurrentPublished).toBe(true);
    expect(res.publicationIntegrity).toBe('OK');
  });

  it('reports publicationIntegrity DIVERGENT (never throws) when the pointer targets a non-PUBLISHED generation', async () => {
    const ctx = await newSlide();
    const gen = await addGen(ctx, { status: 'QC_PENDING', sealed: true });
    await prisma.$executeRaw`UPDATE "DigitalSlide" SET "publishedGenerationId" = ${gen} WHERE id = ${ctx.slideId}`; // divergent

    const res = await service.getReviewSummary(ctx.labId, ctx.slideId);
    expect(res.publicationIntegrity).toBe('DIVERGENT');
    expect(res.currentPublishedGenerationId).toBe(gen); // observed state reported faithfully
  });

  it('returns an empty generation list for a slide with no generations (not a 404)', async () => {
    const ctx = await newSlide();
    const res = await service.getReviewSummary(ctx.labId, ctx.slideId);
    expect(res.generations).toEqual([]);
    expect(res.currentPublishedGenerationId).toBeNull();
    expect(res.publicationIntegrity).toBe('OK');
  });

  it('404s an unknown slide and a cross-lab slide', async () => {
    const ctx = await newSlide();
    const other = await newSlide();
    await expect(service.getReviewSummary(ctx.labId, 'nope')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getReviewSummary(other.labId, ctx.slideId)).rejects.toBeInstanceOf(NotFoundException); // cross-lab
  });

  it('emits exactly one single-subject PHI read', async () => {
    const ctx = await newSlide();
    await addGen(ctx, { status: 'READY', sealed: true, verified: true });
    await service.getReviewSummary(ctx.labId, ctx.slideId);
    expect(audit.recordPhiRead).toHaveBeenCalledTimes(1);
    expect(audit.recordPhiRead).toHaveBeenCalledWith(expect.objectContaining({ accessSurface: 'slide', accessMode: 'view', producerModule: 'wsi', patientId: ctx.patientId }));
  });
});

// ── R2 generation evidence ────────────────────────────────────────────────────
describe('getGenerationEvidence', () => {
  it('returns full verification reasons + asset metadata WITHOUT storageKey', async () => {
    const ctx = await newSlide();
    const gen = await addGen(ctx, { status: 'QC_FAILED', sealed: true });
    await addVerification(ctx, gen, 'FAILED', [{ code: 'MANIFEST_CHECKSUM_MISMATCH', detail: 'sealed != recomputed' }], new Date());
    await prisma.slideAsset.create({ data: { labId: ctx.labId, generationId: gen, role: 'DZI_DESCRIPTOR', storageKey: 'slides/secret/key', checksum: 'd'.repeat(64), sizeBytes: 33 } });

    const res = await service.getGenerationEvidence(ctx.labId, ctx.slideId, gen);
    expect(res.status).toBe('QC_FAILED');
    expect(res.verifications).toHaveLength(1);
    expect(res.verifications[0].reasons).toEqual([{ code: 'MANIFEST_CHECKSUM_MISMATCH', detail: 'sealed != recomputed' }]);
    expect(res.assets).toHaveLength(1);
    expect(res.assets[0]).toMatchObject({ role: 'DZI_DESCRIPTOR', checksum: 'd'.repeat(64), sizeBytes: 33 });
    expect(JSON.stringify(res)).not.toContain('storageKey');
    expect(JSON.stringify(res)).not.toContain('slides/secret/key');
  });

  it('404s a generation that is not under the given slide (no cross-slide leak)', async () => {
    const a = await newSlide();
    const b = await newSlide();
    const gen = await addGen(a, { status: 'READY', sealed: true, verified: true });
    await expect(service.getGenerationEvidence(a.labId, b.slideId, gen)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getGenerationEvidence(b.labId, b.slideId, gen)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('emits a single-subject PHI read against the generation resource', async () => {
    const ctx = await newSlide();
    const gen = await addGen(ctx, { status: 'READY', sealed: true, verified: true });
    await service.getGenerationEvidence(ctx.labId, ctx.slideId, gen);
    expect(audit.recordPhiRead).toHaveBeenCalledTimes(1);
    expect(audit.recordPhiRead).toHaveBeenCalledWith(expect.objectContaining({ resource: expect.objectContaining({ type: 'DerivativeGeneration', id: gen }) }));
  });
});

// ── R3 publication history ─────────────────────────────────────────────────────
describe('getPublicationHistory', () => {
  it('groups PUBLISHED+SUPERSEDED into one event, newest-first, with the current pointer', async () => {
    const ctx = await newSlide();
    const g1 = await addGen(ctx, { status: 'SUPERSEDED', sealed: true, verified: true });
    const g2 = await addGen(ctx, { status: 'PUBLISHED', sealed: true, verified: true });
    await addPublicationEvent(ctx, { publishedGenerationId: g1, at: new Date(Date.now() - 60_000), actor: 'user-1' });
    await addPublicationEvent(ctx, { publishedGenerationId: g2, supersededGenerationId: g1, at: new Date(), actor: 'user-2' });
    await prisma.digitalSlide.update({ where: { id: ctx.slideId }, data: { publishedGenerationId: g2 } });

    const res = await service.getPublicationHistory(ctx.labId, ctx.slideId, {});
    expect(res.currentPublishedGenerationId).toBe(g2);
    expect(res.events).toHaveLength(2);
    expect(res.events[0]).toMatchObject({ publishedGenerationId: g2, supersededGenerationId: g1, actorUserId: 'user-2' }); // newest-first
    expect(res.events[1]).toMatchObject({ publishedGenerationId: g1, supersededGenerationId: null });
    expect(res.nextCursor).toBeNull();
  });

  it('keyset-paginates deterministically across pages', async () => {
    const ctx = await newSlide();
    const gens: string[] = [];
    for (let i = 0; i < 3; i++) {
      const g = await addGen(ctx, { status: 'SUPERSEDED', sealed: true, verified: true });
      gens.push(g);
      await addPublicationEvent(ctx, { publishedGenerationId: g, at: new Date(Date.now() - (3 - i) * 60_000), actor: 'u' });
    }
    const page1 = await service.getPublicationHistory(ctx.labId, ctx.slideId, { limit: 2 });
    expect(page1.events).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    expect(page1.events.map((e) => e.publishedGenerationId)).toEqual([gens[2], gens[1]]); // newest two

    const page2 = await service.getPublicationHistory(ctx.labId, ctx.slideId, { limit: 2, cursor: page1.nextCursor! });
    expect(page2.events.map((e) => e.publishedGenerationId)).toEqual([gens[0]]); // oldest, no overlap
    expect(page2.nextCursor).toBeNull();
  });

  it('rejects a malformed cursor with 400', async () => {
    const ctx = await newSlide();
    await expect(service.getPublicationHistory(ctx.labId, ctx.slideId, { cursor: 'not-a-cursor' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s an unknown slide', async () => {
    const ctx = await newSlide();
    await expect(service.getPublicationHistory(ctx.labId, 'missing', {})).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ── AUTHORITATIVE zero-mutation proof ──────────────────────────────────────────
describe('zero mutation (authoritative DB snapshot)', () => {
  it('leaves row counts and slide.updatedAt unchanged across all three reads', async () => {
    const ctx = await newSlide();
    const g1 = await addGen(ctx, { status: 'SUPERSEDED', sealed: true, verified: true, createdAt: new Date(Date.now() - 60_000) });
    const g2 = await addGen(ctx, { status: 'PUBLISHED', sealed: true, verified: true });
    await addVerification(ctx, g2, 'PASSED', [], new Date());
    await addPublicationEvent(ctx, { publishedGenerationId: g2, supersededGenerationId: g1, at: new Date(), actor: 'u' });
    await prisma.digitalSlide.update({ where: { id: ctx.slideId }, data: { publishedGenerationId: g2, availabilityStatus: 'PUBLISHED' } });

    const before = await snapshot(ctx);
    await service.getReviewSummary(ctx.labId, ctx.slideId);
    await service.getGenerationEvidence(ctx.labId, ctx.slideId, g2);
    await service.getPublicationHistory(ctx.labId, ctx.slideId, { limit: 10 });
    const after = await snapshot(ctx);

    expect(after).toEqual(before);
  });

  it('(supplement) never invokes a mutating Prisma method during reads', async () => {
    const ctx = await newSlide();
    await addGen(ctx, { status: 'READY', sealed: true, verified: true });
    const spied = ['create', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert', 'createMany'] as const;
    const spies = spied.map((m) => jest.spyOn(prisma.derivativeGeneration, m as any));
    const txSpy = jest.spyOn(prisma as any, '$transaction');
    const execSpy = jest.spyOn(prisma as any, '$executeRaw');

    await service.getReviewSummary(ctx.labId, ctx.slideId);

    for (const s of spies) expect(s).not.toHaveBeenCalled();
    expect(txSpy).not.toHaveBeenCalled();
    expect(execSpy).not.toHaveBeenCalled();
    [...spies, txSpy, execSpy].forEach((s) => s.mockRestore());
  });
});
