import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PayrollService } from './payroll.service';
import { ApproveRunDto, PayAdviceQueryDto, PayrollQueryDto, ProcessPayrollDto, UpdatePayAdviceDto } from './dto/payroll.dto';

@ApiTags('payroll')
@ApiBearerAuth()
@Controller('payroll')
export class PayrollController {
  constructor(private payroll: PayrollService) {}

  @Get('stats')
  @RequirePermissions('payroll:view')
  getStats() {
    return this.payroll.getStats();
  }

  // ── Runs ──
  @Get('runs')
  @RequirePermissions('payroll:view')
  listRuns(@Query() query: PayrollQueryDto) {
    return this.payroll.listRuns(query);
  }

  @Post('runs/process')
  @RequirePermissions('payroll:create')
  processRun(@CurrentUser() user: AuthUser, @Body() dto: ProcessPayrollDto) {
    return this.payroll.processRun(dto, user.userId);
  }

  @Put('runs/approve/:id')
  @RequirePermissions('payroll:change')
  approveRun(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ApproveRunDto) {
    return this.payroll.approveRun(id, user.userId, dto);
  }

  @Get('runs/:id')
  @RequirePermissions('payroll:view')
  getRun(@Param('id') id: string) {
    return this.payroll.getRun(id);
  }

  @Delete('runs/delete/:id')
  @RequirePermissions('payroll:delete')
  removeRun(@Param('id') id: string) {
    return this.payroll.removeRun(id);
  }

  // ── Pay advices ──
  @Get('advices')
  @RequirePermissions('payadvice:view')
  listAdvices(@Query() query: PayAdviceQueryDto) {
    return this.payroll.listAdvices(query);
  }

  // Full payslip payload (advice + employee + run + lab). Before :id.
  @Get('advices/:id/slip')
  @RequirePermissions('payadvice:view')
  getSlip(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payroll.getSlip(id, user.labId);
  }

  @Get('advices/:id')
  @RequirePermissions('payadvice:view')
  getAdvice(@Param('id') id: string) {
    return this.payroll.getAdvice(id);
  }

  @Put('advices/update/:id')
  @RequirePermissions('payadvice:change')
  updateAdvice(@Param('id') id: string, @Body() dto: UpdatePayAdviceDto) {
    return this.payroll.updateAdvice(id, dto);
  }

  @Put('advices/pay/:id')
  @RequirePermissions('payadvice:change')
  payAdvice(@Param('id') id: string) {
    return this.payroll.payAdvice(id);
  }
}
