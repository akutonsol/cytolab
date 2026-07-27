/**
 * P5-5 — isolated fixtures for the slide-discovery (metadata & indexing / search) gate.
 *
 * Seeds TWO labs. Lab A gets a scoped searcher principal (record:view ONLY — NOT wsi:view, so the gate can
 * prove discovery ≠ image-delivery authority) and a deterministic slide set:
 *   - one slide in each truthful lifecycle state: DRAFT / PROCESSING / READY / QC_FAILED / PUBLISHED
 *     (states are built from real generation rows, not fabricated), with distinctive search attributes;
 *   - filler DRAFT slides to make the lab total exactly 25 (for deterministic pagination), each with a
 *     spaced `uploadedAt` for deterministic newest/oldest ordering.
 * Lab B gets one slide with globally-unique patient/stain tokens — Lab A must never discover it.
 *
 * No object-store artifacts (search is metadata-only). Fail-closed to an isolated acceptance/test DB.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const SLUG_A = 'wsi-search-acceptance-lab-a';
const SLUG_B = 'wsi-search-acceptance-lab-b';
const FIXTURES_OUT = process.env.SEARCH_FIXTURES_OUT ? path.resolve(process.env.SEARCH_FIXTURES_OUT) : path.resolve(__dirname, '../../web/acceptance/.search-fixtures.json');
const hex = (c: string) => c.repeat(64);

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
    }
    const permId = async (code: string) => (await prisma.permission.findUniqueOrThrow({ where: { code } })).id;

    const mkLab = async (slug: string, name: string) => {
      const lab = await prisma.lab.create({ data: { name, slug } });
      const account = await prisma.account.create({ data: { name, labId: lab.id } });
      const workspace = await prisma.workspace.create({ data: { name: 'Global', labId: lab.id, accountId: account.id } });
      await prisma.labFeature.create({ data: { labId: lab.id, featureKey: 'WSI_VIEWER', tier: 5, isEnabled: true, enabledAt: new Date() } });
      return { lab, account, workspace };
    };

    type Ctx = Awaited<ReturnType<typeof mkLab>>;
    const mkSlide = async (c: Ctx, o: { first: string; last: string; stain?: string; scanner?: string; format?: string; tileSourceType?: any; uploadedAt: Date; magnification?: string }) => {
      const patient = await prisma.patient.create({ data: { labId: c.lab.id, registrationNo: randomUUID(), firstName: o.first, lastName: o.last } });
      const record = await prisma.record.create({ data: { labId: c.lab.id, identifier: `AC-${randomUUID().slice(0, 8)}`, labNumber: `LN-${randomUUID().slice(0, 6)}`, patientId: patient.id } });
      const slide = await prisma.digitalSlide.create({
        data: { labId: c.lab.id, recordId: record.id, slideUrl: '', sourceKind: 'UPLOAD', availabilityStatus: 'DRAFT', uploadedAt: o.uploadedAt,
          stain: o.stain ?? null, scanner: o.scanner ?? null, format: o.format ?? 'image', tileSourceType: o.tileSourceType ?? null, magnification: o.magnification ?? null } as never,
        select: { id: true },
      });
      return slide.id;
    };
    const gen = async (labId: string, slideId: string, status: string, opts: { sealed?: boolean; verified?: boolean } = {}) => {
      const ing = await prisma.slideIngestion.create({ data: { labId, slideId, sourceKind: 'UPLOAD', status: 'VERIFIED', sourceObjectKey: `k-${randomUUID()}`, sourceChecksum: hex('c') } });
      const job = await prisma.slideProcessingJob.create({ data: { labId, ingestionId: ing.id, status: 'SUCCEEDED', workerId: 'w', attempt: 1 } as never });
      return (await prisma.derivativeGeneration.create({ data: { labId, slideId, jobId: job.id, tileSourceType: 'DZI', status: status as never, sealed: opts.sealed ?? false, verified: opts.verified ?? false, derivativeManifestChecksum: opts.sealed ? hex('a') : null } as never })).id;
    };

    const A = await mkLab(SLUG_A, 'WSI Search Lab A');
    const B = await mkLab(SLUG_B, 'WSI Search Lab B');

    // Searcher: record:view ONLY (no wsi:view) — discovery must not confer image-delivery authority.
    const role = await prisma.role.upsert({ where: { name: 'WSI Search Searcher' }, update: { isSuperRole: false }, create: { name: 'WSI Search Searcher', description: 'record:view only', isSuperRole: false } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: await permId('record:view') } });
    const creds = { searcher: { email: 'wsi.searcher@acceptance.test', password: 'AcceptSearch#2026aB' } };
    const passwordHash = await argon2.hash(creds.searcher.password);
    const u = await prisma.user.create({ data: { labId: A.lab.id, email: creds.searcher.email, passwordHash, firstName: 'Search', lastName: 'Er', accountId: A.account.id, workspaceId: A.workspace.id, isActive: true, roles: { create: { roleId: role.id } } } });
    await prisma.passwordHistory.create({ data: { userId: u.id, hash: passwordHash } });

    const base = new Date('2026-07-01T00:00:00.000Z').getTime();
    const at = (i: number) => new Date(base + i * 60_000); // spaced 1 min apart → deterministic order

    // ── the five lifecycle exemplars (distinctive attributes) ──
    const sDraft = await mkSlide(A, { first: 'Draftford', last: 'Alpha', stain: 'H&E', scanner: 'Aperio AT2', format: 'dzi', tileSourceType: 'DZI', uploadedAt: at(30) });
    const sProcessing = await mkSlide(A, { first: 'Procter', last: 'Beta', stain: 'Pap', scanner: 'Hamamatsu', format: 'dzi', tileSourceType: 'DZI', uploadedAt: at(31) });
    await gen(A.lab.id, sProcessing, 'PROCESSING', { sealed: false, verified: false });
    const sReady = await mkSlide(A, { first: 'Readwell', last: 'Gamma', stain: 'IHC', scanner: 'Leica', format: 'svs', tileSourceType: 'DZI', uploadedAt: at(32) });
    await gen(A.lab.id, sReady, 'READY', { sealed: true, verified: true });
    const sQc = await mkSlide(A, { first: 'Failraz', last: 'Delta', stain: 'GMS', scanner: 'Aperio AT2', format: 'tiff', tileSourceType: 'DZI', uploadedAt: at(33) });
    await gen(A.lab.id, sQc, 'QC_FAILED', { sealed: true, verified: false });
    const sPublished = await mkSlide(A, { first: 'Pubgood', last: 'Epsilon', stain: 'H&E', scanner: 'Leica', format: 'dzi', tileSourceType: 'DICOMWEB', uploadedAt: at(34) });
    const pubGen = await gen(A.lab.id, sPublished, 'PUBLISHED', { sealed: true, verified: true });
    await prisma.digitalSlide.update({ where: { id: sPublished }, data: { publishedGenerationId: pubGen, availabilityStatus: 'PUBLISHED', publishedAt: new Date() } });

    // A slide with a globally-unique patient name for exact search-correctness.
    const sUnique = await mkSlide(A, { first: 'Xylophone', last: 'Uniquename', stain: 'ZEBRASTAIN', scanner: 'ZEBRASCAN', format: 'ndpi', tileSourceType: 'IIIF', uploadedAt: at(35) });

    // Filler DRAFT slides to reach exactly 25 in Lab A (25 = 20 + 5 for two-page pagination at pageSize 20).
    const already = 6; // sDraft, sProcessing, sReady, sQc, sPublished, sUnique
    for (let i = 0; i < 25 - already; i++) {
      await mkSlide(A, { first: `Filler${i}`, last: 'Bulk', stain: 'H&E', scanner: 'Aperio AT2', format: 'image', uploadedAt: at(i) });
    }

    // Lab B — must be invisible to Lab A.
    await mkSlide(B, { first: 'ZzcrosslabPatient', last: 'Otherlab', stain: 'CROSSLABSTAIN', scanner: 'OtherScanner', format: 'dzi', uploadedAt: at(100) });

    const fixtures = {
      labAId: A.lab.id, labBId: B.lab.id, creds,
      totalA: 25,
      slides: { draft: sDraft, processing: sProcessing, ready: sReady, qcFailed: sQc, published: sPublished, unique: sUnique },
      search: { uniquePatient: 'Xylophone', uniqueStainFilter: 'ZEBRASTAIN' },
      crossLab: { patient: 'ZzcrosslabPatient', stain: 'CROSSLABSTAIN' },
    };
    fs.mkdirSync(path.dirname(FIXTURES_OUT), { recursive: true });
    fs.writeFileSync(FIXTURES_OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded WSI search acceptance fixtures → ${FIXTURES_OUT}`);
    console.log(`  labA=${A.lab.id} (25 slides) labB=${B.lab.id} searcher=${creds.searcher.email} (record:view only)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('seed-wsi-search-acceptance FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
