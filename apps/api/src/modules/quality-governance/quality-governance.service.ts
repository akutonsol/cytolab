import { Injectable } from '@nestjs/common';
import { CorrelationService } from '../correlation/correlation.service';
import { QcService } from '../qc/qc.service';
import { EscalationService } from '../escalation/escalation.service';
import { RecallService } from '../recall/recall.service';
import { ProficiencyService } from '../proficiency/proficiency.service';
import { ReportCenterService } from '../report-center/report-center.service';
import { ResultSheetsService } from '../result-sheets/result-sheets.service';
import { SecurityService } from '../security/security.service';
import { ChangeRequestsService } from '../change-requests/change-requests.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';

// ── Quality & Governance aggregate (orchestration only) ──────────────────────
// C2: a THIN read-only aggregate. It owns no persistence, runs no Prisma query, calls no
// quality owner service, and performs no quality computation, ranking, or benchmark math.
// Only the descriptive permission map resolves; every evidence section is intentionally
// `deferred` until its checkpoint (C3–C10). The section-status contract is FROZEN here and
// never re-shaped; later checkpoints only change a section's `data` generic and status.
// Contract: docs/PATHOS_QUALITY_IMPLEMENTATION_PLAN.md (§1 Orchestration Rule, §3, §9).

export type SectionStatus = 'ready' | 'empty' | 'forbidden' | 'error' | 'deferred';
export interface Section<T> {
  status: SectionStatus;
  data: T | null;
  reason?: string;
}

// Descriptive permission map — mirrors REAL owner permission codes from the caller's
// claims. It grants nothing and aliases nothing; owner endpoints remain the enforcement
// authority. `medicalDirector` is a PERMISSION-derived oversight capability (not a role
// name): oversight actions — proficiency grading, authorization oversight — are gated by
// `resultsheet:authorize`. `changerequest:*` is mirrored truthfully: it is not seeded, so
// `has()` is false for every non-superuser (never aliased to `record:view`).
export interface EffectiveQualityPermissions {
  viewRecord: boolean; // record:view — entry gate + most quality sections
  changeRecord: boolean; // record:change — resolve/review actions
  viewResultSheet: boolean; // resultsheet:view — result-sheet governance events
  authorize: boolean; // resultsheet:authorize — proficiency grade, authorization oversight
  viewResultEntry: boolean; // resultentry:view — Bethesda evidence
  viewReport: boolean; // report:view — benchmarks
  security: boolean; // system:security — security/login governance
  viewNotification: boolean; // notification:view — notification history
  viewChangeRequest: boolean; // changerequest:view — change-request governance (currently unseeded)
  changeChangeRequest: boolean; // changerequest:change — (currently unseeded)
  medicalDirector: boolean; // permission-derived oversight capability, NOT a role name
}

// ── Overview (C3) ────────────────────────────────────────────────────────────
// A FACTUAL composition of owner-recorded summaries — never a judgment engine. Each
// source shows only counts/statuses the owner already computed. `open` is the owner's own
// open figure (for escalation/recall it is the SUM of the owner's own open-status counts,
// not a re-derivation from raw rows). No global quality score, no ranking, no inferred
// urgency, no benchmark/discordance recomputation, no CAPA language.
export interface OverviewSource {
  key: string;
  label: string;
  status: 'ready' | 'forbidden' | 'error';
  open: number | null; // owner-recorded count of currently-open items (null unless ready)
  note: string | null; // factual descriptor built only from owner-provided counts
}
export interface OverviewData {
  asOf: string;
  sources: OverviewSource[];
  unavailable: string[]; // labels of sources that were forbidden or errored
}

// ── Correlation & Discordance (C4) ───────────────────────────────────────────
// Read-only projections of recorded CorrelationCase evidence. `correlationResult`,
// `discordanceReason`, and `reviewRequired` are shown EXACTLY as stored — never recomputed,
// never inferred from cytology-vs-histology diagnoses. No synthetic severity, no ranking,
// no concordance-ledger behaviour, and `agreedWithAI` is never read.
export interface CorrelationCaseRow {
  id: string;
  identity: string | null; // cytology record labNumber/identifier
  cytologyDiagnosis: string;
  histologyDiagnosis: string | null;
  histologySource: string;
  correlationResult: string | null; // stored verbatim
  discordanceReason: string | null; // stored verbatim
  reviewRequired: boolean; // owner-recorded workflow state (NOT inferred urgency)
  reviewedAt: string | null;
  reviewerName: string | null;
  cytologyDate: string | null;
  createdAt: string | null;
  ownerPath: string; // the existing correlation surface — review happens there, not here
}
export interface CorrelationSection {
  // Owner-computed counts (CorrelationService.analytics) — displayed, not recomputed.
  total: number;
  concordant: number;
  minorDiscordant: number;
  majorDiscordant: number;
  unresolved: number;
  pendingReview: number;
  recent: CorrelationCaseRow[]; // bounded, deterministically ordered
}
export interface DiscordanceSection {
  count: number;
  items: CorrelationCaseRow[]; // only cases whose STORED correlationResult records discordance
}

// ── Quality Control (C5) ─────────────────────────────────────────────────────
// Read-only projection of recorded QC evidence. `result` is the stored QC status (never
// recomputed); `failureReason` and `correctiveAction` are recorded free-text notes (NEVER
// CAPA / root cause / preventive action / effectiveness). No severity is surfaced because
// neither QCCheck nor QCFailureAlert records one. `ownerPath` is the QC console (`/qc`).
export interface QcCheckRow {
  id: string;
  checkType: string;
  result: string; // stored Pass / Fail / Marginal
  failureReason: string | null; // recorded failure reason (verbatim)
  correctiveAction: string | null; // recorded corrective-action NOTE (verbatim, not CAPA)
  equipmentName: string | null;
  performerName: string | null;
  recordIdentity: string | null;
  performedAt: string | null;
  createdAt: string | null;
  ownerPath: string;
}
export interface QcAlertRow {
  id: string;
  status: string; // stored alert status
  relatedCheckType: string | null;
  failureReason: string | null;
  equipmentName: string | null;
  createdAt: string | null;
  resolvedAt: string | null;
  ownerPath: string;
}
export interface QcSection {
  // Owner-computed counts (QcService.stats) — displayed, not recomputed.
  totalChecks: number;
  pass: number;
  fail: number;
  marginal: number;
  openAlerts: number; // count of the owner's not-Resolved alerts
  recentChecks: QcCheckRow[]; // bounded, deterministically ordered
  alerts: QcAlertRow[]; // bounded open alerts, deterministically ordered
}

