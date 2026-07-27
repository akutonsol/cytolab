import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IngestionDiscoveryService } from './ingestion-discovery.service';
import { AccessionMatchResolver } from './accession-match.resolver';
import { AutomatedIngestionComposer } from './automated-ingestion-composer';
import { WatchFolderScanner, type DiscoveredFile } from './watch-folder-scanner';
import { WATCH_FOLDER_CONFIG, type WatchFolderConfig } from './watch-folder-config';
import { isStable, extractAccession } from './watch-folder-util';

const TERMINAL = new Set(['UNMATCHED', 'AMBIGUOUS', 'DUPLICATE', 'INGESTED', 'FAILED', 'RECONCILED', 'MATCHED']);

/**
 * Program 5B · B2 — the per-source, per-file automated pipeline. MUST run inside the source's authoritative
 * lab context (the scheduler opens `runJob({ labId })`), so every DB read/write here is tenant-scoped by the
 * extension — a Lab-A source can only discover Lab-A files and match Lab-A records.
 *
 * Per file: idempotent discovery → stability (DISCOVERED→STABILIZING→stable) → SHA-256 → byte-dedup →
 * exact accession match → (unique only) server-owned WATCH_FOLDER hand-off into the accepted 5A pipeline →
 * truthful state persisted (INGESTED only after the accepted service actually created + verified the slide).
 * UNMATCHED/AMBIGUOUS/DUPLICATE never create a slide. Failures persist a truthful FAILED reason (not a log).
 */
@Injectable()
export class WatchFolderProcessor {
  private readonly logger = new Logger(WatchFolderProcessor.name);

  constructor(
    private readonly discovery: IngestionDiscoveryService,
    private readonly resolver: AccessionMatchResolver,
    private readonly composer: AutomatedIngestionComposer,
    private readonly scanner: WatchFolderScanner,
    @Inject(WATCH_FOLDER_CONFIG) private readonly cfg: WatchFolderConfig,
  ) {}

  /** Scan + process one enabled source (already in its lab context). */
  async processSource(source: { id: string; rootPath: string; matchConfig: unknown }): Promise<void> {
    const files = await this.scanner.scan(source.rootPath, { exts: this.cfg.exts, max: this.cfg.maxFilesPerScan });
    for (const f of files) {
      try {
        await this.processFile(source, f);
      } catch (e) {
        // Isolate one bad file — never abort the source scan; the failure is persisted per-discovery below.
        this.logger.error(`watch-folder file failed (source=${source.id}, ref=${f.sourceRef}): ${(e as Error)?.message}`);
      }
    }
  }

  private async processFile(source: { id: string; matchConfig: unknown }, f: DiscoveredFile): Promise<void> {
    const d = await this.discovery.recordDiscovery({ sourceId: source.id, sourceRef: f.sourceRef, sizeBytes: f.sizeBytes });
    if (TERMINAL.has(d.status)) return; // already resolved / in-flight-matched — never re-ingest (idempotent)

    // ── Stability: first sighting establishes a baseline; ingest only after size is stable across polls. ──
    if (d.status === 'DISCOVERED') {
      await this.discovery.setStatus(d.id, 'STABILIZING', { sizeBytes: f.sizeBytes });
      return; // baseline recorded; wait for the next poll
    }
    // d.status === 'STABILIZING'
    if (d.sizeBytes !== f.sizeBytes) {
      await this.discovery.setStatus(d.id, 'STABILIZING', { sizeBytes: f.sizeBytes }); // still changing → reset
      return;
    }
    if (!isStable(d.sizeBytes, f.sizeBytes, f.mtimeMs, Date.now(), this.cfg.settleMs)) return; // mtime not yet quiet

    // ── Authoritative byte identity (SHA-256 of the source bytes). ──
    let checksum: string;
    try {
      checksum = await sha256File(f.absPath);
    } catch (e) {
      await this.fail(d.id, `CHECKSUM_READ_FAILED: ${(e as Error)?.message ?? 'unreadable'}`);
      return;
    }

    // ── Byte dedup (B1 contract): same bytes in this lab → truthful DUPLICATE, never silently re-ingested. ──
    //    B3: persist WHICH prior authoritative object caused the verdict (provenance only — no clinical
    //    inheritance: matchedRecordId/specimenId/resultingSlideId/resultingIngestionId stay null; the
    //    human-reconciliation fields are untouched).
    const dup = await this.discovery.findDuplicateBytes(checksum);
    if (dup) {
      await this.discovery.setStatus(d.id, 'DUPLICATE', { sourceChecksum: checksum, matchEvidence: { duplicateOf: dup } as unknown as Prisma.InputJsonValue });
      return;
    }

    // ── Exact accession match (unique only proceeds). ──
    const accession = extractAccession(f.sourceRef, source.matchConfig);
    const outcome = await this.resolver.resolve(accession);
    if (outcome.kind === 'none') {
      await this.discovery.setStatus(d.id, 'UNMATCHED', { sourceChecksum: checksum, matchEvidence: { accession } });
      return;
    }
    if (outcome.kind === 'ambiguous') {
      await this.discovery.setStatus(d.id, 'AMBIGUOUS', { sourceChecksum: checksum, matchEvidence: { accession, candidateRecordIds: outcome.candidateRecordIds } });
      return;
    }

    // ── Unique match → MATCHED, then server-owned hand-off into the accepted 5A pipeline. ──
    await this.discovery.setStatus(d.id, 'MATCHED', {
      sourceChecksum: checksum,
      matchedRecordId: outcome.recordId,
      matchEvidence: { accession, matchedBy: outcome.matchedBy },
    });
    try {
      const res = await this.composer.ingestMatchedFile({
        absPath: f.absPath,
        filename: f.sourceRef.split('/').pop() ?? f.sourceRef,
        sizeBytes: f.sizeBytes,
        recordId: outcome.recordId,
        specimenId: null, // record-level (P5-7 unassigned); no specimen inferred from filename
        expectedChecksum: checksum,
      });
      // INGESTED only after the accepted service actually created + verified the slide.
      await this.discovery.setStatus(d.id, 'INGESTED', { resultingSlideId: res.slideId, resultingIngestionId: res.ingestionId });
    } catch (e) {
      await this.fail(d.id, `HANDOFF_FAILED: ${(e as Error)?.message ?? 'unknown'}`);
    }
  }

  private async fail(id: string, reason: string): Promise<void> {
    // FAILED is terminal (reconciliation-required) — never re-attempted, so no hot retry loop; retryCount records the attempt.
    const cur = await this.discovery.get(id).catch(() => null);
    await this.discovery.setStatus(id, 'FAILED', { failureReason: reason, retryCount: (cur?.retryCount ?? 0) + 1 });
  }
}

/** Stream the file through a SHA-256 (never buffers the whole gigapixel file). */
export function sha256File(absPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const s = createReadStream(absPath);
    s.on('error', reject);
    s.on('data', (c) => hash.update(c));
    s.on('end', () => resolve(hash.digest('hex')));
  });
}
