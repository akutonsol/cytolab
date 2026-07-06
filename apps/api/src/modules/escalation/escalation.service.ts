import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EscalationSeverity, EscalationStatus, EscalationTrigger, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsHelper } from '../notifications/notifications.helper';
import { EscalationQueryDto, ManualEscalateDto } from './dto/escalation.dto';
import { BethesdaLite, REVIEW_TIMEFRAME, deriveSeverity, severityFromBethesda } from './escalation-severity';

const OPEN_STATUSES: EscalationStatus[] = ['Pending', 'Acknowledged', 'UnderReview'];

// Severity → notification urgency wording + relative rank (for ordering).
const SEVERITY_RANK: Record<EscalationSeverity, number> = { Malignant: 3, HighGrade: 2, Abnormal: 1 };

const listSelect = {
  id: true, severity: true, trigger: true, status: true, createdAt: true, updatedAt: true,
  physicianNotifiedAt: true, physicianNotifiedVia: true, reviewedAt: true, reviewNotes: true,
  resolvedAt: true, resolvedReason: true,
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  reviewedBy: { select: { id: true, firstName: true, lastName: true } },
  record: {
    select: {
      id: true, labNumber: true, identifier: true, formType: true, status: true,
      patient: { select: { firstName: true, lastName: true, registrationNo: true } },
      bethesdaResult: { select: { squamousCategory: true, ascSubtype: true, glandularCategory: true, generalCategory: true, otherMalignancy: true, generatedNarrative: true } },
    },
  },
} satisfies Prisma.EscalationRecordSelect;

@Injectable()
export class EscalationService {
  private readonly log = new Logger(EscalationService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly labContext: LabContext,
    private readonly notify: NotificationsHelper,
    private readonly realtime: RealtimeGateway,
  ) {}

  // ── Automatic trigger ────────────────────────────────────────────────
  /**
   * Evaluate a record for abnormal/malignant findings and raise (or resolve) an
   * escalation. Best-effort and never throws — a failure here must not break the
   * authorization or Bethesda-save action that called it. Runs regardless of the
   * ABNORMAL_ESCALATION UI feature flag (clinical safety).
   */
  async evaluateRecord(recordId: string): Promise<void> {
    try {
      const record = await this.prisma.record.findFirst({
        where: { id: recordId },
        select: {
          id: true, labId: true, labNumber: true, clientId: true,
          patient: { select: { firstName: true, lastName: true } },
          bethesdaResult: {
            select: {
              specimenAdequacy: true, generalCategory: true, squamousCategory: true,
              ascSubtype: true, glandularCategory: true, otherMalignancy: true,
            },
          },
          resultSheets: { select: { narrative: true, authorized: true, authorizedAt: true }, orderBy: { authorizedAt: 'desc' } },
        },
      });
      if (!record) return;

      const bethesda = record.bethesdaResult as BethesdaLite | null;
      const narrative = record.resultSheets.find((s) => s.authorized)?.narrative ?? record.resultSheets[0]?.narrative ?? null;
      const result = deriveSeverity(bethesda, narrative);

      const open = await this.prisma.escalationRecord.findFirst({
        where: { recordId, status: { in: OPEN_STATUSES } },
        select: { id: true, severity: true },
      });

      if (!result) {
        // A structured NILM re-authorization auto-resolves any open escalation.
        if (open && bethesda && !severityFromBethesda(bethesda) && bethesda.generalCategory === 'NILM') {
          await this.prisma.escalationRecord.update({
            where: { id: open.id },
            data: { status: 'Resolved', resolvedAt: new Date(), resolvedReason: 'Record re-authorized as NILM' },
          });
        }
        return;
      }

      // Idempotent: one open escalation per record.
      if (open) return;

      await this.createAndNotify(record, result.severity, result.trigger, result.reason);
    } catch (e) {
      this.log.warn(`evaluateRecord(${recordId}) failed: ${(e as Error).message}`);
    }
  }

