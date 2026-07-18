import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { allocateSequence, isUniqueConflict } from '../../common/util/lab-sequence';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  CreateRequisitionDto,
  RequisitionQueryDto,
  RequisitionReportDto,
  UpdateRequisitionLineDto,
} from './dto/requisition.dto';

// Human-facing requisition number (legacy Ref#, e.g. 1460). Plain numeric, no
// prefix. Fresh lab starts at REF_BASE+1; migration seeds to max(numeric
// imported). Same atomic seeded-counter pattern as patient registrationNo.
const REF_SEQUENCE = 'requisitionRef';
const REF_BASE = 1_000n;
const MAX_REF_RETRIES = 5;

// Per-item reference number (legacy: the clickable accession on each row). A
// separate per-lab seeded counter from the requisition Ref# — 12-digit range so
// it reads like the legacy item references. One allocation per line at create.
const ITEM_REF_SEQUENCE = 'requisitionItemRef';
const ITEM_REF_BASE = 700_000_000_000n;

const requisitionSelect = {
  id: true,
  referenceNo: true,
  status: true,
  amount: true,
  clientId: true,
  client: { select: { id: true, firstName: true, lastName: true, officeName: true, accountNo: true, email: true } },
  workspaceId: true,
  dateReceived: true,
  lines: {
    select: {
      id: true,
      referenceNo: true,
      formType: true,
      isUrgent: true,
      isCompleted: true,
      notes: true,
      amount: true,
      recordId: true,
      // Linked patient form (once accessioned): lets the detail view render the
      // reference as a live link and show the case's own Lab No. + status.
      record: { select: { id: true, labNumber: true, status: true } },
    },
    // Item refs are allocated sequentially at create, so ordering by them keeps
    // the lines in the order they were added (Item 1, 2, 3 …).
    orderBy: { referenceNo: 'asc' },
  },
  // Ordered/Fulfilled counts for the list view.
  _count: { select: { lines: true } },
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class RequisitionsService {
  constructor(
    private prisma: PrismaService,
    private labContext: LabContext,
    private realtime: RealtimeGateway,
  ) {}

  // Requisition queries are lab-scoped automatically by the tenancy extension.
  async findAll(query: RequisitionQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      this.prisma.requisition.findMany({
        where,
        select: requisitionSelect,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.requisition.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findByClient(clientId: string, query: RequisitionQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: any = { clientId };
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      this.prisma.requisition.findMany({
        where,
        select: requisitionSelect,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.requisition.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findOne(id: string) {
    const req = await this.prisma.requisition.findFirst({
      where: { id },
      select: requisitionSelect,
    });
    if (!req) throw new NotFoundException('Requisition not found');
    return req;
  }

  /**
   * Completed-Requisition report: filter by period (+ optional client/status),
   * group by client / status / date, with per-group subtotals and grand totals.
   * Lab-scoped automatically by the tenancy extension.
   */
  async report(query: RequisitionReportDto) {
    const groupBy = query.groupBy ?? 'client';
    const from = query.dateFrom ? new Date(query.dateFrom) : new Date('2000-01-01');
    const to = query.dateTo ? new Date(query.dateTo) : new Date();
    to.setHours(23, 59, 59, 999); // inclusive end-of-day

    const where: any = { createdAt: { gte: from, lte: to } };
    if (query.clientId) where.clientId = query.clientId;
    if (query.status) where.status = query.status;

    const [reqs, lab] = await Promise.all([
      this.prisma.requisition.findMany({ where, select: requisitionSelect, orderBy: { createdAt: 'desc' } }),
      (async () => {
        const labId = this.labContext.getLabId();
        return labId ? this.prisma.lab.findFirst({ where: { id: labId }, select: { name: true } }) : null;
      })(),
    ]);

    const clientName = (c: any) => c ? (c.officeName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || '—') : 'Unassigned';
    const items = reqs.map((r) => {
      const orderedItems = r._count?.lines ?? r.lines.length;
      const fulfilledItems = r.lines.filter((l) => l.isCompleted).length;
      return {
        refNo: r.referenceNo ?? '—',
        clientName: clientName(r.client),
        accessionNo: r.client?.accountNo ?? null,
        orderedItems,
        fulfilledItems,
        amount: r.amount,
        status: r.status,
        receivedAt: r.dateReceived ?? r.createdAt,
        _groupKey: groupBy === 'client' ? clientName(r.client)
          : groupBy === 'status' ? r.status
            : new Date(r.dateReceived ?? r.createdAt).toISOString().slice(0, 10),
      };
    });

    const groupMap = new Map<string, typeof items>();
    for (const it of items) {
      const k = it._groupKey;
      groupMap.set(k, [...(groupMap.get(k) ?? []), it]);
    }
    const groups = Array.from(groupMap.entries())
      .sort((a, b) => (groupBy === 'date' ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])))
      .map(([label, list]) => ({
        label,
        requisitions: list.map(({ _groupKey, ...rest }) => rest),
        subtotalAmount: list.reduce((s, x) => s + x.amount, 0),
        subtotalOrdered: list.reduce((s, x) => s + x.orderedItems, 0),
        subtotalFulfilled: list.reduce((s, x) => s + x.fulfilledItems, 0),
        count: list.length,
      }));

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      groupBy,
      generatedAt: new Date().toISOString(),
      labName: lab?.name ?? 'Laboratory',
      totalRequisitions: items.length,
      totalAmount: items.reduce((s, x) => s + x.amount, 0),
      totalOrdered: items.reduce((s, x) => s + x.orderedItems, 0),
      totalFulfilled: items.reduce((s, x) => s + x.fulfilledItems, 0),
      groups,
    };
  }

  async create(dto: CreateRequisitionDto) {
    const { lines, ...rest } = dto;
    // Batch total = Σ line costs (cents).
    const amount = (lines ?? []).reduce((sum, l) => sum + (l.amount ?? 0), 0);
    // Allocate a per-item reference for every line up front (atomic seeded
    // counter). Done before the requisition-create retry loop so a Ref# collision
    // retry doesn't burn item refs; gaps in item refs are harmless. Allocated
    // SEQUENTIALLY (not Promise.all) so ref order matches the order items were
    // added — the detail view orders lines by referenceNo (Item 1, 2, 3 …).
    const itemRefs: string[] = [];
    for (const _ of lines ?? []) itemRefs.push(await this.allocateItemReferenceNo());
    const linesCreate = lines?.length
      ? {
          create: lines.map((l, i) =>
            tenantCreate<Prisma.RequisitionLineUncheckedCreateWithoutRequisitionInput>({
              referenceNo: itemRefs[i],
              formType: l.formType ?? undefined,
              isUrgent: l.isUrgent ?? false,
              notes: l.notes,
              amount: l.amount ?? 0,
            }),
          ),
        }
      : undefined;

    // Atomic seeded Ref# with the unique-constraint retry backstop.
    for (let attempt = 0; ; attempt++) {
      const referenceNo = await this.allocateReferenceNo();
      try {
        const created = await this.prisma.requisition.create({
          data: tenantCreate<Prisma.RequisitionUncheckedCreateInput>({
            referenceNo,
            amount,
            ...rest,
            lines: linesCreate,
          }),
          select: requisitionSelect,
        });
        // Auto-create the physical-form tracking record (stage Pending). This is
        // unconditional (the Requisition Tracking UI is feature-gated, not the
        // custody trail); best-effort so it never blocks requisition creation.
        await this.prisma.requisitionTracking
          .create({ data: tenantCreate<Prisma.RequisitionTrackingUncheckedCreateInput>({ requisitionId: created.id }) })
          .catch(() => undefined);
        // Realtime: a new case/specimen arrived → push to the lab so dashboards,
        // the specimen queue and KPI cards update without a refresh.
        const labId = this.labContext.getLabId();
        this.realtime.emitToLab(labId, 'specimen:new', {
          type: 'specimen:new',
          data: { id: created.id, referenceNo: created.referenceNo, status: created.status },
        });
        this.realtime.emitToLab(labId, 'dashboard:refresh', { type: 'dashboard:refresh' });
        return created;
      } catch (e) {
        if (isUniqueConflict(e, 'referenceNo') && attempt < MAX_REF_RETRIES) continue;
        if (isUniqueConflict(e, 'referenceNo')) {
          throw new ConflictException('Could not allocate a unique requisition number; please retry');
        }
        throw e;
      }
    }
  }

  /** Allocate the next requisition Ref# for the current lab (atomic, seeded). */
  private async allocateReferenceNo(): Promise<string> {
    const labId = this.labContext.getLabId();
    if (!labId) throw new Error('Cannot allocate a requisition number with no lab context');
    const value = await allocateSequence(this.prisma, labId, REF_SEQUENCE, REF_BASE);
    return value.toString();
  }

  /** Allocate the next per-item reference number for the current lab. */
  private async allocateItemReferenceNo(): Promise<string> {
    const labId = this.labContext.getLabId();
    if (!labId) throw new Error('Cannot allocate an item reference with no lab context');
    const value = await allocateSequence(this.prisma, labId, ITEM_REF_SEQUENCE, ITEM_REF_BASE);
    return value.toString();
  }

  /**
   * Edit a single requisition line (form type / urgent / notes / cost). The line
   * is lab-scoped by the tenancy guard. When the cost changes, the parent
   * requisition's amount (Σ line costs) is recomputed so the batch total and the
   * list-view Amount stay correct. `isCompleted` is intentionally NOT editable
   * here — it is derived from the linked record's status (see
   * RecordsService.syncRequisitionForRecord).
   */
  async updateLine(lineId: string, dto: UpdateRequisitionLineDto) {
    const line = await this.prisma.requisitionLine.findFirst({
      where: { id: lineId },
      select: { id: true, requisitionId: true },
    });
    if (!line) throw new NotFoundException('Requisition line not found');

    await this.prisma.requisitionLine.update({
      where: { id: lineId },
      data: {
        formType: dto.formType ?? undefined,
        isUrgent: dto.isUrgent ?? undefined,
        notes: dto.notes ?? undefined,
        amount: dto.amount ?? undefined,
      },
    });

    if (dto.amount !== undefined) await this.recomputeAmount(line.requisitionId);
    return this.findOne(line.requisitionId);
  }

  /** Recompute a requisition's amount from its current line costs (cents). */
  private async recomputeAmount(requisitionId: string) {
    const agg = await this.prisma.requisitionLine.aggregate({
      where: { requisitionId },
      _sum: { amount: true },
    });
    await this.prisma.requisition.update({
      where: { id: requisitionId },
      data: { amount: agg._sum.amount ?? 0 },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.requisition.delete({ where: { id } });
    return { deleted: true };
  }

  // RequisitionLine now carries its own labId, so the tenancy guard scopes it
  // directly — a line from another lab won't be found.
  async removeLine(lineId: string) {
    const line = await this.prisma.requisitionLine.findFirst({ where: { id: lineId } });
    if (!line) throw new NotFoundException('Requisition line not found');
    await this.prisma.requisitionLine.delete({ where: { id: lineId } });
    // Removing a line drops its cost from the batch total.
    await this.recomputeAmount(line.requisitionId);
    return { deleted: true };
  }
}
