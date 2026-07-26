import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthorizationContract } from '../../common/decorators/authorization-contract.decorator';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  LoginDto,
  MfaChallengeDto,
  MfaSendDto,
  RegisterLabDto,
} from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('register-lab')
  @ApiOperation({ summary: 'Bootstrap a new lab (tenant) with its first Superuser' })
  registerLab(@Body() dto: RegisterLabDto) {
    return this.auth.registerLab(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @ApiOperation({ summary: 'Login — sets HttpOnly cookies, or returns an MFA challenge' })
  login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.login(dto, req, res);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('mfa/challenge')
  @ApiOperation({ summary: 'Complete the MFA step of login using the mfaToken + a code' })
  mfaChallenge(
    @Body() dto: MfaChallengeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.completeMfaChallenge(dto.mfaToken, dto.code, req, res);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('mfa/challenge/email')
  @ApiOperation({ summary: 'Resend the email OTP during login (authorised by mfaToken)' })
  sendLoginEmailOtp(@Body() dto: MfaSendDto) {
    return this.auth.sendLoginEmailOtp(dto.mfaToken);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate the refresh cookie and issue a new access cookie' })
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.refresh(req, res);
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Revoke the current session and clear auth cookies' })
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req, res);
  }

  @Get('me')
  @AuthorizationContract('authenticated')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId);
  }

  @Post('change-password')
  @AuthorizationContract('authenticated')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change own password (enforces policy + no-reuse)' })
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.userId, dto.currentPassword, dto.newPassword);
  }
}
