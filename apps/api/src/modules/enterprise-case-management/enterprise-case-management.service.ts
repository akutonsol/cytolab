import { Injectable, NotFoundException } from '@nestjs/common';
import { RecordStatus } from '@prisma/client';
import { AncillaryOrdersService } from '../ancillary-orders/ancillary-orders.service';
import { CorrelationService } from '../correlation/correlation.service';
import { EscalationService } from '../escalation/escalation.service';
import { QcService } from '../qc/qc.service';
import { RecallService } from '../recall/recall.service';
import { OrchestrationRecordFilter, RecordsService } from '../records/records.service';
import { TatService } from '../tat/tat.service';
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
 * Truthful config-state reason for Overdue when TAT has no active configuration.
 * `activeConfigCount === 0` is authoritative — the lab has not configured TAT, so
 * "overdue" is neither computable nor zero; it is deferred (distinct from empty).
 */
const TAT_NOT_CONFIGURED_REASON = 'TAT not configured for this lab';

/**
 * Phase 5 · E2 — Enterprise Case Management aggregate.
 *
 * Read-only orchestration: every queue is a PROJECTION over owner-recorded state,
 * composed exclusively from exported owner services. No direct Prisma.
 *
 * E2B: six record-projection queues (RecordsService only).
 * E2C: five cross-owner queues — each composes ITS authoritative owner Record-ID
 *      signal, intersected with tenant-scoped Records via
 *      `RecordsService.listForOrchestration({ ids, ... })`. The signal defines
 *      membership; Records defines the visible metadata, true total, pagination,
 *      ordering, allowlist, and tenancy. `archived` and the `overdue` overlay
 *      remain DEFERRED.
 */
@Injectable()
export class EnterpriseCaseManagementService {
  constructor(
    private readonly records: RecordsService,
    private readonly ancillary: AncillaryOrdersService,
    private readonly correlation: CorrelationService,
    private readonly qc: QcService,
    private readonly recall: RecallService,
    private readonly escalation: EscalationService,
    private readonly tat: TatService,
  ) {}

