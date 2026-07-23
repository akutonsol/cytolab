import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { JobLeaseService } from './job-lease.service';
import { SlideProcessingQueueService } from './slide-processing-queue.service';
import { PROCESSING_CONFIG, ProcessingConfig } from './processing-tokens';

/**
 * Program 5A · P5-3B.1A — the background scheduler that drives reconciliation + lease reclamation.
 *
 * DISABLED by default and ALWAYS under test (cfg.workerEnabled). B.1A ships the coordination machinery
 * but has no processing body — there is no claim→tile→register→seal loop yet (that arrives with
 * B.1C/B.2). This scheduler therefore only runs the two SAFE, row-only sweeps (reconcile, reclaim); it
 * NEVER claims a job for processing, creates a generation, invokes an engine, seals, or marks a job
 * SUCCEEDED. The reconcile/reclaim methods use raw SQL and are system-level (not lab-scoped).
 *
 * A logical workerId is minted at startup for operational correlation.
 */
@Injectable()
export class SlideProcessingScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SlideProcessingScheduler.name);
  readonly workerId = `${process.env.WSI_WORKER_ID ?? 'wsi-worker'}-${randomUUID()}`;
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly queue: SlideProcessingQueueService,
    private readonly lease: JobLeaseService,
    @Inject(PROCESSING_CONFIG) private readonly cfg: ProcessingConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.cfg.workerEnabled) {
      this.logger.log('slide-processing scheduler disabled (P5-3B.1A: coordination only; no processing body yet)');
      return;
    }
    // Only the row-only sweeps run — never an end-to-end processing loop (that is B.1C/B.2).
    this.timers.push(setInterval(() => void this.safe('reconcile', () => this.queue.reconcile()), this.cfg.reconcileIntervalMs));
    this.timers.push(setInterval(() => void this.safe('reclaim', () => this.lease.reclaimExpired()), this.cfg.reclaimIntervalMs));
    for (const t of this.timers) t.unref?.();
    this.logger.log(`slide-processing scheduler started (worker=${this.workerId})`);
  }

  onModuleDestroy(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  private async safe(name: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (e: any) {
      this.logger.error(`slide-processing ${name} sweep failed: ${e?.message ?? e}`);
    }
  }
}