// ── Proficiency (C6) ─────────────────────────────────────────────────────────
// Read-only projection of recorded proficiency evidence. `status` is the owner's recorded
// ProfTestStatus (Draft/Active/Grading/Completed/Archived), shown verbatim. No competency
// is inferred, no staff ranking is computed (the owner's per-user rankings are NOT used),
// no remediation is recommended, no pending count is fabricated. `averageScore` is the
// owner-computed lab average (analytics.labAverageScore), displayed only because the owner
// already exposes it. Per-user scores/pass-fail live on the owner surface (/proficiency/:id).
export interface ProficiencyTestRow {
  id: string;
  name: string;
  testType: string;
  status: string; // recorded ProfTestStatus verbatim
  administeredByName: string | null; // createdBy
  passingScore: number | null; // the test's recorded passing threshold
  caseCount: number;
  responderCount: number;
  startDate: string | null;
  endDate: string | null;
  createdAt: string | null;
  ownerPath: string; // /proficiency/:id — grading/administration happens there
}
export interface ProficiencySection {
  totalTests: number; // owner analytics.totalTests
  completedTests: number; // owner analytics.completedTests
  averageScore: number | null; // owner analytics.labAverageScore (owner-computed)
  tests: ProficiencyTestRow[]; // bounded, deterministically ordered
}

// ── Escalations & Recall (C7) ────────────────────────────────────────────────
// Read-only projections. `severity` and `status` are the owner's recorded enums, shown
// verbatim; recall `status` (incl. Overdue) is read from the owner, never computed from
// dates. `resolvedReason` is a recorded resolution note — never CAPA/root-cause/preventive/
// effectiveness. No urgency/compliance/quality verdict is synthesised.
export interface EscalationRow {
  id: string;
  identity: string | null; // record labNumber/identifier
  trigger: string | null; // recorded category/type
  severity: string | null; // recorded EscalationSeverity (stored)
  status: string; // recorded lifecycle status
  assignedToName: string | null;
  reviewerName: string | null;
  createdAt: string | null;
  reviewedAt: string | null;
  resolvedAt: string | null;
  resolvedReason: string | null; // "Recorded resolution note"
  ownerPath: string;
}
export interface EscalationSection {
  // Owner-recorded counts (EscalationService.summary) — displayed, not recomputed.
  pending: number;
  acknowledged: number;
  underReview: number;
  resolvedToday: number;
  malignant: number; // owner severity count
  highGrade: number; // owner severity count
  items: EscalationRow[]; // bounded, deterministically ordered
}
export interface RecallRow {
  id: string;
  identity: string | null; // patient name (permitted by record:view)
  reason: string | null; // triggerDiagnosis
  status: string; // recorded RecallStatus (incl. Overdue) — never computed here
  dueAt: string | null;
  completedAt: string | null;
  completionNote: string | null; // recorded notes
  ownerPath: string;
}
export interface RecallSection {
  // Owner-recorded counts (RecallService.summary) — displayed, not recomputed.
  pending: number;
  due: number;
  overdue: number;
  completedThisMonth: number;
  items: RecallRow[]; // bounded, deterministically ordered
}

// ── Benchmarks & compliance (C8) ─────────────────────────────────────────────
// Read-only projection of OWNER-COMPUTED benchmark/compliance outputs (report-center).
// Every value, benchmark reference, unit, and status comes straight from the owner —
// nothing is recomputed, no metrics are combined into a global score, and the owner's
// `overall` verdict is deliberately NOT surfaced. A metric with no owner reference/status
// shows only its recorded value. Sources fail independently.
export interface BenchmarkMetric {
  key: string;
  label: string;
  value: number | null; // owner-computed value
  unit: string | null; // owner unit (%, ratio, …)
  reference: number | null; // owner benchmark, only if the owner provides one
  status: string | null; // owner status, only if the owner exposes one
  source: string; // owner domain label
  ownerPath: string;
}
export interface BenchmarksSection {
  asOf: string;
  metrics: BenchmarkMetric[];
  unavailable: string[]; // owner sources that failed
}

// ── Medical Director oversight (C9) ──────────────────────────────────────────
// A bounded queue assembled ONLY from owner-recorded open/review-required states, gated by
// the descriptive `medicalDirector` permission (= resultsheet:authorize; permission-based,
// never a role name). Each item is a recorded owner state that already carries a review/
// grade/resolve action on its own owner surface. Nothing is ranked by urgency, severity,
// malignancy, benchmark, or staff — ordering is workflow-state + age only. No risk score,
// no cross-domain priority, no "attention level", no CAPA. Historical closed items are
// never surfaced as open attention.
export interface OversightItem {
  id: string; // source-prefixed unique id
  sourceDomain: string; // 'correlation' | 'escalation' | 'qc' | 'proficiency'
  sourceLabel: string;
  state: string; // recorded owner state
  reason: string | null; // factual recorded reason/note
  identity: string | null; // record/case/test identity
  actor: string | null; // owner/assignee where recorded
  timestamp: string | null; // created/review/due
  ownerPath: string;
  actionLabel: string | null; // only when a real owner action exists
}
export interface MedicalDirectorSection {
  count: number;
  items: OversightItem[];
  unavailable: string[]; // owner sources that failed or are not permitted
}

