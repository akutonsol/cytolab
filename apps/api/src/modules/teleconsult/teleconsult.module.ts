import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TeleconsultController } from './teleconsult.controller';
import { TeleconsultService } from './teleconsult.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [TeleconsultController],
  providers: [TeleconsultService],
  exports: [TeleconsultService],
})
export class TeleconsultModule {}
