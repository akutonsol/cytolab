import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { SystemHealthController } from './system-health.controller';
import { SystemHealthService } from './system-health.service';
import { SystemHealthScheduler } from './system-health.scheduler';

@Module({
  imports: [PrismaModule],
  controllers: [SystemHealthController],
  providers: [SystemHealthService, SystemHealthScheduler],
  exports: [SystemHealthService],
})
export class SystemModule {}
