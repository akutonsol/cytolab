import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { WorkforceService } from './workforce.service';
import {
  AssignShiftDto, AttendanceSummaryQuery, BulkAssignDto, ClockDto, ClockHistoryQuery, CorrectClockDto,
  CreateShiftDto, GenerateTimesheetDto, RejectDto, ScheduleQuery, TimesheetQuery, UpdateShiftDto,
} from './dto/workforce.dto';

@ApiTags('workforce')
@ApiBearerAuth()
@Controller()
export class WorkforceController {
  constructor(private workforce: WorkforceService) {}

  // ── Clock ─────────────────────────────────────────────────────────────────────
  @Post('workforce/clock')
  @RequirePermissions('record:view')
  clock(@Body() dto: ClockDto) {
    return this.workforce.clock(dto);
  }

  @Get('workforce/clock/status/:employeeId')
  @RequirePermissions('record:view')
  clockStatus(@Param('employeeId') employeeId: string) {
    return this.workforce.clockStatus(employeeId);
  }

  @Get('workforce/clock/history/:employeeId')
  @RequirePermissions('record:view')
  clockHistory(@Param('employeeId') employeeId: string, @Query() q: ClockHistoryQuery) {
    return this.workforce.clockHistory(employeeId, q);
  }

  @Patch('workforce/clock/:eventId/correct')
  @RequirePermissions('employee:change')
  correctClock(@Param('eventId') eventId: string, @Body() dto: CorrectClockDto, @CurrentUser() user: AuthUser) {
    return this.workforce.correctClock(eventId, dto, user.userId);
  }

  // ── Timesheets (static routes before /:id) ────────────────────────────────────
  @Get('workforce/timesheets')
  @RequirePermissions('record:view')
  listTimesheets(@Query() q: TimesheetQuery) {
    return this.workforce.listTimesheets(q);
  }

  @Post('workforce/timesheets/generate')
  @RequirePermissions('record:view')
  generate(@Body() dto: GenerateTimesheetDto) {
    return this.workforce.generateTimesheet(dto);
  }

  @Get('workforce/timesheets/:id')
  @RequirePermissions('record:view')
  timesheet(@Param('id') id: string) {
    return this.workforce.timesheetDetail(id);
  }

  @Post('workforce/timesheets/:id/submit')
  @RequirePermissions('record:view')
  submit(@Param('id') id: string) {
    return this.workforce.submitTimesheet(id);
  }

  @Post('workforce/timesheets/:id/approve')
  @RequirePermissions('employee:change')
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.workforce.approveTimesheet(id, user.userId);
  }

  @Post('workforce/timesheets/:id/reject')
  @RequirePermissions('employee:change')
  reject(@Param('id') id: string, @Body() dto: RejectDto, @CurrentUser() user: AuthUser) {
    return this.workforce.rejectTimesheet(id, dto.reason, user.userId);
  }

  // ── Scheduling ────────────────────────────────────────────────────────────────
  @Get('workforce/schedule')
  @RequirePermissions('record:view')
  schedule(@Query() q: ScheduleQuery) {
    return this.workforce.schedule(q);
  }

  @Post('workforce/schedule/assign/bulk')
  @RequirePermissions('employee:change')
  assignBulk(@Body() dto: BulkAssignDto, @CurrentUser() user: AuthUser) {
    return this.workforce.assignBulk(dto, user.userId);
  }

  @Post('workforce/schedule/assign')
  @RequirePermissions('employee:change')
  assign(@Body() dto: AssignShiftDto, @CurrentUser() user: AuthUser) {
    return this.workforce.assignShift(dto, user.userId);
  }

  @Get('workforce/shifts')
  @RequirePermissions('record:view')
  listShifts() {
    return this.workforce.listShifts();
  }

  @Post('workforce/shifts')
  @RequirePermissions('employee:change')
  createShift(@Body() dto: CreateShiftDto) {
    return this.workforce.createShift(dto);
  }

  @Patch('workforce/shifts/:id')
  @RequirePermissions('employee:change')
  updateShift(@Param('id') id: string, @Body() dto: UpdateShiftDto) {
    return this.workforce.updateShift(id, dto);
  }

  // ── Attendance ────────────────────────────────────────────────────────────────
  @Get('workforce/attendance/today')
  @RequirePermissions('record:view')
  attendanceToday() {
    return this.workforce.attendanceToday();
  }

  @Get('workforce/attendance/roster')
  @RequirePermissions('record:view')
  attendanceRoster() {
    return this.workforce.attendanceRoster();
  }

  @Get('workforce/attendance/summary')
  @RequirePermissions('record:view')
  attendanceSummary(@Query() q: AttendanceSummaryQuery) {
    return this.workforce.attendanceSummary(q);
  }
}
