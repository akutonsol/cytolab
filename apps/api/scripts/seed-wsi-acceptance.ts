/**
 * P5-6.4 rendered-acceptance — isolated WSI fixture seeder.
 *
 * Committed, reproducible test tooling. Seeds two NON-super scoped principals and the slide/generation
 * fixtures the browser gate needs, into an ISOLATED acceptance/test database ONLY. It FAILS CLOSED before
 * any write unless DATABASE_URL is present, well-formed, not the dev database, and satisfies the
 * acceptance/test naming rule. It is deterministic/re-runnable: it wipes any prior acceptance lab (by a
 * fixed slug) before re-seeding, so fixtures never accumulate.
 *
 * Prereq (a separate CI step): the permission catalog + default roles must already be seeded
 * (`prisma db seed`) so wsi:review / wsi:publish / record:view exist.
 *
 * Usage: DATABASE_URL=postgres://…/<name-with-test-or-accept> ts-node apps/api/scripts/seed-wsi-acceptance.ts
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const ACCEPTANCE_LAB_SLUG = 'wsi-acceptance-lab';
const FIXTURES_OUT = process.env.ACCEPTANCE_FIXTURES_OUT
  ? path.resolve(process.env.ACCEPTANCE_FIXTURES_OUT)
  : path.resolve(__dirname, '../../web/acceptance/.fixtures.json');

/** Fail closed: only ever touch a database whose name marks it isolated (contains "test" or "accept") and
 *  is not the dev database. Throws BEFORE any client is constructed / any write occurs. */
