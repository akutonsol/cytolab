import { Module } from '@nestjs/common';
import { EnterpriseCaseManagementController } from './enterprise-case-management.controller';
import { EnterpriseCaseManagementService } from './enterprise-case-management.service';

/**
 * Phase 5 · E2 — Enterprise Case Management aggregate module.
 *
 * E2A imports nothing: the shell needs no PrismaModule and no owner modules.
 * Owner modules are added checkpoint-by-checkpoint (E2B onward) as queue
 * composition begins — never imported preemptively.
 */
@Module({
  controllers: [EnterpriseCaseManagementController],
  providers: [EnterpriseCaseManagementService],
})
export class EnterpriseCaseManagementModule {}
