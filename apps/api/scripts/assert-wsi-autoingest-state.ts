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

    // ── Program 5B · B4 — human reconciliation over the classified exceptions (drives the REAL service). ──
    await runB4(prisma, fx, fails, ck);

    if (fails.length) { console.error('AUTO-INGEST ACCEPTANCE FAILURES:\n - ' + fails.join('\n - ')); process.exit(1); }
    console.log('P5B-B2/B4/B5a + P5C-C2/C3/C4/C5 AUTO-INGEST + RECONCILIATION + MONITORING + DICOM + DICOMWEB + SCANNER + HEALTH ACCEPTANCE: all persisted-truth assertions passed.');
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Program 5B · B4 — drives the REAL ReconciliationService over the exceptions the running worker produced,
 * proving persisted DB truth for: queue truth, tenant isolation, DUPLICATE-ack (no slide) + concurrency,
 * AMBIGUOUS candidate-constraint + resolve, UNMATCHED resolve → accepted pipeline, FAILED retry idempotency,
 * and the publication boundary (reconciled → READY but NEVER published). The `wsi:reconcile` 403 boundary is
 * proven separately by the real-guard authz spec (reconciliation.authz.spec.ts) — the guard is a controller
 * concern, so it is not re-exercised at the service layer here.
 *
 * We boot a SECOND Nest application context purely as a DI container to invoke the service inside lab scope.
 * The two WSI scheduler toggles are stripped from THIS process first, so this context starts no poller/worker
 * — the primary API (its workers still ON) is what tiles the reconciled INGESTED slides to READY.
 */
