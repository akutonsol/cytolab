import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ProficiencyService } from './proficiency.service';
import {
  CreateCaseDto, CreateTestDto, RespondDto, TestQueryDto, UpdateCaseDto, UpdateTestDto,
} from './dto/proficiency.dto';

@ApiTags('proficiency')
@ApiBearerAuth()
@Controller('proficiency')
export class ProficiencyController {
  constructor(private readonly proficiency: ProficiencyService) {}

  @Get()
  @RequirePermissions('record:view')
  list(@Query() query: TestQueryDto) {
    return this.proficiency.list(query);
  }

  @Get('analytics')
  @RequirePermissions('record:view')
  analytics() {
    return this.proficiency.analytics();
  }

  @Post()
  @RequirePermissions('resultsheet:authorize')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTestDto) {
    return this.proficiency.create(dto, user.userId);
  }

  @Get(':id')
  @RequirePermissions('record:view')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.proficiency.detail(id, user);
  }

  @Patch(':id')
  @RequirePermissions('resultsheet:authorize')
  update(@Param('id') id: string, @Body() dto: UpdateTestDto) {
    return this.proficiency.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('resultsheet:authorize')
  remove(@Param('id') id: string) {
    return this.proficiency.remove(id);
  }

  // ── Cases ──
  @Post(':id/cases')
  @RequirePermissions('resultsheet:authorize')
  addCase(@Param('id') id: string, @Body() dto: CreateCaseDto) {
    return this.proficiency.addCase(id, dto);
  }

  @Patch(':id/cases/:caseId')
  @RequirePermissions('resultsheet:authorize')
  updateCase(@Param('caseId') caseId: string, @Body() dto: UpdateCaseDto) {
    return this.proficiency.updateCase(caseId, dto);
  }

  @Delete(':id/cases/:caseId')
  @RequirePermissions('resultsheet:authorize')
  removeCase(@Param('caseId') caseId: string) {
    return this.proficiency.removeCase(caseId);
  }

  // ── Lifecycle ──
  @Post(':id/activate')
  @RequirePermissions('resultsheet:authorize')
  activate(@Param('id') id: string) {
    return this.proficiency.activate(id);
  }

  @Post(':id/close')
  @RequirePermissions('resultsheet:authorize')
  close(@Param('id') id: string) {
    return this.proficiency.close(id);
  }

  @Post(':id/grade')
  @RequirePermissions('resultsheet:authorize')
  grade(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.proficiency.grade(id, user.userId);
  }

  // ── Pathologist response ──
  @Get(':id/my-response')
  @RequirePermissions('record:view')
  myResponse(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.proficiency.myResponse(id, user.userId);
  }

  @Post(':id/respond')
  @RequirePermissions('resultsheet:authorize')
  respond(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RespondDto) {
    return this.proficiency.respond(id, user.userId, dto);
  }

  @Get(':id/results')
  @RequirePermissions('record:view')
  results(@Param('id') id: string) {
    return this.proficiency.results(id);
  }
}
