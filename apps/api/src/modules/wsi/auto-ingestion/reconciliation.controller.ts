import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ReconciliationService } from './reconciliation.service';
import { DismissDto, ReconciliationQueueQueryDto, ResolveToRecordDto } from './dto/reconciliation.dto';

/**
 * Program 5B · B4 — the exception & reconciliation surface. EVERY route requires `wsi:reconcile` (a narrow,
 * separately-granted authority — never record:change, wsi:view, wsi:review, wsi:publish, or system:ingestion).
 * Actions are enumerated (resolve / acknowledge-duplicate / retry / dismiss) — there is NO generic
 * state-transition endpoint. The authenticated actor is taken from the request context, never the body.
 * Source configuration / monitoring are NOT here (they remain B5).
 */
@ApiTags('wsi-reconciliation')
@ApiBearerAuth()
@Controller('wsi/reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  /** Tenant-scoped exception queue (UNMATCHED / AMBIGUOUS / DUPLICATE / FAILED) + backlog summary. */
  @Get()
  @RequirePermissions('wsi:reconcile')
  queue(@Query() query: ReconciliationQueueQueryDto) {
    return this.reconciliation.queue(query);
  }

  /** UNMATCHED / AMBIGUOUS → resolve to an explicit same-tenant record, then the accepted ingestion handoff. */
  @Post(':id/resolve')
  @RequirePermissions('wsi:reconcile')
  resolve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ResolveToRecordDto) {
    return this.reconciliation.resolveToRecord(id, dto.recordId, user.userId);
  }

  /** DUPLICATE → acknowledge/dismiss as duplicate (RECONCILED, no slide, provenance retained). */
  @Post(':id/acknowledge-duplicate')
  @RequirePermissions('wsi:reconcile')
  acknowledgeDuplicate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reconciliation.acknowledgeDuplicate(id, user.userId);
  }

  /** FAILED → narrow operator-triggered retry (only for retryable failures; idempotent under CAS). */
  @Post(':id/retry')
  @RequirePermissions('wsi:reconcile')
  retry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reconciliation.retry(id, user.userId);
  }

  /** Any exception → dismiss (RECONCILED, human-closed, no ingestion). */
  @Post(':id/dismiss')
  @RequirePermissions('wsi:reconcile')
  dismiss(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DismissDto) {
    return this.reconciliation.dismiss(id, user.userId, dto.reason);
  }
}
