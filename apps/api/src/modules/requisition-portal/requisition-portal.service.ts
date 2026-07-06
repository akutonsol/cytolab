import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BatchStatus,
  DigitalRequisitionForm,
  NotificationType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  RecordStatus,
  RequisitionFormType,
  ScanStatus,
  SpecimenType,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsHelper } from '../notifications/notifications.helper';
import { MailService } from '../portal/mail/mail.service';
import {
  portalCreate,
  tenantCreate,
} from '../../common/tenancy/tenancy.extension';
import { allocateSequence, isUniqueConflict } from '../../common/util/lab-sequence';
import type { PortalPrincipal } from '../portal/common/portal-principal';
import { OcrService } from './ocr.service';
import { ManifestService } from './manifest.service';
import {
  ConfirmPaymentDto,
  CreateBatchDto,
  InitiatePaymentDto,
  InternalBatchQueryDto,
  RejectBatchDto,
  SaveSignatureDto,
  UpdateBatchDto,
  UpdateFormDto,
} from './dto/portal.dto';

/** Processing fee per form, in minor units (J$2,500.00). */
const FEE_PER_FORM_CENTS = 250_000;
const MAX_BATCH_RETRIES = 5;

const VALID_SPECIMEN = new Set(Object.values(SpecimenType) as string[]);

@Injectable()
export class RequisitionPortalService {
  private readonly logger = new Logger(RequisitionPortalService.name);

  constructor(
    private prisma: PrismaService,
    private labContext: LabContext,
    private realtime: RealtimeGateway,
    private notifications: NotificationsHelper,
    private mail: MailService,
    private ocr: OcrService,
    private manifest: ManifestService,
  ) {}

  // ─────────────────────────── Batches (portal) ───────────────────────────

  async createBatch(user: PortalPrincipal, dto: CreateBatchDto) {
    const labId = user.labId;
    for (let attempt = 0; ; attempt++) {
      const batchNumber = await this.allocateBatchNumber(labId);
      try {
        return await this.prisma.requisitionBatch.create({
          data: portalCreate<Prisma.RequisitionBatchUncheckedCreateInput>({
            batchNumber,
            submittedById: user.portalUserId,
            notes: dto.notes,
          }),
        });
      } catch (e) {
        if (isUniqueConflict(e, 'batchNumber') && attempt < MAX_BATCH_RETRIES) continue;
        throw e;
      }
    }
  }