  /** Shared creation + assignment + notification path (auto + manual). */
  private async createAndNotify(
    record: { id: string; labId: string; labNumber: string | null; clientId: string | null; patient: { firstName: string; lastName: string } | null },
    severity: EscalationSeverity,
    trigger: EscalationTrigger,
    reason: string,
  ) {
    const assignee = await this.findSeniorPathologist(record.labId);

    // Referring physician notification: mark 'portal' when the record's client
    // has an active portal login, else best-effort 'in-app'. (Actual portal
    // message delivery is tracked here; see module notes.)
    let physicianNotifiedVia: string | null = null;
    if ((severity === 'Malignant' || severity === 'HighGrade') && record.clientId) {
      const portalUser = await this.prisma.portalUser.findFirst({ where: { clientId: record.clientId, isActive: true }, select: { id: true } });
      physicianNotifiedVia = portalUser ? 'portal' : 'in-app';
    }

    const escalation = await this.prisma.escalationRecord.create({
      data: tenantCreate<Prisma.EscalationRecordUncheckedCreateInput>({
        recordId: record.id,
        severity,
        trigger,
        status: 'Pending',
        assignedToId: assignee?.id ?? null,
        physicianNotifiedAt: physicianNotifiedVia ? new Date() : null,
        physicianNotifiedVia,
      }),
      select: { id: true },
    });

    const initials = record.patient ? `${record.patient.firstName?.[0] ?? ''}${record.patient.lastName?.[0] ?? ''}`.toUpperCase() : '—';
    const labNo = record.labNumber ?? record.id.slice(0, 8);
    const data = {
      title: `${severity === 'Malignant' ? 'URGENT: ' : ''}${severity} result — review required`,
      body: `Lab# ${labNo} (${initials}) flagged ${severity} (${reason}). Review needed ${REVIEW_TIMEFRAME[severity]}.`,
      link: '/escalations',
      entityId: escalation.id,
      entityType: 'escalation',
      type: 'SYSTEM_ALERT' as const,
    };

    // Notification fan-out by severity.
    if (severity === 'Malignant') {
      await this.notify.notifyPermission('resultsheet:authorize', data); // all pathologists/authorizers + managers
    } else if (severity === 'HighGrade') {
      if (assignee) await this.notify.notifyUser(assignee.id, data);
      await this.notify.notifyPermission('system:health', data); // lab managers (superusers)
    } else if (assignee) {
      await this.notify.notifyUser(assignee.id, data); // Abnormal → assigned pathologist only
    }

    // Realtime: push to the lab so the Action Center escalation badge updates live.
    this.realtime.emitToLab(record.labId, 'escalation:new', {
      type: 'escalation:new',
      data: { id: escalation.id, severity, recordId: record.id },
    });

    return escalation;
  }

  /** Pick a senior reviewer: prefer a Pathologist, then any authorizer/super. */
  private async findSeniorPathologist(labId: string) {
    const candidates = await this.prisma.user.findMany({
      where: {
        labId, isActive: true,
        roles: { some: { role: { OR: [{ isSuperRole: true }, { permissions: { some: { permission: { code: 'resultsheet:authorize' } } } }] } } },
      },
      select: { id: true, roles: { select: { role: { select: { name: true, isSuperRole: true } } } } },
    });
    if (candidates.length === 0) return null;
    const rank = (u: (typeof candidates)[number]) => {
      const names = u.roles.map((r) => r.role.name);
      if (names.includes('Pathologist')) return 3;
      if (names.includes('Authorizers')) return 2;
      if (u.roles.some((r) => r.role.isSuperRole)) return 1;
      return 0;
    };
    return [...candidates].sort((a, b) => rank(b) - rank(a))[0];
  }

  // ── Queries ──────────────────────────────────────────────────────────
  async list(query: EscalationQueryDto, userId: string) {
    const where: Prisma.EscalationRecordWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.severity) where.severity = query.severity;
    if (query.assignedToMe) where.assignedToId = userId;
    if (query.recordId) where.recordId = query.recordId;
    if (query.open) where.status = { in: OPEN_STATUSES };

