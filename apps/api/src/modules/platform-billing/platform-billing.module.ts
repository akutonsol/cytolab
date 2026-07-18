import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PlatformBillingController } from './platform-billing.controller';
import { PlatformBillingService } from './platform-billing.service';
import { PlatformBillingScheduler } from './platform-billing.scheduler';

@Module({
  imports: [PrismaModule, NotificationsModule, RealtimeModule],
  controllers: [PlatformBillingController],
  providers: [PlatformBillingService, PlatformBillingScheduler],
  exports: [PlatformBillingService],
})
export class PlatformBillingModule {}
