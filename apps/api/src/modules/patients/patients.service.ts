import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RecordStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { CreatePatientDto, PatientQueryDto, UpdatePatientDto } from './dto/patient.dto';
import { allocateSequence, isUniqueConflict } from '../../common/util/lab-sequence';
import { computeIdentityKey } from '../../common/util/patient-identity';
import { AuditRecorder } from '../audit/audit-recorder.service';

// The registration-number counter (LabSequence "patientRegNo") starts here for a
// lab with no migration seed, so the first generated number is REG_BASE + 1
// (an 8-digit, legacy-style value). Migration seeds it to max(numeric imported).
const REG_SEQUENCE = 'patientRegNo';
const REG_BASE = 10_000_000n;
const REG_PAD = 8;
const MAX_REGNO_RETRIES = 5;

const DAY_MS = 86_400_000;
// Records that are still "in flight" (open) — before final Approved sign-off.
const OPEN: RecordStatus[] = [
  RecordStatus.Pending, RecordStatus.Submitted, RecordStatus.Processing, RecordStatus.Partial,
  RecordStatus.Completed, RecordStatus.Resulted,
];
const APPROVED_PLUS: RecordStatus[] = [RecordStatus.Approved, RecordStatus.Billed, RecordStatus.Paid];
// Lifecycle stage label + progress for the records-table "Stage" column.
const STAGE: Partial<Record<RecordStatus, { label: string; pct: number }>> = {
  [RecordStatus.Pending]: { label: 'Intake', pct: 10 },
  [RecordStatus.Submitted]: { label: 'Intake', pct: 25 },
  [RecordStatus.Processing]: { label: 'Processing', pct: 50 },
  [RecordStatus.Partial]: { label: 'Processing', pct: 62 },
  [RecordStatus.Completed]: { label: 'Review', pct: 78 },
  [RecordStatus.Resulted]: { label: 'Review', pct: 90 },
  [RecordStatus.Approved]: { label: 'Complete', pct: 100 },
  [RecordStatus.Billed]: { label: 'Complete', pct: 100 },
  [RecordStatus.Paid]: { label: 'Complete', pct: 100 },
};
const firstAt = (events: { status: RecordStatus; createdAt: Date }[], status: RecordStatus): Date | null => {
  const hit = events.filter((e) => e.status === status).map((e) => +new Date(e.createdAt)).sort((a, b) => a - b)[0];
  return hit ? new Date(hit) : null;
};

