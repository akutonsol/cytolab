import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { CodingController } from './coding.controller';
import { CodingService } from './coding.service';

@Module({
  imports: [PrismaModule],
  controllers: [CodingController],
  providers: [CodingService],
  exports: [CodingService],
})
export class CodingModule {}
