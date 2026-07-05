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

@Module({
  imports: [PrismaModule],
  controllers: [
    WorkforceController,
    LeaveController,
    OvertimeController,
    WorkforceNotificationController,
    WorkforceReportsController,
  ],
  providers: [
    WorkforceService,
    WorkforceNotificationService,
    LeaveService,
    OvertimeService,
    WorkforceReportsService,
  ],
  exports: [WorkforceService, WorkforceNotificationService],
})
export class WorkforceModule {}
