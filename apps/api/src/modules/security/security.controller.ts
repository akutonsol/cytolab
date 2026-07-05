import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { SecurityService } from './security.service';
import { UpdatePasswordPolicyDto } from './dto/security.dto';

/** Security Center under the /security prefix — all `system:security` gated. */
@ApiTags('security')
@ApiBearerAuth()
@RequirePermissions('system:security')
@Controller('security')
export class SecurityController {
  constructor(private security: SecurityService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Security dashboard KPIs + recent activity' })
  dashboard() {
    return this.security.getDashboard();
  }

  @Get('mfa')
  @ApiOperation({ summary: 'MFA status across users' })
  mfa() {
    return this.security.listMfa();
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Security alerts (filterable)' })
  alerts(
    @Query('type') type?: string,
    @Query('severity') severity?: string,
    @Query('resolved') resolved?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.security.listAlerts({
      type,
      severity,
      from,
      to,
      resolved: resolved === undefined ? undefined : resolved === 'true',
    });
  }

  @Patch('alerts/:id/resolve')
  @ApiOperation({ summary: 'Resolve a security alert' })
  resolveAlert(@Param('id') id: string, @CurrentUser() admin: AuthUser) {
    return this.security.resolveAlert(id, admin.userId);
  }

  @Get('password-policy')
  @ApiOperation({ summary: 'Current password policy' })
  getPolicy() {
    return this.security.getPasswordPolicy();
  }

  @Patch('password-policy')
  @ApiOperation({ summary: 'Update password policy' })
  updatePolicy(@Body() dto: UpdatePasswordPolicyDto) {
    return this.security.updatePasswordPolicy(dto);
  }
}
