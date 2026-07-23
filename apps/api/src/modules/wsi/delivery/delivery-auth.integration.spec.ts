import { randomUUID } from 'node:crypto';
import { ConflictException, ExecutionContext, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { DeliveryScope } from '@prisma/client';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../../database/prisma.service';
import { AuthUser } from '../../../common/decorators/current-user.decorator';
import { PERMISSIONS_KEY } from '../../../common/decorators/require-permissions.decorator';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { DeliverySessionService } from './delivery-session.service';
import { PublishedGenerationResolver } from './published-generation.resolver';
import { DELIVERY_CAPABILITY_KEY, DeliveryTokenGuard } from './delivery-token.guard';
import { SlideDeliverySessionController } from './slide-delivery-session.controller';
import { ArtifactDeliveryController } from './artifact-delivery.controller';
import { VIEWER_SCOPES, WSI_VIEW_PERMISSION } from './delivery.constants';

/**
 * P5-5B-i — the delivery credential boundary, exercised over the isolated test DB with the REAL guard,
 * controllers, and session service (framework JWT/permission enforcement is covered by the auth guard
 * specs; here we assert the wiring metadata + the guard/controller behavior).
 */
const prisma = createTestPrisma();
const resolver = new PublishedGenerationResolver();
const sessions = new DeliverySessionService(prisma as unknown as PrismaService, resolver);
const guard = new DeliveryTokenGuard(sessions);
const issuance = new SlideDeliverySessionController(sessions);
const ACTOR = 'user-viewer-1';
let labIds: string[] = [];

function mkCtx(req: any): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}
function staffUser(labId: string): AuthUser {
  return { userId: ACTOR, labId, roles: [], permissions: [] } as unknown as AuthUser;
}

async function seedSlide(published: boolean) {
  const lab = await prisma.lab.create({ data: { name: 'p5-5bi', slug: `p5-5bi-${randomUUID()}` } });
  labIds.push(lab.id);
  const patient = await prisma.patient.create({ data: { labId: lab.id, registrationNo: randomUUID(), firstName: 'P', lastName: 'X' } });
  const record = await prisma.record.create({ data: { labId: lab.id, identifier: randomUUID(), patientId: patient.id } });
  const slide = await prisma.digitalSlide.create({ data: { labId: lab.id, recordId: record.id, slideUrl: '', availabilityStatus: 'DRAFT', sourceKind: 'UPLOAD' } });
  const ing = await prisma.slideIngestion.create({ data: { labId: lab.id, slideId: slide.id, sourceKind: 'UPLOAD', status: 'VERIFIED', sourceObjectKey: `k-${randomUUID()}`, sourceChecksum: 'c'.repeat(64) } });
  const job = await prisma.slideProcessingJob.create({ data: { labId: lab.id, ingestionId: ing.id, status: 'SUCCEEDED', workerId: 'w', attempt: 1 } as any });
  const gen = await prisma.derivativeGeneration.create({
    data: { labId: lab.id, slideId: slide.id, jobId: job.id, tileSourceType: 'DZI', status: published ? 'PUBLISHED' : 'READY', sealed: true, verified: true, derivativeManifestChecksum: 'a'.repeat(64), publishedAt: published ? new Date() : null } as any,
  });
  if (published) await prisma.digitalSlide.update({ where: { id: slide.id }, data: { publishedGenerationId: gen.id, availabilityStatus: 'PUBLISHED', publishedAt: new Date() } });
  return { labId: lab.id, slideId: slide.id, generationId: gen.id };
}

