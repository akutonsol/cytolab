import { Module } from '@nestjs/common';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  controllers: [RolesController],
  providers: [RolesService],
  // Read-only composition by the Enterprise Administration workspace (Roles + Permissions catalog).
  // Enforcement authority stays with the roles controller (role:view / permission:view).
  exports: [RolesService],
})
export class RolesModule {}
