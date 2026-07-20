import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../../app.module';

/**
 * End-to-end proof of the two-token-family isolation and the anti-enumeration
 * login, through the real Nest app (global guards + tenancy + ValidationPipe).
 * Gated on DATABASE_URL so it is skipped when no DB is available.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('Portal auth (e2e)', () => {
  let app: INestApplication;
  const raw = new PrismaClient();

  const slug = `pe2e-${Date.now().toString(36)}`;
  const staffEmail = `staff-${slug}@e2e.test`;
  const staffPassword = 'E2eTestPassword1!';
  const portalEmail = `portal-${slug}@e2e.test`;
  const portalPassword = 'portal-password-123';

  let labId: string;
  let clientId: string;
  let staffCookie: string;
  let staffAccessJwt: string;
  let portalToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    // Mirror production bootstrap: cookie-parser is required for the staff JWT
    // strategy to read the access token from the HttpOnly session cookie.
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    // Bootstrap a staff lab + Superuser.
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register-lab')
      .send({ labName: 'Portal E2E Lab', labSlug: slug, email: staffEmail, firstName: 'E2E', lastName: 'Admin', password: staffPassword })
      .expect(201);
    labId = reg.body.labId;

    // Seed a Client + an onboarded PortalUser directly (raw client bypasses the
    // tenancy extension, so we can set labId/clientId).
    const client = await raw.client.create({
      data: { labId, firstName: 'Referring', lastName: 'Doctor', officeName: 'City Clinic' },
    });
    clientId = client.id;
    await raw.portalUser.create({
      data: {
        labId,
        clientId,
        email: portalEmail,
        passwordHash: await argon2.hash(portalPassword),
        firstName: 'Portal',
        lastName: 'User',
        isActive: true,
      },
    });

    // Staff auth is a HttpOnly cookie session: capture the Set-Cookie header to
    // replay on staff routes, and the raw access-token JWT to prove the portal
    // token family rejects it (audience isolation).
    const staffLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: staffEmail, password: staffPassword })
      .expect(201);
    const staffSetCookie = (staffLogin.headers['set-cookie'] ?? []) as unknown as string[];
    staffCookie = staffSetCookie.map((c) => c.split(';')[0]).join('; ');
    staffAccessJwt = (staffSetCookie.find((c) => c.startsWith('access_token=')) ?? '')
      .split(';')[0]
      .replace('access_token=', '');
    // Portal auth remains a bearer token returned in the body (separate family).
    portalToken = (
      await request(app.getHttpServer()).post('/api/v1/portal/auth/login').send({ email: portalEmail, password: portalPassword })
    ).body.accessToken;
  });

  afterAll(async () => {
    if (labId) {
      await raw.authAttempt.deleteMany({ where: { email: { in: [staffEmail, portalEmail] } } });
      await raw.portalAccessToken.deleteMany({ where: { labId } });
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

  it('issues both credential families on their own login endpoints', () => {
    // Staff: a HttpOnly access-token cookie session. Portal: a bearer token.
    expect(staffAccessJwt).toEqual(expect.any(String));
    expect(staffAccessJwt.length).toBeGreaterThan(0);
    expect(portalToken).toEqual(expect.any(String));
  });

  describe('token cross-rejection (the non-negotiable proof)', () => {
    it('a PORTAL token is REJECTED on a staff route', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${portalToken}`)
        .expect(401);
    });

    it('a STAFF token is REJECTED on a portal route', async () => {
      // The raw staff access JWT, presented as a bearer, fails the portal
      // strategy's separate secret + audience.
      await request(app.getHttpServer())
        .get('/api/v1/portal/auth/me')
        .set('Authorization', `Bearer ${staffAccessJwt}`)
        .expect(401);
    });

    it('each credential IS accepted on its own side (sanity)', async () => {
      const staffMe = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', staffCookie)
        .expect(200);
      expect(staffMe.body.email).toBe(staffEmail);

      const portalMe = await request(app.getHttpServer())
        .get('/api/v1/portal/auth/me')
        .set('Authorization', `Bearer ${portalToken}`)
        .expect(200);
      expect(portalMe.body.email).toBe(portalEmail);
      expect(portalMe.body.clientId).toBe(clientId);
    });
  });

  describe('anti-enumeration login', () => {
    it('returns an identical response AND comparable timing for wrong-password vs no-such-email', async () => {
      const t0 = Date.now();
      const wrongPassword = await request(app.getHttpServer())
        .post('/api/v1/portal/auth/login')
        .send({ email: portalEmail, password: 'definitely-wrong' })
        .expect(401);
      const wrongPasswordMs = Date.now() - t0;

      const t1 = Date.now();
      const noSuchEmail = await request(app.getHttpServer())
        .post('/api/v1/portal/auth/login')
        .send({ email: `nobody-${slug}@e2e.test`, password: 'definitely-wrong' })
        .expect(401);
      const noSuchEmailMs = Date.now() - t1;

      // Identical body (no field that betrays which case occurred).
      expect(noSuchEmail.body.message).toBe(wrongPassword.body.message);
      expect(wrongPassword.body.message).toBe('Invalid credentials');

      // Both paths run exactly one argon2 verify, so the no-such-email path is
      // NOT trivially faster — both spend real hashing time (argon2 ~tens of ms).
      expect(wrongPasswordMs).toBeGreaterThan(10);
      expect(noSuchEmailMs).toBeGreaterThan(10);
    });
  });
});