function assertIsolatedAcceptanceDb(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required (isolated acceptance/test database).');
  let name: string;
  let host: string;
  try {
    const u = new URL(url);
    name = u.pathname.replace(/^\//, '');
    host = u.hostname;
  } catch {
    throw new Error('DATABASE_URL is malformed.');
  }
  if (!name) throw new Error('DATABASE_URL has no database name.');
  if (name === 'cytolab') throw new Error('Refusing the development database "cytolab".');
  if (!/(test|accept)/i.test(name)) {
    throw new Error(`Refusing "${name}": an acceptance database name must contain "test" or "accept".`);
  }
  // host is advisory; the name marker is the authoritative isolation gate (CI Postgres services vary).
  void host;
}

const hex = (c: string) => c.repeat(64);

async function main() {
  assertIsolatedAcceptanceDb(); // <-- fail closed before any write
  const prisma = new PrismaClient();
  try {
    // ── deterministic reset: remove any prior acceptance lab + its tenant data (FK-safe order) ──
    const prior = await prisma.lab.findUnique({ where: { slug: ACCEPTANCE_LAB_SLUG }, select: { id: true } });
    if (prior) {
      const labId = prior.id;
      await prisma.$executeRaw`DELETE FROM "GenerationPublication" WHERE "labId" = ${labId}`;
      await prisma.$executeRaw`DELETE FROM "GenerationVerification" WHERE "labId" = ${labId}`;
      await prisma.$executeRaw`UPDATE "DigitalSlide" SET "publishedGenerationId" = NULL WHERE "labId" = ${labId}`;
      await prisma.$executeRaw`DELETE FROM "SlideAsset" WHERE "labId" = ${labId}`;
      await prisma.$executeRaw`DELETE FROM "DerivativeGeneration" WHERE "labId" = ${labId}`;
      await prisma.$executeRaw`DELETE FROM "SlideProcessingJob" WHERE "labId" = ${labId}`;
      await prisma.$executeRaw`DELETE FROM "SlideIngestion" WHERE "labId" = ${labId}`;
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

    // ── tenant + feature ──
    const lab = await prisma.lab.create({ data: { name: 'WSI Acceptance Lab', slug: ACCEPTANCE_LAB_SLUG } });
    const account = await prisma.account.create({ data: { name: 'WSI Acceptance', labId: lab.id } });
    const workspace = await prisma.workspace.create({ data: { name: 'Global', labId: lab.id, accountId: account.id } });
    await prisma.labFeature.create({ data: { labId: lab.id, featureKey: 'WSI_VIEWER', tier: 5, isEnabled: true, enabledAt: new Date() } });

    // ── NON-super scoped roles: reviewer lacks wsi:publish; publisher has review+publish ──
    const reviewerRole = await roleWith('WSI Acceptance Reviewer', ['record:view', 'wsi:review']);
    const publisherRole = await roleWith('WSI Acceptance Publisher', ['record:view', 'wsi:review', 'wsi:publish']);

    const creds = {
      reviewer: { email: 'wsi.reviewer@acceptance.test', password: 'AcceptReview#2026aB' },
      publisher: { email: 'wsi.publisher@acceptance.test', password: 'AcceptPublish#2026aB' },
    };
    const mkUser = async (email: string, password: string, first: string, last: string, roleId: string) => {
      const passwordHash = await argon2.hash(password);
      const u = await prisma.user.create({
        data: { labId: lab.id, email, passwordHash, firstName: first, lastName: last, accountId: account.id, workspaceId: workspace.id, isActive: true, roles: { create: { roleId } } },
      });
      await prisma.passwordHistory.create({ data: { userId: u.id, hash: passwordHash } });
      return u.id;
    };
    await mkUser(creds.reviewer.email, creds.reviewer.password, 'Rev', 'Only', reviewerRole);
    await mkUser(creds.publisher.email, creds.publisher.password, 'Pub', 'Lisher', publisherRole);

    // ── fixture builders ──
    const newSlide = async () => {
      const patient = await prisma.patient.create({ data: { labId: lab.id, registrationNo: randomUUID(), firstName: 'Acc', lastName: 'Patient' } });
      const record = await prisma.record.create({ data: { labId: lab.id, identifier: randomUUID(), patientId: patient.id } });
      return (await prisma.digitalSlide.create({ data: { labId: lab.id, recordId: record.id, slideUrl: '', availabilityStatus: 'DRAFT', sourceKind: 'UPLOAD' } })).id;
    };
    const gen = async (slideId: string, status: string, opts: { sealed?: boolean; verified?: boolean; createdAt?: Date } = {}) => {
      const ing = await prisma.slideIngestion.create({ data: { labId: lab.id, slideId, sourceKind: 'UPLOAD', status: 'VERIFIED', sourceObjectKey: `k-${randomUUID()}`, sourceChecksum: hex('c') } });
      const job = await prisma.slideProcessingJob.create({ data: { labId: lab.id, ingestionId: ing.id, status: 'SUCCEEDED', workerId: 'w', attempt: 1 } as never });
      return (await prisma.derivativeGeneration.create({
        data: {
          labId: lab.id, slideId, jobId: job.id, tileSourceType: 'DZI', status: status as never,
          sealed: opts.sealed ?? false, verified: opts.verified ?? false,
          derivativeManifestChecksum: opts.sealed ? hex('a') : null, tiledWidth: 1024, tiledHeight: 768, tileSize: 256, levelCount: 3,
          sealedAt: opts.sealed ? new Date() : null, verifiedAt: opts.verified ? new Date() : null, ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
        } as never,
      })).id;
    };
    const pubEvent = async (slideId: string, publishedGenId: string, at: Date, supersededGenId?: string) => {
      const publicationEventId = randomUUID();
      await prisma.generationPublication.create({ data: { publicationEventId, labId: lab.id, slideId, generationId: publishedGenId, action: 'PUBLISHED', actorUserId: null, at } });
      if (supersededGenId) await prisma.generationPublication.create({ data: { publicationEventId, labId: lab.id, slideId, generationId: supersededGenId, action: 'SUPERSEDED', actorUserId: null, at } });
    };

    // S1 — publish-flow slide: PUBLISHED (current live) + READY (to publish) + QC_FAILED (real verdict)
    const s1 = await newSlide();
    const s1Published = await gen(s1, 'PUBLISHED', { sealed: true, verified: true, createdAt: new Date(Date.now() - 3 * 3600e3) });
    const s1Ready = await gen(s1, 'READY', { sealed: true, verified: true, createdAt: new Date(Date.now() - 3600e3) });
    const s1QcFailed = await gen(s1, 'QC_FAILED', { sealed: true, verified: false, createdAt: new Date(Date.now() - 2 * 3600e3) });
    await prisma.generationVerification.create({
      data: {
        labId: lab.id, generationId: s1QcFailed, outcome: 'FAILED',
        reasons: [
          { code: 'LEVEL_DIGEST_MISMATCH', detail: 'level 2 tile digest differs from the sealed manifest' },
          { code: 'MANIFEST_CHECKSUM_MISMATCH', detail: 'recomputed manifest checksum does not match the sealed value' },
        ] as never,
        manifestChecksum: hex('a'), verifierVersion: 'accept-v1', verifiedAt: new Date(Date.now() - 2 * 3600e3),
      },
    });
    await prisma.digitalSlide.update({ where: { id: s1 }, data: { publishedGenerationId: s1Published, availabilityStatus: 'PUBLISHED', publishedAt: new Date(Date.now() - 3 * 3600e3) } });
    await pubEvent(s1, s1Published, new Date(Date.now() - 3 * 3600e3));

    // S2 — DIVERGENT: pointer → a non-PUBLISHED (QC_PENDING) generation, PLUS a READY generation so the
    // gate can prove the LOCKOUT (a normally-publishable READY row whose Publish is disabled), not just the banner.
    const s2 = await newSlide();
    const s2Divergent = await gen(s2, 'QC_PENDING', { sealed: true, verified: false });
    const s2Ready = await gen(s2, 'READY', { sealed: true, verified: true });
    await prisma.$executeRawUnsafe(`UPDATE "DigitalSlide" SET "publishedGenerationId" = $1, "availabilityStatus" = 'PUBLISHED' WHERE id = $2`, s2Divergent, s2);

    // S3 — 25-event paginated publication history
    const s3 = await newSlide();
    let prev: string | null = null;
    let s3Current: string | null = null;
    for (let i = 0; i < 25; i++) {
      const g = await gen(s3, i === 24 ? 'PUBLISHED' : 'SUPERSEDED', { sealed: true, verified: true, createdAt: new Date(Date.now() - (25 - i) * 60000) });
      await pubEvent(s3, g, new Date(Date.now() - (25 - i) * 60000), prev ?? undefined);
      prev = g;
      s3Current = g;
    }
    await prisma.digitalSlide.update({ where: { id: s3 }, data: { publishedGenerationId: s3Current, availabilityStatus: 'PUBLISHED' } });

    const fixtures = {
      labId: lab.id,
      creds,
      slides: { publishFlow: s1, divergent: s2, paginated: s3 },
      gens: { s1Published, s1Ready, s1QcFailed, s2Divergent, s2Ready },
    };
    fs.mkdirSync(path.dirname(FIXTURES_OUT), { recursive: true });
    fs.writeFileSync(FIXTURES_OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded WSI acceptance fixtures → ${FIXTURES_OUT}`);
    console.log(`  slides: publishFlow=${s1} divergent=${s2} paginated=${s3}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('seed-wsi-acceptance FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
