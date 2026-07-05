import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { WsiController } from './wsi.controller';
import { WsiService } from './wsi.service';

@Module({
  imports: [PrismaModule],
  controllers: [WsiController],
  providers: [WsiService],
  exports: [WsiService],
})
export class WsiModule {}
