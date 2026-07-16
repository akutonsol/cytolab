import { Injectable, NotFoundException } from '@nestjs/common';
import { EnterpriseQueueDetailQueryDto } from './dto/enterprise-queue.dto';
import {
  ENTERPRISE_DEFAULT_PAGE_SIZE,
  ENTERPRISE_DEFERRED_REASON,
  ENTERPRISE_QUEUE_DEFINITIONS,
  EnterpriseCountState,
  EnterpriseQueueCatalogResponse,
  EnterpriseQueueDetailResponse,
  EnterpriseSummaryResponse,
  QueueKey,
  isQueueKey,
} from './enterprise-case-management.types';

/**
 * Phase 5 · E2 — Enterprise Case Management aggregate.
 *
 * A read-only orchestration layer that PROJECTS owner-recorded state into named
 * queues. It owns no persistence and performs NO direct Prisma access; queue
 * membership is composed exclusively from exported owner services (added
 * checkpoint-by-checkpoint as composition lands).
 *
 * E2A is the contract/route shell ONLY: no owner services are injected, no
 * counts are computed, no items are hydrated. Every response is a TRUTHFUL
 * `deferred` placeholder — counts are `null` (never a fabricated 0) and detail
 * data is `null` (never an empty-looking `items: []`).
 */
@Injectable()
export class EnterpriseCaseManagementService {
  /** A count that has not been composed yet — value null, never 0. */
  private deferredCount(): EnterpriseCountState {
    return { value: null, status: 'deferred', reason: ENTERPRISE_DEFERRED_REASON };
  }

  /** GET /enterprise/summary — headline counts (all deferred in E2A). */
  getSummary(): EnterpriseSummaryResponse {
    return {
      asOf: new Date().toISOString(),
      counts: ENTERPRISE_QUEUE_DEFINITIONS.map((q) => ({ key: q.key, count: this.deferredCount() })),
      unavailable: [],
    };
  }

  /** GET /enterprise/queues — full queue catalog in frozen order (counts deferred). */
  getQueueCatalog(): EnterpriseQueueCatalogResponse {
    return {
      asOf: new Date().toISOString(),
      queues: ENTERPRISE_QUEUE_DEFINITIONS.map((q) => ({
        key: q.key,
        label: q.label,
        category: q.category,
        count: this.deferredCount(),
        ownerPath: q.ownerPath,
      })),
      unavailable: [],
    };
  }

  /**
   * GET /enterprise/queues/:queue — one queue's drill-down.
   * Unknown key → 404 (never an empty success). Known key → a deferred detail
   * section (`data: null`) with the validated query echoed back.
   */
  getQueueDetail(queue: string, query: EnterpriseQueueDetailQueryDto): EnterpriseQueueDetailResponse {
    if (!isQueueKey(queue)) throw new NotFoundException(`Unknown enterprise queue: ${queue}`);
    const key: QueueKey = queue;
    const def = ENTERPRISE_QUEUE_DEFINITIONS.find((q) => q.key === key)!;

    return {
      queue: key,
      category: def.category,
      section: { status: 'deferred', data: null, reason: ENTERPRISE_DEFERRED_REASON },
      echo: {
        page: query.page ?? 1,
        pageSize: query.pageSize ?? ENTERPRISE_DEFAULT_PAGE_SIZE,
        assignedToId: query.assignedToId ?? null,
      },
    };
  }
}
