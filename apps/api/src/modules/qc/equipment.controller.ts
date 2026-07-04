import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { EquipmentService } from './equipment.service';
import { CreateEquipmentDto, UpdateEquipmentDto } from './dto/qc.dto';

@ApiTags('equipment')
@ApiBearerAuth()
@Controller('equipment')
export class EquipmentController {
  constructor(private readonly equipment: EquipmentService) {}

  @Get()
  @RequirePermissions('record:view')
  list() {
    return this.equipment.list();
  }

  @Post()
  @RequirePermissions('record:change')
  create(@Body() dto: CreateEquipmentDto) {
    return this.equipment.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('record:change')
  update(@Param('id') id: string, @Body() dto: UpdateEquipmentDto) {
    return this.equipment.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('record:change')
  remove(@Param('id') id: string) {
    return this.equipment.remove(id);
  }
}
