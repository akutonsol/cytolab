import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { ScreeningBatchesController } from './screening-batches.controller';
import { ScreeningBatchesService } from './screening-batches.service';

/**
 * Screening Batch Management owner module (Phase 4.2 · C3). Owns the
 * ScreeningBatch + ScreeningBatchCase aggregate only. RealtimeGateway is provided
 * globally, so it is injected without importing RealtimeModule. The service is
 * exported for later read-only composition (C4+), never for cross-owner writes.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ScreeningBatchesController],
  providers: [ScreeningBatchesService],
  exports: [ScreeningBatchesService],
})
export class ScreeningBatchesModule {}
