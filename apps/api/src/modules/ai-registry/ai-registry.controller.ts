import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AiRegistryService } from './ai-registry.service';
import { CreateAiModelDto, UpdateAiModelDto, CreateAiModelVersionDto, TransitionAiModelVersionDto } from './dto/ai-registry.dto';

/**
 * Program 6 · Phase 6A — AI model registry + lifecycle governance API. Lab scope comes from the JWT principal
 * (never the body). Authorization: `aimodel:view` (read), `aimodel:manage` (create/edit descriptive metadata),
 * `aimodel:promote` (lifecycle transition, incl. → APPROVED). None of these are granted to a default role. No
 * inference/execution endpoint exists here.
 */
@ApiTags('ai-registry')
@ApiBearerAuth()
@Controller('ai/models')
export class AiRegistryController {
  constructor(private readonly svc: AiRegistryService) {}

  @Post()
  @RequirePermissions('aimodel:manage')
  createModel(@CurrentUser() user: AuthUser, @Body() dto: CreateAiModelDto) {
    return this.svc.createModel(dto, user.userId);
  }

  @Get()
  @RequirePermissions('aimodel:view')
  listModels() {
    return this.svc.listModels();
  }

  @Get(':id')
  @RequirePermissions('aimodel:view')
  getModel(@Param('id') id: string) {
    return this.svc.getModel(id);
  }

  @Patch(':id')
  @RequirePermissions('aimodel:manage')
  updateModel(@Param('id') id: string, @Body() dto: UpdateAiModelDto) {
    return this.svc.updateModel(id, dto);
  }

  @Post(':id/versions')
  @RequirePermissions('aimodel:manage')
  createVersion(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateAiModelVersionDto) {
    return this.svc.createVersion(id, dto, user.userId);
  }

  @Get('versions/:versionId')
  @RequirePermissions('aimodel:view')
  getVersion(@Param('versionId') versionId: string) {
    return this.svc.getVersion(versionId);
  }

  @Post('versions/:versionId/transition')
  @RequirePermissions('aimodel:promote')
  transition(@CurrentUser() user: AuthUser, @Param('versionId') versionId: string, @Body() dto: TransitionAiModelVersionDto) {
    return this.svc.transitionVersion(versionId, dto.toState, user.userId, dto.reason);
  }
}
