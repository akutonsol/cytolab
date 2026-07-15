import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, ScreeningBatchStatus, ScreeningDisposition } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateScreeningBatchDto } from './dto/create-screening-batch.dto';
import { UpdateScreeningBatchStatusDto } from './dto/update-screening-batch-status.dto';
import { AssignScreeningBatchDto } from './dto/assign-screening-batch.dto';
import { AddScreeningBatchCaseDto } from './dto/add-screening-batch-case.dto';
import { UpdateScreeningDispositionDto } from './dto/update-screening-disposition.dto';
import { QueryScreeningBatchesDto } from './dto/query-screening-batches.dto';

type CaseCounts = { caseCount: number; pendingCount: number };

/**
 * Sole lifecycle owner for the ScreeningBatch aggregate (Phase 4.2 · C3).
 *
 * Owner-first (D-002/D-004/D-019): this service writes ONLY `screeningBatch` and
 * `screeningBatchCase`. Its only cross-owner access is a lab-scoped, read-only
 * `record` existence check to anchor a membership to an accessible case — it
 * NEVER writes Record, Record.status, Record.assignedTo* (workload), ResultSheet,
 * Sign-Out, Diagnostic Case, AIScreeningResult, QC, Specimen, DigitalSlide,
 * Patient, AncillaryOrder, or Notification. Tenancy (labId) is applied by the
 * Prisma tenancy extension from request context — never from caller input.
 *
 * Truthfulness (D-005/D-007): batch/disposition state is a screening-workflow
 * fact only. `Completed` means every membership has an owner-recorded, non-Pending
 * disposition — NOT diagnosed, QC-passed, authorized, or released. `QCSelected`
 * means selected for QC, never QC performed. Downstream owner state is never
 * inferred or mutated here.
 */
@Injectable()
export class ScreeningBatchesService {
  private readonly log = new Logger(ScreeningBatchesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Batch response allowlist — scalar metadata only. Excludes labId, assignedById, createdById. */
  private static readonly BATCH_SELECT = {
    id: true,
    batchNumber: true,
    status: true,
    assignedToId: true,
    assignedAt: true,
    createdAt: true,
    updatedAt: true,
    startedAt: true,
    completedAt: true,
    closedAt: true,
    notes: true,
  } satisfies Prisma.ScreeningBatchSelect;

  /** Membership response allowlist. Excludes labId and the screenedById actor id. */
  private static readonly CASE_SELECT = {
    id: true,
    recordId: true,
    disposition: true,
    screenedAt: true,
    addedAt: true,
    updatedAt: true,
    notes: true,
  } satisfies Prisma.ScreeningBatchCaseSelect;

  /**
   * Non-terminal statuses — the "one active batch per record" rule and the queue's
   * definition of "open" both key off this exact set. Closed/Cancelled are terminal.
   */
  private static readonly NON_TERMINAL: ScreeningBatchStatus[] = [
    'Draft',
    'Ready',
    'Assigned',
    'InScreening',
    'Completed',
  ];

  /** Canonical lifecycle order for a deterministic byStatus roll-up (C6-STATS). */
  private static readonly STATUS_ORDER: ScreeningBatchStatus[] = [
    'Draft',
    'Ready',
    'Assigned',
    'InScreening',
    'Completed',
    'Closed',
    'Cancelled',
  ];

  /** Statuses in which a screener may be recorded/reassigned (never once screening started). */
  private static readonly ASSIGNABLE: ScreeningBatchStatus[] = ['Draft', 'Ready', 'Assigned'];

  /** Defensive cap on list/queue reads (deterministic; true total reported separately). */
  private static readonly CAP = 50;

  /**
   * Explicit, reviewable transition legality — NOT inferred from enum order.
   * Mirrors the approved plan lifecycle. Closed/Cancelled are terminal (empty).
   */
  private static readonly TRANSITIONS: Record<ScreeningBatchStatus, ScreeningBatchStatus[]> = {
    Draft: ['Ready', 'Cancelled'],
    Ready: ['Assigned', 'Cancelled'],
    Assigned: ['InScreening', 'Cancelled'],
    InScreening: ['Completed', 'Cancelled'],
    Completed: ['Closed'],
    Closed: [],
    Cancelled: [],
  };

  // ── Create ────────────────────────────────────────────────────────────────
  async create(labId: string, userId: string, dto: CreateScreeningBatchDto) {
    // Owner-generated batch number, unique per lab. Retry on a rare unique-race
    // (P2002) with an incremented sequence; never accept a client-supplied number.
    for (let attempt = 0; attempt < 4; attempt++) {
      const batchNumber = await this.nextBatchNumber(attempt);
      try {
        const batch = await this.prisma.screeningBatch.create({
          // tenantCreate omits labId; the extension stamps it from context.
          data: tenantCreate<Prisma.ScreeningBatchUncheckedCreateInput>({
            batchNumber,
            // status omitted → schema default `Draft`.
            createdById: userId, // provenance from the authenticated principal only
            notes: dto.notes?.trim() || null,
          }),
          select: ScreeningBatchesService.BATCH_SELECT,
        });
        this.emitBatch(labId, 'screening-batch:new', batch);
        return this.mapBatch(batch, { caseCount: 0, pendingCount: 0 });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002' &&
          attempt < 3
        ) {
          continue;
        }
        throw e;
      }
    }
    // Unreachable in practice (loop returns or throws); satisfies the type checker.
    throw new ConflictException('Could not allocate a unique batch number');
  }

