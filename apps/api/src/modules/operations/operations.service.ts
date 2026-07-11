import { Injectable } from '@nestjs/common';
import { RecordStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { hoursElapsed, tatPriority, TAT_PRIORITY_RANK, type TatPriority } from '../../common/util/tat-priority';

/**
 * Laboratory Operations Workspace (Phase 2A) — read-only aggregation.
 *
 * Backs B1 Pipeline Board and A1 Attention Rail (docs/PATHOS_OPERATIONS_WORKSPACE.md
 * §4). It recomposes the EXISTING record lifecycle — it invents no new status, stage,
 * or SLA field. The lifecycle grouping mirrors patients.service STAGE
 * (Intake → Processing → Review); the SLA/priority derivation reuses the shared
 * tatPriority() helper and the lab's targetTatDays budget, exactly as WorkloadService.
 *
 * Note (traceability): the blueprint's finer sub-stages (Scan/QC/AI as distinct
 * queues) are NOT expressible from RecordStatus alone; that granularity needs
 * pre-analytic tracking the data model does not yet carry. This surface reports the
 * real six in-flight statuses truthfully rather than fabricating sub-queues — see
 * Roadmap/05_HELIX_v1_1.md candidacy in the pilot notes.
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

/** Severity buckets map the TAT priority onto the client's badge tone. */
type Severity = 'critical' | 'high' | 'medium';
const SEVERITY: Record<Exclude<TatPriority, 'Routine'>, Severity> = {
  Stat: 'critical',
  Urgent: 'high',
  Priority: 'medium',
};

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
    /** True steady state — the rail shows a calm, real "all clear", never a false zero. */
    allClear: boolean;
  };
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

  async overview(): Promise<OperationsOverview> {
    const now = Date.now();
    const thresholdHours = await this.thresholdHours();

    // One tenant-scoped pass over the in-flight records (labId auto-applied).
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

    // Derive age + priority once per record (receipt time = specimenDate ?? createdAt).
    const enriched = records.map((r) => {
      const startedAt = r.specimenDate ?? r.createdAt;
      const ageHours = hoursElapsed(startedAt, now);
      const priority = tatPriority({ urgent: r.urgent, startedAt, thresholdHours, now });
      return { ...r, ageHours, priority };
    });

    const stages: PipelineStage[] = PIPELINE.map(({ status, group }) => {
      const inStage = enriched.filter((r) => r.status === status);
      const oldest = inStage.reduce<(typeof inStage)[number] | null>(
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
      const overHours = Math.max(0, r.ageHours - thresholdHours);
      const budgetPct = thresholdHours > 0 ? Math.round((r.ageHours / thresholdHours) * 100) : 0;
      const assignee =
        r.assignedTo && (r.assignedTo.firstName || r.assignedTo.lastName)
          ? `${r.assignedTo.firstName ?? ''} ${r.assignedTo.lastName ?? ''}`.trim()
          : null;
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
        assignee,
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
