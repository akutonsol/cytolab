import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreatePatientDto, PatientQueryDto, UpdatePatientDto } from './dto/patient.dto';
import { PatientsService } from './patients.service';

@ApiTags('patients')
@ApiBearerAuth()
@Controller()
export class PatientsController {
  constructor(private patients: PatientsService) {}

  // Queries are lab-scoped automatically by the tenancy guard (labId from JWT).
  // Static sub-routes declared before /:id to avoid routing conflicts.
  @Get('patients/overview')
  @RequirePermissions('patient:view')
  overview(@CurrentUser() user: AuthUser) {
    return this.patients.overview(user.userId);
  }

  @Get('patients/search')
  @RequirePermissions('patient:view')
  search(@Query() query: PatientQueryDto) {
    return this.patients.search(query);
  }

  @Get('patients/client')
  @RequirePermissions('patient:view')
  findByClient(@Query('clientId') clientId: string, @Query() query: PatientQueryDto) {
    return this.patients.findByClient(clientId, query);
  }

  @Get('patients')
  @RequirePermissions('patient:view')
  findAll(@Query() query: PatientQueryDto) {
    return this.patients.findAll(query);
  }

  // Prior cytology history for a patient — used from the result-reporting
  // workflow. Gated to the clinical audience (result reporters), not front desk.
  @Get('patients/:patientId/history')
  @RequirePermissions('resultentry:view')
  history(@Param('patientId') patientId: string, @Query('excludeRecordId') excludeRecordId?: string) {
    return this.patients.getHistory(patientId, excludeRecordId || undefined);
  }

  @Get('patient/:id')
  @RequirePermissions('patient:view')
  findOne(@Param('id') id: string) {
    return this.patients.findOne(id);
  }

  @Post('patient')
  @RequirePermissions('patient:create')
  create(@Body() dto: CreatePatientDto) {
    return this.patients.create(dto);
  }

  @Put('patient/update/:id')
  @RequirePermissions('patient:change')
  update(@Param('id') id: string, @Body() dto: UpdatePatientDto) {
    return this.patients.update(id, dto);
  }

  @Delete('patient/delete/:id')
  @RequirePermissions('patient:delete')
  remove(@Param('id') id: string) {
    return this.patients.remove(id);
  }
}
