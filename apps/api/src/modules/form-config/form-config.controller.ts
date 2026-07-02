import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequisitionFormType } from '@prisma/client';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { FormConfigService } from './form-config.service';
import { AddPrintGroupDto, UpdateFieldDto } from './dto/form-config.dto';

@ApiTags('form-config')
@ApiBearerAuth()
@Controller()
export class FormConfigController {
  constructor(private svc: FormConfigService) {}

  private parse(v: string): RequisitionFormType {
    if (v === RequisitionFormType.Gynecology || v === RequisitionFormType.NonGynecology) return v;
    throw new BadRequestException(`Invalid form type: ${v}`);
  }

  // Static/specific routes before the catch-all :formType GET.
  @Get('form-config/:formType/schema')
  @RequirePermissions('formconfig:view')
  schema(@Param('formType') ft: string) {
    return this.svc.getFormSchema(this.parse(ft));
  }

  @Put('form-config/field/:id')
  @RequirePermissions('formconfig:manage')
  updateField(@Param('id') id: string, @Body() dto: UpdateFieldDto) {
    return this.svc.updateField(id, dto);
  }

  @Post('form-config/:formType/print-group')
  @RequirePermissions('formconfig:manage')
  async addGroup(@Param('formType') ft: string, @Body() dto: AddPrintGroupDto) {
    const cfg = await this.svc.getOrCreate(this.parse(ft));
    return this.svc.addPrintGroup(cfg.id, dto.name);
  }

  @Delete('form-config/print-group/:id')
  @RequirePermissions('formconfig:manage')
  deleteGroup(@Param('id') id: string) {
    return this.svc.deletePrintGroup(id);
  }

  @Get('form-config/:formType')
  @RequirePermissions('formconfig:view')
  get(@Param('formType') ft: string) {
    return this.svc.getConfig(this.parse(ft));
  }
}
