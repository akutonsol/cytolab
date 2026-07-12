import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { FilesModule } from '../files/files.module';
import { LabController } from './lab.controller';
import { LabService } from './lab.service';

@Module({
  imports: [PrismaModule, FilesModule],
  controllers: [LabController],
  providers: [LabService],
  // Read-only composition by the Enterprise Administration workspace (Laboratory/Branding).
  // Enforcement authority stays with the lab controller (applicationprefs:view/change).
  exports: [LabService],
})
export class LabModule {}
