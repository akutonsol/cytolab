import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
