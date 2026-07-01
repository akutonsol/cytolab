import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller()
export class AnalyticsController {
  constructor(private analytics: AnalyticsService) {}

  @Get('analytics/dashboard')
  @RequirePermissions('applicationprefs:reports')
  @ApiOperation({ summary: 'Lab analytics dashboard aggregates (real, lab-scoped)' })
  dashboard() {
    return this.analytics.dashboard();
  }
}
