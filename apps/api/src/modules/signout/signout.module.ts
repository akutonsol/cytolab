import { Module } from '@nestjs/common';
import { RecordsModule } from '../records/records.module';
import { WsiModule } from '../wsi/wsi.module';
import { AIScreeningModule } from '../ai-screening/ai-screening.module';
import { BethesdaModule } from '../bethesda/bethesda.module';
import { CorrelationModule } from '../correlation/correlation.module';
import { SignoutController } from './signout.controller';
import { SignoutService } from './signout.service';

// Thin orchestration module: composes existing services (each owner module exports its
// service) around one case. Owns no domain logic and no persistence.
@Module({
  imports: [RecordsModule, WsiModule, AIScreeningModule, BethesdaModule, CorrelationModule],
  controllers: [SignoutController],
  providers: [SignoutService],
})
export class SignoutModule {}
