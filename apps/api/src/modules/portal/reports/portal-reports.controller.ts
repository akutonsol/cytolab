import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentPortalUser, Portal, PortalPrincipal } from '../common/portal-principal';
import { PortalAuthGuard } from '../auth/portal-auth.guard';
import { PortalReportsService } from './portal-reports.service';

/**
 * Portal report download. Authorized-only (enforced by the Phase 3.5 gate inside
 * renderForRecord) and ownership-gated (the service refuses a record that isn't
 * this client's). Read-only.
 */
@ApiTags('portal-reports')
@ApiBearerAuth()
@Portal()
@UseGuards(PortalAuthGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('portal/records')
export class PortalReportsController {
  constructor(private reports: PortalReportsService) {}

  @Get(':recordId/report.pdf')
  @ApiOperation({ summary: "Download the record's authorized report PDF" })
  @ApiProduces('application/pdf')
  async report(
    @CurrentPortalUser() user: PortalPrincipal,
    @Param('recordId') recordId: string,
    @Res() res: Response,
  ) {
    const { buffer, record } = await this.reports.renderForOwnedRecord(recordId, user.labId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="report-${record.identifier}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
