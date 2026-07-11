// Client mirror of GET /signout/case/:recordId (apps/api signout module).
// Read-only orchestration aggregate; every section carries its own status so the
// workspace hydrates progressively without changing this contract.

export type SectionStatus = 'ready' | 'deferred' | 'forbidden' | 'error' | 'empty';

export interface Section<T> {
  status: SectionStatus;
  data: T | null;
  reason?: string;
}

export interface CaseIdentity {
  id: string;
  identifier: string;
  labNumber: string | null;
  status: string;
  formType: string | null;
  urgent: boolean;
  specimenDate: string | null;
  doctor: string | null;
  specimenTypes: string[];
}

export interface PatientSummary {
  id: string;
  registrationNo: string | null;
  name: string;
  gender: string | null;
  dateOfBirth: string | null;
}

export interface ClinicalContext {
  clinicalDiagnosis: string | null;
  medicalEntry: string | null;
  hasGynFeatures: boolean;
  hasNonGynFeatures: boolean;
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
  slides: Section<null>;
  ai: Section<null>;
  bethesda: Section<null>;
  correlation: Section<null>;
  priors: Section<null>;
  attachments: Section<null>;
  resultSheets: Section<null>;
  timeline: Section<null>;
}

/** Compact patient age from an ISO DOB against a fixed reference (SSR-safe: pass asOf). */
export function ageFrom(dobIso: string | null, asOfIso: string): string | null {
  if (!dobIso) return null;
  const dob = new Date(dobIso);
  const asOf = new Date(asOfIso);
  let years = asOf.getFullYear() - dob.getFullYear();
  const m = asOf.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < dob.getDate())) years -= 1;
  return years >= 0 && years < 200 ? `${years}y` : null;
}
