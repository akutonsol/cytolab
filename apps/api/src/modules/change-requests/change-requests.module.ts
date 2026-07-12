import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { ChangeRequestsController } from './change-requests.controller';
import { ChangeRequestsService } from './change-requests.service';

@Module({
  imports: [PrismaModule],
  controllers: [ChangeRequestsController],
  providers: [ChangeRequestsService],
  // Read-only composition by the Quality & Governance workspace (change-request events).
  // Enforcement authority stays with the change-request controllers (changerequest:view).
  exports: [ChangeRequestsService],
})
export class ChangeRequestsModule {}
