import { Body, Controller, Get, Ip, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterLabDto } from './dto/login.dto';

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
  @Post('login')
  @ApiOperation({ summary: 'Login (legacy: POST /authenticate)' })
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.auth.login(dto, ip);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Exchange refresh token (legacy: GET /token/refresh)' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user (legacy: GET /authenticate/user)' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId);
  }
}