async function runB4(prisma: PrismaClient, fx: any, fails: string[], ck: (c: boolean, m: string) => void) {
  delete process.env.WSI_WATCH_FOLDER;
  delete process.env.WSI_PROCESSING_WORKER;
  process.env.WSI_DICOMWEB_ALLOW_LOOPBACK = 'true'; // C3 acceptance: permit the in-process 127.0.0.1 mock server
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { NestFactory } = require('@nestjs/core');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AppModule } = require('../src/app.module');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ReconciliationService } = require('../src/modules/wsi/auto-ingestion/reconciliation.service');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { IngestionMonitoringService } = require('../src/modules/wsi/auto-ingestion/ingestion-monitoring.service');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { LabContext } = require('../src/common/tenancy/lab-context');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const recon = app.get(ReconciliationService);
    const lab = app.get(LabContext);
    const asA = <T>(fn: () => Promise<T>) => lab.runLabScoped(fx.labAId, fn) as Promise<T>;
    const asB = <T>(fn: () => Promise<T>) => lab.runLabScoped(fx.labBId, fn) as Promise<T>;
    const discBy = (sourceId: string, ref: string) => prisma.ingestionDiscovery.findFirst({ where: { sourceId, sourceRef: ref } });
    const threw = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

    // (1) Queue truth — only exception states, tenant-scoped to Lab A.
    const q: any = await asA(() => recon.queue({}));
    ck(q.items.every((i: any) => ['UNMATCHED', 'AMBIGUOUS', 'DUPLICATE', 'FAILED'].includes(i.status)), 'B4 queue exposes only exception states');
    ck(!q.items.some((i: any) => i.sourceId === fx.sources.B), 'B4 queue is tenant-scoped (no Lab-B rows for a Lab-A operator)');

    const nm = await discBy(fx.sources.A, fx.refs.noMatch);   // UNMATCHED
    const amb = await discBy(fx.sources.A, fx.refs.amb);      // AMBIGUOUS
    const dupPair = await Promise.all([discBy(fx.sources.A, fx.refs.unique), discBy(fx.sources.A, fx.refs.dupMeta)]);
    const dup = dupPair.find((d) => d?.status === 'DUPLICATE');
    if (!nm || !amb || !dup) { fails.push(`B4 preconditions missing (nm=${nm?.status} amb=${amb?.status} dup=${dup?.status})`); return; }

    // (2) Tenant isolation — a Lab-B operator cannot reconcile a Lab-A discovery; the row is not mutated.
    ck(await threw(() => asB(() => recon.acknowledgeDuplicate(dup.id, fx.b4.actorB))), 'B4 tenant isolation: Lab-B operator cannot act on a Lab-A discovery');
    ck((await discBy(fx.sources.A, dup.sourceRef))?.status === 'DUPLICATE', 'B4 tenant isolation: the Lab-A DUPLICATE was not mutated by Lab B');

    // (3) DUPLICATE concurrency — two parallel acknowledges → exactly one winner, one Conflict, no new slide.
    const results = await Promise.allSettled([
      asA(() => recon.acknowledgeDuplicate(dup.id, fx.b4.actorA)),
      asA(() => recon.acknowledgeDuplicate(dup.id, fx.b4.actorA)),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    ck(ok === 1 && results.length - ok === 1, `B4 DUPLICATE concurrency: exactly one winner (ok=${ok}/${results.length})`);
    const dupFinal: any = await discBy(fx.sources.A, dup.sourceRef);
    ck(dupFinal?.status === 'RECONCILED' && dupFinal?.reconciledById === fx.b4.actorA && dupFinal?.reconciliationAction === 'ACKNOWLEDGE_DUPLICATE', 'B4 DUPLICATE ack → RECONCILED, attributed to the operator');
    ck(!dupFinal?.resultingSlideId, 'B4 DUPLICATE ack creates NO slide');
    ck(!!(dupFinal?.matchEvidence as any)?.duplicateOf, 'B4 DUPLICATE ack retains the B3 duplicateOf provenance');
    ck((await prisma.slideIngestion.count({ where: { sourceChecksum: fx.sha.U, status: 'VERIFIED' } })) === 1, 'B4 DUPLICATE ack: no second VERIFIED ingestion of bytes U');

    // (4) AMBIGUOUS — a non-candidate record is rejected (no mutation), then a valid candidate resolves & ingests.
    ck(await threw(() => asA(() => recon.resolveToRecord(amb.id, fx.records.RRECON, fx.b4.actorA))), 'B4 AMBIGUOUS: a non-candidate record is rejected');
    ck((await discBy(fx.sources.A, amb.sourceRef))?.status === 'AMBIGUOUS', 'B4 AMBIGUOUS: a rejected resolve leaves the row unmutated');
    await asA(() => recon.resolveToRecord(amb.id, fx.b4.candidateRX, fx.b4.actorA));
    const ambFinal: any = await discBy(fx.sources.A, amb.sourceRef);
    ck(ambFinal?.status === 'INGESTED' && ambFinal?.matchedRecordId === fx.b4.candidateRX && ambFinal?.reconciliationAction === 'RESOLVE_TO_RECORD', 'B4 AMBIGUOUS → candidate resolve → INGESTED, attributed');
    ck(!!ambFinal?.resultingSlideId, 'B4 AMBIGUOUS resolve produced a slide via the accepted pipeline');

    // (5) UNMATCHED — resolve into an explicit record → accepted WATCH_FOLDER handoff → INGESTED.
    await asA(() => recon.resolveToRecord(nm.id, fx.records.RRECON, fx.b4.actorA));
    const nmFinal: any = await discBy(fx.sources.A, nm.sourceRef);
    ck(nmFinal?.status === 'INGESTED' && nmFinal?.matchedRecordId === fx.records.RRECON, 'B4 UNMATCHED → resolve → INGESTED into the chosen record');
    ck(!!nmFinal?.resultingSlideId && !!nmFinal?.resultingIngestionId, 'B4 UNMATCHED resolve produced slide + ingestion');
    ck((await prisma.slideIngestion.count({ where: { id: nmFinal.resultingIngestionId, status: 'VERIFIED', sourceKind: 'WATCH_FOLDER' } })) === 1, 'B4 UNMATCHED resolve reused the accepted WATCH_FOLDER pipeline');

    // (6) FAILED retry — seeded retryable failure ingests once; a second/stale retry conflicts (no 2nd slide).
    await asA(() => recon.retry(fx.b4.retryDiscoveryId, fx.b4.actorA));
    const retryRow: any = await prisma.ingestionDiscovery.findUnique({ where: { id: fx.b4.retryDiscoveryId } });
    ck(retryRow?.status === 'INGESTED' && retryRow?.reconciliationAction === 'RETRY' && !!retryRow?.resultingSlideId, 'B4 FAILED retry → INGESTED once');
    const slidesRecon2 = await prisma.digitalSlide.count({ where: { recordId: fx.records.RRECON2 } });
    ck(await threw(() => asA(() => recon.retry(fx.b4.retryDiscoveryId, fx.b4.actorA))), 'B4 FAILED retry: a second/stale retry is refused (CAS)');
    ck((await prisma.digitalSlide.count({ where: { recordId: fx.records.RRECON2 } })) === slidesRecon2, 'B4 FAILED retry: no second slide from a repeated retry');

    // (7) Publication boundary — poll the reconciled/ingested slides to READY; they must stay DRAFT/unpublished.
    const ingestedIds = [nmFinal.resultingSlideId, ambFinal.resultingSlideId, retryRow.resultingSlideId].filter(Boolean);
    const deadline = Date.now() + 150_000;
    let ready: string[] = [];
    while (Date.now() < deadline) {
      const gens = await prisma.derivativeGeneration.findMany({ where: { slideId: { in: ingestedIds } } });
      ready = ingestedIds.filter((sid) => gens.some((g) => g.slideId === sid && g.status === 'READY' && g.sealed && g.verified));
      if (ready.length === ingestedIds.length) break;
      await sleep(3000);
    }
    ck(ready.length === ingestedIds.length, `B4 reconciled slides reached READY via the accepted worker (${ready.length}/${ingestedIds.length})`);
    ck((await prisma.digitalSlide.count({ where: { id: { in: ingestedIds }, OR: [{ publishedGenerationId: { not: null } }, { availabilityStatus: 'PUBLISHED' }] } })) === 0, 'B4 publication boundary: reconciled/ingested/READY slides are NOT published');

    console.log(`B4 reconciliation: dup=${dupFinal?.status} amb=${ambFinal?.status} unmatched=${nmFinal?.status} retry=${retryRow?.status} ready=${ready.length}/${ingestedIds.length}`);

    // ── Program 5B · B5-a — read-only operational monitoring must match persisted DB truth (Lab A). ──
    const monitoring = app.get(IngestionMonitoringService);
    const mon: any = await asA(() => monitoring.overview(new Date(0).toISOString()));

    // (A/B/C) discovery + exception counts + backlog match a raw, independently-computed Lab-A groupBy.
    const rawDisc = await prisma.ingestionDiscovery.groupBy({ by: ['status'], where: { labId: fx.labAId }, _count: { _all: true } });
    const expDisc: Record<string, number> = {};
    for (const g of rawDisc) expDisc[g.status] = g._count._all;
    const EX = ['UNMATCHED', 'AMBIGUOUS', 'DUPLICATE', 'FAILED'];
    for (const st of ['DISCOVERED', 'STABILIZING', 'MATCHED', 'UNMATCHED', 'AMBIGUOUS', 'DUPLICATE', 'INGESTED', 'FAILED', 'RECONCILED']) {
      ck((mon.totals.discoveries[st] ?? 0) === (expDisc[st] ?? 0), `B5a discovery count ${st} matches DB (${mon.totals.discoveries[st]} vs ${expDisc[st] ?? 0})`);
    }
    const expBacklog = EX.reduce((n, s) => n + (expDisc[s] ?? 0), 0);
    ck(mon.totals.reconciliationBacklog === expBacklog, `B5a reconciliation backlog matches DB exception rows (${mon.totals.reconciliationBacklog} vs ${expBacklog})`);
    ck(mon.totals.discoveries.total === rawDisc.reduce((n, g) => n + g._count._all, 0), 'B5a total discoveries match DB');

    // (D) processing counts match persisted WATCH_FOLDER job truth.
    const rawJobs = await prisma.slideProcessingJob.groupBy({ by: ['status'], where: { labId: fx.labAId, ingestion: { sourceKind: 'WATCH_FOLDER' } }, _count: { _all: true } });
    const expJobs: Record<string, number> = {};
    for (const g of rawJobs) expJobs[g.status] = g._count._all;
    for (const st of ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT']) {
      ck((mon.totals.processing[st] ?? 0) === (expJobs[st] ?? 0), `B5a processing count ${st} matches DB (${mon.totals.processing[st]} vs ${expJobs[st] ?? 0})`);
    }

    // (E) READY count matches persisted generation truth for WATCH_FOLDER slides.
    const rawReady = await prisma.derivativeGeneration.groupBy({ by: ['slideId'], where: { labId: fx.labAId, status: 'READY', slide: { sourceKind: 'WATCH_FOLDER' } }, _count: { _all: true } });
    ck(mon.totals.ready === rawReady.length, `B5a READY count matches DB (${mon.totals.ready} vs ${rawReady.length})`);

    // (F) enabled/disabled truth from IngestionSource.enabled (the DISABLED Lab-A source shows disabled).
    const disabledSrc = mon.sources.find((s: any) => s.id === fx.sources.ADisabled);
    ck(disabledSrc && disabledSrc.enabled === false && disabledSrc.facts.includes('DISABLED'), 'B5a disabled source reported DISABLED');
    const enabledSrc = mon.sources.find((s: any) => s.id === fx.sources.A);
    ck(enabledSrc && enabledSrc.enabled === true && enabledSrc.facts.includes('ENABLED'), 'B5a enabled source reported ENABLED');

    // (G) tenant isolation — Lab-A monitoring exposes ONLY Lab-A sources; no Lab-B source/rows.
    const rawSrcA = await prisma.ingestionSource.count({ where: { labId: fx.labAId } });
    ck(mon.sources.length === rawSrcA, `B5a Lab-A monitoring lists exactly its own sources (${mon.sources.length} vs ${rawSrcA})`);
    ck(!mon.sources.some((s: any) => s.id === fx.sources.B), 'B5a Lab-A monitoring never lists a Lab-B source');
    const monB: any = await asB(() => monitoring.overview(new Date(0).toISOString()));
    ck(!monB.sources.some((s: any) => s.id === fx.sources.A || s.id === fx.sources.ADisabled), 'B5a tenant isolation: Lab-B monitoring never lists a Lab-A source');

    // (H) security — no rootPath / filesystem path / secret leaks into the monitoring response.
    const monJson = JSON.stringify(mon);
    ck(!monJson.includes(fx.roots.A) && !monJson.includes(fx.roots.B) && !monJson.includes('rootPath') && !monJson.includes('matchConfig'), 'B5a monitoring leaks no rootPath/paths/secrets');

    // (J) READY-vs-PUBLISHED — every READY WATCH_FOLDER slide counted stays unpublished.
    const pub = await prisma.digitalSlide.count({ where: { labId: fx.labAId, id: { in: rawReady.map((r) => r.slideId) }, OR: [{ publishedGenerationId: { not: null } }, { availabilityStatus: 'PUBLISHED' }] } });
    ck(pub === 0, 'B5a READY monitoring never implies published (counted READY slides are unpublished)');

    console.log(`B5a monitoring: sources=${mon.sources.length} disc=${mon.totals.discoveries.total} backlog=${mon.totals.reconciliationBacklog} ready=${mon.totals.ready} procDone=${mon.totals.processing.SUCCEEDED}`);

    // ── Program 5C · C2 — native DICOM WSI → accepted pipeline → real DZI → READY (drives the REAL service;
    //    the primary API's worker + DICOM-aware materializer decode + tile it). ──
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DicomIngestionService } = require('../src/modules/wsi/dicom/dicom-ingestion.service');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { generateDicomWsiBytes } = require('../src/modules/wsi/dicom/testing/dicom-wsi-fixture');
    const dicom = app.get(DicomIngestionService);
    const study = '1.2.826.0.1.3680043.2.9999.777';
    const series = '1.2.826.0.1.3680043.2.9999.777.1';
    const dcmBytes = generateDicomWsiBytes({ studyInstanceUID: study, seriesInstanceUID: series, sopInstanceUID: study + '.1.1', accessionNumber: 'ACC-DICOM-1', includePHI: true, totalPixelMatrix: 512, frameSize: 256 });
    const nativeSha = require('node:crypto').createHash('sha256').update(dcmBytes).digest('hex');

    const c2: any = await asA(() => dicom.ingestDicomWsi(dcmBytes, { filename: 'wsi.dcm' }));
    ck(c2.outcome === 'INGESTED' && !!c2.slideId, `C2 native DICOM VALID+matched → INGESTED (got ${c2.outcome})`);
    if (c2.outcome === 'INGESTED') {
      const ing = await prisma.slideIngestion.findFirst({ where: { id: c2.ingestionId }, select: { sourceKind: true, status: true, sourceChecksum: true } });
      ck(ing?.sourceKind === 'DICOM' && ing?.status === 'VERIFIED', `C2 SlideIngestion is DICOM/VERIFIED (got ${ing?.sourceKind}/${ing?.status})`);
      ck(ing?.sourceChecksum === nativeSha, 'C2 ingestion sourceChecksum is the SHA-256 of the NATIVE DICOM bytes');
      const slide = await prisma.digitalSlide.findFirst({ where: { id: c2.slideId }, select: { sourceKind: true, availabilityStatus: true, publishedGenerationId: true, recordId: true, objectivePower: true } });
      ck(slide?.sourceKind === 'DICOM' && slide?.availabilityStatus === 'DRAFT' && slide?.publishedGenerationId === null, 'C2 slide is DICOM / DRAFT / unpublished');
      ck(slide?.recordId === fx.records.RDICOM, 'C2 slide matched the exact accession record (no fabricated identity)');
      ck(slide?.objectivePower === 20, 'C2 acquisition (objective power) mapped onto the existing DigitalSlide field');
      const sdm: any = await prisma.slideDicomMetadata.findFirst({ where: { slideId: c2.slideId } });
      ck(sdm?.studyInstanceUID === study && sdm?.seriesInstanceUID === series && sdm?.conformanceStatus === 'VALID', 'C2 SlideDicomMetadata persisted (series identity + VALID)');
      ck(!JSON.stringify(sdm).includes('DOE^JANE') && !JSON.stringify(sdm).includes('PHI-PID-123') && !('patientName' in (sdm ?? {})), 'C2 SlideDicomMetadata persists NO PHI');

      // Poll the real worker to READY (DICOM → decode → libvips DZI → sealed+verified), then prove unpublished.
      let dgen: any = null;
      const dl = Date.now() + 150_000;
      while (Date.now() < dl) {
        dgen = await prisma.derivativeGeneration.findFirst({ where: { slideId: c2.slideId }, orderBy: { createdAt: 'desc' } });
        if (dgen && dgen.status === 'READY' && dgen.sealed && dgen.verified) break;
        await sleep(3000);
      }
      ck(!!dgen && dgen.status === 'READY' && dgen.sealed && dgen.verified, `C2 DICOM slide reached READY via the real worker (got ${dgen?.status})`);
      ck(dgen?.status !== 'PUBLISHED', 'C2 generation is NOT PUBLISHED (no auto-publish)');
      const dslide = await prisma.digitalSlide.findFirst({ where: { id: c2.slideId }, select: { publishedGenerationId: true, availabilityStatus: true } });
      ck(dslide?.publishedGenerationId === null && dslide?.availabilityStatus !== 'PUBLISHED', 'C2 READY DICOM slide remains unpublished (publishedGenerationId=null)');
      if (dgen) {
        const roles = (await prisma.slideAsset.findMany({ where: { generationId: dgen.id }, select: { role: true } })).map((a) => a.role);
        ck(roles.includes('TILE_PYRAMID') && roles.includes('MANIFEST'), `C2 real DZI assets from the native DICOM (got [${roles.join(', ')}])`);
      }
    }

    // Negative: a conformant-but-unsupported profile (MONOCHROME) → UNSUPPORTED, NO slide/ingestion.
    const monoBytes = generateDicomWsiBytes({ studyInstanceUID: study + '.9', seriesInstanceUID: series + '.9', accessionNumber: 'ACC-DICOM-1', photometricInterpretation: 'MONOCHROME2', totalPixelMatrix: 128, frameSize: 64 });
    const monoRes: any = await asA(() => dicom.ingestDicomWsi(monoBytes, { filename: 'mono.dcm' }));
    ck(monoRes.outcome === 'UNSUPPORTED' && !monoRes.slideId, 'C2 unsupported profile → UNSUPPORTED, no slide');

    // Duplicate series identity → DUPLICATE, no second DICOM slide.
    const dupRes: any = await asA(() => dicom.ingestDicomWsi(dcmBytes, { filename: 'wsi-again.dcm' }));
    ck(dupRes.outcome === 'DUPLICATE' && !dupRes.slideId, 'C2 duplicate Study+Series → DUPLICATE, no second slide');
    ck((await prisma.slideDicomMetadata.count({ where: { studyInstanceUID: study, seriesInstanceUID: series } })) === 1, 'C2 exactly one SlideDicomMetadata for the series (no duplicate identity)');

    // Tenant isolation: Lab B cannot match a Lab-A accession record → UNMATCHED, no slide.
    const bBytes = generateDicomWsiBytes({ studyInstanceUID: study + '.2', seriesInstanceUID: series + '.2', accessionNumber: 'ACC-DICOM-1', totalPixelMatrix: 128, frameSize: 64 });
    const bRes: any = await asB(() => dicom.ingestDicomWsi(bBytes, { filename: 'labB.dcm' }));
    ck(bRes.outcome === 'UNMATCHED' && !bRes.slideId, 'C2 tenant isolation: Lab-B cannot match a Lab-A accession record');

    console.log(`C2 dicom: outcome=${c2.outcome} slide=${c2.slideId ?? 'none'} mono=${monoRes.outcome} dup=${dupRes.outcome} labB=${bRes.outcome}`);

    // ── Program 5C · C3 — DICOMweb import: mock endpoint → QIDO/WADO → native bytes → C2 → real worker → DZI → READY. ──
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DicomWebImportService } = require('../src/modules/wsi/dicomweb/dicomweb-import.service');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DicomWebSourceService } = require('../src/modules/wsi/dicomweb/dicomweb-source.service');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { startMockDicomWebServer } = require('../src/modules/wsi/dicomweb/testing/mock-dicomweb-server');
    const importer = app.get(DicomWebImportService);
    const dwSources = app.get(DicomWebSourceService);
    const WSI_SOP = '1.2.840.10008.5.1.4.1.1.77.1.6';

    // A fresh WSI object (unique study/series, accession ACC-DICOM-1 → matches RDICOM), with PHI.
    const cStudy = '1.2.826.0.1.3680043.2.9999.331';
    const cSeries = cStudy + '.1';
    const cSop = cSeries + '.1';
    const cBytes = generateDicomWsiBytes({ studyInstanceUID: cStudy, seriesInstanceUID: cSeries, sopInstanceUID: cSop, accessionNumber: 'ACC-DICOM-1', includePHI: true, totalPixelMatrix: 512, frameSize: 256 });
    const cSha = require('node:crypto').createHash('sha256').update(cBytes).digest('hex');
    const mono2 = generateDicomWsiBytes({ studyInstanceUID: cStudy + '.7', seriesInstanceUID: cSeries + '.7', sopInstanceUID: cSeries + '.7.1', accessionNumber: 'ACC-DICOM-1', photometricInterpretation: 'MONOCHROME2', totalPixelMatrix: 128, frameSize: 64 });
    const noMatch = generateDicomWsiBytes({ studyInstanceUID: cStudy + '.8', seriesInstanceUID: cSeries + '.8', sopInstanceUID: cSeries + '.8.1', accessionNumber: 'NOSUCHACC', totalPixelMatrix: 128, frameSize: 64 });

    const mock = await startMockDicomWebServer({
      bearerToken: 'secret-token',
      instances: [
        { studyInstanceUID: cStudy, seriesInstanceUID: cSeries, sopInstanceUID: cSop, sopClassUID: WSI_SOP, bytes: cBytes },
        // a multi-instance series (two WSI objects) → must be UNSUPPORTED
        { studyInstanceUID: cStudy + '.9', seriesInstanceUID: cSeries + '.9', sopInstanceUID: cSeries + '.9.1', sopClassUID: WSI_SOP, bytes: cBytes },
        { studyInstanceUID: cStudy + '.9', seriesInstanceUID: cSeries + '.9', sopInstanceUID: cSeries + '.9.2', sopClassUID: WSI_SOP, bytes: cBytes },
        { studyInstanceUID: cStudy + '.7', seriesInstanceUID: cSeries + '.7', sopInstanceUID: cSeries + '.7.1', sopClassUID: WSI_SOP, bytes: mono2 },
        { studyInstanceUID: cStudy + '.8', seriesInstanceUID: cSeries + '.8', sopInstanceUID: cSeries + '.8.1', sopClassUID: WSI_SOP, bytes: noMatch },
      ],
    });
    try {
      // Create a Lab-A DICOMweb source (credential encrypted at rest; never returned).
      const src: any = await asA(() => dwSources.create({ endpointBaseUrl: mock.baseUrl, authType: 'BEARER', credential: 'secret-token' }));
      ck(src.hasCredential === true && !('credentialCipher' in src), 'C3 source view exposes hasCredential but NEVER the cipher');
      const rawSrc = await prisma.ingestionSource.findFirst({ where: { id: src.id }, select: { credentialCipher: true, endpointBaseUrl: true } });
      ck(!!rawSrc?.credentialCipher && rawSrc.credentialCipher !== 'secret-token', 'C3 credential is encrypted at rest (not plaintext)');

      // (1) Positive: QIDO/WADO → native bytes → C2 → INGESTED.
      const imp: any = await asA(() => importer.importSeries({ sourceId: src.id, studyInstanceUID: cStudy, seriesInstanceUID: cSeries }));
      ck(imp.outcome === 'INGESTED' && !!imp.slideId, `C3 import VALID series → INGESTED (got ${imp.outcome} ${imp.error?.code ?? ''})`);
      if (imp.outcome === 'INGESTED') {
        const ing = await prisma.slideIngestion.findFirst({ where: { id: imp.ingestionId }, select: { sourceKind: true, status: true, sourceChecksum: true } });
        ck(ing?.sourceKind === 'DICOM' && ing?.status === 'VERIFIED' && ing?.sourceChecksum === cSha, 'C3 native-byte provenance: DICOM/VERIFIED + SHA-256 of the WADO-retrieved native object');
        const sdm: any = await prisma.slideDicomMetadata.findFirst({ where: { slideId: imp.slideId } });
        ck(sdm?.studyInstanceUID === cStudy && sdm?.seriesInstanceUID === cSeries, 'C3 series identity persisted from the native object');
        ck(!JSON.stringify(sdm).includes('DOE^JANE') && !JSON.stringify(sdm).includes('PHI-PID-123'), 'C3 no PHI persisted');
        // real worker → DZI → READY, unpublished
        let g: any = null; const dl = Date.now() + 150_000;
        while (Date.now() < dl) { g = await prisma.derivativeGeneration.findFirst({ where: { slideId: imp.slideId }, orderBy: { createdAt: 'desc' } }); if (g && g.status === 'READY' && g.sealed && g.verified) break; await sleep(3000); }
        ck(!!g && g.status === 'READY' && g.sealed && g.verified, `C3 imported DICOM reached READY via the real worker (got ${g?.status})`);
        const sl = await prisma.digitalSlide.findFirst({ where: { id: imp.slideId }, select: { publishedGenerationId: true, availabilityStatus: true } });
        ck(sl?.publishedGenerationId === null && sl?.availabilityStatus !== 'PUBLISHED', 'C3 READY import remains unpublished (no auto-publish)');
      }

      // (2) Idempotency / duplicate: re-import the same series → DUPLICATE/INGESTED short-circuit, no new slide.
      const dup2: any = await asA(() => importer.importSeries({ sourceId: src.id, studyInstanceUID: cStudy, seriesInstanceUID: cSeries }));
      ck(['DUPLICATE', 'INGESTED'].includes(dup2.outcome), `C3 re-import is idempotent (got ${dup2.outcome})`);
      ck((await prisma.slideDicomMetadata.count({ where: { studyInstanceUID: cStudy, seriesInstanceUID: cSeries } })) === 1, 'C3 exactly one SlideDicomMetadata for the series (no duplicate identity)');

      // (3) Multi-instance WSI series → UNSUPPORTED (C2 single-object contract not widened).
      const multi: any = await asA(() => importer.importSeries({ sourceId: src.id, studyInstanceUID: cStudy + '.9', seriesInstanceUID: cSeries + '.9' }));
      ck(multi.outcome === 'UNSUPPORTED', `C3 multi-instance series → UNSUPPORTED (got ${multi.outcome})`);

      // (4) Conformant-but-unsupported (MONOCHROME) → UNSUPPORTED, no slide.
      const monoImp: any = await asA(() => importer.importSeries({ sourceId: src.id, studyInstanceUID: cStudy + '.7', seriesInstanceUID: cSeries + '.7' }));
      ck(monoImp.outcome === 'UNSUPPORTED' && !monoImp.slideId, `C3 unsupported profile → UNSUPPORTED (got ${monoImp.outcome})`);

      // (5) Unmatched accession → UNMATCHED, no slide.
      const um: any = await asA(() => importer.importSeries({ sourceId: src.id, studyInstanceUID: cStudy + '.8', seriesInstanceUID: cSeries + '.8' }));
      ck(um.outcome === 'UNMATCHED' && !um.slideId, `C3 unmatched accession → UNMATCHED (got ${um.outcome})`);

      // (6) Auth rejected: a source with the wrong credential → FAILED(AUTH_REJECTED), no slide. Uses the
      // 'localhost' alias of the same mock (a distinct endpoint string, so the per-(lab,endpoint) unique holds).
      const badSrc: any = await asA(() => dwSources.create({ endpointBaseUrl: mock.baseUrl.replace('127.0.0.1', 'localhost'), authType: 'BEARER', credential: 'wrong-token' }));
      const bad: any = await asA(() => importer.importSeries({ sourceId: badSrc.id, studyInstanceUID: cStudy + '.8', seriesInstanceUID: cSeries + '.8' }));
      ck(bad.outcome === 'FAILED' && bad.error?.code === 'AUTH_REJECTED', `C3 bad credential → FAILED(AUTH_REJECTED) (got ${bad.outcome}/${bad.error?.code})`);

      // (7) SSRF: a source whose endpoint resolves to a private address → FAILED(HOST_NOT_ALLOWED), never fetched.
      const ssrfSrc: any = await asA(() => dwSources.create({ endpointBaseUrl: 'https://10.0.0.1/dicomweb', authType: 'BEARER', credential: 't' }));
      const ssrf: any = await asA(() => importer.importSeries({ sourceId: ssrfSrc.id, studyInstanceUID: cStudy, seriesInstanceUID: cSeries }));
      ck(ssrf.outcome === 'FAILED' && ssrf.error?.code === 'HOST_NOT_ALLOWED', `C3 SSRF private-IP endpoint → FAILED(HOST_NOT_ALLOWED) (got ${ssrf.outcome}/${ssrf.error?.code})`);

      // (8) Tenant isolation: Lab B imports a series whose accession matches only a Lab-A record → UNMATCHED.
      const bSrc: any = await asB(() => dwSources.create({ endpointBaseUrl: mock.baseUrl, authType: 'BEARER', credential: 'secret-token' }));
      const bImp: any = await asB(() => importer.importSeries({ sourceId: bSrc.id, studyInstanceUID: cStudy + '.8', seriesInstanceUID: cSeries + '.8' }));
      ck(bImp.outcome === 'UNMATCHED', `C3 tenant isolation: Lab-B import of a Lab-A accession → UNMATCHED (got ${bImp.outcome})`);

      console.log(`C3 dicomweb: import=${imp.outcome} dup=${dup2.outcome} multi=${multi.outcome} mono=${monoImp.outcome} unmatched=${um.outcome} auth=${bad.error?.code} ssrf=${ssrf.error?.code} labB=${bImp.outcome}`);

      // ── Program 5C · C4 — scanner-adapter framework: filesystem-dicom (.dcm → C2 → DZI → READY) + dicomweb delegate. ──
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ScannerRouterService } = require('../src/modules/wsi/scanner/scanner-router.service');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { IngestionSourceService } = require('../src/modules/wsi/auto-ingestion/ingestion-source.service');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodeOs = require('node:os');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodeFs = require('node:fs');
      const router = app.get(ScannerRouterService);
      const srcSvc = app.get(IngestionSourceService);

      // A scanner drops a real native .dcm (unique study/series, accession ACC-DICOM-1) into a watch dir.
      const scanRoot = nodeFs.mkdtempSync(require('node:path').join(nodeOs.tmpdir(), 'c4-scan-'));
      const s4Study = '1.2.826.0.1.3680043.2.9999.441';
      const s4Series = s4Study + '.1';
      const s4Bytes = generateDicomWsiBytes({ studyInstanceUID: s4Study, seriesInstanceUID: s4Series, sopInstanceUID: s4Series + '.1', accessionNumber: 'ACC-DICOM-1', includePHI: true, totalPixelMatrix: 512, frameSize: 256 });
      const s4Sha = require('node:crypto').createHash('sha256').update(s4Bytes).digest('hex');
      const dcmPath = require('node:path').join(scanRoot, 'scan-A.dcm');
      nodeFs.writeFileSync(dcmPath, s4Bytes);
      // Backdate mtime beyond settleMs so the completeness (mtime-quiescence) gate passes deterministically.
      const old = new Date(Date.now() - 3_600_000);
      nodeFs.utimesSync(dcmPath, old, old);

      const fsdSource: any = await asA(() => srcSvc.create({ rootPath: scanRoot, adapterType: 'FILESYSTEM_DICOM' }));
      const run1: any = await asA(() => router.runSource(fsdSource.id));
      const r1 = run1.results.find((r: any) => r.sourceRef === 'scan-A.dcm');
      ck(run1.adapterType === 'FILESYSTEM_DICOM' && r1?.outcome === 'INGESTED' && !!r1?.slideId, `C4 filesystem-dicom scan → INGESTED via C2 (got ${r1?.outcome})`);
      let c4Ready = false;
      if (r1?.outcome === 'INGESTED') {
        const ing = await prisma.slideIngestion.findFirst({ where: { id: (await prisma.ingestionDiscovery.findFirst({ where: { sourceId: fsdSource.id, sourceRef: 'scan-A.dcm' }, select: { resultingIngestionId: true } }))?.resultingIngestionId ?? '' }, select: { sourceKind: true, status: true, sourceChecksum: true } });
        ck(ing?.sourceKind === 'DICOM' && ing?.status === 'VERIFIED' && ing?.sourceChecksum === s4Sha, 'C4 native-byte provenance: DICOM/VERIFIED + SHA-256 of the exact native .dcm bytes');
        const sdm: any = await prisma.slideDicomMetadata.findFirst({ where: { slideId: r1.slideId } });
        ck(sdm?.studyInstanceUID === s4Study && !JSON.stringify(sdm).includes('DOE^JANE'), 'C4 series identity persisted, no PHI');
        let g: any = null; const dl2 = Date.now() + 150_000;
        while (Date.now() < dl2) { g = await prisma.derivativeGeneration.findFirst({ where: { slideId: r1.slideId }, orderBy: { createdAt: 'desc' } }); if (g && g.status === 'READY' && g.sealed && g.verified) break; await sleep(3000); }
        c4Ready = !!g && g.status === 'READY' && g.sealed && g.verified;
        ck(c4Ready, `C4 scanner DICOM reached READY via the real worker (got ${g?.status})`);
        const sl = await prisma.digitalSlide.findFirst({ where: { id: r1.slideId }, select: { publishedGenerationId: true, availabilityStatus: true, sourceKind: true } });
        ck(sl?.publishedGenerationId === null && sl?.availabilityStatus !== 'PUBLISHED' && sl?.sourceKind === 'DICOM', 'C4 READY scanner slide is DICOM-provenance + unpublished');
      }

      // Idempotent re-scan → no second slide identity.
      const run2: any = await asA(() => router.runSource(fsdSource.id));
      const r2 = run2.results.find((r: any) => r.sourceRef === 'scan-A.dcm');
      ck(['INGESTED', 'DUPLICATE'].includes(r2?.outcome), `C4 re-scan is idempotent (got ${r2?.outcome})`);
      ck((await prisma.ingestionDiscovery.count({ where: { sourceId: fsdSource.id, sourceRef: 'scan-A.dcm' } })) === 1, 'C4 exactly one discovery identity for the scanned object');

      // Incomplete (freshly-written) .dcm → INCOMPLETE, no slide.
      const freshPath = require('node:path').join(scanRoot, 'scan-fresh.dcm');
      nodeFs.writeFileSync(freshPath, generateDicomWsiBytes({ studyInstanceUID: s4Study + '.2', seriesInstanceUID: s4Series + '.2', sopInstanceUID: s4Series + '.2.1', accessionNumber: 'ACC-DICOM-1', totalPixelMatrix: 128, frameSize: 64 }));
      const run3: any = await asA(() => router.runSource(fsdSource.id));
      const r3 = run3.results.find((r: any) => r.sourceRef === 'scan-fresh.dcm');
      ck(r3?.outcome === 'INCOMPLETE', `C4 freshly-written scan → INCOMPLETE (got ${r3?.outcome})`);
      ck(!(await prisma.slideDicomMetadata.findFirst({ where: { studyInstanceUID: s4Study + '.2' } })), 'C4 incomplete scan created NO slide');

      // DICOMweb adapter delegates to the accepted C3 importSeries. Label the existing C3 source with
      // adapterType=DICOMWEB (raw — the source service doesn't set it), then run the adapter: QIDO discovers
      // the already-imported cStudy/cSeries → importSeries returns DUPLICATE/INGESTED (proving delegation to C3).
      await prisma.ingestionSource.update({ where: { id: src.id }, data: { adapterType: 'DICOMWEB' } });
      const runWeb: any = await asA(() => router.runSource(src.id));
      const rWeb = runWeb.results.find((r: any) => r.sourceRef === `${cStudy}/${cSeries}`);
      const c4web = rWeb?.outcome ?? 'none';
      ck(['INGESTED', 'DUPLICATE'].includes(rWeb?.outcome) && runWeb.adapterType === 'DICOMWEB', `C4 dicomweb adapter delegates to C3 importSeries (got ${rWeb?.outcome})`);

      console.log(`C4 scanner: fsdicom=${r1?.outcome} ready=${c4Ready} rescan=${r2?.outcome} incomplete=${r3?.outcome} dicomweb=${c4web}`);

      // ── Program 5C · C5 — source health + enterprise import monitoring (drives the REAL health service). ──
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { SourceHealthService } = require('../src/modules/wsi/health/source-health.service');
      const healthSvc = app.get(SourceHealthService);
      const discCountA = () => prisma.ingestionDiscovery.count({ where: { sourceId: fx.sources.A } });
      const before = await discCountA();

      // (1) FILESYSTEM reachable (the B2 watch-folder root exists) → HEALTHY.
      const beforeCheckMs = Date.now();
      const fsHealthy: any = await asA(() => healthSvc.checkSource(fx.sources.A, { manual: true }));
      ck(fsHealthy.state === 'HEALTHY', `C5 reachable filesystem source → HEALTHY (got ${fsHealthy.state})`);

      // (1b) The persisted snapshot honours the approved 5-minute cadence floor (no sub-5-minute recurring check).
      const persistedA: any = await asA(() => prisma.ingestionSourceHealth.findUnique({ where: { sourceId: fx.sources.A } }));
      ck(!!persistedA?.nextEligibleCheckAt && persistedA.nextEligibleCheckAt.getTime() - beforeCheckMs >= 300_000,
        `C5 nextEligibleCheckAt >= 5min ahead (approved cadence floor; got +${persistedA?.nextEligibleCheckAt ? Math.round((persistedA.nextEligibleCheckAt.getTime() - beforeCheckMs) / 1000) : 'null'}s)`);

      // (2) FILESYSTEM missing root → UNREACHABLE, then create the dir + recheck → HEALTHY (recovery transition).
      const missRoot = require('node:path').join(nodeOs.tmpdir(), 'c5-missing-' + require('node:crypto').randomUUID());
      const missSrc: any = await asA(() => srcSvc.create({ rootPath: missRoot, adapterType: 'FILESYSTEM_IMAGE' }));
      const miss1: any = await asA(() => healthSvc.checkSource(missSrc.id, { manual: true }));
      ck(miss1.state === 'UNREACHABLE' && miss1.errorCode === 'FILESYSTEM_NOT_FOUND', `C5 missing filesystem root → UNREACHABLE/FILESYSTEM_NOT_FOUND (got ${miss1.state}/${miss1.errorCode})`);
      nodeFs.mkdirSync(missRoot, { recursive: true });
      const miss2: any = await asA(() => healthSvc.checkSource(missSrc.id, { manual: true }));
      ck(miss2.state === 'HEALTHY', `C5 recovery: recreated root → HEALTHY (got ${miss2.state})`);

      // (3) DICOMWEB reachable + authenticated (the C3 mock) → HEALTHY (minimal QIDO, no WADO/import).
      const webHealthy: any = await asA(() => healthSvc.checkSource(src.id, { manual: true }));
      ck(webHealthy.state === 'HEALTHY', `C5 valid DICOMweb endpoint → HEALTHY (got ${webHealthy.state}/${webHealthy.errorCode ?? ''})`);

      // (4) DICOMWEB bad credential → AUTH_REJECTED; (5) SSRF private-IP endpoint → MISCONFIGURED/HOST_REJECTED.
      const webAuth: any = await asA(() => healthSvc.checkSource(badSrc.id, { manual: true }));
      ck(webAuth.state === 'AUTH_REJECTED' && webAuth.errorCode === 'DICOMWEB_AUTH_REJECTED', `C5 bad credential → AUTH_REJECTED (got ${webAuth.state}/${webAuth.errorCode})`);
      const webSsrf: any = await asA(() => healthSvc.checkSource(ssrfSrc.id, { manual: true }));
      ck(webSsrf.state === 'MISCONFIGURED' && webSsrf.errorCode === 'DICOMWEB_HOST_REJECTED', `C5 SSRF endpoint → MISCONFIGURED/DICOMWEB_HOST_REJECTED (got ${webSsrf.state}/${webSsrf.errorCode})`);

      // (6) Monitoring surfaces the health snapshot + windows, and leaks no endpoint/credential/rootPath.
      const m5: any = await asA(() => monitoring.overview(new Date().toISOString()));
      const srcAmon = m5.sources.find((s: any) => s.id === fx.sources.A);
      ck(srcAmon?.health?.state === 'HEALTHY' && typeof srcAmon.health.stale === 'boolean', 'C5 monitoring surfaces the per-source health snapshot + derived stale');
      ck(!!m5.totals.windows?.day && typeof m5.totals.windows.day.ingested === 'number', 'C5 monitoring exposes windowed throughput (hour/day/week)');
      const m5json = JSON.stringify(m5);
      ck(!m5json.includes(fx.roots.A) && !m5json.includes(mock.baseUrl) && !m5json.includes('secret-token') && !m5json.includes('credentialCipher'), 'C5 monitoring leaks no rootPath/endpoint/credential');

      // (7) No intake side effect: health checking created no new discovery/slide for the source.
      ck((await discCountA()) === before, 'C5 health checks create NO discovery (no intake side effect)');

      nodeFs.rmSync(scanRoot, { recursive: true, force: true });
      nodeFs.rmSync(missRoot, { recursive: true, force: true });
      console.log(`C5 health: fs=${fsHealthy.state} miss=${miss1.state}->${miss2.state} web=${webHealthy.state} auth=${webAuth.state} ssrf=${webSsrf.state}`);
    } finally {
      await mock.close().catch(() => undefined);
    }
  } finally {
    await app.close().catch(() => undefined);
  }
}

main().catch((e) => { console.error('assert-wsi-autoingest-state FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
