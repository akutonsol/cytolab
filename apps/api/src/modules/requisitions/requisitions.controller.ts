import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CreateRequisitionDto, RequisitionQueryDto } from './dto/requisition.dto';
import { RequisitionsService } from './requisitions.service';

@ApiTags('requisitions')
@ApiBearerAuth()
@Controller()
export class RequisitionsController {
  constructor(private requisitions: RequisitionsService) {}

  @Get('requisitions')
  @RequirePermissions('requisition:view')
  findAll(@CurrentUser() user: AuthUser, @Query() query: RequisitionQueryDto) {
    return this.requisitions.findAll(user.labId, query);
  }

  // Static sub-routes before /:id
  @Get('requisitions/client/:clientId')
  @RequirePermissions('requisition:view')
  findByClient(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Query() query: RequisitionQueryDto,
  ) {
    return this.requisitions.findByClient(user.labId, clientId, query);
  }

  @Get('requisitions/:id')
  @RequirePermissions('requisition:view')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requisitions.findOne(user.labId, id);
  }

  @Post('requisition/create')
  @RequirePermissions('requisition:create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRequisitionDto) {
    return this.requisitions.create(user.labId, dto);
  }

  @Delete('requisition/delete/:id')
  @RequirePermissions('requisition:create')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requisitions.remove(user.labId, id);
  }

  @Delete('requisition/item/delete/:id')
  @RequirePermissions('requisition:create')
  removeLine(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requisitions.removeLine(user.labId, id);
  }
}
