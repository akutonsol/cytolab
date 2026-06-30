import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPortalUser, Portal, PortalPrincipal } from '../common/portal-principal';
import { PortalAuthGuard } from '../auth/portal-auth.guard';
import { PortalChangeRequestsService } from './portal-change-requests.service';
import {
  CreateChangeRequestDto,
  CreatePortalMessageDto,
  PortalChangeRequestQueryDto,
} from './dto/portal-change-request.dto';

@ApiTags('portal-change-requests')
@ApiBearerAuth()
@Portal()
@UseGuards(PortalAuthGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('portal/change-requests')
export class PortalChangeRequestsController {
  constructor(private changeRequests: PortalChangeRequestsService) {}

  @Post()
  @ApiOperation({ summary: 'Raise a change request (opens a thread with lab staff)' })
  create(@CurrentPortalUser() user: PortalPrincipal, @Body() dto: CreateChangeRequestDto) {
    return this.changeRequests.create(dto, user);
  }

  @Get()
  findAll(@Query() query: PortalChangeRequestQueryDto) {
    return this.changeRequests.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.changeRequests.findOne(id);
  }

  @Post(':id/messages')
  addMessage(
    @CurrentPortalUser() user: PortalPrincipal,
    @Param('id') id: string,
    @Body() dto: CreatePortalMessageDto,
  ) {
    return this.changeRequests.addMessage(id, dto, user);
  }
}
