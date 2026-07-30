import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { InferenceEngineService } from './inference-engine.service';
import { DispatchInferenceDto } from './dto/inference-engine.dto';

/**
 * Program 6 · Phase 6C — inference execution API. Lab scope comes from the JWT principal (never the body).
 * Authorization: `inference:view` (read jobs/records/events), `inference:run` (dispatch a manual inference —
 * the only trigger; no automatic/event/scheduled execution), `inference:manage` (administrative drain/reclaim).
 * None granted to a default role. Results are digest/reference only — no PHI, no diagnostic claim.
 */
@ApiTags('ai-inference')
@ApiBearerAuth()
@Controller('ai/inference')
export class InferenceEngineController {
  constructor(private readonly svc: InferenceEngineService) {}

  @Post()
  @RequirePermissions('inference:run')
  dispatch(@CurrentUser() user: AuthUser, @Body() dto: DispatchInferenceDto) {
    return this.svc.dispatch(dto, user.userId);
  }

  @Get()
  @RequirePermissions('inference:view')
  listJobs() {
    return this.svc.listJobs();
  }

  @Get(':id')
  @RequirePermissions('inference:view')
  getJob(@Param('id') id: string) {
    return this.svc.getJob(id);
  }

  /** Manual, permissioned execution of claimable jobs (no background scheduler required). Not automatic. */
  @Post('drain')
  @RequirePermissions('inference:manage')
  drain() {
    return this.svc.drain(`manual-${randomUUID()}`);
  }

  @Post('reclaim')
  @RequirePermissions('inference:manage')
  reclaim() {
    return this.svc.reclaimExpired().then((reclaimed) => ({ reclaimed }));
  }
}
