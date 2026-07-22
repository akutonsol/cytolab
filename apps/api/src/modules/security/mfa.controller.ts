import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthorizationContract } from '../../common/decorators/authorization-contract.decorator';
import { MfaService } from './mfa.service';
import { MfaCodeDto } from './dto/security.dto';

/** Self-service MFA enrolment for the signed-in user. */
@ApiTags('mfa')
@ApiBearerAuth()
@Controller('auth/mfa')
// Self-service MFA on the caller's own account — authorization is the authenticated
// identity itself, not a role permission (R-001a authorization contract).
@AuthorizationContract('authenticated')
export class MfaController {
  constructor(private mfa: MfaService) {}

  @Get('status')
  @ApiOperation({ summary: 'MFA status for the current user' })
  status(@CurrentUser() user: AuthUser) {
    return this.mfa.getStatus(user.userId);
  }

  @Post('totp/setup')
  @ApiOperation({ summary: 'Start TOTP setup — returns QR (base64 PNG) + manual key' })
  totpSetup(@CurrentUser() user: AuthUser) {
    return this.mfa.setupTotp({ id: user.userId, email: user.email });
  }

  @Post('totp/verify')
  @ApiOperation({ summary: 'Verify + enable TOTP, returns one-time backup codes' })
  totpVerify(@CurrentUser() user: AuthUser, @Body() dto: MfaCodeDto) {
    return this.mfa.verifyTotpSetup({ id: user.userId, email: user.email }, dto.code);
  }

  @Post('totp/disable')
  @ApiOperation({ summary: 'Disable TOTP (requires a current code)' })
  totpDisable(@CurrentUser() user: AuthUser, @Body() dto: MfaCodeDto) {
    return this.mfa.disableTotp({ id: user.userId, email: user.email }, dto.code);
  }

  @Post('email/send')
  @ApiOperation({ summary: 'Send a 6-digit email OTP to the current user' })
  emailSend(@CurrentUser() user: AuthUser) {
    return this.mfa.sendEmailOtp({ id: user.userId, email: user.email });
  }

  @Post('email/verify')
  @ApiOperation({ summary: 'Verify an emailed OTP' })
  async emailVerify(@CurrentUser() user: AuthUser, @Body() dto: MfaCodeDto) {
    const ok = await this.mfa.verifyEmailOtp(user.userId, dto.code);
    return { status: ok ? 'OK' : 'INVALID' };
  }
}
