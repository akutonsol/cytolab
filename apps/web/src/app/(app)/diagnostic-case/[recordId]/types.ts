// Diagnostic Case Workspace — client mirror of the FROZEN aggregate contract
// (GET /diagnostic-case/:recordId/overview). Kept in lock-step with the API service types
// (apps/api/src/modules/diagnostic-case/diagnostic-case.service.ts). A2: the five-state section
// contract, the descriptive permission map, and the nine-band envelope. Clinical band field types
// are NOT added yet — every band stays Section<null> until it hydrates in A3+.
// Contract: docs/PATHOS_DIAGNOSTIC_CASE_IMPLEMENTATION_PLAN.md (A2; §3, §6, §7).

export type SectionStatus = 'ready' | 'empty' | 'forbidden' | 'error' | 'deferred';

export interface Section<T> {
  status: SectionStatus;
  data: T | null;
  reason?: string;
}

export interface UnavailableSource {
  key: string;
  label: string;
  reason?: string;
}

// Descriptive only — mirrors the API map. Grants nothing; owner endpoints enforce.
export interface EffectiveDiagnosticPermissions {
  viewRecord: boolean;
  changeRecord: boolean;
  viewResultEntry: boolean;
  changeResultEntry: boolean;
  viewResultSheet: boolean;
  createResultSheet: boolean;
  authorizeResultSheet: boolean;
  amend: boolean;
  viewAiDraft: boolean;
  createAiDraft: boolean;
  viewCoding: boolean;
  viewQuality: boolean;
  viewConsult: boolean;
  viewRecall: boolean;
  viewReport: boolean;
  viewChangeRequests: boolean;
  changeChangeRequests: boolean;
  isSuperRole: boolean;
}

// Band 1: Case Identity (A3). Bounded, factual — mirrors the API CaseIdentitySection. Nulls render
// "—"; `clinicalIndication` is the referring impression, never a diagnosis; `status` is the stored
// value with no added meaning.
export interface CaseIdentitySection {
  recordId: string;
  identifier: string;
  labNumber: string | null;
  formType: string | null;
  status: string;
  urgent: boolean;
  specimenDate: string | null;
  registeredAt: string | null;
  statusChangedAt: string | null;
  patient: {
    id: string;
    name: string | null;
    registrationNo: string | null;
    gender: string | null;
    dateOfBirth: string | null;
  } | null;
  referringDoctor: string | null;
  clinicalIndication: string | null;
  medicalEntry: string | null;
  client: { name: string | null; accountNo: string | null; type: string | null } | null;
  assignedTo: { name: string | null; at: string | null } | null;
  ownerPath: string;
}

export interface DiagnosticCaseOverview {
  asOf: string;
  recordId: string;

  permissions: Section<EffectiveDiagnosticPermissions>;

  caseIdentity: Section<CaseIdentitySection>;
  diagnosticMaterial: Section<null>;
  diagnosticInterpretation: Section<null>;
  decisionSupport: Section<null>;
  priorEvidence: Section<null>;
  collaboration: Section<null>;
  reportingSignOut: Section<null>;
  timelineProvenance: Section<null>;
  permissionsActions: Section<null>;
}
