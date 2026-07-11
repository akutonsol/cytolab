import { Injectable, NotFoundException } from '@nestjs/common';
import { RecordsService } from '../records/records.service';
import { WsiService } from '../wsi/wsi.service';
import { AIScreeningService } from '../ai-screening/ai-screening.service';
import { BethesdaService, deriveShortCode } from '../bethesda/bethesda.service';
import { CorrelationService } from '../correlation/correlation.service';
import { FilesService } from '../files/files.service';
import { ResultSheetsService } from '../result-sheets/result-sheets.service';
import { AiReportingService } from '../ai/ai-reporting.service';
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

export interface SlideMeta {
  id: string;
  format: string | null;
  magnification: string | null;
  stain: string | null;
  scanner: string | null;
  fileSizeBytes: number | null;
  uploadedAt: string | null;
  /** The existing viewer route — the viewer owns image delivery, not this aggregate. */
  viewerPath: string;
}

export interface SlidesSection {
  count: number;
  items: SlideMeta[];
}

// ── AI screening evidence (read-only projection of the owner's recorded result) ──
// Every field is a stored value from AIScreeningResult. `regions` mirrors the recorded
// findings JSON — it is recorded evidence, NOT a quantification. `confidence` is the
// model's recorded confidence, NOT a diagnosis. `agreedWithAI` is a recorded review
// outcome, NOT proof that interpretation preceded the AI (no temporal claim).
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

// ── Bethesda evidence (read-only projection of the owner's recorded result) ──
// shortCode is the owner's deterministic mapping of the stored classification, not an
// inference from free text. Narrative is the owner's stored generatedNarrative.
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

// ── Cytology–histology correlation evidence (read-only projection) ──
// correlationResult (incl. discordance) is shown ONLY as stored; discordance is never
// inferred here. ownerPath opens the existing correlation surface for this case.
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

// ── Prior-aware review (read-only, patient-linked) ──
// A prior is a real patient-linked record or correlation case (never the anchor record).
// Nothing here infers a longitudinal trend, progression, recurrence, or clinical relation
// beyond sharing the patient. `resultSummary` is a stored value only (prior Bethesda
// shortCode for a record; stored correlationResult for a correlation) — never inferred.
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
// Per-source health so one failing source (records vs correlation) is marked unavailable
// without collapsing the others.
export interface PriorsSourceHealth {
  records: 'ready' | 'error' | 'forbidden';
  correlation: 'ready' | 'error' | 'forbidden';
}
export interface PriorsSection {
  count: number;
  items: PriorEntry[];
  sources: PriorsSourceHealth;
  /** True only when more than the 25-entry cap existed and the list was trimmed. */
  truncated: boolean;
}

// ── Attachments (read-only metadata projection of RecordAttachment) ──
// Metadata ONLY — never storageUrl. In fallback mode storageUrl is a base64 data URI
// (the file bytes); the aggregate must not carry bytes. `kind` is the stored type as the
// file owner recorded it (no invented category). The file owner still serves the bytes.
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

// ── Unified timeline (composed only from recorded events across owners) ──
// Every item is a real recorded, timestamped event. No event is invented from a state,
// no actor or timestamp is inferred, and generic updatedAt fields are never used. Items
// carry their source so users can tell where each came from; a null actor renders as
// "Actor not recorded". Ordering is chronological (see timelineSort).
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
  /** Human labels of sources that could not be included (failed or not permitted). */
  unavailable: string[];
}

// ── Result sheets (read-only metadata projection) ──
// Metadata ONLY — never result entries/lines content. The result-sheet system remains
// the sole owner of editing, validation, save behaviour, and report generation. `authorized`
// is the recorded state; no status or draft is inferred. reportCount/entryCount are safe
// counts, not content.
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
}
export interface ResultSheetsSection {
  count: number;
  items: ResultSheetMeta[];
}

