import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { TatService } from './tat.service';

/** Hourly TAT scan across every lab (cron has no request scope, so each lab is
 *  scanned inside its own lab context). */
@Injectable()
export class TatScheduler {
  private readonly logger = new Logger(TatScheduler.name);
  constructor(private tat: TatService, private prisma: PrismaService, private labContext: LabContext) {}

  @Cron('15 * * * *')
  async run() {
    const labs = await this.labContext.runSystem(() => this.prisma.lab.findMany({ select: { id: true } }));
    let breached = 0, approaching = 0, resolved = 0;
    for (const lab of labs) {
      try {
        const r = await this.labContext.runLabScoped(lab.id, () => this.tat.scan());
        breached += r.breached; approaching += r.approaching; resolved += r.resolved;
      } catch (e: any) {
        this.logger.error(`TAT scan failed for lab ${lab.id}: ${e?.message}`);
      }
    }
    this.logger.log(`TAT scan complete — ${breached} breached, ${approaching} approaching, ${resolved} resolved across ${labs.length} lab(s)`);
  }
}
