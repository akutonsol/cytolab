import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CreatePatientDto, PatientQueryDto, UpdatePatientDto } from './dto/patient.dto';
import { PatientsService } from './patients.service';

@ApiTags('patients')
@ApiBearerAuth()
@Controller()
export class PatientsController {
  constructor(private patients: PatientsService) {}

  // Static sub-routes declared before /:id to avoid routing conflicts
  @Get('patients/search')
  @RequirePermissions('patient:view')
  search(@CurrentUser() user: AuthUser, @Query() query: PatientQueryDto) {
    return this.patients.search(user.labId, query);
  }

  @Get('patients/client')
  @RequirePermissions('patient:view')
  findByClient(
    @CurrentUser() user: AuthUser,
    @Query('clientId') clientId: string,
    @Query() query: PatientQueryDto,
  ) {
    return this.patients.findByClient(user.labId, clientId, query);
  }

  @Get('patients')
  @RequirePermissions('patient:view')
  findAll(@CurrentUser() user: AuthUser, @Query() query: PatientQueryDto) {
    return this.patients.findAll(user.labId, query);
  }

  @Get('patient/:id')
  @RequirePermissions('patient:view')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.patients.findOne(user.labId, id);
  }

  @Post('patient')
  @RequirePermissions('patient:create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePatientDto) {
    return this.patients.create(user.labId, dto);
  }

  @Put('patient/update/:id')
  @RequirePermissions('patient:change')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patients.update(user.labId, id, dto);
  }

  @Delete('patient/delete/:id')
  @RequirePermissions('patient:delete')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.patients.remove(user.labId, id);
  }
}
