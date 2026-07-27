import { BadRequestException, Injectable } from '@nestjs/common';
import { SlideIngestionService } from '../ingestion/slide-ingestion.service';
import { SlideProcessingQueueService } from '../processing/slide-processing-queue.service';

/** The subset of an intake row the composer needs to decide a truthful handoff. */
export interface HandoffCandidate {
  id: string;
  status: string;
  matchedRecordId: string | null;
  matchedSpecimenId?: string | null;
}

/**
 * Program 5B · B1 — the internal composition SEAM: "one ingestion pipeline, multiple intake methods."
 *
 * It depends on the ACCEPTED 5A seams — `SlideIngestionService` and
 * `SlideProcessingQueueService.enqueueForIngestion` — and MUST NOT introduce a second processing path
 * (no duplicated checksum/lifecycle/job/tiling/seal/verify/publish/delivery logic). The actual byte flow
 * (stream discovered file → `SourceObjectStore` → verified ingestion → enqueue) is implemented in B2;
 * B1 establishes the contract and the truthful precondition below.
 *
 * WATCH_FOLDER provenance: the automated path is SERVER-OWNED. It will set `sourceKind = WATCH_FOLDER`
 * through an internal call — the public upload DTO whitelist is deliberately NOT widened, so a browser
 * client can never spoof the source kind. (DTO unchanged in B1.)
 */
@Injectable()
export class AutomatedIngestionComposer {
  constructor(
    private readonly ingestion: SlideIngestionService,
    private readonly queue: SlideProcessingQueueService,
  ) {}

  /**
   * Truthfulness gate: only a discovery that was UNIQUELY MATCHED (has an authoritative `matchedRecordId`)
   * may be handed off to the 5A pipeline. UNMATCHED / AMBIGUOUS / STABILIZING / DUPLICATE / FAILED must
   * remain in the reconciliation flow — a slide/association is NEVER fabricated to force a handoff.
   */
  assertHandoffReady(d: HandoffCandidate): { recordId: string; specimenId: string | null } {
    if (d.status !== 'MATCHED' || !d.matchedRecordId) {
      throw new BadRequestException(
        `discovery ${d.id} is not uniquely matched (status=${d.status}) — cannot fabricate an association`,
      );
    }
    // Default record-level anchoring (P5-7 unassigned semantics) unless an explicit specimen was matched.
    return { recordId: d.matchedRecordId, specimenId: d.matchedSpecimenId ?? null };
  }

  /** The accepted 5A hand-off the B2 byte flow will call (kept here so there is one enqueue path). */
  protected get seams() {
    return { ingestion: this.ingestion, queue: this.queue };
  }
}
