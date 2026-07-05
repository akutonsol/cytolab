import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ReportCenterService } from './report-center.service';
import { ReportQueryDto } from './dto/report-center.dto';

@ApiTags('report-center')
@ApiBearerAuth()
@Controller('report-center')
export class ReportCenterController {
  constructor(private readonly reports: ReportCenterService) {}

  @Get('summary')
  @RequirePermissions('report:view')
  summary(@Query() q: ReportQueryDto) { return this.reports.summary(q); }

  // Specimen
  @Get('specimen-volume')
  @RequirePermissions('report:view')
  specimenVolume(@Query() q: ReportQueryDto) { return this.reports.specimenVolume(q); }

  @Get('tat-analysis')
  @RequirePermissions('report:view')
  tatAnalysis(@Query() q: ReportQueryDto) { return this.reports.tatAnalysis(q); }

  @Get('specimen-distribution')
  @RequirePermissions('report:view')
  specimenDistribution(@Query() q: ReportQueryDto) { return this.reports.specimenDistribution(q); }

  // Clinical
  @Get('bethesda-trends')
  @RequirePermissions('report:view')
  bethesdaTrends(@Query() q: ReportQueryDto) { return this.reports.bethesdaTrends(q); }

  @Get('abnormal-rate')
  @RequirePermissions('report:view')
  abnormalRate(@Query() q: ReportQueryDto) { return this.reports.abnormalRate(q); }

  @Get('cytotechnologist-performance')
  @RequirePermissions('report:view')
  cytotechnologistPerformance(@Query() q: ReportQueryDto) { return this.reports.cytotechnologistPerformance(q); }

  // Financial
  @Get('revenue-by-client')
  @RequirePermissions('report:view')
  revenueByClient(@Query() q: ReportQueryDto) { return this.reports.revenueByClient(q); }

  @Get('services-revenue')
  @RequirePermissions('report:view')
  servicesRevenue(@Query() q: ReportQueryDto) { return this.reports.servicesRevenue(q); }

  @Get('outstanding-payments')
  @RequirePermissions('report:view')
  outstandingPayments(@Query() q: ReportQueryDto) { return this.reports.outstandingPayments(q); }

  // Patient
  @Get('patient-registration')
  @RequirePermissions('report:view')
  patientRegistration(@Query() q: ReportQueryDto) { return this.reports.patientRegistration(q); }

  @Get('recall-compliance')
  @RequirePermissions('report:view')
  recallCompliance(@Query() q: ReportQueryDto) { return this.reports.recallCompliance(q); }

  // Staff
  @Get('pay-advice-history')
  @RequirePermissions('report:view')
  payAdviceHistory(@Query() q: ReportQueryDto) { return this.reports.payAdviceHistory(q); }

  // Quality
  @Get('qc-failures')
  @RequirePermissions('report:view')
  qcFailures(@Query() q: ReportQueryDto) { return this.reports.qcFailures(q); }

  @Get('cap-benchmarks')
  @RequirePermissions('report:view')
  capBenchmarks(@Query() q: ReportQueryDto) { return this.reports.capBenchmarks(q); }
}
