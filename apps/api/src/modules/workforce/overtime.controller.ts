import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { OvertimeService } from './overtime.service';
import { CalculateOvertimeDto, CreateOvertimeRuleDto, OvertimeRecordQuery } from './dto/workforce-phase2.dto';

@ApiTags('workforce-overtime')
@ApiBearerAuth()
@Controller()
export class OvertimeController {
  constructor(private overtime: OvertimeService) {}

  // ── Rules ────────────────────────────────────────────────────────────────────
  @Post('workforce/overtime/rules')
  @RequirePermissions('employee:change')
  createRule(@Body() dto: CreateOvertimeRuleDto) {
    return this.overtime.createOvertimeRule(dto);
  }

  @Get('workforce/overtime/rules')
  @RequirePermissions('record:view')
  listRules() {
    return this.overtime.listOvertimeRules();
  }

  // ── Records ──────────────────────────────────────────────────────────────────
  @Get('workforce/overtime/records')
  @RequirePermissions('record:view')
  listRecords(@Query() q: OvertimeRecordQuery) {
    return this.overtime.listOvertimeRecords(q);
  }

  @Post('workforce/overtime/calculate')
  @RequirePermissions('employee:change')
  calculate(@Body() dto: CalculateOvertimeDto) {
    return this.overtime.calculate(dto);
  }

  @Patch('workforce/overtime/records/:id/approve')
  @RequirePermissions('employee:change')
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.overtime.approveOvertimeRecord(id, user.userId);
  }

  @Patch('workforce/overtime/records/:id/reject')
  @RequirePermissions('employee:change')
  reject(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.overtime.rejectOvertimeRecord(id, user.userId);
  }
}
