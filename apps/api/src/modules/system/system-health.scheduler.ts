import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SystemHealthService } from './system-health.service';

/** Nightly automated maintenance (2am), logged to MaintenanceLog as ranBy 'system'. */
@Injectable()
export class SystemHealthScheduler {
  private readonly logger = new Logger('SystemHealthScheduler');

  constructor(private readonly health: SystemHealthService) {}

  @Cron('0 2 * * *')
  async nightlyMaintenance() {
    try {
      const r = await this.health.runMaintenance('system');
      this.logger.log(`Nightly maintenance: flagged ${r.flagged}, archived ${r.archived}, closed ${r.missedClosed} (${r.duration}ms)`);
    } catch (e: any) {
      this.logger.error(`Nightly maintenance failed: ${e?.message ?? e}`);
    }
  }
}
