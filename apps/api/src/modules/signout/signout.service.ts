import { Injectable, NotFoundException } from '@nestjs/common';
import { RecordsService } from '../records/records.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';

// ── Sign-Out aggregate (orchestration only) ──────────────────────────────────
// Composes EXISTING services around one anchor (recordId). It owns no domain logic
// and no persistence: reads come from records.service.findOne (B2 hydrates case,
// patient, and clinical context from that single existing call). Every section
// carries its own status so later checkpoints can hydrate progressively WITHOUT
// changing this contract, and a failure in one section never fails the others.
// Contract: docs/PATHOS_SIGNOUT_IMPLEMENTATION_PLAN.md (Orchestration Rule, §3).

export type SectionStatus = 'ready' | 'deferred' | 'forbidden' | 'error' | 'empty';
export interface Section<T> {
  status: SectionStatus;
  data: T | null;
  reason?: string;
}

export interface Referral {
  doctor: string | null;
  clientName: string | null;
  clientType: string | null;
  accountNo: string | null;
}

export interface SpecimenDetail {
  type: string | null;
  label: string | null;
  vialColour: string | null;
  bloodGroup: string | null;
  receivedAt: string | null;
}

export interface CaseIdentity {
  id: string;
  identifier: string;
  labNumber: string | null;
  status: string;
  statusChangedAt: string | null;
  formType: string | null;
  urgent: boolean;
  specimenDate: string | null;
  receivedAt: string | null;
  referral: Referral | null;
  specimens: SpecimenDetail[];
}

export interface PatientSummary {
  id: string;
  registrationNo: string | null;
  name: string;
  gender: string | null;
  dateOfBirth: string | null;
}

export interface Therapy {
  hormone: boolean;
  radiation: boolean;
  surgical: boolean;
  other: string | null;
}

export interface GynHistory {
  routineCheck: boolean;
  previousCytology: boolean;
  lmp: string | null;
  pregnant: boolean;
  pregnancies: number | null;
  menopause: boolean;
  dateOfMenopause: string | null;
  cervixAppearance: string | null;
  pelvicAbnormalities: string | null;
  leucorrhea: string | null;
  lengthOfCycle: string | null;
}

export interface NonGynHistory {
  sampleDescription: string | null;
  natureAndSource: string | null;
}

export interface ClinicalContext {
  reason: string | null;
  note: string | null;
  therapy: Therapy | null;
  gyn: GynHistory | null;
  nonGyn: NonGynHistory | null;
}

export interface EffectivePermissions {
  viewCase: boolean;
  viewSlide: boolean;
  viewAI: boolean;
  viewAttachments: boolean;
  viewAudit: boolean;
  viewBethesda: boolean;
  viewPriors: boolean;
  editResultSheet: boolean;
  authorize: boolean;
  amend: boolean;
}

export interface SignOutCaseAggregate {
  recordId: string;
  asOf: string;
  case: Section<CaseIdentity>;
  patient: Section<PatientSummary>;
  clinicalContext: Section<ClinicalContext>;
  permissions: Section<EffectivePermissions>;
  // Deferred until later checkpoints (B3+). The contract is stable now.
  slides: Section<null>;
  ai: Section<null>;
  bethesda: Section<null>;
  correlation: Section<null>;
  priors: Section<null>;
  attachments: Section<null>;
  resultSheets: Section<null>;
  timeline: Section<null>;
}

const deferred = (): Section<null> => ({ status: 'deferred', data: null });

@Injectable()
export class SignoutService {
  constructor(private readonly records: RecordsService) {}

  async caseAggregate(recordId: string, user: AuthUser): Promise<SignOutCaseAggregate> {
    const asOf = new Date().toISOString();

    // Permissions resolve independently of the case load, so they survive a
    // downstream failure (partial-failure tolerance).
    const permissions: Section<EffectivePermissions> = {
      status: 'ready',
      data: buildPermissions(user),
    };

    let caseSec: Section<CaseIdentity>;
    let patientSec: Section<PatientSummary>;
    let clinicalSec: Section<ClinicalContext>;

    try {
      // Reuse the existing record read — no duplicated query, tenancy is enforced
      // by the injected Prisma client (a case in another lab resolves to null).
      const rec: any = await this.records.findOne(recordId);
      if (!rec) throw new NotFoundException('Case not found');
      caseSec = { status: 'ready', data: pickCase(rec) };
      patientSec = rec.patient
        ? { status: 'ready', data: pickPatient(rec.patient) }
        : { status: 'empty', data: null, reason: 'No patient linked' };
      clinicalSec = { status: 'ready', data: pickClinical(rec) };
    } catch (err) {
      if (err instanceof NotFoundException) throw err; // no case at all → 404, not a partial failure
      // A real downstream failure: mark only the case-derived sections unavailable;
      // the aggregate still returns permissions and the deferred sections.
      const reason = 'Case failed to load';
      caseSec = { status: 'error', data: null, reason };
      patientSec = { status: 'error', data: null, reason };
      clinicalSec = { status: 'error', data: null, reason };
    }

    return {
      recordId,
      asOf,
      case: caseSec,
      patient: patientSec,
      clinicalContext: clinicalSec,
      permissions,
      slides: deferred(),
      ai: deferred(),
      bethesda: deferred(),
      correlation: deferred(),
      priors: deferred(),
      attachments: deferred(),
      resultSheets: deferred(),
      timeline: deferred(),
    };
  }
}

