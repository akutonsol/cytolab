import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  CreateRecordDto,
  RecordQueryDto,
  UpdateRecordDto,
  UpdateRecordStatusDto,
} from './dto/record.dto';
import { RecordsService } from './records.service';

@ApiTags('records')
@ApiBearerAuth()
@Controller()
export class RecordsController {
  constructor(private records: RecordsService) {}

  // Static sub-routes declared before /specimens/:id to avoid match conflicts

  @Get('specimens/approved')
  @RequirePermissions('record:view')
  findApproved(@CurrentUser() user: AuthUser, @Query() query: RecordQueryDto) {
    return this.records.findApproved(user.labId, query);
  }

  @Get('specimens/billable')
  @RequirePermissions('bill:view')
  findBillable(@CurrentUser() user: AuthUser, @Query() query: RecordQueryDto) {
    return this.records.findBillable(user.labId, query);
  }

  @Get('specimens/client')
  @RequirePermissions('record:view')
  findByClient(
    @CurrentUser() user: AuthUser,
    @Query('clientId') clientId: string,
    @Query() query: RecordQueryDto,
  ) {
    return this.records.findByClient(user.labId, clientId, query);
  }

  @Get('specimens/patient')
  @RequirePermissions('record:view')
  findByPatient(
    @CurrentUser() user: AuthUser,
    @Query('patientId') patientId: string,
    @Query() query: RecordQueryDto,
  ) {
    return this.records.findByPatient(user.labId, patientId, query);
  }

  @Get('specimens/recent')
  @RequirePermissions('record:view')
  findRecent(@CurrentUser() user: AuthUser, @Query() query: RecordQueryDto) {
    return this.records.findRecent(user.labId, query);
  }

  @Get('specimens/requisition')
  @RequirePermissions('record:view')
  @ApiOperation({ summary: 'Records linked to a requisition (query: requisitionId)' })
  findByRequisition(
    @CurrentUser() user: AuthUser,
    @Query('requisitionId') requisitionId: string,
    @Query() query: RecordQueryDto,
  ) {
    return this.records.findByRequisition(user.labId, requisitionId, query);
  }

  @Get('specimens')
  @RequirePermissions('record:view')
  findAll(@CurrentUser() user: AuthUser, @Query() query: RecordQueryDto) {
    return this.records.findAll(user.labId, query);
  }

  @Get('specimens/:id')
  @RequirePermissions('record:view')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.records.findOne(user.labId, id);
  }

  @Post('specimen/create')
  @RequirePermissions('record:create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRecordDto) {
    return this.records.create(user.labId, user.userId, dto);
  }

  @Put('specimen/update/:id')
  @RequirePermissions('record:change')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRecordDto,
  ) {
    return this.records.update(user.labId, id, user.userId, dto);
  }

  @Put('specimen/submit/:id')
  @RequirePermissions('record:submit')
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.records.submit(user.labId, id, user.userId);
  }

  @Patch('specimen/status/:id')
  @RequirePermissions('recordstatus:change')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRecordStatusDto,
  ) {
    return this.records.updateStatus(user.labId, id, user.userId, dto);
  }

  @Delete('specimen/delete/:id')
  @RequirePermissions('record:change')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.records.remove(user.labId, id);
  }
}
