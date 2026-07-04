import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { ReagentService } from './reagent.service';

/** Daily reagent expiry sweep across every lab (each lab in its own context):
 *  flip past-expiry lots to Expired and notify managers of soon-expiring lots. */
@Injectable()
export class ReagentScheduler {
  private readonly logger = new Logger(ReagentScheduler.name);
  constructor(private reagents: ReagentService, private prisma: PrismaService, private labContext: LabContext) {}

  @Cron('30 6 * * *')
  async run() {
    const labs = await this.labContext.runSystem(() => this.prisma.lab.findMany({ select: { id: true } }));
    let expired = 0, notified = 0;
    for (const lab of labs) {
      try {
        const r = await this.labContext.runLabScoped(lab.id, () => this.reagents.checkExpiry());
        expired += r.expired; notified += r.notified;
      } catch (e: any) {
        this.logger.error(`Reagent expiry check failed for lab ${lab.id}: ${e?.message}`);
      }
    }
    this.logger.log(`Reagent expiry sweep — ${expired} expired, ${notified} notified across ${labs.length} lab(s)`);
  }
}
