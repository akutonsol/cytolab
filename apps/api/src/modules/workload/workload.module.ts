import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { RecordsModule } from '../records/records.module';
import { WorkloadController } from './workload.controller';
import { WorkloadService } from './workload.service';

@Module({
  imports: [PrismaModule, RecordsModule],
  controllers: [WorkloadController],
  providers: [WorkloadService],
})
export class WorkloadModule {}
