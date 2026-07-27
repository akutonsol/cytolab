/**
 * P5-7 — isolated fixtures for case & specimen integration (specimen-anchored slides in the workspaces).
 *
 * Seeds:
 *   Lab A
 *     Record A  — specimens S1 (CERV_SCRAP, labelled) + S2 (PLEURAL_FLD, labelled)
 *        · S1: one PUBLISHED slide (real DZI — proves viewability is unaffected by grouping) + one READY
 *              (unpublished, NOT viewable) slide
 *        · S2: one READY slide
 *        · one NULL-specimen slide (genuinely record-level — must land in the unassigned bucket, never S1/S2)
 *     Record A2 — specimen S3 (URINE) + one slide (for cross-record specimen manipulation checks)
 *   Lab B
 *     Record B — specimen SB (BREAST_ASP) + one slide (tenant isolation)
 *   Principal: record:view + record:change + wsi:view (P5-7 discovery + upload + delivery).
 *
 * Worker OFF: the published derivative set is seeded directly to the shared derivative store.
 */
import { createHash, randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { LocalDerivativeObjectStore } from '../src/modules/wsi/storage/local-derivative-object-store';
import { generationManifestKey, generationPrefix, generationPyramidPrefix, boundedAssetKey } from '../src/modules/wsi/processing/derivative-keys';
import { MANIFEST_BUILDER_VERSION, MANIFEST_DIGEST_ALGORITHM, MANIFEST_SCHEMA_ID, type Manifest } from '../src/modules/wsi/processing/manifest/manifest';

const SLUG_A = 'wsi-specimen-acceptance-lab-a';
const SLUG_B = 'wsi-specimen-acceptance-lab-b';
const FIXTURES_OUT = process.env.SPECIMEN_FIXTURES_OUT ? path.resolve(process.env.SPECIMEN_FIXTURES_OUT) : path.resolve(__dirname, '../../web/acceptance/.specimen-fixtures.json');
const IMG = 256, TILE = 256, OVERLAP = 0, MAX_LEVEL = Math.ceil(Math.log2(IMG)), LEVEL_COUNT = MAX_LEVEL + 1;
const hex = (c: string) => c.repeat(64);

function assertIsolatedAcceptanceDb(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required (isolated acceptance/test database).');
  const name = new URL(url).pathname.replace(/^\//, '');
  if (name === 'cytolab' || !/(test|accept)/i.test(name)) throw new Error(`Refusing "${name}": not an isolated acceptance DB.`);
}

function solidPng(w: number, h: number, rgb: [number, number, number]): Buffer {
  const tab: number[] = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tab[n] = c >>> 0; }
  const crc = (b: Buffer) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = tab[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length, 0); const tb = Buffer.from(t, 'ascii'); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(Buffer.concat([tb, d])), 0); return Buffer.concat([l, tb, d, cc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) { const o = y * (1 + w * 3); raw[o] = 0; for (let x = 0; x < w; x++) { const p = o + 1 + x * 3; raw[p] = rgb[0]; raw[p + 1] = rgb[1]; raw[p + 2] = rgb[2]; } }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function main() {
  assertIsolatedAcceptanceDb();
  const storeRoot = process.env.WSI_DERIVATIVE_STORE_DIR ?? path.join(os.tmpdir(), 'osieri-wsi-derivative-store');
  const store = new LocalDerivativeObjectStore(storeRoot);
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
        await prisma.$executeRaw`DELETE FROM "SpecimenImage" WHERE "labId" = ${labId}`;
        await prisma.$executeRaw`DELETE FROM "Specimen" WHERE "labId" = ${labId}`;
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
    const A = await mkLab(SLUG_A, 'WSI Specimen Lab A');
    const B = await mkLab(SLUG_B, 'WSI Specimen Lab B');

    const role = await prisma.role.upsert({ where: { name: 'WSI Specimen Viewer' }, update: { isSuperRole: false }, create: { name: 'WSI Specimen Viewer', description: 'record:view+change + wsi:view', isSuperRole: false } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const c of ['record:view', 'record:change', 'wsi:view']) await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: await permId(c) } });
    const creds = { viewer: { email: 'wsi.specimen@acceptance.test', password: 'AcceptSpec#2026aB' } };
    const passwordHash = await argon2.hash(creds.viewer.password);
    const u = await prisma.user.create({ data: { labId: A.lab.id, email: creds.viewer.email, passwordHash, firstName: 'Spec', lastName: 'Viewer', accountId: A.account.id, workspaceId: A.workspace.id, isActive: true, roles: { create: { roleId: role.id } } } });
    await prisma.passwordHistory.create({ data: { userId: u.id, hash: passwordHash } });

    const base = new Date('2026-07-10T00:00:00.000Z').getTime();
    const put = (key: string, bytes: Buffer) => store.putImmutableObject(key, Readable.from(bytes));

    const mkRecord = async (labId: string, patientName: [string, string], n: number) => {
      const patient = await prisma.patient.create({ data: { labId, registrationNo: randomUUID(), firstName: patientName[0], lastName: patientName[1] } });
      return prisma.record.create({ data: { labId, identifier: `SPEC-${randomUUID().slice(0, 8)}`, labNumber: `LN-SPEC-${n}`, patientId: patient.id }, select: { id: true } });
    };
    const mkSpecimen = async (labId: string, recordId: string, type: string, label: string) =>
      (await prisma.specimen.create({ data: { labId, recordId, type: type as never, label }, select: { id: true } })).id;
    const mkSlide = async (labId: string, recordId: string, specimenId: string | null, minute: number, stain: string) =>
      (await prisma.digitalSlide.create({ data: { labId, recordId, specimenId, slideUrl: '', sourceKind: 'UPLOAD', availabilityStatus: 'DRAFT', stain, uploadedAt: new Date(base + minute * 60_000) } as never, select: { id: true } })).id;
    const gen = async (labId: string, slideId: string, status: string, opts: { sealed?: boolean; verified?: boolean; manifestChecksum?: string } = {}) => {
      const ing = await prisma.slideIngestion.create({ data: { labId, slideId, sourceKind: 'UPLOAD', status: 'VERIFIED', sourceObjectKey: `k-${randomUUID()}`, sourceChecksum: hex('c') } });
      const job = await prisma.slideProcessingJob.create({ data: { labId, ingestionId: ing.id, status: 'SUCCEEDED', workerId: 'w', attempt: 1 } as never });
      return (await prisma.derivativeGeneration.create({ data: { labId, slideId, jobId: job.id, tileSourceType: 'DZI', status: status as never, sealed: opts.sealed ?? false, verified: opts.verified ?? false, derivativeManifestChecksum: opts.manifestChecksum ?? (opts.sealed ? hex('a') : null), tiledWidth: IMG, tiledHeight: IMG, tileSize: TILE, levelCount: LEVEL_COUNT, sealedAt: opts.sealed ? new Date() : null, verifiedAt: opts.verified ? new Date() : null } as never })).id;
    };
    // Publish a slide with a real renderable DZI so it truly renders through the delivery boundary.
    const publish = async (labId: string, slideId: string, rgb: [number, number, number]) => {
      const g = await gen(labId, slideId, 'PROCESSING');
      const prefix = generationPrefix(labId, slideId, g);
      const pyramidPrefix = generationPyramidPrefix(prefix);
      const descriptorXml = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n<Image xmlns="http://schemas.microsoft.com/deepzoom/2008" Format="png" Overlap="${OVERLAP}" TileSize="${TILE}"><Size Width="${IMG}" Height="${IMG}"/></Image>`);
      const descRes = await put(boundedAssetKey(prefix, 'DZI_DESCRIPTOR'), descriptorXml);
      await prisma.slideAsset.create({ data: { labId, generationId: g, role: 'DZI_DESCRIPTOR', storageKey: boundedAssetKey(prefix, 'DZI_DESCRIPTOR'), checksum: descRes.checksum, sizeBytes: descRes.sizeBytes } });
      const tilePng = solidPng(TILE, TILE, rgb);
      let byteCount = 0; const levels: Manifest['levels'] = [];
      for (let level = 0; level < LEVEL_COUNT; level++) { const r = await put(`${pyramidPrefix}/${level}/0_0.png`, tilePng); byteCount += r.sizeBytes; levels.push({ level, cols: 1, rows: 1, tileCount: 1, tileDigest: '0'.repeat(64) }); }
      await prisma.slideAsset.create({ data: { labId, generationId: g, role: 'TILE_PYRAMID', storageKey: pyramidPrefix, checksum: null, sizeBytes: byteCount } });
      const manifest: Manifest = { schemaId: MANIFEST_SCHEMA_ID, builderVersion: MANIFEST_BUILDER_VERSION, digestAlgorithm: MANIFEST_DIGEST_ALGORITHM, generationId: g, slideId, ingestionId: 'seed', sourceObjectKey: 'seed', sourceChecksum: hex('c'), engineName: 'accept', engineVersion: '1.0.0', processingConfig: { configVersion: 1, tileSize: TILE, overlap: OVERLAP, tileFormat: 'png', quality: 90, pyramidLayout: 'dzi', associatedImages: false, thumbnail: false }, structure: { tiledWidth: IMG, tiledHeight: IMG, tileSize: TILE, overlap: OVERLAP, tileFormat: 'png', levelCount: LEVEL_COUNT }, acquisition: { sourceWidth: IMG, sourceHeight: IMG, objectivePower: 40, mpp: 0.25, vendor: 'accept' }, assets: [{ role: 'TILE_PYRAMID', storageKey: pyramidPrefix, checksum: null, sizeBytes: byteCount, objectCount: LEVEL_COUNT }], levels };
      const manifestBytes = Buffer.from(JSON.stringify(manifest));
      const manifestChecksum = createHash('sha256').update(manifestBytes).digest('hex');
      const manRes = await put(generationManifestKey(prefix), manifestBytes);
      await prisma.slideAsset.create({ data: { labId, generationId: g, role: 'MANIFEST', storageKey: generationManifestKey(prefix), checksum: manifestChecksum, sizeBytes: manRes.sizeBytes } });
      await prisma.derivativeGeneration.update({ where: { id: g }, data: { status: 'PUBLISHED', sealed: true, verified: true, derivativeManifestChecksum: manifestChecksum } });
      await prisma.digitalSlide.update({ where: { id: slideId }, data: { publishedGenerationId: g, availabilityStatus: 'PUBLISHED', publishedAt: new Date() } });
    };

    // ── Lab A / Record A ──
    const recordA = await mkRecord(A.lab.id, ['Case', 'Alpha'], 1);
    const S1 = await mkSpecimen(A.lab.id, recordA.id, 'CERV_SCRAP', 'Block S1');
    const S2 = await mkSpecimen(A.lab.id, recordA.id, 'PLEURAL_FLD', 'Block S2');
    const pubS1 = await mkSlide(A.lab.id, recordA.id, S1, 0, 'H&E');   // PUBLISHED (viewable) under S1
    await publish(A.lab.id, pubS1, [79, 70, 229]);
    const readyS1 = await mkSlide(A.lab.id, recordA.id, S1, 1, 'Pap');  // READY (NOT viewable) under S1
    await gen(A.lab.id, readyS1, 'READY', { sealed: true, verified: true });
    const s2Slide = await mkSlide(A.lab.id, recordA.id, S2, 2, 'IHC');  // READY under S2
    await gen(A.lab.id, s2Slide, 'READY', { sealed: true, verified: true });
    const nullSlide = await mkSlide(A.lab.id, recordA.id, null, 3, 'Giemsa'); // record-level (unassigned)

    // ── Lab A / Record A2 (cross-record specimen) ──
    const recordA2 = await mkRecord(A.lab.id, ['Case', 'Gamma'], 2);
    const S3 = await mkSpecimen(A.lab.id, recordA2.id, 'URINE', 'Block S3');
    const a2Slide = await mkSlide(A.lab.id, recordA2.id, S3, 0, 'H&E');

    // ── Lab B (tenant isolation) ──
    const recordB = await mkRecord(B.lab.id, ['Cross', 'Beta'], 1);
    const SB = await mkSpecimen(B.lab.id, recordB.id, 'BREAST_ASP', 'Block SB');
    const bSlide = await mkSlide(B.lab.id, recordB.id, SB, 0, 'H&E');

    const fixtures = {
      labAId: A.lab.id, labBId: B.lab.id, creds,
      recordAId: recordA.id, recordA2Id: recordA2.id, recordBId: recordB.id,
      specimens: { S1, S2, S3, SB },
      slides: { pubS1, readyS1, s2: s2Slide, nullSlide, a2: a2Slide, labB: bSlide },
      // The persisted ground truth the acceptance asserts against.
      expect: {
        recordASlideCount: 4,
        s1SlideIds: [pubS1, readyS1], s2SlideIds: [s2Slide], nullSlideIds: [nullSlide],
      },
      storeRoot,
    };
    fs.mkdirSync(path.dirname(FIXTURES_OUT), { recursive: true });
    fs.writeFileSync(FIXTURES_OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded WSI specimen fixtures → ${FIXTURES_OUT}`);
    console.log(`  recordA=${recordA.id} S1=${S1}[pub=${pubS1},ready=${readyS1}] S2=${S2}[${s2Slide}] null=${nullSlide} | A2 S3=${S3}[${a2Slide}] | LabB SB=${SB}[${bSlide}]`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('seed-wsi-specimen-acceptance FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
