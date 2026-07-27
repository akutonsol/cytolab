/**
 * P5-4 rendered-acceptance — isolated WSI *viewer* fixture seeder.
 *
 * Seeds ONE scoped, NON-super principal (record:view + wsi:view — the exact real slide-viewing grant) and a
 * single slide with a sealed+verified PUBLISHED generation whose derivative set is a MINIMAL REAL DZI
 * (full descriptor + canonical manifest + a tile pyramid), written through the store's own write-once API so
 * the on-disk layout matches what the delivery service reads. The browser gate then opens the slide through
 * the authenticated delivery path and asserts a nonblank region renders.
 *
 * Fail-closed to an isolated acceptance/test DB (same guard as seed-wsi-acceptance.ts). Deterministic:
 * wipes its own lab (by slug) + its derivative objects before re-seeding.
 *
 * Usage: DATABASE_URL=postgres://…/<name-with-test-or-accept> \
 *        WSI_DERIVATIVE_STORE_DIR=/abs/isolated/store \
 *        ts-node apps/api/scripts/seed-wsi-viewer-acceptance.ts
 */
import { createHash, randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { LocalDerivativeObjectStore } from '../src/modules/wsi/storage/local-derivative-object-store';
import { generationManifestKey, generationPrefix, generationPyramidPrefix, boundedAssetKey } from '../src/modules/wsi/processing/derivative-keys';
import { MANIFEST_BUILDER_VERSION, MANIFEST_DIGEST_ALGORITHM, MANIFEST_SCHEMA_ID, type Manifest } from '../src/modules/wsi/processing/manifest/manifest';

const VIEWER_LAB_SLUG = 'wsi-viewer-acceptance-lab';
const FIXTURES_OUT = process.env.VIEWER_FIXTURES_OUT
  ? path.resolve(process.env.VIEWER_FIXTURES_OUT)
  : path.resolve(__dirname, '../../web/acceptance/.viewer-fixtures.json');

// Minimal renderable DZI: a 256×256 image, one 256px tile per DZI level (all 1×1 grids), overlap 0, PNG tiles.
const IMG = 256;
const TILE = 256;
const OVERLAP = 0;
const MAX_LEVEL = Math.ceil(Math.log2(IMG)); // 8 → levels 0..8 (9 levels)
const LEVEL_COUNT = MAX_LEVEL + 1;

function assertIsolatedAcceptanceDb(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required (isolated acceptance/test database).');
  let name: string;
  try { name = new URL(url).pathname.replace(/^\//, ''); } catch { throw new Error('DATABASE_URL is malformed.'); }
  if (!name) throw new Error('DATABASE_URL has no database name.');
  if (name === 'cytolab') throw new Error('Refusing the development database "cytolab".');
  if (!/(test|accept)/i.test(name)) throw new Error(`Refusing "${name}": an acceptance database name must contain "test" or "accept".`);
}

/** Dependency-free solid-colour PNG encoder (indigo #4F46E5 — nonblank, orange-safe). */
function solidPng(w: number, h: number, rgb: [number, number, number]): Buffer {
  const crcTable = (() => {
    const t: number[] = [];
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  const crc32 = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  };
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit, RGB, no interlace
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const off = y * (1 + w * 3);
    raw[off] = 0; // filter: none
    for (let x = 0; x < w; x++) { const p = off + 1 + x * 3; raw[p] = rgb[0]; raw[p + 1] = rgb[1]; raw[p + 2] = rgb[2]; }
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function main() {
  assertIsolatedAcceptanceDb();
  const storeRoot = process.env.WSI_DERIVATIVE_STORE_DIR ?? path.join(require('node:os').tmpdir(), 'osieri-wsi-derivative-store');
  const store = new LocalDerivativeObjectStore(storeRoot);
  const prisma = new PrismaClient();
  try {
    // ── deterministic reset ──
    const prior = await prisma.lab.findUnique({ where: { slug: VIEWER_LAB_SLUG }, select: { id: true } });
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

    // ── tenant + feature ──
    const lab = await prisma.lab.create({ data: { name: 'WSI Viewer Acceptance Lab', slug: VIEWER_LAB_SLUG } });
    const account = await prisma.account.create({ data: { name: 'WSI Viewer Acceptance', labId: lab.id } });
    const workspace = await prisma.workspace.create({ data: { name: 'Global', labId: lab.id, accountId: account.id } });
    await prisma.labFeature.create({ data: { labId: lab.id, featureKey: 'WSI_VIEWER', tier: 5, isEnabled: true, enabledAt: new Date() } });

    // ── scoped NON-super viewer, mirroring a real slide-viewer's grants: record:view (+ record:change for
    //    annotations) + wsi:view. wsi:view is the perm that gates delivery-session issuance; NO wsi:review/publish. ──
    const role = await prisma.role.upsert({ where: { name: 'WSI Acceptance Viewer' }, update: { isSuperRole: false }, create: { name: 'WSI Acceptance Viewer', description: 'record:view + record:change + wsi:view', isSuperRole: false } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const c of ['record:view', 'record:change', 'wsi:view']) await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: await permId(c) } });

    const creds = { viewer: { email: 'wsi.viewer@acceptance.test', password: 'AcceptView#2026aB' } };
    const passwordHash = await argon2.hash(creds.viewer.password);
    const viewer = await prisma.user.create({ data: { labId: lab.id, email: creds.viewer.email, passwordHash, firstName: 'View', lastName: 'Only', accountId: account.id, workspaceId: workspace.id, isActive: true, roles: { create: { roleId: role.id } } } });
    await prisma.passwordHistory.create({ data: { userId: viewer.id, hash: passwordHash } });

    // ── slide + PUBLISHED generation ──
    const patient = await prisma.patient.create({ data: { labId: lab.id, registrationNo: randomUUID(), firstName: 'View', lastName: 'Patient' } });
    const record = await prisma.record.create({ data: { labId: lab.id, identifier: randomUUID(), patientId: patient.id } });
    const slide = await prisma.digitalSlide.create({ data: { labId: lab.id, recordId: record.id, slideUrl: '', availabilityStatus: 'DRAFT', sourceKind: 'UPLOAD' } });
    const ing = await prisma.slideIngestion.create({ data: { labId: lab.id, slideId: slide.id, sourceKind: 'UPLOAD', status: 'VERIFIED', sourceObjectKey: `k-${randomUUID()}`, sourceChecksum: 'c'.repeat(64) } });
    const job = await prisma.slideProcessingJob.create({ data: { labId: lab.id, ingestionId: ing.id, status: 'SUCCEEDED', workerId: 'w', attempt: 1 } as never });
    const gen = await prisma.derivativeGeneration.create({
      data: {
        labId: lab.id, slideId: slide.id, jobId: job.id, tileSourceType: 'DZI', status: 'PUBLISHED' as never,
        sealed: true, verified: true, derivativeManifestChecksum: 'a'.repeat(64), // real value set after manifest is built
        tiledWidth: IMG, tiledHeight: IMG, tileSize: TILE, levelCount: LEVEL_COUNT, sealedAt: new Date(), verifiedAt: new Date(),
      } as never,
    });

    // ── write the real DZI derivative set through the write-once store ──
    const prefix = generationPrefix(lab.id, slide.id, gen.id);
    const pyramidPrefix = generationPyramidPrefix(prefix);
    const put = (key: string, bytes: Buffer) => store.putImmutableObject(key, Readable.from(bytes));

    // descriptor (full DZI — Size + Format present so OpenSeadragon can build the pyramid from it alone)
    const descriptorXml = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n<Image xmlns="http://schemas.microsoft.com/deepzoom/2008" Format="png" Overlap="${OVERLAP}" TileSize="${TILE}"><Size Width="${IMG}" Height="${IMG}"/></Image>`);
    const descriptorKey = boundedAssetKey(prefix, 'DZI_DESCRIPTOR');
    const descRes = await put(descriptorKey, descriptorXml);
    await prisma.slideAsset.create({ data: { labId: lab.id, generationId: gen.id, role: 'DZI_DESCRIPTOR', storageKey: descriptorKey, checksum: descRes.checksum, sizeBytes: descRes.sizeBytes } });

    // tile pyramid — one 256×256 solid PNG per level at {pyramid}/{level}/0_0.png
    const tilePng = solidPng(TILE, TILE, [79, 70, 229]);
    let objectCount = 0;
    let byteCount = 0;
    const levels: Manifest['levels'] = [];
    for (let level = 0; level < LEVEL_COUNT; level++) {
      const r = await put(`${pyramidPrefix}/${level}/0_0.png`, tilePng);
      objectCount++; byteCount += r.sizeBytes;
      levels.push({ level, cols: 1, rows: 1, tileCount: 1, tileDigest: '0'.repeat(64) });
    }
    await prisma.slideAsset.create({ data: { labId: lab.id, generationId: gen.id, role: 'TILE_PYRAMID', storageKey: pyramidPrefix, checksum: null, sizeBytes: byteCount } });

    // canonical manifest (delivery validates schemaId, generationId, and dense levels)
    const manifest: Manifest = {
      schemaId: MANIFEST_SCHEMA_ID, builderVersion: MANIFEST_BUILDER_VERSION, digestAlgorithm: MANIFEST_DIGEST_ALGORITHM,
      generationId: gen.id, slideId: slide.id, ingestionId: ing.id, sourceObjectKey: ing.sourceObjectKey, sourceChecksum: 'c'.repeat(64),
      engineName: 'accept-viewer', engineVersion: '1.0.0',
      processingConfig: { configVersion: 1, tileSize: TILE, overlap: OVERLAP, tileFormat: 'png', quality: 90, pyramidLayout: 'dzi', associatedImages: false, thumbnail: false },
      structure: { tiledWidth: IMG, tiledHeight: IMG, tileSize: TILE, overlap: OVERLAP, tileFormat: 'png', levelCount: LEVEL_COUNT },
      acquisition: { sourceWidth: IMG, sourceHeight: IMG, objectivePower: 40, mpp: 0.25, vendor: 'accept' },
      assets: [{ role: 'TILE_PYRAMID', storageKey: pyramidPrefix, checksum: null, sizeBytes: byteCount, objectCount }],
      levels,
    };
    const manifestBytes = Buffer.from(JSON.stringify(manifest));
    const manifestChecksum = createHash('sha256').update(manifestBytes).digest('hex');
    const manifestKey = generationManifestKey(prefix);
    const manRes = await put(manifestKey, manifestBytes);
    await prisma.slideAsset.create({ data: { labId: lab.id, generationId: gen.id, role: 'MANIFEST', storageKey: manifestKey, checksum: manifestChecksum, sizeBytes: manRes.sizeBytes } });

    // tie it together: the generation's manifest checksum + the slide's published pointer
    await prisma.derivativeGeneration.update({ where: { id: gen.id }, data: { derivativeManifestChecksum: manifestChecksum } });
    await prisma.digitalSlide.update({ where: { id: slide.id }, data: { publishedGenerationId: gen.id, availabilityStatus: 'PUBLISHED', publishedAt: new Date() } });

    // one existing annotation so the gate can prove the overlay/projection survives the transport rewrite
    await prisma.slideAnnotation.create({ data: { labId: lab.id, slideId: slide.id, x: 0.5, y: 0.5, label: 'Region of interest', color: '#4F46E5' } });

    const fixtures = { labId: lab.id, creds, slide: slide.id, generationId: gen.id, storeRoot };
    fs.mkdirSync(path.dirname(FIXTURES_OUT), { recursive: true });
    fs.writeFileSync(FIXTURES_OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded WSI viewer acceptance fixtures → ${FIXTURES_OUT}`);
    console.log(`  slide=${slide.id} generation=${gen.id} tiles=${objectCount} store=${storeRoot}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('seed-wsi-viewer-acceptance FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
