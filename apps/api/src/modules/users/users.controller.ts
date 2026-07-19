import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ChangePasswordDto, CreateUserDto, SaveSignatureDto, UpdatePreferencesDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  // ── Own signature (no extra permission — a user manages their own). Declared
  //    before :id so the two-segment path is unambiguous. ──
  @Get('me/signature')
  getMySignature(@CurrentUser() user: AuthUser) {
    return this.users.getMySignature(user.userId);
  }

  @Put('me/signature')
  saveMySignature(@CurrentUser() user: AuthUser, @Body() dto: SaveSignatureDto) {
    return this.users.saveMySignature(user.userId, dto.signatureDataUri);
  }

  // ── Own UI preferences (guided assistance) — a user manages their own. ──
  @Get('me/preferences')
  getMyPreferences(@CurrentUser() user: AuthUser) {
    return this.users.getMyPreferences(user.userId);
  }

  @Patch('me/preferences')
  updateMyPreferences(@CurrentUser() user: AuthUser, @Body() dto: UpdatePreferencesDto) {
    return this.users.updateMyPreferences(user.userId, dto);
  }

  // Queries are lab-scoped automatically by the tenancy guard (labId from JWT).
  @Get()
  @RequirePermissions('user:view')
  findAll() {
    return this.users.findAll();
  }

  @Get(':id')
  @RequirePermissions('user:view')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Post()
  @RequirePermissions('user:create')
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Put(':id')
  @RequirePermissions('user:change')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Patch(':id/access')
  @RequirePermissions('user:change')
  setActive(@Param('id') id: string, @Body() body: { isActive: boolean }) {
    return this.users.setActive(id, body.isActive);
  }

  @Put('password/change')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.users.changePassword(user.userId, dto);
  }
}
