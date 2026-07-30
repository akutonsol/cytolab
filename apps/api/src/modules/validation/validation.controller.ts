import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ValidationService } from './validation.service';
import { RunValidationDto } from './dto/validation.dto';

/**
 * Program 6 · Phase 6F — validation evidence API. Lab scope comes from the JWT principal (never the body).
 * Authorization: `validation:view` (read runs/metrics), `validation:run` (create an immutable validation run — the
 * only trigger). `validation:manage` is reserved for administrative workflow only and is NOT a mutation/authority
 * route — validation evidence is immutable and 6F never promotes or changes model lifecycle. No PHI; no slide
 * diagnosis; no clinical/regulatory/accuracy claim.
 */
@ApiTags('ai-validation')
@ApiBearerAuth()
@Controller('ai/validation')
export class ValidationController {
  constructor(private readonly svc: ValidationService) {}

  @Post()
  @RequirePermissions('validation:run')
  runValidation(@CurrentUser() user: AuthUser, @Body() dto: RunValidationDto) {
    return this.svc.runValidation(dto, user.userId);
  }

  @Get()
  @RequirePermissions('validation:view')
  listRuns() {
    return this.svc.listRuns();
  }

  @Get(':id')
  @RequirePermissions('validation:view')
  getRun(@Param('id') id: string) {
    return this.svc.getRun(id);
  }
}
