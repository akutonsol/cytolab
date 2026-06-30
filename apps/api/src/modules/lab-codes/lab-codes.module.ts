import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { LabCodesController } from './lab-codes.controller';
import { LabCodesService } from './lab-codes.service';

@Module({
  imports: [PrismaModule],
  controllers: [LabCodesController],
  providers: [LabCodesService],
  exports: [LabCodesService],
})
export class LabCodesModule {}
