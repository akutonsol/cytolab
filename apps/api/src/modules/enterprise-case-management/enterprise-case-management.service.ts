import { Injectable, NotFoundException } from '@nestjs/common';
import { RecordStatus } from '@prisma/client';
import { OrchestrationRecordFilter, RecordsService } from '../records/records.service';
import { EnterpriseQueueDetailQueryDto } from './dto/enterprise-queue.dto';
import {
  ENTERPRISE_ARCHIVED_DEFERRED_REASON,
  ENTERPRISE_DEFAULT_PAGE_SIZE,
  ENTERPRISE_DEFERRED_REASON,
  ENTERPRISE_QUEUE_DEFINITIONS,
  EnterpriseCountState,
  EnterpriseQueueCatalogResponse,
  EnterpriseQueueDetailResponse,
  EnterpriseRecordProjectionRow,
  EnterpriseSummaryResponse,
  EnterpriseUnavailableSource,
  QueueKey,
  isQueueKey,
} from './enterprise-case-management.types';

/** Exact row shape returned by the owner orchestration read (derived, not re-declared). */
type OrchestrationRow = Awaited<ReturnType<RecordsService['listForOrchestration']>>['data'][number];

/**
 * Phase 5 · E2 — Enterprise Case Management aggregate.
 *
 * Read-only orchestration: every queue is a PROJECTION over owner-recorded state,
 * composed exclusively from exported owner services. No direct Prisma.
 *
 * E2B hydrates the six SUPPORTED record-projection queues from the single owner
 * seam `RecordsService.listForOrchestration`. `archived` is truthfully DEFERRED
 * (no owner-recorded archived state). All cross-owner queues and the overdue
 * overlay remain DEFERRED for later checkpoints.
 */
@Injectable()
export class EnterpriseCaseManagementService {
  constructor(private readonly records: RecordsService) {}

  // ── Queue predicates (owner-recorded fields only) ─────────────────────────
  // my-work         assignedToId = caller ∧ status ∈ OPEN_ASSIGNABLE (owner's own open set)
  // unassigned      assignedToId = null   ∧ status ∈ OPEN_ASSIGNABLE
  // pending-review  status = Completed  (results complete, pre-authorization)
  // awaiting-sign-out status = Resulted (result sheet exists, not yet authorized — enum-documented)
  // signed-out      status = Approved   (authorized; NOT a "Released" claim)
  // on-hold         status = OnHold
  // archived / cross-owner / overdue → deferred (no owner-recorded fact yet, or later checkpoint)
  private baseFilter(queue: QueueKey, callerId: string): OrchestrationRecordFilter | null {
    switch (queue) {
      case 'my-work':
        return { assignedToId: callerId, statuses: RecordsService.OPEN_ASSIGNABLE };
      case 'unassigned':
        return { unassigned: true, statuses: RecordsService.OPEN_ASSIGNABLE };
      case 'pending-review':
        return { statuses: [RecordStatus.Completed] };
      case 'awaiting-sign-out':
        return { statuses: [RecordStatus.Resulted] };
      case 'signed-out':
        return { statuses: [RecordStatus.Approved] };
      case 'on-hold':
        return { statuses: [RecordStatus.OnHold] };
      default:
        return null; // archived + cross-owner + overlay → deferred in E2B
    }
  }

  private deferredReason(queue: QueueKey): string {
    return queue === 'archived' ? ENTERPRISE_ARCHIVED_DEFERRED_REASON : ENTERPRISE_DEFERRED_REASON;
  }

  /** Count for one queue via the owner total (pageSize:1 → count-only read). Failure-isolated. */
  private async loadCount(queue: QueueKey, callerId: string): Promise<EnterpriseCountState> {
    const base = this.baseFilter(queue, callerId);
    if (!base) return { value: null, status: 'deferred', reason: this.deferredReason(queue) };
    try {
      const res = await this.records.listForOrchestration({ ...base, page: 1, pageSize: 1 });
      return res.total > 0 ? { value: res.total, status: 'ready' } : { value: 0, status: 'empty' };
    } catch {
      return { value: null, status: 'error', reason: 'Owner read failed' };
    }
  }

