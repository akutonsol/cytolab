import { Module } from '@nestjs/common';
import { CorrelationModule } from '../correlation/correlation.module';
import { QcModule } from '../qc/qc.module';
import { EscalationModule } from '../escalation/escalation.module';
import { RecallModule } from '../recall/recall.module';
import { ProficiencyModule } from '../proficiency/proficiency.module';
import { QualityGovernanceController } from './quality-governance.controller';
import { QualityGovernanceService } from './quality-governance.service';

// Thin orchestration module for the Quality & Governance Workspace. It owns no persistence
// and holds no Prisma: it composes existing owner services (each owner module exports its
// service). C3 imports the owner modules whose recorded summaries the Overview reads.
// Later checkpoints add more owner-module imports as each evidence section lands.
@Module({
  imports: [CorrelationModule, QcModule, EscalationModule, RecallModule, ProficiencyModule],
  controllers: [QualityGovernanceController],
  providers: [QualityGovernanceService],
})
export class QualityGovernanceModule {}