// ── Governance trail (C10) ───────────────────────────────────────────────────
// A bounded, SOURCE-LABELED, explicitly NON-CANONICAL trail of recorded governance events,
// composed ONLY from owner services that expose a lab-wide recorded read (no direct Prisma).
// It is NOT an audit ledger and never claims completeness: each source is gated by its OWN
// real permission and isolates on failure (its label joins `unavailable`). Only three sources
// have a genuine lab-wide owner feed — result-sheet authorizations (resultsheet:view), security
// access history (system:security), change-request creation (changerequest:view). No event is
// invented; no actor or timestamp is inferred; `updatedAt` is never used as an event; delivery
// is never treated as acknowledgement; no severity/urgency ranking is applied; and no historical
// event becomes a current attention item (every event carries `historical: true`).
export interface GovernanceEvent {
  id: string;
  sourceDomain: string;
  sourceLabel: string;
  eventType: string;
  timestamp: string; // an owner-DEFINED event timestamp (authorizedAt/createdAt) — never a generic updatedAt
  actor: string | null; // recorded actor identity, or null → UI shows "Actor not recorded"
  description: string; // factual, built only from recorded fields
  ownerPath: string | null; // a real owner surface, or null when none exists
  historical: true; // always historical — never re-presented as a current attention item
  sourceAvailable: true; // the source that produced this event was readable
}
export interface GovernanceSection {
  asOf: string;
  events: GovernanceEvent[];
  unavailable: string[]; // sources the caller cannot view, or that failed to load
  nonCanonical: true; // fixed disclosure: a partial, source-labeled assembly — not an audit ledger
}

export interface QualityOverviewAggregate {
  asOf: string;
  permissions: Section<EffectiveQualityPermissions>;
  overview: Section<OverviewData>;
  correlation: Section<CorrelationSection>;
  discordance: Section<DiscordanceSection>;
  qc: Section<QcSection>;
  proficiency: Section<ProficiencySection>;
  escalations: Section<EscalationSection>;
  recall: Section<RecallSection>;
  benchmarks: Section<BenchmarksSection>;
  medicalDirector: Section<MedicalDirectorSection>;
  // Source-labeled governance trail (C10). Carries its own status so a source failure isolates
  // to it and never collapses permissions or siblings.
  governance: Section<GovernanceSection>;
}

@Injectable()
export class QualityGovernanceService {
  constructor(
    private readonly correlation: CorrelationService,
    private readonly qc: QcService,
    private readonly escalation: EscalationService,
    private readonly recall: RecallService,
    private readonly proficiency: ProficiencyService,
    private readonly reportCenter: ReportCenterService,
    private readonly resultSheets: ResultSheetsService,
    private readonly security: SecurityService,
    private readonly changeRequests: ChangeRequestsService,
  ) {}

  async overview(user: AuthUser): Promise<QualityOverviewAggregate> {
    // Permissions resolve independently of any evidence load (partial-failure tolerance):
    // they survive every future downstream failure.
    const perms = buildPermissions(user);
    // Sections resolve independently (partial-failure isolation): a correlation failure
    // never collapses the overview or sibling sections.
    const [overview, corr, qc, proficiency, escalations, recall, benchmarks, medicalDirector, governance] = await Promise.all([
      this.loadOverview(perms),
      this.loadCorrelationSections(perms),
      this.loadQc(perms),
      this.loadProficiency(perms),
      this.loadEscalations(perms, user.userId),
      this.loadRecall(perms),
      this.loadBenchmarks(perms),
      this.loadMedicalDirector(perms, user.userId),
      this.loadGovernance(perms),
    ]);
    return {
      asOf: new Date().toISOString(),
      permissions: { status: 'ready', data: perms },
      overview,
      correlation: corr.correlation,
      discordance: corr.discordance,
      qc,
      proficiency,
      escalations,
      recall,
      benchmarks,
      medicalDirector,
      governance,
    };
  }

  // Compose owner-recorded summaries into a factual overview. Each source resolves
  // independently (partial-failure isolation): one owner failing marks only its source and
  // never collapses the others. All four owners are gated by record:view (the endpoint
  // gate), so `forbidden` cannot occur in practice; the guard is kept for the contract.
  private async loadOverview(perms: EffectiveQualityPermissions): Promise<Section<OverviewData>> {
    const sources = await Promise.all([
      this.correlationSource(perms),
      this.qcSource(perms),
      this.escalationSource(perms),
      this.recallSource(perms),
    ]);
    const unavailable = sources.filter((s) => s.status !== 'ready').map((s) => s.label);
    return { status: 'ready', data: { asOf: new Date().toISOString(), sources, unavailable } };
  }

  // Correlation — owner-computed `pendingReview` (open reviews). Discordance counts are
  // shown verbatim from the owner; nothing is recomputed.
  private async correlationSource(perms: EffectiveQualityPermissions): Promise<OverviewSource> {
    const label = 'Correlation';
    if (!perms.viewRecord) return { key: 'correlation', label, status: 'forbidden', open: null, note: null };
    try {
      const a: any = await this.correlation.analytics();
      return {
        key: 'correlation', label, status: 'ready',
        open: a.pendingReview ?? 0,
        note: `${a.majorDiscordantCount ?? 0} major discordant · ${a.unresolvedCount ?? 0} unresolved`,
      };
    } catch { return { key: 'correlation', label, status: 'error', open: null, note: null }; }
  }

  // Quality Control — the owner's OPEN failure alerts (it filters status ≠ Resolved).
  private async qcSource(perms: EffectiveQualityPermissions): Promise<OverviewSource> {
    const label = 'Quality Control';
    if (!perms.viewRecord) return { key: 'qc', label, status: 'forbidden', open: null, note: null };
    try {
      const alerts: any[] = await this.qc.alerts();
      const open = alerts.length;
      return { key: 'qc', label, status: 'ready', open, note: `${open} open failure alert${open === 1 ? '' : 's'}` };
    } catch { return { key: 'qc', label, status: 'error', open: null, note: null }; }
  }

  // Escalations — `open` = the SUM of the owner's own open-status counts (pending +
  // acknowledged + under review); the owner defines these statuses, not this service.
  private async escalationSource(perms: EffectiveQualityPermissions): Promise<OverviewSource> {
    const label = 'Escalations';
    if (!perms.viewRecord) return { key: 'escalations', label, status: 'forbidden', open: null, note: null };
    try {
      const s: any = await this.escalation.summary();
      const open = (s.pending ?? 0) + (s.acknowledged ?? 0) + (s.underReview ?? 0);
      return {
        key: 'escalations', label, status: 'ready', open,
        note: `${s.pending ?? 0} pending · ${s.underReview ?? 0} under review · ${s.malignantCount ?? 0} malignant`,
      };
    } catch { return { key: 'escalations', label, status: 'error', open: null, note: null }; }
  }

