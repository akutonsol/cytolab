import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RecallController } from './recall.controller';
import { RecallService } from './recall.service';
import { RecallScheduler } from './recall.scheduler';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [RecallController],
  providers: [RecallService, RecallScheduler],
  exports: [RecallService],
})
export class RecallModule {}
