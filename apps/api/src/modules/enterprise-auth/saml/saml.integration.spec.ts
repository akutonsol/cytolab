import { randomUUID } from 'node:crypto';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../../database/prisma.service';
import { LabContext } from '../../../common/tenancy/lab-context';
import { FederatedIdentityService } from '../federated-identity.service';
import { SamlAuthRequestService, SamlRequestError } from './saml-auth-request.service';
import { SamlAuthenticationAdapter } from './saml-authentication.adapter';
import { SamlProviderConfig, certificateFingerprint, configFingerprint } from './saml-config';
import { TEST_IDP_CERT_PEM, TEST_DEFAULTS } from './testing/saml-test-vectors';

/**
 * Program 7 · Phase 7A.3 — SAML request-transaction + linkage against the REAL test Postgres. Proves: request
 * persistence with the config fingerprint; single-use compare-and-set (incl. exactly-one under concurrent consume);
 * expired/unknown/RelayState-mismatch/config-fingerprint-mismatch all fail closed; assertion-ID replay protection; and
 * the SAML adapter resolving an opaque NameID to a HUMAN principal via FederatedIdentity (unlinked ⇒ null, no JIT).
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('P7-7A.3 SAML Federation (integration)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const requests = new SamlAuthRequestService(prisma);
  const federated = new FederatedIdentityService(prisma);
  const adapter = new SamlAuthenticationAdapter(federated);
  const asLab = <T>(labId: string, fn: () => Promise<T>) => labContext.runLabScoped(labId, fn) as Promise<T>;
  const labIds: string[] = [];

  afterAll(async () => {
    for (const labId of labIds) {
      for (const t of ['SamlConsumedAssertion', 'SamlAuthRequest', 'SamlIdpCertificate', 'FederatedIdentity', 'IdentityProvider', 'User', 'Account']) {
        await raw.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, labId);
      }
      await raw.$executeRaw`DELETE FROM "Lab" WHERE id = ${labId}`;
    }
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  async function setup(): Promise<{ labId: string; providerId: string; config: SamlProviderConfig }> {
    const lab = await raw.lab.create({ data: { name: 'p7c', slug: `p7c-${randomUUID()}` } });
    labIds.push(lab.id);
    const provider = await raw.identityProvider.create({
      data: {
        labId: lab.id,
        key: `saml-${randomUUID()}`,
        displayName: 'Test IdP',
        protocol: 'SAML',
        issuer: TEST_DEFAULTS.idpEntityId,
        samlSpEntityId: TEST_DEFAULTS.spEntityId,
        samlAcsUrl: TEST_DEFAULTS.acsUrl,
        samlIdpSsoUrl: 'https://idp.test/sso',
        samlWantAssertionsSigned: true,
        isEnabled: true,
      },
    });
    await raw.samlIdpCertificate.create({ data: { labId: lab.id, identityProviderId: provider.id, pemCertificate: TEST_IDP_CERT_PEM, fingerprint: certificateFingerprint(TEST_IDP_CERT_PEM), status: 'ACTIVE' } });
    const config: SamlProviderConfig = {
      providerId: provider.id,
      providerKey: provider.key,
      idpEntityId: TEST_DEFAULTS.idpEntityId,
      spEntityId: TEST_DEFAULTS.spEntityId,
      acsUrl: TEST_DEFAULTS.acsUrl,
      idpSsoUrl: 'https://idp.test/sso',
      nameIdFormat: null,
      wantAssertionsSigned: true,
      signingCerts: [{ fingerprint: certificateFingerprint(TEST_IDP_CERT_PEM), pem: TEST_IDP_CERT_PEM }],
    };
    return { labId: lab.id, providerId: provider.id, config };
  }

  const reasonOf = async (fn: () => Promise<unknown>): Promise<string> => {
    try {
      await fn();
      return 'NO_THROW';
    } catch (e) {
      return e instanceof SamlRequestError ? e.reason : `OTHER:${(e as Error).message}`;
    }
  };

  it('persists a request with the config fingerprint + a single-use RelayState', async () => {
    const { labId, config } = await setup();
    const { requestId, relayState } = await asLab(labId, () => requests.begin(config));
    const row = await raw.samlAuthRequest.findFirst({ where: { requestId } });
    expect(row).toBeTruthy();
    expect(row!.configFingerprint).toBe(configFingerprint(config));
    expect(row!.relayState).toBe(relayState);
    expect(row!.consumedAt).toBeNull();
    expect(row!.expectedAcsUrl).toBe(config.acsUrl);
  });

  it('consumes exactly once (single-use); a second consume is replay', async () => {
    const { labId, config } = await setup();
    const { requestId, relayState } = await asLab(labId, () => requests.begin(config));
    const consumed = await asLab(labId, () => requests.verifyAndConsume(requestId, relayState, config));
    expect(consumed.identityProviderId).toBe(config.providerId);
    expect(await reasonOf(() => asLab(labId, () => requests.verifyAndConsume(requestId, relayState, config)))).toBe('replay');
  });

  it('two concurrent consumes ⇒ exactly one success and one fail-closed', async () => {
    const { labId, config } = await setup();
    const { requestId, relayState } = await asLab(labId, () => requests.begin(config));
    const results = await Promise.allSettled([
      asLab(labId, () => requests.verifyAndConsume(requestId, relayState, config)),
      asLab(labId, () => requests.verifyAndConsume(requestId, relayState, config)),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('fails closed on RelayState mismatch, config-fingerprint change, expiry, and unknown request', async () => {
    const { labId, config } = await setup();
    const { requestId, relayState } = await asLab(labId, () => requests.begin(config));
    expect(await reasonOf(() => asLab(labId, () => requests.verifyAndConsume(requestId, 'wrong-relaystate', config)))).toBe('unknown_request');
    const changed: SamlProviderConfig = { ...config, acsUrl: 'https://changed.test/acs' };
    expect(await reasonOf(() => asLab(labId, () => requests.verifyAndConsume(requestId, relayState, changed)))).toBe('config_fingerprint_mismatch');
    expect(await reasonOf(() => asLab(labId, () => requests.verifyAndConsume('_does_not_exist', relayState, config)))).toBe('unknown_request');
    // expire the row, then consume ⇒ expired_request
    await raw.samlAuthRequest.updateMany({ where: { requestId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await reasonOf(() => asLab(labId, () => requests.verifyAndConsume(requestId, relayState, config)))).toBe('expired_request');
  });

  it('enforces assertion-ID replay protection (single-use)', async () => {
    const { labId, providerId } = await setup();
    const assertionId = `_assert_${randomUUID()}`;
    await asLab(labId, () => requests.recordAssertionOnce(providerId, assertionId, new Date(Date.now() + 60_000)));
    expect(await reasonOf(() => asLab(labId, () => requests.recordAssertionOnce(providerId, assertionId, null)))).toBe('replay');
  });

  it('adapter: unlinked NameID ⇒ null (fail closed, no JIT)', async () => {
    const { labId, providerId } = await setup();
    const result = await asLab(labId, () => adapter.authenticate({ identityProviderId: providerId, nameId: 'unlinked-subject' }));
    expect(result).toBeNull();
  });

  it('adapter: a linked NameID ⇒ a HUMAN principal bound to the stable User.id (GG7)', async () => {
    const { labId, providerId } = await setup();
    const account = await raw.account.create({ data: { name: `acct-${randomUUID()}`, labId } as any });
    const user = await raw.user.create({ data: { labId, accountId: account.id, email: `saml-${randomUUID()}@lab.test`, passwordHash: 'x', firstName: 'Sam', lastName: 'Ell', isActive: true } });
    await asLab(labId, () => federated.link(providerId, 'linked-subject', user.id));
    const result = await asLab(labId, () => adapter.authenticate({ identityProviderId: providerId, nameId: 'linked-subject' }));
    expect(result).not.toBeNull();
    expect(result!.principal.kind).toBe('HUMAN');
    expect(result!.principal.principalId).toBe(user.id);
    expect(result!.protocol).toBe('SAML');
  });
});
