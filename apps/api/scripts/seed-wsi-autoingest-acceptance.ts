/**
 * Program 5B · B2 — isolated fixtures for the WORKER-ENABLED automated watch-folder acceptance gate.
 *
 * Seeds two labs, records with known accessions, and FILESYSTEM ingestion sources, then writes REAL
 * libvips-tileable PNG files into the source roots so the running watch-folder poller (WSI_WATCH_FOLDER=true)
 * discovers → stabilises → hashes → matches → hands off into the accepted pipeline → the real worker
 * (WSI_TILING_ENGINE=libvips) tiles to READY. NO slide/generation/asset is seeded — the automated path
 * produces them.
 *
 * Lab A / Record RA (labNumber LN-A-UNIQUE) + Record RB (labNumber LN-A-DUP-META):
 *   root A files:
 *     LN-A-UNIQUE.png    bytes U  → unique match (RA)      → INGESTED → worker → READY
 *     LN-A-DUP-META.png  bytes U  → same BYTES, diff accession → whichever ingests first wins; the other DUPLICATE
 *     NO-MATCH.png       bytes N  → no record              → UNMATCHED (no slide)
 *     AMB-1.png          bytes M  → labNumber(RX)==identifier(RY)==AMB-1 → AMBIGUOUS (no slide)
 *     note.txt                    → unsupported ext        → not discovered
 *     escape.png -> ../outside/secret.png                  → escaping symlink → skipped (fail-closed)
 * Lab B / Record RBB:
 *     LN-A-UNIQUE.png    bytes U  → Lab B has no LN-A-UNIQUE record + Lab-A bytes are not Lab-B authority
 *                                 → UNMATCHED (proves cross-lab isolation + lab-scoped dedup)
 */
import { deflateSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';

const SLUG_A = 'wsi-autoingest-acceptance-lab-a';
const SLUG_B = 'wsi-autoingest-acceptance-lab-b';
const FIXTURES_OUT = process.env.AUTOINGEST_FIXTURES_OUT ? path.resolve(process.env.AUTOINGEST_FIXTURES_OUT) : path.resolve(__dirname, '../../web/acceptance/.autoingest-fixtures.json');

function assertIsolatedAcceptanceDb(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required (isolated acceptance/test database).');
  const name = new URL(url).pathname.replace(/^\//, '');
  if (name === 'cytolab' || !/(test|accept)/i.test(name)) throw new Error(`Refusing "${name}": not an isolated acceptance DB.`);
}

/** Dependency-free solid-colour PNG — a real image libvips dzsave can tile into a full DZI. */
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
  const rootA = process.env.WF_ROOT_A ? path.resolve(process.env.WF_ROOT_A) : path.join(os.tmpdir(), 'wf-accept-a');
  const rootB = process.env.WF_ROOT_B ? path.resolve(process.env.WF_ROOT_B) : path.join(os.tmpdir(), 'wf-accept-b');
  const outside = process.env.WF_OUTSIDE ? path.resolve(process.env.WF_OUTSIDE) : path.join(os.tmpdir(), 'wf-accept-outside');
  for (const d of [rootA, rootB, outside]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }

  const prisma = new PrismaClient();
  try {
    for (const slug of [SLUG_A, SLUG_B]) {
      const prior = await prisma.lab.findUnique({ where: { slug }, select: { id: true } });
      if (prior) {
        const labId = prior.id;
        await prisma.$executeRaw`UPDATE "DigitalSlide" SET "publishedGenerationId" = NULL WHERE "labId" = ${labId}`;
        for (const t of ['SlideAsset', 'GenerationVerification', 'GenerationPublication', 'DerivativeGeneration', 'SlideProcessingJob', 'SlideIngestion', 'SlideAnnotation', 'DigitalSlide', 'IngestionDiscovery', 'IngestionSource', 'Specimen', 'Record', 'Patient']) {
          await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, labId);
        }
        await prisma.$executeRaw`DELETE FROM "LabFeature" WHERE "labId" = ${labId}`;
        await prisma.$executeRaw`DELETE FROM "Workspace" WHERE "labId" = ${labId}`;
        await prisma.$executeRaw`DELETE FROM "Account" WHERE "labId" = ${labId}`;
        await prisma.$executeRaw`DELETE FROM "Lab" WHERE id = ${labId}`;
      }
    }
    const mkLab = async (slug: string, name: string) => {
      const lab = await prisma.lab.create({ data: { name, slug } });
      const account = await prisma.account.create({ data: { name, labId: lab.id } });
      await prisma.workspace.create({ data: { name: 'Global', labId: lab.id, accountId: account.id } });
      await prisma.labFeature.create({ data: { labId: lab.id, featureKey: 'WSI_VIEWER', tier: 5, isEnabled: true, enabledAt: new Date() } });
      return lab;
    };
    const mkRecord = async (labId: string, labNumber: string | null, identifier: string) => {
      const patient = await prisma.patient.create({ data: { labId, registrationNo: randomUUID(), firstName: 'Auto', lastName: 'Ingest' } });
      return (await prisma.record.create({ data: { labId, identifier, labNumber, patientId: patient.id }, select: { id: true } })).id;
    };

    const A = await mkLab(SLUG_A, 'WSI AutoIngest Lab A');
    const B = await mkLab(SLUG_B, 'WSI AutoIngest Lab B');

    const RA = await mkRecord(A.id, 'LN-A-UNIQUE', `ID-${randomUUID().slice(0, 8)}`);
    const RB = await mkRecord(A.id, 'LN-A-DUP-META', `ID-${randomUUID().slice(0, 8)}`);
    // Ambiguity: value "AMB-1" is a labNumber of RX AND an identifier of RY → resolver returns AMBIGUOUS.
    const RX = await mkRecord(A.id, 'AMB-1', `ID-${randomUUID().slice(0, 8)}`);
    const RY = await mkRecord(A.id, 'LN-A-RY', 'AMB-1');
    // RSTAB matches a file the ASSERTION writes live (fresh mtime) to deterministically exercise the settle window.
    const RSTAB = await mkRecord(A.id, 'LN-A-STAB', `ID-${randomUUID().slice(0, 8)}`);
    const RBB = await mkRecord(B.id, 'LN-B-ONLY', `ID-${randomUUID().slice(0, 8)}`);
    // P5B-B4 — reconciliation targets: RRECON (operator resolves the UNMATCHED NO-MATCH file into it);
    // RRECON2 (the record a seeded retryable FAILED discovery is matched to).
    const RRECON = await mkRecord(A.id, 'LN-A-RECON', `ID-${randomUUID().slice(0, 8)}`);
    const RRECON2 = await mkRecord(A.id, 'LN-A-RECON2', `ID-${randomUUID().slice(0, 8)}`);
    // P5C-C2 — the record a DICOM WSI fixture (AccessionNumber 'ACC-DICOM-1') matches by exact labNumber.
    const RDICOM = await mkRecord(A.id, 'ACC-DICOM-1', `ID-${randomUUID().slice(0, 8)}`);

    const srcA = await prisma.ingestionSource.create({ data: { labId: A.id, kind: 'FILESYSTEM', rootPath: rootA, enabled: true }, select: { id: true } });
    const srcB = await prisma.ingestionSource.create({ data: { labId: B.id, kind: 'FILESYSTEM', rootPath: rootB, enabled: true }, select: { id: true } });
    // P5B-B5a — a DISABLED Lab-A source (own empty root, no files) so operational monitoring can prove the
    // enabled/disabled fact from IngestionSource.enabled without any enable/disable mutation (B5-a is read-only).
    const rootADisabled = path.join(path.dirname(rootA), 'wf-accept-a-disabled');
    fs.rmSync(rootADisabled, { recursive: true, force: true });
    fs.mkdirSync(rootADisabled, { recursive: true });
    const srcADisabled = await prisma.ingestionSource.create({ data: { labId: A.id, kind: 'FILESYSTEM', rootPath: rootADisabled, enabled: false }, select: { id: true } });

    // Real tileable files. bytes U (shared by unique + dup-meta), N (no-match), M (ambiguous) are distinct.
    const bytesU = solidPng(384, 384, [79, 70, 229]);
    const bytesN = solidPng(320, 320, [21, 128, 61]);
    const bytesM = solidPng(288, 288, [180, 83, 9]);
    fs.writeFileSync(path.join(rootA, 'LN-A-UNIQUE.png'), bytesU);
    fs.writeFileSync(path.join(rootA, 'LN-A-DUP-META.png'), bytesU); // SAME bytes, different accession → dedup by SHA-256
    fs.writeFileSync(path.join(rootA, 'NO-MATCH.png'), bytesN);
    fs.writeFileSync(path.join(rootA, 'AMB-1.png'), bytesM);
    fs.writeFileSync(path.join(rootA, 'note.txt'), 'unsupported');
    // Escaping symlink: target lives OUTSIDE the root → scanner must skip it (fail-closed).
    fs.writeFileSync(path.join(outside, 'secret.png'), solidPng(64, 64, [0, 0, 0]));
    try { fs.symlinkSync(path.join(outside, 'secret.png'), path.join(rootA, 'escape.png')); } catch { /* symlink perms — the test tolerates absence */ }
    // Lab B: same accession + same bytes as Lab A's unique → must NOT match Lab A record / dedup.
    fs.writeFileSync(path.join(rootB, 'LN-A-UNIQUE.png'), bytesU);

    // P5B-B4 — a real file (bytes Q) plus a pre-seeded RETRYABLE FAILED discovery matched to it. This models a
    // prior TRANSIENT hand-off failure: the record + byte identity are already known, so operator RETRY re-reads
    // the same confined source object, re-verifies the checksum, and reuses the accepted pipeline. FAILED is
    // terminal to the watch-folder poller, so the running worker never touches this row — only reconciliation does.
    const bytesQ = solidPng(352, 352, [67, 56, 202]);
    const b4RetryRef = 'B4-RETRY.png';
    fs.writeFileSync(path.join(rootA, b4RetryRef), bytesQ);
    const retryDisc = await prisma.ingestionDiscovery.create({
      data: {
        labId: A.id,
        sourceId: srcA.id,
        sourceRef: b4RetryRef,
        sizeBytes: bytesQ.length,
        sourceChecksum: sha256(bytesQ),
        status: 'FAILED',
        matchedRecordId: RRECON2,
        retryCount: 1,
        failureReason: 'RECONCILE_HANDOFF_FAILED: seeded transient (prior attempt)',
      },
      select: { id: true },
    });

    const fixtures = {
      labAId: A.id, labBId: B.id,
      records: { RA, RB, RX, RY, RSTAB, RBB, RRECON, RRECON2, RDICOM },
      sources: { A: srcA.id, B: srcB.id, ADisabled: srcADisabled.id },
      roots: { A: rootA, B: rootB, outside },
      // ground truth the assertion checks
      sha: { U: sha256(bytesU), N: sha256(bytesN), M: sha256(bytesM), Q: sha256(bytesQ) },
      refs: { unique: 'LN-A-UNIQUE.png', dupMeta: 'LN-A-DUP-META.png', noMatch: 'NO-MATCH.png', amb: 'AMB-1.png', labB: 'LN-A-UNIQUE.png', escape: 'escape.png', unsupported: 'note.txt', b4Retry: b4RetryRef },
      // P5B-B4 driving inputs (the assertion drives the REAL ReconciliationService with these).
      b4: { retryDiscoveryId: retryDisc.id, actorA: 'op-recon-a', actorB: 'op-recon-b', candidateRX: RX },
    };
    fs.mkdirSync(path.dirname(FIXTURES_OUT), { recursive: true });
    fs.writeFileSync(FIXTURES_OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded WSI auto-ingest fixtures → ${FIXTURES_OUT}`);
    console.log(`  rootA=${rootA} (srcA=${srcA.id}) rootB=${rootB} (srcB=${srcB.id})`);
    console.log(`  RA=${RA}(LN-A-UNIQUE) RB=${RB}(LN-A-DUP-META) RX=${RX}(AMB-1 labNo) RY=${RY}(AMB-1 identifier) | LabB RBB=${RBB}`);
  } finally {
    await prisma.$disconnect();
  }
}

function sha256(b: Buffer): string {
  return require('node:crypto').createHash('sha256').update(b).digest('hex');
}

main().catch((e) => { console.error('seed-wsi-autoingest-acceptance FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
