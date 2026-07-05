import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { NotificationsHelper } from '../notifications/notifications.helper';
import { deriveShortCode } from '../bethesda/bethesda.service';
import { CreateConsultDto, ListConsultQueryDto, RespondConsultDto, UpdateConsultDto } from './dto/teleconsult.dto';

const TOKEN_TTL_DAYS = 30;
const DAY = 86_400_000;
const URGENCY_DAYS: Record<string, number> = { Routine: 7, Priority: 2, Urgent: 1 };

const consultSelect = {
  id: true, recordId: true, status: true, urgency: true, consultantName: true, consultantEmail: true,
  consultantInstitution: true, clinicalSummary: true, specificQuestion: true,
  sharedNarrative: true, sharedBethesda: true, sharedImages: true,
  consultantResponse: true, consultantDiagnosis: true, agreementLevel: true, respondedAt: true,
  accessToken: true, tokenExpiresAt: true, dueDate: true, notes: true, createdAt: true, updatedAt: true,
  requestedById: true,
  requestedBy: { select: { firstName: true, lastName: true } },
  record: { select: { id: true, labNumber: true, identifier: true, formType: true, patient: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.ConsultRequestSelect;

type Row = Prisma.ConsultRequestGetPayload<{ select: typeof consultSelect }>;

function specimenLabel(formType: string | null): string {
  if (formType === 'Gynecology') return 'Gynecologic cytology';
  if (formType === 'NonGynecology') return 'Non-gynecologic cytology';
  return 'Cytology';
}
const initials = (first?: string, last?: string) => `${(first?.[0] ?? '').toUpperCase()}${(last?.[0] ?? '').toUpperCase()}` || '—';

@Injectable()
export class TeleconsultService {
  private readonly log = new Logger(TeleconsultService.name);
  constructor(private prisma: PrismaService, private labContext: LabContext, private notifs: NotificationsHelper) {}

  private toRow(r: Row) {
    return {
      ...r,
      caseReference: `TC-${r.id.slice(-6).toUpperCase()}`,
      labNo: r.record ? (r.record.labNumber ?? r.record.identifier) : '—',
      specimenType: specimenLabel(r.record?.formType ?? null),
      patientInitials: r.record?.patient ? initials(r.record.patient.firstName, r.record.patient.lastName) : '—',
      requesterName: r.requestedBy ? `${r.requestedBy.firstName} ${r.requestedBy.lastName}`.trim() : '—',
      isOverdue: !!r.dueDate && new Date(r.dueDate) < new Date() && !['Responded', 'Accepted', 'Declined'].includes(r.status),
    };
  }

  // ── Staff (lab-scoped) ─────────────────────────────────────────────────────
  async list(query: ListConsultQueryDto) {
    const where: Prisma.ConsultRequestWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.urgency && { urgency: query.urgency }),
    };
    const rows = await this.prisma.consultRequest.findMany({ where, select: consultSelect, orderBy: { createdAt: 'desc' }, take: 300 });
    return rows.map((r) => this.toRow(r));
  }

  async detail(id: string) {
    const r = await this.prisma.consultRequest.findFirst({ where: { id }, select: consultSelect });
    if (!r) throw new NotFoundException('Consultation not found');
    return this.toRow(r);
  }

  /** De-identified prefill for the New Consultation form. */
  async prefill(recordId: string) {
    const record = await this.prisma.record.findFirst({
      where: { id: recordId },
      select: {
        id: true, labNumber: true, identifier: true, formType: true,
        patient: { select: { firstName: true, lastName: true } },
        bethesdaResult: { select: { specimenAdequacy: true, generalCategory: true, squamousCategory: true, ascSubtype: true, glandularCategory: true } },
        digitalSlides: { select: { id: true }, take: 1 },
      },
    });
    if (!record) throw new NotFoundException('Record not found');
    return {
      recordId: record.id,
      labNo: record.labNumber ?? record.identifier,
      patientInitials: record.patient ? initials(record.patient.firstName, record.patient.lastName) : '—',
      specimenType: specimenLabel(record.formType),
      bethesdaClassification: record.bethesdaResult ? deriveShortCode(record.bethesdaResult as any) : null,
      hasWsi: record.digitalSlides.length > 0,
    };
  }

  async create(dto: CreateConsultDto, userId: string) {
    const record = await this.prisma.record.findFirst({ where: { id: dto.recordId }, select: { id: true, labNumber: true, identifier: true } });
    if (!record) throw new NotFoundException('Record not found');
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : new Date(Date.now() + (URGENCY_DAYS[dto.urgency] ?? 7) * DAY);

    const created = await this.prisma.consultRequest.create({
      data: tenantCreate<Prisma.ConsultRequestUncheckedCreateInput>({
        recordId: dto.recordId,
        requestedById: userId,
        consultantName: dto.consultantName,
        consultantEmail: dto.consultantEmail,
        consultantInstitution: dto.consultantInstitution ?? null,
        clinicalSummary: dto.clinicalSummary,
        specificQuestion: dto.specificQuestion,
        urgency: dto.urgency,
        sharedNarrative: dto.sharedNarrative,
        sharedBethesda: dto.sharedBethesda,
        sharedImages: dto.sharedImages,
        dueDate,
        tokenExpiresAt: new Date(Date.now() + TOKEN_TTL_DAYS * DAY),
      }),
      select: consultSelect,
    });

    await this.notifs.notifyUser(userId, {
      type: NotificationType.SYSTEM_ALERT,
      title: 'Consultation request sent',
      body: `Second opinion requested from ${dto.consultantName} for ${record.labNumber ?? record.identifier}.`,
      link: `/teleconsult/${created.id}`, entityId: created.id, entityType: 'consult',
    });
    return this.toRow(created);
  }

  async update(id: string, dto: UpdateConsultDto) {
    await this.detail(id);
    return this.prisma.consultRequest
      .update({ where: { id }, data: { ...(dto.urgency && { urgency: dto.urgency }), ...(dto.notes !== undefined && { notes: dto.notes || null }) }, select: consultSelect })
      .then((r) => this.toRow(r));
  }

  async accept(id: string) {
    await this.detail(id);
    return this.prisma.consultRequest.update({ where: { id }, data: { status: 'Accepted' }, select: consultSelect }).then((r) => this.toRow(r));
  }

  async decline(id: string) {
    await this.detail(id);
    return this.prisma.consultRequest.update({ where: { id }, data: { status: 'Declined' }, select: consultSelect }).then((r) => this.toRow(r));
  }

  /** Extend the access token by another TTL window so the link works again. */
  async resend(id: string) {
    await this.detail(id);
    const r = await this.prisma.consultRequest.update({
      where: { id },
      data: { tokenExpiresAt: new Date(Date.now() + TOKEN_TTL_DAYS * DAY) },
      select: consultSelect,
    });
    return this.toRow(r);
  }

  // ── Public (token-authenticated, no lab context) ───────────────────────────
  /** De-identified case for the external consultant. Runs cross-lab (system). */
  async publicCase(accessToken: string) {
    return this.labContext.runSystem(async () => {
      const c = await this.prisma.consultRequest.findFirst({
        where: { accessToken },
        select: {
          id: true, status: true, urgency: true, specificQuestion: true, clinicalSummary: true,
          sharedNarrative: true, sharedBethesda: true, tokenExpiresAt: true, dueDate: true, labId: true,
          record: {
            select: {
              formType: true,
              bethesdaResult: { select: { specimenAdequacy: true, generalCategory: true, squamousCategory: true, ascSubtype: true, glandularCategory: true } },
              resultSheets: { select: { narrative: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
            },
          },
          lab: { select: { name: true } },
        },
      });
      if (!c) throw new NotFoundException('Consultation not found');
      if (new Date(c.tokenExpiresAt) < new Date()) {
        if (c.status !== 'Expired') await this.prisma.consultRequest.update({ where: { id: c.id }, data: { status: 'Expired' } });
        throw new NotFoundException('This consultation link has expired.');
      }
      // First view: Pending → Viewed.
      if (c.status === 'Pending') await this.prisma.consultRequest.update({ where: { id: c.id }, data: { status: 'Viewed' } });

      return {
        id: c.id, // consult id (not the patient/record id) — needed to submit a response
        caseReference: `TC-${c.id.slice(-6).toUpperCase()}`,
        specimenType: specimenLabel(c.record?.formType ?? null),
        clinicalSummary: c.clinicalSummary,
        specificQuestion: c.specificQuestion,
        urgency: c.urgency,
        narrative: c.sharedNarrative ? (c.record?.resultSheets?.[0]?.narrative ?? null) : null,
        bethesdaClassification: c.sharedBethesda && c.record?.bethesdaResult ? deriveShortCode(c.record.bethesdaResult as any) : null,
        requestingLab: c.lab?.name ?? 'Laboratory',
        dueDate: c.dueDate ? c.dueDate.toISOString() : null,
        status: c.status === 'Pending' ? 'Viewed' : c.status,
      };
    });
  }

  /** Consultant submits a response, authenticated by the access token alone. */
  async respond(id: string, dto: RespondConsultDto) {
    return this.labContext.runSystem(async () => {
      const c = await this.prisma.consultRequest.findFirst({
        where: { id, accessToken: dto.accessToken },
        select: { id: true, labId: true, requestedById: true, tokenExpiresAt: true, record: { select: { labNumber: true, identifier: true } } },
      });
      if (!c) throw new NotFoundException('Consultation not found');
      if (new Date(c.tokenExpiresAt) < new Date()) throw new NotFoundException('This consultation link has expired.');

      await this.prisma.consultRequest.update({
        where: { id: c.id },
        data: {
          status: 'Responded', respondedAt: new Date(),
          consultantResponse: dto.consultantResponse,
          consultantDiagnosis: dto.consultantDiagnosis || null,
          agreementLevel: dto.agreementLevel ?? null,
        },
      });

      // Notify the requester inside their own lab scope.
      await this.labContext.runLabScoped(c.labId, () =>
        this.notifs.notifyUser(c.requestedById, {
          type: NotificationType.SYSTEM_ALERT,
          title: 'Consultation response received',
          body: `A response was received for ${c.record?.labNumber ?? c.record?.identifier ?? 'a case'}.`,
          link: `/teleconsult/${c.id}`, entityId: c.id, entityType: 'consult',
        }),
      ).catch((e) => this.log.warn(`consult respond notify failed: ${(e as Error).message}`));

      return { id: c.id, status: 'Responded' as const };
    });
  }

  async analytics() {
    const all = await this.prisma.consultRequest.findMany({ select: { status: true, urgency: true, createdAt: true, respondedAt: true, agreementLevel: true } });
    const total = all.length;
    const pending = all.filter((c) => ['Pending', 'Viewed', 'InProgress'].includes(c.status)).length;
    const responded = all.filter((c) => c.respondedAt).length;
    const respTimes = all.filter((c) => c.respondedAt).map((c) => (+new Date(c.respondedAt!) - +new Date(c.createdAt)) / DAY);
    const avgResponseDays = respTimes.length ? Math.round((respTimes.reduce((s, d) => s + d, 0) / respTimes.length) * 10) / 10 : 0;
    const agreed = all.filter((c) => c.agreementLevel);
    const agreementRate = agreed.length ? Math.round((agreed.filter((c) => c.agreementLevel === 'FullAgreement').length / agreed.length) * 1000) / 10 : 0;
    const byUrgency = ['Routine', 'Priority', 'Urgent'].map((u) => ({ urgency: u, count: all.filter((c) => c.urgency === u).length }));
    return { total, pending, responded, avgResponseDays, agreementRate, byUrgency };
  }
}
