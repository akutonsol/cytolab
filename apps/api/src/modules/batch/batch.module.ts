import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { ResultSheetsModule } from '../result-sheets/result-sheets.module';
import { BatchController } from './batch.controller';
import { BatchService } from './batch.service';

@Module({
  imports: [PrismaModule, ResultSheetsModule],
  controllers: [BatchController],
  providers: [BatchService],
})
export class BatchModule {}