// ── AI drafts (read-only metadata projection) ──
// Metadata ONLY — never the model `output` or accepted `finalText` (the drafted content),
// and no prompt contents. The AI reporting system remains the sole owner of generation,
// prompting, persistence, acceptance, regeneration, edit history, and the structured diff.
// `status` is the recorded draft state (never inferred); `model`/`promptVersion` are the
// recorded provenance (never inferred); `hasStructuredDiff` is availability, not content.
export interface AiDraftMeta {
  id: string;
  resultSheetId: string; // owner invocation identifier (the sheet the draft belongs to)
  kind: string; // Narrative | CodeSuggestion | ConsistencyCheck (recorded)
  status: string; // Generated | Accepted | Rejected | Superseded (recorded)
  model: string | null; // recorded model id, if recorded
  promptVersion: string | null; // recorded prompt version, if recorded
  createdAt: string | null; // generated timestamp
  createdByName: string | null; // who generated it
  acceptedAt: string | null; // when accepted, if accepted
  reviewerName: string | null; // human reviewer who accepted, if recorded
  hasStructuredDiff: boolean; // structured diff availability (never the diff content)
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

const deferred = (): Section<null> => ({ status: 'deferred', data: null });

@Injectable()
export class SignoutService {
  constructor(
    private readonly records: RecordsService,
    private readonly wsi: WsiService,
    private readonly ai: AIScreeningService,
    private readonly bethesda: BethesdaService,
    private readonly correlation: CorrelationService,
    private readonly files: FilesService,
    private readonly resultSheets: ResultSheetsService,
    private readonly aiReporting: AiReportingService,
  ) {}

  async caseAggregate(recordId: string, user: AuthUser): Promise<SignOutCaseAggregate> {
    const asOf = new Date().toISOString();

    // Permissions resolve independently of the case load, so they survive a
    // downstream failure (partial-failure tolerance).
    const perms = buildPermissions(user);
    const permissions: Section<EffectivePermissions> = { status: 'ready', data: perms };

    // Slides resolve independently of the case read (partial-failure): a slide-metadata
    // failure marks only this section, never the case context. Metadata only — the
    // viewer owns image delivery. Access is covered by record:view (the endpoint gate),
    // so `forbidden` cannot occur here in practice; the guard is kept for the contract.
    // Each diagnostic-evidence section resolves independently from its own owner
    // service; one failing (or being empty/forbidden) never affects the others or the
    // case context (partial-failure tolerance). Run them together — they are unrelated.
    const [slides, ai, bethesda, correlation, attachments, resultSheets, aiDraft] = await Promise.all([
      this.loadSlides(recordId, perms.viewSlide),
      this.loadAI(recordId, perms.viewAI),
      this.loadBethesda(recordId, perms.viewBethesda),
      this.loadCorrelation(recordId, perms.viewCorrelation),
      this.loadAttachments(recordId, perms.viewAttachments),
      this.loadResultSheets(recordId, perms.viewResultSheet),
      this.loadAiDrafts(recordId, perms.viewAiDraft),
    ]);

    let caseSec: Section<CaseIdentity>;
    let patientSec: Section<PatientSummary>;
    let clinicalSec: Section<ClinicalContext>;
    // Priors are keyed by patientId, which only the record read yields — so they resolve
    // after it (not in the evidence Promise.all above). If the case itself fails, priors
    // cannot be derived and are marked unavailable alongside the case-derived sections.
    let priorsSec: Section<PriorsSection>;
    // The timeline composes recorded events from the record read + the already-loaded
    // sections (inheriting their per-source permission/error state) + one result-sheet
    // event read. It needs the record, so it resolves here; if the case fails, so does it.
    let timelineSec: Section<TimelineSection>;

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
      priorsSec = await this.loadPriors(rec.patientId ?? null, recordId, perms);
      timelineSec = await this.loadTimeline(rec, { slides, ai, bethesda, correlation, attachments }, perms);
    } catch (err) {
      if (err instanceof NotFoundException) throw err; // no case at all → 404, not a partial failure
      // A real downstream failure: mark only the case-derived sections unavailable;
      // the aggregate still returns permissions and the deferred sections.
      const reason = 'Case failed to load';
      caseSec = { status: 'error', data: null, reason };
      patientSec = { status: 'error', data: null, reason };
      clinicalSec = { status: 'error', data: null, reason };
      priorsSec = { status: 'error', data: null, reason };
      timelineSec = { status: 'error', data: null, reason };
    }

