import { randomUUID } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT, type KeyLike } from 'jose';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../../database/prisma.service';
import { LabContext } from '../../../common/tenancy/lab-context';
import { FederatedIdentityService } from '../federated-identity.service';
import { AuthenticationService } from '../authentication.service';
import { OidcService } from './oidc.service';
import { OidcTransactionService } from './oidc-transaction.service';
import { OidcTokenValidator } from './oidc-token-validator';
import { OidcAuthenticationAdapter } from './oidc-authentication.adapter';
import { OidcJwksResolver } from './oidc-jwks-resolver';
import { OidcDiscoveryClient } from './oidc-discovery';
import { OidcProviderConfig, OidcJwks } from './oidc-config';

/**
 * Program 7 · Phase 7A.2a — the OIDC orchestration service: feature-gated activation (disabled ⇒ fail closed),
 * IdP-error handling, unlinked fail-closed, callback-after-disablement policy, the successful hand-off to the existing
 * session path, and append-only AUTHENTICATION/LOGIN_FAILED audit with a CODED reason (never a token/code/nonce/
 * verifier/raw-state/PHI).
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;
const ISS = 'https://idp.example.test';
const req: any = { headers: { host: 'lab.test' } };
const res: any = {};

describeIf('P7-7A.2a OidcService (feature-gate / IdP-error / audit / session hand-off)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const transactions = new OidcTransactionService(prisma);
  const federated = new FederatedIdentityService(prisma);
  const asLab = <T>(labId: string, fn: () => Promise<T>) => labContext.runLabScoped(labId, fn) as Promise<T>;
  const labIds: string[] = [];
  let priv: KeyLike; let jwks: OidcJwks;
  const auth: any = { completeFederatedLogin: jest.fn(async () => ({ status: 'OK' })) };
  const audit: any = { record: jest.fn(async () => undefined) };

  const idp = (subject: string, nonce: string): OidcDiscoveryClient => ({
    discover: async () => ({ issuer: ISS, authorization_endpoint: `${ISS}/authorize`, token_endpoint: `${ISS}/token`, jwks_uri: `${ISS}/jwks` }),
    jwks: async () => jwks,
    exchangeCode: async () => ({ id_token: await new SignJWT({ nonce, sub: subject }).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuedAt().setIssuer(ISS).setAudience('client-abc').setExpirationTime('5m').sign(priv) }),
  });
  const svcWith = (d: OidcDiscoveryClient) => new OidcService(prisma, transactions, new AuthenticationService([new OidcAuthenticationAdapter(d, new OidcTokenValidator(), new OidcJwksResolver(d), federated)]), auth, audit, d);

  beforeAll(async () => {
    const kp = await generateKeyPair('RS256'); priv = kp.privateKey;
    jwks = { keys: [{ ...(await exportJWK(kp.publicKey)), kid: 'k1', use: 'sig', alg: 'RS256' }] };
  });
  beforeEach(() => { auth.completeFederatedLogin.mockClear(); audit.record.mockClear(); });
  afterAll(async () => {
    for (const labId of labIds) {
      for (const t of ['OidcAuthTransaction', 'FederatedIdentity', 'IdentityProvider', 'User', 'Account']) await raw.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, labId);
      await raw.$executeRaw`DELETE FROM "Lab" WHERE id = ${labId}`;
    }
    await prisma.$disconnect(); await raw.$disconnect();
  });

  const setup = async (opts: { linkedSubject?: string; enabled?: boolean } = {}) => {
    const lab = await raw.lab.create({ data: { name: 'p7s', slug: `p7s-${randomUUID()}` } }); labIds.push(lab.id);
    const acc = await raw.account.create({ data: { labId: lab.id, name: 'a' } });
    const user = await raw.user.create({ data: { labId: lab.id, accountId: acc.id, email: `u-${randomUUID()}@t.test`, passwordHash: 'x', firstName: 'H', lastName: 'P' } });
    const provider = await raw.identityProvider.create({ data: { labId: lab.id, key: 'idp', displayName: 'IdP', protocol: 'OIDC', issuer: ISS, clientId: 'client-abc', redirectUri: 'https://app.test/cb', isEnabled: opts.enabled ?? true } });
    if (opts.linkedSubject) await raw.federatedIdentity.create({ data: { labId: lab.id, identityProviderId: provider.id, externalSubject: opts.linkedSubject, userId: user.id } });
    const config: OidcProviderConfig = { providerId: provider.id, providerKey: 'idp', expectedIssuer: ISS, clientId: 'client-abc', redirectUri: 'https://app.test/cb' };
    return { labId: lab.id, userId: user.id, provider, config };
  };
  const lastFailReason = () => (audit.record.mock.calls.find((c: any[]) => c[0]?.actionCode === 'LOGIN_FAILED')?.[0]?.metadata?.reason);
  const auditedNoSecrets = () => audit.record.mock.calls.every((c: any[]) => { const m = JSON.stringify(c[0]?.metadata ?? {}); return !/nonce|verifier|pkce|code|token|state/i.test(m); });

  const initEvents = () => audit.record.mock.calls.filter((c: any[]) => c[0]?.actionCode === 'LOGIN_INITIATED');

  it('initiate builds a valid authorize URL (S256 + state + nonce); a DISABLED provider fails closed', async () => {
    const { labId } = await setup({ enabled: true });
    const { authorizeUrl } = await asLab(labId, () => svcWith(idp('s', 'n')).initiate('idp'));
    const u = new URL(authorizeUrl);
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('state')).toBeTruthy();
    expect(u.searchParams.get('nonce')).toBeTruthy();
    const disabled = await setup({ enabled: false });
    await expect(asLab(disabled.labId, () => svcWith(idp('s', 'n')).initiate('idp'))).rejects.toBeDefined();
  });

  it('a successful initiation emits exactly one AUTHENTICATION/LOGIN_INITIATED event (coded, no secrets)', async () => {
    const { labId, config } = await setup({ enabled: true });
    await asLab(labId, () => svcWith(idp('s', 'n')).initiate('idp'));
    expect(initEvents().length).toBe(1);
    const ev = initEvents()[0][0];
    expect(ev.category).toBe('AUTHENTICATION');
    expect(ev.metadata.method).toBe('oidc');
    expect(ev.metadata.identityProviderId).toBe(config.providerId);
    expect(ev.metadata.transactionUuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(auditedNoSecrets()).toBe(true);
  });

  it('a FAILED initiation before transaction creation (disabled provider) emits NO initiation event', async () => {
    const { labId } = await setup({ enabled: false });
    await expect(asLab(labId, () => svcWith(idp('s', 'n')).initiate('idp'))).rejects.toBeDefined();
    expect(initEvents().length).toBe(0); // fail-closed before begin() ⇒ no false initiation event
  });

  it('an IdP error response fails closed and is audited (reason idp_error, no secrets)', async () => {
    const { labId } = await setup({});
    await expect(asLab(labId, () => svcWith(idp('s', 'n')).complete('any-state', undefined, req, res, 'access_denied'))).rejects.toBeDefined();
    expect(lastFailReason()).toBe('idp_error');
    expect(auditedNoSecrets()).toBe(true);
  });

  it('a successful callback resolves a linked subject and hands off to the existing session path', async () => {
    const { labId, userId, config } = await setup({ linkedSubject: 'sub-ok' });
    const begun = await asLab(labId, () => transactions.begin(config));
    const nonce = (await raw.oidcAuthTransaction.findFirst({ where: { state: begun.state } }))!.nonce;
    await asLab(labId, () => svcWith(idp('sub-ok', nonce)).complete(begun.state, 'authcode', req, res));
    expect(auth.completeFederatedLogin).toHaveBeenCalledWith(userId, req, res, { method: 'oidc', providerId: config.providerId });
  });

  it('an UNLINKED subject fails closed and is audited (reason unlinked_identity)', async () => {
    const { labId, config } = await setup({ linkedSubject: 'sub-linked' });
    const begun = await asLab(labId, () => transactions.begin(config));
    const nonce = (await raw.oidcAuthTransaction.findFirst({ where: { state: begun.state } }))!.nonce;
    await expect(asLab(labId, () => svcWith(idp('sub-OTHER', nonce)).complete(begun.state, 'c', req, res))).rejects.toBeDefined();
    expect(lastFailReason()).toBe('unlinked_identity');
    expect(auth.completeFederatedLogin).not.toHaveBeenCalled();
  });

  it('callback-after-disablement policy: disabling the provider mid-flow fails the callback closed (audited)', async () => {
    const { labId, provider, config } = await setup({ linkedSubject: 'sub-mid' });
    const begun = await asLab(labId, () => transactions.begin(config));
    await raw.identityProvider.update({ where: { id: provider.id }, data: { isEnabled: false } });
    await expect(asLab(labId, () => svcWith(idp('sub-mid', 'n')).complete(begun.state, 'c', req, res))).rejects.toBeDefined();
    expect(lastFailReason()).toBe('provider_disabled');
  });
});
