import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { TatController } from './tat.controller';
import { TatService } from './tat.service';
import { TatScheduler } from './tat.scheduler';

@Module({
  imports: [PrismaModule],
  controllers: [TatController],
  providers: [TatService, TatScheduler],
  exports: [TatService], // Phase 5 · E1D — consumed read-only by the future Enterprise Case Management aggregate
})
export class TatModule {}