    return {
      recordId,
      asOf,
      case: caseSec,
      patient: patientSec,
      clinicalContext: clinicalSec,
      permissions,
      slides,
      ai,
      bethesda,
      correlation,
      priors: priorsSec,
      attachments,
      timeline: timelineSec,
      resultSheets,
      aiDraft,
    };
  }

  private async loadSlides(recordId: string, viewSlide: boolean): Promise<Section<SlidesSection>> {
    if (!viewSlide) return { status: 'forbidden', data: null };
    try {
      // Composes the WSI owner's metadata-only read — no duplicated query, no slideUrl.
      const rows = await this.wsi.listByRecordMeta(recordId);
      if (!rows.length) return { status: 'empty', data: null };
      const items: SlideMeta[] = rows.map((s) => ({
        id: s.id,
        format: s.format ?? null,
        magnification: s.magnification ?? null,
        stain: s.stain ?? null,
        scanner: s.scanner ?? null,
        fileSizeBytes: s.fileSizeBytes ?? null,
        uploadedAt: iso(s.uploadedAt),
        viewerPath: `/wsi/${s.id}`,
      }));
      return { status: 'ready', data: { count: items.length, items } };
    } catch {
      return { status: 'error', data: null, reason: 'Slide metadata failed to load' };
    }
  }

  // Composes the AI-screening owner's per-record read. Projects only recorded fields;
  // no interpretation, no recommendation, no quantification claim.
  private async loadAI(recordId: string, viewAI: boolean): Promise<Section<AIEvidence>> {
    if (!viewAI) return { status: 'forbidden', data: null };
    try {
      const r: any = await this.ai.getByRecord(recordId);
      if (!r) return { status: 'empty', data: null };
      const regions: AIRegion[] = Array.isArray(r.findings)
        ? r.findings.map((f: any) => ({
            region: f?.region ?? null,
            finding: f?.finding ?? null,
            confidence: typeof f?.confidence === 'number' ? f.confidence : null,
          }))
        : [];
      return {
        status: 'ready',
        data: {
          id: r.id,
          status: r.status,
          primaryFinding: r.primaryFinding ?? null,
          regions,
          flaggedAreas: r.flaggedAreas ?? 0,
          confidence: r.confidence ?? null,
          confidenceLevel: r.confidenceLevel ?? null,
          agreedWithAI: r.agreedWithAI ?? null,
          pathologistNote: r.pathologistNote ?? null,
          reviewerName: r.reviewerName ?? null,
          processedAt: iso(r.processedAt),
          reviewedAt: iso(r.reviewedAt),
          createdAt: iso(r.createdAt),
        },
      };
    } catch {
      return { status: 'error', data: null, reason: 'AI screening failed to load' };
    }
  }

  // Composes the Bethesda owner's per-record read. Projects only recorded classification
  // and the owner's stored narrative/shortCode; nothing is inferred from free text.
  private async loadBethesda(recordId: string, viewBethesda: boolean): Promise<Section<BethesdaEvidence>> {
    if (!viewBethesda) return { status: 'forbidden', data: null };
    try {
      const r: any = await this.bethesda.getByRecord(recordId);
      if (!r) return { status: 'empty', data: null };
      const reporter = r.reportedBy ? `${r.reportedBy.firstName ?? ''} ${r.reportedBy.lastName ?? ''}`.trim() : null;
      return {
        status: 'ready',
        data: {
          id: r.id,
          specimenAdequacy: r.specimenAdequacy,
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
          narrative: r.generatedNarrative ?? null,
          shortCode: r.shortCode ?? null,
          reporterName: reporter || null,
          reportedAt: iso(r.reportedAt),
        },
      };
    } catch {
      return { status: 'error', data: null, reason: 'Bethesda result failed to load' };
    }
  }

