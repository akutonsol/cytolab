import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { EscalationModule } from '../escalation/escalation.module';
import { BethesdaController } from './bethesda.controller';
import { BethesdaService } from './bethesda.service';
import { BethesdaAnalyticsService } from './bethesda-analytics.service';

@Module({
  imports: [PrismaModule, EscalationModule],
  controllers: [BethesdaController],
  providers: [BethesdaService, BethesdaAnalyticsService],
})
export class BethesdaModule {}
