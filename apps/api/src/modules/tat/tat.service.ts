import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, RecordStatus, TATAlertLevel, TATAlertStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { CreateTATConfigDto, UpdateTATConfigDto, AlertQueryDto } from './dto/tat.dto';

const HOUR = 3_600_000;
// Received into the lab but not yet authorized — the TAT clock is running.
const IN_PROGRESS: RecordStatus[] = [
  RecordStatus.Submitted, RecordStatus.Processing, RecordStatus.Partial, RecordStatus.Completed, RecordStatus.Resulted,
];
const DONE: RecordStatus[] = [RecordStatus.Approved, RecordStatus.Billed, RecordStatus.Paid, RecordStatus.Viewed];

interface BethesdaLite { squamousCategory: string | null; ascSubtype: string | null; generalCategory: string | null; glandularCategory: string | null }
const isHighGrade = (b: BethesdaLite | null): boolean =>
  !!b && (b.squamousCategory === 'HSIL' || b.squamousCategory === 'SCC' || b.generalCategory === 'OtherMalignancy' || !!b.glandularCategory || (b.squamousCategory === 'ASC' && b.ascSubtype === 'ASCH'));

const alertSelect = {
  id: true, level: true, status: true, thresholdHours: true, elapsedHours: true, dueAt: true,
  notifiedAt: true, acknowledgedAt: true, resolvedAt: true, createdAt: true,
  acknowledgedBy: { select: { firstName: true, lastName: true } },
  config: { select: { id: true, name: true } },
  record: {
    select: {
      id: true, labNumber: true, identifier: true, formType: true, status: true, urgent: true, specimenDate: true,
      patient: { select: { firstName: true, lastName: true } },
      specimens: { select: { type: true } },
    },
  },
} as const;

// Phase 5 · E1D — narrow enterprise-facing overdue signal. Owner-recorded conclusion
// only: which records currently have an Open, Breached TATAlert, plus whether TAT is
// configured at all. NOT a live recalculation — it reflects the currently recorded
// alerts (there is no persisted authoritative last-scan timestamp to expose). No queue
// name, no clinical/urgency/quality claim. `activeConfigCount` distinguishes
// "configured, none breached" (>0 with empty recordIds) from "TAT not configured" (0).
export interface TatOverdueSignal {
  recordIds: string[]; // distinct, deterministically sorted record ids with an Open Breached TATAlert
  activeConfigCount: number; // lab-scoped count of active TATConfig rows
}

@Injectable()
export class TatService {
  constructor(private prisma: PrismaService) {}

