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

// AI screening — read-only projection of recorded evidence. `regions` mirrors the stored
// findings JSON (evidence, not quantification); `confidence` is recorded model confidence
// (not a diagnosis); `agreedWithAI` is a recorded review outcome (not proof of sequence).
export interface AIRegion {
  region: string | null;
  finding: string | null;
  confidence: number | null;
}
export interface AIEvidence {
  id: string;
  status: string;
  primaryFinding: string | null;
  regions: AIRegion[];
  flaggedAreas: number;
  confidence: number | null;
  confidenceLevel: string | null;
  agreedWithAI: boolean | null;
  pathologistNote: string | null;
  reviewerName: string | null;
  processedAt: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
}

export interface BethesdaEvidence {
  id: string;
  specimenAdequacy: string;
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
  narrative: string | null;
  shortCode: string | null;
  reporterName: string | null;
  reportedAt: string | null;
}

export interface CorrelationEvidence {
  id: string;
  cytologyDiagnosis: string;
  histologyDiagnosis: string | null;
  histologySource: string;
  externalLabName: string | null;
  correlationResult: string | null;
  discordanceReason: string | null;
  reviewRequired: boolean;
  reviewedAt: string | null;
  reviewNotes: string | null;
  reviewerName: string | null;
  createdByName: string | null;
  cytologyDate: string | null;
  histologyDate: string | null;
  createdAt: string | null;
  ownerPath: string;
}
export interface CorrelationSection {
  count: number;
  items: CorrelationEvidence[];
}

// Prior-aware review — patient-linked prior records and correlation cases (never the
// anchor). `resultSummary` is a stored value only; nothing is an inferred trend.
export type PriorSource = 'record' | 'correlation';
export interface PriorEntry {
  source: PriorSource;
  id: string;
  identity: string | null;
  sourceType: string;
  formType: string | null;
  status: string | null;
  date: string | null;
  createdAt: string | null;
  resultSummary: string | null;
  hasReport: boolean;
  amended: boolean;
  authorizedAt: string | null;
  ownerPath: string;
}
export interface PriorsSourceHealth {
  records: 'ready' | 'error' | 'forbidden';
  correlation: 'ready' | 'error' | 'forbidden';
}
export interface PriorsSection {
  count: number;
  items: PriorEntry[];
  sources: PriorsSourceHealth;
  truncated: boolean;
}

// Attachments — read-only metadata only (never storageUrl / file bytes). `kind` is the
// stored type as the file owner recorded it. Bytes are served by the file owner.
export interface AttachmentMeta {
  id: string;
  filename: string | null;
  kind: string | null;
  uploadedAt: string | null;
  recordId: string;
}
export interface AttachmentsSection {
  count: number;
  items: AttachmentMeta[];
}

// Unified timeline — recorded, timestamped events only. A null actor renders as
// "Actor not recorded". Ordered chronologically by the server; never reordered here.
export interface TimelineEvent {
  id: string;
  type: string;
  timestamp: string;
  actor: string | null;
  source: string;
  description: string;
  ownerPath: string | null;
}
export interface TimelineSection {
  count: number;
  items: TimelineEvent[];
  unavailable: string[];
}

// Result sheets — read-only metadata only (never entries/lines). `authorized` is the
// recorded state; no status/draft is inferred. The result-sheet owner owns editing.
export interface ResultSheetMeta {
  id: string;
  recordId: string;
  authorized: boolean;
  authorizedAt: string | null;
  authorizerName: string | null;
  viewed: boolean;
  createdAt: string | null;
  reportCount: number;
  entryCount: number;
  // Authorization/amendment history, derived only from recorded owner events.
  deauthorized: boolean;
  reauthorized: boolean;
  amended: boolean;
  lastEventType: string | null;
  lastEventAt: string | null;
}
export interface ResultSheetsSection {
  count: number;
  items: ResultSheetMeta[];
}

// AI drafts — read-only metadata only (never model output, accepted finalText, or prompt
// contents). `status`/`model`/`promptVersion` are recorded provenance (never inferred);
// `hasStructuredDiff` is availability, not the diff. The AI reporting system owns everything.
export interface AiDraftMeta {
  id: string;
  resultSheetId: string;
  kind: string;
  status: string;
  model: string | null;
  promptVersion: string | null;
  createdAt: string | null;
  createdByName: string | null;
  acceptedAt: string | null;
  reviewerName: string | null;
  hasStructuredDiff: boolean;
}
export interface AiDraftsSection {
  count: number;
  items: AiDraftMeta[];
}

export interface EffectivePermissions {
  viewCase: boolean;
  viewSlide: boolean;
  viewAI: boolean;
  viewAttachments: boolean;
  viewAudit: boolean;
  viewBethesda: boolean;
  viewCorrelation: boolean;
  viewPriors: boolean;
  viewResultSheet: boolean;
  createResultSheet: boolean;
  editResultSheet: boolean;
  viewAiDraft: boolean;
  createAiDraft: boolean;
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
  ai: Section<AIEvidence>;
  bethesda: Section<BethesdaEvidence>;
  correlation: Section<CorrelationSection>;
  priors: Section<PriorsSection>;
  attachments: Section<AttachmentsSection>;
  timeline: Section<TimelineSection>;
  resultSheets: Section<ResultSheetsSection>;
  aiDraft: Section<AiDraftsSection>;
}
