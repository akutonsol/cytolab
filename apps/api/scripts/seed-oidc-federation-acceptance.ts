/**
 * Program 7 · Phase 7A.2a — isolated fixtures for the OIDC federation acceptance gate.
 *
 * Two labs; lab A gets a human User, an ENABLED OIDC IdentityProvider (public-client config: issuer + clientId +
 * redirectUri), a FederatedIdentity linking a stable external subject → the User, and a ServicePrincipal. This lets the
 * assertion exercise the transaction lifecycle, the configuration-immutability invariant, persisted concurrent
 * consumption, and the additive-schema / ET checks against real DB truth. No secrets/PHI. Guarded to refuse a
 * non-isolated database.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';

const SLUG_A = 'p7-7a2a-oidc-acceptance-lab-a';
const SLUG_B = 'p7-7a2a-oidc-acceptance-lab-b';
const ISS = 'https://idp.acceptance.test';
const CLIENT_ID = 'client-acceptance';
const REDIRECT_URI = 'https://app.acceptance.test/enterprise-auth/oidc/callback';
const EXTERNAL_SUBJECT = 'ext-subject-p7-7a2a-001';
const FIXTURES_OUT = process.env.OIDC_FEDERATION_FIXTURES_OUT
  ? path.resolve(process.env.OIDC_FEDERATION_FIXTURES_OUT)
  : path.resolve(__dirname, '../../web/acceptance/.oidc-federation-fixtures.json');

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
    for (const slug of [SLUG_A, SLUG_B]) {
      const prior = await prisma.lab.findUnique({ where: { slug }, select: { id: true } });
      if (prior) {
        for (const t of ['OidcAuthTransaction', 'FederatedIdentity', 'ServicePrincipal', 'IdentityProvider', 'User', 'Account']) {
          await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, prior.id);
        }
        await prisma.$executeRaw`DELETE FROM "Lab" WHERE id = ${prior.id}`;
      }
    }
    const A = (await prisma.lab.create({ data: { name: 'P7-7A2a OIDC Acceptance Lab A', slug: SLUG_A }, select: { id: true } })).id;
    const B = (await prisma.lab.create({ data: { name: 'P7-7A2a OIDC Acceptance Lab B', slug: SLUG_B }, select: { id: true } })).id;
    const accA = (await prisma.account.create({ data: { labId: A, name: 'p7-oidc-acct-a' }, select: { id: true } })).id;
    const userA = (await prisma.user.create({ data: { labId: A, accountId: accA, email: `u-${randomUUID()}@t.test`, passwordHash: 'x', firstName: 'H', lastName: 'P' }, select: { id: true } })).id;
    const provider = await prisma.identityProvider.create({ data: { labId: A, key: 'idp-oidc', displayName: 'Acceptance OIDC', protocol: 'OIDC', issuer: ISS, clientId: CLIENT_ID, redirectUri: REDIRECT_URI, isEnabled: true }, select: { id: true } });
    await prisma.federatedIdentity.create({ data: { labId: A, identityProviderId: provider.id, externalSubject: EXTERNAL_SUBJECT, userId: userA } });
    await prisma.servicePrincipal.create({ data: { labId: A, key: 'svc-oidc', displayName: 'Robot', isActive: true } });

    const fixtures = { labAId: A, labBId: B, userAId: userA, providerAId: provider.id, issuer: ISS, clientId: CLIENT_ID, redirectUri: REDIRECT_URI, externalSubject: EXTERNAL_SUBJECT };
    fs.mkdirSync(path.dirname(FIXTURES_OUT), { recursive: true });
    fs.writeFileSync(FIXTURES_OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded OIDC federation fixtures → ${FIXTURES_OUT}`);
    console.log(`  labA=${A} (user + ENABLED OIDC provider + federated link + service principal) labB=${B}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('seed-oidc-federation-acceptance FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