  // Recall — `open` = the SUM of the owner's own open-status counts (overdue + due +
  // pending); the owner defines these statuses.
  private async recallSource(perms: EffectiveQualityPermissions): Promise<OverviewSource> {
    const label = 'Recall';
    if (!perms.viewRecord) return { key: 'recall', label, status: 'forbidden', open: null, note: null };
    try {
      const s: any = await this.recall.summary();
      const open = (s.overdue ?? 0) + (s.due ?? 0) + (s.pending ?? 0);
      return {
        key: 'recall', label, status: 'ready', open,
        note: `${s.overdue ?? 0} overdue · ${s.due ?? 0} due · ${s.pending ?? 0} pending`,
      };
    } catch { return { key: 'recall', label, status: 'error', open: null, note: null }; }
  }

  // Correlation & Discordance — composed from CorrelationService only. `analytics()` gives
  // owner-computed counts (displayed, not recomputed); `list()` gives the recorded case
  // rows. Discordance = cases whose STORED correlationResult records it (never inferred).
  // Both sections share the same gate/failure, so a correlation failure isolates to them.
  private async loadCorrelationSections(
    perms: EffectiveQualityPermissions,
  ): Promise<{ correlation: Section<CorrelationSection>; discordance: Section<DiscordanceSection> }> {
    if (!perms.viewRecord) {
      const forbidden = { status: 'forbidden' as const, data: null };
      return { correlation: forbidden, discordance: forbidden };
    }
    try {
      const [a, rows] = await Promise.all([this.correlation.analytics(), this.correlation.list({} as any)]);
      const list: any[] = Array.isArray(rows) ? rows : [];
      if ((a?.total ?? 0) === 0 && !list.length) {
        const empty = { status: 'empty' as const, data: null };
        return { correlation: empty, discordance: empty };
      }
      const mapped = list.map(mapCorrelationRow).sort(correlationSort);
      const recent = mapped.slice(0, 10);
      // Only cases whose stored result records discordance — no inference from diagnoses.
      const discordant = mapped
        .filter((r) => r.correlationResult === 'MinorDiscordant' || r.correlationResult === 'MajorDiscordant')
        .slice(0, 25);
      return {
        correlation: {
          status: 'ready',
          data: {
            total: a.total ?? 0,
            concordant: a.concordantCount ?? 0,
            minorDiscordant: a.minorDiscordantCount ?? 0,
            majorDiscordant: a.majorDiscordantCount ?? 0,
            unresolved: a.unresolvedCount ?? 0,
            pendingReview: a.pendingReview ?? 0,
            recent,
          },
        },
        discordance: { status: 'ready', data: { count: discordant.length, items: discordant } },
      };
    } catch {
      const error = { status: 'error' as const, data: null, reason: 'Correlation failed to load' };
      return { correlation: error, discordance: error };
    }
  }

  // Quality Control — composed from QcService only. `stats()` gives owner-computed counts
  // (displayed, not recomputed); `alerts()` gives the owner's OPEN (not-Resolved) alerts;
  // `list()` gives recent recorded checks. failureReason/correctiveAction are shown as
  // recorded notes, never CAPA. No severity is surfaced (the models record none).
  private async loadQc(perms: EffectiveQualityPermissions): Promise<Section<QcSection>> {
    if (!perms.viewRecord) return { status: 'forbidden', data: null };
    try {
      const [stats, alerts, checks] = await Promise.all([
        this.qc.stats(),
        this.qc.alerts(),
        this.qc.list({ pageSize: 10 } as any),
      ]);
      const allAlerts: any[] = Array.isArray(alerts) ? alerts : [];
      const checkList: any[] = (checks as any)?.data ?? (Array.isArray(checks) ? checks : []);
      const s: any = stats ?? {};
      if ((s.totalChecks ?? 0) === 0 && !allAlerts.length) {
        return { status: 'empty', data: null };
      }
      return {
        status: 'ready',
        data: {
          totalChecks: s.totalChecks ?? 0,
          pass: s.passCount ?? 0,
          fail: s.failCount ?? 0,
          marginal: s.marginalCount ?? 0,
          openAlerts: allAlerts.length, // the owner's not-Resolved alert count
          recentChecks: checkList.map(mapQcCheck).sort(qcCheckSort).slice(0, 10),
          alerts: allAlerts.map(mapQcAlert).sort(qcAlertSort).slice(0, 25),
        },
      };
    } catch {
      return { status: 'error', data: null, reason: 'Quality Control failed to load' };
    }
  }

  // Proficiency — composed from ProficiencyService only. `analytics()` gives owner-computed
  // totals + the owner's lab average score (displayed, not recomputed); `list()` gives the
  // recorded tests. No competency inference, no staff ranking, no remediation, no fabricated
  // pending count. Read gate mirrors the real owner permission (record:view); administer/
  // grade stay gated by resultsheet:authorize at the owner endpoints.
  private async loadProficiency(perms: EffectiveQualityPermissions): Promise<Section<ProficiencySection>> {
    if (!perms.viewRecord) return { status: 'forbidden', data: null };
    try {
      const [analytics, tests] = await Promise.all([
        this.proficiency.analytics(),
        this.proficiency.list({} as any),
      ]);
      const list: any[] = Array.isArray(tests) ? tests : [];
      const a: any = analytics ?? {};
      if ((a.totalTests ?? 0) === 0 && !list.length) return { status: 'empty', data: null };
      return {
        status: 'ready',
        data: {
          totalTests: a.totalTests ?? 0,
          completedTests: a.completedTests ?? 0,
          averageScore: typeof a.labAverageScore === 'number' ? a.labAverageScore : null,
          tests: list.map(mapProficiencyTest).sort(proficiencySort).slice(0, 15),
        },
      };
    } catch {
      return { status: 'error', data: null, reason: 'Proficiency failed to load' };
    }
  }

