import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { SystemHealthService } from './system-health.service';
import { BackupService } from './backup.service';

@ApiTags('system')
@ApiBearerAuth()
@Controller()
export class SystemHealthController {
  constructor(
    private readonly health: SystemHealthService,
    private readonly backup: BackupService,
  ) {}

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

  @Post('system/backup')
  @RequirePermissions('system:health')
  runBackup(@CurrentUser() _user: AuthUser) {
    return this.backup.runBackup('manual');
  }
}