  async listBatches() {
    // Auto-scoped to the portal client + lab by the tenancy extension.
    const batches = await this.prisma.requisitionBatch.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { forms: true } } },
    });
    return batches;
  }

  async getBatch(id: string) {
    const batch = await this.prisma.requisitionBatch.findFirst({
      where: { id },
      include: { forms: { orderBy: { formNumber: 'asc' } } },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    return batch;
  }

  async updateBatch(id: string, dto: UpdateBatchDto) {
    await this.getBatch(id);
    return this.prisma.requisitionBatch.update({
      where: { id },
      data: { notes: dto.notes, paymentMethod: dto.paymentMethod },
    });
  }

  async deleteBatch(id: string) {
    const batch = await this.getBatch(id);
    if (batch.status !== BatchStatus.DRAFT) {
      throw new BadRequestException('Only draft batches can be deleted');
    }
    await this.prisma.requisitionBatch.delete({ where: { id } });
    return { deleted: true };
  }

  // ──────────────────────────── Forms (portal) ────────────────────────────

  async addManualForm(batchId: string) {
    await this.assertDraft(batchId);
    const count = await this.prisma.digitalRequisitionForm.count({ where: { batchId } });
    const form = await this.prisma.digitalRequisitionForm.create({
      data: portalCreate<Prisma.DigitalRequisitionFormUncheckedCreateInput>({
        batchId,
        formNumber: count + 1,
      }),
    });
    await this.recalcTotals(batchId);
    return form;
  }

  async getForm(batchId: string, formId: string) {
    const form = await this.prisma.digitalRequisitionForm.findFirst({
      where: { id: formId, batchId },
    });
    if (!form) throw new NotFoundException('Form not found');
    return form;
  }

  async updateForm(batchId: string, formId: string, dto: UpdateFormDto) {
    await this.getForm(batchId, formId);
    const data: Prisma.DigitalRequisitionFormUncheckedUpdateInput = {
      ...dto,
      patientDob: this.toDate(dto.patientDob),
      specimenDate: this.toDate(dto.specimenDate),
      menopauseDate: this.toDate(dto.menopauseDate),
    };
    return this.prisma.digitalRequisitionForm.update({ where: { id: formId }, data });
  }

  async deleteForm(batchId: string, formId: string) {
    await this.getForm(batchId, formId);
    await this.prisma.digitalRequisitionForm.delete({ where: { id: formId } });
    await this.recalcTotals(batchId);
    return { deleted: true };
  }

  // ───────────────────────────── Signature ─────────────────────────────

  async saveSignature(batchId: string, formId: string, dto: SaveSignatureDto) {
    await this.getForm(batchId, formId);
    if (!dto.signatureDataUrl.startsWith('data:image/')) {
      throw new BadRequestException('Signature must be a base64 image data URL');
    }
    return this.prisma.digitalRequisitionForm.update({
      where: { id: formId },
      data: {
        signatureDataUrl: dto.signatureDataUrl,
        signedByName: dto.signedByName,
        signedAt: new Date(),
      },
    });
  }

  async clearSignature(batchId: string, formId: string) {
    await this.getForm(batchId, formId);
    return this.prisma.digitalRequisitionForm.update({
      where: { id: formId },
      data: { signatureDataUrl: null, signedByName: null, signedAt: null },
    });
  }

  // ──────────────────────────── AI Scanning ────────────────────────────

  async scanUpload(batchId: string, user: PortalPrincipal, files: Express.Multer.File[]) {
    await this.assertDraft(batchId);
    if (!files?.length) throw new BadRequestException('No files uploaded');

    const base = await this.prisma.digitalRequisitionForm.count({ where: { batchId } });
    const created = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const rawScanUrl = await this.storeScan(file);
      const form = await this.prisma.digitalRequisitionForm.create({
        data: portalCreate<Prisma.DigitalRequisitionFormUncheckedCreateInput>({
          batchId,
          formNumber: base + i + 1,
          scanStatus: ScanStatus.PROCESSING,
          rawScanUrl,
        }),
      });
      created.push(form);
      // Fire-and-forget OCR: runs after the response, so re-establish the portal
      // tenancy scope explicitly (the request's AsyncLocalStorage is gone by then).
      this.runOcrJob(user.labId, user.clientId, form.id, file.buffer);
    }
    await this.recalcTotals(batchId);
    return created;
  }

  private runOcrJob(labId: string, clientId: string, formId: string, buffer: Buffer) {
    void this.ocr
      .extractFormData(buffer)
      .then((extracted) =>
        this.labContext.run({ labId, clientId, portal: true }, async () => {
          const lowConfidence = extracted.ocrConfidence < 0.7;
          await this.prisma.digitalRequisitionForm.update({
            where: { id: formId },
            data: {
              scanStatus: lowConfidence ? ScanStatus.NEEDS_REVIEW : ScanStatus.EXTRACTED,
              needsReview: lowConfidence,
              ocrConfidence: extracted.ocrConfidence,
              extractedData: {
                rawText: extracted.rawText ?? '',
                ocrConfidence: extracted.ocrConfidence,
              } satisfies Prisma.InputJsonObject,
              patientName: extracted.patientName,
              patientDob: extracted.patientDob,
              doctorName: extracted.doctorName,
              hospRegNumber: extracted.hospRegNumber,
              specimenDate: extracted.specimenDate,
              specimenType: extracted.specimenType,
              routineCheck: extracted.routineCheck,
              abnormalBleeding: extracted.abnormalBleeding,
              lmp: extracted.lmp,
              clinicalDiagnosis: extracted.clinicalDiagnosis,
              previousCytology: extracted.previousCytology,
              nowPregnant: extracted.nowPregnant,
            },
          });
        }),
      )
      .catch((e) => this.logger.error(`OCR job failed for form ${formId}: ${String(e)}`));
  }

  async scanStatus(batchId: string, formId: string) {
    const form = await this.getForm(batchId, formId);
    return {
      formId: form.id,
      scanStatus: form.scanStatus,
      ocrConfidence: form.ocrConfidence,
      needsReview: form.needsReview,
    };
  }

  async confirmForm(batchId: string, formId: string) {
    await this.getForm(batchId, formId);
    return this.prisma.digitalRequisitionForm.update({
      where: { id: formId },
      data: { scanStatus: ScanStatus.CONFIRMED, needsReview: false },
    });
  }

  // ───────────────────────────── Payment ─────────────────────────────

  async initiatePayment(id: string, dto: InitiatePaymentDto) {
    const batch = await this.getBatch(id);
    await this.prisma.requisitionBatch.update({
      where: { id },
      data: { paymentMethod: dto.paymentMethod, status: BatchStatus.PENDING_PAYMENT },
    });
    if (dto.paymentMethod === PaymentMethod.CARD) {
      // A real integration would create a PowerTranz hosted-page session here.
      return {
        method: dto.paymentMethod,
        redirectUrl: `/portal/requisitions/${id}?pay=card`,
        amountCents: batch.totalAmountCents,
      };
    }
    if (dto.paymentMethod === PaymentMethod.BANK_TRANSFER) {
      return {
        method: dto.paymentMethod,
        bank: { name: 'NCB Jamaica', accountName: 'Cytolabs Associates Ltd.', accountNo: '123-456-789', reference: batch.batchNumber },
      };
    }
    return { method: dto.paymentMethod, payableTo: 'Cytolabs Associates Ltd.', reference: batch.batchNumber };
  }

  async confirmPayment(id: string, dto: ConfirmPaymentDto) {
    await this.getBatch(id);
    return this.prisma.requisitionBatch.update({
      where: { id },
      data: {
        paymentStatus: PaymentStatus.PAID,
        paymentRef: dto.paymentRef,
        paymentPaidAt: new Date(),
        status: BatchStatus.PAID,
      },
    });
  }

  async paymentStatus(id: string) {
    const batch = await this.getBatch(id);
    return {
      paymentMethod: batch.paymentMethod,
      paymentStatus: batch.paymentStatus,
      paymentPaidAt: batch.paymentPaidAt,
      status: batch.status,
    };
  }

  // ───────────────────────────── Submission ─────────────────────────────

  async submitBatch(id: string, user: PortalPrincipal) {
    const batch = await this.getBatch(id);
    if (batch.status === BatchStatus.SUBMITTED || batch.status === BatchStatus.PROCESSING || batch.status === BatchStatus.COMPLETED) {
      throw new BadRequestException('Batch has already been submitted');
    }
    if (batch.forms.length === 0) throw new BadRequestException('Batch has no forms');

    // Every form must be complete + signed.
    for (const f of batch.forms) {
      if (!f.patientName || !f.specimenType || !f.signatureDataUrl) {
        throw new BadRequestException(`Form ${f.formNumber} is missing patient name, specimen type, or signature`);
      }
    }
    // Card payments must be confirmed; cheque/bank transfer settle out of band.
    const needsPrepaid = batch.paymentMethod === PaymentMethod.CARD;
    if (needsPrepaid && batch.paymentStatus !== PaymentStatus.PAID) {
      throw new BadRequestException('Payment must be completed before submitting');
    }
    if (!batch.paymentMethod) throw new BadRequestException('Select a payment method before submitting');

    // Materialize each form into a real Requisition/Record chain. This touches
    // non-client-scoped tenant models (RequisitionLine, GynClinicalFeatures),
    // which the portal scope refuses — so run it lab-scoped (ownership already
    // proven by the client-scoped batch read above).
    const clientId = user.clientId;
    await this.labContext.runLabScoped(user.labId, async () => {
      for (const form of batch.forms) {
        await this.materializeForm(user.labId, clientId, form);
      }
    });

    const submittedAt = new Date();
    const updated = await this.prisma.requisitionBatch.update({
      where: { id },
      data: { status: BatchStatus.SUBMITTED, submittedAt },
      include: { forms: { orderBy: { formNumber: 'asc' } } },
    });

    // Notify staff, email the client, push realtime — all best-effort.
    await this.afterSubmit(updated, user).catch((e) =>
      this.logger.error(`post-submit side effects failed: ${String(e)}`),
    );
    return updated;
  }

  private async materializeForm(labId: string, clientId: string, form: DigitalRequisitionForm) {
    const accession = await this.allocateAccession(labId);
    const { firstName, lastName } = this.splitName(form.patientName ?? '');
    const regNo = await allocateSequence(this.prisma, labId, 'patientRegNo', 10_000_000n);

    const patient = await this.prisma.patient.create({
      data: tenantCreate<Prisma.PatientUncheckedCreateInput>({
        registrationNo: String(regNo),
        firstName,
        lastName,
        dateOfBirth: form.patientDob ?? undefined,
        clientId,
      }),
    });

    const requisition = await this.prisma.requisition.create({
      data: tenantCreate<Prisma.RequisitionUncheckedCreateInput>({
        referenceNo: accession,
        amount: FEE_PER_FORM_CENTS,
        clientId,
      }),
    });

    const specimenType: SpecimenType = VALID_SPECIMEN.has(form.specimenType ?? '')
      ? (form.specimenType as SpecimenType)
      : SpecimenType.CERV_SCRAP;

    const record = await this.prisma.record.create({
      data: tenantCreate<Prisma.RecordUncheckedCreateInput>({
        identifier: `REC-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`,
        formType: RequisitionFormType.Gynecology,
        status: RecordStatus.Pending,
        patientId: patient.id,
        clientId,
        doctor: form.doctorName ?? undefined,
        clinicalDiagnosis: form.clinicalDiagnosis ?? undefined,
        specimenDate: form.specimenDate ?? undefined,
        gynFeatures: {
          create: tenantCreate<Prisma.GynClinicalFeaturesUncheckedCreateWithoutRecordInput>({
            routineCheck: form.routineCheck ?? false,
            previousCytology: form.previousCytology ?? false,
            lmp: this.toDate(form.lmp ?? undefined),
            clinicalAppearanceOfCervix: form.clinicalAppearance ?? undefined,
            nowPregnant: form.nowPregnant ?? false,
            pregnancies: form.noPregnancies ? Number(form.noPregnancies) || undefined : undefined,
            lengthOfCycle: form.lengthOfCycle ?? undefined,
            pelvicAbnormalities: form.pelvicAbnormalities ?? undefined,
            dateOfMenopause: form.menopauseDate ?? undefined,
          }),
        },
        specimens: {
          create: [
            tenantCreate<Prisma.SpecimenUncheckedCreateWithoutRecordInput>({
              type: specimenType,
              clientId,
              dateReceived: form.specimenDate ?? undefined,
            }),
          ],
        },
      }),
    });

    await this.prisma.requisitionLine.create({
      data: tenantCreate<Prisma.RequisitionLineUncheckedCreateInput>({
        requisitionId: requisition.id,
        recordId: record.id,
        formType: RequisitionFormType.Gynecology,
        amount: FEE_PER_FORM_CENTS,
      }),
    });

    await this.prisma.digitalRequisitionForm.update({
      where: { id: form.id },
      data: { accessionNumber: accession, requisitionId: requisition.id },
    });
  }

  private async afterSubmit(
    batch: Prisma.RequisitionBatchGetPayload<{ include: { forms: true } }>,
    user: PortalPrincipal,
  ) {
    const client = await this.labContext.runLabScoped(user.labId, () =>
      this.prisma.client.findFirst({
        where: { id: user.clientId },
        select: { firstName: true, lastName: true, officeName: true },
      }),
    );
    const clientName =
      client?.officeName?.trim() ||
      [client?.firstName, client?.lastName].filter(Boolean).join(' ').trim() ||
      'a client';

    this.realtime.emitToSuperusers('batch:submitted', {
      type: 'batch:submitted',
      data: {
        batchNumber: batch.batchNumber,
        clientName,
        formCount: batch.totalForms,
        paymentMethod: batch.paymentMethod,
      },
    });

    await this.notifications.notifyPermission('requisition:view', {
      type: NotificationType.SYSTEM_ALERT,
      title: `New batch ${batch.batchNumber}`,
      body: `${batch.totalForms} requisitions from ${clientName} — payment: ${batch.paymentMethod ?? '—'}`,
      link: '/requisitions',
      entityId: batch.id,
      entityType: 'RequisitionBatch',
    });

    await this.mail.send(
      user.email,
      `Batch ${batch.batchNumber} Received — Cytolab`,
      `<p>Your batch of <strong>${batch.totalForms}</strong> requisitions has been received by Cytolab.</p>
       <p>Batch reference: <strong>${batch.batchNumber}</strong><br/>Payment: ${batch.paymentMethod ?? '—'}</p>`,
    );
  }

  // ───────────────────────────── Manifest ─────────────────────────────

  async getManifest(id: string): Promise<Buffer> {
    const batch = await this.getBatch(id);
    return this.manifest.render({
      batchNumber: batch.batchNumber,
      submittedAt: batch.submittedAt,
      totalForms: batch.totalForms,
      paymentMethod: batch.paymentMethod,
      paymentStatus: batch.paymentStatus,
      forms: batch.forms.map((f) => ({
        patientName: f.patientName,
        patientDob: f.patientDob,
        specimenType: f.specimenType,
        accessionNumber: f.accessionNumber,
        doctorName: f.doctorName,
      })),
    });
  }

  // ─────────────────────────── Internal (staff) ───────────────────────────

  async internalList(query: InternalBatchQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Prisma.RequisitionBatchWhereInput = query.status
      ? { status: query.status as BatchStatus }
      : {};
    const [data, total] = await Promise.all([
      this.prisma.requisitionBatch.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { forms: true } } },
      }),
      this.prisma.requisitionBatch.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  async internalProcess(id: string) {
    await this.getInternalBatch(id);
    return this.prisma.requisitionBatch.update({ where: { id }, data: { status: BatchStatus.PROCESSING } });
  }

  async internalComplete(id: string) {
    await this.getInternalBatch(id);
    return this.prisma.requisitionBatch.update({ where: { id }, data: { status: BatchStatus.COMPLETED } });
  }

  async internalReject(id: string, dto: RejectBatchDto) {
    const batch = await this.getInternalBatch(id);
    return this.prisma.requisitionBatch.update({
      where: { id },
      data: {
        status: BatchStatus.REJECTED,
        notes: [batch.notes, `Rejected: ${dto.reason}`].filter(Boolean).join('\n'),
      },
    });
  }

  async internalConfirmPayment(id: string, dto: ConfirmPaymentDto) {
    await this.getInternalBatch(id);
    return this.confirmPayment(id, dto);
  }

  // ───────────────────────────── Helpers ─────────────────────────────

  private async getInternalBatch(id: string) {
    const batch = await this.prisma.requisitionBatch.findFirst({ where: { id } });
    if (!batch) throw new NotFoundException('Batch not found');
    return batch;
  }

  private async assertDraft(batchId: string) {
    const batch = await this.getBatch(batchId);
    if (batch.status !== BatchStatus.DRAFT && batch.status !== BatchStatus.PENDING_PAYMENT) {
      throw new ForbiddenException('Batch is no longer editable');
    }
    return batch;
  }

  private async recalcTotals(batchId: string) {
    const totalForms = await this.prisma.digitalRequisitionForm.count({ where: { batchId } });
    await this.prisma.requisitionBatch.update({
      where: { id: batchId },
      data: { totalForms, totalAmountCents: totalForms * FEE_PER_FORM_CENTS },
    });
  }

  private async allocateBatchNumber(labId: string): Promise<string> {
    const year = new Date().getFullYear();
    const seq = await allocateSequence(this.prisma, labId, `requisitionBatch:${year}`, 0n);
    return `BATCH-${year}-${seq.toString().padStart(4, '0')}`;
  }

  private async allocateAccession(labId: string): Promise<string> {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const seq = await allocateSequence(this.prisma, labId, `drpAccession:${yy}-${mm}`, 0n);
    return `DM${yy}-${mm}-${seq.toString().padStart(3, '0')}`;
  }

  private splitName(name: string): { firstName: string; lastName: string } {
    const trimmed = name.trim();
    if (trimmed.includes(',')) {
      const [last, ...rest] = trimmed.split(',');
      return { lastName: last.trim() || trimmed, firstName: rest.join(' ').trim() || '—' };
    }
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) return { lastName: parts[0], firstName: parts.slice(1).join(' ') };
    return { lastName: trimmed || '—', firstName: '—' };
  }

  private toDate(v?: string | null): Date | undefined {
    if (!v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  private async storeScan(file: Express.Multer.File): Promise<string> {
    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const bucket = process.env.STORAGE_BUCKET;
    if (bucket) {
      const { Storage } = await import('@google-cloud/storage');
      await new Storage()
        .bucket(bucket)
        .file(`requisition-scans/${safeName}`)
        .save(file.buffer, { contentType: file.mimetype, resumable: false });
      return `https://storage.googleapis.com/${bucket}/requisition-scans/${safeName}`;
    }
    const path = join(tmpdir(), safeName);
    await fs.writeFile(path, file.buffer);
    return `file://${path}`;
  }
}
