import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { JobLeaseService } from './job-lease.service';
import { SlideProcessingQueueService } from './slide-processing-queue.service';
import { SlideProcessingProcessor } from './slide-processing.processor';
import { ProcessingWorkerRuntime } from './processing-worker-runtime';
import { validateProcessingConfig } from './processing-config';
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
  private runtime?: ProcessingWorkerRuntime;

  constructor(
    private readonly queue: SlideProcessingQueueService,
    private readonly lease: JobLeaseService,
    private readonly processor: SlideProcessingProcessor,
    @Inject(PROCESSING_CONFIG) private readonly cfg: ProcessingConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.cfg.workerEnabled) {
      this.logger.log('slide-processing scheduler disabled (WSI_PROCESSING_WORKER!=true or NODE_ENV=test)');
      return;
    }
    validateProcessingConfig(this.cfg); // fail fast on an unsafe worker configuration (heartbeat vs lease, etc.)

    // W-i — the processing worker runtime (claim → process → seal). Ends at QC_PENDING; no verify/publish.
    this.runtime = new ProcessingWorkerRuntime(this.lease, this.processor, this.cfg, this.workerId, this.logger);

    // Row-only reconciliation/reclamation sweeps + the claim/process tick (jittered to avoid lockstep polling).
    this.timers.push(setInterval(() => void this.safe('reconcile', () => this.queue.reconcile()), this.cfg.reconcileIntervalMs));
    this.timers.push(setInterval(() => void this.safe('reclaim', () => this.lease.reclaimExpired()), this.cfg.reclaimIntervalMs));
    this.timers.push(setInterval(() => void this.safe('claim', () => this.runtime!.claimAndProcess()), this.cfg.claimIntervalMs + jitter(this.cfg.claimJitterMs)));
    for (const t of this.timers) t.unref?.();
    this.logger.log(`slide-processing worker started (worker=${this.workerId}, concurrency=${this.cfg.workerConcurrency})`);
  }

  async onModuleDestroy(): Promise<void> {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    await this.runtime?.drain().catch((e) => this.logger.error(`drain failed: ${(e as Error)?.message}`));
  }

  private async safe(name: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (e: any) {
      this.logger.error(`slide-processing ${name} sweep failed: ${e?.message ?? e}`);
    }
  }
}

/** Non-negative operational jitter (ms) so multiple instances do not poll in lockstep. */
function jitter(maxMs: number): number {
  return Math.floor(Math.random() * Math.max(0, maxMs));
}
