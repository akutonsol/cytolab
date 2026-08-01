/**
 * Program 7 · Phase 7B.2 — isolated fixtures for the Staff Invitations acceptance gate. One lab + account; the assert
 * drives the real StaffInvitationService (issue/accept/cancel) against DB truth. No PHI/secret persisted. Guarded.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';

const SLUG = 'p7-7b2-invitations-acceptance-lab';
const OUT = process.env.INVITATION_FIXTURES_OUT ? path.resolve(process.env.INVITATION_FIXTURES_OUT) : path.resolve(__dirname, '../../web/acceptance/.invitation-fixtures.json');

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
      for (const t of ['StaffInvitation', 'IdentityLifecycleEvent', 'User', 'Workspace', 'Account']) await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, prior.id);
      await prisma.$executeRaw`DELETE FROM "Lab" WHERE id = ${prior.id}`;
    }
    const labId = (await prisma.lab.create({ data: { name: 'P7-7B2 Invitations Lab', slug: SLUG }, select: { id: true } })).id;
    await prisma.account.create({ data: { name: `p7b2-acct-${randomUUID()}`, labId } as any });
    const fixtures = { labId };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded staff-invitations fixtures → ${OUT}`);
    console.log(`  lab=${labId} (+account)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('seed-staff-invitations-acceptance FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
