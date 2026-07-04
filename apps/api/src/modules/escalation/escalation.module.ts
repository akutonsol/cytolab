import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EscalationController } from './escalation.controller';
import { EscalationService } from './escalation.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [EscalationController],
  providers: [EscalationService],
  exports: [EscalationService],
})
export class EscalationModule {}
