/**
 * P5-4 Phase B Part 1B — isolated fixtures for the WORKER-ENABLED full-render gate.
 *
 * Seeds a record + two NON-super scoped principals:
 *   - pathologist P: record:view + record:change + wsi:review + wsi:publish + wsi:view
 *       (drives the full real path: upload → poll READY → authorized publish → authenticated render)
 *   - uploader U:    record:change + wsi:review  (NO wsi:publish, NO wsi:view)
 *       (proves upload confers no publish authority — a forced publish is a genuine 403)
 *
 * No slide/generation/asset is seeded: the WORKER produces the real generation from the uploaded fixture.
 * Fail-closed to an isolated acceptance/test DB. Deterministic reset.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const RENDER_LAB_SLUG = 'wsi-render-acceptance-lab';
const FIXTURES_OUT = process.env.RENDER_FIXTURES_OUT
  ? path.resolve(process.env.RENDER_FIXTURES_OUT)
  : path.resolve(__dirname, '../../web/acceptance/.render-fixtures.json');

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
    const prior = await prisma.lab.findUnique({ where: { slug: RENDER_LAB_SLUG }, select: { id: true } });
    if (prior) {
      const labId = prior.id;
      await prisma.$executeRaw`UPDATE "DigitalSlide" SET "publishedGenerationId" = NULL WHERE "labId" = ${labId}`;
      await prisma.$executeRaw`DELETE FROM "GenerationPublication" WHERE "labId" = ${labId}`;
      await prisma.$executeRaw`DELETE FROM "GenerationVerification" WHERE "labId" = ${labId}`;
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
    const roleWith = async (name: string, codes: string[]) => {
      const r = await prisma.role.upsert({ where: { name }, update: { isSuperRole: false }, create: { name, description: name, isSuperRole: false } });
      await prisma.rolePermission.deleteMany({ where: { roleId: r.id } });
      for (const c of codes) await prisma.rolePermission.create({ data: { roleId: r.id, permissionId: await permId(c) } });
      return r.id;
    };

    const lab = await prisma.lab.create({ data: { name: 'WSI Render Acceptance Lab', slug: RENDER_LAB_SLUG } });
    const account = await prisma.account.create({ data: { name: 'WSI Render Acceptance', labId: lab.id } });
    const workspace = await prisma.workspace.create({ data: { name: 'Global', labId: lab.id, accountId: account.id } });
    await prisma.labFeature.create({ data: { labId: lab.id, featureKey: 'WSI_VIEWER', tier: 5, isEnabled: true, enabledAt: new Date() } });

    const pathRole = await roleWith('WSI Render Pathologist', ['record:view', 'record:change', 'wsi:review', 'wsi:publish', 'wsi:view']);
    const upRole = await roleWith('WSI Render Uploader', ['record:change', 'wsi:review']); // NO publish, NO view

    const creds = {
      pathologist: { email: 'wsi.pathologist@render.test', password: 'RenderPath#2026aB' },
      uploader: { email: 'wsi.uploader2@render.test', password: 'RenderUpload#2026aB' },
    };
    const mkUser = async (email: string, password: string, first: string, roleId: string) => {
      const passwordHash = await argon2.hash(password);
      const u = await prisma.user.create({ data: { labId: lab.id, email, passwordHash, firstName: first, lastName: 'Acc', accountId: account.id, workspaceId: workspace.id, isActive: true, roles: { create: { roleId } } } });
      await prisma.passwordHistory.create({ data: { userId: u.id, hash: passwordHash } });
      return u.id;
    };
    await mkUser(creds.pathologist.email, creds.pathologist.password, 'Path', pathRole);
    await mkUser(creds.uploader.email, creds.uploader.password, 'Up2', upRole);

    const patient = await prisma.patient.create({ data: { labId: lab.id, registrationNo: randomUUID(), firstName: 'Render', lastName: 'Patient' } });
    const record = await prisma.record.create({ data: { labId: lab.id, identifier: `RN-${randomUUID().slice(0, 8)}`, patientId: patient.id } });

    const fixtures = { labId: lab.id, creds, recordId: record.id };
    fs.mkdirSync(path.dirname(FIXTURES_OUT), { recursive: true });
    fs.writeFileSync(FIXTURES_OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded WSI render acceptance fixtures → ${FIXTURES_OUT}`);
    console.log(`  record=${record.id} pathologist=${creds.pathologist.email} uploader=${creds.uploader.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('seed-wsi-render-acceptance FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
