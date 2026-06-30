import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ReportsService } from './reports.service';
import { CreateReportDto, ReportQueryDto } from './dto/report.dto';

@ApiTags('reports')
@ApiBearerAuth()
@Controller()
export class ReportsController {
  constructor(private reports: ReportsService) {}

  // Release a report — refused unless the result sheet is authorized (the gate).
  @Post('reports/create')
  @RequirePermissions('report:create')
  @ApiOperation({ summary: 'Release a report from an authorized result sheet' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReportDto) {
    return this.reports.create(dto, user.userId);
  }

  // A record's rendered report PDF — refused unless the result sheet is
  // authorized (the gate, re-checked at render time). Read-only, lab-scoped;
  // this is the same endpoint the F2 client portal will call.
  @Get('report/pdf/:recordId')
  @RequirePermissions('report:view')
  @ApiOperation({ summary: "Render a record's authorized report as a PDF" })
  @ApiProduces('application/pdf')
  async renderPdf(@Param('recordId') recordId: string, @Res() res: Response) {
    const { buffer, record } = await this.reports.renderForRecord(recordId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="report-${record.identifier}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // Static sub-route before /report/:id.
  @Get('reports/summary')
  @RequirePermissions('applicationprefs:reports')
  summary() {
    return this.reports.summary();
  }

  @Get('reports')
  @RequirePermissions('report:view')
  findAll(@Query() query: ReportQueryDto) {
    return this.reports.findAll(query);
  }

  @Get('report/:id')
  @RequirePermissions('report:view')
  findOne(@Param('id') id: string) {
    return this.reports.findOne(id);
  }
}
