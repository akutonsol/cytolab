import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { TaxesController } from './taxes.controller';
import { TaxesService } from './taxes.service';

@Module({
  imports: [PrismaModule],
  controllers: [TaxesController],
  providers: [TaxesService],
  exports: [TaxesService],
})
export class TaxesModule {}
