import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { RecordsModule } from '../records/records.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [PrismaModule, RecordsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
