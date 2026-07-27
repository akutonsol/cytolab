/**
 * P5-6 — isolated fixtures for multi-slide orchestration (tray/switching + side-by-side).
 *
 * Seeds ONE Lab-A record with THREE slides sharing that record, in distinct lifecycle states, plus a Lab-B
 * record/slide for isolation, and a scoped principal (record:view + record:change + wsi:view + wsi:review).
 *   - published: a real minimal DZI derivative set (renders through the authenticated delivery boundary)
 *                + a distinctive annotation ("ROI-PUBLISHED").
 *   - ready:     a sealed+verified READY generation, NOT published (not viewable) + annotation "ROI-READY".
 *   - draft:     no generation (not viewable).
 * uploadedAt is spaced so oldest→newest order is deterministic: published < ready < draft.
 *
 * Worker OFF: states are seeded directly (orchestration is about viewing/navigating existing slides).
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

const SLUG_A = 'wsi-orchestration-acceptance-lab-a';
const SLUG_B = 'wsi-orchestration-acceptance-lab-b';
const FIXTURES_OUT = process.env.ORCH_FIXTURES_OUT ? path.resolve(process.env.ORCH_FIXTURES_OUT) : path.resolve(__dirname, '../../web/acceptance/.orchestration-fixtures.json');
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
    const A = await mkLab(SLUG_A, 'WSI Orchestration Lab A');
    const B = await mkLab(SLUG_B, 'WSI Orchestration Lab B');

    const role = await prisma.role.upsert({ where: { name: 'WSI Orchestration Viewer' }, update: { isSuperRole: false }, create: { name: 'WSI Orchestration Viewer', description: 'record:view+change + wsi:view + wsi:review', isSuperRole: false } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const c of ['record:view', 'record:change', 'wsi:view', 'wsi:review']) await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: await permId(c) } });
    const creds = { viewer: { email: 'wsi.orchestrator@acceptance.test', password: 'AcceptOrch#2026aB' } };
    const passwordHash = await argon2.hash(creds.viewer.password);
    const u = await prisma.user.create({ data: { labId: A.lab.id, email: creds.viewer.email, passwordHash, firstName: 'Orch', lastName: 'Viewer', accountId: A.account.id, workspaceId: A.workspace.id, isActive: true, roles: { create: { roleId: role.id } } } });
    await prisma.passwordHistory.create({ data: { userId: u.id, hash: passwordHash } });

    const patientA = await prisma.patient.create({ data: { labId: A.lab.id, registrationNo: randomUUID(), firstName: 'Case', lastName: 'Alpha' } });
    const recordA = await prisma.record.create({ data: { labId: A.lab.id, identifier: `ORCH-${randomUUID().slice(0, 8)}`, labNumber: `LN-ORCH-1`, patientId: patientA.id } });
    const base = new Date('2026-07-10T00:00:00.000Z').getTime();
    const mkSlide = async (labId: string, recordId: string, minute: number) =>
      (await prisma.digitalSlide.create({ data: { labId, recordId, slideUrl: '', sourceKind: 'UPLOAD', availabilityStatus: 'DRAFT', uploadedAt: new Date(base + minute * 60_000) } as never, select: { id: true } })).id;
    const gen = async (labId: string, slideId: string, status: string, opts: { sealed?: boolean; verified?: boolean; manifestChecksum?: string } = {}) => {
      const ing = await prisma.slideIngestion.create({ data: { labId, slideId, sourceKind: 'UPLOAD', status: 'VERIFIED', sourceObjectKey: `k-${randomUUID()}`, sourceChecksum: hex('c') } });
      const job = await prisma.slideProcessingJob.create({ data: { labId, ingestionId: ing.id, status: 'SUCCEEDED', workerId: 'w', attempt: 1 } as never });
      return (await prisma.derivativeGeneration.create({ data: { labId, slideId, jobId: job.id, tileSourceType: 'DZI', status: status as never, sealed: opts.sealed ?? false, verified: opts.verified ?? false, derivativeManifestChecksum: opts.manifestChecksum ?? (opts.sealed ? hex('a') : null), tiledWidth: IMG, tiledHeight: IMG, tileSize: TILE, levelCount: LEVEL_COUNT, sealedAt: opts.sealed ? new Date() : null, verifiedAt: opts.verified ? new Date() : null } as never })).id;
    };

    const put = (key: string, bytes: Buffer) => store.putImmutableObject(key, Readable.from(bytes));
    // Publish a slide with a real renderable DZI derivative set (so it truly renders through delivery).
    const publishReal = async (minute: number, stain: string, annotationLabel: string, rgb: [number, number, number], annXY: [number, number]) => {
      const slideId = await mkSlide(A.lab.id, recordA.id, minute);
      const g = await gen(A.lab.id, slideId, 'PROCESSING'); // upgraded to PUBLISHED after assets written
      const prefix = generationPrefix(A.lab.id, slideId, g);
      const pyramidPrefix = generationPyramidPrefix(prefix);
      const descriptorXml = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n<Image xmlns="http://schemas.microsoft.com/deepzoom/2008" Format="png" Overlap="${OVERLAP}" TileSize="${TILE}"><Size Width="${IMG}" Height="${IMG}"/></Image>`);
      const descRes = await put(boundedAssetKey(prefix, 'DZI_DESCRIPTOR'), descriptorXml);
      await prisma.slideAsset.create({ data: { labId: A.lab.id, generationId: g, role: 'DZI_DESCRIPTOR', storageKey: boundedAssetKey(prefix, 'DZI_DESCRIPTOR'), checksum: descRes.checksum, sizeBytes: descRes.sizeBytes } });
      const tilePng = solidPng(TILE, TILE, rgb);
      let byteCount = 0; const levels: Manifest['levels'] = [];
      for (let level = 0; level < LEVEL_COUNT; level++) { const r = await put(`${pyramidPrefix}/${level}/0_0.png`, tilePng); byteCount += r.sizeBytes; levels.push({ level, cols: 1, rows: 1, tileCount: 1, tileDigest: '0'.repeat(64) }); }
      await prisma.slideAsset.create({ data: { labId: A.lab.id, generationId: g, role: 'TILE_PYRAMID', storageKey: pyramidPrefix, checksum: null, sizeBytes: byteCount } });
      const manifest: Manifest = { schemaId: MANIFEST_SCHEMA_ID, builderVersion: MANIFEST_BUILDER_VERSION, digestAlgorithm: MANIFEST_DIGEST_ALGORITHM, generationId: g, slideId, ingestionId: 'seed', sourceObjectKey: 'seed', sourceChecksum: hex('c'), engineName: 'accept', engineVersion: '1.0.0', processingConfig: { configVersion: 1, tileSize: TILE, overlap: OVERLAP, tileFormat: 'png', quality: 90, pyramidLayout: 'dzi', associatedImages: false, thumbnail: false }, structure: { tiledWidth: IMG, tiledHeight: IMG, tileSize: TILE, overlap: OVERLAP, tileFormat: 'png', levelCount: LEVEL_COUNT }, acquisition: { sourceWidth: IMG, sourceHeight: IMG, objectivePower: 40, mpp: 0.25, vendor: 'accept' }, assets: [{ role: 'TILE_PYRAMID', storageKey: pyramidPrefix, checksum: null, sizeBytes: byteCount, objectCount: LEVEL_COUNT }], levels };
      const manifestBytes = Buffer.from(JSON.stringify(manifest));
      const manifestChecksum = createHash('sha256').update(manifestBytes).digest('hex');
      const manRes = await put(generationManifestKey(prefix), manifestBytes);
      await prisma.slideAsset.create({ data: { labId: A.lab.id, generationId: g, role: 'MANIFEST', storageKey: generationManifestKey(prefix), checksum: manifestChecksum, sizeBytes: manRes.sizeBytes } });
      await prisma.derivativeGeneration.update({ where: { id: g }, data: { status: 'PUBLISHED', sealed: true, verified: true, derivativeManifestChecksum: manifestChecksum } });
      await prisma.digitalSlide.update({ where: { id: slideId }, data: { publishedGenerationId: g, availabilityStatus: 'PUBLISHED', publishedAt: new Date(), stain } });
      await prisma.slideAnnotation.create({ data: { labId: A.lab.id, slideId, x: annXY[0], y: annXY[1], label: annotationLabel, color: `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}` } });
      return slideId;
    };

    // TWO published slides in the SAME record → Part B side-by-side proves two independent live tile streams.
    const sPub = await publishReal(0, 'H&E', 'ROI-PUBLISHED', [79, 70, 229], [0.4, 0.4]);
    const sPub2 = await publishReal(3, 'Giemsa', 'ROI-PUBLISHED-2', [21, 128, 61], [0.6, 0.6]);

    // READY (sealed+verified, unpublished — not viewable).
    const sReady = await mkSlide(A.lab.id, recordA.id, 1);
    await prisma.digitalSlide.update({ where: { id: sReady }, data: { stain: 'Pap' } });
    await gen(A.lab.id, sReady, 'READY', { sealed: true, verified: true });
    await prisma.slideAnnotation.create({ data: { labId: A.lab.id, slideId: sReady, x: 0.6, y: 0.6, label: 'ROI-READY', color: '#16A34A' } });

    // DRAFT (no generation — not viewable).
    const sDraft = await mkSlide(A.lab.id, recordA.id, 2);
    await prisma.digitalSlide.update({ where: { id: sDraft }, data: { stain: 'IHC' } });

    // Lab B — isolation.
    const patientB = await prisma.patient.create({ data: { labId: B.lab.id, registrationNo: randomUUID(), firstName: 'Cross', lastName: 'Beta' } });
    const recordB = await prisma.record.create({ data: { labId: B.lab.id, identifier: `ORCHB-${randomUUID().slice(0, 8)}`, patientId: patientB.id } });
    const sLabB = await mkSlide(B.lab.id, recordB.id, 0);

    // Deterministic oldest→newest order by uploadedAt: published(0) < ready(1) < draft(2) < published2(3).
    const fixtures = { labAId: A.lab.id, labBId: B.lab.id, creds, recordAId: recordA.id, recordBId: recordB.id,
      slides: { published: sPub, published2: sPub2, ready: sReady, draft: sDraft, labB: sLabB }, order: [sPub, sReady, sDraft, sPub2],
      annotations: { published: 'ROI-PUBLISHED', published2: 'ROI-PUBLISHED-2', ready: 'ROI-READY' }, storeRoot };
    fs.mkdirSync(path.dirname(FIXTURES_OUT), { recursive: true });
    fs.writeFileSync(FIXTURES_OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded WSI orchestration fixtures → ${FIXTURES_OUT}`);
    console.log(`  recordA=${recordA.id} slides: published=${sPub} published2=${sPub2} ready=${sReady} draft=${sDraft} | labB slide=${sLabB}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('seed-wsi-orchestration-acceptance FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
