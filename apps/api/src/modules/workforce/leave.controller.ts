import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { WorkforceManagerGuard } from './guards/manager.guard';
import { LeaveService } from './leave.service';
import {
  CreateLeaveRequestDto, CreateLeaveTypeDto, InitializeBalancesDto, LeaveRequestQuery, RejectLeaveDto,
} from './dto/workforce-phase2.dto';

@ApiTags('workforce-leave')
@ApiBearerAuth()
@Controller()
export class LeaveController {
  constructor(private leave: LeaveService) {}

  // ── Leave types ──────────────────────────────────────────────────────────────
  @Post('workforce/leave/types')
  @RequirePermissions('employee:change')
  createType(@Body() dto: CreateLeaveTypeDto) {
    return this.leave.createLeaveType(dto);
  }

  @Get('workforce/leave/types')
  @RequirePermissions('record:view')
  listTypes() {
    return this.leave.listLeaveTypes();
  }

  // ── Requests (static before /:id) ────────────────────────────────────────────
  @Post('workforce/leave/request')
  @RequirePermissions('record:view')
  createRequest(@Body() dto: CreateLeaveRequestDto) {
    return this.leave.createLeaveRequest(dto);
  }

  @Get('workforce/leave/requests')
  @RequirePermissions('record:view')
  listRequests(@Query() q: LeaveRequestQuery) {
    return this.leave.listLeaveRequests(q);
  }

  @Get('workforce/leave/requests/:id')
  @RequirePermissions('record:view')
  getRequest(@Param('id') id: string) {
    return this.leave.getLeaveRequest(id);
  }

  @Patch('workforce/leave/requests/:id/approve')
  @RequirePermissions('employee:change')
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.leave.approveLeaveRequest(id, user.userId);
  }

  @Patch('workforce/leave/requests/:id/reject')
  @RequirePermissions('employee:change')
  reject(@Param('id') id: string, @Body() dto: RejectLeaveDto, @CurrentUser() user: AuthUser) {
    return this.leave.rejectLeaveRequest(id, dto.rejectionReason, user.userId);
  }

  // ── Balances (POST initialize is admin-only; distinct verb from GET :id) ──────
  @Get('workforce/leave/balance/:employeeId')
  @RequirePermissions('record:view')
  balances(@Param('employeeId') employeeId: string) {
    return this.leave.getBalances(employeeId);
  }

  @Post('workforce/leave/balance/initialize')
  @UseGuards(WorkforceManagerGuard)
  @RequirePermissions('employee:change')
  initialize(@Body() dto: InitializeBalancesDto) {
    return this.leave.initializeBalances(dto);
  }
}
