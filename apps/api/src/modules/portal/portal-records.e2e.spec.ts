import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import * as request from 'supertest';
import { AppModule } from '../../app.module';

/**
 * Proof that the portal client-scoping holds end-to-end over HTTP: a portal user
 * for client A can list ONLY client A's records, and cannot read client B's
 * record even with its exact id (crafted-id → 404). Gated on DATABASE_URL.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('Portal records — cross-client isolation (e2e)', () => {
  let app: INestApplication;
  const raw = new PrismaClient();

  const slug = `pr2e-${Date.now().toString(36)}`;
  const staffEmail = `staff-${slug}@e2e.test`;
  const password = 'E2eTestPassword1!';
  const portalEmail = `a-${slug}@e2e.test`;
  const portalPassword = 'portal-password-123';

  let labId: string;
  let clientAId: string;
  let recordAId: string;
  let recordBId: string;
  let portalToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register-lab')
      .send({ labName: 'Records E2E Lab', labSlug: slug, email: staffEmail, firstName: 'E2E', lastName: 'Admin', password })
      .expect(201);
    labId = reg.body.labId;

    // Two clients in the SAME lab, each with a patient + a record.
    const clientA = await raw.client.create({ data: { labId, firstName: 'Alpha', lastName: 'Clinic' } });
    const clientB = await raw.client.create({ data: { labId, firstName: 'Bravo', lastName: 'Clinic' } });
    clientAId = clientA.id;

    const patientA = await raw.patient.create({
      data: { labId, clientId: clientA.id, registrationNo: `A-${slug}`, firstName: 'Pat', lastName: 'A' },
    });
    const patientB = await raw.patient.create({
      data: { labId, clientId: clientB.id, registrationNo: `B-${slug}`, firstName: 'Pat', lastName: 'B' },
    });
    const recordA = await raw.record.create({
      data: { labId, clientId: clientA.id, patientId: patientA.id, identifier: `REC-A-${slug}` },
    });
    const recordB = await raw.record.create({
      data: { labId, clientId: clientB.id, patientId: patientB.id, identifier: `REC-B-${slug}` },
    });
    recordAId = recordA.id;
    recordBId = recordB.id;

    // Portal user bound to client A only.
    await raw.portalUser.create({
      data: {
        labId,
        clientId: clientA.id,
        email: portalEmail,
        passwordHash: await argon2.hash(portalPassword),
        firstName: 'Portal',
        lastName: 'A',
        isActive: true,
      },
    });

    portalToken = (
      await request(app.getHttpServer())
        .post('/api/v1/portal/auth/login')
        .send({ email: portalEmail, password: portalPassword })
    ).body.accessToken;
  });

  afterAll(async () => {
    if (labId) {
      await raw.authAttempt.deleteMany({ where: { email: portalEmail } });
      await raw.portalUser.deleteMany({ where: { labId } });
      await raw.record.deleteMany({ where: { labId } });
      await raw.patient.deleteMany({ where: { labId } });
      await raw.client.deleteMany({ where: { labId } });
      await raw.user.deleteMany({ where: { labId } });
      await raw.workspace.deleteMany({ where: { labId } });
      await raw.account.deleteMany({ where: { labId } });
      await raw.lab.deleteMany({ where: { id: labId } });
    }
    await raw.$disconnect();
    await app?.close();
  });

  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${portalToken}`);

  it("lists ONLY the portal user's own client records", async () => {
    const res = await auth(request(app.getHttpServer()).get('/api/v1/portal/records')).expect(200);
    const ids = res.body.data.map((r: any) => r.id);
    expect(ids).toContain(recordAId);
    expect(ids).not.toContain(recordBId);
    expect(res.body.total).toBe(1);
  });

  it('can read its OWN record by id (with the status timeline)', async () => {
    const res = await auth(request(app.getHttpServer()).get(`/api/v1/portal/records/${recordAId}`)).expect(200);
    expect(res.body.id).toBe(recordAId);
    expect(Array.isArray(res.body.statusHistory)).toBe(true);
  });

  it("CANNOT read another client's record via its crafted id (404, not 403)", async () => {
    await auth(request(app.getHttpServer()).get(`/api/v1/portal/records/${recordBId}`)).expect(404);
  });

  it('client B is unreachable even though it exists in the same lab', async () => {
    // Sanity: the record genuinely exists in the DB — it's the scoping, not absence.
    const exists = await raw.record.findUnique({ where: { id: recordBId } });
    expect(exists).not.toBeNull();
  });
});
