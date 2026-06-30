import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { PortalUsersService } from './portal-users.service';
import { CreatePortalUserDto, PortalUserQueryDto } from './dto/portal-user.dto';

/**
 * STAFF-facing management of portal accounts (not a portal route — guarded by the
 * normal staff JWT + permissions). v1 is invite-only; no public self-signup.
 */
@ApiTags('portal-users (staff)')
@ApiBearerAuth()
@Controller('portal-users')
export class PortalUsersController {
  constructor(private portalUsers: PortalUsersService) {}

  @Post('invite')
  @RequirePermissions('portaluser:create')
  @ApiOperation({ summary: 'Invite a client portal user (emails a single-use setup link)' })
  create(@Body() dto: CreatePortalUserDto) {
    return this.portalUsers.create(dto);
  }

  @Get()
  @RequirePermissions('portaluser:view')
  findAll(@Query() query: PortalUserQueryDto) {
    return this.portalUsers.findAll(query);
  }

  @Put('resend-invite/:id')
  @RequirePermissions('portaluser:create')
  resendInvite(@Param('id') id: string) {
    return this.portalUsers.resendInvite(id);
  }

  @Put('activate/:id')
  @RequirePermissions('portaluser:change')
  activate(@Param('id') id: string) {
    return this.portalUsers.setActive(id, true);
  }

  @Put('deactivate/:id')
  @RequirePermissions('portaluser:change')
  deactivate(@Param('id') id: string) {
    return this.portalUsers.setActive(id, false);
  }
}
