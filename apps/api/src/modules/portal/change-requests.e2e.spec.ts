import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ChangeRequestStatus, ChangeRequestType, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import * as request from 'supertest';
import { AppModule } from '../../app.module';

/**
 * Change requests, both sides: portal cross-client isolation for threads, a
 * valid staff status-transition path, and the audit log capturing each
 * transition. Gated on DATABASE_URL.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('Change requests (e2e)', () => {
  let app: INestApplication;
  const raw = new PrismaClient();

  const slug = `cr2e-${Date.now().toString(36)}`;
  const staffEmail = `staff-${slug}@e2e.test`;
  const password = 'password123';
  const portalEmail = `a-${slug}@e2e.test`;
  const portalPassword = 'portal-password-123';

  let labId: string;
  let clientBId: string;
  let portalUserBId: string;
  let portalToken: string;
  let staffToken: string;
  let crAId: string; // created by portal user A
  let crBId: string; // belongs to client B

  const portalAuth = (req: request.Test) => req.set('Authorization', `Bearer ${portalToken}`);
  const staffAuth = (req: request.Test) => req.set('Authorization', `Bearer ${staffToken}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register-lab')
      .send({ labName: 'CR E2E Lab', labSlug: slug, email: staffEmail, firstName: 'E2E', lastName: 'Admin', password })
      .expect(201);
    labId = reg.body.labId;

    const clientA = await raw.client.create({ data: { labId, firstName: 'Alpha', lastName: 'Clinic' } });
    const clientB = await raw.client.create({ data: { labId, firstName: 'Bravo', lastName: 'Clinic' } });
    clientBId = clientB.id;

    await raw.portalUser.create({
      data: { labId, clientId: clientA.id, email: portalEmail, passwordHash: await argon2.hash(portalPassword), firstName: 'Portal', lastName: 'A', isActive: true },
    });
    const portalUserB = await raw.portalUser.create({
      data: { labId, clientId: clientB.id, email: `b-${slug}@e2e.test`, passwordHash: await argon2.hash(portalPassword), firstName: 'Portal', lastName: 'B', isActive: true },
    });
    portalUserBId = portalUserB.id;

    // A change request belonging to client B (seeded directly).
    const crB = await raw.changeRequest.create({
      data: {
        labId,
        clientId: clientB.id,
        type: ChangeRequestType.GeneralQuery,
        subject: 'B private request',
        createdByPortalUserId: portalUserB.id,
      },
    });
    crBId = crB.id;

    staffToken = (await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: staffEmail, password })).body.accessToken;
    portalToken = (await request(app.getHttpServer()).post('/api/v1/portal/auth/login').send({ email: portalEmail, password: portalPassword })).body.accessToken;
  });

  afterAll(async () => {
    if (labId) {
      await raw.changeRequestEvent.deleteMany({ where: { labId } });
      await raw.changeRequestMessage.deleteMany({ where: { labId } });
      await raw.changeRequest.deleteMany({ where: { labId } });
      await raw.authAttempt.deleteMany({ where: { email: { in: [staffEmail, portalEmail, `b-${slug}@e2e.test`] } } });
      await raw.portalUser.deleteMany({ where: { labId } });
      await raw.client.deleteMany({ where: { labId } });
      await raw.user.deleteMany({ where: { labId } });
      await raw.workspace.deleteMany({ where: { labId } });
      await raw.account.deleteMany({ where: { labId } });
      await raw.lab.deleteMany({ where: { id: labId } });
    }
    await raw.$disconnect();
    await app?.close();
  });

  it('portal user A can raise a change request (clientId stamped from context)', async () => {
    const res = await portalAuth(request(app.getHttpServer()).post('/api/v1/portal/change-requests'))
      .send({ type: ChangeRequestType.DemographicsCorrection, subject: 'Fix DOB', message: 'DOB should be 1990-01-01' })
      .expect(201);
    crAId = res.body.id;
    expect(res.body.status).toBe(ChangeRequestStatus.Open);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0].authorPortalUserId).toEqual(expect.any(String));

    // clientId was set from the portal token, not the body — and matches A's client.
    const row = await raw.changeRequest.findUnique({ where: { id: crAId } });
    expect(row?.clientId).not.toBe(clientBId);
  });

  describe('cross-client isolation for threads', () => {
    it('portal A lists ONLY its own change requests', async () => {
      const res = await portalAuth(request(app.getHttpServer()).get('/api/v1/portal/change-requests')).expect(200);
      const ids = res.body.data.map((c: any) => c.id);
      expect(ids).toContain(crAId);
      expect(ids).not.toContain(crBId);
    });

    it("portal A cannot read client B's change request by id (404)", async () => {
      await portalAuth(request(app.getHttpServer()).get(`/api/v1/portal/change-requests/${crBId}`)).expect(404);
    });

    it("portal A cannot post a message to client B's thread (404)", async () => {
      await portalAuth(request(app.getHttpServer()).post(`/api/v1/portal/change-requests/${crBId}/messages`))
        .send({ body: 'sneaky' })
        .expect(404);
    });
  });

  describe('staff triage, transitions and audit', () => {
    it('staff sees change requests across clients in the lab', async () => {
      const res = await staffAuth(request(app.getHttpServer()).get('/api/v1/change-requests')).expect(200);
      const ids = res.body.data.map((c: any) => c.id);
      expect(ids).toEqual(expect.arrayContaining([crAId, crBId]));
    });

    it('follows a valid transition path Open -> InReview -> Actioned', async () => {
      const r1 = await staffAuth(request(app.getHttpServer()).put(`/api/v1/change-requests/${crAId}/status`))
        .send({ status: ChangeRequestStatus.InReview, note: 'looking into it' })
        .expect(200);
      expect(r1.body.status).toBe(ChangeRequestStatus.InReview);

      const r2 = await staffAuth(request(app.getHttpServer()).put(`/api/v1/change-requests/${crAId}/status`))
        .send({ status: ChangeRequestStatus.Actioned, note: 'corrected' })
        .expect(200);
      expect(r2.body.status).toBe(ChangeRequestStatus.Actioned);
    });

    it('rejects an invalid transition (Actioned is terminal)', async () => {
      await staffAuth(request(app.getHttpServer()).put(`/api/v1/change-requests/${crAId}/status`))
        .send({ status: ChangeRequestStatus.Open })
        .expect(400);
    });

    it('the audit log recorded each transition (InReview, Actioned) with the staff actor', async () => {
      const events = await raw.changeRequestEvent.findMany({
        where: { changeRequestId: crAId },
        orderBy: { createdAt: 'asc' },
      });
      expect(events.map((e) => e.status)).toEqual([ChangeRequestStatus.InReview, ChangeRequestStatus.Actioned]);
      expect(events.every((e) => e.byUserId != null && e.byPortalUserId == null)).toBe(true);
    });

    it('staff reply is captured with the staff author and visible to the portal user', async () => {
      await staffAuth(request(app.getHttpServer()).post(`/api/v1/change-requests/${crAId}/messages`))
        .send({ body: 'Your DOB has been corrected.' })
        .expect(201);

      const portalView = await portalAuth(request(app.getHttpServer()).get(`/api/v1/portal/change-requests/${crAId}`)).expect(200);
      const staffMsg = portalView.body.messages.find((m: any) => m.authorUserId != null);
      expect(staffMsg?.body).toBe('Your DOB has been corrected.');
      // The status timeline is visible to the client too.
      expect(portalView.body.events.map((e: any) => e.status)).toEqual([
        ChangeRequestStatus.InReview,
        ChangeRequestStatus.Actioned,
      ]);
    });
  });
});
