/**
 * Program 7 · Phase 7B.3 — isolated fixtures for the SCIM Users acceptance gate. One lab + account + a SCIM connector
 * ServicePrincipal (the machine identity that owns the mapping provenance FK). The assert drives the REAL
 * ScimUsersService (create/get/list/replace/patch/delete) against DB truth. No PHI/secret persisted. Guarded.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';

const SLUG = 'p7-7b3-scim-acceptance-lab';
const OUT = process.env.SCIM_FIXTURES_OUT ? path.resolve(process.env.SCIM_FIXTURES_OUT) : path.resolve(__dirname, '../../web/acceptance/.scim-fixtures.json');

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
      for (const t of ['ScimUserMapping', 'IdentityLifecycleEvent', 'UserSession', 'RefreshToken', 'FederatedIdentity', 'StaffInvitation', 'UserRole', 'ServicePrincipalScope', 'ServicePrincipalCredential', 'ServicePrincipal', 'User', 'Workspace', 'Account']) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, prior.id).catch(() => undefined);
      }
      await prisma.$executeRaw`DELETE FROM "Lab" WHERE id = ${prior.id}`;
    }
    const labId = (await prisma.lab.create({ data: { name: 'P7-7B3 SCIM Lab', slug: SLUG }, select: { id: true } })).id;
    await prisma.account.create({ data: { name: `p7b3-acct-${randomUUID()}`, labId } as any });
    // The SCIM connector machine identity (7A.2b ServicePrincipal) — provenance for ScimUserMapping.servicePrincipalId.
    const sp = await prisma.servicePrincipal.create({ data: { labId, key: `scim-connector-${randomUUID()}`, displayName: 'SCIM Connector (acceptance)' }, select: { id: true } });
    const fixtures = { labId, servicePrincipalId: sp.id };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded SCIM fixtures → ${OUT}`);
    console.log(`  lab=${labId} servicePrincipal=${sp.id} (+account)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('seed-scim-users-acceptance FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
