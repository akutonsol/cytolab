import { Body, Controller, Get, Ip, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import {
  CurrentPortalUser,
  Portal,
  PortalPrincipal,
} from '../common/portal-principal';
import { PortalAuthGuard } from './portal-auth.guard';
import { PortalAuthService } from './portal-auth.service';
import { PortalLoginDto, PortalRefreshDto, ResetRequestDto, SetPasswordDto } from './dto/portal-auth.dto';

/**
 * Client portal auth. @Portal() makes the global staff guard stand down; the
 * controller's PortalAuthGuard authenticates the protected routes with the
 * portal JWT strategy. Public routes (login/refresh/invite/reset) carry @Public.
 * Rate-limited, with login tightened further.
 */
@ApiTags('portal-auth')
@Portal()
@UseGuards(PortalAuthGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('portal/auth')
export class PortalAuthController {
  constructor(private auth: PortalAuthService) {}

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Portal login (separate token family from staff)' })
  login(@Body() dto: PortalLoginDto, @Ip() ip: string) {
    return this.auth.login(dto, ip);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: PortalRefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('accept-invite')
  @ApiOperation({ summary: 'Accept a staff invite and set the first password' })
  acceptInvite(@Body() dto: SetPasswordDto) {
    return this.auth.setPassword(dto);
  }

  @Public()
  @Post('reset-request')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Request a password reset (identical response whether or not the email exists)' })
  resetRequest(@Body() dto: ResetRequestDto) {
    return this.auth.requestReset(dto);
  }

  @Public()
  @Post('reset')
  @ApiOperation({ summary: 'Set a new password using a reset token' })
  reset(@Body() dto: SetPasswordDto) {
    return this.auth.setPassword(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current portal user' })
  me(@CurrentPortalUser() user: PortalPrincipal) {
    return this.auth.me(user);
  }
}
