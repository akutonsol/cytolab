import { Module } from '@nestjs/common';
import { RecordsModule } from '../records/records.module';
import { WsiModule } from '../wsi/wsi.module';
import { FilesModule } from '../files/files.module';
import { BethesdaModule } from '../bethesda/bethesda.module';
import { CodingModule } from '../coding/coding.module';
import { AiModule } from '../ai/ai.module';
import { CorrelationModule } from '../correlation/correlation.module';
import { EscalationModule } from '../escalation/escalation.module';
import { ResultSheetsModule } from '../result-sheets/result-sheets.module';
import { AncillaryOrdersModule } from '../ancillary-orders/ancillary-orders.module';
import { DiagnosticCaseController } from './diagnostic-case.controller';
import { DiagnosticCaseService } from './diagnostic-case.service';

// Thin orchestration module for the Diagnostic Case Workspace. It owns no persistence, holds no
// Prisma, and reads/writes no clinical data directly. It composes owner services by importing their
// modules band-by-band: RecordsModule (A3/A4 — RecordsService.findOne), WsiModule (A5 — the
// mutation-free WsiService.listByRecordMeta slide-metadata seam), and FilesModule (A6 — the
// mutation-free FilesService.getRecordAttachments read, mapped to metadata only; storage/delivery
// stays with Files), BethesdaModule + CodingModule (A7 — the mutation-free BethesdaService.getByRecord
// and CodingService.getRecordCodings reads, allowlisted; suggest()/write paths are never called). All
// owner modules already export their service; their logic is unchanged. A8 adds AiModule (the
// mutation-free AiReportingService.draftsByRecord metadata read; generated text stays with the owner).
// A9 adds CorrelationModule (the mutation-free CorrelationService.byPatient read; patient correlation
// cases, existence + classification only). A10 adds EscalationModule (the mutation-free record-scoped
// EscalationService.list({ recordId }, userId) read; escalation metadata only). A11 adds ResultSheetsModule
// (the mutation-free ResultSheetsService.metaByRecord + eventsByRecord reads — reporting metadata only, the
// same reads Sign-Out composes; Sign-Out itself is NOT imported or modified). The module never imports
// PrismaModule.
@Module({
  imports: [RecordsModule, WsiModule, FilesModule, BethesdaModule, CodingModule, AiModule, CorrelationModule, EscalationModule, ResultSheetsModule, AncillaryOrdersModule],
  controllers: [DiagnosticCaseController],
  providers: [DiagnosticCaseService],
})
export class DiagnosticCaseModule {}
