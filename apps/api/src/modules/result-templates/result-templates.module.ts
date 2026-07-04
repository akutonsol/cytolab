import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { ResultTemplatesController } from './result-templates.controller';
import { ResultTemplatesService } from './result-templates.service';

@Module({
  imports: [PrismaModule],
  controllers: [ResultTemplatesController],
  providers: [ResultTemplatesService],
})
export class ResultTemplatesModule {}
