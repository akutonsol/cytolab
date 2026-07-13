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

// Band 2: Diagnostic Material (A4). Recorded specimen/material evidence only — no images, no slides,
// no attachments, no interpretation, no quality inference. Nulls render "—".
export interface DiagnosticMaterialItem {
  id: string;
  label: string | null;
  type: string | null;
  container: string | null;
  bloodGroup: string | null;
  receivedAt: string | null;
}
// A5: Slides / Imaging sub-source. Metadata only (no image URL/bytes/annotations); `id` opens the
// existing /wsi/:id owner viewer. Record-anchored, never specimen-linked. Nulls render "—".
export interface SlideItem {
  id: string;
  format: string | null;
  magnification: string | null;
  stain: string | null;
  scanner: string | null;
  fileSizeBytes: number | null;
  uploadedAt: string | null;
}
export interface SlidesSubSection {
  status: SectionStatus;
  items: SlideItem[];
  total: number;
  reason?: string;
}

// A6: Attachments sub-source. Metadata only — id/name/fileType/createdAt; NO storageUrl/bytes/download.
// Record-anchored, never specimen/slide/result-linked. `fileType` is the recorded MIME, not a verified
// semantic document type. Nulls render "—".
export interface AttachmentRow {
  id: string;
  name: string | null;
  fileType: string | null;
  createdAt: string | null;
}
export interface AttachmentsSubSection {
  status: SectionStatus;
  items: AttachmentRow[];
  total: number;
  reason?: string;
}

export interface DiagnosticMaterialSection {
  recordId: string;
  specimens: DiagnosticMaterialItem[];
  summary: { total: number };
  slides: SlidesSubSection;
  attachments: AttachmentsSubSection;
  unavailable: UnavailableSource[];
  ownerPath: string;
}

// Band 3: Diagnostic Interpretation (A7). Two independent owner-recorded sub-sources, shown separately
// — never merged into a diagnosis. Bethesda = structured TBS classification (gated resultentry:view);
// Coding = recorded codes (gated record:view). Metadata/allowlist only; nulls render "—".
export interface BethesdaEvidence {
  adequacy: string | null;
  unsatisfactoryReason: string | null;
  generalCategory: string | null;
  squamousCategory: string | null;
  ascSubtype: string | null;
  glandularCategory: string | null;
  glandularSubtype: string | null;
  otherMalignancy: string | null;
  organisms: string[];
  otherNonNeoplastic: string[];
  hpvResult: string | null;
  hpvGenotype: string | null;
  recommendation: string | null;
  recommendationNotes: string | null;
  shortCode: string | null;
  reportedBy: string | null;
  reportedAt: string | null;
}
export interface BethesdaSubSection {
  status: SectionStatus;
  data: BethesdaEvidence | null;
  reason?: string;
}
export interface CodingRow {
  id: string;
  codeType: string | null;
  system: string | null;
  code: string | null;
  display: string | null;
  category: string | null;
  assignedBy: string | null;
  assignedAt: string | null;
}
export interface CodingSubSection {
  status: SectionStatus;
  items: CodingRow[];
  total: number;
  reason?: string;
}
export interface DiagnosticInterpretationSection {
  recordId: string;
  bethesda: BethesdaSubSection;
  coding: CodingSubSection;
  unavailable: UnavailableSource[];
  ownerPath: string;
}

export interface DiagnosticCaseOverview {
  asOf: string;
  recordId: string;

  permissions: Section<EffectiveDiagnosticPermissions>;

  caseIdentity: Section<CaseIdentitySection>;
  diagnosticMaterial: Section<DiagnosticMaterialSection>;
  diagnosticInterpretation: Section<DiagnosticInterpretationSection>;
  decisionSupport: Section<null>;
  priorEvidence: Section<null>;
  collaboration: Section<null>;
  reportingSignOut: Section<null>;
  timelineProvenance: Section<null>;
  permissionsActions: Section<null>;
}
