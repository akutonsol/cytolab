import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto, DepartmentQueryDto, UpdateDepartmentDto } from './dto/department.dto';

@ApiTags('departments')
@ApiBearerAuth()
@Controller('departments')
export class DepartmentsController {
  constructor(private departments: DepartmentsService) {}

  @Get()
  @RequirePermissions('department:view')
  findAll(@Query() query: DepartmentQueryDto) {
    return this.departments.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('department:view')
  findOne(@Param('id') id: string) {
    return this.departments.findOne(id);
  }

  @Post()
  @RequirePermissions('department:create')
  create(@Body() dto: CreateDepartmentDto) {
    return this.departments.create(dto);
  }

  @Put('update/:id')
  @RequirePermissions('department:change')
  update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.departments.update(id, dto);
  }

  @Delete('delete/:id')
  @RequirePermissions('department:delete')
  remove(@Param('id') id: string) {
    return this.departments.remove(id);
  }
}