  // Escalations — composed from EscalationService only. `summary()` gives owner-recorded
  // counts (incl. the owner's severity counts); `list()` gives recorded escalations.
  // severity/status are shown verbatim; resolvedReason is a recorded resolution note.
  // Resolves independently of Recall (isolated failure).
  private async loadEscalations(perms: EffectiveQualityPermissions, userId: string): Promise<Section<EscalationSection>> {
    if (!perms.viewRecord) return { status: 'forbidden', data: null };
    try {
      const [summary, rows] = await Promise.all([
        this.escalation.summary(),
        this.escalation.list({} as any, userId),
      ]);
      const list: any[] = Array.isArray(rows) ? rows : [];
      const s: any = summary ?? {};
      const anyOpen = (s.pending ?? 0) + (s.acknowledged ?? 0) + (s.underReview ?? 0);
      if (anyOpen === 0 && (s.resolvedToday ?? 0) === 0 && !list.length) {
        return { status: 'empty', data: null };
      }
      return {
        status: 'ready',
        data: {
          pending: s.pending ?? 0,
          acknowledged: s.acknowledged ?? 0,
          underReview: s.underReview ?? 0,
          resolvedToday: s.resolvedToday ?? 0,
          malignant: s.malignantCount ?? 0,
          highGrade: s.highGradeCount ?? 0,
          items: list.map(mapEscalation).sort(escalationSort).slice(0, 20),
        },
      };
    } catch {
      return { status: 'error', data: null, reason: 'Escalations failed to load' };
    }
  }

  // Recall — composed from RecallService only. `summary()` gives owner-recorded counts;
  // `list()` gives recorded recall items. `status` (incl. Overdue) is the owner's recorded
  // state — never computed from dates here. Resolves independently of Escalations.
  private async loadRecall(perms: EffectiveQualityPermissions): Promise<Section<RecallSection>> {
    if (!perms.viewRecord) return { status: 'forbidden', data: null };
    try {
      const [summary, rows] = await Promise.all([
        this.recall.summary(),
        this.recall.list({} as any),
      ]);
      const list: any[] = Array.isArray(rows) ? rows : [];
      const s: any = summary ?? {};
      const anyOpen = (s.pending ?? 0) + (s.due ?? 0) + (s.overdue ?? 0);
      if (anyOpen === 0 && (s.completedThisMonth ?? 0) === 0 && !list.length) {
        return { status: 'empty', data: null };
      }
      return {
        status: 'ready',
        data: {
          pending: s.pending ?? 0,
          due: s.due ?? 0,
          overdue: s.overdue ?? 0,
          completedThisMonth: s.completedThisMonth ?? 0,
          items: list.map(mapRecall).sort(recallSort).slice(0, 20),
        },
      };
    } catch {
      return { status: 'error', data: null, reason: 'Recall failed to load' };
    }
  }

  // Benchmarks & compliance — composed from ReportCenterService (owner-computed). Each
  // owner source resolves independently: if one fails, its label joins `unavailable[]` and
  // the others survive. Values/references/units/status are owner outputs, shown verbatim.
  // The owner's `overall` verdict is intentionally NOT surfaced (no global quality score).
  private async loadBenchmarks(perms: EffectiveQualityPermissions): Promise<Section<BenchmarksSection>> {
    if (!perms.viewReport) return { status: 'forbidden', data: null };
    const metrics: BenchmarkMetric[] = [];
    const unavailable: string[] = [];

    // CAP benchmark suite — 4 owner metrics, each with value + benchmark reference + status.
    try {
      const cap: any = await this.reportCenter.capBenchmarks({} as any);
      const src = 'CAP benchmarks';
      const push = (key: string, label: string, unit: string, m: any) => {
        if (m) metrics.push({ key, label, value: numOrNull(m.value), unit, reference: numOrNull(m.benchmark), status: m.status ?? null, source: src, ownerPath: '/report-center' });
      };
      push('cap-asc-sil', 'ASC/SIL ratio', 'ratio', cap.ascSilRatio);
      push('cap-unsat', 'Unsatisfactory rate', '%', cap.unsatisfactoryRate);
      push('cap-tat', 'TAT on-time rate', '%', cap.tatCompliance);
      push('cap-qc-pass', 'QC pass rate', '%', cap.qcPassRate);
    } catch {
      unavailable.push('CAP benchmarks');
    }

    // Recall compliance — owner-computed complianceRate (value only; the owner exposes no
    // benchmark/status here, so we show only the recorded metric).
    try {
      const rc: any = await this.reportCenter.recallCompliance({} as any);
      metrics.push({ key: 'recall-compliance', label: 'Recall compliance rate', value: numOrNull(rc.complianceRate), unit: '%', reference: null, status: null, source: 'Recall compliance', ownerPath: '/report-center' });
    } catch {
      unavailable.push('Recall compliance');
    }

    // Abnormal rate — owner-computed value only (no owner benchmark/status).
    try {
      const ar: any = await this.reportCenter.abnormalRate({} as any);
      metrics.push({ key: 'abnormal-rate', label: 'Abnormal result rate', value: numOrNull(ar.abnormalRate), unit: '%', reference: null, status: null, source: 'Abnormal rate', ownerPath: '/report-center' });
    } catch {
      unavailable.push('Abnormal rate');
    }

    if (!metrics.length) {
      if (unavailable.length) return { status: 'error', data: null, reason: 'Benchmarks failed to load' };
      return { status: 'empty', data: null };
    }
    metrics.sort(benchmarkOrder);
    return { status: 'ready', data: { asOf: new Date().toISOString(), metrics, unavailable } };
  }

