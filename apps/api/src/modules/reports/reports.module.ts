import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportPdfService } from './report-pdf.service';

@Module({
  imports: [PrismaModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportPdfService],
  exports: [ReportsService],
})
export class ReportsModule {}
