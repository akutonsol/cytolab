import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SystemHealthController } from './system-health.controller';
import { SystemHealthService } from './system-health.service';
import { SystemHealthScheduler } from './system-health.scheduler';
import { SystemLogController } from './system-log.controller';
import { SystemLogService } from './system-log.service';
import { BackupService } from './backup.service';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [SystemHealthController, SystemLogController, SupportController],
  providers: [SystemHealthService, SystemHealthScheduler, SystemLogService, BackupService, SupportService],
  exports: [SystemHealthService],
})
export class SystemModule {}
