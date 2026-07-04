import { Body, Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { BethesdaService } from './bethesda.service';
import { BethesdaAnalyticsService } from './bethesda-analytics.service';
import { UpsertBethesdaResultDto } from './dto/bethesda.dto';
import { AnalyticsSummaryQueryDto, AnalyticsTrendQueryDto } from './dto/bethesda-analytics.dto';

@ApiTags('bethesda')
@ApiBearerAuth()
@Controller('bethesda')
export class BethesdaController {
  constructor(
    private bethesda: BethesdaService,
    private analytics: BethesdaAnalyticsService,
  ) {}

  // ── Analytics (Tier 4 Compliance) ──
  @Get('analytics/summary')
  @RequirePermissions('resultentry:view')
  analyticsSummary(@Query() q: AnalyticsSummaryQueryDto) {
    return this.analytics.summary(q.period, q.year, q.month);
  }

  @Get('analytics/trend')
  @RequirePermissions('resultentry:view')
  analyticsTrend(@Query() q: AnalyticsTrendQueryDto) {
    return this.analytics.trend(q.months ?? 12);
  }

  @Get('analytics/benchmarks')
  @RequirePermissions('resultentry:view')
  analyticsBenchmarks() {
    return this.analytics.benchmarks();
  }

  @Get('analytics/by-technician')
  @RequirePermissions('resultentry:view')
  analyticsByTechnician() {
    return this.analytics.byTechnician();
  }

  @Get('record/:recordId')
  @RequirePermissions('resultentry:view')
  getByRecord(@Param('recordId') recordId: string) {
    return this.bethesda.getByRecord(recordId);
  }

  @Put('record/:recordId')
  @RequirePermissions('resultentry:change')
  upsert(@CurrentUser() user: AuthUser, @Param('recordId') recordId: string, @Body() dto: UpsertBethesdaResultDto) {
    return this.bethesda.upsert(recordId, dto, user.userId);
  }

  @Delete('record/:recordId')
  @RequirePermissions('resultentry:change')
  remove(@Param('recordId') recordId: string) {
    return this.bethesda.remove(recordId);
  }
}
