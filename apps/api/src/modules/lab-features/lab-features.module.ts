import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { LabFeaturesController } from './lab-features.controller';
import { LabFeaturesService } from './lab-features.service';

@Module({
  imports: [PrismaModule],
  controllers: [LabFeaturesController],
  providers: [LabFeaturesService],
  // Read-only composition by the Enterprise Administration workspace (Feature Flags status).
  // Toggling stays SuperuserGuard-controlled on the lab-features controller.
  exports: [LabFeaturesService],
})
export class LabFeaturesModule {}
