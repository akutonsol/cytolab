import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { LabFeaturesController } from './lab-features.controller';
import { LabFeaturesService } from './lab-features.service';

@Module({
  imports: [PrismaModule],
  controllers: [LabFeaturesController],
  providers: [LabFeaturesService],
})
export class LabFeaturesModule {}
