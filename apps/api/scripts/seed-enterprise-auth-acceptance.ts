/**
 * Program 7 · Phase 7A.1 — isolated fixtures for the enterprise-authentication acceptance gate.
 *
 * Seeds two labs, each with a human User; lab A additionally gets an (inert) IdentityProvider, a ServicePrincipal (the
 * non-human class), and a FederatedIdentity linking the provider's external subject to the human User. This lets the
 * assertion exercise: lab scoping + cross-lab fail-closed; stable identifiers (GG7); the human/non-human principal
 * classes; federated linkage → canonical human principal; and the provider-isolation seam. No secrets/PHI. Guarded to
 * refuse a non-isolated database.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';

const SLUG_A = 'p7-7a-acceptance-lab-a';
const SLUG_B = 'p7-7a-acceptance-lab-b';
const FIXTURES_OUT = process.env.ENTERPRISE_AUTH_FIXTURES_OUT
  ? path.resolve(process.env.ENTERPRISE_AUTH_FIXTURES_OUT)
  : path.resolve(__dirname, '../../web/acceptance/.enterprise-auth-fixtures.json');
const EXTERNAL_SUBJECT = 'ext-subject-p7-7a-001';

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
        for (const t of ['FederatedIdentity', 'ServicePrincipal', 'IdentityProvider', 'User', 'Account']) {
          await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, prior.id);
        }
        await prisma.$executeRaw`DELETE FROM "Lab" WHERE id = ${prior.id}`;
      }
    }
    const mkLab = async (slug: string, name: string) => (await prisma.lab.create({ data: { name, slug }, select: { id: true } })).id;
    const mkUser = async (labId: string, accountId: string) => (await prisma.user.create({ data: { labId, accountId, email: `u-${randomUUID()}@t.test`, passwordHash: 'x', firstName: 'H', lastName: 'P' }, select: { id: true } })).id;

    const A = await mkLab(SLUG_A, 'P7-7A Enterprise Auth Acceptance Lab A');
    const B = await mkLab(SLUG_B, 'P7-7A Enterprise Auth Acceptance Lab B');
    const accA = (await prisma.account.create({ data: { labId: A, name: 'p7-acct-a' }, select: { id: true } })).id;
    const accB = (await prisma.account.create({ data: { labId: B, name: 'p7-acct-b' }, select: { id: true } })).id;
    const userA = await mkUser(A, accA);
    const userB = await mkUser(B, accB);
    const providerA = await prisma.identityProvider.create({ data: { labId: A, key: 'idp-a', displayName: 'Acme OIDC', protocol: 'OIDC', isEnabled: false }, select: { id: true } });
    const providerB = await prisma.identityProvider.create({ data: { labId: B, key: 'idp-b', displayName: 'Beta SAML', protocol: 'SAML', isEnabled: false }, select: { id: true } });
    const sp = await prisma.servicePrincipal.create({ data: { labId: A, key: 'svc-a', displayName: 'Robot A', isActive: true }, select: { id: true } });
    await prisma.federatedIdentity.create({ data: { labId: A, identityProviderId: providerA.id, externalSubject: EXTERNAL_SUBJECT, userId: userA } });

    const fixtures = { labAId: A, labBId: B, userAId: userA, userBId: userB, providerAId: providerA.id, providerBId: providerB.id, servicePrincipalAId: sp.id, externalSubject: EXTERNAL_SUBJECT };
    fs.mkdirSync(path.dirname(FIXTURES_OUT), { recursive: true });
    fs.writeFileSync(FIXTURES_OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded enterprise-auth fixtures → ${FIXTURES_OUT}`);
    console.log(`  labA=${A} (user + inert OIDC provider + service principal + federated link) labB=${B}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('seed-enterprise-auth-acceptance FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
