import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ExplainabilityService } from './explainability.service';
import { GenerateExplainabilityDto } from './dto/explainability.dto';

/**
 * Program 6 · Phase 6D — explainability API. Lab scope comes from the JWT principal (never the body).
 * Authorization: `explainability:view` (read generations/artifacts), `explainability:generate` (manual generation
 * from a completed inference — the only trigger; also enforces access to the referenced inference + lab). There is
 * NO artifact-mutation route (artifacts are immutable); `explainability:manage` governs administrative actions only.
 * Artifacts assist; they never assert correctness — no diagnostic/accuracy/confidence output.
 */
@ApiTags('ai-explainability')
@ApiBearerAuth()
@Controller('ai/explainability')
export class ExplainabilityController {
  constructor(private readonly svc: ExplainabilityService) {}

  @Post('generate')
  @RequirePermissions('explainability:generate')
  generate(@CurrentUser() user: AuthUser, @Body() dto: GenerateExplainabilityDto) {
    return this.svc.generate(dto, user.userId);
  }

  @Get()
  @RequirePermissions('explainability:view')
  listGenerations() {
    return this.svc.listGenerations();
  }

  @Get(':id')
  @RequirePermissions('explainability:view')
  getGeneration(@Param('id') id: string) {
    return this.svc.getGeneration(id);
  }
}
