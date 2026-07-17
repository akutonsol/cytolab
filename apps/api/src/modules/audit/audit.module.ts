import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuditPersistenceService } from './audit-persistence.service';

/**
 * Program 2 · P2-1 — Enterprise Audit owner module (foundation).
 *
 * Owns the AuditEvent ledger and its contract/registry/validation surface. It provides
 * only the internal append-only persistence boundary; the producer-facing capture API
 * (AuditRecorder), request enrichment, and hash chain are P2-2..P2-4.
 *
 * DELIBERATELY NOT registered in AppModule yet: registering it would imply live capture,
 * which does not exist in P2-1. Wiring the owner into the application (and exposing
 * AuditRecorder to domain owners) happens in P2-3. The service is exported so that future
 * checkpoint modules can import it once capture is real.
 */
@Module({
  imports: [PrismaModule],
  providers: [AuditPersistenceService],
  exports: [AuditPersistenceService],
})
export class AuditModule {}
