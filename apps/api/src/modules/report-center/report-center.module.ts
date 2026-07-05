import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { ReportCenterController } from './report-center.controller';
import { ReportCenterService } from './report-center.service';

@Module({
  imports: [PrismaModule],
  controllers: [ReportCenterController],
  providers: [ReportCenterService],
  exports: [ReportCenterService],
})
export class ReportCenterModule {}
