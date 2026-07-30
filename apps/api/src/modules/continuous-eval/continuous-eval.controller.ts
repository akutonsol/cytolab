import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ContinuousEvalService } from './continuous-eval.service';
import { RunEvaluationDto } from './dto/continuous-eval.dto';

/**
 * Program 6 · Phase 6G — continuous evaluation API. Lab scope comes from the JWT principal (never the body).
 * Authorization: `evaluation:view` (read windows/metrics/recommendations), `evaluation:run` (initiate a manual
 * evaluation window — the only trigger). `evaluation:manage` is reserved for administrative workflow only and is NOT a
 * mutation/lifecycle route — evidence is immutable and 6G never retires/deprecates/promotes/retrains/disables a model.
 * No PHI; no clinical claim; no automatic action.
 */
@ApiTags('ai-continuous-eval')
@ApiBearerAuth()
@Controller('ai/evaluation')
export class ContinuousEvalController {
  constructor(private readonly svc: ContinuousEvalService) {}

  @Post()
  @RequirePermissions('evaluation:run')
  runEvaluation(@CurrentUser() user: AuthUser, @Body() dto: RunEvaluationDto) {
    return this.svc.runEvaluation(dto, user.userId);
  }

  @Get()
  @RequirePermissions('evaluation:view')
  listWindows() {
    return this.svc.listWindows();
  }

  @Get(':id')
  @RequirePermissions('evaluation:view')
  getWindow(@Param('id') id: string) {
    return this.svc.getWindow(id);
  }
}
