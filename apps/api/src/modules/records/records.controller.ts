import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  CreateRecordDto,
  RecordQueryDto,
  SubmitRecordDto,
  UpdateRecordDto,
  UpdateRecordStatusDto,
} from './dto/record.dto';
import { RecordsService } from './records.service';

@ApiTags('records')
@ApiBearerAuth()
@Controller()
export class RecordsController {
  constructor(private records: RecordsService) {}

  // Reads are lab-scoped automatically by the tenancy guard; writes still take
  // userId for the status-history audit trail.
  // Static sub-routes declared before /specimens/:id to avoid match conflicts.

  @Get('specimens/approved')
  @RequirePermissions('record:view')
  findApproved(@Query() query: RecordQueryDto) {
    return this.records.findApproved(query);
  }

  @Get('specimens/billable')
  @RequirePermissions('bill:view')
  findBillable(@Query() query: RecordQueryDto) {
    return this.records.findBillable(query);
  }

  @Get('specimens/client')
  @RequirePermissions('record:view')
  findByClient(@Query('clientId') clientId: string, @Query() query: RecordQueryDto) {
    return this.records.findByClient(clientId, query);
  }

  @Get('specimens/patient')
  @RequirePermissions('record:view')
  findByPatient(@Query('patientId') patientId: string, @Query() query: RecordQueryDto) {
    return this.records.findByPatient(patientId, query);
  }

  @Get('specimens/recent')
  @RequirePermissions('record:view')
  findRecent(@Query() query: RecordQueryDto) {
    return this.records.findRecent(query);
  }

  @Get('specimens/requisition')
  @RequirePermissions('record:view')
  @ApiOperation({ summary: 'Records linked to a requisition (query: requisitionId)' })
  findByRequisition(@Query('requisitionId') requisitionId: string, @Query() query: RecordQueryDto) {
    return this.records.findByRequisition(requisitionId, query);
  }

  @Get('specimens')
  @RequirePermissions('record:view')
  findAll(@Query() query: RecordQueryDto) {
    return this.records.findAll(query);
  }

  @Get('specimens/:id')
  @RequirePermissions('record:view')
  findOne(@Param('id') id: string) {
    return this.records.findOne(id);
  }

  @Post('specimen/create')
  @RequirePermissions('record:create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRecordDto) {
    return this.records.create(user.userId, dto);
  }

  @Put('specimen/update/:id')
  @RequirePermissions('record:change')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRecordDto,
  ) {
    return this.records.update(id, user.userId, dto);
  }

  @Put('specimen/submit/:id')
  @RequirePermissions('record:submit')
  @ApiOperation({ summary: 'Submit to Cytolab (Pending → Submitted); optional express/urgent' })
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SubmitRecordDto) {
    return this.records.submit(id, user.userId, dto.urgent);
  }

  @Patch('specimen/status/:id')
  @RequirePermissions('recordstatus:change')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRecordStatusDto,
  ) {
    return this.records.updateStatus(id, user.userId, dto);
  }

  @Delete('specimen/delete/:id')
  @RequirePermissions('record:change')
  remove(@Param('id') id: string) {
    return this.records.remove(id);
  }
}
