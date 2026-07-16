import { Module } from '@nestjs/common';
import { RecordsModule } from '../records/records.module';
import { EnterpriseCaseManagementController } from './enterprise-case-management.controller';
import { EnterpriseCaseManagementService } from './enterprise-case-management.service';

/**
 * Phase 5 · E2 — Enterprise Case Management aggregate module.
 *
 * E2B composes the Records owner only (record-projection queues). Additional
 * owner modules are added checkpoint-by-checkpoint (E2C onward) as cross-owner
 * composition begins — never imported preemptively. No PrismaModule.
 */
@Module({
  imports: [RecordsModule],
  controllers: [EnterpriseCaseManagementController],
  providers: [EnterpriseCaseManagementService],
})
export class EnterpriseCaseManagementModule {}
