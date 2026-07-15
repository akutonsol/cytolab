import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ScreeningBatchesService } from './screening-batches.service';
import { CreateScreeningBatchDto } from './dto/create-screening-batch.dto';
import { UpdateScreeningBatchStatusDto } from './dto/update-screening-batch-status.dto';
import { AssignScreeningBatchDto } from './dto/assign-screening-batch.dto';
import { AddScreeningBatchCaseDto } from './dto/add-screening-batch-case.dto';
import { UpdateScreeningDispositionDto } from './dto/update-screening-disposition.dto';
import { QueryScreeningBatchesDto } from './dto/query-screening-batches.dto';

/**
 * Screening Batch owner endpoints (Phase 4.2 · C3).
 *
 * Reads gate on `record:view`, mutations on `record:change` — reusing existing
 * permission codes (Option A; no `screeningbatch:*` codes, no role-name checks).
 * `labId`, the requester id, and the acting manager id are derived from the
 * authenticated principal, never from the client. Static routes (`queue`) are
 * declared before the parameterized `:id` route so they never collide.
 */
@ApiTags('screening-batches')
@ApiBearerAuth()
@Controller('screening-batches')
export class ScreeningBatchesController {
  constructor(private readonly service: ScreeningBatchesService) {}

  // ── Writes ────────────────────────────────────────────────────────────────
  @Post()
  @RequirePermissions('record:change')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateScreeningBatchDto) {
    return this.service.create(user.labId, user.userId, dto);
  }

  @Post(':id/cases')
  @RequirePermissions('record:change')
  addCase(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddScreeningBatchCaseDto,
  ) {
    return this.service.addCase(user.labId, id, dto);
  }

  @Delete(':id/cases/:caseId')
  @RequirePermissions('record:change')
  removeCase(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('caseId') caseId: string,
  ) {
    return this.service.removeCase(user.labId, id, caseId);
  }

  @Patch(':id/cases/:caseId/disposition')
  @RequirePermissions('record:change')
  updateDisposition(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('caseId') caseId: string,
    @Body() dto: UpdateScreeningDispositionDto,
  ) {
    return this.service.updateDisposition(user.labId, id, caseId, user.userId, dto);
  }

  @Patch(':id/assignment')
  @RequirePermissions('record:change')
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AssignScreeningBatchDto,
  ) {
    return this.service.assign(user.labId, id, user.userId, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('record:change')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateScreeningBatchStatusDto,
  ) {
    return this.service.updateStatus(user.labId, id, dto);
  }

  // ── Reads (static before parameterized) ─────────────────────────────────────
  @Get('queue')
  @RequirePermissions('record:view')
  queue(@Query() query: QueryScreeningBatchesDto) {
    return this.service.queue(query);
  }

  @Get()
  @RequirePermissions('record:view')
  list(@Query() query: QueryScreeningBatchesDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @RequirePermissions('record:view')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }
}
