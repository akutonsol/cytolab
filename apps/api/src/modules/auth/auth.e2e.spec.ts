import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../../app.module';

/**
 * End-to-end HTTP coverage of the auth path through the real Nest app
 * (guards + tenancy middleware + ValidationPipe), against a real database.
 * Gated on DATABASE_URL so it is skipped when no DB is available.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('Auth (e2e)', () => {
  let app: INestApplication;
  const raw = new PrismaClient();

  const slug = `e2e-${Date.now().toString(36)}`;
  const email = `${slug}@e2e.test`;
  const password = 'E2eTestPassword1!';
  let labId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // Mirror production bootstrap so routes/validation match main.ts, including
    // cookie-parser — the staff session is delivered as HttpOnly cookies and the
    // JWT strategy reads the access token from `req.cookies`.
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register-lab')
      .send({ labName: 'E2E Lab', labSlug: slug, email, firstName: 'E2E', lastName: 'Admin', password })
      .expect(201);
    labId = res.body.labId;
  });

  afterAll(async () => {
    if (labId) {
      await raw.authAttempt.deleteMany({ where: { email } });
      await raw.user.deleteMany({ where: { labId } }); // cascades UserRole
      await raw.workspace.deleteMany({ where: { labId } });
      await raw.account.deleteMany({ where: { labId } });
      await raw.lab.deleteMany({ where: { id: labId } });
    }
    await raw.$disconnect();
    await app?.close();
  });

  it('rejects invalid credentials with 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
  });

  it('logs in with valid credentials and sets HttpOnly access + refresh session cookies', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
    // The staff session is delivered as HttpOnly cookies, not body tokens; the
    // response body carries the authenticated user summary.
    expect(res.body.status).toBe('OK');
    expect(res.body.user.email).toBe(email);
    const setCookie = (res.headers['set-cookie'] ?? []) as unknown as string[];
    expect(setCookie.some((c) => c.startsWith('access_token='))).toBe(true);
    expect(setCookie.some((c) => c.startsWith('refresh_token='))).toBe(true);
    // Session cookies are HttpOnly (not readable by client-side JS).
    expect(setCookie.find((c) => c.startsWith('access_token='))).toMatch(/HttpOnly/i);
  });

  it('rejects GET /auth/me without a token (401)', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('returns the current user from GET /auth/me with the session cookie', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
    const cookie = ((login.headers['set-cookie'] ?? []) as unknown as string[])
      .map((c) => c.split(';')[0])
      .join('; ');

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .expect(200);

    expect(me.body.email).toBe(email);
    expect(me.body.labId).toBe(labId);
    expect(me.body.lab?.slug).toBe(slug);
    expect(me.body.roles).toContain('Superuser');
  });
});
