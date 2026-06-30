import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { CodeSheetsController } from './code-sheets.controller';
import { CodeSheetsService } from './code-sheets.service';

@Module({
  imports: [PrismaModule],
  controllers: [CodeSheetsController],
  providers: [CodeSheetsService],
  exports: [CodeSheetsService],
})
export class CodeSheetsModule {}
