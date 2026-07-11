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

// ── C2 · SLA Risk detail ────────────────────────────────────────────────────
export type RiskLevel = 'breached' | 'at-risk';

export interface SlaRiskItem {
  id: string;
  caseRef: string;
  stage: string;
  urgent: boolean;
  risk: RiskLevel;
  ageHours: number;
  /** Signed hours to breach; negative → already breached. */
  remainingHours: number;
  overHours: number;
  budgetPct: number;
  reason: string;
  owner: string | null;
  blocker: string | null;
  action: { label: string; route: string };
}

export interface SlaRiskDetail {
  asOf: string;
  thresholdHours: number;
  summary: { breached: number; atRisk: number; withinTarget: number; inFlight: number };
  items: SlaRiskItem[];
}

/** "in 6h" before breach · "14h overdue" once past. */
export function formatTimeToBreach(item: Pick<SlaRiskItem, 'remainingHours' | 'overHours'>): string {
  return item.remainingHours > 0 ? `in ${formatAge(item.remainingHours)}` : `${formatAge(item.overHours)} overdue`;
}

// ── D6 · Integration Health ─────────────────────────────────────────────────
// Health is derived from real signals only. Environment is a separate axis (metadata),
// never a health value: configuration is not health.
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
  lastSuccessAt: string | null;
  lastActivityAt: string | null;
  lastTest: { at: string | null; status: string | null; failed: boolean };
  counts: { total: number; success: number; failed: number };
  lastError: { message: string | null; responseCode: number | null; at: string } | null;
  affectedWorkflow: string;
  detail: string;
  action: { label: string; route: string };
}

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
    // Health counts (a sandbox interface is still counted by its real health).
    operational: number; degraded: number; unknown: number; disabled: number;
    // Environment counts (metadata).
    production: number; sandbox: number;
  };
  interfaces: IntegrationInterface[];
  activity: ActivitySignal[];
  note: string;
}

/**
 * Relative age measured against the report's own `asOf` (both server-provided), so
 * it is deterministic and SSR-safe. Null → the truthful "no activity" string.
 */
export function formatSince(iso: string | null, asOf: string): string {
  if (!iso) return 'No recent activity recorded';
  const hours = Math.max(0, Math.round((new Date(asOf).getTime() - new Date(iso).getTime()) / 3_600_000));
  return `${formatAge(hours)} ago`;
}
