import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { RecordsModule } from '../records/records.module';
import { ResultSheetsController } from './result-sheets.controller';
import { ResultSheetsService } from './result-sheets.service';

@Module({
  imports: [PrismaModule, RecordsModule],
  controllers: [ResultSheetsController],
  providers: [ResultSheetsService],
  exports: [ResultSheetsService],
})
export class ResultSheetsModule {}
