import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { QcController } from './qc.controller';
import { QcService } from './qc.service';
import { EquipmentController } from './equipment.controller';
import { EquipmentService } from './equipment.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [QcController, EquipmentController],
  providers: [QcService, EquipmentService],
})
export class QcModule {}
