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

  /** D6 — Integration Health: real external-interface health (FHIR), honest states. */
  @Get('integration-health')
  @RequirePermissions('record:view')
  integrationHealth() {
    return this.operations.integrationHealth();
  }

  /** Q — Quality Alerts: recorded, open operational quality events (read-only). */
  @Get('quality-alerts')
  @RequirePermissions('record:view')
  qualityAlerts() {
    return this.operations.qualityAlerts();
  }
}
