import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, RecallStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { NotificationsHelper } from '../notifications/notifications.helper';
import { recallIntervalFor } from './recall-interval';
import { CompleteRecallDto, GenerateListQueryDto, ManualRecallDto, NotesDto, RecallQueryDto, UpdateRecallDto } from './dto/recall.dto';

const OVERDUE_DAYS = 90;
const DAY = 86_400_000;

const recallSelect = {
  id: true, triggerDiagnosis: true, triggerDate: true, recallIntervalMonths: true, dueDate: true, status: true,
  reminderSentAt: true, completedAt: true, completedRecordId: true, clientNotifiedAt: true, clientId: true, notes: true, createdAt: true,
  patient: { select: { id: true, firstName: true, lastName: true, dateOfBirth: true, registrationNo: true } },
  triggerRecord: { select: { id: true, labNumber: true, identifier: true, client: { select: { officeName: true, firstName: true, lastName: true } } } },
} satisfies Prisma.RecallRecordSelect;

type Row = Prisma.RecallRecordGetPayload<{ select: typeof recallSelect }>;

@Injectable()
export class RecallService {
  private readonly log = new Logger(RecallService.name);
  constructor(private prisma: PrismaService, private notifs: NotificationsHelper) {}

  private addMonths(d: Date, months: number): Date {
    const r = new Date(d); r.setMonth(r.getMonth() + months); return r;
  }
  private clientName(r: Row): string {
    const c = r.triggerRecord?.client;
    return c ? (c.officeName || `${c.firstName} ${c.lastName}`.trim()) : '—';
  }
  private toRow(r: Row) {
    const days = Math.ceil((+new Date(r.dueDate) - Date.now()) / DAY);
    return {
      ...r,
      patientName: r.patient ? `${r.patient.firstName} ${r.patient.lastName}`.trim() : '—',
      labNo: r.triggerRecord ? (r.triggerRecord.labNumber ?? r.triggerRecord.identifier) : '—',
      clientName: this.clientName(r),
      daysUntilDue: days,
    };
  }

  // ── Auto-create from a Bethesda result (hooked into BethesdaService.upsert) ──
  async autoCreateFromBethesda(recordId: string): Promise<void> {
    try {
      const record = await this.prisma.record.findFirst({
        where: { id: recordId },
        select: {
          id: true, patientId: true, clientId: true, specimenDate: true, createdAt: true,
          bethesdaResult: { select: { specimenAdequacy: true, generalCategory: true, squamousCategory: true, ascSubtype: true, glandularCategory: true, reportedAt: true } },
        },
      });
      if (!record?.bethesdaResult) return;
      const interval = recallIntervalFor(record.bethesdaResult);
      if (!interval) return; // high-grade / no-recall

      const existing = await this.prisma.recallRecord.findFirst({ where: { triggerRecordId: recordId }, select: { id: true } });
      if (existing) return; // idempotent

      const triggerDate = record.bethesdaResult.reportedAt ?? record.specimenDate ?? record.createdAt;
      await this.prisma.recallRecord.create({
        data: tenantCreate<Prisma.RecallRecordUncheckedCreateInput>({
          patientId: record.patientId,
          triggerRecordId: recordId,
          triggerDiagnosis: interval.diagnosis,
          triggerDate,
          recallIntervalMonths: interval.months,
          dueDate: this.addMonths(new Date(triggerDate), interval.months),
          clientId: record.clientId ?? null,
          status: 'Pending',
        }),
      });
    } catch (e) {
      this.log.warn(`autoCreateFromBethesda(${recordId}) failed: ${(e as Error).message}`);
    }
  }

