import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AncillaryOrdersController } from './ancillary-orders.controller';
import { AncillaryOrdersService } from './ancillary-orders.service';

/**
 * Ancillary & IHC Ordering owner module (Phase 4.1A · B3). Owns the
 * AncillaryOrder aggregate only. RealtimeGateway is provided globally, so it is
 * injected without importing RealtimeModule.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AncillaryOrdersController],
  providers: [AncillaryOrdersService],
  exports: [AncillaryOrdersService],
})
export class AncillaryOrdersModule {}