    const rows = await this.prisma.escalationRecord.findMany({ where, select: listSelect, orderBy: { createdAt: 'desc' } });
    // Most-severe first, then newest.
    return rows.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || +new Date(b.createdAt) - +new Date(a.createdAt));
  }

  async summary() {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const [pending, acknowledged, underReview, malignantOpen, highGradeOpen, resolvedToday, resolvedAgg] = await Promise.all([
      this.prisma.escalationRecord.count({ where: { status: 'Pending' } }),
      this.prisma.escalationRecord.count({ where: { status: 'Acknowledged' } }),
      this.prisma.escalationRecord.count({ where: { status: 'UnderReview' } }),
      this.prisma.escalationRecord.count({ where: { severity: 'Malignant', status: { in: OPEN_STATUSES } } }),
      this.prisma.escalationRecord.count({ where: { severity: 'HighGrade', status: { in: OPEN_STATUSES } } }),
      this.prisma.escalationRecord.count({ where: { status: 'Resolved', resolvedAt: { gte: startOfDay } } }),
      this.prisma.escalationRecord.findMany({ where: { status: 'Resolved', resolvedAt: { not: null } }, select: { createdAt: true, resolvedAt: true }, take: 200, orderBy: { resolvedAt: 'desc' } }),
    ]);
    const hours = resolvedAgg.map((r) => (+new Date(r.resolvedAt!) - +new Date(r.createdAt)) / 3_600_000);
    const avgResolutionHours = hours.length ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10 : null;
    return { pending, acknowledged, underReview, malignantCount: malignantOpen, highGradeCount: highGradeOpen, resolvedToday, avgResolutionHours };
  }

  async detail(id: string) {
    const esc = await this.prisma.escalationRecord.findFirst({ where: { id }, select: listSelect });
    if (!esc) throw new NotFoundException('Escalation not found');
    return { ...esc, reviewTimeframe: REVIEW_TIMEFRAME[esc.severity] };
  }

  // ── Workflow transitions ──────────────────────────────────────────────
  private async transition(id: string, data: Prisma.EscalationRecordUpdateInput) {
    const existing = await this.prisma.escalationRecord.findFirst({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Escalation not found');
    return this.prisma.escalationRecord.update({ where: { id }, data, select: listSelect });
  }

  acknowledge(id: string) {
    return this.transition(id, { status: 'Acknowledged' });
  }

  review(id: string, userId: string) {
    return this.transition(id, { status: 'UnderReview', reviewedBy: { connect: { id: userId } }, reviewedAt: new Date() });
  }

  resolve(id: string, userId: string, notes?: string) {
    return this.transition(id, {
      status: 'Resolved', reviewedBy: { connect: { id: userId } }, reviewedAt: new Date(),
      reviewNotes: notes ?? null, resolvedAt: new Date(), resolvedReason: 'Reviewed and resolved',
    });
  }

  dismiss(id: string, userId: string, notes?: string) {
    return this.transition(id, {
      status: 'Dismissed', reviewedBy: { connect: { id: userId } }, reviewedAt: new Date(),
      reviewNotes: notes ?? null, resolvedAt: new Date(), resolvedReason: 'Dismissed as false positive',
    });
  }

  // ── Manual escalation ─────────────────────────────────────────────────
  async manual(dto: ManualEscalateDto, userId: string) {
    const record = await this.prisma.record.findFirst({
      where: { id: dto.recordId },
      select: { id: true, labId: true, labNumber: true, clientId: true, patient: { select: { firstName: true, lastName: true } } },
    });
    if (!record) throw new NotFoundException('Record not found');

    const open = await this.prisma.escalationRecord.findFirst({ where: { recordId: dto.recordId, status: { in: OPEN_STATUSES } }, select: { id: true } });
    if (open) throw new BadRequestException('An open escalation already exists for this record');

    const created = await this.createAndNotify(record, dto.severity, 'ManualFlag', dto.notes?.trim() || 'Manually flagged');
    if (dto.notes?.trim()) {
      await this.prisma.escalationRecord.update({ where: { id: created.id }, data: { reviewNotes: dto.notes.trim() } });
    }
    return this.detail(created.id);
  }
}
