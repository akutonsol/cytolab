import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { TatController } from './tat.controller';
import { TatService } from './tat.service';
import { TatScheduler } from './tat.scheduler';

@Module({
  imports: [PrismaModule],
  controllers: [TatController],
  providers: [TatService, TatScheduler],
})
export class TatModule {}
