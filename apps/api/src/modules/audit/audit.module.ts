import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuditPersistenceService } from './audit-persistence.service';
import { AuditChainService } from './audit-chain.service';
import { AuditVerificationService } from './audit-verification.service';
import { PhiAccessDedup } from './phi-access-dedup';
import { AuditRecorder } from './audit-recorder.service';
import { AuditQueryService } from './query/audit-query.service';
import { AuditQueryController } from './query/audit-query.controller';
import { AuditQueryReadCaptureGuard } from './query/audit-query-read-capture.guard';
import { AuditExportController } from './query/audit-export.controller';
import { AuditExportCoordinator } from './query/audit-export.coordinator';

/**
 * Program 2 · P2-3 — Enterprise Audit owner module (ACTIVE).
 *
 * Owns the AuditEvent ledger and its contract/registry/validation surface. It exposes
 * exactly one producer-facing capture API — {@link AuditRecorder} — and keeps the
 * append-only {@link AuditPersistenceService} internal to the owner (NOT exported), so no
 * domain owner can reach persistence or Prisma AuditEvent directly. Attribution comes from
 * the P2-2 ExecutionContext (global); classification from the registry. Hash chain / sequence
 * remain inactive until P2-4.
 *
 * As of P2-3 this module is intentionally registered in AppModule to activate capture.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AuditQueryController, AuditExportController],
  providers: [
    AuditPersistenceService,
    AuditChainService,
    AuditVerificationService,
    PhiAccessDedup,
    AuditRecorder,
    // P2-7B — governed read-only query owner (the only non-verifier reader of prisma.auditEvent).
    AuditQueryService,
    // P2-7C — async-context recursion guard for PHI read-access capture.
    AuditQueryReadCaptureGuard,
    // P2-9A — governed audit-log export coordinator (assemble → serialize → capture → egress).
    AuditExportCoordinator,
  ],
  exports: [AuditRecorder, AuditQueryService],
})
export class AuditModule {}
