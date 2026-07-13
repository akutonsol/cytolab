import { Module } from '@nestjs/common';
import { RecordsModule } from '../records/records.module';
import { WsiModule } from '../wsi/wsi.module';
import { DiagnosticCaseController } from './diagnostic-case.controller';
import { DiagnosticCaseService } from './diagnostic-case.service';

// Thin orchestration module for the Diagnostic Case Workspace. It owns no persistence, holds no
// Prisma, and reads/writes no clinical data directly. It composes owner services by importing their
// modules band-by-band: RecordsModule (A3/A4 — RecordsService.findOne) and WsiModule (A5 — the
// mutation-free WsiService.listByRecordMeta slide-metadata seam, exactly as Sign-Out composes it).
// Both owner modules already export their service; their logic is unchanged. The module never imports
// PrismaModule; Sign-Out is not imported or modified.
@Module({
  imports: [RecordsModule, WsiModule],
  controllers: [DiagnosticCaseController],
  providers: [DiagnosticCaseService],
})
export class DiagnosticCaseModule {}
