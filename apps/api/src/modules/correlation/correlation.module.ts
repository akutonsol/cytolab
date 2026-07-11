import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { CorrelationController } from './correlation.controller';
import { CorrelationService } from './correlation.service';

@Module({
  imports: [PrismaModule],
  controllers: [CorrelationController],
  providers: [CorrelationService],
  exports: [CorrelationService],
})
export class CorrelationModule {}
