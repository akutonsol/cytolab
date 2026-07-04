import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProficiencyController } from './proficiency.controller';
import { ProficiencyService } from './proficiency.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [ProficiencyController],
  providers: [ProficiencyService],
})
export class ProficiencyModule {}
