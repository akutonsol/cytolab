import { Injectable } from '@nestjs/common';
import { CorrelationService } from '../correlation/correlation.service';
import { QcService } from '../qc/qc.service';
import { EscalationService } from '../escalation/escalation.service';
import { RecallService } from '../recall/recall.service';
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

export interface QualityOverviewAggregate {
  asOf: string;
  permissions: Section<EffectiveQualityPermissions>;
  overview: Section<OverviewData>;
  // The remaining nine evidence sections stay deferred at C3. Each carries its own status
  // so a future section failure isolates to it and never collapses permissions or siblings.
  correlation: Section<null>;
  discordance: Section<null>;
  qc: Section<null>;
  proficiency: Section<null>;
  escalations: Section<null>;
  recall: Section<null>;
  benchmarks: Section<null>;
  medicalDirector: Section<null>;
  governance: Section<null>;
}

const deferred = (): Section<null> => ({ status: 'deferred', data: null });

@Injectable()
export class QualityGovernanceService {
  constructor(
    private readonly correlation: CorrelationService,
    private readonly qc: QcService,
    private readonly escalation: EscalationService,
    private readonly recall: RecallService,
  ) {}

  async overview(user: AuthUser): Promise<QualityOverviewAggregate> {
    // Permissions resolve independently of any evidence load (partial-failure tolerance):
    // they survive every future downstream failure.
    const perms = buildPermissions(user);
    const overview = await this.loadOverview(perms);
    return {
      asOf: new Date().toISOString(),
      permissions: { status: 'ready', data: perms },
      overview,
      correlation: deferred(),
      discordance: deferred(),
      qc: deferred(),
      proficiency: deferred(),
      escalations: deferred(),
      recall: deferred(),
      benchmarks: deferred(),
      medicalDirector: deferred(),
      governance: deferred(),
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
