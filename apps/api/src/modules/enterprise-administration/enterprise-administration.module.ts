import { Module } from '@nestjs/common';
import { LabModule } from '../lab/lab.module';
import { DepartmentsModule } from '../departments/departments.module';
import { UsersModule } from '../users/users.module';
import { RolesModule } from '../roles/roles.module';
import { EnterpriseAdministrationController } from './enterprise-administration.controller';
import { EnterpriseAdministrationService } from './enterprise-administration.service';

// Thin orchestration module for the Enterprise Administration & Controls Workspace. It owns no
// persistence and holds no Prisma. A3 imports the owner modules whose recorded configuration the
// Laboratory/Branding/Departments sections read (each owner module exports its service). Later
// checkpoints add more owner-module imports as each section lands.
@Module({
  imports: [LabModule, DepartmentsModule, UsersModule, RolesModule],
  controllers: [EnterpriseAdministrationController],
  providers: [EnterpriseAdministrationService],
})
export class EnterpriseAdministrationModule {}
