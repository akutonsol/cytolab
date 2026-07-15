import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, QCCheckType, QCResult } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { NotificationsHelper } from '../notifications/notifications.helper';
import { CreateQCCheckDto, QCQueryDto, ResolveAlertDto, UpdateQCCheckDto } from './dto/qc.dto';

// Fixation/cellularity failures compromise the specimen itself → recommend
// re-collection (surfaced as a stronger note on the linked record's timeline).
const RECOLLECT_TYPES: QCCheckType[] = ['FixationAdequacy', 'CellularityCheck'];

const checkSelect = {
  id: true, checkType: true, result: true, batchId: true, notes: true, failureReason: true,
  correctiveAction: true, performedAt: true, createdAt: true, recordId: true, equipmentId: true,
  performedBy: { select: { id: true, firstName: true, lastName: true } },
  equipment: { select: { id: true, name: true, type: true } },
  record: { select: { id: true, labNumber: true, identifier: true } },
} satisfies Prisma.QCCheckSelect;

@Injectable()
export class QcService {
  private readonly log = new Logger(QcService.name);
  constructor(private prisma: PrismaService, private notifs: NotificationsHelper) {}

  // ── Log a QC check ────────────────────────────────────────────────────
  async create(dto: CreateQCCheckDto, userId: string) {
    const check = await this.prisma.qCCheck.create({
      data: tenantCreate<Prisma.QCCheckUncheckedCreateInput>({
        checkType: dto.checkType,
        result: dto.result,
        performedById: userId,
        equipmentId: dto.equipmentId || null,
        recordId: dto.recordId || null,
        batchId: dto.batchId?.trim() || null,
        notes: dto.notes?.trim() || null,
        failureReason: dto.result === 'Fail' ? dto.failureReason?.trim() || 'Not specified' : dto.failureReason?.trim() || null,
        correctiveAction: dto.correctiveAction?.trim() || null,
        performedAt: dto.performedAt ? new Date(dto.performedAt) : new Date(),
      }),
      select: checkSelect,
    });

    if (dto.result === 'Fail') {
      // Raise a failure alert (best-effort so logging never fails on side effects).
      await this.prisma.qCFailureAlert.create({
        data: tenantCreate<Prisma.QCFailureAlertUncheckedCreateInput>({ qcCheckId: check.id }),
      }).catch((e) => this.log.warn(`alert create failed: ${(e as Error).message}`));

      await this.notifs.notifyPermission('system:health', {
        type: NotificationType.SYSTEM_ALERT,
        title: 'QC failure logged',
        body: `${check.checkType} check FAILED${check.equipment ? ` on ${check.equipment.name}` : ''}${check.record ? ` (Lab# ${check.record.labNumber ?? check.record.identifier})` : ''}. Review required.`,
        link: '/qc',
        entityId: check.id,
        entityType: 'qccheck',
      });

      // Record hook: note the failure on the linked record's timeline; recommend
      // re-collection for specimen-integrity failures.
      if (check.recordId) {
        await this.noteOnRecord(check.recordId, check.checkType, check.failureReason, userId).catch((e) =>
          this.log.warn(`record note failed: ${(e as Error).message}`),
        );
      }
    }
    return check;
  }

  private async noteOnRecord(recordId: string, checkType: QCCheckType, reason: string | null, userId: string) {
    const rec = await this.prisma.record.findFirst({ where: { id: recordId }, select: { status: true } });
    if (!rec) return;
    const recollect = RECOLLECT_TYPES.includes(checkType);
    const note = `QC FAILED (${checkType})${reason ? `: ${reason}` : ''}${recollect ? ' — RE-COLLECTION RECOMMENDED' : ''}`;
    await this.prisma.recordStatusEvent.create({
      data: tenantCreate<Prisma.RecordStatusEventUncheckedCreateInput>({ recordId, status: rec.status, userId, notes: note }),
    });
  }

  // ── Queries ───────────────────────────────────────────────────────────
  async list(query: QCQueryDto) {
    const { page = 1, pageSize = 20, checkType, result, equipmentId, performedById, from, to } = query;
    const where: Prisma.QCCheckWhereInput = {
      ...(checkType && { checkType }),
      ...(result && { result }),
      ...(equipmentId && { equipmentId }),
      ...(performedById && { performedById }),
      ...((from || to) && { performedAt: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } }),
    };
    const [data, total] = await Promise.all([
      this.prisma.qCCheck.findMany({ where, select: checkSelect, orderBy: { performedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.qCCheck.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async detail(id: string) {
    const check = await this.prisma.qCCheck.findFirst({ where: { id }, select: checkSelect });
    if (!check) throw new NotFoundException('QC check not found');
    return check;
  }

  update(id: string, dto: UpdateQCCheckDto) {
    return this.prisma.qCCheck.update({
      where: { id },
      data: {
        ...(dto.notes !== undefined && { notes: dto.notes.trim() || null }),
        ...(dto.correctiveAction !== undefined && { correctiveAction: dto.correctiveAction.trim() || null }),
        ...(dto.failureReason !== undefined && { failureReason: dto.failureReason.trim() || null }),
      },
      select: checkSelect,
    });
  }

  // ── Stats ─────────────────────────────────────────────────────────────
  async stats() {
    const since = new Date(); since.setDate(since.getDate() - 30); since.setHours(0, 0, 0, 0);
    const [byResult, failsByType, failsByEquipmentRaw, failsByTechRaw, recent] = await Promise.all([
      this.prisma.qCCheck.groupBy({ by: ['result'], _count: { _all: true } }),
      this.prisma.qCCheck.groupBy({ by: ['checkType'], where: { result: 'Fail' }, _count: { _all: true } }),
      this.prisma.qCCheck.groupBy({ by: ['equipmentId'], where: { result: 'Fail', equipmentId: { not: null } }, _count: { _all: true } }),
      this.prisma.qCCheck.groupBy({ by: ['performedById'], where: { result: 'Fail' }, _count: { _all: true } }),
      this.prisma.qCCheck.findMany({ where: { performedAt: { gte: since } }, select: { performedAt: true, result: true } }),
    ]);

    const count = (r: QCResult) => byResult.find((b) => b.result === r)?._count._all ?? 0;
    const pass = count('Pass'), fail = count('Fail'), marginal = count('Marginal');
    const total = pass + fail + marginal;
    const rate = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);

    // Resolve equipment + technician names for the fail breakdowns.
    const eqIds = failsByEquipmentRaw.map((f) => f.equipmentId!).filter(Boolean);
    const techIds = failsByTechRaw.map((f) => f.performedById);
    const [equipment, techs] = await Promise.all([
      eqIds.length ? this.prisma.equipment.findMany({ where: { id: { in: eqIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
      techIds.length ? this.prisma.user.findMany({ where: { id: { in: techIds } }, select: { id: true, firstName: true, lastName: true } }) : Promise.resolve([]),
    ]);
    const eqName = new Map(equipment.map((e) => [e.id, e.name]));
    const techName = new Map(techs.map((t) => [t.id, `${t.firstName} ${t.lastName}`.trim()]));

    // Trend: last 30 days, one bucket per day.
    const days: Record<string, { pass: number; fail: number; marginal: number }> = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date(since); d.setDate(since.getDate() + i);
      days[d.toISOString().slice(0, 10)] = { pass: 0, fail: 0, marginal: 0 };
    }
    for (const c of recent) {
      const key = new Date(c.performedAt).toISOString().slice(0, 10);
      if (!days[key]) continue;
      if (c.result === 'Pass') days[key].pass++;
      else if (c.result === 'Fail') days[key].fail++;
      else days[key].marginal++;
    }

    return {
      totalChecks: total,
      passRate: rate(pass),
      failRate: rate(fail),
      marginalRate: rate(marginal),
      passCount: pass, failCount: fail, marginalCount: marginal,
      failsByType: failsByType.map((f) => ({ type: f.checkType, count: f._count._all })).sort((a, b) => b.count - a.count),
      failsByEquipment: failsByEquipmentRaw.map((f) => ({ equipmentName: eqName.get(f.equipmentId!) ?? 'Unknown', count: f._count._all })).sort((a, b) => b.count - a.count),
      failsByTechnician: failsByTechRaw.map((f) => ({ userName: techName.get(f.performedById) ?? 'Unknown', count: f._count._all })).sort((a, b) => b.count - a.count),
      trendByDay: Object.entries(days).map(([date, v]) => ({ date, ...v })),
    };
  }

  // ── Failure alerts ────────────────────────────────────────────────────
  alerts() {
    return this.prisma.qCFailureAlert.findMany({
      where: { status: { not: 'Resolved' } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, status: true, createdAt: true, resolvedAt: true,
        qcCheck: { select: checkSelect },
      },
    });
  }

  /**
   * Phase 5 · E1E — distinct, sorted record ids that have a RECORD-ANCHORED, unresolved
   * QC failure: a QCCheck with a non-null recordId whose QCFailureAlert.status is not
   * Resolved. Record ids ONLY — no check/alert id, result, status, equipment, reagent,
   * notes, corrective action, actor, timestamp, or labId. Excludes equipment/reagent/
   * batch/non-record QC (recordId null), Marginal/Pass checks (no failure alert), and
   * Resolved alerts. Mutation-free (one grouped read; no Record write, no RecordStatusEvent,
   * never sets OnHold). Lab-scoped by the tenancy extension (groupBy intercepted); no caller
   * labId. This is "Open QC Failures" — NOT a Record hold, clinical-risk, diagnosis-quality,
   * urgency, or release/authorization claim.
   */
  async recordIdsWithOpenFailure(): Promise<string[]> {
    const rows = await this.prisma.qCCheck.groupBy({
      by: ['recordId'],
      where: {
        recordId: { not: null },
        failureAlert: { status: { not: 'Resolved' } },
      },
    });
    return rows
      .map((r) => r.recordId)
      .filter((id): id is string => id !== null)
      .sort();
  }

  async resolveAlert(id: string, userId: string, dto: ResolveAlertDto) {
    const alert = await this.prisma.qCFailureAlert.findFirst({ where: { id }, select: { id: true, qcCheckId: true } });
    if (!alert) throw new NotFoundException('Alert not found');
    if (dto.correctiveAction?.trim()) {
      await this.prisma.qCCheck.update({ where: { id: alert.qcCheckId }, data: { correctiveAction: dto.correctiveAction.trim() } });
    }
    return this.prisma.qCFailureAlert.update({
      where: { id },
      data: { status: 'Resolved', resolvedAt: new Date(), resolvedById: userId },
      select: { id: true, status: true, resolvedAt: true },
    });
  }
}
