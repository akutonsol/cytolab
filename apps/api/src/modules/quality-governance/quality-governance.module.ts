import { Module } from '@nestjs/common';
import { QualityGovernanceController } from './quality-governance.controller';
import { QualityGovernanceService } from './quality-governance.service';

// Thin orchestration module for the Quality & Governance Workspace. C2 imports NO owner
// modules and NO PrismaModule — it owns no persistence and reads no owner service yet.
// Later checkpoints (C3–C10) add owner-module imports as each evidence section lands.
@Module({
  controllers: [QualityGovernanceController],
  providers: [QualityGovernanceService],
})
export class QualityGovernanceModule {}
