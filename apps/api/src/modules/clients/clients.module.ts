import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { PortalModule } from '../portal/portal.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

@Module({
  imports: [PrismaModule, PortalModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
