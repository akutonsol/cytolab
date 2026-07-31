/**
 * Program 7 · Phase 7B.1 — isolated fixtures for the Identity Lifecycle Core acceptance gate.
 *
 * One lab with users across lifecycle states: an ACTIVE user with an active session + refresh token + a federated link
 * (to prove coordinated deprovision effects), plus INVITED / PROVISIONED / SUSPENDED users (to exercise the transition
 * matrix + the deterministic state↔isActive mapping). No PHI/secret persisted. Guarded to refuse a non-isolated DB.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';

const SLUG = 'p7-7b1-lifecycle-acceptance-lab';
const FIXTURES_OUT = process.env.LIFECYCLE_FIXTURES_OUT
  ? path.resolve(process.env.LIFECYCLE_FIXTURES_OUT)
  : path.resolve(__dirname, '../../web/acceptance/.lifecycle-fixtures.json');

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
      await prisma.$executeRawUnsafe('DELETE FROM "IdentityLifecycleEvent" WHERE "labId" = $1', prior.id);
      await prisma.$executeRawUnsafe('DELETE FROM "FederatedIdentity" WHERE "labId" = $1', prior.id);
      await prisma.$executeRawUnsafe('DELETE FROM "IdentityProvider" WHERE "labId" = $1', prior.id);
      await prisma.$executeRawUnsafe('DELETE FROM "UserSession" WHERE "userId" IN (SELECT id FROM "User" WHERE "labId" = $1)', prior.id);
      await prisma.$executeRawUnsafe('DELETE FROM "RefreshToken" WHERE "userId" IN (SELECT id FROM "User" WHERE "labId" = $1)', prior.id);
      for (const t of ['User', 'Workspace', 'Account']) await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, prior.id);
      await prisma.$executeRaw`DELETE FROM "Lab" WHERE id = ${prior.id}`;
    }
    const labId = (await prisma.lab.create({ data: { name: 'P7-7B1 Lifecycle Lab', slug: SLUG }, select: { id: true } })).id;
    const account = (await prisma.account.create({ data: { name: `p7b1-acct-${randomUUID()}`, labId } as any, select: { id: true } })).id;
    const mk = async (state: 'ACTIVE' | 'INVITED' | 'PROVISIONED' | 'SUSPENDED') =>
      (await prisma.user.create({ data: { labId, accountId: account, email: `p7b1-${randomUUID()}@acceptance.test`, passwordHash: 'x', firstName: 'L', lastName: state, isActive: state === 'ACTIVE', lifecycleState: state }, select: { id: true } })).id;

    const activeUserId = await mk('ACTIVE');
    const invitedUserId = await mk('INVITED');
    const provisionedUserId = await mk('PROVISIONED');
    const suspendedUserId = await mk('SUSPENDED');

    // Give the ACTIVE user an active session + refresh + a federated link, to prove coordinated deprovision effects.
    await prisma.userSession.create({ data: { userId: activeUserId, deviceId: 'acc-d1', ipAddress: '127.0.0.1', expiresAt: new Date(Date.now() + 3600_000) } });
    await prisma.refreshToken.create({ data: { userId: activeUserId, token: `acc-${randomUUID()}`, deviceId: 'acc-d1', ipAddress: '127.0.0.1', expiresAt: new Date(Date.now() + 3600_000) } });
    const idp = await prisma.identityProvider.create({ data: { labId, key: `acc-idp-${randomUUID()}`, displayName: 'Acc IdP', protocol: 'OIDC' }, select: { id: true } });
    await prisma.federatedIdentity.create({ data: { labId, identityProviderId: idp.id, externalSubject: 'acc-subject', userId: activeUserId } });

    const fixtures = { labId, activeUserId, invitedUserId, provisionedUserId, suspendedUserId, identityProviderId: idp.id };
    fs.mkdirSync(path.dirname(FIXTURES_OUT), { recursive: true });
    fs.writeFileSync(FIXTURES_OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded identity-lifecycle fixtures → ${FIXTURES_OUT}`);
    console.log(`  lab=${labId} active=${activeUserId}(+session+refresh+link) invited=${invitedUserId} provisioned=${provisionedUserId} suspended=${suspendedUserId}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('seed-identity-lifecycle-acceptance FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
