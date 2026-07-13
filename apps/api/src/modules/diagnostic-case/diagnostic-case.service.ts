import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { RecordsService } from '../records/records.service';
import { WsiService } from '../wsi/wsi.service';

// Diagnostic Case Workspace — A2: the FROZEN read-only aggregate contract for
// GET /diagnostic-case/:recordId/overview. This service is CONTRACT-ONLY: it holds no Prisma,
// imports no owner module, and performs NO clinical read (no record existence lookup, no patient,
// specimen, WSI, attachment, Bethesda, AI, coding, report, prior, or collaboration data). It
// returns the nine frozen clinical bands as `deferred` and hydrates only the descriptive
// permission map (`permissions` → ready). Owner composition arrives band-by-band in A3+ by CALLING
// the same owner service methods Sign-Out already calls (never by importing Sign-Out's internals).
// Contract: docs/PATHOS_DIAGNOSTIC_CASE_IMPLEMENTATION_PLAN.md (A2; §3 aggregate contract, §6
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
    id: string;
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

export interface DiagnosticMaterialSection {
  recordId: string;
  specimens: DiagnosticMaterialItem[]; // ≤ MATERIAL_CAP, deterministic order (A4 — record read)
  summary: { total: number }; // true recorded specimen count (may exceed specimens.length if capped)
  slides: SlidesSubSection; // A5 — WsiService.listByRecordMeta (separate, isolated owner read)
  ownerPath: string; // /records/:recordId
}

// Discriminated result of the single shared record read.
type RecordLoad =
  | { kind: 'ok'; rec: any }
  | { kind: 'forbidden' }
  | { kind: 'error'; reason: string };

// ── The frozen overview envelope ──
export interface DiagnosticCaseOverview {
  asOf: string;
  recordId: string;

  permissions: Section<EffectiveDiagnosticPermissions>;

  // The nine frozen clinical bands, in the frozen order (plan §4). Each hydrates to its band payload
  // as it lands (A3 = caseIdentity, A4 = diagnosticMaterial); the STATUS contract never changes.
  caseIdentity: Section<CaseIdentitySection>;
  diagnosticMaterial: Section<DiagnosticMaterialSection>;
  diagnosticInterpretation: Section<null>;
  decisionSupport: Section<null>;
  priorEvidence: Section<null>;
  collaboration: Section<null>;
  reportingSignOut: Section<null>;
  timelineProvenance: Section<null>;
  permissionsActions: Section<null>;
}

const deferred = (): Section<null> => ({ status: 'deferred', data: null });
const MATERIAL_CAP = 50; // conservative bound on the recorded specimen list (plan A4 §List bounds)
const SLIDE_CAP = 50; // conservative bound on the recorded slide list (plan A5 §List bounds)
const iso = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString() : null);
const fullName = (
  u: { firstName?: string | null; lastName?: string | null } | null | undefined,
): string | null => (u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || null : null);

@Injectable()
export class DiagnosticCaseService {
  constructor(
    private readonly records: RecordsService,
    private readonly wsi: WsiService,
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
    return {
      asOf: new Date().toISOString(),
      recordId,
      permissions: { status: 'ready', data: this.buildPermissions(user) },
      caseIdentity: this.sectionCaseIdentity(recordId, load),
      diagnosticMaterial: await this.sectionDiagnosticMaterial(recordId, load),
      diagnosticInterpretation: deferred(),
      decisionSupport: deferred(),
      priorEvidence: deferred(),
      collaboration: deferred(),
      reportingSignOut: deferred(),
      timelineProvenance: deferred(),
      permissionsActions: deferred(),
    };
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

  // Band 2: Diagnostic Material (multi-source). Specimens come from the SAME record read (A4, no second
  // record read); Slides come from a SEPARATE, isolated WsiService.listByRecordMeta call (A5). Attachments
  // remain deferred (A6). Band-level status is specimen-driven (A4 preserved: ready if specimens exist,
  // empty if none); the slides sub-source carries its own status so a WSI failure isolates to it and
  // never affects specimens. A record failure → error/forbidden (whole band). No quality/adequacy/
  // severity inference; slides are Record-anchored, never specimen-linked.
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
    const slides = await this.loadSlides(recordId);
    const data: DiagnosticMaterialSection = { recordId, specimens, summary: { total }, slides, ownerPath: `/records/${recordId}` };
    // A4-preserved band status: specimen-driven. Slides live in the sub-source regardless.
    return { status: total === 0 ? 'empty' : 'ready', data };
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
            id: r.patient.id,
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
}
