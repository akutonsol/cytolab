import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ChangeRequestsService } from './change-requests.service';
import { ChangeRequestQueryDto, StaffReplyDto, TransitionChangeRequestDto } from './dto/change-request.dto';

/**
 * STAFF-facing change-request triage (normal staff JWT + permissions). Portal
 * users raise/answer requests on /portal/change-requests; staff manage them here.
 */
@ApiTags('change-requests (staff)')
@ApiBearerAuth()
@Controller('change-requests')
export class ChangeRequestsController {
  constructor(private changeRequests: ChangeRequestsService) {}

  @Get()
  @RequirePermissions('changerequest:view')
  findAll(@Query() query: ChangeRequestQueryDto) {
    return this.changeRequests.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('changerequest:view')
  findOne(@Param('id') id: string) {
    return this.changeRequests.findOne(id);
  }

  @Put(':id/status')
  @RequirePermissions('changerequest:change')
  @ApiOperation({ summary: 'Transition status (Open->InReview->Actioned|Declined), audited' })
  transition(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TransitionChangeRequestDto) {
    return this.changeRequests.transition(id, user.userId, dto);
  }

  @Post(':id/messages')
  @RequirePermissions('changerequest:change')
  reply(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StaffReplyDto) {
    return this.changeRequests.reply(id, user.userId, dto);
  }
}
