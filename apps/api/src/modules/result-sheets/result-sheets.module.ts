import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { RecordsModule } from '../records/records.module';
import { EscalationModule } from '../escalation/escalation.module';
import { AncillaryOrdersModule } from '../ancillary-orders/ancillary-orders.module';
import { ResultSheetsController } from './result-sheets.controller';
import { ResultSheetsService } from './result-sheets.service';

@Module({
  imports: [PrismaModule, RecordsModule, EscalationModule, AncillaryOrdersModule],
  controllers: [ResultSheetsController],
  providers: [ResultSheetsService],
  exports: [ResultSheetsService],
})
export class ResultSheetsModule {}