afterEach(async () => {
  for (const labId of labIds) {
    await prisma.$executeRaw`DELETE FROM "DeliverySession" WHERE "labId" = ${labId}`;
    await prisma.$executeRaw`UPDATE "DigitalSlide" SET "publishedGenerationId" = NULL WHERE "labId" = ${labId}`;
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

// ── Wiring metadata: the credential boundary is structural, not incidental ─────────────────────────────
it('wires the issuance route behind wsi:view and NOT as public', () => {
  const reflector = new Reflector();
  expect(reflector.get<string[]>(PERMISSIONS_KEY, issuance.createSession)).toContain(WSI_VIEW_PERMISSION);
  expect(reflector.get<boolean>(IS_PUBLIC_KEY, issuance.createSession)).toBeFalsy();
});
it('wires the artifact controller as @Public() AND guarded by DeliveryTokenGuard together', () => {
  const reflector = new Reflector();
  expect(reflector.get<boolean>(IS_PUBLIC_KEY, ArtifactDeliveryController)).toBe(true);
  const guards = Reflect.getMetadata(GUARDS_METADATA, ArtifactDeliveryController) ?? [];
  expect(guards).toContain(DeliveryTokenGuard);
});

// ── Issuance controller behavior ───────────────────────────────────────────────────────────────────────
it('issues a viewer session, returning the token once + exactly VIEWER_SCOPES, never the hash', async () => {
  const s = await seedSlide(true);
  const res = await issuance.createSession(staffUser(s.labId), s.slideId);
  expect(typeof res.token).toBe('string');
  expect(res).not.toHaveProperty('tokenHash');
  expect(JSON.stringify(res)).not.toContain('tokenHash');
  expect(res.scopes).toEqual(VIEWER_SCOPES);
  expect(res.scopes).not.toContain(DeliveryScope.MANIFEST);
  expect(res.generationId).toBe(s.generationId);
});
it('maps a cross-lab / missing slide to 404 without leaking existence', async () => {
  const s = await seedSlide(true);
  await expect(issuance.createSession(staffUser('another-lab'), s.slideId)).rejects.toBeInstanceOf(NotFoundException);
});
it('maps a same-lab unpublished slide to 409', async () => {
  const s = await seedSlide(false); // READY but never published
  await expect(issuance.createSession(staffUser(s.labId), s.slideId)).rejects.toBeInstanceOf(ConflictException);
});

// ── DeliveryTokenGuard behavior ──────────────────────────────────────────────────────────────────────
it('accepts a valid delivery bearer token and attaches the capability', async () => {
  const s = await seedSlide(true);
  const { rawToken } = await sessions.issue({ labId: s.labId, actorUserId: ACTOR, slideId: s.slideId, scopes: VIEWER_SCOPES });
  const req: any = { headers: { authorization: `Bearer ${rawToken}` } };
  await expect(guard.canActivate(mkCtx(req))).resolves.toBe(true);
  expect(req[DELIVERY_CAPABILITY_KEY].slideId).toBe(s.slideId);
  expect(req[DELIVERY_CAPABILITY_KEY].generationId).toBe(s.generationId);
});
it('rejects a missing bearer with 401', async () => {
  await expect(guard.canActivate(mkCtx({ headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
});
it('ignores a token supplied in the query string', async () => {
  const s = await seedSlide(true);
  const { rawToken } = await sessions.issue({ labId: s.labId, actorUserId: ACTOR, slideId: s.slideId, scopes: VIEWER_SCOPES });
  await expect(guard.canActivate(mkCtx({ headers: {}, query: { token: rawToken } }))).rejects.toBeInstanceOf(UnauthorizedException);
});
it('ignores a delivery token supplied in a cookie', async () => {
  const s = await seedSlide(true);
  const { rawToken } = await sessions.issue({ labId: s.labId, actorUserId: ACTOR, slideId: s.slideId, scopes: VIEWER_SCOPES });
  await expect(guard.canActivate(mkCtx({ headers: {}, cookies: { delivery_token: rawToken } }))).rejects.toBeInstanceOf(UnauthorizedException);
});
it('rejects an invalid bearer, and a revoked one, with the same GENERIC 401 (no distinction, no token leak)', async () => {
  const s = await seedSlide(true);
  const { rawToken, session } = await sessions.issue({ labId: s.labId, actorUserId: ACTOR, slideId: s.slideId, scopes: VIEWER_SCOPES });

  let invalidErr: any;
  await guard.canActivate(mkCtx({ headers: { authorization: 'Bearer not-a-real-token' } })).catch((e) => (invalidErr = e));
  expect(invalidErr).toBeInstanceOf(UnauthorizedException);

  await sessions.revoke(session.sessionId, s.labId);
  let revokedErr: any;
  await guard.canActivate(mkCtx({ headers: { authorization: `Bearer ${rawToken}` } })).catch((e) => (revokedErr = e));
  expect(revokedErr).toBeInstanceOf(UnauthorizedException);
  expect(revokedErr.message).toBe(invalidErr.message); // indistinguishable
  expect(JSON.stringify(revokedErr.getResponse())).not.toContain(rawToken); // token never echoed
});
it('does not let a normal staff JWT (as a bearer) authorize a delivery route', async () => {
  // A JWT-shaped string is not a delivery token → redeem fails → generic 401.
  const jwtLike = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSIsInNjb3BlIjoic3RhZmYifQ.sig';
  await expect(guard.canActivate(mkCtx({ headers: { authorization: `Bearer ${jwtLike}` } }))).rejects.toBeInstanceOf(UnauthorizedException);
});
