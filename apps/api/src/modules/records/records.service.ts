import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, RecordStatus, RequisitionFormType, RequisitionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { NotificationsHelper } from '../notifications/notifications.helper';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { allocateSequence, isUniqueConflict } from '../../common/util/lab-sequence';
import {
  CreateRecordDto,
  GynClinicalFeaturesDto,
  NonGynClinicalFeaturesDto,
  RecordQueryDto,
  UpdateRecordDto,
  UpdateRecordStatusDto,
} from './dto/record.dto';
import { randomBytes } from 'crypto';

// Human-facing case number (legacy Lab No., e.g. CBL26-06-465): <lab-prefix> +
// 2-digit year + 2-digit month + a MONTHLY-reset sequence. Imported verbatim.
const LABNO_MAX_RETRIES = 5;

const recordSelect = {
  id: true,
  identifier: true,
  labNumber: true,
  formType: true,
  doctor: true,
  clinicalDiagnosis: true,
  specimenDate: true,
  urgent: true,
  medicalEntry: true,
  billed: true,
  status: true,
  dateStatus: true,
  patientId: true,
  patient: {
    select: { id: true, registrationNo: true, firstName: true, lastName: true, gender: true, dateOfBirth: true },
  },
  clientId: true,
  // Rich client display for the record header (name, Acc#, portal user, Type).
  client: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      officeName: true,
      accountNo: true,
      clientType: { select: { type: true } },
      portalUsers: { select: { username: true }, take: 1 },
    },
  },
  workspaceId: true,
  specimens: {
    select: {
      id: true, type: true, label: true, vialColour: true, antiserumA: true, antiserumB: true,
      rhSolution: true, bloodGroup: true, dateReceived: true,
      images: { select: { id: true, storageUrl: true, caption: true } },
    },
  },
  therapy: true,
  gynFeatures: true,
  nonGynFeatures: true,
  resultSheets: { select: { id: true, authorized: true, authorizedAt: true } },
  statusHistory: {
    select: { id: true, status: true, notes: true, userId: true, createdAt: true, user: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  createdAt: true,
  updatedAt: true,
} as const;

// Valid forward transitions; OnHold / Disabled / Failed can be set from any non-terminal state
// A requisition line is "fulfilled" once its record reaches Completed or beyond.
const FULFILLED_STATUSES: RecordStatus[] = [
  RecordStatus.Completed,
  RecordStatus.Resulted,
  RecordStatus.Approved,
  RecordStatus.Billed,
  RecordStatus.Paid,
  RecordStatus.Viewed,
];

// Completed-or-beyond: the record's DATA is frozen (no edits/delete). Orthogonal
// to status transitions — the workflow still proceeds via updateStatus().
const LOCKED_STATUSES: RecordStatus[] = [
  RecordStatus.Completed,
  RecordStatus.Resulted,
  RecordStatus.Approved,
  RecordStatus.Billed,
  RecordStatus.Paid,
  RecordStatus.Viewed,
];

const ALLOWED_TRANSITIONS: Partial<Record<RecordStatus, RecordStatus[]>> = {
  [RecordStatus.Pending]:    [RecordStatus.Submitted, RecordStatus.OnHold, RecordStatus.Disabled],
  [RecordStatus.Submitted]:  [RecordStatus.Processing, RecordStatus.OnHold, RecordStatus.Disabled],
  [RecordStatus.Processing]: [RecordStatus.Partial, RecordStatus.Completed, RecordStatus.OnHold, RecordStatus.Disabled, RecordStatus.Failed],
  [RecordStatus.Partial]:    [RecordStatus.Completed, RecordStatus.OnHold, RecordStatus.Disabled, RecordStatus.Failed],
  // A Completed record moves to Resulted once it has a result sheet, then to
  // Approved via the authorization gate.
  [RecordStatus.Completed]:  [RecordStatus.Resulted, RecordStatus.OnHold],
  [RecordStatus.Resulted]:   [RecordStatus.Approved, RecordStatus.OnHold],
  // Approved -> Resulted: editing a result sheet's findings after approval
  // de-authorizes it, returning the record to the Awaiting Approval queue for
  // re-sign-off (the report gate stays closed until re-authorization).
  [RecordStatus.Approved]:   [RecordStatus.Billed, RecordStatus.Resulted],
  [RecordStatus.Billed]:     [RecordStatus.Paid],
  [RecordStatus.OnHold]:     [RecordStatus.Submitted, RecordStatus.Processing, RecordStatus.Disabled],
};

@Injectable()
export class RecordsService {
  constructor(
    private prisma: PrismaService,
    private labContext: LabContext,
    private notifs: NotificationsHelper,
  ) {}

  // Record queries are lab-scoped automatically by the tenancy extension; nested
  // tenant rows (specimens) are stamped with the lab on write by the same guard.
  async findAll(query: RecordQueryDto) {
    return this.list(query);
  }

  async findApproved(query: RecordQueryDto) {
    return this.list({ ...query, status: RecordStatus.Approved });
  }

  async findBillable(query: RecordQueryDto) {
    // Only Approved-and-not-yet-billed records are billable. This mirrors legacy
    // (records became billable only on reaching Approved) and stays consistent
    // with the issue-bill transition, which advances Approved -> Billed.
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where = {
      billed: false,
      status: RecordStatus.Approved,
    };
    const [data, total] = await Promise.all([
      this.prisma.record.findMany({ where, select: recordSelect, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.record.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findByClient(clientId: string, query: RecordQueryDto) {
    return this.list({ ...query, clientId });
  }

  async findByPatient(patientId: string, query: RecordQueryDto) {
    return this.list({ ...query, patientId });
  }

  async findRecent(query: RecordQueryDto) {
    const pageSize = query.pageSize ?? 10;
    const data = await this.prisma.record.findMany({
      select: recordSelect,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });
    return { data, total: data.length };
  }

  async findByRequisition(requisitionId: string, query: RecordQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where = { requisitionLines: { some: { requisitionId } } };
    const [data, total] = await Promise.all([
      this.prisma.record.findMany({ where, select: recordSelect, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.record.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findOne(id: string) {
    const record = await this.prisma.record.findFirst({ where: { id }, select: recordSelect });
    if (!record) throw new NotFoundException('Record not found');
    return record;
  }

  async create(userId: string, dto: CreateRecordDto) {
    const { specimens, therapy, requisitionLineId, gynFeatures, nonGynFeatures, ...rest } = dto;
    // Reject mismatched clinical features BEFORE creating any row (no orphans).
    this.assertFeaturesMatch(rest.formType, gynFeatures, nonGynFeatures);
    const identifier = this.generateIdentifier();

    // Atomic monthly Lab No. with the unique-constraint retry backstop.
    let record;
    for (let attempt = 0; ; attempt++) {
      const labNumber = await this.allocateLabNumber();
      try {
        record = await this.prisma.record.create({
          data: tenantCreate<Prisma.RecordUncheckedCreateInput>({
            identifier,
            labNumber,
            ...rest,
            specimens: specimens?.length
              ? { create: specimens.map((s) => tenantCreate<Prisma.SpecimenUncheckedCreateWithoutRecordInput>(s)) }
              : undefined,
            therapy: therapy
              ? { create: tenantCreate<Prisma.TherapyUncheckedCreateWithoutRecordInput>(therapy) }
              : undefined,
            statusHistory: {
              create: tenantCreate<Prisma.RecordStatusEventUncheckedCreateWithoutRecordInput>({
                status: RecordStatus.Pending,
                userId,
                notes: 'Record created',
              }),
            },
          }),
          select: recordSelect,
        });
        break;
      } catch (e) {
        if (isUniqueConflict(e, 'labNumber') && attempt < LABNO_MAX_RETRIES) continue;
        if (isUniqueConflict(e, 'labNumber')) {
          throw new ConflictException('Could not allocate a unique lab number; please retry');
        }
        throw e;
      }
    }

    // Clinical features go through the single guarded chokepoint.
    await this.writeClinicalFeatures(record.id, rest.formType ?? null, gynFeatures, nonGynFeatures);

    // Link to requisition line if provided. The line is lab-scoped by the
    // tenancy guard, so a line from another lab simply won't be found.
    if (requisitionLineId) {
      const line = await this.prisma.requisitionLine.findFirst({
        where: { id: requisitionLineId },
        select: { id: true },
      });
      if (line) {
        await this.prisma.requisitionLine.update({
          where: { id: requisitionLineId },
          data: { recordId: record.id },
        });
      }
    }

    return this.findOne(record.id);
  }

  async update(id: string, userId: string, dto: UpdateRecordDto) {
    const existing = await this.findOne(id);
    this.assertNotLocked(existing.status as RecordStatus);
    const { therapy, gynFeatures, nonGynFeatures, specimens, ...rest } = dto;

    // Effective form type = the update's, else the record's current one.
    const formType = (rest.formType ?? existing.formType ?? null) as RequisitionFormType | null;
    this.assertFeaturesMatch(formType, gynFeatures, nonGynFeatures);

    await this.prisma.record.update({
      where: { id },
      data: {
        ...rest,
        ...(specimens !== undefined
          ? {
              specimens: {
                deleteMany: {},
                create: specimens.map((s) =>
                  tenantCreate<Prisma.SpecimenUncheckedCreateWithoutRecordInput>(s),
                ),
              },
            }
          : {}),
        ...(therapy != null
          ? {
              therapy: {
                upsert: {
                  create: tenantCreate<Prisma.TherapyUncheckedCreateWithoutRecordInput>(therapy),
                  update: therapy,
                },
              },
            }
          : {}),
      },
      select: { id: true },
    });

    // All clinical-features writes route through the chokepoint (which also
    // clears the opposite-type row, so a record can never hold both).
    if (gynFeatures || nonGynFeatures || rest.formType !== undefined) {
      await this.writeClinicalFeatures(id, formType, gynFeatures, nonGynFeatures);
    }
    return this.findOne(id);
  }

  /**
   * "Submit to Cytolab": hand the case off to the lab (Pending → Submitted, NOT
   * Processing — the lab picks it up separately). The urgent toggle marks the
   * case as express.
   */
  async submit(id: string, userId: string, urgent?: boolean) {
    if (urgent !== undefined) {
      await this.prisma.record.update({ where: { id }, data: { urgent }, select: { id: true } });
    }
    return this.transition(
      id,
      userId,
      RecordStatus.Submitted,
      urgent ? 'Submitted to Cytolab (urgent/express)' : 'Submitted to Cytolab',
    );
  }

  // ---- clinical features: the single guarded chokepoint (option B) ----

  /** Reject clinical features that don't match the record's form type. */
  private assertFeaturesMatch(
    formType: RequisitionFormType | null | undefined,
    gyn?: GynClinicalFeaturesDto,
    nonGyn?: NonGynClinicalFeaturesDto,
  ) {
    if ((gyn || nonGyn) && !formType) {
      throw new BadRequestException('Choose the record form type before adding clinical features');
    }
    if (gyn && formType !== RequisitionFormType.Gynecology) {
      throw new BadRequestException('Gynecology clinical features can only be attached to a Gynecology record');
    }
    if (nonGyn && formType !== RequisitionFormType.NonGynecology) {
      throw new BadRequestException('Non-gynecology clinical features can only be attached to a Non-gynecology record');
    }
  }

  /**
   * The ONLY path that writes clinical features. It asserts the type matches,
   * upserts the matching-type row, and always deletes the opposite-type row — so
   * a record can never structurally hold both Gyn and NonGyn features.
   */
  private async writeClinicalFeatures(
    recordId: string,
    formType: RequisitionFormType | null,
    gyn?: GynClinicalFeaturesDto,
    nonGyn?: NonGynClinicalFeaturesDto,
  ) {
    this.assertFeaturesMatch(formType, gyn, nonGyn);

    if (formType === RequisitionFormType.Gynecology) {
      await this.prisma.nonGynClinicalFeatures.deleteMany({ where: { recordId } });
      if (gyn) {
        await this.prisma.gynClinicalFeatures.upsert({
          where: { recordId },
          create: tenantCreate<Prisma.GynClinicalFeaturesUncheckedCreateInput>({ recordId, ...gyn }),
          update: gyn,
        });
      }
    } else if (formType === RequisitionFormType.NonGynecology) {
      await this.prisma.gynClinicalFeatures.deleteMany({ where: { recordId } });
      if (nonGyn) {
        await this.prisma.nonGynClinicalFeatures.upsert({
          where: { recordId },
          create: tenantCreate<Prisma.NonGynClinicalFeaturesUncheckedCreateInput>({ recordId, ...nonGyn }),
          update: nonGyn,
        });
      }
    } else {
      // No form type → ensure neither features row lingers.
      await this.prisma.gynClinicalFeatures.deleteMany({ where: { recordId } });
      await this.prisma.nonGynClinicalFeatures.deleteMany({ where: { recordId } });
    }
  }

  /** Allocate the case's Lab No. (CBL{YY}-{MM}-{seq}) from a monthly counter. */
  private async allocateLabNumber(): Promise<string> {
    const labId = this.labContext.getLabId();
    if (!labId) throw new Error('Cannot allocate a lab number with no lab context');
    const lab = await this.prisma.lab.findUnique({ where: { id: labId }, select: { slug: true } });
    const prefix = (lab?.slug ?? 'lab').replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase() || 'LAB';
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    // Monthly-reset: the sequence name carries the year-month, so each month
    // starts fresh at 1.
    const seqName = `recordLabNo:${now.getFullYear()}-${mm}`;
    const seq = await allocateSequence(this.prisma, labId, seqName, 0n);
    return `${prefix}${yy}-${mm}-${seq.toString().padStart(3, '0')}`;
  }

  async updateStatus(id: string, userId: string, dto: UpdateRecordStatusDto) {
    return this.transition(id, userId, dto.status, dto.notes);
  }

  async remove(id: string) {
    const record = await this.findOne(id);
    this.assertNotLocked(record.status as RecordStatus);
    await this.prisma.record.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Completed-lock: once a record reaches Completed (or beyond) its data is
   * frozen — edits and deletes are refused. This is ORTHOGONAL to status
   * transitions, which continue via updateStatus() so the lifecycle proceeds.
   */
  private assertNotLocked(status: RecordStatus) {
    if (LOCKED_STATUSES.includes(status)) {
      throw new ConflictException('Record is locked once completed and can no longer be edited or deleted');
    }
  }

  // ---- helpers ----

  private async list(query: RecordQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.patientId) where.patientId = query.patientId;
    if (query.clientId) where.clientId = query.clientId;
    if (query.formType) where.formType = query.formType;
    // "Authorized" tab: records that have at least one authorized result sheet.
    if (query.authorized) where.resultSheets = { some: { authorized: true } };

    const [data, total] = await Promise.all([
      this.prisma.record.findMany({
        where,
        select: recordSelect,
        skip,
        take: pageSize,
        // Urgent specimens surface at the top of the overview.
        orderBy: [{ urgent: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.record.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  private async transition(
    id: string,
    userId: string,
    newStatus: RecordStatus,
    notes?: string,
  ) {
    const record = await this.findOne(id);
    const current = record.status as RecordStatus;
    const allowed = ALLOWED_TRANSITIONS[current] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(`Cannot transition from ${current} to ${newStatus}`);
    }

    const updated = await this.prisma.record.update({
      where: { id },
      data: {
        status: newStatus,
        dateStatus: new Date(),
        statusHistory: {
          create: tenantCreate<Prisma.RecordStatusEventUncheckedCreateWithoutRecordInput>({
            status: newStatus,
            userId,
            notes,
          }),
        },
      },
      select: recordSelect,
    });

    // Batch fulfillment: cache the line's fulfilled flag off this record's new
    // status, then recompute the parent requisition's Partial/Completed status.
    await this.syncRequisitionForRecord(id, newStatus);

    // Fire-and-forget lifecycle notifications (never break the transition).
    await this.emitStatusNotifications(id, newStatus, (updated as any).labNumber ?? '');
    return updated;
  }

  /** Lifecycle notifications keyed to the new status. Best-effort. */
  private async emitStatusNotifications(id: string, newStatus: RecordStatus, labNumber: string) {
    const label = labNumber || 'A record';
    if (newStatus === RecordStatus.Resulted) {
      // Authorizers need to act.
      await this.notifs.notifyPermission('resultsheet:authorize', {
        type: NotificationType.AUTHORIZATION_NEEDED,
        title: 'Authorization needed',
        body: `Record ${label} is ready for authorization.`,
        link: `/records/${id}`,
        entityId: id,
        entityType: 'record',
      });
      return;
    }
    if (newStatus === RecordStatus.Approved || newStatus === RecordStatus.Failed) {
      // No createdBy on Record — notify the submitter (earliest status event).
      const first = await this.prisma.recordStatusEvent
        .findFirst({ where: { recordId: id }, orderBy: { createdAt: 'asc' }, select: { userId: true } })
        .catch(() => null);
      if (!first?.userId) return;
      const approved = newStatus === RecordStatus.Approved;
      await this.notifs.notifyUser(first.userId, {
        type: approved ? NotificationType.RECORD_APPROVED : NotificationType.RECORD_FAILED,
        title: approved ? 'Record authorized' : 'Record failed',
        body: approved ? `${label} has been authorized.` : `${label} has been marked as failed.`,
        link: `/records/${id}`,
        entityId: id,
        entityType: 'record',
      });
    }
  }

  /**
   * Reflect a record's new status onto its requisition line(s) and recompute the
   * parent requisition. A line is fulfilled once its record reaches Completed+.
   * A requisition is Completed only when every line is fulfilled, otherwise
   * Partial — so a regression (a fulfilled record dropping back) flips it to
   * Partial again.
   */
  private async syncRequisitionForRecord(recordId: string, newStatus: RecordStatus) {
    const lines = await this.prisma.requisitionLine.findMany({
      where: { recordId },
      select: { requisitionId: true },
    });
    if (!lines.length) return;

    const fulfilled = FULFILLED_STATUSES.includes(newStatus);
    await this.prisma.requisitionLine.updateMany({ where: { recordId }, data: { isCompleted: fulfilled } });

    const requisitionIds = [...new Set(lines.map((l) => l.requisitionId))];
    for (const requisitionId of requisitionIds) {
      const all = await this.prisma.requisitionLine.findMany({
        where: { requisitionId },
        select: { isCompleted: true },
      });
      const ordered = all.length;
      const fulfilledCount = all.filter((l) => l.isCompleted).length;
      if (ordered === 0) continue;
      const status =
        fulfilledCount === ordered ? RequisitionStatus.Completed : RequisitionStatus.Partial;
      await this.prisma.requisition.update({ where: { id: requisitionId }, data: { status } });
    }
  }

  private generateIdentifier() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    return `REC-${date}-${suffix}`;
  }
}
