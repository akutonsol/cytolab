import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { LabContext } from '../../../common/tenancy/lab-context';
import { ReportsService } from '../../reports/reports.service';

/**
 * Portal report access. The report chain (ResultSheet/Report) is NOT
 * client-scoped, so Rule B refuses a portal request from touching it directly.
 * We therefore gate on a structural ownership proof, then render in lab-only
 * scope — the single, narrow, audited escalation in the whole portal surface.
 */
@Injectable()
export class PortalReportsService {
  constructor(
    private prisma: PrismaService,
    private labContext: LabContext,
    private reports: ReportsService,
  ) {}

  /**
   * Render a record's report PDF for a portal user.
   * 1. Ownership gate — record.findFirst runs in PORTAL scope, so a record that
   *    isn't this client's resolves to null -> 404 (crafted id stops here).
   * 2. Only after ownership is proven, render in LAB-ONLY scope so renderForRecord
   *    may read the (non-client-scoped) result sheet / report. The Phase 3.5
   *    authorization gate is unchanged: an unauthorized sheet -> Forbidden, never
   *    a PDF.
   */
  async renderForOwnedRecord(recordId: string, labId: string) {
    const owned = await this.prisma.record.findFirst({ where: { id: recordId }, select: { id: true } });
    if (!owned) throw new NotFoundException('Record not found');

    return this.labContext.runLabScoped(labId, () => this.reports.renderForRecord(recordId));
  }
}
