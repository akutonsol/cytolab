import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppointmentsService } from './appointments.service';
import {
  AppointmentQueryDto, CalendarQueryDto, CancelAppointmentDto, CompleteAppointmentDto,
  CreateAppointmentDto, RescheduleAppointmentDto, UpdateAppointmentDto,
} from './dto/appointments.dto';

@ApiTags('appointments')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appts: AppointmentsService) {}

  @Get()
  @RequirePermissions('appointment:view')
  list(@Query() q: AppointmentQueryDto) { return this.appts.list(q); }

  // Static routes before /:id.
  @Get('calendar')
  @RequirePermissions('appointment:view')
  calendar(@Query() q: CalendarQueryDto) { return this.appts.calendar(q); }

  @Get('today')
  @RequirePermissions('appointment:view')
  today() { return this.appts.today(); }

  @Get('upcoming')
  @RequirePermissions('appointment:view')
  upcoming() { return this.appts.upcoming(); }

  @Get('stats')
  @RequirePermissions('appointment:view')
  stats() { return this.appts.stats(); }

  @Post()
  @RequirePermissions('appointment:manage')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAppointmentDto) { return this.appts.create(dto, user.userId); }

  @Get(':id')
  @RequirePermissions('appointment:view')
  findOne(@Param('id') id: string) { return this.appts.findOne(id); }

  @Patch(':id')
  @RequirePermissions('appointment:manage')
  update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto) { return this.appts.update(id, dto); }

  @Delete(':id')
  @RequirePermissions('appointment:manage')
  cancel(@Param('id') id: string, @Body() dto: CancelAppointmentDto) { return this.appts.cancel(id, dto); }

  @Post(':id/confirm')
  @RequirePermissions('appointment:manage')
  confirm(@Param('id') id: string) { return this.appts.confirm(id); }

  @Post(':id/check-in')
  @RequirePermissions('appointment:manage')
  checkIn(@Param('id') id: string) { return this.appts.checkIn(id); }

  @Post(':id/complete')
  @RequirePermissions('appointment:manage')
  complete(@Param('id') id: string, @Body() dto: CompleteAppointmentDto) { return this.appts.complete(id, dto); }

  @Post(':id/no-show')
  @RequirePermissions('appointment:manage')
  noShow(@Param('id') id: string) { return this.appts.noShow(id); }

  @Post(':id/reschedule')
  @RequirePermissions('appointment:manage')
  reschedule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RescheduleAppointmentDto) { return this.appts.reschedule(id, dto, user.userId); }

  @Post(':id/send-reminder')
  @RequirePermissions('appointment:manage')
  sendReminder(@Param('id') id: string) { return this.appts.sendReminder(id); }
}
