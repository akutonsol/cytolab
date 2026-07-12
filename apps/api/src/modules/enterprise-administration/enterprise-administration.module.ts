import { Module } from '@nestjs/common';
import { EnterpriseAdministrationController } from './enterprise-administration.controller';
import { EnterpriseAdministrationService } from './enterprise-administration.service';

// Thin orchestration module for the Enterprise Administration & Controls Workspace. It owns no
// persistence and holds no Prisma. A2 imports NO owner module (the permission map is built from
// the caller's claims only); later checkpoints (A3–A9) add owner-module imports as each section lands.
@Module({
  controllers: [EnterpriseAdministrationController],
  providers: [EnterpriseAdministrationService],
})
export class EnterpriseAdministrationModule {}
