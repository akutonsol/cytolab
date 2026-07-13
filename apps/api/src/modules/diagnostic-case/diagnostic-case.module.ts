import { Module } from '@nestjs/common';
import { RecordsModule } from '../records/records.module';
import { DiagnosticCaseController } from './diagnostic-case.controller';
import { DiagnosticCaseService } from './diagnostic-case.service';

// Thin orchestration module for the Diagnostic Case Workspace. It owns no persistence, holds no
// Prisma, and reads/writes no clinical data directly. It composes owner services by importing their
// modules band-by-band. A3 imports RecordsModule (which already exports RecordsService) so the Case
// Identity band can call the mutation-free RecordsService.findOne — RecordsService logic is unchanged.
// The module never imports PrismaModule; Sign-Out is not imported or modified.
@Module({
  imports: [RecordsModule],
  controllers: [DiagnosticCaseController],
  providers: [DiagnosticCaseService],
})
export class DiagnosticCaseModule {}
