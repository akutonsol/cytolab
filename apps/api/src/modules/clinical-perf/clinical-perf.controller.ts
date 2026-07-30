import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClinicalPerfService } from './clinical-perf.service';
import { RunClinicalPerfDto } from './dto/clinical-perf.dto';

/**
 * Program 6 · Phase 6H — clinical performance MEASUREMENT API. Lab scope comes from the JWT principal (never the body).
 * Authorization: `clinicalperf:view` (read measurement windows/metrics), `clinicalperf:run` (initiate a manual
 * measurement window — the only trigger). `clinicalperf:manage` is reserved for administrative workflow only and is NOT
 * a mutation/lifecycle/diagnostic route. NO permission grants clinical or diagnostic authority. Measurement evidence
 * only — no clinical/safety/effectiveness/regulatory/diagnostic claim; no diagnosis creation; no PHI.
 */
@ApiTags('ai-clinical-performance')
@ApiBearerAuth()
@Controller('ai/clinical-performance')
export class ClinicalPerfController {
  constructor(private readonly svc: ClinicalPerfService) {}

  @Post()
  @RequirePermissions('clinicalperf:run')
  runMeasurement(@CurrentUser() user: AuthUser, @Body() dto: RunClinicalPerfDto) {
    return this.svc.runMeasurement(dto, user.userId);
  }

  @Get()
  @RequirePermissions('clinicalperf:view')
  listWindows() {
    return this.svc.listWindows();
  }

  @Get(':id')
  @RequirePermissions('clinicalperf:view')
  getWindow(@Param('id') id: string) {
    return this.svc.getWindow(id);
  }
}
