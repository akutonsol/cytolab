import { Injectable, NotFoundException } from '@nestjs/common';
import { FormCondition, NotificationType, Prisma, TrackingStage } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { NotificationsHelper } from '../notifications/notifications.helper';
import { FileDto, ReceiveFormDto, RejectDto, TrackingQueryDto, VerifyDto } from './dto/req-tracking.dto';

// Ordered pipeline (Rejected is terminal, off to the side).
export const STAGE_ORDER: TrackingStage[] = ['Pending', 'FormReceived', 'BenchReceived', 'Verified', 'Filed'];

const NEXT_ACTION: Partial<Record<TrackingStage, { stage: TrackingStage; label: string; endpoint: string }>> = {
  Pending: { stage: 'FormReceived', label: 'Receive Form', endpoint: 'receive-form' },
  FormReceived: { stage: 'BenchReceived', label: 'Receive at Bench', endpoint: 'receive-bench' },
  BenchReceived: { stage: 'Verified', label: 'Verify', endpoint: 'verify' },
  Verified: { stage: 'Filed', label: 'File', endpoint: 'file' },
};

const trackingSelect = {
  id: true, requisitionId: true, currentStage: true, formCondition: true, formConditionNotes: true,
  formReceivedAt: true, benchReceivedAt: true, verifiedAt: true, verificationNotes: true,
  filedAt: true, fileLocation: true, barcodeScanned: true, barcodeValue: true, createdAt: true, updatedAt: true,
  formReceivedBy: { select: { firstName: true, lastName: true } },
  benchReceivedBy: { select: { firstName: true, lastName: true } },
  verifiedBy: { select: { firstName: true, lastName: true } },
  filedBy: { select: { firstName: true, lastName: true } },
  requisition: {
    select: {
      referenceNo: true, dateReceived: true, createdAt: true,
      client: { select: { officeName: true, firstName: true, lastName: true } },
      lines: { select: { record: { select: { patient: { select: { firstName: true, lastName: true } } } } }, take: 1 },
    },
  },
} satisfies Prisma.RequisitionTrackingSelect;

type TrackingRow = Prisma.RequisitionTrackingGetPayload<{ select: typeof trackingSelect }>;

