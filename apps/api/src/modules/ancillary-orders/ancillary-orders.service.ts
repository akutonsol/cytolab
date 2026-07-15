import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AncillaryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateAncillaryOrderDto } from './dto/create-ancillary-order.dto';
import { UpdateAncillaryStatusDto } from './dto/update-ancillary-status.dto';
import { QueryAncillaryOrdersDto } from './dto/query-ancillary-orders.dto';

/**
 * Sole lifecycle owner for the AncillaryOrder aggregate (Phase 4.1A · B3).
 *
 * Owner-first: this service uses Prisma for `ancillaryOrder` only, plus one
 * lab-scoped `record` existence check to anchor an order to an accessible case.
 * It NEVER writes Record, ResultSheet, Sign-Out, Bethesda, Coding, Specimen,
 * DigitalSlide, Report, Requisition, Notification, Escalation, or any other
 * owner. Tenancy (labId) is applied automatically by the Prisma tenancy
 * extension from request context — never from caller input.
 */
@Injectable()
export class AncillaryOrdersService {
  private readonly log = new Logger(AncillaryOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Response allowlist — metadata only. Excludes labId and the orderedById actor id. */
  private static readonly SELECT = {
    id: true,
    recordId: true,
    kind: true,
    target: true,
    status: true,
    blocksSignOut: true,
    orderedAt: true,
    updatedAt: true,
    completedAt: true,
    notes: true,
  } satisfies Prisma.AncillaryOrderSelect;

  /** The queue's definition of "open". Completed/Cancelled are never open. */
  private static readonly OPEN_STATUSES: AncillaryStatus[] = ['Ordered', 'InProcess'];

  /** Defensive cap on the queue read (deterministic; true total reported separately). */
  private static readonly QUEUE_CAP = 50;

  /**
   * Explicit, reviewable transition legality — NOT inferred from enum order.
   * Ordered → InProcess | Cancelled ; InProcess → Completed | Cancelled ;
   * Completed and Cancelled are terminal (no outbound transition).
   */
  private static readonly TRANSITIONS: Record<AncillaryStatus, AncillaryStatus[]> = {
    Ordered: ['InProcess', 'Cancelled'],
    InProcess: ['Completed', 'Cancelled'],
    Completed: [],
    Cancelled: [],
  };

  // ── Create ──────────────────────────────────────────────────────────────
  async create(labId: string, userId: string, dto: CreateAncillaryOrderDto) {
    // Anchor to an accessible case. The tenancy extension scopes this read to the
    // current lab, so a cross-lab recordId resolves to null → NotFound (and no
    // order is created or revealed).
    const record = await this.prisma.record.findFirst({
      where: { id: dto.recordId },
      select: { id: true },
    });
    if (!record) throw new NotFoundException('Record not found');

    const order = await this.prisma.ancillaryOrder.create({
      // tenantCreate omits labId; the extension stamps it from context.
      data: tenantCreate<Prisma.AncillaryOrderUncheckedCreateInput>({
        recordId: record.id,
        kind: dto.kind,
        target: dto.target.trim(),
        // status is intentionally omitted → schema default `Ordered`.
        blocksSignOut: dto.blocksSignOut ?? true,
        orderedById: userId, // provenance from the authenticated principal only
        notes: dto.notes?.trim() || null,
      }),
      select: AncillaryOrdersService.SELECT,
    });

    this.emit(labId, 'ancillary:new', order);
    return order;
  }

  // ── Reads ───────────────────────────────────────────────────────────────
  /** All orders for a case (lab-scoped by the extension). Newest first, deterministic. */
  async listByRecord(recordId: string) {
    return this.prisma.ancillaryOrder.findMany({
      where: { recordId },
      select: AncillaryOrdersService.SELECT,
      orderBy: [{ orderedAt: 'desc' }, { id: 'asc' }],
    });
  }

  async detail(id: string) {
    const order = await this.prisma.ancillaryOrder.findFirst({
      where: { id },
      select: AncillaryOrdersService.SELECT,
    });
    if (!order) throw new NotFoundException('Ancillary order not found');
    return order;
  }

  /**
   * B4 sign-out signal — does this record have an OPEN order that blocks sign-out?
   * Read-only, lab-scoped (tenancy extension), record-scoped, based solely on
   * persisted facts: `blocksSignOut = true` AND `status ∈ {Ordered, InProcess}`.
   * Never inferred from completedAt/updatedAt/kind/notes/result/Record status.
   * Returns only the minimum the authorization guard needs — a boolean and a
   * truthful total; no rows, no labId/orderedById/notes are exposed.
   */
  async hasBlockingOpenOrders(recordId: string): Promise<{ blocked: boolean; total: number }> {
    const total = await this.prisma.ancillaryOrder.count({
      where: {
        recordId,
        blocksSignOut: true,
        status: { in: AncillaryOrdersService.OPEN_STATUSES },
      },
    });
    return { blocked: total > 0, total };
  }

  /**
   * Phase 5 · E1C — lab-scoped set of record ids that have at least one OPEN ancillary
   * order (status ∈ {Ordered, InProcess}). This is the minimum a future orchestrator
   * needs to build the "Awaiting Ancillary" queue by intersecting with the record
   * projection — it returns record IDs ONLY. No order id/kind/target/status/payload,
   * no `blocksSignOut` narrowing (any open order counts), no counts, no lifecycle, no
   * mutation. Distinct + deterministically sorted. Lab-scoped by the tenancy extension
   * (groupBy is intercepted); no caller labId is accepted. The orchestrator supplies
   * the queue semantics; the owner supplies only which records have recorded open work.
   */
  async recordIdsWithOpenWork(): Promise<string[]> {
    const rows = await this.prisma.ancillaryOrder.groupBy({
      by: ['recordId'],
      where: { status: { in: AncillaryOrdersService.OPEN_STATUSES } },
    });
    return rows.map((r) => r.recordId).sort();
  }

  /**
   * Lab queue of OPEN orders. Base filter is always the open statuses; a `status`
   * filter can only narrow within OPEN (never widen to Completed/Cancelled).
   * Bounded to QUEUE_CAP with a truthful total, ordered oldest-waiting first.
   */
  async queue(query: QueryAncillaryOrdersDto) {
    const statusFilter =
      query.status && AncillaryOrdersService.OPEN_STATUSES.includes(query.status)
        ? [query.status]
        : AncillaryOrdersService.OPEN_STATUSES;

    const where: Prisma.AncillaryOrderWhereInput = {
      status: { in: statusFilter },
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.recordId ? { recordId: query.recordId } : {}),
      ...(query.blocksSignOut !== undefined ? { blocksSignOut: query.blocksSignOut } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.ancillaryOrder.findMany({
        where,
        select: AncillaryOrdersService.SELECT,
        orderBy: [{ orderedAt: 'asc' }, { id: 'asc' }],
        take: AncillaryOrdersService.QUEUE_CAP,
      }),
      this.prisma.ancillaryOrder.count({ where }),
    ]);

    return {
      items,
      total,
      cap: AncillaryOrdersService.QUEUE_CAP,
      truncated: total > AncillaryOrdersService.QUEUE_CAP,
    };
  }

