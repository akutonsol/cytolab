import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CreateRequisitionDto, RequisitionQueryDto, RequisitionReportDto } from './dto/requisition.dto';
import { RequisitionsService } from './requisitions.service';

@ApiTags('requisitions')
@ApiBearerAuth()
@Controller()
export class RequisitionsController {
  constructor(private requisitions: RequisitionsService) {}

  // Queries are lab-scoped automatically by the tenancy guard (labId from JWT).
  @Get('requisitions')
  @RequirePermissions('requisition:view')
  findAll(@Query() query: RequisitionQueryDto) {
    return this.requisitions.findAll(query);
  }

  // Static sub-routes before /:id
  @Get('requisitions/report')
  @RequirePermissions('requisition:view')
  report(@Query() query: RequisitionReportDto) {
    return this.requisitions.report(query);
  }

  @Get('requisitions/client/:clientId')
  @RequirePermissions('requisition:view')
  findByClient(@Param('clientId') clientId: string, @Query() query: RequisitionQueryDto) {
    return this.requisitions.findByClient(clientId, query);
  }

  @Get('requisitions/:id')
  @RequirePermissions('requisition:view')
  findOne(@Param('id') id: string) {
    return this.requisitions.findOne(id);
  }

  @Post('requisition/create')
  @RequirePermissions('requisition:create')
  create(@Body() dto: CreateRequisitionDto) {
    return this.requisitions.create(dto);
  }

  @Delete('requisition/delete/:id')
  @RequirePermissions('requisition:create')
  remove(@Param('id') id: string) {
    return this.requisitions.remove(id);
  }

  @Delete('requisition/item/delete/:id')
  @RequirePermissions('requisition:create')
  removeLine(@Param('id') id: string) {
    return this.requisitions.removeLine(id);
  }
}
