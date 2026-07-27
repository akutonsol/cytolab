/**
 * P5-4 Phase B Part 1 — isolated WSI *upload* fixture seeder.
 *
 * Seeds ONE scoped, NON-super principal (record:change + wsi:review, but NOT wsi:publish) and a record to
 * upload into. The browser gate drives the real chunked-ingestion pipeline through the UI; publication
 * authority is deliberately withheld (no wsi:publish) so the gate can prove upload confers no publish power.
 *
 * Fail-closed to an isolated acceptance/test DB (same guard as the other WSI seeders). Deterministic reset.
 *
 * Usage: DATABASE_URL=postgres://…/<name-with-test-or-accept> ts-node apps/api/scripts/seed-wsi-upload-acceptance.ts
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const UPLOAD_LAB_SLUG = 'wsi-upload-acceptance-lab';
const FIXTURES_OUT = process.env.UPLOAD_FIXTURES_OUT
  ? path.resolve(process.env.UPLOAD_FIXTURES_OUT)
  : path.resolve(__dirname, '../../web/acceptance/.upload-fixtures.json');

function assertIsolatedAcceptanceDb(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required (isolated acceptance/test database).');
  let name: string;
  try { name = new URL(url).pathname.replace(/^\//, ''); } catch { throw new Error('DATABASE_URL is malformed.'); }
  if (!name) throw new Error('DATABASE_URL has no database name.');
  if (name === 'cytolab') throw new Error('Refusing the development database "cytolab".');
  if (!/(test|accept)/i.test(name)) throw new Error(`Refusing "${name}": an acceptance database name must contain "test" or "accept".`);
}

async function main() {
  assertIsolatedAcceptanceDb();
  const prisma = new PrismaClient();
  try {
    const prior = await prisma.lab.findUnique({ where: { slug: UPLOAD_LAB_SLUG }, select: { id: true } });
    if (prior) {
      const labId = prior.id;
      await prisma.$executeRaw`UPDATE "DigitalSlide" SET "publishedGenerationId" = NULL WHERE "labId" = ${labId}`;
      await prisma.$executeRaw`DELETE FROM "SlideAsset" WHERE "labId" = ${labId}`;
      await prisma.$executeRaw`DELETE FROM "DerivativeGeneration" WHERE "labId" = ${labId}`;
      await prisma.$executeRaw`DELETE FROM "SlideProcessingJob" WHERE "labId" = ${labId}`;
      await prisma.$executeRaw`DELETE FROM "SlideIngestion" WHERE "labId" = ${labId}`;
      await prisma.$executeRaw`DELETE FROM "SlideAnnotation" WHERE "labId" = ${labId}`;
      await prisma.$executeRaw`DELETE FROM "DigitalSlide" WHERE "labId" = ${labId}`;
      await prisma.$executeRaw`DELETE FROM "Record" WHERE "labId" = ${labId}`;
      await prisma.$executeRaw`DELETE FROM "Patient" WHERE "labId" = ${labId}`;
      await prisma.$executeRaw`DELETE FROM "UserRole" WHERE "userId" IN (SELECT id FROM "User" WHERE "labId" = ${labId})`;
      await prisma.$executeRaw`DELETE FROM "PasswordHistory" WHERE "userId" IN (SELECT id FROM "User" WHERE "labId" = ${labId})`;
      await prisma.$executeRaw`DELETE FROM "User" WHERE "labId" = ${labId}`;
      await prisma.$executeRaw`DELETE FROM "LabFeature" WHERE "labId" = ${labId}`;
      await prisma.$executeRaw`DELETE FROM "Workspace" WHERE "labId" = ${labId}`;
      await prisma.$executeRaw`DELETE FROM "Account" WHERE "labId" = ${labId}`;
      await prisma.$executeRaw`DELETE FROM "Lab" WHERE id = ${labId}`;
    }

    const permId = async (code: string) => (await prisma.permission.findUniqueOrThrow({ where: { code } })).id;

    const lab = await prisma.lab.create({ data: { name: 'WSI Upload Acceptance Lab', slug: UPLOAD_LAB_SLUG } });
    const account = await prisma.account.create({ data: { name: 'WSI Upload Acceptance', labId: lab.id } });
    const workspace = await prisma.workspace.create({ data: { name: 'Global', labId: lab.id, accountId: account.id } });
    await prisma.labFeature.create({ data: { labId: lab.id, featureKey: 'WSI_VIEWER', tier: 5, isEnabled: true, enabledAt: new Date() } });

    // Uploader: record:change (upload) + wsi:review (see truthful lifecycle) but NO wsi:publish (no publish authority).
    const role = await prisma.role.upsert({ where: { name: 'WSI Acceptance Uploader' }, update: { isSuperRole: false }, create: { name: 'WSI Acceptance Uploader', description: 'record:view + record:change + wsi:review (no publish)', isSuperRole: false } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const c of ['record:view', 'record:change', 'wsi:review']) await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: await permId(c) } });

    const creds = { uploader: { email: 'wsi.uploader@acceptance.test', password: 'AcceptUpload#2026aB' } };
    const passwordHash = await argon2.hash(creds.uploader.password);
    const user = await prisma.user.create({ data: { labId: lab.id, email: creds.uploader.email, passwordHash, firstName: 'Up', lastName: 'Loader', accountId: account.id, workspaceId: workspace.id, isActive: true, roles: { create: { roleId: role.id } } } });
    await prisma.passwordHistory.create({ data: { userId: user.id, hash: passwordHash } });

    const patient = await prisma.patient.create({ data: { labId: lab.id, registrationNo: randomUUID(), firstName: 'Up', lastName: 'Patient' } });
    const record = await prisma.record.create({ data: { labId: lab.id, identifier: `UP-${randomUUID().slice(0, 8)}`, patientId: patient.id } });

    const fixtures = { labId: lab.id, creds, recordId: record.id };
    fs.mkdirSync(path.dirname(FIXTURES_OUT), { recursive: true });
    fs.writeFileSync(FIXTURES_OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded WSI upload acceptance fixtures → ${FIXTURES_OUT}`);
    console.log(`  record=${record.id} uploader=${creds.uploader.email} (record:change + wsi:review, NO wsi:publish)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('seed-wsi-upload-acceptance FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
