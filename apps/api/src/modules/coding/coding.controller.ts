import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { CodingService } from './coding.service';
import { AssignCodeDto, CodeQueryDto, CreateCodeDto, ExportQueryDto, UpdateCodeDto } from './dto/coding.dto';

@ApiTags('coding')
@ApiBearerAuth()
@Controller('coding')
export class CodingController {
  constructor(private readonly coding: CodingService) {}

  // ── Dictionary ─────────────────────────────────────────────────────────────
  @Get('codes')
  @RequirePermissions('record:view')
  listCodes(@Query() query: CodeQueryDto) {
    return this.coding.listCodes(query);
  }

  @Post('codes')
  @RequirePermissions('record:change')
  createCode(@Body() dto: CreateCodeDto) {
    return this.coding.createCode(dto);
  }

  @Patch('codes/:id')
  @RequirePermissions('record:change')
  updateCode(@Param('id') id: string, @Body() dto: UpdateCodeDto) {
    return this.coding.updateCode(id, dto);
  }

  @Delete('codes/:id')
  @RequirePermissions('record:change')
  deactivateCode(@Param('id') id: string) {
    return this.coding.deactivateCode(id);
  }

  // ── Records / stats / suggest / export (static before /record/:id) ─────────
  @Get('records')
  @RequirePermissions('record:view')
  records() {
    return this.coding.records();
  }

  @Get('stats')
  @RequirePermissions('record:view')
  stats() {
    return this.coding.stats();
  }

  @Get('suggest/:recordId')
  @RequirePermissions('record:view')
  suggest(@Param('recordId') recordId: string) {
    return this.coding.suggest(recordId);
  }

  @Get('export')
  @RequirePermissions('record:view')
  async export(@Query() query: ExportQueryDto, @Res({ passthrough: true }) res: Response) {
    const data = await this.coding.exportData(query);
    if (query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="coded-records.csv"');
      return this.coding.toCsv(data);
    }
    return data;
  }

  // ── Per-record codings ─────────────────────────────────────────────────────
  @Get('record/:recordId')
  @RequirePermissions('record:view')
  getRecordCodings(@Param('recordId') recordId: string) {
    return this.coding.getRecordCodings(recordId);
  }

  @Post('record/:recordId')
  @RequirePermissions('record:change')
  assign(@CurrentUser() user: AuthUser, @Param('recordId') recordId: string, @Body() dto: AssignCodeDto) {
    return this.coding.assignCode(recordId, dto, user.userId);
  }

  @Delete('record/:recordId/code/:codeId')
  @RequirePermissions('record:change')
  remove(@Param('recordId') recordId: string, @Param('codeId') codeId: string) {
    return this.coding.removeCoding(recordId, codeId);
  }
}
