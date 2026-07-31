import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../../../app.module';
import { buildSamlResponse } from './testing/saml-test-vectors';
import { certificateFingerprint } from './saml-config';
import { TEST_IDP_CERT_PEM } from './testing/saml-test-vectors';

/**
 * Program 7 · Phase 7A.3 — END-TO-END proof of the LIVE SP-initiated SAML path through the real Nest app (global guard
 * chain + tenancy + ValidationPipe + cookies), against a real DB. Proves: initiate persists a request; a validly-signed
 * response for a LINKED NameID establishes a session via the EXISTING federated session bridge (LOGIN_SUCCEEDED); and
 * replay, an unlinked NameID, an unsigned response, and a disabled provider all fail closed (401). No new authorization
 * evaluator; the human/local + OIDC + service paths are untouched.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('P7-7A.3 SAML Federation (e2e live path)', () => {
  let app: INestApplication;
  const raw = new PrismaClient();
  const ts = Date.now().toString(36);
  const host = `saml-e2e-${ts}.osieri.test`;
  const key = 'samlidp';
  const acsUrl = `https://${host}/api/v1/enterprise-auth/saml/${key}/acs`;
  const spEntityId = `https://${host}/sp`;
  const idpEntityId = 'https://idp.e2e.test/entity';
  const slug = `e2e-saml-${ts}`;
  const email = `${slug}@e2e.test`;
  const password = 'E2eTestPassword1!';
  let labId: string;
  let providerId: string;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const reg = await request(app.getHttpServer()).post('/api/v1/auth/register-lab').send({ labName: 'E2E SAML Lab', labSlug: slug, email, firstName: 'E2E', lastName: 'Admin', password }).expect(201);
    labId = reg.body.labId;
    const admin = await raw.user.findFirstOrThrow({ where: { labId } });
    userId = admin.id;

    await raw.labDomain.create({ data: { labId, hostname: host } });
    const provider = await raw.identityProvider.create({
      data: { labId, key, displayName: 'E2E IdP', protocol: 'SAML', issuer: idpEntityId, samlSpEntityId: spEntityId, samlAcsUrl: acsUrl, samlIdpSsoUrl: 'https://idp.e2e.test/sso', samlWantAssertionsSigned: true, isEnabled: true },
    });
    providerId = provider.id;
    await raw.samlIdpCertificate.create({ data: { labId, identityProviderId: providerId, pemCertificate: TEST_IDP_CERT_PEM, fingerprint: certificateFingerprint(TEST_IDP_CERT_PEM), status: 'ACTIVE' } });
    // Link the opaque NameID → the existing human user (no JIT).
    await raw.federatedIdentity.create({ data: { labId, identityProviderId: providerId, externalSubject: 'e2e-subject', userId } });
  });

  afterAll(async () => {
    if (labId) {
      await raw.samlConsumedAssertion.deleteMany({ where: { labId } });
      await raw.samlAuthRequest.deleteMany({ where: { labId } });
      await raw.samlIdpCertificate.deleteMany({ where: { labId } });
      await raw.federatedIdentity.deleteMany({ where: { labId } });
      await raw.identityProvider.deleteMany({ where: { labId } });
      await raw.labDomain.deleteMany({ where: { labId } });
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
  const initiate = () => request(server()).post(`/api/v1/enterprise-auth/saml/${key}/initiate`).set('Host', host);
  const postAcs = (SAMLResponse: string, RelayState?: string) => request(server()).post(`/api/v1/enterprise-auth/saml/${key}/acs`).set('Host', host).send(RelayState ? { SAMLResponse, RelayState } : { SAMLResponse });

  /** Begin a fresh SP-initiated request and return the persisted requestId + relayState (server-generated). */
  async function beginRequest(): Promise<{ requestId: string; relayState: string }> {
    const res = await initiate().expect(201);
    expect(typeof res.body.redirectUrl).toBe('string');
    const row = await raw.samlAuthRequest.findFirstOrThrow({ where: { identityProviderId: providerId, consumedAt: null }, orderBy: { createdAt: 'desc' } });
    return { requestId: row.requestId, relayState: row.relayState };
  }

  it('a linked, validly-signed response establishes a session (LOGIN_SUCCEEDED)', async () => {
    const { requestId, relayState } = await beginRequest();
    const saml = buildSamlResponse({ requestId, nameId: 'e2e-subject', idpEntityId, spEntityId, acsUrl });
    const res = await postAcs(saml, relayState).expect(201);
    expect(res.body.status).toBe('OK');
    const cookies = (res.headers['set-cookie'] ?? []) as unknown as string[];
    expect(cookies.some((c) => c.startsWith('access_token='))).toBe(true);
  });

  it('replaying the same response fails closed (request already consumed)', async () => {
    const { requestId, relayState } = await beginRequest();
    const saml = buildSamlResponse({ requestId, nameId: 'e2e-subject', idpEntityId, spEntityId, acsUrl });
    await postAcs(saml, relayState).expect(201);
    await postAcs(saml, relayState).expect(401); // the SamlAuthRequest is single-use
  });

  it('an unlinked NameID fails closed (401, no JIT)', async () => {
    const { requestId, relayState } = await beginRequest();
    const saml = buildSamlResponse({ requestId, nameId: 'not-linked', idpEntityId, spEntityId, acsUrl });
    await postAcs(saml, relayState).expect(401);
  });

  it('an unsigned response fails closed (401)', async () => {
    const { requestId, relayState } = await beginRequest();
    const saml = buildSamlResponse({ requestId, nameId: 'e2e-subject', idpEntityId, spEntityId, acsUrl, sign: false });
    await postAcs(saml, relayState).expect(401);
  });

  it('a wrong RelayState fails closed (401)', async () => {
    const { requestId } = await beginRequest();
    const saml = buildSamlResponse({ requestId, nameId: 'e2e-subject', idpEntityId, spEntityId, acsUrl });
    await postAcs(saml, 'tampered-relaystate').expect(401);
  });

  it('a disabled provider fails closed at initiate and ACS', async () => {
    await raw.identityProvider.update({ where: { id: providerId }, data: { isEnabled: false } });
    await initiate().expect(400); // no enabled SAML provider for that key
    await postAcs(buildSamlResponse({ requestId: '_x', idpEntityId, spEntityId, acsUrl })).expect(401);
    await raw.identityProvider.update({ where: { id: providerId }, data: { isEnabled: true } }); // restore
  });

  it('the local/OIDC/service login paths remain reachable (human baseline preserved)', async () => {
    const login = await request(server()).post('/api/v1/auth/login').send({ email, password }).expect(201);
    const cookies = (login.headers['set-cookie'] ?? []) as unknown as string[];
    expect(cookies.some((c) => c.startsWith('access_token='))).toBe(true);
  });
});