  private toRow(r: OrchestrationRow): EnterpriseRecordProjectionRow {
    return {
      id: r.id,
      identifier: r.identifier ?? null,
      labNumber: r.labNumber ?? null,
      formType: r.formType ?? null,
      status: r.status,
      urgent: r.urgent,
      specimenDate: r.specimenDate ?? null,
      createdAt: r.createdAt,
      statusChangedAt: r.statusChangedAt ?? null,
      assignedToId: r.assignedToId ?? null,
      assignedToName: r.assignedTo ?? null,
      patientDisplayName: r.patient?.name ?? null,
      ownerPath: `/records/${r.id}`,
    };
  }

  /** Sources that failed/were forbidden — surfaced so the client never reads them as empty. */
  private unavailableFrom(
    counts: { key: QueueKey; count: EnterpriseCountState }[],
  ): EnterpriseUnavailableSource[] {
    return counts
      .filter((c) => c.count.status === 'error' || c.count.status === 'forbidden')
      .map((c) => ({ key: c.key, status: c.count.status, reason: c.count.reason ?? 'unavailable' }));
  }

  // ── GET /enterprise/summary ───────────────────────────────────────────────
  async getSummary(callerId: string): Promise<EnterpriseSummaryResponse> {
    const counts = await Promise.all(
      ENTERPRISE_QUEUE_DEFINITIONS.map(async (q) => ({ key: q.key, count: await this.loadCount(q.key, callerId) })),
    );
    return { asOf: new Date().toISOString(), counts, unavailable: this.unavailableFrom(counts) };
  }

  // ── GET /enterprise/queues ────────────────────────────────────────────────
  async getQueueCatalog(callerId: string): Promise<EnterpriseQueueCatalogResponse> {
    const counts = await Promise.all(
      ENTERPRISE_QUEUE_DEFINITIONS.map(async (q) => ({ key: q.key, count: await this.loadCount(q.key, callerId) })),
    );
    const byKey = new Map(counts.map((c) => [c.key, c.count]));
    const queues = ENTERPRISE_QUEUE_DEFINITIONS.map((q) => {
      const count = byKey.get(q.key)!;
      // ownerPath is the queue-level list surface only for supported record projections.
      const ownerPath = count.status === 'ready' || count.status === 'empty' ? '/records' : null;
      return { key: q.key, label: q.label, category: q.category, count, ownerPath };
    });
    return { asOf: new Date().toISOString(), queues, unavailable: this.unavailableFrom(counts) };
  }

  // ── GET /enterprise/queues/:queue ─────────────────────────────────────────
  async getQueueDetail(
    queue: string,
    query: EnterpriseQueueDetailQueryDto,
    callerId: string,
  ): Promise<EnterpriseQueueDetailResponse> {
    if (!isQueueKey(queue)) throw new NotFoundException(`Unknown enterprise queue: ${queue}`);
    const key: QueueKey = queue;
    const def = ENTERPRISE_QUEUE_DEFINITIONS.find((q) => q.key === key)!;

    const base = this.baseFilter(key, callerId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? ENTERPRISE_DEFAULT_PAGE_SIZE;

    // Deferred queues (archived + cross-owner + overlay): data null, never empty-looking.
    if (!base) {
      return {
        queue: key,
        category: def.category,
        section: { status: 'deferred', data: null, reason: this.deferredReason(key) },
        echo: { page, pageSize, assignedToId: null },
      };
    }

    // Effective assignedToId per queue:
    //  · my-work    → forced to the caller (any query assignedToId is ignored)
    //  · unassigned → not applicable (unassigned filter is authoritative)
    //  · status queues → optional owner-supported narrowing by query.assignedToId
    let filter: OrchestrationRecordFilter = { ...base, page, pageSize };
    let echoAssignedToId: string | null;
    if (key === 'my-work') {
      echoAssignedToId = callerId;
    } else if (key === 'unassigned') {
      echoAssignedToId = null;
    } else {
      const requested = query.assignedToId ?? null;
      if (requested) filter = { ...filter, assignedToId: requested };
      echoAssignedToId = requested;
    }

    try {
      const res = await this.records.listForOrchestration(filter);
      const items = res.data.map((r) => this.toRow(r));
      return {
        queue: key,
        category: def.category,
        section: {
          status: res.total > 0 ? 'ready' : 'empty',
          data: { items, total: res.total, page: res.page, pageSize: res.pageSize, totalPages: res.totalPages },
        },
        echo: { page, pageSize, assignedToId: echoAssignedToId },
      };
    } catch {
      return {
        queue: key,
        category: def.category,
        section: { status: 'error', data: null, reason: 'Owner read failed' },
        echo: { page, pageSize, assignedToId: echoAssignedToId },
      };
    }
  }
}
