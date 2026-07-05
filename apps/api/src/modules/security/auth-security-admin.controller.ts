import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { SecurityService } from './security.service';
import { AddBlockedIpDto, RequireMfaDto } from './dto/security.dto';

/**
 * Admin security actions under the /auth prefix. Every route requires the
 * `system:security` permission (super roles bypass the guard).
 */
@ApiTags('security-admin')
@ApiBearerAuth()
@RequirePermissions('system:security')
@Controller('auth')
export class AuthSecurityAdminController {
  constructor(private security: SecurityService) {}

  // Sessions ----------------------------------------------------------------
  @Get('sessions')
  @ApiOperation({ summary: 'All active sessions (admin)' })
  sessions(@Query('userId') userId?: string) {
    return this.security.listSessions(userId);
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Terminate a session' })
  terminateSession(@Param('id') id: string) {
    return this.security.terminateSession(id);
  }

  @Post('users/:id/terminate-sessions')
  @ApiOperation({ summary: 'Terminate all sessions for a user' })
  terminateAll(@Param('id') id: string) {
    return this.security.terminateAllForUser(id);
  }

  // Login attempts ----------------------------------------------------------
  @Get('login-attempts')
  @ApiOperation({ summary: 'Login history (filterable)' })
  loginAttempts(
    @Query('email') email?: string,
    @Query('ip') ip?: string,
    @Query('success') success?: string,
    @Query('country') country?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.security.listLoginAttempts({
      email,
      ip,
      country,
      from,
      to,
      success: success === undefined ? undefined : success === 'true',
    });
  }

  // Locked users ------------------------------------------------------------
  @Get('locked-users')
  @ApiOperation({ summary: 'Locked accounts' })
  lockedUsers() {
    return this.security.listLockedUsers();
  }

  @Post('users/:id/unlock')
  @ApiOperation({ summary: 'Unlock an account' })
  unlock(@Param('id') id: string, @CurrentUser() admin: AuthUser) {
    return this.security.unlockUser(id, admin.userId);
  }

  @Post('users/:id/force-reset')
  @ApiOperation({ summary: 'Force a password reset on next login' })
  forceReset(@Param('id') id: string) {
    return this.security.forcePasswordReset(id);
  }

  @Patch('users/:id/require-mfa')
  @ApiOperation({ summary: 'Toggle whether a user must use MFA' })
  requireMfa(@Param('id') id: string, @Body() dto: RequireMfaDto) {
    return this.security.setMfaRequired(id, dto.required);
  }

  @Post('users/:id/reset-mfa')
  @ApiOperation({ summary: 'Admin override: wipe a user\'s MFA' })
  resetMfa(@Param('id') id: string) {
    return this.security.resetUserMfa(id);
  }

  // Blocked IPs -------------------------------------------------------------
  @Get('blocked-ips')
  @ApiOperation({ summary: 'Blocked IPs' })
  blockedIps() {
    return this.security.listBlockedIps();
  }

  @Post('blocked-ips')
  @ApiOperation({ summary: 'Block an IP' })
  addBlockedIp(@Body() dto: AddBlockedIpDto, @CurrentUser() admin: AuthUser) {
    return this.security.addBlockedIp(dto, admin.userId);
  }

  @Delete('blocked-ips/:id')
  @ApiOperation({ summary: 'Unblock an IP' })
  unblockIp(@Param('id') id: string) {
    return this.security.unblockIp(id);
  }

  // Trusted devices ---------------------------------------------------------
  @Get('trusted-devices')
  @ApiOperation({ summary: 'Trusted devices (optionally by user)' })
  trustedDevices(@Query('userId') userId?: string) {
    return this.security.listTrustedDevices(userId);
  }

  @Delete('trusted-devices/:id')
  @ApiOperation({ summary: 'Revoke a trusted device' })
  revokeTrustedDevice(@Param('id') id: string) {
    return this.security.revokeTrustedDevice(id);
  }
}
