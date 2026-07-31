import { randomUUID } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT, type KeyLike } from 'jose';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../../database/prisma.service';
import { LabContext } from '../../../common/tenancy/lab-context';
import { FederatedIdentityService } from '../federated-identity.service';
import { OidcTransactionService } from './oidc-transaction.service';
import { OidcTokenValidator } from './oidc-token-validator';
import { OidcAuthenticationAdapter } from './oidc-authentication.adapter';
import { OidcJwksResolver } from './oidc-jwks-resolver';
import { OidcDiscoveryClient, OidcCodeExchangeInput } from './oidc-discovery';
import { OidcProviderConfig, OidcJwks } from './oidc-config';

/**
 * Program 7 · Phase 7A.2a — the interactive OIDC flow against the REAL test Postgres, with a DETERMINISTIC test-IdP
 * double (jose-signed ID token). Proves: transaction begin/consume; the configuration-immutability invariant
 * (fail-closed on a config change mid-transaction); single-use; and provider → canonical HUMAN principal via the 7A.1
 * federated linkage (fail-closed on an unlinked subject; no auto-provisioning).
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;
const ISS = 'https://idp.example.test';

describeIf('P7-7A.2a interactive OIDC flow (integration)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const transactions = new OidcTransactionService(prisma);
  const federated = new FederatedIdentityService(prisma);
  const asLab = <T>(labId: string, fn: () => Promise<T>) => labContext.runLabScoped(labId, fn) as Promise<T>;
  const labIds: string[] = [];
  let priv: KeyLike; let jwks: OidcJwks;

  const makeIdp = (subject: string, nonce: string): OidcDiscoveryClient => ({
    discover: async () => ({ issuer: ISS, authorization_endpoint: `${ISS}/authorize`, token_endpoint: `${ISS}/token`, jwks_uri: `${ISS}/jwks` }),
    jwks: async () => jwks,
    exchangeCode: async (_i: OidcCodeExchangeInput) => ({
      id_token: await new SignJWT({ nonce, sub: subject }).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuedAt().setIssuer(ISS).setAudience('client-abc').setExpirationTime('5m').sign(priv),
    }),
  });
  const adapterWith = (idp: OidcDiscoveryClient) => new OidcAuthenticationAdapter(idp, new OidcTokenValidator(), new OidcJwksResolver(idp), federated);

  beforeAll(async () => {
    const kp = await generateKeyPair('RS256'); priv = kp.privateKey;
    jwks = { keys: [{ ...(await exportJWK(kp.publicKey)), kid: 'k1', use: 'sig', alg: 'RS256' }] };
  });
  afterAll(async () => {
    for (const labId of labIds) {
      for (const t of ['OidcAuthTransaction', 'FederatedIdentity', 'IdentityProvider', 'User', 'Account']) await raw.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, labId);
      await raw.$executeRaw`DELETE FROM "Lab" WHERE id = ${labId}`;
    }
    await prisma.$disconnect(); await raw.$disconnect();
  });

  const setup = async (subject: string) => {
    const lab = await raw.lab.create({ data: { name: 'p7o', slug: `p7o-${randomUUID()}` } }); labIds.push(lab.id);
    const acc = await raw.account.create({ data: { labId: lab.id, name: 'a' } });
    const user = await raw.user.create({ data: { labId: lab.id, accountId: acc.id, email: `u-${randomUUID()}@t.test`, passwordHash: 'x', firstName: 'H', lastName: 'P' } });
    const provider = await raw.identityProvider.create({ data: { labId: lab.id, key: 'idp', displayName: 'IdP', protocol: 'OIDC', issuer: ISS, clientId: 'client-abc', redirectUri: 'https://app.test/cb', isEnabled: true } });
    if (subject) await raw.federatedIdentity.create({ data: { labId: lab.id, identityProviderId: provider.id, externalSubject: subject, userId: user.id } });
    const config: OidcProviderConfig = { providerId: provider.id, providerKey: 'idp', expectedIssuer: ISS, clientId: 'client-abc', redirectUri: 'https://app.test/cb' };
    return { labId: lab.id, userId: user.id, provider, config };
  };

  it('resolves a linked subject to a canonical HUMAN principal (full transaction + adapter)', async () => {
    const { labId, userId, config } = await setup('sub-linked');
    const begun = await asLab(labId, () => transactions.begin(config));
    const consumed = await asLab(labId, () => transactions.verifyAndConsume(begun.state, config));
    const result = await asLab(labId, () => adapterWith(makeIdp('sub-linked', consumed.nonce)).authenticate({ config, code: 'authcode', nonce: consumed.nonce, pkceVerifier: consumed.pkceVerifier, redirectUri: config.redirectUri }));
    expect(result!.protocol).toBe('OIDC');
    expect(result!.principal).toEqual({ kind: 'HUMAN', principalId: userId, labId });
  });

  it('FAILS CLOSED when the provider config changes mid-transaction (immutability invariant)', async () => {
    const { labId, provider, config } = await setup('sub-x');
    const begun = await asLab(labId, () => transactions.begin(config));
    await raw.identityProvider.update({ where: { id: provider.id }, data: { clientId: 'client-CHANGED' } });
    const changed = { ...config, clientId: 'client-CHANGED' };
    await expect(asLab(labId, () => transactions.verifyAndConsume(begun.state, changed))).rejects.toThrow(/configuration changed/i);
  });

  it('is single-use (a second consume of the same state fails closed)', async () => {
    const { labId, config } = await setup('sub-y');
    const begun = await asLab(labId, () => transactions.begin(config));
    await asLab(labId, () => transactions.verifyAndConsume(begun.state, config));
    await expect(asLab(labId, () => transactions.verifyAndConsume(begun.state, config))).rejects.toThrow(/already used/i);
  });

  it('fails closed for an UNLINKED subject (no auto-provisioning)', async () => {
    const { labId, config } = await setup('sub-linked-only');
    const begun = await asLab(labId, () => transactions.begin(config));
    const consumed = await asLab(labId, () => transactions.verifyAndConsume(begun.state, config));
    const result = await asLab(labId, () => adapterWith(makeIdp('sub-NOT-linked', consumed.nonce)).authenticate({ config, code: 'c', nonce: consumed.nonce, pkceVerifier: consumed.pkceVerifier, redirectUri: config.redirectUri }));
    expect(result).toBeNull();
  });

  it('rejects a tampered nonce (replay) from the IdP', async () => {
    const { labId, config } = await setup('sub-z');
    const begun = await asLab(labId, () => transactions.begin(config));
    const consumed = await asLab(labId, () => transactions.verifyAndConsume(begun.state, config));
    await expect(asLab(labId, () => adapterWith(makeIdp('sub-z', 'WRONG-NONCE')).authenticate({ config, code: 'c', nonce: consumed.nonce, pkceVerifier: consumed.pkceVerifier, redirectUri: config.redirectUri }))).rejects.toThrow(/nonce/i);
  });

  it('rejects discovery whose issuer does not match the configured trust anchor', async () => {
    const { labId, config } = await setup('sub-d');
    const begun = await asLab(labId, () => transactions.begin(config));
    const consumed = await asLab(labId, () => transactions.verifyAndConsume(begun.state, config));
    const evilIdp: any = { ...makeIdp('sub-d', consumed.nonce), discover: async () => ({ issuer: 'https://evil.test', authorization_endpoint: `${ISS}/a`, token_endpoint: `${ISS}/t`, jwks_uri: `${ISS}/j` }) };
    await expect(asLab(labId, () => adapterWith(evilIdp).authenticate({ config, code: 'c', nonce: consumed.nonce, pkceVerifier: consumed.pkceVerifier, redirectUri: config.redirectUri }))).rejects.toThrow(/issuer/i);
  });

  it('CONCURRENCY: two concurrent consumes of the same valid transaction → exactly one succeeds, one fails closed', async () => {
    const { labId, config } = await setup('sub-c');
    const begun = await asLab(labId, () => transactions.begin(config));
    const results = await Promise.allSettled([
      asLab(labId, () => transactions.verifyAndConsume(begun.state, config)),
      asLab(labId, () => transactions.verifyAndConsume(begun.state, config)),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    expect(ok).toBe(1);
    expect(failed).toBe(1);
  });
});
