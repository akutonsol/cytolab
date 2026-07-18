import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PlatformBillingService } from './platform-billing.service';

/**
 * Daily platform-billing sweep. Mirrors the recall scheduler: a single daily
 * cron that (1) generates invoices for every active lab whose billingDayOfMonth
 * matches today (idempotent per month, so a same-day restart won't double-bill),
 * and (2) flips past-due Sent invoices to Overdue.
 */
@Injectable()
export class PlatformBillingScheduler {
  private readonly log = new Logger(PlatformBillingScheduler.name);
  constructor(private readonly billing: PlatformBillingService) {}

  @Cron('0 7 * * *')
  async run() {
    try {
      const gen = await this.billing.runScheduledGeneration();
      const overdue = await this.billing.sweepOverdue();
      this.log.log(`Platform billing — ${gen.generated}/${gen.candidates} invoice(s) generated, ${overdue} marked overdue`);
    } catch (e: any) {
      this.log.error(`Platform billing sweep failed: ${e?.message}`);
    }
  }
}
