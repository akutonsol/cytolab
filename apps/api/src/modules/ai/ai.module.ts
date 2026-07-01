import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { ResultSheetsModule } from '../result-sheets/result-sheets.module';
import { AiService } from './ai.service';
import { AiReportingService } from './ai-reporting.service';
import { AiReportingController } from './ai-reporting.controller';

/**
 * F4 AI-assisted reporting. Strictly assistive: never authorizes, never bypasses
 * the auth gate, degrades gracefully when unavailable. See
 * docs/F4_AI_REPORTING_DESIGN.md.
 */
@Module({
  imports: [PrismaModule, ResultSheetsModule],
  controllers: [AiReportingController],
  providers: [AiService, AiReportingService],
  exports: [AiService, AiReportingService],
})
export class AiModule {}
