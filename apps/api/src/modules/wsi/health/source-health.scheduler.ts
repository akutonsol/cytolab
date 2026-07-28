import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { LabContext } from '../../../common/tenancy/lab-context';
import { ExecutionContextService } from '../../../common/execution-context/execution-context.service';
import { SourceHealthService } from './source-health.service';
import { loadHealthConfig, type HealthConfig } from './health-config';

/**
 * Program 5C · C5 — config-gated source-health poller (DEFAULT OFF; effective cadence never below 5 minutes). Follows the
 * accepted watch-folder-scheduler pattern: setInterval + workerId + unref + per-tick exception isolation +
 * graceful drain. Enumerates ENABLED sources system-side (runSystem, cross-lab), checks each inside its own
 * `runJob({ labId })`, and relies on the service's `nextEligibleCheckAt` compare-and-set for multi-instance
 * safety + cadence. Health checking is independent of scan discovery / ingestion / reconciliation / aggregation.
 */
@Injectable()
export class SourceHealthScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SourceHealthScheduler.name);
  private readonly cfg: HealthConfig = loadHealthConfig();
  private readonly workerId = `wsi-health-${randomUUID()}`;
  private readonly inFlight = new Set<string>();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly labContext: LabContext,
    private readonly execCtx: ExecutionContextService,
    private readonly health: SourceHealthService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.cfg.enabled) {
      this.logger.log('source-health poller DISABLED (WSI_HEALTH_CHECK_ENABLED!=true)');
      return;
    }
    this.timer = setInterval(() => void this.safeTick(), this.cfg.intervalMs);
    this.timer.unref?.();
    this.logger.log(`source-health poller started (worker=${this.workerId}, intervalMs=${this.cfg.intervalMs}, cadenceMs=${this.cfg.cadenceMs})`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async safeTick(): Promise<void> {
    try {
      const sources = await this.labContext.runSystem(() =>
        this.prisma.ingestionSource.findMany({ where: { enabled: true }, select: { id: true, labId: true } }),
      );
      let active = 0;
      for (const src of sources) {
        if (this.inFlight.has(src.id)) continue;
        while (active >= this.cfg.maxConcurrency) await new Promise((r) => setTimeout(r, 25));
        this.inFlight.add(src.id);
        active++;
        void this.execCtx
          .runJob({ jobName: 'wsi-source-health', labId: src.labId }, () => this.health.runScheduled(src.id))
          .catch((e) => this.logger.warn(`health check failed (source=${src.id}): ${(e as Error)?.message}`))
          .finally(() => { this.inFlight.delete(src.id); active--; });
      }
    } catch (e) {
      this.logger.error(`source-health tick failed: ${(e as Error)?.message}`);
    }
  }
}
