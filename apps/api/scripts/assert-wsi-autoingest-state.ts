/**
 * Program 5B · B2 — DB-truth assertion for the worker-enabled automated watch-folder gate.
 *
 * Polls persisted backend state until the automated path (filesystem → discovery → stable → SHA-256 →
 * exact match → WATCH_FOLDER hand-off → accepted worker → sealed+verified) reaches READY, then asserts the
 * full truth: discovery outcomes (INGESTED / DUPLICATE / UNMATCHED / AMBIGUOUS), byte-based dedup, security
 * (unsupported + escaping symlink not discovered), the slide is DRAFT/unpublished, the generation is READY
 * and NOT PUBLISHED (no auto-publish), idempotency (one discovery/slide/ingestion), and tenant isolation.
 */
import { deflateSync } from 'node:zlib';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SETTLE_MS = Number(process.env.WSI_WATCH_FOLDER_SETTLE_MS ?? 5000);

/** Real tileable PNG (self-contained) for the live stability-window file. */
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

function assertIsolatedAcceptanceDb(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required (isolated acceptance/test database).');
  const name = new URL(url).pathname.replace(/^\//, '');
  if (name === 'cytolab' || !/(test|accept)/i.test(name)) throw new Error(`Refusing "${name}": not an isolated acceptance DB.`);
}

async function main() {
  assertIsolatedAcceptanceDb();
  const fx = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../web/acceptance/.autoingest-fixtures.json'), 'utf8'));
  const prisma = new PrismaClient(); // raw client (no tenancy extension) → sees every lab for cross-lab assertions
  const fails: string[] = [];
  const ck = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

  try {
    const discBy = (sourceId: string, sourceRef: string) => prisma.ingestionDiscovery.findFirst({ where: { sourceId, sourceRef } });

    // ── Stability (deterministic): write a FRESH-mtime file so quiescence genuinely gates it for settleMs.
    //    During the settle window it must be STABILIZING with NO slide; after settle it progresses to INGESTED. ──
    const stabRef = 'LN-A-STAB.png';
    fs.writeFileSync(path.join(fx.roots.A, stabRef), solidPng(256, 256, [124, 58, 237]));
    await sleep(Math.max(1500, Math.floor(SETTLE_MS * 0.5))); // < settleMs → mtime-quiet not yet satisfied
    const stabMid = await discBy(fx.sources.A, stabRef);
    ck(!!stabMid && ['DISCOVERED', 'STABILIZING'].includes(stabMid.status), `stability: fresh file must be pre-ingestion within the settle window (got ${stabMid?.status ?? 'MISSING'})`);
    ck(!stabMid?.resultingSlideId, 'stability: no slide created before the settle window elapses');
    ck(!(await prisma.digitalSlide.findFirst({ where: { recordId: fx.records.RSTAB } })), 'stability: no premature slide for the stabilizing file');

    // ── Poll until BOTH the pre-seeded unique file AND the live stability file reach READY. ──
    let winner: any = null; // the INGESTED discovery among the byte-U pair
    let gen: any = null;
    let stabIngested = false;
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const [u, dupm, st] = await Promise.all([discBy(fx.sources.A, fx.refs.unique), discBy(fx.sources.A, fx.refs.dupMeta), discBy(fx.sources.A, stabRef)]);
      stabIngested = st?.status === 'INGESTED' && !!st?.resultingSlideId;
      winner = [u, dupm].find((d) => d && d.status === 'INGESTED' && d.resultingSlideId) ?? null;
      if (winner) {
        gen = await prisma.derivativeGeneration.findFirst({ where: { slideId: winner.resultingSlideId }, orderBy: { createdAt: 'desc' } });
        if (gen && gen.status === 'READY' && gen.sealed && gen.verified && stabIngested) break;
      }
      await sleep(3000);
    }
    if (!winner) fails.push('no INGESTED discovery with a resulting slide (automated hand-off never completed)');
    if (!gen || gen.status !== 'READY' || !gen.sealed || !gen.verified) fails.push(`winning generation not sealed+verified+READY (status=${gen?.status ?? 'MISSING'} sealed=${gen?.sealed} verified=${gen?.verified})`);
    ck(stabIngested, 'stability: the fresh file did NOT progress to INGESTED after the settle window');

    // ── Discovery outcomes for source A. ──
    const [u, dupm, nm, amb, unsup, esc] = await Promise.all([
      discBy(fx.sources.A, fx.refs.unique), discBy(fx.sources.A, fx.refs.dupMeta), discBy(fx.sources.A, fx.refs.noMatch),
      discBy(fx.sources.A, fx.refs.amb), discBy(fx.sources.A, fx.refs.unsupported), discBy(fx.sources.A, fx.refs.escape),
    ]);
    // exactly one of {unique, dupMeta} is INGESTED, the other DUPLICATE — dedup by SHA-256, not accession.
    const ingested = [u, dupm].filter((d) => d?.status === 'INGESTED');
    const dupes = [u, dupm].filter((d) => d?.status === 'DUPLICATE');
    ck(ingested.length === 1, `expected exactly 1 INGESTED among the byte-U pair, got ${ingested.length}`);
    ck(dupes.length === 1, `expected exactly 1 DUPLICATE among the byte-U pair, got ${dupes.length}`);
    ck(ingested[0]?.sourceChecksum === fx.sha.U && dupes[0]?.sourceChecksum === fx.sha.U, 'byte-U pair checksums must both equal sha(U)');
    ck(!dupes[0]?.resultingSlideId, 'DUPLICATE discovery must not have a resulting slide (no second ingestion)');
    // B3: the DUPLICATE carries truthful provenance of the prior authoritative object (in matchEvidence only),
    //     with NO clinical inheritance on the duplicate itself.
    const dof = (dupes[0]?.matchEvidence as any)?.duplicateOf;
    ck(dof?.by === 'sourceChecksum' && dof?.sourceChecksum === fx.sha.U, `DUPLICATE.matchEvidence.duplicateOf must record by=sourceChecksum + sha(U) (got ${JSON.stringify(dof)})`);
    ck(dof?.priorIngestionId === ingested[0]?.resultingIngestionId && dof?.priorSlideId === ingested[0]?.resultingSlideId, 'DUPLICATE provenance must reference the prior authoritative ingestion/slide');
    ck(!dupes[0]?.matchedRecordId && !dupes[0]?.matchedSpecimenId, 'DUPLICATE must not inherit a clinical (record/specimen) association');

    ck(nm?.status === 'UNMATCHED' && !nm?.resultingSlideId && !nm?.matchedRecordId, `NO-MATCH must be UNMATCHED with no record/slide (got ${nm?.status})`);
    ck(nm?.sourceChecksum === fx.sha.N, 'UNMATCHED discovery should carry the real sha(N)');
    ck(amb?.status === 'AMBIGUOUS' && !amb?.resultingSlideId && !amb?.matchedRecordId, `AMB-1 must be AMBIGUOUS with no record/slide (got ${amb?.status})`);
    ck(!unsup, 'unsupported note.txt must NOT be discovered (extension filter)');
    if (fs.existsSync(path.join(fx.roots.A, fx.refs.escape))) ck(!esc, 'escaping symlink must NOT be discovered (fail-closed)');

    // ── The winning slide + ingestion + generation truth. ──
    if (winner) {
      const slide = await prisma.digitalSlide.findFirst({ where: { id: winner.resultingSlideId }, select: { sourceKind: true, availabilityStatus: true, publishedGenerationId: true, recordId: true } });
      const ing = await prisma.slideIngestion.findFirst({ where: { id: winner.resultingIngestionId }, select: { sourceKind: true, status: true, sourceChecksum: true } });
      ck(slide?.sourceKind === 'WATCH_FOLDER', `slide.sourceKind must be WATCH_FOLDER (got ${slide?.sourceKind})`);
      ck(slide?.availabilityStatus === 'DRAFT' && slide?.publishedGenerationId === null, 'slide must be DRAFT / unpublished (publishedGenerationId=null)');
      ck([fx.records.RA, fx.records.RB].includes(slide?.recordId as string), 'slide.recordId must be an authoritative matched record');
      ck(ing?.sourceKind === 'WATCH_FOLDER' && ing?.status === 'VERIFIED', `ingestion must be WATCH_FOLDER/VERIFIED (got ${ing?.sourceKind}/${ing?.status})`);
      ck(ing?.sourceChecksum === fx.sha.U, 'ingestion.sourceChecksum must equal the real file sha(U)');
      if (gen) {
        ck(gen.status !== 'PUBLISHED', 'generation must NOT be PUBLISHED (no auto-publish)');
        const roles = (await prisma.slideAsset.findMany({ where: { generationId: gen.id }, select: { role: true } })).map((a) => a.role);
        ck(roles.includes('TILE_PYRAMID') && roles.includes('MANIFEST'), `real worker assets expected (got [${roles.join(', ')}])`);
      }
    }

    // ── Idempotency: exactly one discovery per (source, ref); the byte-U pair produced exactly one slide+ingestion. ──
    const uniqueRows = await prisma.ingestionDiscovery.count({ where: { sourceId: fx.sources.A, sourceRef: fx.refs.unique } });
    ck(uniqueRows === 1, `expected exactly 1 discovery row for the unique file, got ${uniqueRows}`);
    const verifiedU = await prisma.slideIngestion.count({ where: { sourceChecksum: fx.sha.U, status: 'VERIFIED' } });
    ck(verifiedU === 1, `expected exactly 1 VERIFIED ingestion for bytes U (no duplicate handoff), got ${verifiedU}`);

    // ── Tenant isolation: Lab B's same-accession same-bytes file cannot match Lab A / use Lab A bytes as authority. ──
    const labB = await discBy(fx.sources.B, fx.refs.labB);
    ck(labB?.status === 'UNMATCHED' && !labB?.resultingSlideId, `Lab-B file must be UNMATCHED (no cross-lab match/dedup); got ${labB?.status}`);

    // ── Source truth. ──
    const src = await prisma.ingestionSource.findFirst({ where: { id: fx.sources.A }, select: { labId: true, kind: true, enabled: true, rootPath: true } });
    ck(src?.labId === fx.labAId && src?.kind === 'FILESYSTEM' && src?.enabled === true && src?.rootPath === fx.roots.A, 'IngestionSource A truth (lab/FILESYSTEM/enabled/root)');

    console.log(`stabIngested=${stabIngested} winner=${winner?.id ?? 'none'} gen=${gen?.status ?? 'none'}`);
    if (fails.length) { console.error('AUTO-INGEST ACCEPTANCE FAILURES:\n - ' + fails.join('\n - ')); process.exit(1); }
    console.log('P5B-B2 AUTO-INGEST ACCEPTANCE: all persisted-truth assertions passed.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('assert-wsi-autoingest-state FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
