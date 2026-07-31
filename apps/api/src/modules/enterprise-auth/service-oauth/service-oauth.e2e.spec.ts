import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { AppModule } from '../../../app.module';

/**
 * Program 7 · Phase 7A.2b — END-TO-END proof of the LIVE service-authentication path through the real Nest app (global
 * guard chain + tenancy + ValidationPipe), against a real DB. A representative @Service route
 * (GET /enterprise-auth/oauth/introspect, @RequirePermissions('identity:view')) demonstrates: valid service token +
 * granted scope → allowed; without scope → denied by the EXISTING PermissionsGuard; staff token on a service route →
 * rejected; service token on a staff route → rejected; missing/invalid token → rejected; no human session created; and
 * human routes unchanged.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('P7-7A.2b Service-Principal OAuth (e2e live path)', () => {
  let app: INestApplication;
  const raw = new PrismaClient();
  const jwt = new JwtService({});
  const slug = `e2e-svc-${Date.now().toString(36)}`;
  const email = `${slug}@e2e.test`;
  const password = 'E2eTestPassword1!';
  let labId: string;
  let staffAccess: string;

  const mkCredential = async (spId: string, labIdArg: string) => {
    const secret = randomBytes(32).toString('base64url');
    await raw.servicePrincipalCredential.create({ data: { labId: labIdArg, servicePrincipalId: spId, secretHash: await argon2.hash(secret), status: 'ACTIVE' } });
    return secret;
  };
  const tokenFor = async (clientId: string, clientSecret: string) =>
    (await request(app.getHttpServer()).post('/api/v1/enterprise-auth/oauth/token').send({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret })).body.access_token as string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    const reg = await request(app.getHttpServer()).post('/api/v1/auth/register-lab').send({ labName: 'E2E Svc Lab', labSlug: slug, email, firstName: 'E2E', lastName: 'Admin', password }).expect(201);
    labId = reg.body.labId;
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password }).expect(201);
    const cookies = (login.headers['set-cookie'] ?? []) as unknown as string[];
    staffAccess = (cookies.find((c) => c.startsWith('access_token=')) ?? '').split(';')[0].replace('access_token=', '');
    await raw.permission.upsert({ where: { code: 'identity:view' }, update: {}, create: { code: 'identity:view', label: 'view identity' } });
  });

  afterAll(async () => {
    if (labId) {
      await raw.servicePrincipalScope.deleteMany({ where: { labId } });
      await raw.servicePrincipalCredential.deleteMany({ where: { labId } });
      await raw.servicePrincipal.deleteMany({ where: { labId } });
      await raw.userSession.deleteMany({ where: { user: { labId } } });
      await raw.refreshToken.deleteMany({ where: { user: { labId } } });
      await raw.authAttempt.deleteMany({ where: { email } });
      await raw.user.deleteMany({ where: { labId } });
      await raw.workspace.deleteMany({ where: { labId } });
      await raw.account.deleteMany({ where: { labId } });
      await raw.lab.deleteMany({ where: { id: labId } });
    }
    await raw.$disconnect();
    await app?.close();
  });

  const server = () => app.getHttpServer();
  const introspect = (bearer?: string) => { const r = request(server()).get('/api/v1/enterprise-auth/oauth/introspect'); return bearer ? r.set('Authorization', `Bearer ${bearer}`) : r; };

  it('valid service token WITH the granted scope → allowed; bound as a SERVICE principal', async () => {
    const sp = await raw.servicePrincipal.create({ data: { labId, key: `k-${slug}-a`, displayName: 'Robot A', isActive: true } });
    const perm = await raw.permission.findUniqueOrThrow({ where: { code: 'identity:view' } });
    await raw.servicePrincipalScope.create({ data: { labId, servicePrincipalId: sp.id, permissionId: perm.id } });
    const secret = await mkCredential(sp.id, labId);
    const token = await tokenFor(sp.principalUuid, secret);
    const res = await introspect(token).expect(200);
    expect(res.body.kind).toBe('service');
    expect(res.body.servicePrincipalId).toBe(sp.id);
    expect(res.body.scopes).toContain('identity:view');
  });

  it('valid service token WITHOUT the scope → denied by the existing PermissionsGuard (403)', async () => {
    const sp = await raw.servicePrincipal.create({ data: { labId, key: `k-${slug}-b`, displayName: 'Robot B', isActive: true } });
    const secret = await mkCredential(sp.id, labId);
    const token = await tokenFor(sp.principalUuid, secret);
    await introspect(token).expect(403);
  });

  it('staff token on a @Service route → rejected (401); service token on a staff route → rejected (401)', async () => {
    const sp = await raw.servicePrincipal.create({ data: { labId, key: `k-${slug}-c`, displayName: 'Robot C', isActive: true } });
    const perm = await raw.permission.findUniqueOrThrow({ where: { code: 'identity:view' } });
    await raw.servicePrincipalScope.create({ data: { labId, servicePrincipalId: sp.id, permissionId: perm.id } });
    const token = await tokenFor(sp.principalUuid, await mkCredential(sp.id, labId));
    await introspect(staffAccess).expect(401); // staff token (aud=staff) rejected on the service route
    // a staff (human) route is NOT @Service → JwtAuthGuard runs the staff strategy → a service token (aud=service) is rejected
    await request(server()).get(`/api/v1/enterprise-auth/service-principals/${sp.id}/scopes`).set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('missing token / wrong audience / wrong scope-type → rejected (401), never anonymous/human fallback', async () => {
    await introspect().expect(401); // no token
    const wrongAud = await jwt.signAsync({ sub: 's', labId, scope: 'service', type: 'access', aud: 'staff' }, { secret: process.env.JWT_SECRET, algorithm: 'HS256' });
    await introspect(wrongAud).expect(401); // wrong audience
    const wrongScope = await jwt.signAsync({ sub: 's', labId, scope: 'staff', type: 'access', aud: 'service' }, { secret: process.env.JWT_SECRET, algorithm: 'HS256' });
    await introspect(wrongScope).expect(401); // right audience, wrong scope/type
  });

  it('service authentication creates NO human session; human routes remain unchanged', async () => {
    const before = await raw.userSession.count({ where: { user: { labId } } });
    const sp = await raw.servicePrincipal.create({ data: { labId, key: `k-${slug}-d`, displayName: 'Robot D', isActive: true } });
    const perm = await raw.permission.findUniqueOrThrow({ where: { code: 'identity:view' } });
    await raw.servicePrincipalScope.create({ data: { labId, servicePrincipalId: sp.id, permissionId: perm.id } });
    const token = await tokenFor(sp.principalUuid, await mkCredential(sp.id, labId));
    await introspect(token).expect(200);
    expect(await raw.userSession.count({ where: { user: { labId } } })).toBe(before); // no UserSession created
    // human baseline: the staff session cookie still authenticates a human route
    await request(server()).get('/api/v1/auth/me').set('Cookie', `access_token=${staffAccess}`).expect(200);
  });

  it('a DEACTIVATED service principal cannot obtain a new token (short-TTL model, D4)', async () => {
    const sp = await raw.servicePrincipal.create({ data: { labId, key: `k-${slug}-e`, displayName: 'Robot E', isActive: true } });
    const secret = await mkCredential(sp.id, labId);
    expect(await tokenFor(sp.principalUuid, secret)).toBeTruthy();
    await raw.servicePrincipal.update({ where: { id: sp.id }, data: { isActive: false } });
    const res = await request(server()).post('/api/v1/enterprise-auth/oauth/token').send({ grant_type: 'client_credentials', client_id: sp.principalUuid, client_secret: secret });
    expect(res.status).toBe(401); // new issuance fails immediately after deactivation
  });
});
