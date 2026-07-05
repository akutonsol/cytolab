import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { WorkforceManagerGuard } from './guards/manager.guard';
import { WorkforceReportsService } from './workforce-reports.service';
import { AttendanceReportQuery, DateRangeReportQuery } from './dto/workforce-phase2.dto';

// All report endpoints require Workforce enabled + a manager/admin.
@ApiTags('workforce-reports')
@ApiBearerAuth()
@RequireFeature('WORKFORCE_MANAGEMENT')
@UseGuards(FeatureGuard, WorkforceManagerGuard)
@Controller()
export class WorkforceReportsController {
  constructor(private reports: WorkforceReportsService) {}

  @Get('workforce/reports/attendance-summary')
  attendanceSummary(@Query() q: AttendanceReportQuery) {
    return this.reports.attendanceSummary(q);
  }

  @Get('workforce/reports/leave-liability')
  leaveLiability() {
    return this.reports.leaveLiability();
  }

  @Get('workforce/reports/overtime-cost')
  overtimeCost(@Query() q: DateRangeReportQuery) {
    return this.reports.overtimeCost(q);
  }

  @Get('workforce/reports/timesheet-summary')
  timesheetSummary(@Query() q: DateRangeReportQuery) {
    return this.reports.timesheetSummary(q);
  }
}
