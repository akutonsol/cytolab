// Client mirror of GET /signout/case/:recordId (apps/api signout module).
// Read-only orchestration aggregate; every section carries its own status so the
// workspace hydrates progressively without changing this contract. Patient age is
// derived with the canonical helper (@/lib/age deriveAge), never recomputed here.

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

export interface SlideMeta {
  id: string;
  format: string | null;
  magnification: string | null;
  stain: string | null;
  scanner: string | null;
  fileSizeBytes: number | null;
  uploadedAt: string | null;
  viewerPath: string;
}

export interface SlidesSection {
  count: number;
  items: SlideMeta[];
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
  slides: Section<SlidesSection>;
  ai: Section<null>;
  bethesda: Section<null>;
  correlation: Section<null>;
  priors: Section<null>;
  attachments: Section<null>;
  resultSheets: Section<null>;
  timeline: Section<null>;
}
