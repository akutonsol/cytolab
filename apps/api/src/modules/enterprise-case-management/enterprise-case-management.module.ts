import { Module } from '@nestjs/common';
import { AncillaryOrdersModule } from '../ancillary-orders/ancillary-orders.module';
import { CorrelationModule } from '../correlation/correlation.module';
import { EscalationModule } from '../escalation/escalation.module';
import { QcModule } from '../qc/qc.module';
import { RecallModule } from '../recall/recall.module';
import { RecordsModule } from '../records/records.module';
import { TatModule } from '../tat/tat.module';
import { EnterpriseCaseManagementController } from './enterprise-case-management.controller';
import { EnterpriseCaseManagementService } from './enterprise-case-management.service';

/**
 * Phase 5 · E2 — Enterprise Case Management aggregate module.
 *
 * E2B composes the Records owner (record-projection queues). E2C adds the five
 * cross-owner signal owners (ancillary, correlation, QC, recall, escalation).
 * E2D adds TatModule for the standalone Overdue overlay (recorded breach alerts).
 * No PrismaModule, no Workload/Operations/SignOut/DiagnosticCase/ResultSheets/ChangeRequests.
 */
@Module({
  imports: [RecordsModule, AncillaryOrdersModule, CorrelationModule, QcModule, RecallModule, EscalationModule, TatModule],
  controllers: [EnterpriseCaseManagementController],
  providers: [EnterpriseCaseManagementService],
})
export class EnterpriseCaseManagementModule {}