  // ── Record-projection predicates (E2B, owner-recorded fields only) ────────
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
        return null; // cross-owner (E2C) + archived/overdue (deferred)
    }
  }

  // ── Cross-owner signals (E2C) ─────────────────────────────────────────────
  // Membership comes ONLY from the queue's authoritative owner Record-ID signal.
  // No status filter, no reinterpretation. The signal is intersected with Records
  // (never trusted as the visible set or count on its own).
  private crossOwnerSignal(queue: QueueKey): (() => Promise<string[]>) | null {
    switch (queue) {
      case 'awaiting-ancillary':
        return () => this.ancillary.recordIdsWithOpenWork();
      case 'awaiting-correlation':
        return () => this.correlation.recordIdsAwaitingCorrelation();
      case 'open-qc-failures':
        return () => this.qc.recordIdsWithOpenFailure();
      case 'open-recalls':
        return () => this.recall.recordIdsWithOpenRecall();
      case 'open-escalations':
        return () => this.escalation.recordIdsWithOpenEscalation();
      default:
        return null;
    }
  }

  private deferredReason(queue: QueueKey): string {
    return queue === 'archived' ? ENTERPRISE_ARCHIVED_DEFERRED_REASON : ENTERPRISE_DEFERRED_REASON;
  }

  /**
   * Count for one queue via the owner total (pageSize:1 → count-only read).
   * Cross-owner: signal ids → owner intersection total (EXCLUDES stale/inaccessible/
   * cross-lab ids; never `signalIds.length`). Empty signal → `{ ids: [] }` → owner
   * total 0 → empty (E1I guarantees `[]` matches nothing, never an unfiltered read).
   * No assignedToId is applied to counts (unchanged from E2B). Failure-isolated.
   */
  private async loadCount(queue: QueueKey, callerId: string): Promise<EnterpriseCountState> {
    if (queue === 'overdue') return this.loadOverdueCount();
    const base = this.baseFilter(queue, callerId);
    const signal = this.crossOwnerSignal(queue);
    if (!base && !signal) return { value: null, status: 'deferred', reason: this.deferredReason(queue) };
    try {
      const filter: OrchestrationRecordFilter = signal
        ? { ids: await signal(), page: 1, pageSize: 1 }
        : { ...base, page: 1, pageSize: 1 };
      const res = await this.records.listForOrchestration(filter);
      return res.total > 0 ? { value: res.total, status: 'ready' } : { value: 0, status: 'empty' };
    } catch {
      return { value: null, status: 'error', reason: 'Owner read failed' };
    }
  }

  /**
   * E2D — Overdue count from the TAT owner's RECORDED breach alerts
   * (`getOverdueSignal`: `TATAlert.level=Breached ∧ status=Open`), intersected with
   * Records. Config-state matrix: TAT signal throws → error (A); `activeConfigCount===0`
   * → deferred, no Records call (C); else intersect the (possibly empty) recordIds →
   * Records total (ready if >0 else empty — D/E/F); Records read throws → error (B).
   * Never `recordIds.length` as the count; never a fabricated scan time.
   */
  private async loadOverdueCount(): Promise<EnterpriseCountState> {
    let signal: { recordIds: string[]; activeConfigCount: number };
    try {
      signal = await this.tat.getOverdueSignal();
    } catch {
      return { value: null, status: 'error', reason: 'TAT overdue signal failed' }; // Case A
    }
    if (signal.activeConfigCount === 0) {
      return { value: null, status: 'deferred', reason: TAT_NOT_CONFIGURED_REASON }; // Case C — no Records call
    }
    try {
      const res = await this.records.listForOrchestration({ ids: signal.recordIds, page: 1, pageSize: 1 });
      return res.total > 0 ? { value: res.total, status: 'ready' } : { value: 0, status: 'empty' }; // D / E / F
    } catch {
      return { value: null, status: 'error', reason: 'Records intersection failed' }; // Case B
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
      // ownerPath is the queue-level list surface only for composed queues (ready/empty).
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
    const signal = this.crossOwnerSignal(key);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? ENTERPRISE_DEFAULT_PAGE_SIZE;

    // Effective assignedToId (independent of the owner read, so the error path echoes it too):
    //  · my-work    → forced to the caller (any query assignedToId ignored)
    //  · unassigned → not applicable (unassigned filter is authoritative)
    //  · status + cross-owner queues → optional owner-supported narrowing by query.assignedToId
    const echoAssignedToId: string | null =
      key === 'my-work' ? callerId : key === 'unassigned' ? null : query.assignedToId ?? null;

    // Overdue: dedicated TAT-gated overlay path (E2D).
    if (key === 'overdue') return this.overdueDetail(page, pageSize, echoAssignedToId);

    // Deferred queues (archived): data null, never empty-looking.
    if (!base && !signal) {
      return {
        queue: key,
        category: def.category,
        section: { status: 'deferred', data: null, reason: this.deferredReason(key) },
        echo: { page, pageSize, assignedToId: null },
      };
    }

    try {
      let filter: OrchestrationRecordFilter;
      if (signal) {
        // Cross-owner: signal defines membership; ids ALWAYS passed (even []).
        filter = { ids: await signal(), page, pageSize };
        if (echoAssignedToId) filter = { ...filter, assignedToId: echoAssignedToId };
      } else {
        // Record projection: my-work/unassigned already encode assignment in base;
        // status queues optionally narrow by assignedToId.
        filter = { ...base, page, pageSize };
        if (key !== 'my-work' && key !== 'unassigned' && echoAssignedToId) {
          filter = { ...filter, assignedToId: echoAssignedToId };
        }
      }
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

  /**
   * E2D — standalone Overdue detail. Same config-state matrix as loadOverdueCount:
   *  A: TAT signal throws  → error, data null (TAT source reason)
   *  C: activeConfigCount 0 → deferred, data null (no Records call), TAT-not-configured reason
   *  D/E/F: intersect recordIds (ids ALWAYS passed, even []) → owner page verbatim;
   *         ready if total>0 else empty (empty covers "no recorded breach" AND "all ids stale")
   *  B: Records read throws → error, data null (Records-intersection reason)
   * `assignedToId` AND-composes for detail only. No fabricated scan/last-evaluated time.
   */
  private async overdueDetail(
    page: number,
    pageSize: number,
    echoAssignedToId: string | null,
  ): Promise<EnterpriseQueueDetailResponse> {
    const category = 'operational-overlay' as const;
    const echo = { page, pageSize, assignedToId: echoAssignedToId };

    let signal: { recordIds: string[]; activeConfigCount: number };
    try {
      signal = await this.tat.getOverdueSignal();
    } catch {
      return { queue: 'overdue', category, section: { status: 'error', data: null, reason: 'TAT overdue signal failed' }, echo }; // A
    }
    if (signal.activeConfigCount === 0) {
      // C — configuration unavailable is authoritative; no Records read, no intersection.
      return {
        queue: 'overdue',
        category,
        section: { status: 'deferred', data: null, reason: TAT_NOT_CONFIGURED_REASON },
        echo: { page, pageSize, assignedToId: null },
      };
    }
    try {
      let filter: OrchestrationRecordFilter = { ids: signal.recordIds, page, pageSize };
      if (echoAssignedToId) filter = { ...filter, assignedToId: echoAssignedToId };
      const res = await this.records.listForOrchestration(filter);
      const items = res.data.map((r) => this.toRow(r));
      return {
        queue: 'overdue',
        category,
        section: {
          status: res.total > 0 ? 'ready' : 'empty', // D/E ready · F/empty-signal empty
          data: { items, total: res.total, page: res.page, pageSize: res.pageSize, totalPages: res.totalPages },
        },
        echo,
      };
    } catch {
      return { queue: 'overdue', category, section: { status: 'error', data: null, reason: 'Records intersection failed' }, echo }; // B
    }
  }
}
