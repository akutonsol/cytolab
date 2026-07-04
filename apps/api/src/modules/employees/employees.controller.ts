import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto, EmployeeQueryDto, UpdateEmployeeDto } from './dto/employee.dto';

@ApiTags('employees')
@ApiBearerAuth()
@Controller('employees')
export class EmployeesController {
  constructor(private employees: EmployeesService) {}

  @Get()
  @RequirePermissions('employee:view')
  findAll(@Query() query: EmployeeQueryDto) {
    return this.employees.findAll(query);
  }

  // Declared before :id — two-segment literal, no conflict with :id.
  @Get('available-users')
  @RequirePermissions('employee:create')
  availableUsers() {
    return this.employees.availableUsers();
  }

  @Get(':id')
  @RequirePermissions('employee:view')
  findOne(@Param('id') id: string) {
    return this.employees.findOne(id);
  }

  @Post()
  @RequirePermissions('employee:create')
  create(@Body() dto: CreateEmployeeDto) {
    return this.employees.create(dto);
  }

  @Put('update/:id')
  @RequirePermissions('employee:change')
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employees.update(id, dto);
  }

  @Delete('delete/:id')
  @RequirePermissions('employee:delete')
  remove(@Param('id') id: string) {
    return this.employees.remove(id);
  }
}
