import { randomUUID } from 'node:crypto';
import { ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../../database/prisma.service';
import { AuditRecorder } from '../../audit/audit-recorder.service';
import { AuthUser } from '../../../common/decorators/current-user.decorator';
import { SlidePublicationService } from '../processing/slide-publication.service';
import { SlidePublishService } from './slide-publish.service';
import { SlidePublishController } from './slide-publish.controller';

/**
 * P5-6.3 — the publication envelope end-to-end (controller → SlidePublishService → frozen
 * SlidePublicationService) against the isolated test DB. Proves the result→HTTP mapping, actor plumbing,
 * SUCCESS-only cross-cutting audit, idempotency, and — critically — that a tenancy/path miss is fail-closed
 * BEFORE the frozen publication service is reached (call count 0, zero mutation, zero provenance).
 */
const prisma = createTestPrisma();
const audit = { recordEntityUpdated: jest.fn().mockResolvedValue(undefined) } as unknown as AuditRecorder;
const publication = new SlidePublicationService(prisma as unknown as PrismaService);
const service = new SlidePublishService(prisma as unknown as PrismaService, publication, audit);
const controller = new SlidePublishController(service);

const ACTOR = 'user-pathologist-1';
const user = (labId: string): AuthUser => ({ userId: ACTOR, labId, email: 'p@x.test', roles: [], permissions: ['wsi:publish'] });

let labIds: string[] = [];

interface Ctx { labId: string; slideId: string }

async function newSlide(): Promise<Ctx> {
  const lab = await prisma.lab.create({ data: { name: 'p563', slug: `p563-${randomUUID()}` } });
  labIds.push(lab.id);
  const patient = await prisma.patient.create({ data: { labId: lab.id, registrationNo: randomUUID(), firstName: 'P', lastName: 'X' } });
  const record = await prisma.record.create({ data: { labId: lab.id, identifier: randomUUID(), patientId: patient.id } });
  const slide = await prisma.digitalSlide.create({ data: { labId: lab.id, recordId: record.id, slideUrl: '', availabilityStatus: 'DRAFT', sourceKind: 'UPLOAD' } });
  return { labId: lab.id, slideId: slide.id };
}

/** Create a generation directly at a given lifecycle state. publish() reads only DB fields (no store I/O). */
async function addGen(ctx: Ctx, opts: { status: string; sealed?: boolean; verified?: boolean }): Promise<string> {
  const ing = await prisma.slideIngestion.create({ data: { labId: ctx.labId, slideId: ctx.slideId, sourceKind: 'UPLOAD', status: 'VERIFIED', sourceObjectKey: `k-${randomUUID()}`, sourceChecksum: 'c'.repeat(64) } });
  const job = await prisma.slideProcessingJob.create({ data: { labId: ctx.labId, ingestionId: ing.id, status: 'SUCCEEDED', workerId: 'w', attempt: 1 } as any });
  const g = await prisma.derivativeGeneration.create({
    data: {
      labId: ctx.labId, slideId: ctx.slideId, jobId: job.id, tileSourceType: 'DZI', status: opts.status as any,
      sealed: opts.sealed ?? false, verified: opts.verified ?? false,
      derivativeManifestChecksum: opts.sealed ? 'a'.repeat(64) : null,
      sealedAt: opts.sealed ? new Date() : null, verifiedAt: opts.verified ? new Date() : null,
    } as any,
  });
  return g.id;
}
const addReadyGen = (ctx: Ctx) => addGen(ctx, { status: 'READY', sealed: true, verified: true });

const getSlide = (id: string) => prisma.digitalSlide.findUniqueOrThrow({ where: { id } });
const getGen = (id: string) => prisma.derivativeGeneration.findUniqueOrThrow({ where: { id } });
const pubRows = (labId: string) => prisma.generationPublication.findMany({ where: { labId }, orderBy: { action: 'asc' } });

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

describe('fresh publication', () => {
  it('publishes a READY generation: 200 applied:true, slide repointed, actor persisted, one PUBLISHED row, one audit', async () => {
    const ctx = await newSlide();
    const gen = await addReadyGen(ctx);

    const res = await controller.publishGeneration(user(ctx.labId), ctx.slideId, gen);
    expect(res).toMatchObject({ outcome: 'PUBLISHED', applied: true, generationId: gen, supersededGenerationId: null });
    expect((res as any).publicationEventId).toEqual(expect.any(String));

    const slide = await getSlide(ctx.slideId);
    expect(slide.publishedGenerationId).toBe(gen);
    expect(slide.availabilityStatus).toBe('PUBLISHED');
    expect(slide.publishedById).toBe(ACTOR);
    expect((await getGen(gen)).status).toBe('PUBLISHED');

    const rows = await pubRows(ctx.labId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'PUBLISHED', generationId: gen, actorUserId: ACTOR });

    expect(audit.recordEntityUpdated).toHaveBeenCalledTimes(1);
    expect(audit.recordEntityUpdated).toHaveBeenCalledWith({
      resource: { type: 'DerivativeGeneration', id: gen, labId: ctx.labId },
      changedFields: ['status'],
      producerModule: 'wsi',
    });
  });
});

