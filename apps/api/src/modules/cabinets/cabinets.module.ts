import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { CabinetsController } from './cabinets.controller';
import { CabinetsService } from './cabinets.service';

@Module({
  imports: [PrismaModule],
  controllers: [CabinetsController],
  providers: [CabinetsService],
  exports: [CabinetsService],
})
export class CabinetsModule {}