  /** `SCR-<year>-<sequence>`, sequence = per-lab count of that year + 1 (+offset for retry). */
  private async nextBatchNumber(offset: number): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `SCR-${year}-`;
    const existing = await this.prisma.screeningBatch.count({
      where: { batchNumber: { startsWith: prefix } },
    });
    return `${prefix}${String(existing + 1 + offset).padStart(4, '0')}`;
  }

  // ── Membership ──────────────────────────────────────────────────────────────
  async addCase(labId: string, batchId: string, dto: AddScreeningBatchCaseDto) {
    const batch = await this.prisma.screeningBatch.findFirst({
      where: { id: batchId },
      select: { id: true, status: true },
    });
    if (!batch) throw new NotFoundException('Screening batch not found');
    if (batch.status !== 'Draft') {
      throw new ConflictException('Cases can only be added while the batch is Draft');
    }

    // Anchor to an accessible case. Lab-scoped read → a cross-lab recordId resolves
    // to null → NotFound (nothing created, nothing revealed). Membership.labId is
    // then stamped from the SAME context, so labId is equal across context/batch/record
    // by construction.
    const record = await this.prisma.record.findFirst({
      where: { id: dto.recordId },
      select: { id: true },
    });
    if (!record) throw new NotFoundException('Record not found');

    // Duplicate within this batch (defence-in-depth beyond the @@unique).
    const dup = await this.prisma.screeningBatchCase.findFirst({
      where: { batchId, recordId: record.id },
      select: { id: true },
    });
    if (dup) throw new ConflictException('Record is already a member of this batch');

    // One active batch per record — the schema cannot express this (partial
    // uniqueness over non-terminal parent status), so the owner enforces it.
    const clash = await this.prisma.screeningBatchCase.findFirst({
      where: { recordId: record.id, batch: { status: { in: ScreeningBatchesService.NON_TERMINAL } } },
      select: { id: true },
    });
    if (clash) throw new ConflictException('Record already belongs to an active screening batch');

    const created = await this.prisma.screeningBatchCase.create({
      data: tenantCreate<Prisma.ScreeningBatchCaseUncheckedCreateInput>({
        batchId,
        recordId: record.id,
        // disposition omitted → schema default `Pending`.
      }),
      select: ScreeningBatchesService.CASE_SELECT,
    });

    this.emitCase(labId, 'screening-batch:case-added', batchId, created);
    return this.mapCase(created);
  }

  /** Remove a membership — plan-approved (add/remove case), Draft-only (membership not yet frozen). */
  async removeCase(labId: string, batchId: string, caseId: string) {
    const batch = await this.prisma.screeningBatch.findFirst({
      where: { id: batchId },
      select: { id: true, status: true },
    });
    if (!batch) throw new NotFoundException('Screening batch not found');
    if (batch.status !== 'Draft') {
      throw new ConflictException('Cases can only be removed while the batch is Draft');
    }
    const membership = await this.prisma.screeningBatchCase.findFirst({
      where: { id: caseId, batchId },
      select: { id: true },
    });
    if (!membership) throw new NotFoundException('Batch membership not found');

    await this.prisma.screeningBatchCase.delete({ where: { id: caseId } });
    this.emitBatchId(labId, 'screening-batch:updated', batchId);
    return { id: caseId, removed: true };
  }

  async updateDisposition(
    labId: string,
    batchId: string,
    caseId: string,
    userId: string,
    dto: UpdateScreeningDispositionDto,
  ) {
    const batch = await this.prisma.screeningBatch.findFirst({
      where: { id: batchId },
      select: { id: true, status: true },
    });
    if (!batch) throw new NotFoundException('Screening batch not found');
    if (batch.status !== 'InScreening') {
      throw new ConflictException('Dispositions can only be recorded while the batch is In Screening');
    }
    const membership = await this.prisma.screeningBatchCase.findFirst({
      where: { id: caseId, batchId },
      select: { id: true },
    });
    if (!membership) throw new NotFoundException('Batch membership not found');

    const updated = await this.prisma.screeningBatchCase.update({
      where: { id: caseId },
      data: {
        disposition: dto.disposition as ScreeningDisposition,
        screenedById: userId, // server-owned provenance
        screenedAt: new Date(), // truthful timestamp at mutation time
        ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
      },
      select: ScreeningBatchesService.CASE_SELECT,
    });

    this.emitCase(labId, 'screening-batch:case-updated', batchId, updated);
    return this.mapCase(updated);
  }

  // ── Assignment (screening-batch ownership only) ─────────────────────────────
  async assign(labId: string, id: string, userId: string, dto: AssignScreeningBatchDto) {
    const existing = await this.prisma.screeningBatch.findFirst({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Screening batch not found');
    if (!ScreeningBatchesService.ASSIGNABLE.includes(existing.status)) {
      throw new ConflictException(
        'A screener can only be assigned before screening starts (Draft, Ready, or Assigned)',
      );
    }

    const batch = await this.prisma.screeningBatch.update({
      where: { id },
      data: {
        assignedToId: dto.assignedToId, // recorded scalar id; NOT a workload/Record assignment
        assignedById: userId, // acting manager, from the authenticated principal
        assignedAt: new Date(),
      },
      select: ScreeningBatchesService.BATCH_SELECT,
    });

    this.emitBatch(labId, 'screening-batch:updated', batch);
    return this.mapBatch(batch, await this.dispositionCounts(id));
  }

  // ── Lifecycle transition (owner-controlled) ─────────────────────────────────
  async updateStatus(labId: string, id: string, dto: UpdateScreeningBatchStatusDto) {
    const existing = await this.prisma.screeningBatch.findFirst({
      where: { id },
      select: { id: true, status: true, assignedToId: true, assignedAt: true },
    });
    if (!existing) throw new NotFoundException('Screening batch not found');

    const legal = ScreeningBatchesService.TRANSITIONS[existing.status];
    if (!legal.includes(dto.status)) {
      // Rejects illegal edges, same-state, and any transition out of a terminal state.
      throw new ConflictException(
        `Illegal screening-batch transition: ${existing.status} → ${dto.status}`,
      );
    }

    // Entering Assigned requires a recorded screener (Ready → Assigned is meaningful
    // only once someone is assigned). Assignment itself is recorded via assign().
    if (dto.status === 'Assigned' && !existing.assignedToId) {
      throw new ConflictException('Assign a screener before marking the batch Assigned');
    }

    // Completion eligibility: every membership must carry a non-Pending disposition,
    // and the batch must have at least one case. No downstream owner is read or mutated.
    if (dto.status === 'Completed') {
      const { caseCount, pendingCount } = await this.dispositionCounts(id);
      if (caseCount === 0) {
        throw new ConflictException('Cannot complete a batch with no cases');
      }
      if (pendingCount > 0) {
        throw new ConflictException(
          `Cannot complete: ${pendingCount} case(s) still Pending disposition`,
        );
      }
    }

    const now = new Date();
    const data: Prisma.ScreeningBatchUpdateInput = {
      status: dto.status,
      // Truthful entry-state timestamps only; never fabricated on non-target transitions,
      // never cleared. assignedAt is set on entering Assigned only if not already recorded.
      ...(dto.status === 'Assigned' && !existing.assignedAt ? { assignedAt: now } : {}),
      ...(dto.status === 'InScreening' ? { startedAt: now } : {}),
      ...(dto.status === 'Completed' ? { completedAt: now } : {}),
      ...(dto.status === 'Closed' ? { closedAt: now } : {}),
    };

    const batch = await this.prisma.screeningBatch.update({
      where: { id },
      data,
      select: ScreeningBatchesService.BATCH_SELECT,
    });

    this.emitBatch(labId, 'screening-batch:updated', batch);
    return this.mapBatch(batch, await this.dispositionCounts(id));
  }

  // ── Reads ───────────────────────────────────────────────────────────────────
  /** General list — any status, newest first. Filters: status, assignedToId, batchNumber. */
  async list(query: QueryScreeningBatchesDto) {
    const where: Prisma.ScreeningBatchWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
      ...(query.batchNumber ? { batchNumber: query.batchNumber } : {}),
    };
    return this.page(where, [{ createdAt: 'desc' }, { id: 'asc' }]);
  }

  /**
   * Open queue — non-terminal batches only, oldest-waiting first. A `status` filter
   * can only narrow within the non-terminal set, never widen to Closed/Cancelled.
   */
  async queue(query: QueryScreeningBatchesDto) {
    const statusFilter =
      query.status && ScreeningBatchesService.NON_TERMINAL.includes(query.status)
        ? [query.status]
        : ScreeningBatchesService.NON_TERMINAL;

    const where: Prisma.ScreeningBatchWhereInput = {
      status: { in: statusFilter },
      ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
      ...(query.batchNumber ? { batchNumber: query.batchNumber } : {}),
    };
    return this.page(where, [{ createdAt: 'asc' }, { id: 'asc' }]);
  }

  async detail(id: string) {
    const batch = await this.prisma.screeningBatch.findFirst({
      where: { id },
      select: {
        ...ScreeningBatchesService.BATCH_SELECT,
        cases: {
          select: ScreeningBatchesService.CASE_SELECT,
          orderBy: [{ addedAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!batch) throw new NotFoundException('Screening batch not found');

    const { cases, ...scalar } = batch;
    const pendingCount = cases.filter((c) => c.disposition === 'Pending').length;
    return {
      ...this.mapBatch(scalar, { caseCount: cases.length, pendingCount }),
      cases: cases.map((c) => this.mapCase(c)),
    };
  }

  /**
   * Operational summary (Phase 4.2 · C6-STATS). A narrow, read-only, DB-computed roll-up
   * of persisted screening-batch facts only. Every count is lab-scoped by the tenancy
   * extension (groupBy/count are intercepted). No rows are pulled into memory.
   *
   * Truthful, count-only:
   *   openBatchCount   = ScreeningBatch rows whose status is non-terminal
   *   openCaseCount    = ScreeningBatchCase rows whose parent batch is non-terminal
   *   pendingCaseCount = those open memberships whose disposition is still Pending
   *   byStatus         = ScreeningBatch counts grouped by persisted status
   *
   * "Open" = non-terminal only; "Pending" = pending screening disposition only. These are
   * NOT productivity/performance/turnaround/throughput/backlog metrics — those are deferred
   * (plan STEP 7). No timestamps, ids, PHI, or elapsed-time are exposed here.
   */
  async getOperationalSummary(): Promise<{
    openBatchCount: number;
    openCaseCount: number;
    pendingCaseCount: number;
    byStatus: { status: ScreeningBatchStatus; count: number }[];
  }> {
    const open = { status: { in: ScreeningBatchesService.NON_TERMINAL } };
    const [grouped, openCaseCount, pendingCaseCount] = await Promise.all([
      // Batch counts grouped by persisted status (lab-scoped by the extension).
      this.prisma.screeningBatch.groupBy({ by: ['status'], _count: { _all: true } }),
      // Memberships whose parent batch is non-terminal.
      this.prisma.screeningBatchCase.count({ where: { batch: open } }),
      // Of those, the ones still Pending disposition.
      this.prisma.screeningBatchCase.count({ where: { disposition: 'Pending', batch: open } }),
    ]);

    // Deterministic byStatus over the full canonical status list — zero-count statuses are
    // included (documented choice) so the shape is stable regardless of which states exist.
    const counts = new Map<ScreeningBatchStatus, number>(
      grouped.map((g) => [g.status, g._count._all]),
    );
    const byStatus = ScreeningBatchesService.STATUS_ORDER.map((status) => ({
      status,
      count: counts.get(status) ?? 0,
    }));

    // openBatchCount is derived from the same grouped read (no extra query).
    const openBatchCount = ScreeningBatchesService.NON_TERMINAL.reduce(
      (sum, s) => sum + (counts.get(s) ?? 0),
      0,
    );

    return { openBatchCount, openCaseCount, pendingCaseCount, byStatus };
  }

  // ── Shared paging + counts ──────────────────────────────────────────────────
  private async page(
    where: Prisma.ScreeningBatchWhereInput,
    orderBy: Prisma.ScreeningBatchOrderByWithRelationInput[],
  ) {
    const [rows, total] = await Promise.all([
      this.prisma.screeningBatch.findMany({
        where,
        select: ScreeningBatchesService.BATCH_SELECT,
        orderBy,
        take: ScreeningBatchesService.CAP,
      }),
      this.prisma.screeningBatch.count({ where }),
    ]);

    const counts = await this.countsByBatch(rows.map((b) => b.id));
    return {
      items: rows.map((b) => this.mapBatch(b, counts[b.id] ?? { caseCount: 0, pendingCount: 0 })),
      total,
      cap: ScreeningBatchesService.CAP,
      truncated: total > ScreeningBatchesService.CAP,
    };
  }

  /** Case + pending counts for one batch (used after a mutation). */
  private async dispositionCounts(batchId: string): Promise<CaseCounts> {
    const map = await this.countsByBatch([batchId]);
    return map[batchId] ?? { caseCount: 0, pendingCount: 0 };
  }

  /**
   * Case + pending counts for a set of batches in one grouped read. The
   * `batchId ∈ ids` filter (ids drawn from already lab-scoped batches) keeps this
   * within the current lab regardless of extension coverage of groupBy.
   */
  private async countsByBatch(ids: string[]): Promise<Record<string, CaseCounts>> {
    const out: Record<string, CaseCounts> = {};
    if (ids.length === 0) return out;
    const grouped = await this.prisma.screeningBatchCase.groupBy({
      by: ['batchId', 'disposition'],
      where: { batchId: { in: ids } },
      _count: { _all: true },
    });
    for (const g of grouped) {
      const entry = (out[g.batchId] ??= { caseCount: 0, pendingCount: 0 });
      const n = g._count._all;
      entry.caseCount += n;
      if (g.disposition === 'Pending') entry.pendingCount += n;
    }
    return out;
  }

  // ── Mappers (explicit allowlist; no Prisma spread of sensitive fields) ───────
  private mapBatch(
    b: {
      id: string;
      batchNumber: string;
      status: ScreeningBatchStatus;
      assignedToId: string | null;
      assignedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      startedAt: Date | null;
      completedAt: Date | null;
      closedAt: Date | null;
      notes: string | null;
    },
    counts: CaseCounts,
  ) {
    return {
      id: b.id,
      batchNumber: b.batchNumber,
      status: b.status,
      assignedToId: b.assignedToId,
      assignedAt: b.assignedAt,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      startedAt: b.startedAt,
      completedAt: b.completedAt,
      closedAt: b.closedAt,
      notes: b.notes,
      caseCount: counts.caseCount,
      pendingCount: counts.pendingCount,
    };
  }

  private mapCase(c: {
    id: string;
    recordId: string;
    disposition: ScreeningDisposition;
    screenedAt: Date | null;
    addedAt: Date;
    updatedAt: Date;
    notes: string | null;
  }) {
    return {
      id: c.id,
      recordId: c.recordId,
      disposition: c.disposition,
      screenedAt: c.screenedAt,
      addedAt: c.addedAt,
      updatedAt: c.updatedAt,
      notes: c.notes,
    };
  }

  // ── Realtime (reuse the global gateway; lab-scoped; success only) ────────────
  private emitBatch(
    labId: string,
    event: 'screening-batch:new' | 'screening-batch:updated',
    batch: { id: string; status: ScreeningBatchStatus },
  ) {
    // Narrow, non-sensitive payload. No labId, actor ids, notes, or nested data.
    this.realtime.emitToLab(labId, event, {
      type: event,
      data: { screeningBatchId: batch.id, status: batch.status },
    });
  }

  private emitBatchId(labId: string, event: 'screening-batch:updated', batchId: string) {
    this.realtime.emitToLab(labId, event, {
      type: event,
      data: { screeningBatchId: batchId },
    });
  }

  private emitCase(
    labId: string,
    event: 'screening-batch:case-added' | 'screening-batch:case-updated',
    batchId: string,
    c: { id: string; recordId: string; disposition: ScreeningDisposition },
  ) {
    this.realtime.emitToLab(labId, event, {
      type: event,
      data: {
        screeningBatchId: batchId,
        caseId: c.id,
        recordId: c.recordId,
        disposition: c.disposition,
      },
    });
  }
}
