import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { INFERENCE_CONFIG, InferenceConfig } from './inference-tokens';
import { validateInferenceConfig } from './inference-config';
import { InferenceLeaseService } from './inference-lease.service';
import { InferenceEngineService } from './inference-engine.service';

/**
 * Program 6 · Phase 6C — the background inference worker (DISABLED by default; never under test — Decision 6).
 *
 * When explicitly enabled it drains QUEUED jobs on a cadence and runs a reclaimer sweep; a per-job heartbeat renews
 * the lease and ABORTS adapter work the moment ownership is lost (mirrors the Program-5 worker). Manual dispatch and
 * the permissioned manual drain do NOT depend on this being enabled — they are always-available write/execute paths.
 * Enqueue is never gated here; only the automatic background loop is.
 */
@Injectable()
export class InferenceWorkerRuntime implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InferenceWorkerRuntime.name);
  private readonly workerId = `inf-worker-${Math.floor(process.pid)}`;
  private claimTimer?: NodeJS.Timeout;
  private reclaimTimer?: NodeJS.Timeout;
  private draining = false;

  constructor(
    @Inject(INFERENCE_CONFIG) private readonly cfg: InferenceConfig,
    private readonly engine: InferenceEngineService,
    private readonly lease: InferenceLeaseService,
  ) {}

  onModuleInit(): void {
    if (!this.cfg.workerEnabled) {
      this.logger.log('inference worker disabled (manual dispatch only) — no background scheduler started');
      return;
    }
    validateInferenceConfig(this.cfg);
    this.claimTimer = setInterval(() => void this.drainTick(), this.cfg.claimIntervalMs);
    this.reclaimTimer = setInterval(() => void this.lease.reclaimExpired().catch(() => undefined), this.cfg.reclaimIntervalMs);
    this.logger.warn(`inference worker ENABLED (concurrency=${this.cfg.workerConcurrency}) — background execution active`);
  }

  onModuleDestroy(): void {
    if (this.claimTimer) clearInterval(this.claimTimer);
    if (this.reclaimTimer) clearInterval(this.reclaimTimer);
  }

  /** Fill free slots up to the configured concurrency; each claimed job runs under a heartbeat + abort. */
  private async drainTick(): Promise<void> {
    if (this.draining) return; // never overlap ticks
    this.draining = true;
    try {
      const slots = Array.from({ length: this.cfg.workerConcurrency }, () => this.runOneWithHeartbeat());
      await Promise.all(slots);
    } catch (err) {
      this.logger.warn(`inference drain tick error: ${(err as Error)?.message}`);
    } finally {
      this.draining = false;
    }
  }

  /** Claim + run one job, renewing the lease on a heartbeat and aborting adapter work if the lease is lost. */
  private async runOneWithHeartbeat(): Promise<void> {
    const abort = new AbortController();
    let jobId: string | undefined;
    const beat = setInterval(async () => {
      if (!jobId) return;
      const held = await this.lease.renew(jobId, this.workerId).catch(() => false);
      if (!held) {
        this.logger.warn(`inference job ${jobId} lease lost → aborting adapter work`);
        abort.abort();
      }
    }, this.cfg.heartbeatIntervalMs);
    try {
      // claimAndRun claims first; we cannot know the id until after claim, so the heartbeat is a no-op until then.
      const result = await this.engine.claimAndRun(this.workerId, abort.signal);
      jobId = result?.jobId;
    } finally {
      clearInterval(beat);
    }
  }
}
