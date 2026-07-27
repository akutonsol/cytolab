/**
 * P5-8 — isolated fixtures for asset-graph search & navigation.
 *
 * Seeds the full persisted chain and the three permission tiers:
 *   Lab A / Record A — Patient → Record → Specimen S1 → DigitalSlide → Ingestion → Job → Generation → Assets
 *     · pubSlide  : PUBLISHED (real DZI) under S1 — capture gen/job/ingestion ids for the lineage proof
 *     · readySlide: READY (sealed+verified, unpublished, NOT viewable) under S1
 *     · nullSlide : record-level (specimenId null) — unassigned traversal truth
 *   Lab B / Record B — one slide (tenant isolation)
 *   Principals (Lab A):
 *     · viewer    : record:view                     (metadata navigation only)
 *     · reviewer  : record:view + wsi:review         (generation/asset internals)
 *     · deliverer : record:view + wsi:view           (image delivery)
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

const SLUG_A = 'wsi-graph-acceptance-lab-a';
const SLUG_B = 'wsi-graph-acceptance-lab-b';
const FIXTURES_OUT = process.env.GRAPH_FIXTURES_OUT ? path.resolve(process.env.GRAPH_FIXTURES_OUT) : path.resolve(__dirname, '../../web/acceptance/.graph-fixtures.json');
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
        await prisma.$executeRaw`DELETE FROM "GenerationVerification" WHERE "labId" = ${labId}`;
        await prisma.$executeRaw`DELETE FROM "GenerationPublication" WHERE "labId" = ${labId}`;
        await prisma.$executeRaw`DELETE FROM "DerivativeGeneration" WHERE "labId" = ${labId}`;
        await prisma.$executeRaw`DELETE FROM "SlideProcessingJob" WHERE "labId" = ${labId}`;
        await prisma.$executeRaw`DELETE FROM "SlideIngestion" WHERE "labId" = ${labId}`;
        await prisma.$executeRaw`DELETE FROM "SlideAnnotation" WHERE "labId" = ${labId}`;
        await prisma.$executeRaw`DELETE FROM "DigitalSlide" WHERE "labId" = ${labId}`;
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
    const A = await mkLab(SLUG_A, 'WSI Graph Lab A');
    const B = await mkLab(SLUG_B, 'WSI Graph Lab B');

    const mkRole = async (name: string, codes: string[]) => {
      const role = await prisma.role.upsert({ where: { name }, update: { isSuperRole: false }, create: { name, description: codes.join('+'), isSuperRole: false } });
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      for (const c of codes) await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: await permId(c) } });
      return role.id;
    };
    const viewerRole = await mkRole('WSI Graph Viewer', ['record:view']);
    const reviewerRole = await mkRole('WSI Graph Reviewer', ['record:view', 'wsi:review']);
    const delivererRole = await mkRole('WSI Graph Deliverer', ['record:view', 'wsi:view']);

    const mkUser = async (email: string, password: string, roleId: string) => {
      const passwordHash = await argon2.hash(password);
      const u = await prisma.user.create({ data: { labId: A.lab.id, email, passwordHash, firstName: 'Graph', lastName: 'User', accountId: A.account.id, workspaceId: A.workspace.id, isActive: true, roles: { create: { roleId } } } });
      await prisma.passwordHistory.create({ data: { userId: u.id, hash: passwordHash } });
    };
    const creds = {
      viewer: { email: 'graph.viewer@acceptance.test', password: 'AcceptGraphV#2026a' },
      reviewer: { email: 'graph.reviewer@acceptance.test', password: 'AcceptGraphR#2026a' },
      deliverer: { email: 'graph.deliverer@acceptance.test', password: 'AcceptGraphD#2026a' },
    };
    await mkUser(creds.viewer.email, creds.viewer.password, viewerRole);
    await mkUser(creds.reviewer.email, creds.reviewer.password, reviewerRole);
    await mkUser(creds.deliverer.email, creds.deliverer.password, delivererRole);

    const base = new Date('2026-07-10T00:00:00.000Z').getTime();
    const put = (key: string, bytes: Buffer) => store.putImmutableObject(key, Readable.from(bytes));
    const mkRecord = async (labId: string, name: [string, string], n: number) => {
      const patient = await prisma.patient.create({ data: { labId, registrationNo: randomUUID(), firstName: name[0], lastName: name[1] }, select: { id: true } });
      const rec = await prisma.record.create({ data: { labId, identifier: `GRAPH-${randomUUID().slice(0, 8)}`, labNumber: `LN-GRAPH-${n}`, patientId: patient.id }, select: { id: true } });
      return { recordId: rec.id, patientId: patient.id };
    };
    const mkSpecimen = async (labId: string, recordId: string, type: string, label: string) =>
      (await prisma.specimen.create({ data: { labId, recordId, type: type as never, label }, select: { id: true } })).id;
    const mkSlide = async (labId: string, recordId: string, specimenId: string | null, minute: number, stain: string) =>
      (await prisma.digitalSlide.create({ data: { labId, recordId, specimenId, slideUrl: '', sourceKind: 'UPLOAD', availabilityStatus: 'DRAFT', stain, uploadedAt: new Date(base + minute * 60_000) } as never, select: { id: true } })).id;
    // Returns the persisted lineage ids so the acceptance can assert ingestion→job→generation→asset truth.
    const gen = async (labId: string, slideId: string, status: string, opts: { sealed?: boolean; verified?: boolean; manifestChecksum?: string; filename?: string } = {}) => {
      const ing = await prisma.slideIngestion.create({ data: { labId, slideId, sourceKind: 'UPLOAD', status: 'VERIFIED', sourceObjectKey: `k-${randomUUID()}`, sourceChecksum: hex('c'), originalFilename: opts.filename ?? 'source.svs', sizeBytes: 4096 }, select: { id: true } });
      const job = await prisma.slideProcessingJob.create({ data: { labId, ingestionId: ing.id, status: 'SUCCEEDED', workerId: 'w1', attempt: 1, startedAt: new Date(), finishedAt: new Date() } as never, select: { id: true } });
      const g = await prisma.derivativeGeneration.create({ data: { labId, slideId, jobId: job.id, tileSourceType: 'DZI', status: status as never, sealed: opts.sealed ?? false, verified: opts.verified ?? false, derivativeManifestChecksum: opts.manifestChecksum ?? (opts.sealed ? hex('a') : null), tiledWidth: IMG, tiledHeight: IMG, tileSize: TILE, levelCount: LEVEL_COUNT, sealedAt: opts.sealed ? new Date() : null, verifiedAt: opts.verified ? new Date() : null } as never, select: { id: true } });
      return { genId: g.id, jobId: job.id, ingestionId: ing.id };
    };
    const publish = async (labId: string, slideId: string, rgb: [number, number, number]) => {
      const l = await gen(labId, slideId, 'PROCESSING', { filename: 'published-source.svs' });
      const g = l.genId;
      const prefix = generationPrefix(labId, slideId, g);
      const pyramidPrefix = generationPyramidPrefix(prefix);
      const descriptorXml = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n<Image xmlns="http://schemas.microsoft.com/deepzoom/2008" Format="png" Overlap="${OVERLAP}" TileSize="${TILE}"><Size Width="${IMG}" Height="${IMG}"/></Image>`);
      const descRes = await put(boundedAssetKey(prefix, 'DZI_DESCRIPTOR'), descriptorXml);
      await prisma.slideAsset.create({ data: { labId, generationId: g, role: 'DZI_DESCRIPTOR', storageKey: boundedAssetKey(prefix, 'DZI_DESCRIPTOR'), checksum: descRes.checksum, sizeBytes: descRes.sizeBytes } });
      const tilePng = solidPng(TILE, TILE, rgb);
      let byteCount = 0; const levels: Manifest['levels'] = [];
      for (let level = 0; level < LEVEL_COUNT; level++) { const r = await put(`${pyramidPrefix}/${level}/0_0.png`, tilePng); byteCount += r.sizeBytes; levels.push({ level, cols: 1, rows: 1, tileCount: 1, tileDigest: '0'.repeat(64) }); }
      await prisma.slideAsset.create({ data: { labId, generationId: g, role: 'TILE_PYRAMID', storageKey: pyramidPrefix, checksum: null, sizeBytes: byteCount } });
      const manifest: Manifest = { schemaId: MANIFEST_SCHEMA_ID, builderVersion: MANIFEST_BUILDER_VERSION, digestAlgorithm: MANIFEST_DIGEST_ALGORITHM, generationId: g, slideId, ingestionId: l.ingestionId, sourceObjectKey: 'seed', sourceChecksum: hex('c'), engineName: 'accept', engineVersion: '1.0.0', processingConfig: { configVersion: 1, tileSize: TILE, overlap: OVERLAP, tileFormat: 'png', quality: 90, pyramidLayout: 'dzi', associatedImages: false, thumbnail: false }, structure: { tiledWidth: IMG, tiledHeight: IMG, tileSize: TILE, overlap: OVERLAP, tileFormat: 'png', levelCount: LEVEL_COUNT }, acquisition: { sourceWidth: IMG, sourceHeight: IMG, objectivePower: 40, mpp: 0.25, vendor: 'accept' }, assets: [{ role: 'TILE_PYRAMID', storageKey: pyramidPrefix, checksum: null, sizeBytes: byteCount, objectCount: LEVEL_COUNT }], levels };
      const manifestBytes = Buffer.from(JSON.stringify(manifest));
      const manifestChecksum = createHash('sha256').update(manifestBytes).digest('hex');
      const manRes = await put(generationManifestKey(prefix), manifestBytes);
      await prisma.slideAsset.create({ data: { labId, generationId: g, role: 'MANIFEST', storageKey: generationManifestKey(prefix), checksum: manifestChecksum, sizeBytes: manRes.sizeBytes } });
      await prisma.derivativeGeneration.update({ where: { id: g }, data: { status: 'PUBLISHED', sealed: true, verified: true, derivativeManifestChecksum: manifestChecksum } });
      await prisma.digitalSlide.update({ where: { id: slideId }, data: { publishedGenerationId: g, availabilityStatus: 'PUBLISHED', publishedAt: new Date() } });
      return l; // { genId, jobId, ingestionId }
    };

    // ── Lab A / Record A ──
    const recA = await mkRecord(A.lab.id, ['Graph', 'Alpha'], 1);
    const S1 = await mkSpecimen(A.lab.id, recA.recordId, 'CERV_SCRAP', 'Block S1');
    const pubSlide = await mkSlide(A.lab.id, recA.recordId, S1, 0, 'H&E');
    const pubLineage = await publish(A.lab.id, pubSlide, [79, 70, 229]);
    const readySlide = await mkSlide(A.lab.id, recA.recordId, S1, 1, 'Pap');
    await gen(A.lab.id, readySlide, 'READY', { sealed: true, verified: true });
    const nullSlide = await mkSlide(A.lab.id, recA.recordId, null, 2, 'Giemsa');

    // ── Lab B (tenant isolation) ──
    const recB = await mkRecord(B.lab.id, ['Cross', 'Beta'], 1);
    const SB = await mkSpecimen(B.lab.id, recB.recordId, 'BREAST_ASP', 'Block SB');
    const bSlide = await mkSlide(B.lab.id, recB.recordId, SB, 0, 'H&E');
    const bLineage = await publish(B.lab.id, bSlide, [21, 128, 61]);

    const fixtures = {
      labAId: A.lab.id, labBId: B.lab.id, creds,
      recordAId: recA.recordId, patientAId: recA.patientId, recordBId: recB.recordId,
      specimens: { S1, SB },
      slides: { pub: pubSlide, ready: readySlide, null: nullSlide, labB: bSlide },
      lineage: { pubGenId: pubLineage.genId, pubJobId: pubLineage.jobId, pubIngestionId: pubLineage.ingestionId, labBGenId: bLineage.genId },
      expect: { recordASlideCount: 3 },
      storeRoot,
    };
    fs.mkdirSync(path.dirname(FIXTURES_OUT), { recursive: true });
    fs.writeFileSync(FIXTURES_OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded WSI graph fixtures → ${FIXTURES_OUT}`);
    console.log(`  recordA=${recA.recordId} S1=${S1} pub=${pubSlide}(gen=${pubLineage.genId},job=${pubLineage.jobId},ing=${pubLineage.ingestionId}) ready=${readySlide} null=${nullSlide} | labB=${bSlide}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('seed-wsi-graph-acceptance FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