  // Composes the correlation owner's per-record read. Discordance is shown only as
  // stored (never inferred). ownerPath opens the existing correlation surface.
  private async loadCorrelation(recordId: string, viewCorrelation: boolean): Promise<Section<CorrelationSection>> {
    if (!viewCorrelation) return { status: 'forbidden', data: null };
    try {
      const rows: any[] = await this.correlation.byCytologyRecord(recordId);
      if (!rows.length) return { status: 'empty', data: null };
      const items: CorrelationEvidence[] = rows.map((c) => ({
        id: c.id,
        cytologyDiagnosis: c.cytologyDiagnosis,
        histologyDiagnosis: c.histologyDiagnosis ?? null,
        histologySource: c.histologySource,
        externalLabName: c.externalLabName ?? null,
        correlationResult: c.correlationResult ?? null,
        discordanceReason: c.discordanceReason ?? null,
        reviewRequired: !!c.reviewRequired,
        reviewedAt: iso(c.reviewedAt),
        reviewNotes: c.reviewNotes ?? null,
        reviewerName: c.reviewedBy ? `${c.reviewedBy.firstName ?? ''} ${c.reviewedBy.lastName ?? ''}`.trim() || null : null,
        createdByName: c.createdBy ? `${c.createdBy.firstName ?? ''} ${c.createdBy.lastName ?? ''}`.trim() || null : null,
        cytologyDate: iso(c.cytologyDate),
        histologyDate: iso(c.histologyDate),
        createdAt: iso(c.createdAt),
        ownerPath: `/correlation/${c.id}`,
      }));
      return { status: 'ready', data: { count: items.length, items } };
    } catch {
      return { status: 'error', data: null, reason: 'Correlation failed to load' };
    }
  }

  // Composes the file owner's per-record attachment read — METADATA ONLY. storageUrl is
  // deliberately dropped: in fallback mode it is a base64 data URI (the file bytes), and
  // the aggregate must never carry bytes. The file owner still serves the file itself.
  private async loadAttachments(recordId: string, viewAttachments: boolean): Promise<Section<AttachmentsSection>> {
    if (!viewAttachments) return { status: 'forbidden', data: null };
    try {
      const rows = await this.files.getRecordAttachments(recordId);
      if (!rows.length) return { status: 'empty', data: null };
      const items: AttachmentMeta[] = rows.map((a) => ({
        id: a.id,
        filename: a.filename ?? null,
        kind: a.kind ?? null,
        uploadedAt: iso(a.createdAt),
        recordId,
      }));
      return { status: 'ready', data: { count: items.length, items } };
    } catch {
      return { status: 'error', data: null, reason: 'Attachments failed to load' };
    }
  }

  // Composes the result-sheet owner's per-record metadata read. Metadata only — no result
  // entries/lines, no editing/validation logic. `authorized` is the recorded state; no
  // status or draft is inferred. The owner remains the sole owner of the editor and reports.
  private async loadResultSheets(recordId: string, viewResultSheet: boolean): Promise<Section<ResultSheetsSection>> {
    if (!viewResultSheet) return { status: 'forbidden', data: null };
    try {
      const rows = await this.resultSheets.metaByRecord(recordId);
      if (!rows.length) return { status: 'empty', data: null };
      const items: ResultSheetMeta[] = rows.map((s) => ({
        id: s.id,
        recordId: s.recordId,
        authorized: !!s.authorized,
        authorizedAt: iso(s.authorizedAt),
        authorizerName: userName(s.authorizedBy),
        viewed: !!s.viewed,
        createdAt: iso(s.createdAt),
        reportCount: s._count?.reports ?? 0,
        entryCount: s._count?.resultEntries ?? 0,
      }));
      return { status: 'ready', data: { count: items.length, items } };
    } catch {
      return { status: 'error', data: null, reason: 'Result sheets failed to load' };
    }
  }

  // Composes the AI reporting owner's per-record draft METADATA read. Metadata only — no
  // model output, no accepted finalText, no prompt contents. `status`/`model`/`promptVersion`
  // are recorded provenance (never inferred); `hasStructuredDiff` is availability, not the
  // diff. The AI reporting system remains the sole owner of generation and acceptance.
  private async loadAiDrafts(recordId: string, viewAiDraft: boolean): Promise<Section<AiDraftsSection>> {
    if (!viewAiDraft) return { status: 'forbidden', data: null };
    try {
      const rows = await this.aiReporting.draftsByRecord(recordId);
      if (!rows.length) return { status: 'empty', data: null };
      const items: AiDraftMeta[] = rows.map((d) => ({
        id: d.id,
        resultSheetId: d.resultSheetId,
        kind: String(d.kind),
        status: String(d.status),
        model: d.model ?? null,
        promptVersion: d.promptVersion ?? null,
        createdAt: iso(d.createdAt),
        createdByName: userName(d.createdBy),
        acceptedAt: iso(d.acceptedAt),
        reviewerName: userName(d.acceptedBy),
        hasStructuredDiff: d.editedDiff != null,
      }));
      return { status: 'ready', data: { count: items.length, items } };
    } catch {
      return { status: 'error', data: null, reason: 'AI drafts failed to load' };
    }
  }

