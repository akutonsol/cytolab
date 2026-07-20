import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { RecordsService } from '../records/records.service';
import { WsiService } from '../wsi/wsi.service';
import { FilesService } from '../files/files.service';
import { BethesdaService } from '../bethesda/bethesda.service';
import { CodingService } from '../coding/coding.service';
import { AiReportingService } from '../ai/ai-reporting.service';
import { CorrelationService } from '../correlation/correlation.service';
import { EscalationService } from '../escalation/escalation.service';
import { ResultSheetsService } from '../result-sheets/result-sheets.service';
import { AncillaryOrdersService } from '../ancillary-orders/ancillary-orders.service';
import { ScreeningBatchesService } from '../screening-batches/screening-batches.service';

// Diagnostic Case Workspace — A2: the FROZEN read-only aggregate contract for
// GET /diagnostic-case/:recordId/overview. This service is CONTRACT-ONLY: it holds no Prisma,
// imports no owner module, and performs NO clinical read (no record existence lookup, no patient,
// specimen, WSI, attachment, Bethesda, AI, coding, report, prior, or collaboration data). It
// returns the nine frozen clinical bands as `deferred` and hydrates only the descriptive
// permission map (`permissions` → ready). Owner composition arrives band-by-band in A3+ by CALLING
// the same owner service methods Sign-Out already calls (never by importing Sign-Out's internals).
// Contract: docs/OSIERI_DIAGNOSTIC_CASE_IMPLEMENTATION_PLAN.md (A2; §3 aggregate contract, §6
// permission model, §7 five-state contract). This shape must not be reshaped after A2.

// ── Frozen section contract (identical to the proven Sign-Out contract; reused, not imported) ──
export type SectionStatus = 'ready' | 'empty' | 'forbidden' | 'error' | 'deferred';

export interface Section<T> {
  status: SectionStatus;
  data: T | null;
  reason?: string;
}

// A per-source availability entry for multi-source bands (A4+). Frozen at A2 so later bands
// (Diagnostic Material, Decision Support, Prior Evidence, Collaboration) can report which owner
// read was forbidden/errored/empty while still rendering the rest of the band partially.
export interface UnavailableSource {
  key: string;
  label: string;
  reason?: string;
}

// ── Descriptive effective-permission map ──
// Reuses the Sign-Out EffectivePermissions PATTERN (has(code) = isSuperRole || permissions.includes)
// built from the authenticated caller's real claims only. It GRANTS NOTHING — owner endpoints remain
// the enforcement authority; this only drives which panels render `ready` vs `forbidden` in the UI.
// Every boolean maps to a VERIFIED, seeded permission code (or the isSuperRole flag). No invented
// codes (no diagnostic:*/caseworkspace:*/wsi:*/teleconsult:*/ai-screening:*/quality:*). Where owners
// gate on generic record:* the booleans reflect that truthfully — they do not imply a distinct code.
export interface EffectiveDiagnosticPermissions {
  // Case, specimens, slides (WSI), attachments (Files), coding, correlation, AI screening,
  // teleconsult, QC, escalation, TAT, recall — every one of these owners gates on record:view/change
  // (verified: no dedicated wsi:*/consult:*/correlation:*/screening:* permission exists).
  viewRecord: boolean; // record:view
  changeRecord: boolean; // record:change

  // Result entries / structured findings (Bethesda upsert, result lines) — resultentry:*.
  viewResultEntry: boolean; // resultentry:view
  changeResultEntry: boolean; // resultentry:change

  // Result sheets + authorization/amendment lifecycle — resultsheet:*.
  viewResultSheet: boolean; // resultsheet:view
  createResultSheet: boolean; // resultsheet:create
  authorizeResultSheet: boolean; // resultsheet:authorize
  amend: boolean; // resultentry:change && resultsheet:authorize (descriptive; mirrors Sign-Out)

  // AI-assisted reporting drafts (assistive). aidraft is a seeded STANDARD_OBJECT
  // (view/create/change/delete); the AI endpoints enforce aidraft:create for generation/review.
  viewAiDraft: boolean; // aidraft:view
  createAiDraft: boolean; // aidraft:create

  // Coding owner reads gate on record:view (no dedicated coding permission on the read path).
  viewCoding: boolean; // record:view

  // Quality band — correlation/QC/escalation/TAT all gate on record:view (verified real owner gates).
  viewQuality: boolean; // record:view

  // Teleconsult reads gate on record:view (no dedicated teleconsult permission).
  viewConsult: boolean; // record:view

  // Recall reads gate on record:view (no dedicated recall permission).
  viewRecall: boolean; // record:view

  // Released/historical reports — report:view.
  viewReport: boolean; // report:view

  // Client change requests — changerequest:* is DECLARED-BUT-UNSEEDED → reachable ONLY via the
  // isSuperRole bypass. Surfaced honestly (the panel renders `forbidden`, never `empty`, for staff).
  // Never aliased to another code.
  viewChangeRequests: boolean; // changerequest:view (unseeded → superuser-only)
  changeChangeRequests: boolean; // changerequest:change (unseeded → superuser-only)

  // The role-flag that bypasses the permission guard — surfaced as what it is, never disguised.
  isSuperRole: boolean;
}

// ── Band 1: Case Identity (A3) ──
// Bounded, factual case header composed ONLY from fields RecordsService.findOne already returns
// (recordSelect). No synthesis: no diagnosis, no inferred urgency/risk/severity, no lifecycle meaning
// beyond the stored status, no Started/Released/Archived. Nulls stay null (render "—"), never errors.
// Specimen material, therapy, clinical features, and result sheets are DELIBERATELY excluded — they
// belong to later bands. `clinicalIndication` is the REFERRING clinician's recorded impression
// (Record.clinicalDiagnosis), never the pathologist's diagnosis.
export interface CaseIdentitySection {
  recordId: string;
  identifier: string; // internal stable system id (recorded)
  labNumber: string | null; // human case number / lab no. (recorded)
  formType: string | null; // clinical form discriminator (recorded)
  status: string; // stored RecordStatus, verbatim — no meaning beyond the recorded value
  urgent: boolean; // recorded flag (NOT synthesized urgency)
  specimenDate: string | null; // recorded specimen date (ISO) — collection date as recorded
  registeredAt: string | null; // record createdAt (ISO)
  statusChangedAt: string | null; // dateStatus (ISO) — last recorded status-change time
  patient: {
    name: string | null;
    registrationNo: string | null; // MRN as already used by the record surface
    gender: string | null; // as recorded (no inference)
    dateOfBirth: string | null; // recorded DOB (ISO); age is NOT synthesized
  } | null;
  referringDoctor: string | null; // Record.doctor (recorded free text)
  clinicalIndication: string | null; // Record.clinicalDiagnosis — REFERRING impression, not a diagnosis
  medicalEntry: string | null; // Record.medicalEntry (recorded free text)
  client: { name: string | null; accountNo: string | null; type: string | null } | null;
  assignedTo: { name: string | null; at: string | null } | null; // recorded assignee (owner field)
  ownerPath: string; // /records/:recordId
}

// ── Band 2: Diagnostic Material (A4) ──
// Recorded specimen/material evidence, composed from the SAME RecordsService.findOne read's `specimens`
// projection. Excludes specimen images (storageUrl), WSI slides, attachments, interpretation, and any
// quality/adequacy/severity inference — those are later bands or deliberately never inferred. The case's
// slides/attachments/AI are Record-anchored, NOT specimen-linked; this section says so and never implies
// a specimen↔slide link. List capped at MATERIAL_CAP; `summary.total` is the true recorded count.
export interface DiagnosticMaterialItem {
  id: string;
  label: string | null; // owner display label (recorded)
  type: string | null; // SpecimenType (recorded)
  container: string | null; // vial colour (recorded container attribute)
  bloodGroup: string | null; // recorded
  receivedAt: string | null; // dateReceived (ISO)
}
// A5: Slides / Imaging sub-source of the Diagnostic Material band. Composed from the mutation-free
// WsiService.listByRecordMeta seam (metadata only — NO slideUrl, image bytes, thumbnails, annotations,
// or storage keys; `id` is the viewer-safe identifier for the existing /wsi/:id owner route). It is a
// SEPARATE owner read with its own status so a WSI failure isolates here and never affects specimens.
// Slides are Record-anchored, never specimen-linked. No adequacy/quality/importance inference.
export interface SlideItem {
  id: string; // DigitalSlide id → owner viewer route /wsi/:id
  format: string | null; // recorded (caller-asserted at upload)
  magnification: string | null; // recorded (caller-asserted)
  stain: string | null; // recorded (caller-asserted)
  scanner: string | null; // recorded (caller-asserted)
  fileSizeBytes: number | null; // recorded
  uploadedAt: string | null; // recorded (ISO)
}
export interface SlidesSubSection {
  status: SectionStatus; // ready | empty | forbidden | error (isolated to this sub-source)
  items: SlideItem[]; // ≤ SLIDE_CAP, deterministic order
  total: number; // true recorded slide count
  reason?: string;
}