const patientSelect = {
  id: true,
  registrationNo: true,
  firstName: true,
  lastName: true,
  middleName: true,
  phoneNumber: true,
  bloodGroup: true,
  gender: true,
  height: true,
  weight: true,
  email: true,
  dateOfBirth: true,
  identityToken: true,
  motherMaidenName: true,
  avatarUrl: true,
  clientId: true,
  client: { select: { id: true, firstName: true, lastName: true, officeName: true, email: true } },
  addresses: {
    select: {
      id: true,
      label: true,
      line1: true,
      line2: true,
      city: true,
      region: true,
      postalCode: true,
      country: true,
    },
  },
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PatientsService {
  constructor(
    private prisma: PrismaService,
    private labContext: LabContext,
    private audit: AuditRecorder,
  ) {}

  // Every query below is automatically scoped to the caller's lab by the Prisma
  // tenancy extension (labId injected from the request's JWT context).
  async findAll(query: PatientQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where = this.buildWhere(query);
    const [data, total] = await Promise.all([
      this.prisma.patient.findMany({ where, select: patientSelect, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.patient.count({ where }),
    ]);
    const result = paginate(data, total, page, pageSize);
    // Enterprise audit (P2-5D): successful aggregate PHI list read (patientRef null, one per
    // action+surface+execution). resultCount = PHI-bearing items returned; emit only if > 0.
    await this.audit.recordPhiList({
      accessSurface: 'list',
      producerModule: 'patients',
      resultCount: result.data.length,
      pageSize: result.pageSize,
      resourceType: 'PatientList',
    });
    return result;
  }

  async findByClient(clientId: string, query: PatientQueryDto) {
    return this.findAll({ ...query, clientId });
  }

  async search(query: PatientQueryDto) {
    return this.findAll(query);
  }

  async findOne(id: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id }, select: patientSelect });
    if (!patient) throw new NotFoundException('Patient not found');
    // Enterprise audit (P2-5C): successful single-subject PHI read. Emitted AFTER authorization,
    // tenancy scoping, and the successful query — best-effort, never breaks the read.
    await this.audit.recordPhiRead({
      patientId: patient.id,
      accessSurface: 'patient_detail',
      accessMode: 'view',
      producerModule: 'patients',
      resource: { type: 'Patient', id: patient.id },
    });
    return patient;
  }

  private addressCreate(addresses?: { line1: string }[]) {
    if (!addresses?.length) return undefined;
    return {
      create: addresses.map((a) =>
        tenantCreate<Prisma.PatientAddressUncheckedCreateWithoutPatientInput>({ ...a }),
      ),
    };
  }

  async create(dto: CreatePatientDto) {
    return this.findOrCreate(dto);
  }

  /**
   * De-duplicating patient creation — the single entry point for minting a
   * patient (used by the manual create endpoint and the requisition portal).
   * One real-world patient must map to one row that many records hang off, so we
   * reuse an existing patient with a matching identity fingerprint instead of
   * creating a duplicate. See {@link computeIdentityKey} for the match rule.
   *
   * When a match is found we return the existing patient AS-IS (non-destructive —
   * we never overwrite stored PHI with a fresh, possibly-thinner submission).
   */
  async findOrCreate(dto: CreatePatientDto) {
    const { addresses, ...rest } = dto;
    const identityKey = computeIdentityKey(rest);

    // Fast path: an existing patient already carries this identity.
    if (identityKey) {
      const existing = await this.prisma.patient.findFirst({
        where: { identityKey },
        select: patientSelect,
      });
      if (existing) return existing;
    }

    // Normally the atomic allocator never collides. The unique-constraint
    // backstop covers the rare case where a generated number equals an imported
    // legacy one (e.g. a mis-seeded counter): re-allocate and retry.
    for (let attempt = 0; ; attempt++) {
      const registrationNo = await this.allocateRegNo();
      try {
        return await this.prisma.patient.create({
          data: tenantCreate<Prisma.PatientUncheckedCreateInput>({
            registrationNo,
            identityKey,
            ...rest,
            addresses: this.addressCreate(addresses),
          }),
          select: patientSelect,
        });
      } catch (e) {
        // Race: a concurrent request created the same identity between our
        // lookup and this insert — reuse the winner instead of duplicating.
        if (identityKey && isUniqueConflict(e, 'identityKey')) {
          const existing = await this.prisma.patient.findFirst({
            where: { identityKey },
            select: patientSelect,
          });
          if (existing) return existing;
        }
        if (isUniqueConflict(e, 'registrationNo') && attempt < MAX_REGNO_RETRIES) continue;
        if (isUniqueConflict(e, 'registrationNo')) {
          throw new ConflictException('Could not allocate a unique registration number; please retry');
        }
        throw e;
      }
    }
  }

  /** Allocate the next registration number for the current lab (atomic, seeded). */
  private async allocateRegNo(): Promise<string> {
    const labId = this.labContext.getLabId();
    if (!labId) {
      throw new Error('Cannot allocate a registration number with no lab context');
    }
    const value = await allocateSequence(this.prisma, labId, REG_SEQUENCE, REG_BASE);
    return value.toString().padStart(REG_PAD, '0');
  }

  async update(id: string, dto: UpdatePatientDto) {
    await this.findOne(id);
    const { addresses, ...rest } = dto;
    const data: Prisma.PatientUncheckedUpdateInput = { ...rest };
    // When addresses are supplied, replace the whole set.
    if (addresses !== undefined) {
      data.addresses = { deleteMany: {}, ...this.addressCreate(addresses) };
    }
    return this.prisma.patient.update({ where: { id }, data, select: patientSelect });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.patient.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * "Today at a glance" daily-queue overview for /patients: today's requisitions,
   * a featured open case, KPIs, alert counts and today's records table. Lab-scoped.
   */
  async overview(userId?: string) {
    const now = new Date();
    const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
    const win30 = new Date(now.getTime() - 30 * DAY_MS);

    // Greeting name resolved from the authenticated user's record (lab-scoped).
    const me = userId ? await this.prisma.user.findFirst({ where: { id: userId }, select: { firstName: true } }) : null;
    const firstName = me?.firstName?.trim() || 'there';

    const typeLabel = (ft: string | null) => (ft === 'Gynecology' ? 'Gyn' : ft === 'NonGynecology' ? 'Non-Gyn' : 'Record');
    const pname = (r: any) => `${r.patient.firstName} ${r.patient.lastName}`.trim();
    const cname = (r: any) => r.client?.officeName || `${r.client?.firstName ?? ''} ${r.client?.lastName ?? ''}`.trim() || null;

    // Today's records (created today), urgent first then oldest.
    const todays = await this.prisma.record.findMany({
      where: { createdAt: { gte: startToday } },
      orderBy: [{ urgent: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true, patientId: true, labNumber: true, status: true, urgent: true, formType: true,
        clinicalDiagnosis: true, specimenDate: true, createdAt: true,
        patient: { select: { firstName: true, lastName: true } },
        client: { select: { officeName: true, firstName: true, lastName: true } },
        specimens: { select: { type: true, label: true } },
      },
    });
    const openToday = todays.filter((r) => OPEN.includes(r.status));
    // Feature the top open case, preferring one with a proper Gyn/Non-Gyn form type.
    const fr = openToday.find((r) => r.formType) ?? openToday[0];

    const featured = fr
      ? {
          id: fr.id, labNumber: fr.labNumber, urgent: fr.urgent,
          patient: pname(fr), formType: typeLabel(fr.formType), client: cname(fr),
          specimenLabel: fr.specimens[0]?.label || fr.specimens[0]?.type || 'Specimen',
          status: fr.status,
          collectedAt: fr.specimenDate ?? fr.createdAt,
        }
      : null;

    const queue = openToday.map((r) => ({
      id: r.id, patient: pname(r), diagnosis: r.clinicalDiagnosis || r.specimens[0]?.type || null,
      type: typeLabel(r.formType), at: r.specimenDate ?? r.createdAt,
    }));

    const records = todays.map((r) => ({
      id: r.id, patientId: r.patientId, labNumber: r.labNumber, patient: pname(r), specimenType: r.specimens[0]?.type ?? null,
      status: r.status, urgent: r.urgent, receivedAt: r.specimenDate ?? r.createdAt,
      stage: STAGE[r.status] ?? { label: '—', pct: 0 },
    }));

    // KPIs + alert counts (lab-wide where it makes sense).
    const [pendingRequisitions, awaitingProcessing, notifications, authorizedToday, recent, attentionRec] = await Promise.all([
      this.prisma.record.count({ where: { status: RecordStatus.Pending } }),
      this.prisma.record.count({ where: { status: RecordStatus.Submitted } }),
      this.prisma.recordStatusEvent.count({ where: { createdAt: { gte: startToday } } }),
      this.prisma.recordStatusEvent.count({ where: { status: RecordStatus.Approved, createdAt: { gte: startToday } } }),
      this.prisma.record.findMany({
        where: { statusHistory: { some: { status: RecordStatus.Approved, createdAt: { gte: win30 } } } },
        select: { statusHistory: { select: { status: true, createdAt: true } } },
      }),
      this.prisma.record.findFirst({
        where: { urgent: true, status: { in: OPEN } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, labNumber: true, formType: true, clinicalDiagnosis: true,
          patient: { select: { firstName: true, lastName: true } },
          statusHistory: { select: { user: { select: { firstName: true, lastName: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: 6 },
        },
      }),
    ]);

    let tatSum = 0, tatN = 0;
    for (const r of recent) {
      const a = firstAt(r.statusHistory as any, RecordStatus.Approved);
      const s = firstAt(r.statusHistory as any, RecordStatus.Submitted);
      if (a && s) { tatSum += (+a - +s) / DAY_MS; tatN += 1; }
    }
    const avgTat = tatN ? Math.round((tatSum / tatN) * 10) / 10 : 0;

    let attention = null as any;
    if (attentionRec) {
      const seen = new Set<string>();
      const assignees: { name: string }[] = [];
      for (const e of attentionRec.statusHistory) {
        const u = e.user; if (!u) continue;
        const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || '';
        if (name && !seen.has(name)) { seen.add(name); assignees.push({ name }); }
      }
      attention = {
        id: attentionRec.id, labNumber: attentionRec.labNumber,
        patient: `${attentionRec.patient.firstName} ${attentionRec.patient.lastName}`.trim(),
        formType: typeLabel(attentionRec.formType),
        text: attentionRec.clinicalDiagnosis || `Urgent case ${attentionRec.labNumber ?? ''} is still open and needs review.`,
        assignees: assignees.slice(0, 4),
      };
    }

    return {
      greeting: { firstName },
      today: { dateISO: now.toISOString(), requisitionsToday: todays.length },
      featured,
      queue,
      kpis: { pendingRequisitions, awaitingProcessing, avgTat },
      alerts: { attention, notifications, authorizedToday },
      records,
    };
  }

  private buildWhere(query: PatientQueryDto) {
    const where: any = {};
    if (query.clientId) where.clientId = query.clientId;
    if (query.q) {
      const q = query.q;
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { registrationNo: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phoneNumber: { contains: q, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  /**
   * Prior cytology history for a patient — every record with its specimen(s),
   * result-sheet narrative (when authorized), and coded findings — so a reporter
   * can weigh a new result against past diagnoses without leaving the workflow.
   * Lab-scoped: the patient is fetched in the current lab, so its records are too.
   */
  async getHistory(patientId: string, excludeRecordId?: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId },
      select: {
        id: true, firstName: true, middleName: true, lastName: true, dateOfBirth: true,
        records: {
          where: excludeRecordId ? { id: { not: excludeRecordId } } : undefined,
          orderBy: [{ specimenDate: 'desc' }, { createdAt: 'desc' }],
          select: {
            id: true, identifier: true, labNumber: true, formType: true, doctor: true,
            clinicalDiagnosis: true, specimenDate: true, status: true, createdAt: true,
            specimens: { select: { type: true, label: true } },
            requisitionLines: { select: { requisitionId: true }, take: 1 },
            resultSheets: {
              orderBy: { createdAt: 'desc' }, take: 1,
              select: {
                authorized: true, authorizedAt: true, narrative: true,
                resultEntries: { select: { resultLines: { select: { abbreviation: true, abnormalFinding: true } } } },
              },
            },
          },
        },
      },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
    const records = patient.records.map((r) => {
      const sheet = r.resultSheets[0] ?? null;
      const lines = (sheet?.resultEntries ?? []).flatMap((e) => e.resultLines);
      return {
        id: r.id,
        recordNumber: r.identifier,
        labNumber: r.labNumber,
        formType: r.formType,
        specimenDate: r.specimenDate,
        specimenType: uniq((r.specimens ?? []).map((s) => s.label || s.type)).join(', ') || null,
        requisitionId: r.requisitionLines[0]?.requisitionId ?? null,
        doctorName: r.doctor,
        clinicalDiagnosis: r.clinicalDiagnosis,
        status: r.status,
        authorized: sheet?.authorized ?? false,
        authorizedAt: sheet?.authorizedAt ?? null,
        narrative: sheet?.authorized ? (sheet.narrative ?? null) : null,
        findings: uniq(lines.map((l) => l.abbreviation)),
        abnormalFindings: uniq(lines.filter((l) => l.abnormalFinding).map((l) => l.abbreviation)),
        createdAt: r.createdAt,
      };
    });

    return {
      patientId: patient.id,
      patientName: [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' '),
      patientDob: patient.dateOfBirth,
      totalRecords: records.length,
      records,
    };
  }
}
