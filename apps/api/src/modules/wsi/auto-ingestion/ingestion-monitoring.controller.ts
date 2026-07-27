import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { IngestionMonitoringService } from './ingestion-monitoring.service';
import type { IngestionMonitoringResponse } from './dto/ingestion-monitoring.dto';

/**
 * Program 5B · B5-a — read-only ingestion operational-monitoring surface. Tenant-scoped, gated by the same
 * `wsi:reconcile` authority as the B4 reconciliation queue (no new permission; not system:ingestion). Purely
 * a read of persisted truth — no mutation, no source configuration, no enable/disable, no rootPath. It links
 * OUT to the B4 reconciliation surface for exception resolution; it never resolves/acknowledges/retries/dismisses.
 */
@ApiTags('wsi-ingestion-monitoring')
@ApiBearerAuth()
@Controller('wsi/ingestion/monitoring')
export class IngestionMonitoringController {
  constructor(private readonly monitoring: IngestionMonitoringService) {}

  @Get()
  @RequirePermissions('wsi:reconcile')
  overview(): Promise<IngestionMonitoringResponse> {
    return this.monitoring.overview(new Date().toISOString());
  }
}
