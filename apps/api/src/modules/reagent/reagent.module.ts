import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReagentController } from './reagent.controller';
import { ReagentService } from './reagent.service';
import { ReagentScheduler } from './reagent.scheduler';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [ReagentController],
  providers: [ReagentService, ReagentScheduler],
})
export class ReagentModule {}