  // ── Config CRUD ─────────────────────────────────────────────────
  listConfigs() {
    return this.prisma.tATConfig.findMany({ orderBy: [{ specimenType: 'asc' }, { name: 'asc' }] });
  }
  createConfig(dto: CreateTATConfigDto) {
    return this.prisma.tATConfig.create({
      data: tenantCreate<Prisma.TATConfigUncheckedCreateInput>({
        name: dto.name.trim(), specimenType: dto.specimenType?.trim() || null,
        thresholdHours: dto.thresholdHours, warningHours: dto.warningHours ?? 24,
        urgentThresholdHours: dto.urgentThresholdHours ?? null, isActive: dto.isActive ?? true,
      }),
    });
  }
  async updateConfig(id: string, dto: UpdateTATConfigDto) {
    const c = await this.prisma.tATConfig.findFirst({ where: { id }, select: { id: true } });
    if (!c) throw new NotFoundException('TAT config not found');
    return this.prisma.tATConfig.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.specimenType !== undefined && { specimenType: dto.specimenType?.trim() || null }),
        ...(dto.thresholdHours !== undefined && { thresholdHours: dto.thresholdHours }),
        ...(dto.warningHours !== undefined && { warningHours: dto.warningHours }),
        ...(dto.urgentThresholdHours !== undefined && { urgentThresholdHours: dto.urgentThresholdHours ?? null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }
  async removeConfig(id: string) {
    const c = await this.prisma.tATConfig.findFirst({ where: { id }, select: { id: true } });
    if (!c) throw new NotFoundException('TAT config not found');
    await this.prisma.tATConfig.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Alerts ──────────────────────────────────────────────────────
  listAlerts(query: AlertQueryDto) {
    const where: Prisma.TATAlertWhereInput = {};
    if (query.status && query.status in TATAlertStatus) where.status = query.status as TATAlertStatus;
    if (query.level && query.level in TATAlertLevel) where.level = query.level as TATAlertLevel;
    return this.prisma.tATAlert.findMany({ where, orderBy: [{ dueAt: 'asc' }], select: alertSelect });
  }

  async acknowledge(id: string, userId: string) {
    const a = await this.prisma.tATAlert.findFirst({ where: { id }, select: { id: true } });
    if (!a) throw new NotFoundException('Alert not found');
    return this.prisma.tATAlert.update({ where: { id }, data: { status: TATAlertStatus.Acknowledged, acknowledgedAt: new Date(), acknowledgedById: userId }, select: alertSelect });
  }
  async resolve(id: string) {
    const a = await this.prisma.tATAlert.findFirst({ where: { id }, select: { id: true } });
    if (!a) throw new NotFoundException('Alert not found');
    return this.prisma.tATAlert.update({ where: { id }, data: { status: TATAlertStatus.Resolved, resolvedAt: new Date() }, select: alertSelect });
  }

  async getStats() {
    const [openBreached, openApproaching, acknowledged, resolved, configs] = await Promise.all([
      this.prisma.tATAlert.count({ where: { level: TATAlertLevel.Breached, status: TATAlertStatus.Open } }),
      this.prisma.tATAlert.count({ where: { level: TATAlertLevel.Approaching, status: TATAlertStatus.Open } }),
      this.prisma.tATAlert.count({ where: { status: TATAlertStatus.Acknowledged } }),
      this.prisma.tATAlert.count({ where: { status: TATAlertStatus.Resolved } }),
      this.prisma.tATConfig.count({ where: { isActive: true } }),
    ]);
    return { openBreached, openApproaching, acknowledged, resolved, activeConfigs: configs };
  }

  /**
   * Phase 5 · E1D — enterprise overdue signal. Reads ONLY the owner's persisted
   * conclusion: the distinct set of record ids that currently have an Open, Breached
   * TATAlert, plus the lab-scoped count of active TATConfig rows. Record ids + a count
   * only — no alert id/dueAt/elapsedHours/config/threshold/actor/timestamp/Record detail.
   * Mutation-free: it does NOT scan(), evaluate breach, touch alerts/configs, or query
   * Records. Both reads are lab-scoped by the tenancy extension (groupBy/count intercepted);
   * no caller labId is accepted or returned. `activeConfigCount` lets the orchestrator
   * distinguish "configured, no open breaches" from "TAT not configured" (never "clear").
   * This is not a live recalculation; it reflects currently recorded alerts.
   */
  async getOverdueSignal(): Promise<TatOverdueSignal> {
    const [grouped, activeConfigCount] = await Promise.all([
      this.prisma.tATAlert.groupBy({
        by: ['recordId'],
        where: { level: TATAlertLevel.Breached, status: TATAlertStatus.Open },
      }),
      this.prisma.tATConfig.count({ where: { isActive: true } }),
    ]);
    return { recordIds: grouped.map((g) => g.recordId).sort(), activeConfigCount };
  }

  // ── Scan (cron + on-demand). Operates in the ambient lab scope. ──
  async scan() {
    const configs = await this.prisma.tATConfig.findMany({ where: { isActive: true } });
    if (configs.length === 0) return { scanned: 0, breached: 0, approaching: 0, resolved: 0 };

    // 1. Auto-resolve open/acknowledged alerts whose record is now authorized.
    const open = await this.prisma.tATAlert.findMany({
      where: { status: { in: [TATAlertStatus.Open, TATAlertStatus.Acknowledged] } },
      select: { id: true, record: { select: { status: true } } },
    });
    const resolveIds = open.filter((a) => DONE.includes(a.record.status)).map((a) => a.id);
    if (resolveIds.length) await this.prisma.tATAlert.updateMany({ where: { id: { in: resolveIds } }, data: { status: TATAlertStatus.Resolved, resolvedAt: new Date() } });

    // 2. Scan in-progress records.
    const records = await this.prisma.record.findMany({
      where: { status: { in: IN_PROGRESS } },
      select: {
        id: true, labNumber: true, urgent: true, specimenDate: true, createdAt: true,
        specimens: { select: { type: true } },
        bethesdaResult: { select: { squamousCategory: true, ascSubtype: true, generalCategory: true, glandularCategory: true } },
      },
    });

    const now = Date.now();
    let breached = 0, approaching = 0;
    const newBreaches: { recordId: string; labNumber: string | null; elapsedHours: number; thresholdHours: number }[] = [];

    for (const r of records) {
      const specTypes = r.specimens.map((s) => s.type as string);
      const config = configs.find((c) => c.specimenType && specTypes.includes(c.specimenType)) ?? configs.find((c) => !c.specimenType);
      if (!config) continue;
      const urgent = r.urgent || isHighGrade(r.bethesdaResult as BethesdaLite | null);
      const thresholdHours = urgent && config.urgentThresholdHours ? config.urgentThresholdHours : config.thresholdHours;
      const receipt = r.specimenDate ?? r.createdAt;
      const elapsedHours = Math.floor((now - receipt.getTime()) / HOUR);
      const dueAt = new Date(receipt.getTime() + thresholdHours * HOUR);

      let level: TATAlertLevel | null = null;
      if (elapsedHours >= thresholdHours) level = TATAlertLevel.Breached;
      else if (elapsedHours >= thresholdHours - config.warningHours) level = TATAlertLevel.Approaching;
      if (!level) continue;

      const existing = await this.prisma.tATAlert.findUnique({ where: { recordId_level: { recordId: r.id, level } } });
      if (existing) {
        await this.prisma.tATAlert.update({
          where: { id: existing.id },
          data: { elapsedHours, dueAt, thresholdHours, configId: config.id, ...(existing.status === TATAlertStatus.Resolved ? { status: TATAlertStatus.Open, resolvedAt: null } : {}) },
        });
      } else {
        await this.prisma.tATAlert.create({
          data: tenantCreate<Prisma.TATAlertUncheckedCreateInput>({ recordId: r.id, level, status: TATAlertStatus.Open, thresholdHours, elapsedHours, dueAt, configId: config.id, notifiedAt: new Date() }),
        });
        if (level === TATAlertLevel.Breached) {
          newBreaches.push({ recordId: r.id, labNumber: r.labNumber, elapsedHours, thresholdHours });
          // A breach supersedes any open approaching alert for the same record.
          await this.prisma.tATAlert.updateMany({ where: { recordId: r.id, level: TATAlertLevel.Approaching, status: { in: [TATAlertStatus.Open, TATAlertStatus.Acknowledged] } }, data: { status: TATAlertStatus.Resolved, resolvedAt: new Date() } });
        }
      }
      if (level === TATAlertLevel.Breached) breached++; else approaching++;
    }

    // 3. Notify authorizers of newly-breached records.
    if (newBreaches.length) await this.notifyBreaches(newBreaches);

    return { scanned: records.length, breached, approaching, resolved: resolveIds.length };
  }

  /** In-app notification to every active authorizer (holds resultsheet:authorize or is super). */
  private async notifyBreaches(breaches: { recordId: string; labNumber: string | null; elapsedHours: number; thresholdHours: number }[]) {
    const authorizers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        roles: { some: { role: { OR: [{ isSuperRole: true }, { permissions: { some: { permission: { code: 'resultsheet:authorize' } } } }] } } },
      },
      select: { id: true },
    });
    if (authorizers.length === 0) return;
    const rows = breaches.flatMap((b) =>
      authorizers.map((u) => tenantCreate<Prisma.NotificationUncheckedCreateInput>({
        userId: u.id,
        type: NotificationType.SYSTEM_ALERT,
        title: `TAT breach: ${b.labNumber ?? 'record'}`,
        body: `Report is overdue — ${b.elapsedHours}h elapsed against a ${b.thresholdHours}h target. Prioritise authorization.`,
        link: `/records/${b.recordId}`,
        entityId: b.recordId,
        entityType: 'record',
      })),
    );
    // createMany stamps labId via the tenancy extension.
    await this.prisma.notification.createMany({ data: rows });
  }
}
