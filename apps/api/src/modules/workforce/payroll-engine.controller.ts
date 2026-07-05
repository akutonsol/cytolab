import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { WorkforceManagerGuard } from './guards/manager.guard';
import { PayrollEngineService } from './payroll-engine.service';
import { CreatePayrollPeriodDto } from './dto/workforce-phase3.dto';

@ApiTags('workforce-payroll')
@ApiBearerAuth()
@Controller()
export class PayrollEngineController {
  constructor(private payroll: PayrollEngineService) {}

  @Post('workforce/payroll/periods')
  @RequirePermissions('employee:change')
  createPeriod(@Body() dto: CreatePayrollPeriodDto) {
    return this.payroll.createPeriod(dto);
  }

  @Get('workforce/payroll/periods')
  @RequirePermissions('record:view')
  listPeriods() {
    return this.payroll.listPeriods();
  }

  @Get('workforce/payroll/periods/:id')
  @RequirePermissions('record:view')
  periodDetail(@Param('id') id: string) {
    return this.payroll.periodDetail(id);
  }

  @Post('workforce/payroll/periods/:id/process')
  @UseGuards(WorkforceManagerGuard)
  @RequirePermissions('employee:change')
  process(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.payroll.processPeriod(id, user.userId);
  }

  @Get('workforce/payroll/periods/:id/entries')
  @RequirePermissions('record:view')
  periodEntries(@Param('id') id: string) {
    return this.payroll.periodEntries(id);
  }

  @Get('workforce/payroll/employee/:employeeId')
  @RequirePermissions('record:view')
  employeeHistory(@Param('employeeId') employeeId: string) {
    return this.payroll.employeeHistory(employeeId);
  }
}