  // ── Queries ────────────────────────────────────────────────────────────
  async list(query: RecallQueryDto) {
    const where: Prisma.RecallRecordWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.clientId && { clientId: query.clientId }),
      ...((query.dueBefore || query.dueAfter) && { dueDate: { ...(query.dueAfter && { gte: new Date(query.dueAfter) }), ...(query.dueBefore && { lte: new Date(query.dueBefore) }) } }),
      ...(query.search && { patient: { OR: [{ firstName: { contains: query.search, mode: 'insensitive' } }, { lastName: { contains: query.search, mode: 'insensitive' } }] } }),
    };
    const rows = await this.prisma.recallRecord.findMany({ where, select: recallSelect, orderBy: { dueDate: 'asc' }, take: 500 });
    return rows.map((r) => this.toRow(r));
  }

  async summary() {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const [pending, due, overdue, completedThisMonth] = await Promise.all([
      this.prisma.recallRecord.count({ where: { status: 'Pending' } }),
      this.prisma.recallRecord.count({ where: { status: 'Due' } }),
      this.prisma.recallRecord.count({ where: { status: 'Overdue' } }),
      this.prisma.recallRecord.count({ where: { status: 'Completed', completedAt: { gte: monthStart } } }),
    ]);
    const denom = due + overdue + completedThisMonth;
    return { pending, due, overdue, completedThisMonth, overdueRate: denom ? Math.round((overdue / denom) * 1000) / 10 : 0 };
  }

  /**
   * Phase 5 · E1F2 — distinct, sorted trigger-record ids of RecallRecords in an OPEN
   * persisted status (Pending, Due, or Overdue); Completed/Cancelled/Declined are excluded.
   * Openness is taken verbatim from the owner-recorded `status` — never derived from dueDate,
   * reminderSentAt, clientNotifiedAt, appointments, or any timestamp. Anchored on
   * `triggerRecordId` only — never patientId/completedRecordId/clientId/appointment, no
   * inferred mapping. Record ids ONLY — no recall id, patient/contact data, triggerDiagnosis,
   * notes, dueDate, reminder/notification timestamps, appointments, completedRecordId, status
   * detail, actors, or labId. Mutation-free (one grouped read; no recall/appointment/Record
   * write, no client notification). Lab-scoped by the tenancy extension (groupBy intercepted);
   * no caller labId. This is the "Open Recalls" signal — NOT clinical urgency, patient-notified/
   * contacted/completed, recollection done, or a current-record/sign-out/release block. It is a
   * separate projection and must never be merged with Awaiting Correlation.
   */
  async recordIdsWithOpenRecall(): Promise<string[]> {
    const rows = await this.prisma.recallRecord.groupBy({
      by: ['triggerRecordId'],
      where: { status: { in: [RecallStatus.Pending, RecallStatus.Due, RecallStatus.Overdue] } },
    });
    return rows.map((r) => r.triggerRecordId).sort();
  }

  async detail(id: string) {
    const r = await this.prisma.recallRecord.findFirst({ where: { id }, select: recallSelect });
    if (!r) throw new NotFoundException('Recall not found');
    return this.toRow(r);
  }

  byPatient(patientId: string) {
    return this.prisma.recallRecord.findMany({ where: { patientId }, select: recallSelect, orderBy: { dueDate: 'desc' } }).then((rows) => rows.map((r) => this.toRow(r)));
  }

  // ── Mutations ──────────────────────────────────────────────────────────
  private async getRecall(id: string) {
    const r = await this.prisma.recallRecord.findFirst({ where: { id }, select: { id: true, clientId: true, patient: { select: { firstName: true, lastName: true } } } });
    if (!r) throw new NotFoundException('Recall not found');
    return r;
  }

  async update(id: string, dto: UpdateRecallDto) {
    await this.getRecall(id);
    return this.prisma.recallRecord.update({ where: { id }, data: { ...(dto.status && { status: dto.status }), ...(dto.notes !== undefined && { notes: dto.notes || null }) }, select: recallSelect }).then((r) => this.toRow(r));
  }

  async complete(id: string, dto: CompleteRecallDto) {
    await this.getRecall(id);
    return this.prisma.recallRecord.update({ where: { id }, data: { status: 'Completed', completedAt: new Date(), completedRecordId: dto.completedRecordId || null }, select: recallSelect }).then((r) => this.toRow(r));
  }

  async cancel(id: string, dto: NotesDto) {
    await this.getRecall(id);
    return this.prisma.recallRecord.update({ where: { id }, data: { status: 'Cancelled', notes: dto.notes || null }, select: recallSelect }).then((r) => this.toRow(r));
  }

  async decline(id: string, dto: NotesDto) {
    await this.getRecall(id);
    return this.prisma.recallRecord.update({ where: { id }, data: { status: 'Declined', notes: dto.notes || null }, select: recallSelect }).then((r) => this.toRow(r));
  }

  async notifyClient(id: string) {
    const r = await this.getRecall(id);
    await this.prisma.recallRecord.update({ where: { id }, data: { clientNotifiedAt: new Date() } });
    // A referring client with a portal login is notified; there is no lab→portal
    // message channel yet, so this records the intent (see module notes).
    return { id, clientNotifiedAt: new Date().toISOString(), clientLinked: !!r.clientId };
  }

  async manual(dto: ManualRecallDto) {
    const record = await this.prisma.record.findFirst({ where: { id: dto.triggerRecordId }, select: { id: true, labId: true, clientId: true, specimenDate: true, createdAt: true } });
    if (!record) throw new NotFoundException('Trigger record not found');
    const triggerDate = record.specimenDate ?? record.createdAt;
    const dueDate = this.addMonths(new Date(triggerDate), dto.intervalMonths);
    return this.prisma.recallRecord.upsert({
      where: { labId_triggerRecordId: { labId: record.labId, triggerRecordId: dto.triggerRecordId } },
      update: { recallIntervalMonths: dto.intervalMonths, dueDate, notes: dto.notes || null, triggerDiagnosis: dto.diagnosis ?? 'Manual' },
      create: tenantCreate<Prisma.RecallRecordUncheckedCreateInput>({
        patientId: dto.patientId, triggerRecordId: dto.triggerRecordId, triggerDiagnosis: dto.diagnosis ?? 'Manual',
        triggerDate, recallIntervalMonths: dto.intervalMonths, dueDate,
        clientId: record.clientId ?? null, notes: dto.notes || null, status: 'Pending',
      }),
      select: recallSelect,
    }).then((r) => this.toRow(r));
  }

  // ── Recall list export ─────────────────────────────────────────────────
  async generateList(query: GenerateListQueryDto) {
    const where: Prisma.RecallRecordWhereInput = {
      status: query.status ?? { in: ['Pending', 'Due', 'Overdue'] },
      ...(query.clientId && { clientId: query.clientId }),
      ...(query.dueBefore && { dueDate: { lte: new Date(query.dueBefore) } }),
    };
    const rows = await this.prisma.recallRecord.findMany({ where, select: recallSelect, orderBy: { dueDate: 'asc' } });
    return rows.map((r) => {
      const days = Math.ceil((Date.now() - +new Date(r.dueDate)) / DAY);
      return {
        patientName: r.patient ? `${r.patient.firstName} ${r.patient.lastName}`.trim() : '—',
        dob: r.patient?.dateOfBirth ? r.patient.dateOfBirth.toISOString() : null,
        lastResult: r.triggerDiagnosis,
        dueDate: r.dueDate.toISOString(),
        clientName: this.clientName(r),
        daysPastDue: days > 0 ? days : null,
        status: r.status,
      };
    });
  }

  // ── Daily cron transitions (called per-lab by the scheduler) ────────────
  async checkDue(): Promise<{ due: number; overdue: number }> {
    const now = new Date();
    const overdueBefore = new Date(Date.now() - OVERDUE_DAYS * DAY);

    // Pending → Due (past dueDate). Notify manager for each.
    const newlyDue = await this.prisma.recallRecord.findMany({
      where: { status: 'Pending', dueDate: { lte: now } },
      select: { id: true, recallIntervalMonths: true, triggerDiagnosis: true, patient: { select: { firstName: true, lastName: true } } },
    });
    for (const r of newlyDue) {
      const name = r.patient ? `${r.patient.firstName} ${r.patient.lastName}`.trim() : 'A patient';
      await this.notifs.notifyPermission('system:health', {
        type: NotificationType.SYSTEM_ALERT, title: 'Patient recall due',
        body: `${name} is due for recall (${r.triggerDiagnosis} — ${r.recallIntervalMonths}mo).`,
        link: '/recalls', entityId: r.id, entityType: 'recall',
      });
    }
    if (newlyDue.length) await this.prisma.recallRecord.updateMany({ where: { id: { in: newlyDue.map((r) => r.id) } }, data: { status: 'Due' } });

    // Due → Overdue (> 90 days past due). Notify manager (urgent).
    const newlyOverdue = await this.prisma.recallRecord.findMany({
      where: { status: 'Due', dueDate: { lte: overdueBefore } },
      select: { id: true, triggerDiagnosis: true, patient: { select: { firstName: true, lastName: true } } },
    });
    for (const r of newlyOverdue) {
      const name = r.patient ? `${r.patient.firstName} ${r.patient.lastName}`.trim() : 'A patient';
      await this.notifs.notifyPermission('system:health', {
        type: NotificationType.SYSTEM_ALERT, title: 'URGENT: Patient recall overdue',
        body: `${name}'s recall (${r.triggerDiagnosis}) is over 90 days overdue.`,
        link: '/recalls', entityId: r.id, entityType: 'recall',
      });
    }
    if (newlyOverdue.length) await this.prisma.recallRecord.updateMany({ where: { id: { in: newlyOverdue.map((r) => r.id) } }, data: { status: 'Overdue' } });

    if (newlyDue.length || newlyOverdue.length) this.log.log(`Recall check: ${newlyDue.length} → Due, ${newlyOverdue.length} → Overdue`);
    return { due: newlyDue.length, overdue: newlyOverdue.length };
  }
}
