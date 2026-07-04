import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { BethesdaController } from './bethesda.controller';
import { BethesdaService } from './bethesda.service';

@Module({
  imports: [PrismaModule],
  controllers: [BethesdaController],
  providers: [BethesdaService],
})
export class BethesdaModule {}