  // Medical Director oversight — a bounded queue of owner-recorded open/review-required
  // states. Gated by the descriptive `medicalDirector` permission (resultsheet:authorize).
  // Each owner source is re-read with its OWN review-required/open filter so only currently
  // actionable states appear (never historical closed items), and each resolves independently
  // (source failure/forbidden isolates to `unavailable`). No urgency/severity/risk ranking.
  private async loadMedicalDirector(perms: EffectiveQualityPermissions, userId: string): Promise<Section<MedicalDirectorSection>> {
    if (!perms.medicalDirector) return { status: 'forbidden', data: null };
    const items: OversightItem[] = [];
    const unavailable: string[] = [];

    // Correlation — cases the owner recorded as reviewRequired (owner-filtered).
    if (perms.viewRecord) {
      try {
        const rows: any[] = await this.correlation.list({ reviewRequired: true } as any);
        for (const c of Array.isArray(rows) ? rows : []) {
          if (c.reviewedAt) continue; // owner-reviewed → not open oversight
          items.push({
            id: `correlation-${c.id}`, sourceDomain: 'correlation', sourceLabel: 'Correlation',
            state: 'Review required', reason: c.discordanceReason ?? c.correlationResult ?? null,
            identity: c.cytologyRecord ? (c.cytologyRecord.labNumber ?? c.cytologyRecord.identifier ?? null) : null,
            actor: null, timestamp: iso(c.cytologyDate ?? c.createdAt), ownerPath: `/correlation/${c.id}`, actionLabel: 'Review',
          });
        }
      } catch { unavailable.push('Correlation'); }
    } else unavailable.push('Correlation');

    // Escalations — the owner's OPEN lifecycle states (owner-filtered).
    if (perms.viewRecord) {
      try {
        const rows: any[] = await this.escalation.list({ open: true } as any, userId);
        for (const e of Array.isArray(rows) ? rows : []) {
          items.push({
            id: `escalation-${e.id}`, sourceDomain: 'escalation', sourceLabel: 'Escalation',
            state: String(e.status), reason: e.trigger ? String(e.trigger) : null,
            identity: e.record ? (e.record.labNumber ?? e.record.identifier ?? null) : null,
            actor: personName(e.assignedTo), timestamp: iso(e.createdAt), ownerPath: '/escalations', actionLabel: 'Review',
          });
        }
      } catch { unavailable.push('Escalations'); }
    } else unavailable.push('Escalations');

    // Quality Control — the owner's OPEN (not-Resolved) failure alerts.
    if (perms.viewRecord) {
      try {
        const rows: any[] = await this.qc.alerts();
        for (const a of Array.isArray(rows) ? rows : []) {
          items.push({
            id: `qc-${a.id}`, sourceDomain: 'qc', sourceLabel: 'Quality Control',
            state: String(a.status), reason: a.qcCheck?.failureReason ?? null,
            identity: a.qcCheck ? String(a.qcCheck.checkType) : null,
            actor: null, timestamp: iso(a.createdAt), ownerPath: '/qc', actionLabel: 'Resolve',
          });
        }
      } catch { unavailable.push('Quality Control'); }
    } else unavailable.push('Quality Control');

    // Proficiency — tests in the owner's recorded Grading state (awaiting grading).
    if (perms.viewRecord) {
      try {
        const rows: any[] = await this.proficiency.list({} as any);
        for (const t of (Array.isArray(rows) ? rows : []).filter((x) => String(x.status) === 'Grading')) {
          items.push({
            id: `proficiency-${t.id}`, sourceDomain: 'proficiency', sourceLabel: 'Proficiency',
            state: 'Grading', reason: null, identity: t.name ?? null,
            actor: personName(t.createdBy), timestamp: iso(t.endDate ?? t.createdAt), ownerPath: `/proficiency/${t.id}`, actionLabel: 'Grade',
          });
        }
      } catch { unavailable.push('Proficiency'); }
    } else unavailable.push('Proficiency');

    const bounded = items.sort(oversightSort).slice(0, 30);
    return { status: 'ready', data: { count: bounded.length, items: bounded, unavailable } };
  }

  // Source-labeled governance trail — composed ONLY from owner services that expose a lab-wide
  // recorded read, each gated by its REAL permission (so we never surface more than the owner
  // would). Sources without a lab-wide owner feed (record-status events, which the owner exposes
  // only per-record / inside a dashboard aggregate; system/job maintenance, exposed only through
  // the superuser system log) and notification delivery (a delivery is not proof a person acted)
  // are deliberately NOT composed — see the C10 report. Every source resolves independently: a
  // permission-lack or a failure names the source in `unavailable` and preserves the others.
  private async loadGovernance(perms: EffectiveQualityPermissions): Promise<Section<GovernanceSection>> {
    // Governance has no single permission gate — it is the union of per-source reads. If the
    // caller can view NONE of the composable sources, the whole section is truthfully forbidden.
    if (!perms.viewResultSheet && !perms.security && !perms.viewChangeRequest) {
      return { status: 'forbidden', data: null };
    }
    const events: GovernanceEvent[] = [];
    const unavailable: string[] = [];

    // Result-sheet authorizations (resultsheet:view). `authorizedAt` is an owner-DEFINED event
    // timestamp (not a generic updatedAt). The lab-wide owner read exposes no authorizer, so the
    // actor is truthfully null → "Actor not recorded" (never inferred from another field).
    if (perms.viewResultSheet) {
      try {
        const page: any = await this.resultSheets.findAll({ pageSize: 25 } as any);
        const rows: any[] = Array.isArray(page?.data) ? page.data : Array.isArray(page) ? page : [];
        for (const s of rows) {
          if (!s.authorized || !s.authorizedAt) continue; // surface only the recorded authorization event
          events.push({
            id: `resultsheet-${s.id}`, sourceDomain: 'result-sheet', sourceLabel: 'Result sheets',
            eventType: 'Result sheet authorized', timestamp: new Date(s.authorizedAt).toISOString(),
            actor: null, description: `Result sheet authorized for ${s.record?.identifier ?? 'record'}`,
            ownerPath: s.recordId ? `/records/${s.recordId}` : null, historical: true, sourceAvailable: true,
          });
        }
      } catch { unavailable.push('Result sheets'); }
    } else unavailable.push('Result sheets');

    // Security access history (system:security). Login success/failure exactly as recorded —
    // never treated as anything more. Actor is the recorded email identity (or null).
    if (perms.security) {
      try {
        const rows: any[] = await this.security.listLoginAttempts({ take: 25 });
        for (const a of Array.isArray(rows) ? rows : []) {
          const place = [a.city, a.country].filter(Boolean).join(', ');
          events.push({
            id: `security-${a.id}`, sourceDomain: 'security', sourceLabel: 'Security access',
            eventType: a.success ? 'Login succeeded' : 'Login failed',
            timestamp: new Date(a.createdAt).toISOString(), actor: a.email ?? null,
            description: a.success
              ? `Successful sign-in${place ? ` from ${place}` : ''}`
              : `Failed sign-in attempt${a.failReason ? ` — ${a.failReason}` : ''}`,
            ownerPath: '/security', historical: true, sourceAvailable: true,
          });
        }
      } catch { unavailable.push('Security access'); }
    } else unavailable.push('Security access');

    // Change-request creation (changerequest:view). `createdAt` is the recorded creation event;
    // the lab-wide owner read resolves no staff actor for creation, so the actor is null. The
    // originating client office is factual context only, never presented as an inferred person.
    if (perms.viewChangeRequest) {
      try {
        const page: any = await this.changeRequests.findAll({ pageSize: 25 } as any);
        const rows: any[] = Array.isArray(page?.data) ? page.data : Array.isArray(page) ? page : [];
        for (const c of rows) {
          const office = c.client?.officeName ?? null;
          events.push({
            id: `changerequest-${c.id}`, sourceDomain: 'change-request', sourceLabel: 'Change requests',
            eventType: 'Change request opened', timestamp: new Date(c.createdAt).toISOString(), actor: null,
            description: `${c.subject ?? 'Change request'} — status ${c.status ?? 'Open'}${office ? ` (from ${office})` : ''}`,
            ownerPath: '/change-requests', historical: true, sourceAvailable: true,
          });
        }
      } catch { unavailable.push('Change requests'); }
    } else unavailable.push('Change requests');

    const bounded = events.sort(governanceSort).slice(0, 40);
    const asOf = new Date().toISOString();
    // No events → still 'empty' with every unavailable source NAMED (never a false "clean"
    // completeness claim). Source failures isolate to `unavailable`; there is no whole-section
    // error path, because one source failing never invalidates the others.
    if (!bounded.length) {
      return { status: 'empty', data: { asOf, events: [], unavailable, nonCanonical: true } };
    }
    return { status: 'ready', data: { asOf, events: bounded, unavailable, nonCanonical: true } };
  }
}