  // Unified timeline — composes ONLY recorded, timestamped events. Reuses the already-
  // loaded sections (so per-source permission/error state is inherited, not recomputed)
  // plus the record's own events, plus one result-sheet event read. Every item is real;
  // nothing is invented from a state, no actor/timestamp is inferred, no updatedAt is used.
  private async loadTimeline(
    rec: any,
    sections: {
      slides: Section<SlidesSection>;
      ai: Section<AIEvidence>;
      bethesda: Section<BethesdaEvidence>;
      correlation: Section<CorrelationSection>;
      attachments: Section<AttachmentsSection>;
    },
    perms: EffectivePermissions,
  ): Promise<Section<TimelineSection>> {
    const events: TimelineEvent[] = [];
    const unavailable: string[] = [];
    const recordPath = `/records/${rec.id}`;

    // Record: creation + status transitions (RecordStatusEvent, actor recorded).
    if (rec.createdAt) {
      events.push({ id: `record-created-${rec.id}`, type: 'record', timestamp: iso(rec.createdAt)!, actor: null, source: 'Record', description: 'Case created', ownerPath: recordPath });
    }
    for (const h of Array.isArray(rec.statusHistory) ? rec.statusHistory : []) {
      if (!h.createdAt) continue;
      events.push({
        id: `status-${h.id}`, type: 'status', timestamp: iso(h.createdAt)!,
        actor: userName(h.user), source: 'Record status',
        description: `Status set to ${h.status}${h.notes ? ` — ${h.notes}` : ''}`, ownerPath: recordPath,
      });
    }

    // Result-sheet events (authorization / amendment) — real event model, actor recorded.
    if (perms.viewResultSheet) {
      try {
        const rse = await this.resultSheets.eventsByRecord(rec.id);
        for (const e of rse) {
          if (!e.createdAt) continue;
          events.push({ id: `rse-${e.id}`, type: 'resultsheet', timestamp: iso(e.createdAt)!, actor: userName(e.user), source: 'Result sheet', description: RSE_TEXT[e.type] ?? String(e.type), ownerPath: recordPath });
        }
      } catch {
        unavailable.push('Result sheet');
      }
    } else {
      unavailable.push('Result sheet');
    }

    // AI screening timestamps (from the loaded section).
    pushFromSection(sections.ai, 'AI screening', unavailable, (d) => {
      const out: TimelineEvent[] = [];
      if (d.processedAt) out.push({ id: `ai-processed-${d.id}`, type: 'ai', timestamp: d.processedAt, actor: null, source: 'AI screening', description: 'AI screening completed', ownerPath: null });
      if (d.reviewedAt) out.push({ id: `ai-reviewed-${d.id}`, type: 'ai', timestamp: d.reviewedAt, actor: d.reviewerName, source: 'AI screening', description: 'AI screening reviewed', ownerPath: null });
      return out;
    }, events);

    // Bethesda report timestamp.
    pushFromSection(sections.bethesda, 'Bethesda', unavailable, (d) => (
      d.reportedAt ? [{ id: `beth-${d.id}`, type: 'bethesda', timestamp: d.reportedAt, actor: d.reporterName, source: 'Bethesda', description: 'Bethesda result reported', ownerPath: null }] : []
    ), events);

    // Digital-slide uploads (uploader not name-resolvable on the model → actor null).
    pushFromSection(sections.slides, 'Digital slides', unavailable, (d) => (
      d.items.filter((s) => s.uploadedAt).map((s) => ({ id: `slide-${s.id}`, type: 'slide', timestamp: s.uploadedAt!, actor: null, source: 'Digital slide', description: 'Digital slide uploaded', ownerPath: s.viewerPath }))
    ), events);

    // Attachment uploads (no uploader recorded → actor null).
    pushFromSection(sections.attachments, 'Attachments', unavailable, (d) => (
      d.items.filter((a) => a.uploadedAt).map((a) => ({ id: `att-${a.id}`, type: 'attachment', timestamp: a.uploadedAt!, actor: null, source: 'Attachment', description: `Attachment uploaded${a.filename ? `: ${a.filename}` : ''}`, ownerPath: recordPath }))
    ), events);

    // Correlation created / reviewed.
    pushFromSection(sections.correlation, 'Correlation', unavailable, (d) => {
      const out: TimelineEvent[] = [];
      for (const c of d.items) {
        if (c.createdAt) out.push({ id: `corr-created-${c.id}`, type: 'correlation', timestamp: c.createdAt, actor: c.createdByName, source: 'Correlation', description: 'Correlation created', ownerPath: c.ownerPath });
        if (c.reviewedAt) out.push({ id: `corr-reviewed-${c.id}`, type: 'correlation', timestamp: c.reviewedAt, actor: c.reviewerName, source: 'Correlation', description: 'Correlation reviewed', ownerPath: c.ownerPath });
      }
      return out;
    }, events);

    events.sort(timelineSort);
    return { status: events.length ? 'ready' : 'empty', data: { count: events.length, items: events, unavailable } };
  }

