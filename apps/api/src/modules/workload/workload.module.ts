import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { RecordsModule } from '../records/records.module';
import { ScreeningBatchesModule } from '../screening-batches/screening-batches.module';
import { WorkloadController } from './workload.controller';
import { WorkloadService } from './workload.service';

// C4 read bridge: WorkloadModule consumes the Screening Batch owner (which exports
// ScreeningBatchesService) purely to compose an operational-awareness view. No cycle
// is introduced — ScreeningBatchesModule imports only PrismaModule.
@Module({
  imports: [PrismaModule, RecordsModule, ScreeningBatchesModule],
  controllers: [WorkloadController],
  providers: [WorkloadService],
})
export class WorkloadModule {}
