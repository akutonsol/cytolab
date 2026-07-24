import { Logger } from '@nestjs/common';
import { JobLeaseService, ClaimedJob } from './job-lease.service';
import { SlideProcessingProcessor, LeaseLostError, AcquisitionMetadataConflictError } from './slide-processing.processor';
import { TilingEngineError } from './tiling-engine';
import { InvalidEngineOutputError } from './tiling-output-validator';
import { isRetryable, ProcessingErrorCode } from './processing-error';
import { ProcessingConfig } from './processing-config';

/**
 * Program 5A · Worker Activation (W-i) — the processing worker runtime: claim → process → seal, with
 * bounded concurrency, a per-attempt heartbeat that ABORTS engine work on definitive lease loss, and
 * durable failure disposition. It ends every successful attempt at a sealed generation (QC_PENDING) + a
 * SUCCEEDED job; it does NOT verify, publish, or deliver. Kept separate from the scheduler (a thin timer
 * host) so lease ownership + orchestration are independently testable.
 *
 * Retryability is DURABLE, not in-memory: a failure is terminalized with a stable ProcessingErrorCode, and
 * reconcile() re-enqueues iff isRetryable(code) && attempt < maxAttempts. A stale worker (lease lost) makes
 * NO terminal write — reclaim/reconcile owns that recovery.
 */

interface AttemptState {
  abort: AbortController;
  leaseExpiresAt: number; // epoch ms; refreshed on each confirmed renewal
  leaseLost: boolean;
  heartbeat: NodeJS.Timeout;
  promise: Promise<void>;
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms).unref?.());

export class ProcessingWorkerRuntime {
  private readonly inFlight = new Map<string, AttemptState>();
  private draining = false;

  constructor(
    private readonly lease: JobLeaseService,
    private readonly processor: SlideProcessingProcessor,
    private readonly cfg: ProcessingConfig,
    private readonly workerId: string,
    private readonly logger: Logger,
    /** W-ii — best-effort immediate-verification trigger, invoked AFTER the processing slot is released on a
     *  successful seal. It must NEVER affect the processing outcome; a throw/drop is logged and ignored (the
     *  periodic verification reconciler is the durable safety net). Default undefined ⇒ W-i behavior. */
    private readonly onProcessed?: (generationId: string) => void,
  ) {}

  get inFlightCount(): number {
    return this.inFlight.size;
  }

  /** Await all currently in-flight attempts WITHOUT draining (does not stop future claims). */
  async awaitInFlight(): Promise<void> {
    await Promise.allSettled([...this.inFlight.values()].map((s) => s.promise));
  }
  private freeSlots(): number {
    return Math.max(0, this.cfg.workerConcurrency - this.inFlight.size);
  }

  /** One claim/process tick: fill free slots with claimed jobs (claim starts the lease clock — never
   *  claim work that must then wait for a slot). Returns the number of attempts started this tick. */
  async claimAndProcess(): Promise<number> {
    if (this.draining) return 0;
    let started = 0;
    while (this.freeSlots() > 0) {
      const job = await this.lease.claim(this.workerId);
      if (!job) break; // nothing claimable right now
      this.startAttempt(job);
      started += 1;
    }
    return started;
  }

  private startAttempt(job: ClaimedJob): void {
    const state: Partial<AttemptState> = { abort: new AbortController(), leaseExpiresAt: job.leaseExpiresAt.getTime(), leaseLost: false };
    state.heartbeat = setInterval(() => void this.beat(job.id, state as AttemptState), this.cfg.heartbeatIntervalMs);
    state.heartbeat.unref?.();
    state.promise = this.runAttempt(job, state as AttemptState);
    this.inFlight.set(job.id, state as AttemptState);
  }

