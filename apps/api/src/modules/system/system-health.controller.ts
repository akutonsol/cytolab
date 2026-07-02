import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { SystemHealthService } from './system-health.service';

@ApiTags('system')
@ApiBearerAuth()
@Controller()
export class SystemHealthController {
  constructor(private readonly health: SystemHealthService) {}

  @Get('system/health')
  @RequirePermissions('system:health')
  getHealth() {
    return this.health.getHealth();
  }

  @Post('system/maintenance')
  @RequirePermissions('system:health')
  runMaintenance(@CurrentUser() user: AuthUser) {
    return this.health.runMaintenance(user.userId);
  }
}
