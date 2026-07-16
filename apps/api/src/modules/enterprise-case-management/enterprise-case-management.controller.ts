import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { EnterpriseCaseManagementService } from './enterprise-case-management.service';
import { EnterpriseQueueDetailQueryDto } from './dto/enterprise-queue.dto';
import {
  EnterpriseQueueCatalogResponse,
  EnterpriseQueueDetailResponse,
  EnterpriseSummaryResponse,
} from './enterprise-case-management.types';

/**
 * Phase 5 · E2 — Enterprise Case Management read-only API.
 *
 * Three GET routes, all gated on the existing `record:view` permission. No
 * mutation/assignment routes live here — assignment stays with RecordsService
 * under `record:change`.
 */
@ApiTags('enterprise-case-management')
@ApiBearerAuth()
@Controller('enterprise')
export class EnterpriseCaseManagementController {
  constructor(private readonly enterprise: EnterpriseCaseManagementService) {}

  @Get('summary')
  @RequirePermissions('record:view')
  summary(): EnterpriseSummaryResponse {
    return this.enterprise.getSummary();
  }

  @Get('queues')
  @RequirePermissions('record:view')
  queues(): EnterpriseQueueCatalogResponse {
    return this.enterprise.getQueueCatalog();
  }

  @Get('queues/:queue')
  @RequirePermissions('record:view')
  queueDetail(@Param('queue') queue: string, @Query() query: EnterpriseQueueDetailQueryDto): EnterpriseQueueDetailResponse {
    return this.enterprise.getQueueDetail(queue, query);
  }
}
