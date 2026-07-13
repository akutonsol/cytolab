import { Module } from '@nestjs/common';
import { DiagnosticCaseController } from './diagnostic-case.controller';
import { DiagnosticCaseService } from './diagnostic-case.service';

// Thin orchestration module for the Diagnostic Case Workspace. It owns no persistence, holds no
// Prisma, and imports NO owner module at A2 (contract-only). Later checkpoints (A3+) add owner-module
// imports band-by-band so the service can call each owner's existing read — the module never imports
// PrismaModule and never reads or writes clinical data directly. Sign-Out is not imported or modified.
@Module({
  controllers: [DiagnosticCaseController],
  providers: [DiagnosticCaseService],
})
export class DiagnosticCaseModule {}