// A6: Attachments sub-source of the Diagnostic Material band. Composed from the mutation-free
// FilesService.getRecordAttachments read, mapped to METADATA ONLY. The owner read returns the full row
// (incl. storageUrl/labId); this mapper deliberately surfaces ONLY id/name/fileType/createdAt — never
// storageUrl, signed URLs, GCS paths, base64, bytes, credentials, or download tokens. FilesService
// remains the sole owner of binary storage and delivery. Record-anchored: never specimen/slide/result
// linked. `fileType` is the recorded request MIME (kind), not a verified semantic document type — no
// semantics are inferred from it. No uploader/size/checksum/version/review state exists in the model.
export interface AttachmentRow {
  id: string;
  name: string | null; // filename (recorded); may be null
  fileType: string | null; // kind / recorded MIME (not a verified semantic type)
  createdAt: string | null; // recorded (ISO)
}
export interface AttachmentsSubSection {
  status: SectionStatus; // ready | empty | forbidden | error (isolated to this sub-source)
  items: AttachmentRow[]; // ≤ ATTACHMENT_CAP, deterministic order
  total: number; // true recorded attachment count
  reason?: string;
}

export interface DiagnosticMaterialSection {
  recordId: string;
  specimens: DiagnosticMaterialItem[]; // ≤ MATERIAL_CAP, deterministic order (A4 — record read)
  summary: { total: number }; // true recorded specimen count (may exceed specimens.length if capped)
  slides: SlidesSubSection; // A5 — WsiService.listByRecordMeta (separate, isolated owner read)
  attachments: AttachmentsSubSection; // A6 — FilesService.getRecordAttachments (separate, isolated read)
  unavailable: UnavailableSource[]; // sub-sources that failed (error/forbidden) — truthful partial state
  ownerPath: string; // /records/:recordId
}

// Discriminated result of the single shared record read.
type RecordLoad =
  | { kind: 'ok'; rec: any }
  | { kind: 'forbidden' }
  | { kind: 'error'; reason: string };

// Discriminated result of the SINGLE shared ResultSheetsService.eventsByRecord read. Performed once per
// overview (only when the root record loaded OK) and threaded into BOTH A11 Reporting & Sign-Out and A12
// Timeline & Provenance — eventsByRecord is never called twice. `forbidden` = caller lacks resultsheet:view
// (the read is not attempted); `error` = the owner read threw; `ok` = the recorded events (never mutated).
type RsEventsLoad =
  | { kind: 'ok'; events: any[] }
  | { kind: 'forbidden' }
  | { kind: 'error' };

// ── Band 3: Diagnostic Interpretation (A7) ──
// Two INDEPENDENT owner-recorded sub-sources, shown SEPARATELY and never merged into a diagnosis:
//   • Bethesda — BethesdaService.getByRecord (structured TBS classification; one-per-record; owner-
//     derived shortCode). Gated resultentry:view (narrower than the base record:view).
//   • Coding — CodingService.getRecordCodings (recorded SNOMED/ICD/LOINC rows). Gated record:view.
// METADATA/allowlist only — no owner DTO is spread. No diagnosis synthesis, no inferred severity/
// urgency/malignancy/adequacy/priority, no cross-source relationship, no reinterpretation of labels.
// Bethesda `generatedNarrative` is EXCLUDED (owner-generated prose with no review/provenance state —
// ambiguous; the structured enums + shortCode are the unambiguous recorded evidence). Coding `notes`
// is EXCLUDED (free-text; not proven a user-visible clinical field for this aggregate).
export interface BethesdaEvidence {
  adequacy: string | null; // specimenAdequacy (recorded enum, verbatim)
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
  shortCode: string | null; // owner-derived deterministic shortcode
  reportedBy: string | null; // recorded reporter name
  reportedAt: string | null; // ISO
}
export interface BethesdaSubSection {
  status: SectionStatus; // ready (a result exists) | empty (none) | forbidden (no resultentry:view) | error
  data: BethesdaEvidence | null;
  reason?: string;
}
export interface CodingRow {
  id: string; // opaque row id (stable key)
  codeType: string | null; // recorded CodingType (verbatim; not "primary/severe/etc." unless owner records it)
  system: string | null; // MedicalCode.system
  code: string | null; // MedicalCode.code
  display: string | null; // MedicalCode.display
  category: string | null; // MedicalCode.category
  assignedBy: string | null; // recorded assigner name
  assignedAt: string | null; // ISO
}
export interface CodingSubSection {
  status: SectionStatus; // ready (≥1 row) | empty | forbidden (no record:view) | error
  items: CodingRow[]; // ≤ CODING_CAP
  total: number; // true recorded count
  reason?: string;
}
export interface DiagnosticInterpretationSection {
  recordId: string;
  bethesda: BethesdaSubSection;
  coding: CodingSubSection;
  unavailable: UnavailableSource[]; // sub-sources that are error OR forbidden (consistent with A6)
  ownerPath: string; // /records/:recordId
}

// ── Band 4: Decision Support (A8) ──
// The band currently owns EXACTLY ONE source — AI-assisted reporting draft METADATA
// (AiReportingService.draftsByRecord). The contract models exactly that source (no generic container
// for future AI/recommendations/alerts/screening). Metadata only: the generated clinical text
// (`output`/`finalText`) and the raw `editedDiff` are NEVER surfaced — `edited` is a presence boolean.
// AI Screening (simulated/random) is deliberately EXCLUDED. Assistive provenance only — never a diagnosis.
export interface AiDraftMeta {
  id: string;
  kind: string | null; // AiDraftKind (Narrative/CodeSuggestion/ConsistencyCheck), verbatim
  status: string | null; // AiDraftStatus (Generated/Accepted/Rejected/Superseded), verbatim
  model: string | null; // recorded model id (provenance)
  promptVersion: string | null; // recorded prompt version (provenance)
  createdAt: string | null; // ISO
  createdBy: string | null; // display name
  acceptedAt: string | null; // ISO
  acceptedBy: string | null; // display name
  edited: boolean; // derived from editedDiff PRESENCE only — raw diff is never exposed
}
export interface AiDraftsSubSection {
  status: SectionStatus; // ready (≥1 draft) | empty | forbidden (no aidraft:view) | error
  items: AiDraftMeta[]; // ≤ DRAFT_CAP, createdAt desc
  total: number; // true recorded draft count
  reason?: string;
}
export interface DecisionSupportSection {
  recordId: string;
  aiDrafts: AiDraftsSubSection; // the single current source; extend ONLY when a real owner source is approved
  ownerPath: string; // /records/:recordId
}

// ── Band 5: Prior Evidence (A9) ──
// Two INDEPENDENT patient-anchored sub-sources, shown SEPARATELY — never merged, never compared to the
// current case, never turned into progression/recurrence/trend/concordance:
//   • Prior Records — RecordsService.priorsByPatient (prior case identity + lifecycle + HISTORICAL
//     Bethesda selections embedded per record + result-sheet/report PRESENCE metadata). Gated
//     resultentry:view (the projection exposes Bethesda selections). Historical Bethesda stays embedded
//     in each prior record — NOT a separate subsection.
//   • Correlation — CorrelationService.byPatient (patient-level cyto-histo correlation cases; a case tied
//     to the CURRENT record MAY be present — it is NOT filtered out and is labeled neutrally, never
//     "prior"). Gated record:view. EXISTENCE + owner-recorded classification ONLY (no diagnoses/notes/
//     review/outcome/identity).
// Metadata/allowlist only. Only Prior Records is truly "prior" (owner excludes the current record);
// correlations are patient-level. Nothing is compared to the current case; no temporal/progression/
// recurrence/agreement/correctness inference.
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
  status: string; // stored RecordStatus, verbatim
  specimenDate: string | null;
  statusChangedAt: string | null; // dateStatus
  createdAt: string | null;
  bethesda: PriorRecordBethesda | null; // historical Bethesda selections embedded (owner projection)
  hasAuthorizedResultSheet: boolean; // presence only (from resultSheets.authorized)
  hasReport: boolean; // presence only (from resultSheets.reports)
  ownerPath: string; // /records/:id
}
export interface PriorRecordsSubSection {
  status: SectionStatus; // ready (≥1 prior) | empty | forbidden (no resultentry:view) | error
  items: PriorRecordItem[]; // ≤ PRIOR_CAP, createdAt desc (owner order)
  total: number;
  reason?: string;
}
// Correlation: EXISTENCE + owner-recorded classification only (narrow allowlist per A9 brief). No
// cytology/histology diagnosis text, no review/notes/outcome/discordanceReason, no patient identity.
export interface CorrelationItem {
  id: string;
  cytologyDate: string | null;
  histologyDate: string | null;
  histologySource: string | null;
  externalLabName: string | null;
  correlationResult: string | null; // owner-recorded (Concordant/MinorDiscordant/MajorDiscordant), verbatim
  createdAt: string | null;
  ownerPath: string; // /correlation/:id
}
export interface CorrelationSubSection {
  status: SectionStatus; // ready (≥1 case) | empty | forbidden (no record:view) | error
  items: CorrelationItem[]; // ≤ CORRELATION_CAP, cytologyDate desc (owner order)
  total: number;
  reason?: string;
}
export interface PriorEvidenceSection {
  recordId: string;
  priorRecords: PriorRecordsSubSection;
  correlation: CorrelationSubSection;
  unavailable: UnavailableSource[]; // sub-sources that are error OR forbidden (consistent with A6/A7)
  ownerPath: string; // /records/:recordId
}

