import { Module } from '@nestjs/common';
import { DatasetGovernanceService } from './dataset-governance.service';
import { DatasetGovernanceController } from './dataset-governance.controller';

/**
 * Program 6 · Phase 6B — dataset governance. Parallel to the 6A registry (untouched). PrismaService +
 * AuditRecorder come from their @Global modules. No worker/scheduler and no inference/training/validation.
 */
@Module({
  controllers: [DatasetGovernanceController],
  providers: [DatasetGovernanceService],
  exports: [DatasetGovernanceService],
})
export class DatasetGovernanceModule {}
