import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { RecordsService } from '../records/records.service';

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

// ── The frozen overview envelope ──
export interface DiagnosticCaseOverview {
  asOf: string;
  recordId: string;

  permissions: Section<EffectiveDiagnosticPermissions>;

  // The nine frozen clinical bands, in the frozen order (plan §4). Each hydrates to its band payload
  // as it lands (A3 = caseIdentity); the STATUS contract never changes. Unhydrated bands are Section<null>.
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

const deferred = (): Section<null> => ({ status: 'deferred', data: null });
const iso = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString() : null);
const fullName = (
  u: { firstName?: string | null; lastName?: string | null } | null | undefined,
): string | null => (u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || null : null);

@Injectable()
export class DiagnosticCaseService {
  constructor(private readonly records: RecordsService) {}

  /**
   * Read-only aggregate for one case. A3: composes the Case Identity band from RecordsService.findOne
   * (the verified, mutation-free record owner read); all other clinical bands remain `deferred`. The
   * permission map is built from the caller's real claims. Orchestration only — no Prisma, no owner
   * logic duplication, no mutation. Case Identity is the root: its loader isolates failure to its own
   * Section (error/forbidden) and never collapses the permission map or the endpoint.
   */
  async overview(recordId: string, user: AuthUser): Promise<DiagnosticCaseOverview> {
    return {
      asOf: new Date().toISOString(),
      recordId,
      permissions: { status: 'ready', data: this.buildPermissions(user) },
      caseIdentity: await this.loadCaseIdentity(recordId, user),
      diagnosticMaterial: deferred(),
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

  // Band 1 loader. Reads ONLY through RecordsService.findOne (owner, mutation-free, tenant-scoped by
  // the LabContext Prisma extension) and maps its recorded fields into the bounded CaseIdentitySection.
  // Truthful states: forbidden (caller lacks record:view — defensive; the base gate normally enforces),
  // error (owner threw — e.g. NotFoundException for a missing/inaccessible record, preserved as the
  // owner reports it), ready otherwise. Missing FIELDS stay null (never an error). No synthesis.
  private async loadCaseIdentity(recordId: string, user: AuthUser): Promise<Section<CaseIdentitySection>> {
    const has = (code: string) => !!user.isSuperRole || user.permissions.includes(code);
    if (!has('record:view')) return { status: 'forbidden', data: null, reason: 'record:view required' };
    try {
      const r: any = await this.records.findOne(recordId);
      return { status: 'ready', data: this.mapCaseIdentity(recordId, r) };
    } catch (e) {
      // Preserve the owner's not-found/failure — never convert it into a fabricated or empty case.
      const reason = e instanceof NotFoundException ? 'Record not found' : 'Could not load the record';
      return { status: 'error', data: null, reason };
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
