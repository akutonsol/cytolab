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

// Band 4: Decision Support (A8). Single source — AI reporting draft metadata. Metadata only; `edited`
// is a presence boolean (raw editedDiff/output/finalText never sent). AI Screening excluded. Nulls "—".
export interface AiDraftMeta {
  id: string;
  kind: string | null;
  status: string | null;
  model: string | null;
  promptVersion: string | null;
  createdAt: string | null;
  createdBy: string | null;
  acceptedAt: string | null;
  acceptedBy: string | null;
  edited: boolean;
}
export interface AiDraftsSubSection {
  status: SectionStatus;
  items: AiDraftMeta[];
  total: number;
  reason?: string;
}
export interface DecisionSupportSection {
  recordId: string;
  aiDrafts: AiDraftsSubSection;
  ownerPath: string;
}

// Band 5: Prior Evidence (A9). Two patient-anchored sub-sources shown separately, never compared to the
// current case. Prior Records = the patient's prior cases with the CURRENT record excluded by the owner
// (so "prior" is accurate) + embedded historical Bethesda. Correlation = patient-level cyto-histo
// correlations (may include one tied to the current record — labeled neutrally, never "prior"); existence
// + classification only (no diagnoses/notes/review/identity). Nulls "—".
export interface PriorRecordBethesda {
  adequacy: string | null;
  generalCategory: string | null;
  squamousCategory: string | null;
  ascSubtype: string | null;
  glandularCategory: string | null;
  glandularSubtype: string | null;
}
export interface PriorRecordItem {
  id: string;
  labNumber: string | null;
  identifier: string;
  formType: string | null;
  status: string;
  specimenDate: string | null;
  statusChangedAt: string | null;
  createdAt: string | null;
  bethesda: PriorRecordBethesda | null;
  hasAuthorizedResultSheet: boolean;
  hasReport: boolean;
  ownerPath: string;
}
export interface PriorRecordsSubSection {
  status: SectionStatus;
  items: PriorRecordItem[];
  total: number;
  reason?: string;
}
export interface CorrelationItem {
  id: string;
  cytologyDate: string | null;
  histologyDate: string | null;
  histologySource: string | null;
  externalLabName: string | null;
  correlationResult: string | null;
  createdAt: string | null;
  ownerPath: string;
}
export interface CorrelationSubSection {
  status: SectionStatus;
  items: CorrelationItem[];
  total: number;
  reason?: string;
}
export interface PriorEvidenceSection {
  recordId: string;
  priorRecords: PriorRecordsSubSection;
  correlation: CorrelationSubSection;
  unavailable: UnavailableSource[];
  ownerPath: string;
}

// Band 6: Collaboration (A10). Single source — record-scoped escalation metadata. severity/trigger/
// status verbatim (owner-recorded); physicianNotified* are recorded facts, never "delivered/received".
// No teleconsult/notes/messaging (no safe Record-scoped owner read). Nulls "—".
export interface EscalationItem {
  id: string;
  severity: string | null;
  trigger: string | null;
  status: string | null;
  createdAt: string | null;
  physicianNotifiedAt: string | null;
  physicianNotifiedVia: string | null;
  reviewedAt: string | null;
  resolvedAt: string | null;
  assignedTo: string | null;
  reviewedBy: string | null;
  ownerPath: string;
}
export interface EscalationsSubSection {
  status: SectionStatus;
  items: EscalationItem[];
  total: number;
  reason?: string;
}
export interface CollaborationSection {
  recordId: string;
  escalations: EscalationsSubSection;
  ownerPath: string;
}

// Band 7: Reporting & Sign-Out (A11). Reporting metadata only (result-sheet authorization/report/entry
// counts + amendment flags derived from recorded events). No report prose/result content/narrative/
// diagnosis; no authorize/amend/release actions. Sign-Out is the authoritative workspace (owner link).
export interface ResultSheetSummary {
  id: string;
  authorized: boolean;
  authorizedAt: string | null;
  authorizedBy: string | null;
  viewed: boolean;
  createdAt: string | null;
  entryCount: number;
  hasReport: boolean;
  amended: boolean;
  reauthorized: boolean;
  deauthorized: boolean;
}
export interface ReportingResultSheetsSubSection {
  status: SectionStatus;
  items: ResultSheetSummary[];
  total: number;
  reason?: string;
}
export interface ReportingSignOutSection {
  recordId: string;
  resultSheets: ReportingResultSheetsSubSection;
  ownerPath: string;
}

// Band 8: Timeline & Provenance (A12). A unified chronological list from two authoritative persisted event
// streams — RecordStatusEvent (statusHistory) and ResultSheetEvent (the shared eventsByRecord read A11 uses).
// No synthetic Record.createdAt event, no notes, no report content — labels derive from owner-recorded values.
export interface TimelineEvent {
  id: string;
  source: 'record-status' | 'result-sheet';
  eventType: string;
  occurredAt: string;
  actor: string | null;
  ownerPath: string;
}
export interface TimelineProvenanceSection {
  recordId: string;
  events: TimelineEvent[];
  total: number;
  truncated: boolean;
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
  decisionSupport: Section<DecisionSupportSection>;
  priorEvidence: Section<PriorEvidenceSection>;
  collaboration: Section<CollaborationSection>;
  reportingSignOut: Section<ReportingSignOutSection>;
  timelineProvenance: Section<TimelineProvenanceSection>;
  permissionsActions: Section<null>;
  // B7 (additive) — read-only Ancillary Orders band, composed from the owner (listByRecord).
  ancillaryOrders: Section<AncillaryOrdersSection>;
  // C8 (additive) — read-only Screening Batch band, composed from the owner (listByRecord).
  screeningBatches: Section<ScreeningBatchesSection>;
}

// C8: Screening Batch band — allowlisted owner metadata only (no labId/actor ids/notes/nested).
// "Completed" = the owner recorded every membership dispositioned; "QC Selected" = selected for QC only.
export interface ScreeningBatchMembershipItem {
  caseId: string;
  batchId: string;
  batchNumber: string;
  batchStatus: string;
  assignedToId: string | null;
  disposition: string;
  addedAt: string | null;
  screenedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}
export interface ScreeningBatchesSection {
  recordId: string;
  items: ScreeningBatchMembershipItem[];
  total: number;
  ownerPath: string; // /screening-batches (owner workspace)
}

// B7: Ancillary Orders band — allowlisted owner metadata only (no labId/orderedBy/nested relations).
// "Completed" means only that the owner recorded the order status as Completed.
export interface AncillaryOrderItem {
  id: string;
  kind: string;
  target: string;
  status: string;
  blocksSignOut: boolean;
  orderedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  notes: string | null;
}
export interface AncillaryOrdersSection {
  recordId: string;
  items: AncillaryOrderItem[];
  total: number;
  ownerPath: string; // /ancillary-orders (owner workspace)
}