@Injectable()
export class ReqTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly labContext: LabContext,
    private readonly notifs: NotificationsHelper,
  ) {}

  /** Backfill tracking rows for requisitions created before this feature. */
  private async ensureAll(): Promise<void> {
    const labId = this.labContext.getLabId();
    if (!labId) return;
    const missing = await this.prisma.requisition.findMany({ where: { tracking: null }, select: { id: true } });
    if (missing.length === 0) return;
    await this.prisma.requisitionTracking.createMany({
      data: missing.map((r) => ({ labId, requisitionId: r.id, currentStage: TrackingStage.Pending })),
      skipDuplicates: true,
    });
  }

  /** When did the row enter its current stage (for time-in-stage). */
  private stageEnteredAt(t: TrackingRow): string {
    const map: Partial<Record<TrackingStage, Date | null>> = {
      Pending: t.createdAt,
      FormReceived: t.formReceivedAt,
      BenchReceived: t.benchReceivedAt,
      Verified: t.verifiedAt,
      Filed: t.filedAt,
    };
    return (map[t.currentStage] ?? t.updatedAt).toISOString();
  }

  private toCard(t: TrackingRow) {
    const req = t.requisition;
    const patient = req?.lines[0]?.record?.patient;
    return {
      requisitionId: t.requisitionId,
      referenceNo: req?.referenceNo ?? t.requisitionId.slice(0, 8),
      clientName: req?.client ? (req.client.officeName || `${req.client.firstName} ${req.client.lastName}`.trim()) : '—',
      patientName: patient ? `${patient.firstName} ${patient.lastName}`.trim() : '—',
      currentStage: t.currentStage,
      stageEnteredAt: this.stageEnteredAt(t),
      dateReceived: (req?.dateReceived ?? req?.createdAt ?? t.createdAt).toISOString(),
      fileLocation: t.fileLocation,
      barcodeValue: t.barcodeValue,
    };
  }

  // ── Queries ──────────────────────────────────────────────────────────
  async list(query: TrackingQueryDto) {
    await this.ensureAll();
    const where: Prisma.RequisitionTrackingWhereInput = {
      ...(query.stage && { currentStage: query.stage }),
      ...(query.clientId && { requisition: { clientId: query.clientId } }),
      ...((query.dateFrom || query.dateTo) && {
        requisition: { createdAt: { ...(query.dateFrom && { gte: new Date(query.dateFrom) }), ...(query.dateTo && { lte: new Date(query.dateTo) }) } },
      }),
      ...(query.search && {
        requisition: {
          OR: [
            { referenceNo: { contains: query.search, mode: 'insensitive' } },
            { lines: { some: { record: { patient: { OR: [{ firstName: { contains: query.search, mode: 'insensitive' } }, { lastName: { contains: query.search, mode: 'insensitive' } }] } } } } },
          ],
        },
      }),
    };
    const rows = await this.prisma.requisitionTracking.findMany({ where, select: trackingSelect, orderBy: { updatedAt: 'desc' }, take: 500 });
    return rows.map((t) => this.toCard(t));
  }

  async getByRequisition(requisitionId: string) {
    const tracking = await this.getOrCreate(requisitionId);
    const events = await this.prisma.trackingEvent.findMany({
      where: { requisitionId },
      select: { id: true, stage: true, notes: true, scannedBarcode: true, performedAt: true, performedBy: { select: { firstName: true, lastName: true } } },
      orderBy: { performedAt: 'desc' },
    });
    return { ...this.toCard(tracking), detail: this.detailFields(tracking), events };
  }

  private detailFields(t: TrackingRow) {
    const who = (u: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}`.trim() : null);
    return {
      formCondition: t.formCondition, formConditionNotes: t.formConditionNotes,
      formReceivedAt: t.formReceivedAt?.toISOString() ?? null, formReceivedBy: who(t.formReceivedBy),
      benchReceivedAt: t.benchReceivedAt?.toISOString() ?? null, benchReceivedBy: who(t.benchReceivedBy),
      verifiedAt: t.verifiedAt?.toISOString() ?? null, verifiedBy: who(t.verifiedBy), verificationNotes: t.verificationNotes,
      filedAt: t.filedAt?.toISOString() ?? null, filedBy: who(t.filedBy), fileLocation: t.fileLocation,
      barcodeScanned: t.barcodeScanned, barcodeValue: t.barcodeValue,
    };
  }

  private async getOrCreate(requisitionId: string): Promise<TrackingRow> {
    const existing = await this.prisma.requisitionTracking.findFirst({ where: { requisitionId }, select: trackingSelect });
    if (existing) return existing;
    const req = await this.prisma.requisition.findFirst({ where: { id: requisitionId }, select: { id: true } });
    if (!req) throw new NotFoundException('Requisition not found');
    await this.prisma.requisitionTracking.create({ data: tenantCreate<Prisma.RequisitionTrackingUncheckedCreateInput>({ requisitionId, currentStage: TrackingStage.Pending }) });
    return (await this.prisma.requisitionTracking.findFirst({ where: { requisitionId }, select: trackingSelect }))!;
  }

  // ── Stage transitions ────────────────────────────────────────────────
  private async logEvent(requisitionId: string, stage: TrackingStage, userId: string, notes?: string | null, scannedBarcode?: string | null) {
    await this.prisma.trackingEvent.create({
      data: tenantCreate<Prisma.TrackingEventUncheckedCreateInput>({ requisitionId, stage, performedById: userId, notes: notes ?? null, scannedBarcode: scannedBarcode ?? null }),
    });
  }

  private async advance(requisitionId: string, data: Prisma.RequisitionTrackingUpdateInput, stage: TrackingStage, userId: string, notes?: string | null, barcode?: string | null) {
    await this.getOrCreate(requisitionId);
    const updated = await this.prisma.requisitionTracking.update({ where: { requisitionId }, data: { ...data, currentStage: stage }, select: trackingSelect });
    await this.logEvent(requisitionId, stage, userId, notes, barcode);
    return this.getByRequisition(requisitionId);
  }

  receiveForm(requisitionId: string, userId: string, dto: ReceiveFormDto) {
    return this.advance(requisitionId, {
      formReceivedAt: new Date(), formReceivedBy: { connect: { id: userId } },
      formCondition: dto.formCondition ?? FormCondition.Good, formConditionNotes: dto.formConditionNotes ?? null,
      ...(dto.barcodeValue && { barcodeScanned: true, barcodeValue: dto.barcodeValue }),
    }, TrackingStage.FormReceived, userId, dto.formConditionNotes, dto.barcodeValue);
  }

  receiveBench(requisitionId: string, userId: string) {
    return this.advance(requisitionId, { benchReceivedAt: new Date(), benchReceivedBy: { connect: { id: userId } } }, TrackingStage.BenchReceived, userId);
  }

  verify(requisitionId: string, userId: string, dto: VerifyDto) {
    return this.advance(requisitionId, { verifiedAt: new Date(), verifiedBy: { connect: { id: userId } }, verificationNotes: dto.verificationNotes ?? null }, TrackingStage.Verified, userId, dto.verificationNotes);
  }

  file(requisitionId: string, userId: string, dto: FileDto) {
    return this.advance(requisitionId, { filedAt: new Date(), filedBy: { connect: { id: userId } }, fileLocation: dto.fileLocation }, TrackingStage.Filed, userId, `Filed at ${dto.fileLocation}`);
  }

  async reject(requisitionId: string, userId: string, dto: RejectDto) {
    const res = await this.advance(requisitionId, {}, TrackingStage.Rejected, userId, dto.notes);
    await this.notifs.notifyPermission('system:health', {
      type: NotificationType.SYSTEM_ALERT,
      title: 'Requisition rejected',
      body: `Requisition ${res.referenceNo} rejected: ${dto.notes}`,
      link: '/req-tracking',
      entityId: requisitionId,
      entityType: 'requisition',
    });
    return res;
  }

  // ── Barcode scan lookup ──────────────────────────────────────────────
  async scan(barcodeValue: string) {
    const value = barcodeValue.trim();
    const tracking = await this.prisma.requisitionTracking.findFirst({
      where: { OR: [{ barcodeValue: value }, { requisition: { referenceNo: value } }] },
      select: trackingSelect,
    });
    if (!tracking) return { found: false as const };
    const next = NEXT_ACTION[tracking.currentStage] ?? null;
    return { found: true as const, ...this.toCard(tracking), nextAction: next };
  }

  // ── Stats ────────────────────────────────────────────────────────────
  async stats() {
    await this.ensureAll();
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const byStage = await this.prisma.requisitionTracking.groupBy({ by: ['currentStage'], _count: { _all: true } });
    const count = (s: TrackingStage) => byStage.find((b) => b.currentStage === s)?._count._all ?? 0;
    const [filedToday, timing] = await Promise.all([
      this.prisma.requisitionTracking.count({ where: { currentStage: 'Filed', filedAt: { gte: startOfDay } } }),
      this.prisma.requisitionTracking.findMany({ where: { OR: [{ verifiedAt: { not: null } }, { benchReceivedAt: { not: null } }] }, select: { createdAt: true, benchReceivedAt: true, verifiedAt: true }, take: 500 }),
    ]);
    const avg = (vals: number[]) => (vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null);
    const toBench = timing.filter((t) => t.benchReceivedAt).map((t) => (+new Date(t.benchReceivedAt!) - +new Date(t.createdAt)) / 3_600_000);
    const toVerify = timing.filter((t) => t.verifiedAt).map((t) => (+new Date(t.verifiedAt!) - +new Date(t.createdAt)) / 3_600_000);
    return {
      pendingCount: count('Pending'), formReceivedCount: count('FormReceived'), benchReceivedCount: count('BenchReceived'),
      verifiedCount: count('Verified'), filedCount: count('Filed'), rejectedCount: count('Rejected'),
      filedToday, avgTimeToBench: avg(toBench), avgTimeToVerify: avg(toVerify),
    };
  }
}
