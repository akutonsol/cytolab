import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import { SlideIngestionService } from '../ingestion/slide-ingestion.service';
import { SlideProcessingQueueService } from '../processing/slide-processing-queue.service';
import { WATCH_FOLDER_CONFIG, type WatchFolderConfig } from './watch-folder-config';

/** The subset of an intake row the composer needs to decide a truthful handoff. */
export interface HandoffCandidate {
  id: string;
  status: string;
  matchedRecordId: string | null;
  matchedSpecimenId?: string | null;
}

export interface HandoffResult {
  slideId: string;
  ingestionId: string;
  checksum: string;
}

/**
 * Program 5B · B1/B2 — the internal composition SEAM: "one ingestion pipeline, multiple intake methods."
 *
 * It reuses the ACCEPTED 5A pipeline through `SlideIngestionService` (initiate → appendChunk → complete),
 * which owns private source-object storage, server-side checksum verification, the VERIFIED transition, and
 * the atomic `enqueueForIngestion` hand-off to the accepted processing worker. There is NO second tiling /
 * processing path.
 *
 * WATCH_FOLDER is SERVER-OWNED: `initiate` is called in-process with `sourceKind: 'WATCH_FOLDER'`. The public
 * upload DTO's `@IsIn` whitelist is NOT widened, so a browser request can never spoof the source kind.
 */
@Injectable()
export class AutomatedIngestionComposer {
  constructor(
    private readonly ingestion: SlideIngestionService,
    private readonly queue: SlideProcessingQueueService,
    @Inject(WATCH_FOLDER_CONFIG) private readonly cfg: WatchFolderConfig,
  ) {}

  /**
   * Truthfulness gate: only a UNIQUELY MATCHED discovery (with an authoritative `matchedRecordId`) may be
   * handed off. UNMATCHED / AMBIGUOUS / STABILIZING / DUPLICATE / FAILED must remain in the reconciliation
   * flow — a slide/association is NEVER fabricated to force a handoff.
   */
  assertHandoffReady(d: HandoffCandidate): { recordId: string; specimenId: string | null } {
    if (d.status !== 'MATCHED' || !d.matchedRecordId) {
      throw new BadRequestException(
        `discovery ${d.id} is not uniquely matched (status=${d.status}) — cannot fabricate an association`,
      );
    }
    return { recordId: d.matchedRecordId, specimenId: d.matchedSpecimenId ?? null };
  }

  /**
   * B2 — server-owned WATCH_FOLDER hand-off of an already-stable, matched, non-duplicate file into the
   * accepted 5A ingestion pipeline. Streams the source bytes through the existing chunked upload, then
   * completes with the caller-computed SHA-256 (the accepted service re-verifies it before VERIFIED).
   * Returns the resulting slide/ingestion identities ONLY after the accepted service has actually created
   * and verified them — the caller marks INGESTED only on this success.
   */
  async ingestMatchedFile(input: {
    absPath: string;
    filename: string;
    sizeBytes: number;
    recordId: string;
    specimenId: string | null;
    expectedChecksum: string;
  }): Promise<HandoffResult> {
    // sourceKind is set SERVER-SIDE here (public whitelist untouched). userId=null → system actor.
    const { slideId, ingestionId } = await this.ingestion.initiate(
      input.recordId,
      {
        sourceKind: 'WATCH_FOLDER',
        filename: input.filename,
        sizeBytes: input.sizeBytes,
        ...(input.specimenId ? { specimenId: input.specimenId } : {}),
      },
      null,
    );

    const fh = await fs.open(input.absPath, 'r');
    try {
      const buf = Buffer.alloc(this.cfg.chunkBytes);
      let offset = 0;
      for (;;) {
        const { bytesRead } = await fh.read(buf, 0, buf.length, offset);
        if (bytesRead <= 0) break;
        await this.ingestion.appendChunk(ingestionId, offset, buf.subarray(0, bytesRead));
        offset += bytesRead;
      }
    } finally {
      await fh.close();
    }

    // complete() re-computes the checksum from the persisted bytes and fails the ingestion on mismatch.
    const { ingestion } = await this.ingestion.complete(ingestionId, { expectedChecksum: input.expectedChecksum });
    return { slideId, ingestionId, checksum: ingestion.sourceChecksum ?? input.expectedChecksum };
  }
}
