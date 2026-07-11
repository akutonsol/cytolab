import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { OperationsService } from './operations.service';

@ApiTags('operations')
@ApiBearerAuth()
@Controller('operations')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  /** Live command-center overview: pipeline stages (B1) + attention rail (A1). */
  @Get('overview')
  @RequirePermissions('record:view')
  overview() {
    return this.operations.overview();
  }

  /** C2 — SLA Risk detail: ranked breached + at-risk cases with owner, blocker, action. */
  @Get('sla-risk')
  @RequirePermissions('record:view')
  slaRisk() {
    return this.operations.slaRisk();
  }
}
