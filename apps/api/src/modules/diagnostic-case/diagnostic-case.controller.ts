import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { DiagnosticCaseService } from './diagnostic-case.service';

// Thin orchestration controller for the Diagnostic Case Workspace. One read-only endpoint. The base
// gate is `record:view` (plan §6); each band resolves its own owner permission inside the descriptive
// map. Owner endpoints remain the enforcement authority. A2: contract-only — no owner read occurs.
@ApiTags('diagnostic-case')
@ApiBearerAuth()
@Controller('diagnostic-case')
export class DiagnosticCaseController {
  constructor(private readonly service: DiagnosticCaseService) {}

  @Get(':recordId/overview')
  @RequirePermissions('record:view')
  @ApiOperation({ summary: 'Composed read-only diagnostic-case aggregate (contract-only at A2)' })
  overview(@Param('recordId') recordId: string, @CurrentUser() user: AuthUser) {
    return this.service.overview(recordId, user);
  }
}
