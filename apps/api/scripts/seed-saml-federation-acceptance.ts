/**
 * Program 7 · Phase 7A.3 — isolated fixtures for the SAML Federation acceptance gate.
 *
 * One lab with an ENABLED SP-initiated SAML provider, one ACTIVE configured signing certificate, and a linked human
 * identity (FederatedIdentity → an existing User). Lets the persisted-state assert drive the real validator + request
 * transaction + adapter against DB truth: additive schema, config-fingerprint immutability, single-use consumption,
 * assertion replay, provider isolation (a SAML canonical HUMAN principal), and the ET checks. No PHI/secret persisted
 * (the IdP signing material is a throwaway PUBLIC test cert). Guarded to refuse a non-isolated DB.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { certificateFingerprint } from '../src/modules/enterprise-auth/saml/saml-config';
import { TEST_IDP_CERT_PEM } from '../src/modules/enterprise-auth/saml/testing/saml-test-vectors';

const SLUG = 'p7-7a3-saml-acceptance-lab';
const HOST = 'p7-7a3-saml-acceptance.osieri.test';
const PROVIDER_KEY = 'acceptance-idp';
const IDP_ENTITY_ID = 'https://idp.acceptance.test/entity';
const SP_ENTITY_ID = `https://${HOST}/sp`;
const ACS_URL = `https://${HOST}/api/v1/enterprise-auth/saml/${PROVIDER_KEY}/acs`;
const LINKED_NAMEID = 'p7-7a3-linked-subject';
const FIXTURES_OUT = process.env.SAML_FIXTURES_OUT
  ? path.resolve(process.env.SAML_FIXTURES_OUT)
  : path.resolve(__dirname, '../../web/acceptance/.saml-fixtures.json');

function assertIsolatedAcceptanceDb(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required (isolated acceptance/test database).');
  const name = new URL(url).pathname.replace(/^\//, '');
  if (name === 'cytolab' || !/(test|accept)/i.test(name)) throw new Error(`Refusing "${name}": not an isolated acceptance DB.`);
}

async function main() {
  assertIsolatedAcceptanceDb();
  const prisma = new PrismaClient();
  try {
    const prior = await prisma.lab.findUnique({ where: { slug: SLUG }, select: { id: true } });
    if (prior) {
      for (const t of ['SamlConsumedAssertion', 'SamlAuthRequest', 'SamlIdpCertificate', 'FederatedIdentity', 'IdentityProvider', 'LabDomain', 'User', 'Workspace', 'Account']) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, prior.id);
      }
      await prisma.$executeRaw`DELETE FROM "Lab" WHERE id = ${prior.id}`;
    }
    await prisma.labDomain.deleteMany({ where: { hostname: HOST } });

    const lab = await prisma.lab.create({ data: { name: 'P7-7A3 SAML Lab', slug: SLUG }, select: { id: true } });
    const account = await prisma.account.create({ data: { name: `p7a3-acct-${randomUUID()}`, labId: lab.id } as any, select: { id: true } });
    const user = await prisma.user.create({ data: { labId: lab.id, accountId: account.id, email: `p7a3-${randomUUID()}@acceptance.test`, passwordHash: 'x', firstName: 'Saml', lastName: 'User', isActive: true }, select: { id: true } });
    await prisma.labDomain.create({ data: { labId: lab.id, hostname: HOST } });
    const provider = await prisma.identityProvider.create({
      data: { labId: lab.id, key: PROVIDER_KEY, displayName: 'Acceptance IdP', protocol: 'SAML', issuer: IDP_ENTITY_ID, samlSpEntityId: SP_ENTITY_ID, samlAcsUrl: ACS_URL, samlIdpSsoUrl: 'https://idp.acceptance.test/sso', samlWantAssertionsSigned: true, isEnabled: true },
      select: { id: true },
    });
    await prisma.samlIdpCertificate.create({ data: { labId: lab.id, identityProviderId: provider.id, pemCertificate: TEST_IDP_CERT_PEM, fingerprint: certificateFingerprint(TEST_IDP_CERT_PEM), status: 'ACTIVE' } });
    await prisma.federatedIdentity.create({ data: { labId: lab.id, identityProviderId: provider.id, externalSubject: LINKED_NAMEID, userId: user.id } });

    const fixtures = { labId: lab.id, providerId: provider.id, providerKey: PROVIDER_KEY, host: HOST, acsUrl: ACS_URL, spEntityId: SP_ENTITY_ID, idpEntityId: IDP_ENTITY_ID, linkedNameId: LINKED_NAMEID, userId: user.id };
    fs.mkdirSync(path.dirname(FIXTURES_OUT), { recursive: true });
    fs.writeFileSync(FIXTURES_OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded SAML acceptance fixtures → ${FIXTURES_OUT}`);
    console.log(`  lab=${lab.id} provider=${provider.id} (enabled SAML, 1 ACTIVE cert) linkedNameId=${LINKED_NAMEID}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('seed-saml-federation-acceptance FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
