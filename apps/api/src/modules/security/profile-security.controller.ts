import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthorizationContract } from '../../common/decorators/authorization-contract.decorator';
import { SecurityService } from './security.service';
import { SessionService } from './session.service';

/** The signed-in user's own security surface (profile → security page). */
@ApiTags('profile-security')
@ApiBearerAuth()
@Controller('auth/profile')
// Self-service: the signed-in user's own sessions / login history (scoped by
// user.userId) — authorization is the authenticated identity (R-001a).
@AuthorizationContract('authenticated')
export class ProfileSecurityController {
  constructor(
    private security: SecurityService,
    private sessions: SessionService,
  ) {}

  @Get('sessions')
  @ApiOperation({ summary: 'My active sessions' })
  mySessions(@CurrentUser() user: AuthUser) {
    return this.security.listSessions(user.userId);
  }

  @Post('sessions/terminate-others')
  @ApiOperation({ summary: 'Terminate all my sessions except this one' })
  async terminateOthers(@CurrentUser() user: AuthUser) {
    if (!user.sessionId) {
      // No session id on this (legacy) token — fall back to terminating all.
      const terminated = await this.sessions.revokeAllForUser(user.userId);
      return { status: 'OK' as const, terminated };
    }
    const terminated = await this.sessions.revokeOthersForUser(user.userId, user.sessionId);
    return { status: 'OK' as const, terminated };
  }

  @Get('login-history')
  @ApiOperation({ summary: 'My last 10 login attempts' })
  myLoginHistory(@CurrentUser() user: AuthUser) {
    return this.security.listUserLoginHistory(user.userId, 10);
  }
}