describe('supersession', () => {
  it('publishing g2 over g1: g1 SUPERSEDED, g2 PUBLISHED, response names g1, both provenance rows share the event + actor', async () => {
    const ctx = await newSlide();
    const g1 = await addReadyGen(ctx);
    const g2 = await addReadyGen(ctx);
    await controller.publishGeneration(user(ctx.labId), ctx.slideId, g1);
    const res = await controller.publishGeneration(user(ctx.labId), ctx.slideId, g2);

    expect(res).toMatchObject({ outcome: 'PUBLISHED', applied: true, generationId: g2, supersededGenerationId: g1 });
    expect((await getGen(g1)).status).toBe('SUPERSEDED');
    expect((await getGen(g2)).status).toBe('PUBLISHED');

    const event2 = (await pubRows(ctx.labId)).filter((r) => r.publicationEventId === (res as any).publicationEventId);
    expect(event2).toHaveLength(2);
    expect(event2.find((r) => r.action === 'PUBLISHED')!.generationId).toBe(g2);
    expect(event2.find((r) => r.action === 'SUPERSEDED')!.generationId).toBe(g1);
    expect(event2.every((r) => r.actorUserId === ACTOR)).toBe(true);
  });
});

describe('idempotency', () => {
  it('a second publish of the same generation: 200 applied:false, no new provenance, no additional audit', async () => {
    const ctx = await newSlide();
    const gen = await addReadyGen(ctx);
    await controller.publishGeneration(user(ctx.labId), ctx.slideId, gen);
    expect(audit.recordEntityUpdated).toHaveBeenCalledTimes(1);

    const again = await controller.publishGeneration(user(ctx.labId), ctx.slideId, gen);
    expect(again).toEqual({ outcome: 'ALREADY_PUBLISHED', applied: false, generationId: gen });
    expect(await pubRows(ctx.labId)).toHaveLength(1); // no new row
    expect(audit.recordEntityUpdated).toHaveBeenCalledTimes(1); // no additional state-change audit
  });
});

describe('non-publishable', () => {
  it.each(['QC_PENDING', 'QC_FAILED', 'SUPERSEDED'])('%s → 409 with no mutation, no audit', async (status) => {
    const ctx = await newSlide();
    const gen = await addGen(ctx, { status, sealed: true, verified: status !== 'QC_PENDING' });
    await expect(controller.publishGeneration(user(ctx.labId), ctx.slideId, gen)).rejects.toBeInstanceOf(ConflictException);
    expect((await getSlide(ctx.slideId)).publishedGenerationId).toBeNull();
    expect(await pubRows(ctx.labId)).toHaveLength(0);
    expect(audit.recordEntityUpdated).not.toHaveBeenCalled();
  });
});

describe('illegal READY', () => {
  it('READY with a broken sealed/verified invariant → 500, no audit', async () => {
    const ctx = await newSlide();
    const gen = await addReadyGen(ctx);
    await prisma.$executeRaw`UPDATE "DerivativeGeneration" SET verified = false WHERE id = ${gen}`; // READY but not verified
    await expect(controller.publishGeneration(user(ctx.labId), ctx.slideId, gen)).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(await pubRows(ctx.labId)).toHaveLength(0);
    expect(audit.recordEntityUpdated).not.toHaveBeenCalled();
  });
});

describe('tenant/path isolation (fail-closed BEFORE the frozen service)', () => {
  it('cross-lab / wrong-slide / unknown generation → 404, and SlidePublicationService.publish is never called', async () => {
    const a = await newSlide();
    const b = await newSlide();
    const genA = await addReadyGen(a);
    const otherSlideInA = await newSlide(); // same lab A, different slide
    const spy = jest.spyOn(publication, 'publish');

    // cross-lab: lab B principal tries to publish lab A's generation
    await expect(controller.publishGeneration(user(b.labId), a.slideId, genA)).rejects.toBeInstanceOf(NotFoundException);
    // wrong slide: correct lab, but the generation is not under this slide
    await expect(controller.publishGeneration(user(a.labId), otherSlideInA.slideId, genA)).rejects.toBeInstanceOf(NotFoundException);
    // unknown generation
    await expect(controller.publishGeneration(user(a.labId), a.slideId, 'does-not-exist')).rejects.toBeInstanceOf(NotFoundException);

    expect(spy).toHaveBeenCalledTimes(0); // frozen publication service never reached
    expect(await pubRows(a.labId)).toHaveLength(0); // zero provenance
    expect((await getSlide(a.slideId)).publishedGenerationId).toBeNull(); // zero mutation
    expect(audit.recordEntityUpdated).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
