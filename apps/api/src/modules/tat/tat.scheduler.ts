import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { ExecutionContextService } from '../../common/execution-context/execution-context.service';
import { AuditRecorder } from '../audit/audit-recorder.service';
import { TatService } from './tat.service';

/** Hourly TAT scan across every lab (cron has no request scope, so each lab is
 *  scanned inside its own lab context). */
@Injectable()
export class TatScheduler {
  private readonly logger = new Logger(TatScheduler.name);
  constructor(
    private tat: TatService,
    private prisma: PrismaService,
    private labContext: LabContext,
    private executionContext: ExecutionContextService,
    private audit: AuditRecorder,
  ) {}

  @Cron('15 * * * *')
  async run() {
    // Enterprise audit (P2-3): run under a P2-2 job execution context so JOB_STARTED/COMPLETED
    // carry a SYSTEM actor + executionId + correlationId (no fabricated HTTP request). The
    // per-lab scan still opens its own lab scope inside; the job events are recorded at the
    // outer job scope where the attribution lives.
    await this.executionContext.runJob({ jobName: 'tat.sla-scan' }, async () => {
      await this.audit.record({
        category: 'SYSTEM',
        actionCode: 'JOB_STARTED',
        resource: { type: 'Job', id: 'tat.sla-scan' },
        outcome: { status: 'SUCCESS' },
        producerModule: 'tat',
      });

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

      await this.audit.record({
        category: 'SYSTEM',
        actionCode: 'JOB_COMPLETED',
        resource: { type: 'Job', id: 'tat.sla-scan' },
        outcome: { status: 'SUCCESS' },
        producerModule: 'tat',
      });
    });
  }
}
