import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import * as request from 'supertest';
import { AppModule } from '../../app.module';

/**
 * Proof that the portal report endpoint serves ONLY authorized reports for the
 * client's OWN records: an unauthorized result sheet -> 403 (never a PDF), a
 * foreign record -> 404, and only an authorized own-record yields a %PDF.
 * Gated on DATABASE_URL.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('Portal reports — authorized-only + ownership (e2e)', () => {
  let app: INestApplication;
  const raw = new PrismaClient();

  const slug = `prep-${Date.now().toString(36)}`;
  const staffEmail = `staff-${slug}@e2e.test`;
  const password = 'E2eTestPassword1!';
  const portalEmail = `a-${slug}@e2e.test`;
  const portalPassword = 'portal-password-123';

  let labId: string;
  let staffUserId: string;
  let recordAId: string;
  let recordBId: string;
  let sheetAId: string;
  let portalToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register-lab')
      .send({ labName: 'Reports E2E Lab', labSlug: slug, email: staffEmail, firstName: 'E2E', lastName: 'Admin', password })
      .expect(201);
    labId = reg.body.labId;
    staffUserId = (await raw.user.findFirstOrThrow({ where: { labId } })).id;

    const clientA = await raw.client.create({ data: { labId, firstName: 'Alpha', lastName: 'Clinic' } });
    const clientB = await raw.client.create({ data: { labId, firstName: 'Bravo', lastName: 'Clinic' } });

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

    // Record A gets a result sheet, initially UNAUTHORIZED.
    const sheetA = await raw.resultSheet.create({ data: { labId, recordId: recordA.id, authorized: false } });
    sheetAId = sheetA.id;

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
      await raw.resultSheet.deleteMany({ where: { labId } });
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

  it('REFUSES the report while the result sheet is unauthorized (403, never a PDF)', async () => {
    await auth(request(app.getHttpServer()).get(`/api/v1/portal/records/${recordAId}/report.pdf`)).expect(403);
  });

  it("REFUSES another client's report by crafted id (404)", async () => {
    await auth(request(app.getHttpServer()).get(`/api/v1/portal/records/${recordBId}/report.pdf`)).expect(404);
  });

  it('serves a %PDF once the OWN sheet is authorized', async () => {
    await raw.resultSheet.update({
      where: { id: sheetAId },
      data: { authorized: true, authorizedAt: new Date(), authorizedById: staffUserId },
    });

    const res = await auth(request(app.getHttpServer()).get(`/api/v1/portal/records/${recordAId}/report.pdf`))
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(res.headers['content-type']).toContain('application/pdf');
    expect((res.body as Buffer).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it("STILL refuses another client's report even after authorizing A's (no cross-leak)", async () => {
    await auth(request(app.getHttpServer()).get(`/api/v1/portal/records/${recordBId}/report.pdf`)).expect(404);
  });
});
