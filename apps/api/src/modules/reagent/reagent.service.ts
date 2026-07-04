import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, ReagentStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { NotificationsHelper } from '../notifications/notifications.helper';
import { CreateReagentDto, QuarantineDto, ReagentQueryDto, UpdateReagentDto, UseReagentDto } from './dto/reagent.dto';

const DAY = 86_400_000;
const EXPIRING_WINDOW_DAYS = 30;

const lotSelect = {
  id: true, name: true, manufacturer: true, catalogNumber: true, lotNumber: true, expiryDate: true,
  receivedDate: true, openedDate: true, status: true, quantity: true, unit: true, storageTemp: true, notes: true,
  createdAt: true, createdBy: { select: { firstName: true, lastName: true } },
  _count: { select: { usages: true } },
} satisfies Prisma.ReagentLotSelect;

@Injectable()
export class ReagentService {
  private readonly log = new Logger(ReagentService.name);
  constructor(private prisma: PrismaService, private notifs: NotificationsHelper) {}

  // ── Lots ──────────────────────────────────────────────────────────────
  async list(query: ReagentQueryDto) {
    const where: Prisma.ReagentLotWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.expiringSoon && { status: 'Active', expiryDate: { gte: new Date(), lte: new Date(Date.now() + EXPIRING_WINDOW_DAYS * DAY) } }),
    };
    const rows = await this.prisma.reagentLot.findMany({ where, select: lotSelect, orderBy: [{ status: 'asc' }, { expiryDate: 'asc' }] });
    return rows.map((r) => this.toLot(r));
  }

  private toLot(r: Prisma.ReagentLotGetPayload<{ select: typeof lotSelect }>) {
    const { _count, createdBy, ...rest } = r;
    return { ...rest, usageCount: _count.usages, createdByName: createdBy ? `${createdBy.firstName} ${createdBy.lastName}`.trim() : null };
  }

  create(dto: CreateReagentDto, userId: string) {
    return this.prisma.reagentLot.create({
      data: tenantCreate<Prisma.ReagentLotUncheckedCreateInput>({
        name: dto.name.trim(), lotNumber: dto.lotNumber.trim(),
        manufacturer: dto.manufacturer ?? null, catalogNumber: dto.catalogNumber ?? null,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
        receivedDate: dto.receivedDate ? new Date(dto.receivedDate) : new Date(),
        openedDate: dto.openedDate ? new Date(dto.openedDate) : null,
        quantity: dto.quantity ?? null, unit: dto.unit ?? null, storageTemp: dto.storageTemp ?? null,
        notes: dto.notes ?? null, createdById: userId,
      }),
      select: lotSelect,
    }).then((r) => this.toLot(r));
  }

  async detail(id: string) {
    const lot = await this.prisma.reagentLot.findFirst({ where: { id }, select: lotSelect });
    if (!lot) throw new NotFoundException('Reagent lot not found');
    const usages = await this.prisma.reagentUsage.findMany({
      where: { reagentLotId: id },
      select: {
        id: true, batchId: true, quantityUsed: true, usedAt: true, notes: true,
        usedBy: { select: { firstName: true, lastName: true } },
        record: { select: { id: true, labNumber: true, identifier: true } },
      },
      orderBy: { usedAt: 'desc' },
      take: 200,
    });
    return { ...this.toLot(lot), usages };
  }

  async update(id: string, dto: UpdateReagentDto) {
    await this.getLot(id);
    return this.prisma.reagentLot.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.manufacturer !== undefined && { manufacturer: dto.manufacturer || null }),
        ...(dto.catalogNumber !== undefined && { catalogNumber: dto.catalogNumber || null }),
        ...(dto.expiryDate !== undefined && { expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null }),
        ...(dto.openedDate !== undefined && { openedDate: dto.openedDate ? new Date(dto.openedDate) : null }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.quantity !== undefined && { quantity: dto.quantity }),
        ...(dto.unit !== undefined && { unit: dto.unit || null }),
        ...(dto.storageTemp !== undefined && { storageTemp: dto.storageTemp || null }),
        ...(dto.notes !== undefined && { notes: dto.notes || null }),
      },
      select: lotSelect,
    }).then((r) => this.toLot(r));
  }

  /** Delete only when the lot has no recorded usage — usage history is an audit
   *  trail and must be preserved (no soft-delete column exists). */
  async remove(id: string) {
    const lot = await this.prisma.reagentLot.findFirst({ where: { id }, select: { id: true, _count: { select: { usages: true } } } });
    if (!lot) throw new NotFoundException('Reagent lot not found');
    if (lot._count.usages > 0) throw new BadRequestException('Cannot delete a lot with recorded usage; quarantine or deplete it instead');
    await this.prisma.reagentLot.delete({ where: { id } });
    return { ok: true };
  }

  private async getLot(id: string) {
    const lot = await this.prisma.reagentLot.findFirst({ where: { id }, select: { id: true, lotNumber: true, name: true, status: true } });
    if (!lot) throw new NotFoundException('Reagent lot not found');
    return lot;
  }

  // ── Usage ─────────────────────────────────────────────────────────────
  async use(id: string, userId: string, dto: UseReagentDto) {
    await this.getLot(id);
    await this.prisma.reagentUsage.create({
      data: tenantCreate<Prisma.ReagentUsageUncheckedCreateInput>({
        reagentLotId: id, recordId: dto.recordId || null, batchId: dto.batchId || null,
        usedById: userId, quantityUsed: dto.quantityUsed ?? null, notes: dto.notes || null,
      }),
    });
    return { ok: true };
  }

  // ── Quarantine ────────────────────────────────────────────────────────
  async quarantine(id: string, dto: QuarantineDto) {
    const lot = await this.getLot(id);
    await this.prisma.reagentLot.update({ where: { id }, data: { status: 'Quarantined', notes: dto.reason } });

    await this.notifs.notifyPermission('system:health', {
      type: NotificationType.SYSTEM_ALERT,
      title: 'Reagent lot quarantined',
      body: `Reagent lot ${lot.lotNumber} (${lot.name}) has been quarantined: ${dto.reason}`,
      link: '/reagents', entityId: id, entityType: 'reagent',
    });

    // Warn about records processed with this lot in the last 7 days.
    const recent = await this.prisma.reagentUsage.findMany({
      where: { reagentLotId: id, recordId: { not: null }, usedAt: { gte: new Date(Date.now() - 7 * DAY) } },
      select: { recordId: true },
    });
    const affected = new Set(recent.map((u) => u.recordId));
    if (affected.size > 0) {
      await this.notifs.notifyPermission('system:health', {
        type: NotificationType.SYSTEM_ALERT,
        title: 'Quarantine — affected records',
        body: `Warning: ${affected.size} record${affected.size === 1 ? '' : 's'} processed with quarantined lot ${lot.lotNumber} in the last 7 days.`,
        link: `/reagents`, entityId: id, entityType: 'reagent',
      });
    }
    return { id, status: 'Quarantined', affectedRecent: affected.size };
  }

  async affectedRecords(id: string) {
    await this.getLot(id);
    const usages = await this.prisma.reagentUsage.findMany({
      where: { reagentLotId: id, recordId: { not: null } },
      select: {
        usedAt: true, batchId: true,
        record: { select: { id: true, labNumber: true, identifier: true, status: true, patient: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { usedAt: 'desc' },
    });
    // De-dupe by record (a record may have multiple usages of the same lot).
    const seen = new Set<string>();
    const records = [];
    for (const u of usages) {
      if (!u.record || seen.has(u.record.id)) continue;
      seen.add(u.record.id);
      records.push({
        recordId: u.record.id, labNo: u.record.labNumber ?? u.record.identifier, status: u.record.status,
        patientName: u.record.patient ? `${u.record.patient.firstName} ${u.record.patient.lastName}`.trim() : '—',
        usedAt: u.usedAt.toISOString(), batchId: u.batchId,
      });
    }
    return { count: records.length, records };
  }

  /** Reagent lots used on a given record (for the record-detail sidebar card). */
  async usedOnRecord(recordId: string) {
    const usages = await this.prisma.reagentUsage.findMany({
      where: { recordId },
      select: { id: true, usedAt: true, batchId: true, reagentLot: { select: { id: true, name: true, lotNumber: true, status: true } } },
      orderBy: { usedAt: 'desc' },
    });
    return usages.map((u) => ({ usageId: u.id, usedAt: u.usedAt.toISOString(), batchId: u.batchId, lot: u.reagentLot }));
  }

  // ── Reporting ─────────────────────────────────────────────────────────
  async expiring() {
    const rows = await this.prisma.reagentLot.findMany({
      where: { status: 'Active', expiryDate: { gte: new Date(), lte: new Date(Date.now() + EXPIRING_WINDOW_DAYS * DAY) } },
      select: lotSelect, orderBy: { expiryDate: 'asc' },
    });
    return rows.map((r) => this.toLot(r));
  }

  async stats() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [totalActive, expiringSoon, quarantined, usageGroups, monthUsages, recent] = await Promise.all([
      this.prisma.reagentLot.count({ where: { status: 'Active' } }),
      this.prisma.reagentLot.count({ where: { status: 'Active', expiryDate: { gte: now, lte: new Date(Date.now() + EXPIRING_WINDOW_DAYS * DAY) } } }),
      this.prisma.reagentLot.count({ where: { status: 'Quarantined' } }),
      this.prisma.reagentUsage.groupBy({ by: ['reagentLotId'], _count: { _all: true }, orderBy: { _count: { reagentLotId: 'desc' } }, take: 1 }),
      this.prisma.reagentUsage.count({ where: { usedAt: { gte: monthStart } } }),
      this.prisma.reagentUsage.findMany({
        select: { id: true, usedAt: true, reagentLot: { select: { name: true, lotNumber: true } }, usedBy: { select: { firstName: true, lastName: true } }, record: { select: { labNumber: true, identifier: true } } },
        orderBy: { usedAt: 'desc' }, take: 10,
      }),
    ]);
    let mostUsedReagent: { name: string; usageCount: number } | null = null;
    if (usageGroups.length) {
      const lot = await this.prisma.reagentLot.findFirst({ where: { id: usageGroups[0].reagentLotId }, select: { name: true } });
      mostUsedReagent = { name: lot?.name ?? 'Unknown', usageCount: usageGroups[0]._count._all };
    }
    return {
      totalActive, expiringSoon, quarantined, usagesThisMonth: monthUsages, mostUsedReagent,
      recentUsages: recent.map((u) => ({
        id: u.id, reagentName: u.reagentLot?.name ?? '—', lotNumber: u.reagentLot?.lotNumber ?? '—',
        usedBy: u.usedBy ? `${u.usedBy.firstName} ${u.usedBy.lastName}`.trim() : '—',
        recordNo: u.record ? (u.record.labNumber ?? u.record.identifier) : null, usedAt: u.usedAt.toISOString(),
      })),
    };
  }

  // ── Expiry auto-check (called per-lab by the daily scheduler) ──────────
  async checkExpiry(): Promise<{ expired: number; notified: number }> {
    const now = new Date();
    const expired = await this.prisma.reagentLot.updateMany({ where: { status: 'Active', expiryDate: { lt: now } }, data: { status: 'Expired' } });

    const soon = await this.prisma.reagentLot.findMany({
      where: { status: 'Active', expiryDate: { gte: now, lte: new Date(Date.now() + EXPIRING_WINDOW_DAYS * DAY) } },
      select: { id: true, name: true, lotNumber: true, expiryDate: true },
    });
    let notified = 0;
    for (const lot of soon) {
      // Notify once per lot (skip if a prior expiry notification exists).
      const already = await this.prisma.notification.count({ where: { entityId: lot.id, entityType: 'reagent-expiry' } });
      if (already > 0) continue;
      const days = Math.ceil((+new Date(lot.expiryDate!) - Date.now()) / DAY);
      await this.notifs.notifyPermission('system:health', {
        type: NotificationType.SYSTEM_ALERT,
        title: 'Reagent expiring soon',
        body: `Reagent lot ${lot.lotNumber} (${lot.name}) expires in ${days} day${days === 1 ? '' : 's'}.`,
        link: '/reagents', entityId: lot.id, entityType: 'reagent-expiry',
      });
      notified++;
    }
    if (expired.count || notified) this.log.log(`Reagent check: ${expired.count} expired, ${notified} expiring-soon notified`);
    return { expired: expired.count, notified };
  }
}