// Deterministic ordering from recorded fields only. reviewRequired first is the OWNER's
// recorded workflow state (not inferred urgency), then most recent clinical date, then
// created date, then a stable id tie-break.
function correlationSort(x: CorrelationCaseRow, y: CorrelationCaseRow): number {
  if (x.reviewRequired !== y.reviewRequired) return x.reviewRequired ? -1 : 1;
  const t = (s: string | null) => (s ? new Date(s).getTime() : -Infinity);
  return (
    t(y.cytologyDate) - t(x.cytologyDate) ||
    t(y.createdAt) - t(x.createdAt) ||
    (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)
  );
}

function mapCorrelationRow(c: any): CorrelationCaseRow {
  return {
    id: c.id,
    identity: c.cytologyRecord ? (c.cytologyRecord.labNumber ?? c.cytologyRecord.identifier ?? null) : null,
    cytologyDiagnosis: c.cytologyDiagnosis,
    histologyDiagnosis: c.histologyDiagnosis ?? null,
    histologySource: c.histologySource,
    correlationResult: c.correlationResult ?? null,
    discordanceReason: c.discordanceReason ?? null,
    reviewRequired: !!c.reviewRequired,
    reviewedAt: iso(c.reviewedAt),
    reviewerName: c.reviewedBy ? `${c.reviewedBy.firstName ?? ''} ${c.reviewedBy.lastName ?? ''}`.trim() || null : null,
    cytologyDate: iso(c.cytologyDate),
    createdAt: iso(c.createdAt),
    ownerPath: `/correlation/${c.id}`,
  };
}

const iso = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString() : null);
const personName = (u: { firstName?: string | null; lastName?: string | null } | null | undefined): string | null =>
  u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || null : null;
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && !Number.isNaN(v) ? v : null);

// Medical Director oversight ordering: every item is already an owner-recorded open/
// review-required state (criterion 1), so ordering is oldest-open first (age), then a fixed
// source order only for EXACT timestamp ties, then a stable id. This reflects recorded
// workflow state and age only — it is NOT a PathOS-generated urgency, severity, or risk
// ranking, and never orders by malignancy, cross-domain severity, benchmark, or staff.
const OVERSIGHT_SOURCE_ORDER: Record<string, number> = { correlation: 0, escalation: 1, qc: 2, proficiency: 3 };
function oversightSort(x: OversightItem, y: OversightItem): number {
  const t = (s: string | null) => (s ? new Date(s).getTime() : Infinity);
  return (
    t(x.timestamp) - t(y.timestamp) ||
    (OVERSIGHT_SOURCE_ORDER[x.sourceDomain] ?? 99) - (OVERSIGHT_SOURCE_ORDER[y.sourceDomain] ?? 99) ||
    (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)
  );
}

// Governance trail ordering: strict reverse chronology (newest recorded event first), then a
// FIXED source order ONLY for exact timestamp ties, then a stable id. Chronology only — never
// reordered to create a cleaner narrative, and never ranked by severity or inferred importance.
const GOVERNANCE_SOURCE_ORDER: Record<string, number> = { 'result-sheet': 0, security: 1, 'change-request': 2 };
function governanceSort(x: GovernanceEvent, y: GovernanceEvent): number {
  const t = (s: string) => new Date(s).getTime();
  return (
    t(y.timestamp) - t(x.timestamp) ||
    (GOVERNANCE_SOURCE_ORDER[x.sourceDomain] ?? 99) - (GOVERNANCE_SOURCE_ORDER[y.sourceDomain] ?? 99) ||
    (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)
  );
}

// Deterministic benchmark ordering: a FIXED source/domain order (documented here), then
// the owner metric key. Never ordered by best/worst or inferred importance.
const BENCHMARK_SOURCE_ORDER: Record<string, number> = { 'CAP benchmarks': 0, 'Recall compliance': 1, 'Abnormal rate': 2 };
function benchmarkOrder(x: BenchmarkMetric, y: BenchmarkMetric): number {
  const sx = BENCHMARK_SOURCE_ORDER[x.source] ?? 99;
  const sy = BENCHMARK_SOURCE_ORDER[y.source] ?? 99;
  return sx - sy || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0);
}

// Recent checks: most recent performed/created date first, then a stable id tie-break.
function qcCheckSort(x: QcCheckRow, y: QcCheckRow): number {
  const t = (s: string | null) => (s ? new Date(s).getTime() : -Infinity);
  return (
    t(y.performedAt) - t(x.performedAt) ||
    t(y.createdAt) - t(x.createdAt) ||
    (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)
  );
}

// Open alerts: all are unresolved (the owner returns not-Resolved only); no severity is
// stored, so we do NOT rank by severity. Oldest unresolved first, then a stable id.
function qcAlertSort(x: QcAlertRow, y: QcAlertRow): number {
  const t = (s: string | null) => (s ? new Date(s).getTime() : Infinity);
  return t(x.createdAt) - t(y.createdAt) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
}

