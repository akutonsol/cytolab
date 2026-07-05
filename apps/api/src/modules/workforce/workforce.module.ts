import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { WorkforceController } from './workforce.controller';
import { WorkforceService } from './workforce.service';
import { WorkforceNotificationService } from './workforce-notification.service';
import { WorkforceNotificationController } from './workforce-notification.controller';
import { LeaveService } from './leave.service';
import { LeaveController } from './leave.controller';
import { OvertimeService } from './overtime.service';
import { OvertimeController } from './overtime.controller';
import { WorkforceReportsService } from './workforce-reports.service';
import { WorkforceReportsController } from './workforce-reports.controller';
import { PayrollEngineService } from './payroll-engine.service';
import { PayrollEngineController } from './payroll-engine.controller';
import { ProductivityService } from './productivity.service';
import { ProductivityController } from './productivity.controller';
import { PerformanceService } from './performance.service';
import { PerformanceController } from './performance.controller';
import { FeatureGuard } from '../../common/guards/feature.guard';

@Module({
  imports: [PrismaModule],
  controllers: [
    WorkforceController,
    LeaveController,
    OvertimeController,
    WorkforceNotificationController,
    WorkforceReportsController,
    PayrollEngineController,
    ProductivityController,
    PerformanceController,
  ],
  providers: [
    WorkforceService,
    WorkforceNotificationService,
    LeaveService,
    OvertimeService,
    WorkforceReportsService,
    PayrollEngineService,
    ProductivityService,
    PerformanceService,
    FeatureGuard,
  ],
  exports: [WorkforceService, WorkforceNotificationService],
})
export class WorkforceModule {}
