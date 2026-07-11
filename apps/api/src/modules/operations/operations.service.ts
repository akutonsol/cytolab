import { Injectable } from '@nestjs/common';
import { CorrelationResult, RecordStatus, TransmissionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { hoursElapsed, tatPriority, TAT_PRIORITY_RANK, type TatPriority } from '../../common/util/tat-priority';

/**
 * Laboratory Operations Workspace (Phase 2A) — read-only aggregation.
 *
 * Backs B1 Pipeline Board + A1 Attention Rail (overview) and C2 SLA Risk detail.
 * It recomposes the EXISTING record lifecycle — it invents no new status, stage,
 * or SLA field. The lifecycle grouping mirrors patients.service STAGE
 * (Intake → Processing → Review); the SLA/priority derivation reuses the shared
 * tatPriority()/hoursElapsed() helpers and the lab's targetTatDays budget, exactly
 * as WorkloadService. Every surface shares ONE enrichment pass (loadInFlight) so
 * TAT/priority is computed in a single place and never duplicated.
 *
 * Note (traceability): the blueprint's finer sub-stages (Scan/QC/AI as distinct
 * queues) and an explicit per-case blocker/dependency are NOT expressible from the
 * current data model. These surfaces report what is truly recorded and state
 * "No blocking dependency recorded" rather than inferring.
 */

/** Ordered in-flight pipeline: the six pre-Approved statuses, grouped by lifecycle. */
const PIPELINE: { status: RecordStatus; group: string }[] = [
  { status: RecordStatus.Pending, group: 'Intake' },
  { status: RecordStatus.Submitted, group: 'Intake' },
  { status: RecordStatus.Processing, group: 'Processing' },
  { status: RecordStatus.Partial, group: 'Processing' },
  { status: RecordStatus.Completed, group: 'Review' },
  { status: RecordStatus.Resulted, group: 'Review' },
];

const IN_FLIGHT: RecordStatus[] = PIPELINE.map((s) => s.status);

/** Human labels for the status keys (the board never shows a raw enum). */
const STATUS_LABEL: Partial<Record<RecordStatus, string>> = {
  [RecordStatus.Pending]: 'Pending',
  [RecordStatus.Submitted]: 'Submitted',
  [RecordStatus.Processing]: 'Processing',
  [RecordStatus.Partial]: 'Partial',
  [RecordStatus.Completed]: 'Awaiting Review',
  [RecordStatus.Resulted]: 'In Sign-Out',
};

/** Domain token stem per status, so the client never names a hue. */
const STATUS_DOMAIN: Partial<Record<RecordStatus, string>> = {
  [RecordStatus.Pending]: 'workflow-pending',
  [RecordStatus.Submitted]: 'workflow-submitted',
  [RecordStatus.Processing]: 'workflow-processing',
  [RecordStatus.Partial]: 'workflow-processing',
  [RecordStatus.Completed]: 'workflow-complete',
  [RecordStatus.Resulted]: 'workflow-resulted',
};

const MAX_ATTENTION = 8;

type Severity = 'critical' | 'high' | 'medium';
const SEVERITY: Record<Exclude<TatPriority, 'Routine'>, Severity> = {
  Stat: 'critical',
  Urgent: 'high',
  Priority: 'medium',
};

/** A record enriched once with its age, TAT priority, and remaining SLA budget. */
interface EnrichedRecord {
  id: string;
  status: RecordStatus;
  urgent: boolean;
  labNumber: string | null;
  identifier: string;
  assignedTo: { firstName: string | null; lastName: string | null } | null;
  ageHours: number;
  priority: TatPriority;
  /** thresholdHours − ageHours; negative once breached. */
  remainingHours: number;
}

export interface PipelineStage {
  status: RecordStatus;
  label: string;
  group: string;
  domain: string;
  count: number;
  oldestAgeHours: number;
  oldestCaseRef: string | null;
  atRisk: number;
}

export interface AttentionItem {
  id: string;
  caseRef: string;
  stage: string;
  priority: TatPriority;
  severity: Severity;
  ageHours: number;
  overHours: number;
  budgetPct: number;
  reason: string;
  assignee: string | null;
}

export interface OperationsOverview {
  asOf: string;
  thresholdHours: number;
  pipeline: { stages: PipelineStage[]; totalInFlight: number };
  attention: {
    items: AttentionItem[];
    totalAtRisk: number;
    urgentCount: number;
    inFlight: number;
    allClear: boolean;
  };
}

export type RiskLevel = 'breached' | 'at-risk';

export interface SlaRiskItem {
  id: string;
  caseRef: string;
  stage: string;
  urgent: boolean;
  risk: RiskLevel;
  ageHours: number;
  /** Signed: hours remaining before breach; negative → already breached. */
  remainingHours: number;
  overHours: number;
  budgetPct: number;
  reason: string;
  /** Assignee display name, or null → the client shows "Unassigned". */
  owner: string | null;
  /** A recorded blocking dependency, or null → "No blocking dependency recorded". */
  blocker: string | null;
  action: { label: string; route: string };
}

export interface SlaRiskDetail {
  asOf: string;
  thresholdHours: number;
  summary: { breached: number; atRisk: number; withinTarget: number; inFlight: number };
  items: SlaRiskItem[];
}

// ── Integration Health ───────────────────────────────────────────────────────
// Honest by construction: health is claimed ONLY from real message/test signals.
// The audit found exactly ONE modeled external interface — FHIR (outbound EMR).
// No HL7 v2, DICOM, LIS, or generic-API connector is modeled, so none are shown.
// Health is derived from real signals ONLY. Environment (production/sandbox) is a
// separate axis and is never a health value — configuration is not health.
export type InterfaceHealth = 'operational' | 'degraded' | 'unknown' | 'disabled';
export type InterfaceEnvironment = 'production' | 'sandbox';

export interface IntegrationInterface {
  id: string;
  name: string;
  type: 'FHIR';
  system: string;
  health: InterfaceHealth;
  /** Deployment target — metadata, NOT a health signal. */
  environment: InterfaceEnvironment;
  isActive: boolean;
  /** Real last successful delivery (FHIRTransmission.transmittedAt), or null. */
  lastSuccessAt: string | null;
  /** Most recent of success / failure / manual test — or null if none. */
  lastActivityAt: string | null;
  lastTest: { at: string | null; status: string | null; failed: boolean };
  counts: { total: number; success: number; failed: number };
  lastError: { message: string | null; responseCode: number | null; at: string } | null;
  affectedWorkflow: string;
  detail: string;
  action: { label: string; route: string };
}

/** A recorded activity timestamp that is NOT a monitored interface (stated as such). */
export interface ActivitySignal {
  key: 'portal' | 'wsi';
  label: string;
  lastActivityAt: string | null;
  note: string;
}

export interface IntegrationHealthReport {
  asOf: string;
  overall: 'operational' | 'degraded' | 'unknown' | 'none';
  summary: {
    total: number;
    // Health counts — a sandbox interface is still counted by its real health.
    operational: number; degraded: number; unknown: number; disabled: number;
    // Environment counts — metadata.
    production: number; sandbox: number;
  };
  interfaces: IntegrationInterface[];
  activity: ActivitySignal[];
  note: string;
}

// ── Q · Quality Alerts ───────────────────────────────────────────────────────
// Only recorded, CONFIRMED quality events with an OPEN/actionable state are shown.
// Nothing is inferred from a generic error, OnHold, Failed, urgent flag, or delay.
export type QualityAlertKind = 'qc-failure' | 'diagnostic-discordance';
export type QualitySeverity = 'high' | 'medium';

export interface QualityAlertItem {
  id: string;
  kind: QualityAlertKind;
  title: string; // what happened
  detail: string; // the recorded specifics
  severity: QualitySeverity | null; // only if recorded
  caseRef: string | null; // labNumber of the affected case, if recorded
  equipmentRef: string | null; // affected equipment, if recorded
  owner: string | null; // if recorded
  occurredAt: string; // when
  action: { label: string; route: string }; // real next action, existing route
}

export interface QualityAlertsReport {
  asOf: string;
  summary: { total: number; qcFailures: number; discordances: number; high: number };
  items: QualityAlertItem[];
  sources: { kind: QualityAlertKind; label: string; note: string }[];
  note: string;
}

const QC_TYPE_LABEL: Record<string, string> = {
  SlidePreparation: 'slide preparation',
  StainingQuality: 'staining quality',
  FixationAdequacy: 'fixation adequacy',
  CellularityCheck: 'cellularity',
  EquipmentCalibration: 'equipment calibration',
  ReagentCheck: 'reagent check',
  ExternalQC: 'external QC',
};

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly labContext: LabContext,
  ) {}

  /** Turnaround budget in hours — the lab's targetTatDays (default 3), as WorkloadService. */
  private async thresholdHours(): Promise<number> {
    const labId = this.labContext.getLabId();
    const lab = labId
      ? await this.prisma.lab.findFirst({ where: { id: labId }, select: { targetTatDays: true } })
      : null;
    return (lab?.targetTatDays ?? 3) * 24;
  }

  /**
   * The single enrichment pass shared by every operations surface. One tenant-scoped
   * read of the in-flight records (labId auto-applied), with age, TAT priority, and
   * remaining budget derived once via the shared helpers.
   */
  private async loadInFlight(): Promise<{ enriched: EnrichedRecord[]; thresholdHours: number; now: number }> {
    const now = Date.now();
    const thresholdHours = await this.thresholdHours();

    const records = await this.prisma.record.findMany({
      where: { status: { in: IN_FLIGHT } },
      select: {
        id: true,
        status: true,
        urgent: true,
        specimenDate: true,
        createdAt: true,
        labNumber: true,
        identifier: true,
        assignedTo: { select: { firstName: true, lastName: true } },
      },
    });

    const enriched: EnrichedRecord[] = records.map((r) => {
      const startedAt = r.specimenDate ?? r.createdAt;
      const ageHours = hoursElapsed(startedAt, now);
      const priority = tatPriority({ urgent: r.urgent, startedAt, thresholdHours, now });
      return {
        id: r.id,
        status: r.status,
        urgent: r.urgent,
        labNumber: r.labNumber,
        identifier: r.identifier,
        assignedTo: r.assignedTo,
        ageHours,
        priority,
        remainingHours: thresholdHours - ageHours,
      };
    });

    return { enriched, thresholdHours, now };
  }

  async overview(): Promise<OperationsOverview> {
    const { enriched, thresholdHours, now } = await this.loadInFlight();

    const stages: PipelineStage[] = PIPELINE.map(({ status, group }) => {
      const inStage = enriched.filter((r) => r.status === status);
      const oldest = inStage.reduce<EnrichedRecord | null>(
        (acc, r) => (!acc || r.ageHours > acc.ageHours ? r : acc),
        null,
      );
      return {
        status,
        label: STATUS_LABEL[status] ?? status,
        group,
        domain: STATUS_DOMAIN[status] ?? 'workflow-pending',
        count: inStage.length,
        oldestAgeHours: oldest?.ageHours ?? 0,
        oldestCaseRef: oldest ? oldest.labNumber ?? oldest.identifier : null,
        atRisk: inStage.filter((r) => r.priority !== 'Routine').length,
      };
    });

    const atRisk = enriched
      .filter((r) => r.priority !== 'Routine')
      .sort(
        (a, b) =>
          TAT_PRIORITY_RANK[b.priority] - TAT_PRIORITY_RANK[a.priority] || b.ageHours - a.ageHours,
      );

    const items: AttentionItem[] = atRisk.slice(0, MAX_ATTENTION).map((r) => {
      const overHours = Math.max(0, -r.remainingHours);
      const budgetPct = thresholdHours > 0 ? Math.round((r.ageHours / thresholdHours) * 100) : 0;
      return {
        id: r.id,
        caseRef: r.labNumber ?? r.identifier,
        stage: STATUS_LABEL[r.status] ?? r.status,
        priority: r.priority,
        severity: SEVERITY[r.priority as Exclude<TatPriority, 'Routine'>],
        ageHours: r.ageHours,
        overHours,
        budgetPct,
        reason: reasonFor(r.priority, overHours, budgetPct),
        assignee: assigneeName(r.assignedTo),
      };
    });

    return {
      asOf: new Date(now).toISOString(),
      thresholdHours,
      pipeline: { stages, totalInFlight: enriched.length },
      attention: {
        items,
        totalAtRisk: atRisk.length,
        urgentCount: enriched.filter((r) => r.urgent).length,
        inFlight: enriched.length,
        allClear: atRisk.length === 0,
      },
    };
  }

  /**
   * C2 — SLA Risk detail. The full ranked list of breached + approaching cases,
   * each with why, how much time remains, who owns it, its blocker, and one real
   * clearing action. Shares loadInFlight() with overview() — no duplicated math.
   */
  async slaRisk(): Promise<SlaRiskDetail> {
    const { enriched, thresholdHours, now } = await this.loadInFlight();

    const classify = (r: EnrichedRecord): RiskLevel | 'within-target' => {
      if (r.remainingHours <= 0) return 'breached';
      return r.priority !== 'Routine' ? 'at-risk' : 'within-target';
    };

    const classified = enriched.map((r) => ({ r, level: classify(r) }));

    const summary = {
      breached: classified.filter((c) => c.level === 'breached').length,
      atRisk: classified.filter((c) => c.level === 'at-risk').length,
      withinTarget: classified.filter((c) => c.level === 'within-target').length,
      inFlight: enriched.length,
    };

    const list = classified.filter((c) => c.level !== 'within-target');

    // Deterministic ranking: breached → urgent → least time remaining → oldest.
    list.sort((a, b) => {
      const breach = Number(b.level === 'breached') - Number(a.level === 'breached');
      if (breach) return breach;
      const urgent = Number(b.r.urgent) - Number(a.r.urgent);
      if (urgent) return urgent;
      const remaining = a.r.remainingHours - b.r.remainingHours; // least (most negative) first
      if (remaining) return remaining;
      return b.r.ageHours - a.r.ageHours; // oldest first
    });

    const items: SlaRiskItem[] = list.map(({ r, level }) => {
      const overHours = Math.max(0, -r.remainingHours);
      const budgetPct = thresholdHours > 0 ? Math.round((r.ageHours / thresholdHours) * 100) : 0;
      const assigned = !!assigneeName(r.assignedTo);
      return {
        id: r.id,
        caseRef: r.labNumber ?? r.identifier,
        stage: STATUS_LABEL[r.status] ?? r.status,
        urgent: r.urgent,
        risk: level as RiskLevel,
        ageHours: r.ageHours,
        remainingHours: r.remainingHours,
        overHours,
        budgetPct,
        reason: reasonFor(r.priority, overHours, budgetPct),
        owner: assigneeName(r.assignedTo),
        // The only recorded blocking fact available: an unassigned case cannot advance
        // to review. No other dependency (IHC/molecular/instrument) is stored, so we
        // state that plainly rather than infer one.
        blocker: assigned ? null : 'Awaiting reviewer assignment',
        action: assigned
          ? { label: 'Review case', route: '/records' }
          : { label: 'Assign reviewer', route: '/workload' },
      };
    });

    return {
      asOf: new Date(now).toISOString(),
      thresholdHours,
      summary,
      items,
    };
  }

  /**
   * Integration Health — the honest state of PathOS's external interfaces.
   *
   * Only FHIR (outbound EMR) is modeled with message-level data, so it is the only
   * interface reported. Health is claimed ONLY from real signals: a delivered/failed
   * FHIRTransmission or a manual endpoint test. Config existence alone is never
   * "healthy" — an active endpoint with no activity is "unknown". Environment
   * (production/sandbox) is reported separately as metadata, never as health; a sandbox
   * endpoint's simulated successes are not counted as evidence of delivery.
   * All reads are lab-scoped by the tenancy extension (groupBy/aggregate included).
   */
  async integrationHealth(): Promise<IntegrationHealthReport> {
    const now = Date.now();

    const endpoints = await this.prisma.fHIREndpoint.findMany({
      select: {
        id: true,
        name: true,
        system: true,
        isActive: true,
        isSandbox: true,
        lastTestedAt: true,
        lastTestStatus: true,
      },
      orderBy: { name: 'asc' },
    });

    const [totalAgg, successAgg, failAgg, portalMax, wsiMax] = await Promise.all([
      this.prisma.fHIRTransmission.groupBy({ by: ['endpointId'], _count: { _all: true } }),
      this.prisma.fHIRTransmission.groupBy({
        by: ['endpointId'],
        where: { status: TransmissionStatus.Success },
        _count: { _all: true },
        _max: { transmittedAt: true },
      }),
      this.prisma.fHIRTransmission.groupBy({
        by: ['endpointId'],
        where: { status: TransmissionStatus.Failed },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      this.prisma.portalUser.aggregate({ _max: { lastLoginAt: true } }),
      this.prisma.digitalSlide.aggregate({ _max: { uploadedAt: true } }),
    ]);

    const totalBy = new Map(totalAgg.map((a) => [a.endpointId, a._count._all]));
    const successBy = new Map(successAgg.map((a) => [a.endpointId, { count: a._count._all, last: a._max.transmittedAt }]));
    const failBy = new Map(failAgg.map((a) => [a.endpointId, { count: a._count._all, last: a._max.createdAt }]));

    // Latest failure detail, only for endpoints that actually have a failure (few).
    const failingIds = failAgg.map((a) => a.endpointId);
    const lastErrors = await Promise.all(
      failingIds.map((id) =>
        this.prisma.fHIRTransmission
          .findFirst({
            where: { endpointId: id, status: TransmissionStatus.Failed },
            orderBy: { createdAt: 'desc' },
            select: { errorMessage: true, responseCode: true, createdAt: true },
          })
          .then((e) => [id, e] as const),
      ),
    );
    const lastErrorBy = new Map(lastErrors);

    const interfaces: IntegrationInterface[] = endpoints.map((e) => {
      const success = successBy.get(e.id);
      const fail = failBy.get(e.id);
      const lastSuccessAt = success?.last ?? null;
      const lastFailureAt = fail?.last ?? null;
      const testFailed = e.lastTestStatus ? /^fail/i.test(e.lastTestStatus) : false;

      const health = classifyInterface({
        isActive: e.isActive,
        isSandbox: e.isSandbox,
        lastSuccessAt,
        lastFailureAt,
        lastTestedAt: e.lastTestedAt,
        testFailed,
      });

      const activityCandidates = [lastSuccessAt, lastFailureAt, e.lastTestedAt]
        .filter((d): d is Date => !!d)
        .map((d) => +new Date(d));
      const lastActivityAt = activityCandidates.length ? new Date(Math.max(...activityCandidates)).toISOString() : null;

      const err = health === 'degraded' ? lastErrorBy.get(e.id) : null;
      const lastError =
        health === 'degraded'
          ? err
            ? { message: err.errorMessage, responseCode: err.responseCode, at: err.createdAt.toISOString() }
            : testFailed
              ? { message: e.lastTestStatus, responseCode: null, at: (e.lastTestedAt ?? new Date(now)).toISOString() }
              : null
          : null;

      return {
        id: e.id,
        name: e.name,
        type: 'FHIR',
        system: e.system,
        health,
        environment: e.isSandbox ? 'sandbox' : 'production',
        isActive: e.isActive,
        lastSuccessAt: iso(lastSuccessAt),
        lastActivityAt,
        lastTest: {
          at: iso(e.lastTestedAt),
          status: e.lastTestStatus,
          failed: testFailed,
        },
        counts: {
          total: totalBy.get(e.id) ?? 0,
          success: success?.count ?? 0,
          failed: fail?.count ?? 0,
        },
        lastError,
        affectedWorkflow: 'Report delivery to the EMR (outbound DiagnosticReport)',
        detail: interfaceDetail(health, lastError?.message ?? null),
        action: interfaceAction(health),
      };
    });

    const summary = {
      total: interfaces.length,
      operational: interfaces.filter((i) => i.health === 'operational').length,
      degraded: interfaces.filter((i) => i.health === 'degraded').length,
      unknown: interfaces.filter((i) => i.health === 'unknown').length,
      disabled: interfaces.filter((i) => i.health === 'disabled').length,
      production: interfaces.filter((i) => i.environment === 'production').length,
      sandbox: interfaces.filter((i) => i.environment === 'sandbox').length,
    };

    const overall: IntegrationHealthReport['overall'] =
      interfaces.length === 0
        ? 'none'
        : summary.degraded > 0
          ? 'degraded'
          : summary.operational > 0
            ? 'operational'
            : 'unknown';

    const activity: ActivitySignal[] = [
      {
        key: 'portal',
        label: 'Referring-clinician portal',
        lastActivityAt: iso(portalMax._max.lastLoginAt),
        note: 'Last portal sign-in — an activity signal, not a connectivity check.',
      },
      {
        key: 'wsi',
        label: 'Digital slides (WSI)',
        lastActivityAt: iso(wsiMax._max.uploadedAt),
        note: 'Last slide uploaded — an activity signal, not a device connection.',
      },
    ];

    return {
      asOf: new Date(now).toISOString(),
      overall,
      summary,
      interfaces,
      activity,
      note: 'Only FHIR (outbound EMR) is instrumented for message-level health. HL7 v2, DICOM, and generic LIS interfaces are defined in the roadmap but not yet modeled, so they are not shown.',
    };
  }

  /**
   * Quality Alerts — recorded, confirmed operational quality events that are still
   * OPEN. Two first-class, unambiguous sources only:
   *  - QC failure alerts: an unresolved QCFailureAlert on a Fail/Marginal QCCheck.
   *  - Diagnostic discordance awaiting review: a CorrelationCase where BOTH the
   *    cytology and histology diagnoses AND their relationship (correlationResult)
   *    are recorded, marked review-required, and not yet reviewed — so discordance
   *    is recorded, never inferred.
   * Nothing else is turned into a quality alert. All reads are lab-scoped by the
   * tenancy extension on the injected Prisma client.
   */
  async qualityAlerts(): Promise<QualityAlertsReport> {
    const now = Date.now();

    const [qcAlerts, discordances] = await Promise.all([
      this.prisma.qCFailureAlert.findMany({
        where: { status: { not: 'Resolved' } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          qcCheck: {
            select: {
              checkType: true,
              result: true,
              failureReason: true,
              performedAt: true,
              record: { select: { labNumber: true, identifier: true } },
              equipment: { select: { name: true } },
              performedBy: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
      this.prisma.correlationCase.findMany({
        where: {
          reviewRequired: true,
          reviewedAt: null,
          correlationResult: { in: [CorrelationResult.MinorDiscordant, CorrelationResult.MajorDiscordant] },
        },
        orderBy: { updatedAt: 'desc' },
        take: 100,
        select: {
          id: true,
          correlationResult: true,
          discordanceReason: true,
          cytologyDiagnosis: true,
          histologyDiagnosis: true,
          updatedAt: true,
          cytologyRecord: { select: { labNumber: true, identifier: true } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    const qcItems: QualityAlertItem[] = qcAlerts.map((a) => {
      const c = a.qcCheck;
      const severity: QualitySeverity | null = c.result === 'Fail' ? 'high' : c.result === 'Marginal' ? 'medium' : null;
      return {
        id: a.id,
        kind: 'qc-failure',
        title: `QC ${String(c.result).toLowerCase()} — ${QC_TYPE_LABEL[c.checkType] ?? c.checkType}`,
        detail: c.failureReason ?? 'No failure reason recorded.',
        severity,
        caseRef: c.record?.labNumber ?? c.record?.identifier ?? null,
        equipmentRef: c.equipment?.name ?? null,
        owner: assigneeName(c.performedBy),
        occurredAt: new Date(c.performedAt).toISOString(),
        action: { label: 'Review in QC console', route: '/qc' },
      };
    });

    const discItems: QualityAlertItem[] = discordances.map((d) => {
      const major = d.correlationResult === CorrelationResult.MajorDiscordant;
      return {
        id: d.id,
        kind: 'diagnostic-discordance' as const,
        title: `${major ? 'Major' : 'Minor'} cytology–histology discordance`,
        detail: d.discordanceReason ?? `Cytology: ${d.cytologyDiagnosis} · Histology: ${d.histologyDiagnosis ?? '—'}`,
        severity: (major ? 'high' : 'medium') as QualitySeverity,
        caseRef: d.cytologyRecord?.labNumber ?? d.cytologyRecord?.identifier ?? null,
        equipmentRef: null,
        owner: assigneeName(d.createdBy),
        occurredAt: new Date(d.updatedAt).toISOString(),
        action: { label: 'Review correlation', route: '/correlation' },
      };
    });

    const items = [...qcItems, ...discItems].sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt));

    return {
      asOf: new Date(now).toISOString(),
      summary: {
        total: items.length,
        qcFailures: qcItems.length,
        discordances: discItems.length,
        high: items.filter((i) => i.severity === 'high').length,
      },
      items,
      sources: [
        { kind: 'qc-failure', label: 'QC failure alerts', note: 'An unresolved QCFailureAlert on a Fail/Marginal QC check.' },
        { kind: 'diagnostic-discordance', label: 'Diagnostic discordance', note: 'A cytology–histology correlation recorded as discordant and awaiting review.' },
      ],
      note: 'Only recorded, open quality events are shown. Unsatisfactory specimens, report amendments, and proficiency results are recorded quality events too, but are history rather than open alerts and are not surfaced here.',
    };
  }
}

/** One-line, human explanation of why a case is on the rail. No hue, no fabrication. */
function reasonFor(priority: TatPriority, overHours: number, budgetPct: number): string {
  switch (priority) {
    case 'Stat':
      return `Urgent · ${overHours}h past turnaround target`;
    case 'Urgent':
      return `Urgent · ${budgetPct}% of turnaround budget used`;
    case 'Priority':
      return overHours > 0
        ? `${overHours}h past turnaround target`
        : `${budgetPct}% of turnaround budget used`;
    default:
      return `${budgetPct}% of turnaround budget used`;
  }
}

function assigneeName(a: { firstName: string | null; lastName: string | null } | null): string | null {
  if (!a) return null;
  const name = `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim();
  return name || null;
}

function iso(d: Date | null | undefined): string | null {
  return d ? new Date(d).toISOString() : null;
}

/**
 * Classify an interface's HEALTH from real signals only. Environment (production vs
 * sandbox) is a separate axis and is NEVER a health value: health is not inferred from
 * configuration. A failed connection test or transmission always affects health.
 *  - disabled: configuration says the endpoint is off. This is a real operational fact,
 *    not a quality inference — a disabled endpoint attempts nothing.
 *  - degraded: the most recent real signal (transmission or connection test) failed.
 *  - operational: the most recent real signal succeeded — evidence of working delivery.
 *  - unknown: no real signal to judge by.
 *
 * Sandbox caveat, kept honest: a sandbox transmission SUCCESS is simulated and cannot
 * prove live delivery, so it is not counted as positive evidence. Failures and connection
 * tests are real in any environment and always count. A sandbox interface whose only
 * signals are simulated successes is therefore "unknown", never "operational".
 */
function classifyInterface(o: {
  isActive: boolean;
  isSandbox: boolean;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastTestedAt: Date | null;
  testFailed: boolean;
}): InterfaceHealth {
  if (!o.isActive) return 'disabled';
  const signals: { ts: number; ok: boolean }[] = [];
  // A success is positive evidence only in production — sandbox successes are simulated.
  if (o.lastSuccessAt && !o.isSandbox) signals.push({ ts: +new Date(o.lastSuccessAt), ok: true });
  if (o.lastFailureAt) signals.push({ ts: +new Date(o.lastFailureAt), ok: false });
  if (o.lastTestedAt) signals.push({ ts: +new Date(o.lastTestedAt), ok: !o.testFailed });
  if (signals.length === 0) return 'unknown';
  signals.sort((a, b) => b.ts - a.ts);
  return signals[0].ok ? 'operational' : 'degraded';
}

function interfaceDetail(health: InterfaceHealth, errorMessage: string | null): string {
  switch (health) {
    case 'operational':
      return 'Delivering to the EMR — most recent real signal succeeded.';
    case 'degraded':
      return errorMessage
        ? `Most recent attempt failed: ${errorMessage.slice(0, 140)}`
        : 'Most recent transmission or connection test failed.';
    case 'disabled':
      return 'Endpoint is disabled — no transmissions are attempted.';
    default:
      return 'No real connectivity signal to judge by — health cannot be determined.';
  }
}

function interfaceAction(health: InterfaceHealth): { label: string; route: string } {
  switch (health) {
    case 'degraded':
      return { label: 'Review & retry in FHIR console', route: '/fhir' };
    case 'unknown':
      return { label: 'Test connection in FHIR console', route: '/fhir' };
    case 'disabled':
      return { label: 'Enable in FHIR console', route: '/fhir' };
    default:
      return { label: 'Open FHIR console', route: '/fhir' };
  }
}