  // ── Status transition (owner-controlled) ─────────────────────────────────
  async updateStatus(labId: string, id: string, dto: UpdateAncillaryStatusDto) {
    // Existence + current state, lab-scoped (cross-lab id → null → NotFound).
    const existing = await this.prisma.ancillaryOrder.findFirst({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Ancillary order not found');

    const legal = AncillaryOrdersService.TRANSITIONS[existing.status];
    if (!legal.includes(dto.status)) {
      // Rejects illegal edges AND same-state (never a valid lifecycle event here).
      throw new BadRequestException(
        `Illegal ancillary-order transition: ${existing.status} → ${dto.status}`,
      );
    }

    const data: Prisma.AncillaryOrderUpdateInput = {
      status: dto.status,
      // completedAt set truthfully only on entry to Completed; never fabricated otherwise.
      ...(dto.status === 'Completed' ? { completedAt: new Date() } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
    };

    const order = await this.prisma.ancillaryOrder.update({
      where: { id },
      data,
      select: AncillaryOrdersService.SELECT,
    });

    this.emit(labId, 'ancillary:updated', order);
    return order;
  }

  // ── Realtime (reuse the global gateway; lab-scoped; success only) ─────────
  private emit(
    labId: string,
    event: 'ancillary:new' | 'ancillary:updated',
    order: { id: string; recordId: string; status: AncillaryStatus; kind: string; blocksSignOut: boolean },
  ) {
    // Narrow, non-sensitive payload. No labId, orderedById, notes, or nested data.
    this.realtime.emitToLab(labId, event, {
      type: event,
      data: {
        ancillaryOrderId: order.id,
        recordId: order.recordId,
        status: order.status,
        kind: order.kind,
        blocksSignOut: order.blocksSignOut,
      },
    });
  }
}
