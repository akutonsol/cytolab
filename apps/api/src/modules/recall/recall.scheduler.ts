import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { RecallService } from './recall.service';

/** Daily recall sweep across every lab (each in its own context): advance
 *  Pending→Due and Due→Overdue, notifying the lab manager on each transition. */
@Injectable()
export class RecallScheduler {
  private readonly logger = new Logger(RecallScheduler.name);
  constructor(private recalls: RecallService, private prisma: PrismaService, private labContext: LabContext) {}

  @Cron('45 6 * * *')
  async run() {
    const labs = await this.labContext.runSystem(() => this.prisma.lab.findMany({ select: { id: true } }));
    let due = 0, overdue = 0;
    for (const lab of labs) {
      try {
        const r = await this.labContext.runLabScoped(lab.id, () => this.recalls.checkDue());
        due += r.due; overdue += r.overdue;
      } catch (e: any) {
        this.logger.error(`Recall check failed for lab ${lab.id}: ${e?.message}`);
      }
    }
    this.logger.log(`Recall sweep — ${due} newly due, ${overdue} newly overdue across ${labs.length} lab(s)`);
  }
}
