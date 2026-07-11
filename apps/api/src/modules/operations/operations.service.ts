import { Injectable } from '@nestjs/common';
import { RecordStatus } from '@prisma/client';
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