function mapQcCheck(c: any): QcCheckRow {
  return {
    id: c.id,
    checkType: String(c.checkType),
    result: String(c.result),
    failureReason: c.failureReason ?? null,
    correctiveAction: c.correctiveAction ?? null,
    equipmentName: c.equipment?.name ?? null,
    performerName: personName(c.performedBy),
    recordIdentity: c.record ? (c.record.labNumber ?? c.record.identifier ?? null) : null,
    performedAt: iso(c.performedAt),
    createdAt: iso(c.createdAt),
    ownerPath: '/qc',
  };
}

// Proficiency ordering: recorded in-progress state first (Draft/Active/Grading — the
// owner's recorded status, NOT inferred urgency or staff risk), then most recent recorded
// date, then createdAt, then a stable id.
const PROFICIENCY_IN_PROGRESS = new Set(['Draft', 'Active', 'Grading']);
function proficiencySort(x: ProficiencyTestRow, y: ProficiencyTestRow): number {
  const inProgress = (r: ProficiencyTestRow) => PROFICIENCY_IN_PROGRESS.has(r.status);
  if (inProgress(x) !== inProgress(y)) return inProgress(x) ? -1 : 1;
  const t = (s: string | null) => (s ? new Date(s).getTime() : -Infinity);
  return (
    t(y.endDate ?? y.createdAt) - t(x.endDate ?? x.createdAt) ||
    t(y.createdAt) - t(x.createdAt) ||
    (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)
  );
}

// Escalation ordering: recorded OPEN lifecycle state first (Pending/Acknowledged/UnderReview
// — the owner's own OPEN_STATUSES), then oldest open, then a stable id. This reflects
// recorded workflow state — NOT a PathOS-generated urgency score. Severity is displayed
// (stored) but is NOT ranked here, to avoid duplicating the owner's severity ordering.
const ESCALATION_OPEN = new Set(['Pending', 'Acknowledged', 'UnderReview']);
function escalationSort(x: EscalationRow, y: EscalationRow): number {
  const open = (r: EscalationRow) => ESCALATION_OPEN.has(r.status);
  if (open(x) !== open(y)) return open(x) ? -1 : 1;
  const t = (s: string | null) => (s ? new Date(s).getTime() : Infinity);
  return t(x.createdAt) - t(y.createdAt) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
}

function mapEscalation(e: any): EscalationRow {
  return {
    id: e.id,
    identity: e.record ? (e.record.labNumber ?? e.record.identifier ?? null) : null,
    trigger: e.trigger ? String(e.trigger) : null,
    severity: e.severity ? String(e.severity) : null,
    status: String(e.status),
    assignedToName: personName(e.assignedTo),
    reviewerName: personName(e.reviewedBy),
    createdAt: iso(e.createdAt),
    reviewedAt: iso(e.reviewedAt),
    resolvedAt: iso(e.resolvedAt),
    resolvedReason: e.resolvedReason ?? null,
    ownerPath: '/escalations',
  };
}

// Recall ordering follows the owner-recorded status only: overdue → due → pending →
// completed → then by due/completion date → stable id. Overdue is a RECORDED status, never
// computed from dates.
const RECALL_STATUS_RANK: Record<string, number> = { Overdue: 0, Due: 1, Pending: 2, Completed: 3 };
function recallSort(x: RecallRow, y: RecallRow): number {
  const rx = RECALL_STATUS_RANK[x.status] ?? 4;
  const ry = RECALL_STATUS_RANK[y.status] ?? 4;
  if (rx !== ry) return rx - ry;
  const t = (s: string | null) => (s ? new Date(s).getTime() : Infinity);
  return t(x.dueAt ?? x.completedAt) - t(y.dueAt ?? y.completedAt) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
}

function mapRecall(r: any): RecallRow {
  return {
    id: r.id,
    identity: r.patientName ?? (r.patient ? `${r.patient.firstName ?? ''} ${r.patient.lastName ?? ''}`.trim() || null : null),
    reason: r.triggerDiagnosis ?? null,
    status: String(r.status),
    dueAt: iso(r.dueDate),
    completedAt: iso(r.completedAt),
    completionNote: r.notes ?? null,
    ownerPath: '/recalls',
  };
}

function mapProficiencyTest(t: any): ProficiencyTestRow {
  return {
    id: t.id,
    name: t.name,
    testType: String(t.testType),
    status: String(t.status),
    administeredByName: personName(t.createdBy),
    passingScore: typeof t.passingScore === 'number' ? t.passingScore : null,
    caseCount: t.caseCount ?? 0,
    responderCount: t.responderCount ?? 0,
    startDate: iso(t.startDate),
    endDate: iso(t.endDate),
    createdAt: iso(t.createdAt),
    ownerPath: `/proficiency/${t.id}`,
  };
}

function mapQcAlert(a: any): QcAlertRow {
  return {
    id: a.id,
    status: String(a.status),
    relatedCheckType: a.qcCheck ? String(a.qcCheck.checkType) : null,
    failureReason: a.qcCheck?.failureReason ?? null,
    equipmentName: a.qcCheck?.equipment?.name ?? null,
    createdAt: iso(a.createdAt),
    resolvedAt: iso(a.resolvedAt),
    ownerPath: '/qc',
  };
}

function buildPermissions(user: AuthUser): EffectiveQualityPermissions {
  const has = (code: string) => !!user.isSuperRole || user.permissions.includes(code);
  return {
    viewRecord: has('record:view'),
    changeRecord: has('record:change'),
    viewResultSheet: has('resultsheet:view'),
    authorize: has('resultsheet:authorize'),
    viewResultEntry: has('resultentry:view'),
    viewReport: has('report:view'),
    security: has('system:security'),
    viewNotification: has('notification:view'),
    viewChangeRequest: has('changerequest:view'),
    changeChangeRequest: has('changerequest:change'),
    // Permission-derived, never role-name-derived (docs §7 / §12: MD persona maps to the
    // holders of the oversight permission, not to a seeded "Medical Director" role).
    medicalDirector: has('resultsheet:authorize'),
  };
}