  private async runAttempt(job: ClaimedJob, state: AttemptState): Promise<void> {
    let sealedGenerationId: string | null = null;
    try {
      const r = await this.processor.process(job, this.workerId, { abortSignal: state.abort.signal });
      sealedGenerationId = r.generationId;
      this.logger.log(`worker=${this.workerId} processed job ${job.id} → sealed generation (QC_PENDING)`);
    } catch (e) {
      if (state.leaseLost || e instanceof LeaseLostError) {
        // Stale worker: NO terminal mutation. The lease will expire and reclaim + reconcile recover it.
        this.logger.warn(`worker=${this.workerId} job ${job.id} lease lost mid-attempt; leaving for reclaim (no terminal write)`);
      } else {
        const code = classifyProcessingError(e);
        const ok = await this.lease
          .terminalizeOwned(job.id, this.workerId, 'FAILED', code)
          .catch((te) => (this.logger.error(`terminalize job ${job.id} failed: ${(te as Error)?.message}`), false));
        this.logger.warn(`worker=${this.workerId} job ${job.id} FAILED code=${code} retryable=${isRetryable(code)} terminalized=${ok}`);
      }
    } finally {
      clearInterval(state.heartbeat);
      this.inFlight.delete(job.id); // release the processing slot BEFORE any verification trigger (Option B)
    }
    // Best-effort immediate verification (W-ii). Never affects the (already committed) processing outcome.
    if (sealedGenerationId && this.onProcessed) {
      try {
        this.onProcessed(sealedGenerationId);
      } catch (e) {
        this.logger.warn(`worker=${this.workerId} onProcessed(${sealedGenerationId}) threw (ignored; reconciler recovers): ${(e as Error)?.message}`);
      }
    }
  }

  /** Heartbeat: confirm ownership, or abort the attempt if ownership is lost / can no longer be confirmed. */
  private async beat(jobId: string, state: AttemptState): Promise<void> {
    if (state.leaseLost) return;
    let renewed: boolean;
    try {
      renewed = await this.lease.renew(jobId, this.workerId);
    } catch {
      // Transient renewal failure: keep the last known deadline and retry next beat — UNLESS we can no
      // longer be sure we still own the lease before it expires (safety margin = one heartbeat interval).
      if (Date.now() + this.cfg.heartbeatIntervalMs >= state.leaseExpiresAt) this.loseLease(jobId, state, 'renewal unconfirmed before lease expiry');
      return;
    }
    if (renewed) state.leaseExpiresAt = Date.now() + this.cfg.leaseDurationMs;
    else this.loseLease(jobId, state, 'renew returned 0 rows (ownership lost)');
  }

  private loseLease(jobId: string, state: AttemptState, reason: string): void {
    if (state.leaseLost) return;
    state.leaseLost = true;
    clearInterval(state.heartbeat);
    state.abort.abort(); // cancel cancellable engine work (B.1C-i abort boundary)
    this.logger.warn(`worker=${this.workerId} job ${jobId} lease loss: ${reason} → aborting engine work`);
  }

  /**
   * Graceful drain: stop claiming, await in-flight attempts up to drainTimeoutMs, then STOP heartbeats so
   * this instance no longer extends leases for work it is not promising to finish — normal lease
   * expiry + reclaim becomes the recovery path. In-flight jobs are NEVER marked FAILED just for shutdown.
   */
  async drain(): Promise<void> {
    this.draining = true;
    const pending = [...this.inFlight.values()].map((s) => s.promise);
    if (pending.length > 0) await Promise.race([Promise.allSettled(pending), delay(this.cfg.drainTimeoutMs)]);
    for (const s of this.inFlight.values()) clearInterval(s.heartbeat); // stop extending leases we won't finish
  }
}

/** Map a processing exception to a STABLE, durable ProcessingErrorCode (the retry/no-retry signal). */
export function classifyProcessingError(e: unknown): ProcessingErrorCode {
  if (e instanceof TilingEngineError) {
    if (e.code === 'UNSUPPORTED_FORMAT') return 'UNSUPPORTED_FORMAT';
    if (e.code === 'ENGINE_UNAVAILABLE') return 'ENGINE_UNAVAILABLE';
    if (e.code === 'ENGINE_CRASH') return 'ENGINE_CRASH';
  }
  if (e instanceof InvalidEngineOutputError) return 'INVALID_OUTPUT';
  if (e instanceof AcquisitionMetadataConflictError) return 'ACQUISITION_CONFLICT';
  return 'UNKNOWN';
}
