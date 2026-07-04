import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { SystemHealthController } from './system-health.controller';
import { SystemHealthService } from './system-health.service';
import { SystemHealthScheduler } from './system-health.scheduler';
import { SystemLogController } from './system-log.controller';
import { SystemLogService } from './system-log.service';
import { BackupService } from './backup.service';

@Module({
  imports: [PrismaModule],
  controllers: [SystemHealthController, SystemLogController],
  providers: [SystemHealthService, SystemHealthScheduler, SystemLogService, BackupService],
  exports: [SystemHealthService],
})
export class SystemModule {}
