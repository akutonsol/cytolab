import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AppointmentsService } from './appointments.service';
import {
  AppointmentQueryDto, CreateAppointmentDto, UpdateAppointmentDto, UpdateStatusDto,
} from './dto/appointments.dto';

@ApiTags('appointments')
@ApiBearerAuth()
@Controller()
export class AppointmentsController {
  constructor(private appointments: AppointmentsService) {}

  // Static sub-route before the :id route so 'overview' isn't captured as an id.
  @Get('appointments/overview')
  @RequirePermissions('appointment:view')
  overview() {
    return this.appointments.overview();
  }

  @Get('appointments')
  @RequirePermissions('appointment:view')
  findAll(@Query() query: AppointmentQueryDto) {
    return this.appointments.findAll(query);
  }

  @Get('appointments/:id')
  @RequirePermissions('appointment:view')
  findOne(@Param('id') id: string) {
    return this.appointments.findOne(id);
  }

  @Post('appointment')
  @RequirePermissions('appointment:manage')
  create(@Body() dto: CreateAppointmentDto) {
    return this.appointments.create(dto);
  }

  @Put('appointment/update/:id')
  @RequirePermissions('appointment:manage')
  update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return this.appointments.update(id, dto);
  }

  @Put('appointment/status/:id')
  @RequirePermissions('appointment:manage')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.appointments.updateStatus(id, dto.status);
  }

  @Delete('appointment/delete/:id')
  @RequirePermissions('appointment:manage')
  remove(@Param('id') id: string) {
    return this.appointments.remove(id);
  }
}