function buildPermissions(user: AuthUser): EffectivePermissions {
  const has = (code: string) => !!user.isSuperRole || user.permissions.includes(code);
  return {
    viewCase: has('record:view'),
    viewSlide: has('record:view'),
    viewAI: has('record:view'),
    viewAttachments: has('record:view'),
    viewAudit: has('record:view'),
    viewBethesda: has('resultentry:view'),
    viewPriors: has('resultentry:view'),
    editResultSheet: has('resultentry:change'),
    authorize: has('resultsheet:authorize'),
    amend: has('resultentry:change') && has('resultsheet:authorize'),
  };
}

const iso = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString() : null);

function pickCase(rec: any): CaseIdentity {
  return {
    id: rec.id,
    identifier: rec.identifier,
    labNumber: rec.labNumber ?? null,
    status: rec.status,
    statusChangedAt: iso(rec.dateStatus),
    formType: rec.formType ?? null,
    urgent: !!rec.urgent,
    specimenDate: iso(rec.specimenDate),
    receivedAt: iso(rec.createdAt),
    referral: pickReferral(rec),
    specimens: pickSpecimens(rec),
  };
}

function pickReferral(rec: any): Referral | null {
  const c = rec.client;
  const clientName = c ? (c.officeName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || null) : null;
  if (!rec.doctor && !clientName) return null;
  return {
    doctor: rec.doctor ?? null,
    clientName,
    clientType: c?.clientType?.type ?? null,
    accountNo: c?.accountNo ?? null,
  };
}

function pickSpecimens(rec: any): SpecimenDetail[] {
  if (!Array.isArray(rec.specimens)) return [];
  return rec.specimens.map((s: any) => ({
    type: s.type ?? null,
    label: s.label ?? null,
    vialColour: s.vialColour ?? null,
    bloodGroup: s.bloodGroup ?? null,
    receivedAt: iso(s.dateReceived),
  }));
}

function pickPatient(p: any): PatientSummary {
  return {
    id: p.id,
    registrationNo: p.registrationNo ?? null,
    name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'Unknown patient',
    gender: p.gender ?? null,
    dateOfBirth: iso(p.dateOfBirth),
  };
}

function pickClinical(rec: any): ClinicalContext {
  return {
    reason: rec.clinicalDiagnosis ?? null,
    note: rec.medicalEntry ?? null,
    therapy: rec.therapy
      ? {
          hormone: !!rec.therapy.hormone,
          radiation: !!rec.therapy.radiation,
          surgical: !!rec.therapy.surgical,
          other: rec.therapy.other ?? null,
        }
      : null,
    gyn: rec.gynFeatures
      ? {
          routineCheck: !!rec.gynFeatures.routineCheck,
          previousCytology: !!rec.gynFeatures.previousCytology,
          lmp: iso(rec.gynFeatures.lmp),
          pregnant: !!rec.gynFeatures.nowPregnant,
          pregnancies: rec.gynFeatures.pregnancies ?? null,
          menopause: !!rec.gynFeatures.menopause,
          dateOfMenopause: iso(rec.gynFeatures.dateOfMenopause),
          cervixAppearance: rec.gynFeatures.clinicalAppearanceOfCervix ?? null,
          pelvicAbnormalities: rec.gynFeatures.pelvicAbnormalities ?? null,
          leucorrhea: rec.gynFeatures.leucorrhea ?? null,
          lengthOfCycle: rec.gynFeatures.lengthOfCycle ?? null,
        }
      : null,
    nonGyn: rec.nonGynFeatures
      ? {
          sampleDescription: rec.nonGynFeatures.sampleDescription ?? null,
          natureAndSource: rec.nonGynFeatures.natureAndSource ?? null,
        }
      : null,
  };
}
