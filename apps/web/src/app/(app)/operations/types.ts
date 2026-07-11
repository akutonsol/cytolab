// Client mirror of the /operations/overview response (apps/api operations module).
export type TatPriority = 'Stat' | 'Urgent' | 'Priority' | 'Routine';
export type Severity = 'critical' | 'high' | 'medium';

export interface PipelineStage {
  status: string;
  label: string;
  group: string;
  /** Tier-2.5 domain token stem (e.g. workflow-processing) — never a hue. */
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

/** Compact human age: "<1h" · "6h" · "2d 3h". */
export function formatAge(hours: number): string {
  if (hours < 1) return '<1h';
  if (hours < 24) return `${hours}h`;
  const d = Math.floor(hours / 24);
  const rem = hours % 24;
  return rem ? `${d}d ${rem}h` : `${d}d`;
}

/** Severity → Tier-2.5 priority domain token stem (Badge domain=). */
export const SEVERITY_DOMAIN: Record<Severity, string> = {
  critical: 'priority-critical',
  high: 'priority-high',
  medium: 'priority-medium',
};
