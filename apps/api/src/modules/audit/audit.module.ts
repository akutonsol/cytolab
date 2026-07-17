import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuditPersistenceService } from './audit-persistence.service';
import { AuditRecorder } from './audit-recorder.service';

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
  providers: [AuditPersistenceService, AuditRecorder],
  exports: [AuditRecorder],
})
export class AuditModule {}
