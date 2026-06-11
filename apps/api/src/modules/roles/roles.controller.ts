import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RolesService } from './roles.service';

@ApiTags('roles')
@ApiBearerAuth()
@Controller()
export class RolesController {
  constructor(private roles: RolesService) {}

  @Get('roles')
  @RequirePermissions('role:view')
  findRoles() {
    return this.roles.findRoles();
  }

  @Get('permissions')
  @RequirePermissions('permission:view')
  findPermissions() {
    return this.roles.findPermissions();
  }

  @Post('roles')
  @RequirePermissions('permission:create')
  createRole(@Body() body: { name: string; description?: string; permissionIds?: string[] }) {
    return this.roles.createRole(body);
  }

  @Put('roles/:id')
  @RequirePermissions('permission:change')
  updateRole(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; permissionIds?: string[] },
  ) {
    return this.roles.updateRole(id, body);
  }

  @Delete('roles/:id')
  @RequirePermissions('permission:delete')
  deleteRole(@Param('id') id: string) {
    return this.roles.deleteRole(id);
  }
}