// ── Band 6: Collaboration (A10) ──
// The band currently owns EXACTLY ONE source — record-scoped escalation METADATA
// (EscalationService.list({ recordId }, userId)). The contract models exactly that source (no generic
// container for teleconsult/notes/messaging/tasks/notifications — none of those has a safe Record-scoped
// owner read). Metadata/allowlist only; severity/trigger/status shown VERBATIM (owner-recorded enums),
// never inferred. `physicianNotifiedAt`/`Via` are RECORDED notification facts — never "delivered/received".
export interface EscalationItem {
  id: string;
  severity: string | null; // owner-recorded enum, verbatim (no urgency/risk inference)
  trigger: string | null; // owner-recorded enum, verbatim
  status: string | null; // owner-recorded enum, verbatim
  createdAt: string | null;
  physicianNotifiedAt: string | null; // recorded notification timestamp — app action, not delivery proof
  physicianNotifiedVia: string | null; // recorded method ("portal"/"in-app")
  reviewedAt: string | null;
  resolvedAt: string | null;
  assignedTo: string | null; // display name only (no user id)
  reviewedBy: string | null; // display name only (no user id)
  ownerPath: string; // /escalations (owner workspace; NOT claimed record-filtered)
}
export interface EscalationsSubSection {
  status: SectionStatus; // ready (≥1) | empty | forbidden (no record:view) | error
  items: EscalationItem[]; // ≤ ESCALATION_CAP, owner order (severity rank, then createdAt desc)
  total: number; // true owner-returned count
  reason?: string;
}
export interface CollaborationSection {
  recordId: string;
  escalations: EscalationsSubSection; // the single current source; extend ONLY when a real owner source is approved
  ownerPath: string; // /records/:recordId
}

// ── Band 7: Reporting & Sign-Out (A11) ──
// Reporting METADATA only, composed from ResultSheetsService.metaByRecord (per-sheet authorization/report/
// entry counts) + ResultSheetsService.eventsByRecord (authorization/amendment event types). Sign-Out
// remains the authoritative workspace and is NOT modified — this band reuses the same owner reads it uses.
// NEVER: report prose (`content`), result text/lines, generated narrative, diagnosis, or any authorize/
// amend/release/approve action. Authorization/amendment flags are derived ONLY from recorded
// ResultSheetEvent types (like Sign-Out). No "finalized/correct/complete" claim — owner-recorded facts only.
export interface ResultSheetSummary {
  id: string;
  authorized: boolean; // owner-recorded gate flag
  authorizedAt: string | null;
  authorizedBy: string | null; // display name only
  viewed: boolean; // owner-recorded
  createdAt: string | null;
  entryCount: number; // _count.resultEntries (metadata count — NOT the entries/content)
  hasReport: boolean; // _count.reports > 0 — a report RECORD EXISTS; proves NOTHING about release/publication/delivery/finalization
  amended: boolean; // a Deauthorized/Reauthorized event exists (recorded)
  reauthorized: boolean; // a Reauthorized event exists (recorded)
  deauthorized: boolean; // currently not authorized AND a Deauthorized event exists (recorded)
}
export interface ReportingResultSheetsSubSection {
  status: SectionStatus; // ready (≥1 sheet) | empty | forbidden (no resultsheet:view) | error
  items: ResultSheetSummary[]; // ≤ RESULTSHEET_CAP, owner order (createdAt desc)
  total: number;
  reason?: string;
}
export interface ReportingSignOutSection {
  recordId: string;
  resultSheets: ReportingResultSheetsSubSection; // the single current source (metaByRecord + eventsByRecord)
  ownerPath: string; // /sign-out/:recordId (authoritative workspace)
}

// ── Band 8: Timeline & Provenance (A12) ──
// A unified, chronological, read-only list composed from EXACTLY TWO authoritative, persisted,
// append-only event streams — nothing synthesized, nothing reconstructed from current-state fields:
//   1. RecordStatusEvent — from the already-loaded record's `statusHistory` (record:view via the base
//      gate). NO synthetic "Case created" event from Record.createdAt (the create flow already persists
//      an initial RecordStatusEvent); a legacy record with no status events truthfully contributes none.
//   2. ResultSheetEvent — from the SINGLE shared ResultSheetsService.eventsByRecord read (resultsheet:view),
//      the SAME in-request read A11 uses (called at most once per overview).
// Labels derive deterministically from owner-recorded values (never AI/generated prose, never notes).
// Every event keeps its `source`; ids are source-prefixed to avoid cross-source collision. Raw user ids,
// notes, resultSheetId, report content/narrative/diagnosis, and all current-state timestamps are excluded.
export interface TimelineEvent {
  id: string; // source-prefixed public id: `status-<ownerEventId>` | `result-sheet-<ownerEventId>`
  source: 'record-status' | 'result-sheet'; // owner identity, never erased in normalization
  eventType: string; // restrained factual label derived directly from the owner-recorded value
  occurredAt: string; // recorded event time (ISO) — the owner's createdAt
  actor: string | null; // display name only; null for system/actorless events (never fabricated)
  ownerPath: string; // conservative owner navigation (record status → /records/:id; result sheet → /sign-out/:id)
}
export interface TimelineProvenanceSection {
  recordId: string;
  events: TimelineEvent[]; // ≤ TIMELINE_CAP, unified deterministic chronological order
  total: number; // full normalized owner-event count BEFORE the cap slice
  truncated: boolean; // total > TIMELINE_CAP
  unavailable: UnavailableSource[]; // event sources that were forbidden/errored (named truthfully)
  ownerPath: string; // /records/:recordId
}

// ── The frozen overview envelope ──
export interface DiagnosticCaseOverview {
  asOf: string;
  recordId: string;

  permissions: Section<EffectiveDiagnosticPermissions>;

  // The nine frozen clinical bands, in the frozen order (plan §4). Each hydrates to its band payload
  // as it lands (A3 = caseIdentity, A4 = diagnosticMaterial); the STATUS contract never changes.
  caseIdentity: Section<CaseIdentitySection>;
  diagnosticMaterial: Section<DiagnosticMaterialSection>;
  diagnosticInterpretation: Section<DiagnosticInterpretationSection>;
  decisionSupport: Section<DecisionSupportSection>;
  priorEvidence: Section<PriorEvidenceSection>;
  collaboration: Section<CollaborationSection>;
  reportingSignOut: Section<ReportingSignOutSection>;
  timelineProvenance: Section<TimelineProvenanceSection>;
  permissionsActions: Section<null>;

  // B7 (additive extension per Architecture Ledger §19) — a NEW read-only band composing the
  // AncillaryOrders owner (AncillaryOrdersService.listByRecord). The nine frozen bands above are
  // unchanged and unreordered; this band only OBSERVES. Ordering / creation / lifecycle stay with
  // the /ancillary-orders owner workspace.
  ancillaryOrders: Section<AncillaryOrdersSection>;

  // C8 (additive extension per Architecture Ledger §19) — a NEW read-only band composing the
  // ScreeningBatch owner (ScreeningBatchesService.listByRecord). The ten bands above (nine frozen
  // 3A + the 4.1A Ancillary band) are unchanged and unreordered; this band only OBSERVES.
  // Screening batch creation / membership / lifecycle stay with the /screening-batches owner.
  screeningBatches: Section<ScreeningBatchesSection>;
}

export interface ScreeningBatchMembershipItem {
  caseId: string; // ScreeningBatchCase id (membership), never a clinical id
  batchId: string;
  batchNumber: string;
  batchStatus: string; // ScreeningBatchStatus verbatim (Completed = all memberships dispositioned only)
  assignedToId: string | null; // recorded screener identifier only — not a validated display identity
  disposition: string; // ScreeningDisposition verbatim (QCSelected = selected for QC only)
  addedAt: string | null;
  screenedAt: string | null;
  startedAt: string | null; // batch started (InScreening)
  completedAt: string | null; // batch completed
}
export interface ScreeningBatchesSection {
  recordId: string;
  items: ScreeningBatchMembershipItem[]; // owner order (addedAt desc); allowlisted metadata only
  total: number; // true owner-returned count
  ownerPath: string; // /screening-batches (owner workspace — the only action target)
}

export interface AncillaryOrderItem {
  id: string;
  kind: string; // AncillaryKind enum value, verbatim
  target: string; // recorded marker/antibody/stain — never inferred
  status: string; // AncillaryStatus enum value, verbatim (Completed means only: owner recorded Completed)
  blocksSignOut: boolean; // recorded flag
  orderedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  notes: string | null;
}
export interface AncillaryOrdersSection {
  recordId: string;
  items: AncillaryOrderItem[]; // owner order (orderedAt desc); allowlisted metadata only
  total: number; // true owner-returned count
  ownerPath: string; // /ancillary-orders (owner workspace — the only action target)
}

const deferred = (): Section<null> => ({ status: 'deferred', data: null });
const MATERIAL_CAP = 50; // conservative bound on the recorded specimen list (plan A4 §List bounds)
const SLIDE_CAP = 50; // conservative bound on the recorded slide list (plan A5 §List bounds)
const ATTACHMENT_CAP = 50; // conservative bound on the recorded attachment list (plan A6 §List bounds)
const CODING_CAP = 50; // conservative bound on the recorded coding list (plan A7 §List bounds)
const DRAFT_CAP = 50; // conservative bound on the recorded AI-draft list (plan A8 §List bounds)
const PRIOR_CAP = 50; // conservative bound on the prior-record list (owner already applies take:50)
const CORRELATION_CAP = 50; // conservative bound on the patient correlation list (plan A9 §List bounds)
const ESCALATION_CAP = 50; // conservative bound on the record escalation list (plan A10 §List bounds)
const RESULTSHEET_CAP = 50; // conservative bound on the record result-sheet list (plan A11 §List bounds)
const TIMELINE_CAP = 50; // conservative bound on the unified event list (plan A12 §Ordering and cap)
const iso = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString() : null);
const fullName = (
  u: { firstName?: string | null; lastName?: string | null } | null | undefined,
): string | null => (u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || null : null);

