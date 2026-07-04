import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReqTrackingController } from './req-tracking.controller';
import { ReqTrackingService } from './req-tracking.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [ReqTrackingController],
  providers: [ReqTrackingService],
})
export class ReqTrackingModule {}
