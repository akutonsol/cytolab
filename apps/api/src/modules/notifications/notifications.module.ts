import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsHelper } from './notifications.helper';

/**
 * Notifications. Leaf module (only depends on Prisma), so other domain modules
 * can import it to inject NotificationsHelper without any circular dependency.
 */
@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsHelper],
  exports: [NotificationsHelper],
})
export class NotificationsModule {}