// Fixed, factual labels for recorded ResultSheetEvent types — the exact owner enum, no interpretation,
// no clinical-significance/final/complete/urgent claim. An unmapped value falls back to its raw string
// (still owner-recorded, never invented). Mirrors Sign-Out's RSE_TEXT intent without importing it.
const RSE_LABEL: Record<string, string> = {
  Authorized: 'Authorized',
  Deauthorized: 'Deauthorized',
  Reauthorized: 'Reauthorized',
  AiDrafted: 'AI draft recorded',
  AiAccepted: 'AI draft accepted',
};

// Deterministic unified ordering: occurredAt ascending, then a FIXED source priority ONLY to break exact
// timestamp ties (never a clinical-importance ranking), then the stable source-prefixed id. Same input →
// same order, always.
const TIMELINE_SOURCE_PRIORITY: Record<string, number> = { 'record-status': 0, 'result-sheet': 1 };
function timelineSort(a: TimelineEvent, b: TimelineEvent): number {
  const ta = new Date(a.occurredAt).getTime();
  const tb = new Date(b.occurredAt).getTime();
  if (ta !== tb) return ta - tb;
  const pa = TIMELINE_SOURCE_PRIORITY[a.source] ?? 99;
  const pb = TIMELINE_SOURCE_PRIORITY[b.source] ?? 99;
  if (pa !== pb) return pa - pb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

@Injectable()
export class DiagnosticCaseService {
  constructor(
    private readonly records: RecordsService,
    private readonly wsi: WsiService,
    private readonly files: FilesService,
    private readonly bethesda: BethesdaService,
    private readonly coding: CodingService,
    private readonly aiReporting: AiReportingService,
    private readonly correlation: CorrelationService,
    private readonly escalation: EscalationService,
    private readonly resultSheets: ResultSheetsService,
    private readonly ancillary: AncillaryOrdersService, // B7 — owner read reuse only (listByRecord)
    private readonly screening: ScreeningBatchesService, // C8 — owner read reuse only (listByRecord)
  ) {}

  /**
   * Read-only aggregate for one case. A3–A4: composes Case Identity and Diagnostic Material from ONE
   * RecordsService.findOne read (the verified, mutation-free record owner read whose projection already
   * includes the recorded specimens) — no duplicate owner read, no second owner module. All other
   * clinical bands remain `deferred`. Orchestration only — no Prisma, no owner logic duplication, no
   * mutation. Case Identity is the root; a record failure isolates to these two record-derived Sections
   * (error/forbidden) and never collapses the permission map or the endpoint.
   */
  async overview(recordId: string, user: AuthUser): Promise<DiagnosticCaseOverview> {
    const load = await this.loadRecord(recordId, user);
    const has = (code: string) => !!user.isSuperRole || user.permissions.includes(code);
    // ONE result-sheet event read for the whole request (A11 Reporting + A12 Timeline). Invoked ONLY when
    // the root record loaded OK; a root failure/forbidden makes both bands mirror the root WITHOUT invoking
    // the owner. eventsByRecord is therefore called at most once per overview (never separately per band).
    const rsEvents: RsEventsLoad =
      load.kind === 'ok' ? await this.loadResultSheetEvents(recordId, has('resultsheet:view')) : { kind: 'forbidden' };
    return {
      asOf: new Date().toISOString(),
      recordId,
      permissions: { status: 'ready', data: this.buildPermissions(user) },
      caseIdentity: this.sectionCaseIdentity(recordId, load),
      diagnosticMaterial: await this.sectionDiagnosticMaterial(recordId, load),
      diagnosticInterpretation: await this.sectionDiagnosticInterpretation(recordId, load, user),
      decisionSupport: await this.sectionDecisionSupport(recordId, load, user),
      priorEvidence: await this.sectionPriorEvidence(recordId, load, user),
      collaboration: await this.sectionCollaboration(recordId, load, user),
      reportingSignOut: await this.sectionReportingSignOut(recordId, load, user, rsEvents),
      timelineProvenance: this.sectionTimelineProvenance(recordId, load, rsEvents),
      permissionsActions: deferred(),
      ancillaryOrders: await this.sectionAncillaryOrders(recordId, user),
      screeningBatches: await this.sectionScreeningBatches(recordId, user),
    };
  }

  // The SINGLE shared ResultSheetsService.eventsByRecord read. Not attempted without resultsheet:view
  // (forbidden). Mutation-free; the recorded events are threaded into A11 and A12 unchanged.
  private async loadResultSheetEvents(recordId: string, allowed: boolean): Promise<RsEventsLoad> {
    if (!allowed) return { kind: 'forbidden' };
    try {
      const events = await this.resultSheets.eventsByRecord(recordId);
      return { kind: 'ok', events: Array.isArray(events) ? events : [] };
    } catch {
      return { kind: 'error' };
    }
  }

  // Descriptive only. has(code) = isSuperRole || permissions.includes(code). Grants nothing; owner
  // endpoints enforce. Every code below is verified against apps/api/prisma/seed.ts.
  private buildPermissions(user: AuthUser): EffectiveDiagnosticPermissions {
    const has = (code: string) => !!user.isSuperRole || user.permissions.includes(code);
    return {
      viewRecord: has('record:view'),
      changeRecord: has('record:change'),
      viewResultEntry: has('resultentry:view'),
      changeResultEntry: has('resultentry:change'),
      viewResultSheet: has('resultsheet:view'),
      createResultSheet: has('resultsheet:create'),
      authorizeResultSheet: has('resultsheet:authorize'),
      amend: has('resultentry:change') && has('resultsheet:authorize'),
      viewAiDraft: has('aidraft:view'),
      createAiDraft: has('aidraft:create'),
      viewCoding: has('record:view'),
      viewQuality: has('record:view'),
      viewConsult: has('record:view'),
      viewRecall: has('record:view'),
      viewReport: has('report:view'),
      viewChangeRequests: has('changerequest:view'),
      changeChangeRequests: has('changerequest:change'),
      isSuperRole: !!user.isSuperRole,
    };
  }

  // ONE owner read shared by the two record-derived bands (Case Identity, Diagnostic Material). Reads
  // ONLY through RecordsService.findOne (owner, mutation-free, tenant-scoped by the LabContext Prisma
  // extension). Returns a discriminated load result so each band maps truthful states without a second
  // read: forbidden (caller lacks record:view — defensive; the base gate normally enforces), error
  // (owner threw — e.g. NotFoundException, preserved as the owner reports it), or the record.
  private async loadRecord(recordId: string, user: AuthUser): Promise<RecordLoad> {
    const has = (code: string) => !!user.isSuperRole || user.permissions.includes(code);
    if (!has('record:view')) return { kind: 'forbidden' };
    try {
      const rec = await this.records.findOne(recordId);
      return { kind: 'ok', rec };
    } catch (e) {
      const reason = e instanceof NotFoundException ? 'Record not found' : 'Could not load the record';
      return { kind: 'error', reason };
    }
  }

  // Band 1: Case Identity. Missing FIELDS stay null (never an error). No synthesis.
  private sectionCaseIdentity(recordId: string, load: RecordLoad): Section<CaseIdentitySection> {
    if (load.kind === 'forbidden') return { status: 'forbidden', data: null, reason: 'record:view required' };
    if (load.kind === 'error') return { status: 'error', data: null, reason: load.reason };
    return { status: 'ready', data: this.mapCaseIdentity(recordId, load.rec) };
  }

  // Band 2: Diagnostic Material (multi-source). Three independent sources: specimens (from the SAME
  // record read — A4, no second record read), slides (WsiService.listByRecordMeta — A5), and attachments
  // (FilesService.getRecordAttachments — A6). Each sub-source carries its own status so one failure
  // isolates to it and never collapses the others. Band-level status is now all-sources-aware: `empty`
  // ONLY when every permitted source is genuinely empty; `ready` otherwise (incl. partial failure —
  // never falsely empty). A record failure → error/forbidden (whole band, since specimens derive from it).
  // `unavailable[]` names sub-sources that errored/were forbidden. No quality/adequacy/severity inference;
  // slides and attachments are Record-anchored, never specimen-linked.
  private async sectionDiagnosticMaterial(recordId: string, load: RecordLoad): Promise<Section<DiagnosticMaterialSection>> {
    if (load.kind === 'forbidden') return { status: 'forbidden', data: null, reason: 'record:view required' };
    if (load.kind === 'error') return { status: 'error', data: null, reason: load.reason };
    const rows: any[] = Array.isArray(load.rec.specimens) ? load.rec.specimens : [];
    // Deterministic order from recorded fields only: receivedAt asc (nulls last), then stable id.
    const ordered = [...rows].sort((a, b) => {
      const at = a.dateReceived ? new Date(a.dateReceived).getTime() : Infinity;
      const bt = b.dateReceived ? new Date(b.dateReceived).getTime() : Infinity;
      return at !== bt ? at - bt : String(a.id).localeCompare(String(b.id));
    });
    const total = ordered.length;
    const specimens: DiagnosticMaterialItem[] = ordered.slice(0, MATERIAL_CAP).map((s) => ({
      id: s.id,
      label: s.label ?? null,
      type: s.type ?? null,
      container: s.vialColour ?? null,
      bloodGroup: s.bloodGroup ?? null,
      receivedAt: iso(s.dateReceived),
    }));
    // Two SEPARATE, isolated owner reads (parallel). Each failure stays inside its own sub-source.
    const [slides, attachments] = await Promise.all([this.loadSlides(recordId), this.loadAttachments(recordId)]);
    // Truthful partial-failure summary: only error/forbidden sub-sources are "unavailable" (empty ≠ unavailable).
    const unavailable: UnavailableSource[] = [];
    if (slides.status === 'error' || slides.status === 'forbidden') unavailable.push({ key: 'slides', label: 'Slides', reason: slides.reason });
    if (attachments.status === 'error' || attachments.status === 'forbidden') unavailable.push({ key: 'attachments', label: 'Attachments', reason: attachments.reason });
    const data: DiagnosticMaterialSection = { recordId, specimens, summary: { total }, slides, attachments, unavailable, ownerPath: `/records/${recordId}` };

    // Band-status PRECEDENCE (frozen CANONICAL contract — identical to Diagnostic Interpretation and
    // Prior Evidence; forbidden/error are NEVER converted to empty, and forbidden NEVER collapses into error):
    //   1. any sub-source has ≥1 recorded item                          → ready (failed/forbidden siblings stay explicit)
    //   2. else no items AND ≥1 sub-source is error (technical)         → error (reason names the errored source(s))
    //   3. else no items AND ≥1 sub-source is forbidden (access)        → forbidden (access restriction, NOT technical)
    //   4. else every sub-source was accessible + successfully empty    → empty
    // (slides/attachments run under the base record:view gate today, so the forbidden branch is not reachable
    //  here; it is kept for canonical symmetry with the other multi-source bands. `ready` sub-source ⇒ items>0.)
    const anyItems = total > 0 || slides.status === 'ready' || attachments.status === 'ready';
    const errored = [slides.status === 'error' ? 'Slides' : null, attachments.status === 'error' ? 'Attachments' : null].filter(Boolean) as string[];
    const forbidden = [slides.status === 'forbidden' ? 'Slides' : null, attachments.status === 'forbidden' ? 'Attachments' : null].filter(Boolean) as string[];
    if (anyItems) return { status: 'ready', data };
    if (errored.length) return { status: 'error', data, reason: `Diagnostic material could not be loaded (${errored.join(', ')})` };
    if (forbidden.length) return { status: 'forbidden', data, reason: `Access restricted (${forbidden.join(', ')})` };
    return { status: 'empty', data }; // only when every source was accessible and successfully empty
  }

  // A5 slides sub-loader. Reads ONLY through the mutation-free WsiService.listByRecordMeta seam
  // (metadata only — no slideUrl/bytes/annotations). Failure isolates to the slides sub-source (status
  // 'error'), never affecting specimens or the band. No slides → 'empty'. Deterministic order: uploadedAt
  // desc (owner order), then stable id. `id` is exposed as the viewer-safe handoff to /wsi/:id.
  private async loadSlides(recordId: string): Promise<SlidesSubSection> {
    try {
      const rows: any[] = await this.wsi.listByRecordMeta(recordId);
      if (!Array.isArray(rows) || rows.length === 0) return { status: 'empty', items: [], total: 0 };
      const ordered = [...rows].sort((a, b) => {
        const at = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
        const bt = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
        return bt !== at ? bt - at : String(a.id).localeCompare(String(b.id));
      });
      const items: SlideItem[] = ordered.slice(0, SLIDE_CAP).map((s) => ({
        id: s.id,
        format: s.format ?? null,
        magnification: s.magnification ?? null,
        stain: s.stain ?? null,
        scanner: s.scanner ?? null,
        fileSizeBytes: typeof s.fileSizeBytes === 'number' ? s.fileSizeBytes : null,
        uploadedAt: iso(s.uploadedAt),
      }));
      return { status: 'ready', items, total: ordered.length };
    } catch {
      return { status: 'error', items: [], total: 0, reason: 'Slides could not be loaded' };
    }
  }

  // A6 attachments sub-loader. Reads ONLY through the mutation-free FilesService.getRecordAttachments.
  // The owner returns full rows (incl. storageUrl/labId); this mapper surfaces METADATA ONLY —
  // id/name/fileType/createdAt — and NEVER storageUrl/signed URLs/GCS paths/base64/bytes/credentials/
  // download tokens (FilesService remains the sole binary-delivery owner). Failure isolates to this
  // sub-source ('error'), never affecting specimens or slides. No attachments → 'empty'. The owner
  // already orders by createdAt desc; re-sorted deterministically (createdAt desc, then name, then id).
  private async loadAttachments(recordId: string): Promise<AttachmentsSubSection> {
    try {
      const rows: any[] = await this.files.getRecordAttachments(recordId);
      if (!Array.isArray(rows) || rows.length === 0) return { status: 'empty', items: [], total: 0 };
      const ordered = [...rows].sort((a, b) => {
        const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (bt !== at) return bt - at;
        const an = a.filename ?? '';
        const bn = b.filename ?? '';
        return an !== bn ? an.localeCompare(bn) : String(a.id).localeCompare(String(b.id));
      });
      const items: AttachmentRow[] = ordered.slice(0, ATTACHMENT_CAP).map((a) => ({
        id: a.id,
        name: a.filename ?? null, // recorded filename only
        fileType: a.kind ?? null, // recorded MIME only — no semantic inference; NO storageUrl mapped
        createdAt: iso(a.createdAt),
      }));
      return { status: 'ready', items, total: ordered.length };
    } catch {
      return { status: 'error', items: [], total: 0, reason: 'Attachments could not be loaded' };
    }
  }

  // Band 3: Diagnostic Interpretation (multi-source). Two INDEPENDENT sub-sources (Bethesda, Coding),
  // each with its own permission + failure state. If the root record read failed/was forbidden, the
  // downstream interpretation owners are NOT invoked (the band mirrors the root, consistent with the
  // established orchestration). Otherwise the two owner reads run in parallel and isolate their own
  // failures. Band-status truth table below; `unavailable[]` names error OR forbidden sub-sources
  // (consistent with A6). No diagnosis synthesis; sources are shown separately, verbatim.
  private async sectionDiagnosticInterpretation(recordId: string, load: RecordLoad, user: AuthUser): Promise<Section<DiagnosticInterpretationSection>> {
    if (load.kind === 'forbidden') return { status: 'forbidden', data: null, reason: 'record:view required' };
    if (load.kind === 'error') return { status: 'error', data: null, reason: load.reason };
    const has = (code: string) => !!user.isSuperRole || user.permissions.includes(code);
    // Independent reads, parallel. Bethesda gates on resultentry:view (narrower); Coding on record:view.
    const [bethesda, coding] = await Promise.all([
      this.loadBethesda(recordId, has('resultentry:view')),
      this.loadCoding(recordId, has('record:view')),
    ]);
    const unavailable: UnavailableSource[] = [];
    if (bethesda.status === 'error' || bethesda.status === 'forbidden') unavailable.push({ key: 'bethesda', label: 'Bethesda', reason: bethesda.reason });
    if (coding.status === 'error' || coding.status === 'forbidden') unavailable.push({ key: 'coding', label: 'Coding', reason: coding.reason });
    const data: DiagnosticInterpretationSection = { recordId, bethesda, coding, unavailable, ownerPath: `/records/${recordId}` };

    // Band-status PRECEDENCE (frozen contract; forbidden/error are NEVER converted to empty):
    //   1. any sub-source has recorded evidence                         → ready (failed/forbidden siblings stay explicit)
    //   2. else no evidence AND ≥1 sub-source is error (technical)       → error (reason names the errored source(s))
    //   3. else no evidence AND ≥1 sub-source is forbidden (access)      → forbidden (reason = access restriction, NOT technical)
    //   4. else every sub-source was accessible + successfully empty     → empty
    // i.e. recorded evidence → ready · else technical failure → error · else access restriction → forbidden · else empty.
    const anyItems = bethesda.status === 'ready' || coding.status === 'ready';
    const errored = [bethesda.status === 'error' ? 'Bethesda' : null, coding.status === 'error' ? 'Coding' : null].filter(Boolean) as string[];
    const forbidden = [bethesda.status === 'forbidden' ? 'Bethesda' : null, coding.status === 'forbidden' ? 'Coding' : null].filter(Boolean) as string[];
    if (anyItems) return { status: 'ready', data };
    if (errored.length) return { status: 'error', data, reason: `Diagnostic interpretation could not be loaded (${errored.join(', ')})` };
    if (forbidden.length) return { status: 'forbidden', data, reason: `Access restricted (${forbidden.join(', ')})` };
    return { status: 'empty', data }; // only when every source was accessible and successfully empty
  }

  // Bethesda sub-source. resultentry:view required (narrower than base). One-per-record (findFirst) →
  // ready | empty. Explicit allowlist mapping (no spread; excludes id/recordId/labId/reportedById/
  // updatedAt/generatedNarrative). Failure isolates to this sub-source.
  private async loadBethesda(recordId: string, allowed: boolean): Promise<BethesdaSubSection> {
    if (!allowed) return { status: 'forbidden', data: null, reason: 'resultentry:view required' };
    try {
      const r: any = await this.bethesda.getByRecord(recordId);
      if (!r) return { status: 'empty', data: null };
      return { status: 'ready', data: this.mapBethesda(r) };
    } catch {
      return { status: 'error', data: null, reason: 'Bethesda could not be loaded' };
    }
  }

  private mapBethesda(r: any): BethesdaEvidence {
    return {
      adequacy: r.specimenAdequacy ?? null,
      unsatisfactoryReason: r.unsatisfactoryReason ?? null,
      generalCategory: r.generalCategory ?? null,
      squamousCategory: r.squamousCategory ?? null,
      ascSubtype: r.ascSubtype ?? null,
      glandularCategory: r.glandularCategory ?? null,
      glandularSubtype: r.glandularSubtype ?? null,
      otherMalignancy: r.otherMalignancy ?? null,
      organisms: Array.isArray(r.organisms) ? r.organisms : [],
      otherNonNeoplastic: Array.isArray(r.otherNonNeoplastic) ? r.otherNonNeoplastic : [],
      hpvResult: r.hpvResult ?? null,
      hpvGenotype: r.hpvGenotype ?? null,
      recommendation: r.recommendation ?? null,
      recommendationNotes: r.recommendationNotes ?? null,
      shortCode: r.shortCode ?? null,
      reportedBy: fullName(r.reportedBy),
      reportedAt: iso(r.reportedAt),
    };
  }

  // Coding sub-source. record:view required. Explicit allowlist (no spread; excludes coding `notes` and
  // raw code.id). Owner already orders assignedAt asc; re-sorted deterministically (assignedAt asc,
  // then stable id) and capped at CODING_CAP with the true total preserved. NEVER calls suggest().
  private async loadCoding(recordId: string, allowed: boolean): Promise<CodingSubSection> {
    if (!allowed) return { status: 'forbidden', items: [], total: 0, reason: 'record:view required' };
    try {
      const rows: any[] = await this.coding.getRecordCodings(recordId);
      if (!Array.isArray(rows) || rows.length === 0) return { status: 'empty', items: [], total: 0 };
      const ordered = [...rows].sort((a, b) => {
        const at = a.assignedAt ? new Date(a.assignedAt).getTime() : 0;
        const bt = b.assignedAt ? new Date(b.assignedAt).getTime() : 0;
        return at !== bt ? at - bt : String(a.id).localeCompare(String(b.id));
      });
      const items: CodingRow[] = ordered.slice(0, CODING_CAP).map((c) => ({
        id: c.id,
        codeType: c.codeType ?? null,
        system: c.code?.system ?? null,
        code: c.code?.code ?? null,
        display: c.code?.display ?? null,
        category: c.code?.category ?? null,
        assignedBy: fullName(c.assignedBy),
        assignedAt: iso(c.assignedAt),
      }));
      return { status: 'ready', items, total: ordered.length };
    } catch {
      return { status: 'error', items: [], total: 0, reason: 'Coding could not be loaded' };
    }
  }

  // Band 4: Decision Support (single source — AI reporting draft metadata). If the root record read
  // failed/was forbidden, the owner is NOT invoked (band mirrors the root). Otherwise the band mirrors
  // its single sub-source status. No diagnosis synthesis; assistive provenance only.
  private async sectionDecisionSupport(recordId: string, load: RecordLoad, user: AuthUser): Promise<Section<DecisionSupportSection>> {
    if (load.kind === 'forbidden') return { status: 'forbidden', data: null, reason: 'record:view required' };
    if (load.kind === 'error') return { status: 'error', data: null, reason: load.reason };
    const has = (code: string) => !!user.isSuperRole || user.permissions.includes(code);
    const aiDrafts = await this.loadAiDrafts(recordId, has('aidraft:view'));
    const data: DecisionSupportSection = { recordId, aiDrafts, ownerPath: `/records/${recordId}` };
    // Single source: the band mirrors the sub-source status (A7 precedence collapses to one source).
    return { status: aiDrafts.status, data, reason: aiDrafts.reason };
  }

  // AI reporting drafts sub-loader. Reads ONLY through the mutation-free AiReportingService.draftsByRecord
  // seam (the read is NOT model-backed — it lists persisted drafts). aidraft:view required (narrower than
  // base). Explicit allowlist: METADATA ONLY — never `output`/`finalText`/prompts/reasoning/model payload,
  // and NEVER the raw `editedDiff` (mapped to an `edited` presence boolean). Owner orders createdAt desc;
  // re-sorted deterministically (createdAt desc, then stable id) and capped at DRAFT_CAP with true total.
  private async loadAiDrafts(recordId: string, allowed: boolean): Promise<AiDraftsSubSection> {
    if (!allowed) return { status: 'forbidden', items: [], total: 0, reason: 'aidraft:view required' };
    try {
      const rows: any[] = await this.aiReporting.draftsByRecord(recordId);
      if (!Array.isArray(rows) || rows.length === 0) return { status: 'empty', items: [], total: 0 };
      const ordered = [...rows].sort((a, b) => {
        const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bt !== at ? bt - at : String(a.id).localeCompare(String(b.id));
      });
      const items: AiDraftMeta[] = ordered.slice(0, DRAFT_CAP).map((d) => ({
        id: d.id,
        kind: d.kind ?? null,
        status: d.status ?? null,
        model: d.model ?? null,
        promptVersion: d.promptVersion ?? null,
        createdAt: iso(d.createdAt),
        createdBy: fullName(d.createdBy),
        acceptedAt: iso(d.acceptedAt),
        acceptedBy: fullName(d.acceptedBy),
        edited: !!d.editedDiff, // presence boolean ONLY — raw editedDiff/output/finalText never surfaced
      }));
      return { status: 'ready', items, total: ordered.length };
    } catch {
      return { status: 'error', items: [], total: 0, reason: 'AI drafts could not be loaded' };
    }
  }

  // Band 5: Prior Evidence (multi-source; patient-anchored). Loaded AFTER the root record read (needs
  // patientId). Two independent sub-sources isolate their own failures. No current-vs-prior comparison,
  // no progression/recurrence/trend/concordance inference — prior evidence shown as recorded, per source.
  private async sectionPriorEvidence(recordId: string, load: RecordLoad, user: AuthUser): Promise<Section<PriorEvidenceSection>> {
    if (load.kind === 'forbidden') return { status: 'forbidden', data: null, reason: 'record:view required' };
    if (load.kind === 'error') return { status: 'error', data: null, reason: load.reason };
    const patientId: string | null = load.rec?.patientId ?? null;
    const has = (code: string) => !!user.isSuperRole || user.permissions.includes(code);
    const [priorRecords, correlation] = await Promise.all([
      this.loadPriorRecords(patientId, recordId, has('resultentry:view')),
      this.loadCorrelation(patientId, has('record:view')),
    ]);
    const unavailable: UnavailableSource[] = [];
    if (priorRecords.status === 'error' || priorRecords.status === 'forbidden') unavailable.push({ key: 'priorRecords', label: 'Prior records', reason: priorRecords.reason });
    if (correlation.status === 'error' || correlation.status === 'forbidden') unavailable.push({ key: 'correlation', label: 'Correlation', reason: correlation.reason });
    const data: PriorEvidenceSection = { recordId, priorRecords, correlation, unavailable, ownerPath: `/records/${recordId}` };
    // Frozen precedence: recorded evidence → ready; else technical failure → error; else access
    // restriction → forbidden; else empty (accessible + empty).
    const anyItems = priorRecords.status === 'ready' || correlation.status === 'ready';
    const errored = [priorRecords.status === 'error' ? 'Prior records' : null, correlation.status === 'error' ? 'Correlation' : null].filter(Boolean) as string[];
    const forbidden = [priorRecords.status === 'forbidden' ? 'Prior records' : null, correlation.status === 'forbidden' ? 'Correlation' : null].filter(Boolean) as string[];
    if (anyItems) return { status: 'ready', data };
    if (errored.length) return { status: 'error', data, reason: `Prior evidence could not be loaded (${errored.join(', ')})` };
    if (forbidden.length) return { status: 'forbidden', data, reason: `Access restricted (${forbidden.join(', ')})` };
    return { status: 'empty', data };
  }

  // Prior records sub-loader. Reads ONLY RecordsService.priorsByPatient (mutation-free, patient-anchored,
  // excludes the current record, owner-bounded take:50, createdAt desc). Historical Bethesda stays embedded
  // per record. resultentry:view required (the projection exposes Bethesda selections). Presence-only for
  // result sheets/reports (no content). No patient → empty; failure → error.
  private async loadPriorRecords(patientId: string | null, currentRecordId: string, allowed: boolean): Promise<PriorRecordsSubSection> {
    if (!allowed) return { status: 'forbidden', items: [], total: 0, reason: 'resultentry:view required' };
    if (!patientId) return { status: 'empty', items: [], total: 0 };
    try {
      const rows: any[] = await this.records.priorsByPatient(patientId, currentRecordId);
      if (!Array.isArray(rows) || rows.length === 0) return { status: 'empty', items: [], total: 0 };
      const items: PriorRecordItem[] = rows.slice(0, PRIOR_CAP).map((r) => {
        const sheets: any[] = Array.isArray(r.resultSheets) ? r.resultSheets : [];
        const b = r.bethesdaResult;
        return {
          id: r.id,
          labNumber: r.labNumber ?? null,
          identifier: r.identifier,
          formType: r.formType ?? null,
          status: r.status,
          specimenDate: iso(r.specimenDate),
          statusChangedAt: iso(r.dateStatus),
          createdAt: iso(r.createdAt),
          bethesda: b
            ? {
                adequacy: b.specimenAdequacy ?? null,
                generalCategory: b.generalCategory ?? null,
                squamousCategory: b.squamousCategory ?? null,
                ascSubtype: b.ascSubtype ?? null,
                glandularCategory: b.glandularCategory ?? null,
                glandularSubtype: b.glandularSubtype ?? null,
              }
            : null,
          hasAuthorizedResultSheet: sheets.some((s) => !!s.authorized),
          hasReport: sheets.some((s) => Array.isArray(s.reports) && s.reports.length > 0),
          ownerPath: `/records/${r.id}`,
        };
      });
      return { status: 'ready', items, total: rows.length };
    } catch {
      return { status: 'error', items: [], total: 0, reason: 'Prior records could not be loaded' };
    }
  }

  // Band 7: Reporting & Sign-Out (single source — result-sheet reporting metadata). Loaded after the
  // root record read. Root failure → band mirrors root (owner not invoked). Sign-Out is NOT modified;
  // this reuses ResultSheetsService.metaByRecord + eventsByRecord (the same reads Sign-Out composes).
  private async sectionReportingSignOut(recordId: string, load: RecordLoad, user: AuthUser, rsEvents: RsEventsLoad): Promise<Section<ReportingSignOutSection>> {
    if (load.kind === 'forbidden') return { status: 'forbidden', data: null, reason: 'record:view required' };
    if (load.kind === 'error') return { status: 'error', data: null, reason: load.reason };
    const has = (code: string) => !!user.isSuperRole || user.permissions.includes(code);
    const resultSheets = await this.loadReporting(recordId, has('resultsheet:view'), rsEvents);
    const data: ReportingSignOutSection = { recordId, resultSheets, ownerPath: `/sign-out/${recordId}` };
    return { status: resultSheets.status, data, reason: resultSheets.reason };
  }

  // Reporting sub-loader. Composes ResultSheetsService.metaByRecord (per-sheet authorization/report/entry
  // metadata) with the SHARED eventsByRecord result (authorization/amendment event types) — both
  // mutation-free, resultsheet:view. The event read is the ONE shared read (A11 + A12); it is NOT re-issued
  // here. A11 behavior is preserved exactly: missing resultsheet:view → forbidden; a FAILED event read
  // (rsEvents.error) → error; a failed meta read → error; amended/reauthorized/deauthorized derived ONLY
  // from recorded ResultSheetEvent types scoped by resultSheetId (mirrors Sign-Out). Allowlist METADATA only
  // — NO report prose/result content/narrative; report presence via `_count.reports`. Owner order
  // (createdAt desc) preserved; capped RESULTSHEET_CAP. No sheets → empty.
  private async loadReporting(recordId: string, allowed: boolean, rsEvents: RsEventsLoad): Promise<ReportingResultSheetsSubSection> {
    if (!allowed) return { status: 'forbidden', items: [], total: 0, reason: 'resultsheet:view required' };
    // A failed shared event read is a reporting failure — identical to the prior Promise.all, where an
    // eventsByRecord rejection surfaced as error.
    if (rsEvents.kind === 'error') return { status: 'error', items: [], total: 0, reason: 'Reporting could not be loaded' };
    try {
      const sheets: any[] = await this.resultSheets.metaByRecord(recordId);
      if (!Array.isArray(sheets) || sheets.length === 0) return { status: 'empty', items: [], total: 0 };
      const evList: any[] = rsEvents.kind === 'ok' ? rsEvents.events : [];
      const items: ResultSheetSummary[] = sheets.slice(0, RESULTSHEET_CAP).map((s) => {
        const evs = evList.filter((e) => e.resultSheetId === s.id);
        const hasDeauth = evs.some((e) => e.type === 'Deauthorized');
        const hasReauth = evs.some((e) => e.type === 'Reauthorized');
        return {
          id: s.id,
          authorized: !!s.authorized,
          authorizedAt: iso(s.authorizedAt),
          authorizedBy: fullName(s.authorizedBy),
          viewed: !!s.viewed,
          createdAt: iso(s.createdAt),
          entryCount: s._count?.resultEntries ?? 0,
          hasReport: (s._count?.reports ?? 0) > 0, // report record exists — NOT a release/publish claim

          amended: hasDeauth || hasReauth,
          reauthorized: hasReauth,
          deauthorized: !s.authorized && hasDeauth,
        };
      });
      return { status: 'ready', items, total: sheets.length };
    } catch {
      return { status: 'error', items: [], total: 0, reason: 'Reporting could not be loaded' };
    }
  }

  // Band 8: Timeline & Provenance (A12 — the final Phase 3A band). Composes the two authoritative persisted
  // event streams into ONE unified chronological list. Root failure/forbidden → band mirrors the root (data
  // null; result-sheet owner not invoked). Otherwise:
  //   • Record-lifecycle sub-source: mapped from the already-loaded record's statusHistory (record:view via
  //     the base gate — so it is never independently forbidden/errored here; it only contributes events or
  //     nothing). NO synthetic Record.createdAt event; a record with no status events contributes none.
  //   • Result-sheet sub-source: from the SHARED eventsByRecord read (resultsheet:view). forbidden/error is
  //     isolated — it NEVER hides available lifecycle events; it is named truthfully in `unavailable[]`.
  // Band precedence (frozen): any events → ready; else result-sheet error → error; else result-sheet
  // forbidden → forbidden; else empty. Never converts forbidden/error into empty. Metadata only.
  private sectionTimelineProvenance(recordId: string, load: RecordLoad, rsEvents: RsEventsLoad): Section<TimelineProvenanceSection> {
    if (load.kind === 'forbidden') return { status: 'forbidden', data: null, reason: 'record:view required' };
    if (load.kind === 'error') return { status: 'error', data: null, reason: load.reason };

    const recordEvents = this.mapRecordLifecycleEvents(recordId, load.rec);
    const resultSheetEvents = this.mapResultSheetEvents(recordId, rsEvents);

    const unavailable: UnavailableSource[] = [];
    if (rsEvents.kind === 'forbidden') {
      unavailable.push({ key: 'result-sheet', label: 'Result-sheet events', reason: 'resultsheet:view required' });
    } else if (rsEvents.kind === 'error') {
      unavailable.push({ key: 'result-sheet', label: 'Result-sheet events', reason: 'Result-sheet events could not be loaded' });
    }

    const all = [...recordEvents, ...resultSheetEvents].sort(timelineSort);
    const total = all.length; // full normalized count BEFORE slicing — never silently discarded
    const truncated = total > TIMELINE_CAP;
    const events = all.slice(0, TIMELINE_CAP);
    const data: TimelineProvenanceSection = { recordId, events, total, truncated, unavailable, ownerPath: `/records/${recordId}` };

    if (total > 0) return { status: 'ready', data };
    if (rsEvents.kind === 'error') return { status: 'error', data, reason: 'Result-sheet events could not be loaded' };
    if (rsEvents.kind === 'forbidden') return { status: 'forbidden', data, reason: 'resultsheet:view required' };
    return { status: 'empty', data };
  }

  // Record-lifecycle events from the already-loaded record's persisted statusHistory (RecordStatusEvent).
  // NO synthetic creation event; skips rows with no recorded time. Allowlist: id (source-prefixed), status
  // (→ factual label), createdAt, actor display name. Excludes notes, raw userId, and record identity.
  private mapRecordLifecycleEvents(recordId: string, rec: any): TimelineEvent[] {
    const hist: any[] = Array.isArray(rec?.statusHistory) ? rec.statusHistory : [];
    const out: TimelineEvent[] = [];
    for (const h of hist) {
      const occurredAt = iso(h?.createdAt);
      if (!occurredAt) continue;
      out.push({
        id: `status-${h.id}`,
        source: 'record-status',
        eventType: `Status set to ${h.status}`,
        occurredAt,
        actor: fullName(h.user),
        ownerPath: `/records/${recordId}`,
      });
    }
    return out;
  }

  // Result-sheet events from the SHARED eventsByRecord result (ResultSheetEvent). Empty for forbidden/error
  // (those states are surfaced by the band, not here). Skips rows with no recorded time. Allowlist: id
  // (source-prefixed), type (→ fixed factual label), createdAt, actor display name. Excludes resultSheetId,
  // raw userId, and all report content/narrative/diagnosis.
  private mapResultSheetEvents(recordId: string, rsEvents: RsEventsLoad): TimelineEvent[] {
    if (rsEvents.kind !== 'ok') return [];
    const out: TimelineEvent[] = [];
    for (const e of rsEvents.events) {
      const occurredAt = iso(e?.createdAt);
      if (!occurredAt) continue;
      out.push({
        id: `result-sheet-${e.id}`,
        source: 'result-sheet',
        eventType: RSE_LABEL[e.type] ?? String(e.type),
        occurredAt,
        actor: fullName(e.user),
        ownerPath: `/sign-out/${recordId}`,
      });
    }
    return out;
  }

  // Band 6: Collaboration (single source — record-scoped escalation metadata). Loaded after the root
  // record read. If the root read failed/was forbidden, the escalation owner is NOT invoked (band mirrors
  // the root). Single-source: the band mirrors the escalation sub-source status.
  private async sectionCollaboration(recordId: string, load: RecordLoad, user: AuthUser): Promise<Section<CollaborationSection>> {
    if (load.kind === 'forbidden') return { status: 'forbidden', data: null, reason: 'record:view required' };
    if (load.kind === 'error') return { status: 'error', data: null, reason: load.reason };
    const has = (code: string) => !!user.isSuperRole || user.permissions.includes(code);
    const escalations = await this.loadEscalations(recordId, user.userId, has('record:view'));
    const data: CollaborationSection = { recordId, escalations, ownerPath: `/records/${recordId}` };
    return { status: escalations.status, data, reason: escalations.reason };
  }

  // Escalation sub-loader. Reads ONLY EscalationService.list({ recordId }, userId) — the RECORD-SCOPED
  // owner seam (no lab-wide read, no client-side filtering). The authenticated caller's real userId is
  // passed through (owner visibility preserved). Owner order (severity rank, then createdAt desc) is
  // PRESERVED — never re-ranked. Allowlist METADATA only; excludes reviewNotes/resolvedReason/updatedAt,
  // the nested record/patient/Bethesda/generatedNarrative, and raw user ids (names only). No patient →
  // n/a (escalation is record-scoped). No rows → empty; failure → error.
  private async loadEscalations(recordId: string, userId: string, allowed: boolean): Promise<EscalationsSubSection> {
    if (!allowed) return { status: 'forbidden', items: [], total: 0, reason: 'record:view required' };
    try {
      const rows: any[] = await this.escalation.list({ recordId }, userId);
      if (!Array.isArray(rows) || rows.length === 0) return { status: 'empty', items: [], total: 0 };
      const items: EscalationItem[] = rows.slice(0, ESCALATION_CAP).map((e) => ({
        id: e.id,
        severity: e.severity ?? null,
        trigger: e.trigger ?? null,
        status: e.status ?? null,
        createdAt: iso(e.createdAt),
        physicianNotifiedAt: iso(e.physicianNotifiedAt),
        physicianNotifiedVia: e.physicianNotifiedVia ?? null,
        reviewedAt: iso(e.reviewedAt),
        resolvedAt: iso(e.resolvedAt),
        assignedTo: fullName(e.assignedTo),
        reviewedBy: fullName(e.reviewedBy),
        ownerPath: '/escalations',
      }));
      return { status: 'ready', items, total: rows.length };
    } catch {
      return { status: 'error', items: [], total: 0, reason: 'Escalations could not be loaded' };
    }
  }

  // Correlation sub-loader. Reads ONLY CorrelationService.byPatient (mutation-free, PATIENT-level,
  // cytologyDate desc). record:view required. Rows are NOT filtered — a correlation tied to the current
  // record may be present and is surfaced neutrally (never labeled "prior"); no owner contract requires
  // excluding it, and cytologyRecordId is NOT exposed. NARROW allowlist: existence + owner-recorded
  // classification only — NO cytology/histology diagnosis text, NO review/notes/outcome/discordanceReason,
  // NO patient identity, NO updatedAt. No patient → empty; failure → error. byCytologyRecord is NEVER called.
  private async loadCorrelation(patientId: string | null, allowed: boolean): Promise<CorrelationSubSection> {
    if (!allowed) return { status: 'forbidden', items: [], total: 0, reason: 'record:view required' };
    if (!patientId) return { status: 'empty', items: [], total: 0 };
    try {
      const rows: any[] = await this.correlation.byPatient(patientId);
      if (!Array.isArray(rows) || rows.length === 0) return { status: 'empty', items: [], total: 0 };
      const items: CorrelationItem[] = rows.slice(0, CORRELATION_CAP).map((c) => ({
        id: c.id,
        cytologyDate: iso(c.cytologyDate),
        histologyDate: iso(c.histologyDate),
        histologySource: c.histologySource ?? null,
        externalLabName: c.externalLabName ?? null,
        correlationResult: c.correlationResult ?? null,
        createdAt: iso(c.createdAt),
        ownerPath: `/correlation/${c.id}`,
      }));
      return { status: 'ready', items, total: rows.length };
    } catch {
      return { status: 'error', items: [], total: 0, reason: 'Correlation could not be loaded' };
    }
  }

  private mapCaseIdentity(recordId: string, r: any): CaseIdentitySection {
    const client = r.client
      ? {
          name: r.client.officeName || fullName(r.client) || null,
          accountNo: r.client.accountNo ?? null,
          type: r.client.clientType?.type ?? null,
        }
      : null;
    return {
      recordId,
      identifier: r.identifier,
      labNumber: r.labNumber ?? null,
      formType: r.formType ?? null,
      status: r.status, // stored RecordStatus, verbatim
      urgent: !!r.urgent, // recorded flag only
      specimenDate: iso(r.specimenDate),
      registeredAt: iso(r.createdAt),
      statusChangedAt: iso(r.dateStatus),
      patient: r.patient
        ? {
            name: fullName(r.patient),
            registrationNo: r.patient.registrationNo ?? null,
            gender: r.patient.gender ?? null,
            dateOfBirth: iso(r.patient.dateOfBirth),
          }
        : null,
      referringDoctor: r.doctor ?? null,
      clinicalIndication: r.clinicalDiagnosis ?? null, // referring impression, not a diagnosis
      medicalEntry: r.medicalEntry ?? null,
      client,
      assignedTo: r.assignedTo
        ? { name: fullName(r.assignedTo), at: iso(r.assignedAt) }
        : null,
      ownerPath: `/records/${recordId}`,
    };
  }

  // ── B7: Ancillary Orders band (read-only composition of the AncillaryOrders owner) ──────────────
  // Reuses ONLY the mutation-free owner read AncillaryOrdersService.listByRecord(recordId). No Prisma,
  // no owner mutation, no lifecycle logic duplicated. Gated descriptively on the base record:view.
  // Failure isolation: an owner throw yields status 'error' for THIS band ONLY (siblings unaffected).
  // Truthfulness: statuses shown verbatim; Completed means only that the owner recorded Completed.
  private async sectionAncillaryOrders(recordId: string, user: AuthUser): Promise<Section<AncillaryOrdersSection>> {
    const has = (code: string) => !!user.isSuperRole || user.permissions.includes(code);
    if (!has('record:view')) return { status: 'forbidden', data: null, reason: 'record:view required' };
    try {
      const rows: any[] = await this.ancillary.listByRecord(recordId);
      const items = (Array.isArray(rows) ? rows : []).map((o) => this.mapAncillaryOrder(o));
      const data: AncillaryOrdersSection = { recordId, items, total: items.length, ownerPath: '/ancillary-orders' };
      return { status: items.length ? 'ready' : 'empty', data };
    } catch {
      return { status: 'error', data: null, reason: 'Ancillary orders could not be loaded' };
    }
  }

  // Explicit allowlist — owner metadata only. Never labId / orderedById / nested relations / storage.
  private mapAncillaryOrder(o: any): AncillaryOrderItem {
    return {
      id: o.id,
      kind: o.kind,
      target: o.target,
      status: o.status,
      blocksSignOut: !!o.blocksSignOut,
      orderedAt: iso(o.orderedAt),
      updatedAt: iso(o.updatedAt),
      completedAt: iso(o.completedAt),
      notes: o.notes ?? null,
    };
  }

  // ── C8: Screening Batch band (read-only composition of the ScreeningBatch owner) ────────────────
  // Reuses ONLY the mutation-free owner read ScreeningBatchesService.listByRecord(recordId). No Prisma,
  // no owner mutation, no lifecycle logic duplicated. Gated descriptively on the base record:view.
  // Failure isolation: an owner throw yields status 'error' for THIS band ONLY (siblings unaffected).
  // Truthfulness: batch status and disposition shown verbatim — Completed means only that the owner
  // recorded every membership as dispositioned; QCSelected means selected for QC only; no active
  // membership is NOT "screening not required". No diagnosis/QC/sign-out/authorization inference.
  private async sectionScreeningBatches(recordId: string, user: AuthUser): Promise<Section<ScreeningBatchesSection>> {
    const has = (code: string) => !!user.isSuperRole || user.permissions.includes(code);
    if (!has('record:view')) return { status: 'forbidden', data: null, reason: 'record:view required' };
    try {
      const rows: any[] = await this.screening.listByRecord(recordId);
      const items = (Array.isArray(rows) ? rows : []).map((m) => this.mapScreeningMembership(m));
      const data: ScreeningBatchesSection = { recordId, items, total: items.length, ownerPath: '/screening-batches' };
      return { status: items.length ? 'ready' : 'empty', data };
    } catch {
      return { status: 'error', data: null, reason: 'Screening batches could not be loaded' };
    }
  }

  // Explicit allowlist — owner metadata only. Never labId / createdById / assignedById / screenedById /
  // notes / nested Batch or Record.
  private mapScreeningMembership(m: any): ScreeningBatchMembershipItem {
    return {
      caseId: m.caseId,
      batchId: m.batchId,
      batchNumber: m.batchNumber,
      batchStatus: m.batchStatus,
      assignedToId: m.assignedToId ?? null,
      disposition: m.disposition,
      addedAt: iso(m.addedAt),
      screenedAt: iso(m.screenedAt),
      startedAt: iso(m.startedAt),
      completedAt: iso(m.completedAt),
    };
  }
}
