import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { LabContext } from '../../../common/tenancy/lab-context';
import { ExecutionContextService } from '../../../common/execution-context/execution-context.service';
import { WatchFolderProcessor } from './watch-folder-processor';
import { WATCH_FOLDER_CONFIG, type WatchFolderConfig } from './watch-folder-config';

/**
 * Program 5B · B2 — the server-owned watch-folder poller. DISABLED by default and ALWAYS under test
 * (cfg.enabled). Follows the accepted processing-scheduler pattern: a config-gated setInterval, a workerId
 * for correlation, per-tick exception isolation, timers unref'd, and a graceful drain on shutdown.
 *
 * Enabled sources are enumerated SYSTEM-side (cross-lab) but each source is then processed inside its OWN
 * authoritative lab context via `runJob({ labId: source.labId })` — the persisted source labId is the sole
 * tenant authority. A per-source in-flight guard prevents overlapping scans of the same source across ticks.
 */
@Injectable()
export class WatchFolderScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WatchFolderScheduler.name);
  readonly workerId = `${process.env.WSI_WORKER_ID ?? 'wsi-watch'}-${randomUUID()}`;
  private timer?: NodeJS.Timeout;
  private readonly inFlight = new Set<string>();
  private readonly active = new Set<Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly labContext: LabContext,
    private readonly execCtx: ExecutionContextService,
    private readonly processor: WatchFolderProcessor,
    @Inject(WATCH_FOLDER_CONFIG) private readonly cfg: WatchFolderConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.cfg.enabled) {
      this.logger.log('watch-folder poller disabled (WSI_WATCH_FOLDER!=true or NODE_ENV=test)');
      return;
    }
    this.timer = setInterval(() => void this.safeTick(), this.cfg.intervalMs);
    this.timer.unref?.();
    this.logger.log(`watch-folder poller started (worker=${this.workerId}, intervalMs=${this.cfg.intervalMs}, settleMs=${this.cfg.settleMs})`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await Promise.allSettled([...this.active]); // let in-flight source scans finish
  }

  private async safeTick(): Promise<void> {
    try {
      // System-scoped enumeration (cross-lab); the tenancy extension passes through in runSystem.
      const sources = await this.labContext.runSystem(() =>
        this.prisma.ingestionSource.findMany({
          // FILESYSTEM image sources only. A DICOMWEB source (C3) has no rootPath and is imported on demand;
          // a FILESYSTEM_DICOM source (C4) is routed to C2 by the scanner router, NOT the image watch-folder path.
          // NOTE: `{ not: 'FILESYSTEM_DICOM' }` would EXCLUDE NULL rows in SQL — legacy sources have adapterType
          // null, so we must include null explicitly (else the poller scans nothing).
          where: { enabled: true, kind: 'FILESYSTEM', OR: [{ adapterType: null }, { adapterType: 'FILESYSTEM_IMAGE' }] },
          select: { id: true, labId: true, rootPath: true, matchConfig: true },
        }),
      );
      for (const src of sources) {
        if (this.inFlight.has(src.id)) continue; // no overlapping scans of the same source
        this.inFlight.add(src.id);
        const run = this.execCtx
          .runJob({ jobName: 'wsi-watch-folder', labId: src.labId }, () =>
            this.processor.processSource({ id: src.id, rootPath: src.rootPath ?? '', matchConfig: src.matchConfig }),
          )
          .catch((e) => this.logger.error(`watch-folder source ${src.id} failed: ${(e as Error)?.message}`))
          .finally(() => this.inFlight.delete(src.id));
        this.active.add(run);
        void run.finally(() => this.active.delete(run));
      }
    } catch (e) {
      this.logger.error(`watch-folder tick failed: ${(e as Error)?.message}`);
    }
  }
}