  // Prior-aware review — composes two owner sources (records + correlation) keyed by
  // patientId, excluding the anchor record. Each source resolves independently: if one
  // fails, its `sources` flag is marked 'error' while the other's entries survive. Nothing
  // is inferred — no trend, progression, recurrence, or clinical relation beyond the shared
  // patient. Prior Bethesda summary is included only with resultentry:view.
  private async loadPriors(
    patientId: string | null,
    currentRecordId: string,
    perms: EffectivePermissions,
  ): Promise<Section<PriorsSection>> {
    // Prior RECORDS are gated by record:view (the endpoint gate), so forbidden cannot
    // occur here in practice; the guard is kept for the contract.
    if (!perms.viewCase) return { status: 'forbidden', data: null };
    if (!patientId) return { status: 'empty', data: null };

    const sources: PriorsSourceHealth = {
      records: 'ready',
      correlation: perms.viewCorrelation ? 'ready' : 'forbidden',
    };
    let recordItems: PriorEntry[] = [];
    let corrItems: PriorEntry[] = [];

    try {
      const rows = await this.records.priorsByPatient(patientId, currentRecordId);
      recordItems = rows.map((r) => mapRecordPrior(r, perms.viewBethesda));
    } catch {
      sources.records = 'error';
    }

    if (perms.viewCorrelation) {
      try {
        const rows = await this.correlation.byPatient(patientId);
        corrItems = rows
          .filter((c: any) => c.cytologyRecordId !== currentRecordId)
          .map(mapCorrelationPrior);
      } catch {
        sources.correlation = 'error';
      }
    }

    const merged = [...recordItems, ...corrItems].sort(priorSort);
    const truncated = merged.length > 25;
    const items = merged.slice(0, 25);
    const data: PriorsSection = { count: items.length, items, sources, truncated };

    if (!items.length) {
      // No entries: distinguish a real failure (all attempted sources errored) from a
      // truthful empty (sources ok, patient simply has no priors).
      const correlationDead = sources.correlation !== 'ready';
      if (sources.records === 'error' && correlationDead) {
        return { status: 'error', data, reason: 'Prior history failed to load' };
      }
      return { status: 'empty', data };
    }
    return { status: 'ready', data };
  }
}

