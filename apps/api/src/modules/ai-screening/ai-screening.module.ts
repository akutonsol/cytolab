import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { AIScreeningController } from './ai-screening.controller';
import { AIScreeningService } from './ai-screening.service';

@Module({
  imports: [PrismaModule],
  controllers: [AIScreeningController],
  providers: [AIScreeningService, FeatureGuard],
  exports: [AIScreeningService],
})
export class AIScreeningModule {}
