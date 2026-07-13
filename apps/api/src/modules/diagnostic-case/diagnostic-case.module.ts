import { Module } from '@nestjs/common';
import { RecordsModule } from '../records/records.module';
import { WsiModule } from '../wsi/wsi.module';
import { FilesModule } from '../files/files.module';
import { BethesdaModule } from '../bethesda/bethesda.module';
import { CodingModule } from '../coding/coding.module';
import { AiModule } from '../ai/ai.module';
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
// The module never imports PrismaModule; Sign-Out is not imported or modified.
@Module({
  imports: [RecordsModule, WsiModule, FilesModule, BethesdaModule, CodingModule, AiModule],
  controllers: [DiagnosticCaseController],
  providers: [DiagnosticCaseService],
})
export class DiagnosticCaseModule {}
