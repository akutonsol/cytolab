import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ChangePasswordDto, CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  @RequirePermissions('user:view')
  findAll(@CurrentUser() user: AuthUser) {
    return this.users.findAll(user.labId);
  }

  @Get(':id')
  @RequirePermissions('user:view')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.users.findOne(user.labId, id);
  }

  @Post()
  @RequirePermissions('user:create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(user.labId, dto);
  }

  @Put(':id')
  @RequirePermissions('user:change')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(user.labId, id, dto);
  }

  @Patch(':id/access')
  @RequirePermissions('user:change')
  setActive(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
  ) {
    return this.users.setActive(user.labId, id, body.isActive);
  }

  @Put('password/change')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.users.changePassword(user.userId, dto);
  }
}
