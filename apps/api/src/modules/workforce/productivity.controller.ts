import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ProductivityService } from './productivity.service';
import { BenchmarksQuery, ProductivityMetricQuery, ProductivitySummaryQuery, UpsertProductivityMetricDto } from './dto/workforce-phase3.dto';

@ApiTags('workforce-productivity')
@ApiBearerAuth()
@Controller()
export class ProductivityController {
  constructor(private productivity: ProductivityService) {}

  @Post('workforce/productivity/metrics')
  @RequirePermissions('employee:change')
  upsertMetric(@Body() dto: UpsertProductivityMetricDto) {
    return this.productivity.upsertMetric(dto);
  }

  @Get('workforce/productivity/metrics')
  @RequirePermissions('record:view')
  listMetrics(@Query() q: ProductivityMetricQuery) {
    return this.productivity.listMetrics(q);
  }

  @Get('workforce/productivity/summary')
  @RequirePermissions('record:view')
  summary(@Query() q: ProductivitySummaryQuery) {
    return this.productivity.summary(q);
  }

  @Get('workforce/productivity/leaderboard')
  @RequirePermissions('record:view')
  leaderboard() {
    return this.productivity.leaderboard();
  }

  @Get('workforce/productivity/benchmarks')
  @RequirePermissions('record:view')
  benchmarks(@Query() q: BenchmarksQuery) {
    return this.productivity.benchmarks(q);
  }
}
