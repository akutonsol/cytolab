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

  // Downloads the latest encrypted GCS backup, decrypts it, and confirms it is
  // restorable — a tested restoration path. Superuser-only (system:health).
  @Post('system/backup/verify-latest')
  @RequirePermissions('system:health')
  verifyLatestBackup(@CurrentUser() _user: AuthUser) {
    return this.backup.verifyLatestBackup();
  }

  @Post('system/health/deep-check')
  @RequirePermissions('system:health')
  async runDeepDiagnostics() {
    const start = Date.now();
    const results = await this.health.runDeepDiagnostics();
    return {
      ranAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      overall: results.some((r) => r.status === 'error') ? 'error'
        : results.some((r) => r.status === 'warn') ? 'warn' : 'ok',
      checks: results,
    };
  }
}