// Deterministic prior ordering: most recent recorded clinical date, then created date,
// then a stable id tie-break. Missing clinical dates sort last (they carry no time claim).
function priorSort(a: PriorEntry, b: PriorEntry): number {
  const t = (s: string | null) => (s ? new Date(s).getTime() : -Infinity);
  return (
    t(b.date) - t(a.date) ||
    t(b.createdAt) - t(a.createdAt) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

function mapRecordPrior(r: any, includeBethesda: boolean): PriorEntry {
  const sheets: any[] = Array.isArray(r.resultSheets) ? r.resultSheets : [];
  const amended = sheets.some((s) =>
    (s.events ?? []).some((e: any) => e.type === 'Deauthorized' || e.type === 'Reauthorized'),
  );
  const hasReport = sheets.some((s) => (s.reports?.length ?? 0) > 0);
  const authSheet = sheets.find((s) => s.authorized && s.authorizedAt) ?? sheets.find((s) => s.authorizedAt);
  const shortCode = includeBethesda && r.bethesdaResult ? (deriveShortCode(r.bethesdaResult) ?? null) : null;
  return {
    source: 'record',
    id: r.id,
    identity: r.labNumber ?? r.identifier ?? null,
    sourceType: amended ? 'Amended report' : 'Cytology',
    formType: r.formType ?? null,
    status: r.status ?? null,
    date: iso(r.specimenDate),
    createdAt: iso(r.createdAt),
    resultSummary: shortCode,
    hasReport,
    amended,
    authorizedAt: iso(authSheet?.authorizedAt ?? null),
    ownerPath: `/records/${r.id}`,
  };
}

function mapCorrelationPrior(c: any): PriorEntry {
  return {
    source: 'correlation',
    id: c.id,
    identity: c.cytologyRecord ? (c.cytologyRecord.labNumber ?? c.cytologyRecord.identifier ?? null) : null,
    sourceType: 'Correlation',
    formType: c.cytologyRecord?.formType ?? null,
    status: c.correlationResult ?? 'Unresolved',
    date: iso(c.cytologyDate),
    createdAt: iso(c.createdAt),
    resultSummary: c.correlationResult ?? null,
    hasReport: false,
    amended: false,
    authorizedAt: iso(c.reviewedAt),
    ownerPath: `/correlation/${c.id}`,
  };
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
    viewCorrelation: has('record:view'),
    viewPriors: has('resultentry:view'),
    viewResultSheet: has('resultsheet:view'),
    // Mirrors the create endpoint's guard (resultsheet:create). The result-sheet
    // endpoint remains the enforcement authority; this is descriptive only.
    createResultSheet: has('resultsheet:create'),
    editResultSheet: has('resultentry:change'),
    // AI reporting drafts (assistive). Mirror the AI Draft system's real permissions:
    // aidraft:view gates reading the section; aidraft:create gates generation (enforced by
    // the AI reporting endpoints — the shell only mirrors to hide/disable).
    viewAiDraft: has('aidraft:view'),
    createAiDraft: has('aidraft:create'),
    authorize: has('resultsheet:authorize'),
    amend: has('resultentry:change') && has('resultsheet:authorize'),
  };
}

const iso = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString() : null);

const userName = (u: { firstName?: string | null; lastName?: string | null } | null | undefined): string | null =>
  u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || null : null;

// Factual labels for recorded result-sheet events — no interpretation.
const RSE_TEXT: Record<string, string> = {
  Authorized: 'Result sheet authorized',
  Deauthorized: 'Result sheet deauthorized',
  Reauthorized: 'Result sheet re-authorized',
  AiDrafted: 'AI draft created',
  AiAccepted: 'AI draft accepted',
};

// Only used to break EXACT timestamp ties — never to reorder events chronologically.
const SOURCE_PRIORITY: Record<string, number> = {
  record: 0, status: 1, slide: 2, attachment: 3, ai: 4, bethesda: 5, resultsheet: 6, correlation: 7,
};

// Chronological: timestamp ascending, then source priority for exact ties, then stable id.
function timelineSort(a: TimelineEvent, b: TimelineEvent): number {
  const ta = new Date(a.timestamp).getTime();
  const tb = new Date(b.timestamp).getTime();
  if (ta !== tb) return ta - tb;
  const pa = SOURCE_PRIORITY[a.type] ?? 99;
  const pb = SOURCE_PRIORITY[b.type] ?? 99;
  if (pa !== pb) return pa - pb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Pull timeline events from an already-loaded section, inheriting its status: ready →
// include mapped events; forbidden/error → mark the source unavailable; empty → nothing.
function pushFromSection<T>(
  section: Section<T>,
  label: string,
  unavailable: string[],
  map: (data: T) => TimelineEvent[],
  out: TimelineEvent[],
): void {
  if (section.status === 'ready' && section.data) {
    out.push(...map(section.data));
  } else if (section.status === 'forbidden' || section.status === 'error') {
    unavailable.push(label);
  }
}

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
