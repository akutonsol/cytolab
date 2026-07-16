/**
 * Phase 5 · E2 — Enterprise Case Management aggregate contracts.
 *
 * Read-only orchestration layer above the clinical owners. Every queue is a
 * PROJECTION over owner-recorded `Record.status` / `Record.assignedToId` plus
 * narrow cross-owner open-work signals — never a new lifecycle state, never a
 * persisted queue. This module owns no persistence and no Prisma access.
 *
 * E2A establishes the frozen contract + route shell only: composition is
 * DEFERRED (no owner calls, no counts, no items yet).
 */

// ── Five-state section contract ───────────────────────────────────────────
// Reproduced here (not imported from Diagnostic Case) to avoid cross-aggregate
// coupling. The five states are frozen — never invent a sixth.
export type SectionStatus = 'ready' | 'empty' | 'forbidden' | 'error' | 'deferred';

export interface Section<T> {
  status: SectionStatus;
  data: T | null;
  reason?: string;
}

// ── Queue taxonomy (frozen) ───────────────────────────────────────────────
export type QueueKey =
  | 'my-work'
  | 'unassigned'
  | 'pending-review'
  | 'awaiting-sign-out'
  | 'signed-out'
  | 'archived'
  | 'on-hold'
  | 'awaiting-ancillary'
  | 'awaiting-correlation'
  | 'open-qc-failures'
  | 'open-recalls'
  | 'open-escalations'
  | 'overdue';

export type QueueCategory = 'record-projection' | 'cross-owner' | 'operational-overlay';

export interface EnterpriseQueueDefinition {
  key: QueueKey;
  label: string;
  category: QueueCategory;
  /**
   * Static owner-workspace path template. `null` in E2A — per-record handoff
   * construction is deferred until queue items exist (E2B/E2C). No owner route
   * is fabricated here.
   */
  ownerPath: string | null;
}

/**
 * The single source of truth for the MVP queue set, in FROZEN catalog order.
 * Retired/excluded keys (team-work, quality-hold, escalated, returned,
 * open-change-requests, completed) are intentionally absent.
 */
export const ENTERPRISE_QUEUE_DEFINITIONS: readonly EnterpriseQueueDefinition[] = [
  { key: 'my-work', label: 'My Work', category: 'record-projection', ownerPath: null },
  { key: 'unassigned', label: 'Unassigned', category: 'record-projection', ownerPath: null },
  { key: 'pending-review', label: 'Pending Review', category: 'record-projection', ownerPath: null },
  { key: 'awaiting-sign-out', label: 'Awaiting Sign-Out', category: 'record-projection', ownerPath: null },
  { key: 'signed-out', label: 'Signed Out', category: 'record-projection', ownerPath: null },
  { key: 'archived', label: 'Archived', category: 'record-projection', ownerPath: null },
  { key: 'on-hold', label: 'On Hold', category: 'record-projection', ownerPath: null },
  { key: 'awaiting-ancillary', label: 'Awaiting Ancillary', category: 'cross-owner', ownerPath: null },
  { key: 'awaiting-correlation', label: 'Awaiting Correlation', category: 'cross-owner', ownerPath: null },
  { key: 'open-qc-failures', label: 'Open QC Failures', category: 'cross-owner', ownerPath: null },
  { key: 'open-recalls', label: 'Open Recalls', category: 'cross-owner', ownerPath: null },
  { key: 'open-escalations', label: 'Open Escalations', category: 'cross-owner', ownerPath: null },
  { key: 'overdue', label: 'Overdue', category: 'operational-overlay', ownerPath: null },
] as const;

/** Fast membership check for controller/service key validation. */
export const ENTERPRISE_QUEUE_KEYS: readonly QueueKey[] = ENTERPRISE_QUEUE_DEFINITIONS.map((q) => q.key);

export function isQueueKey(value: string): value is QueueKey {
  return (ENTERPRISE_QUEUE_KEYS as readonly string[]).includes(value);
}

// ── Bounds ────────────────────────────────────────────────────────────────
export const ENTERPRISE_DEFAULT_PAGE_SIZE = 50;
export const ENTERPRISE_MAX_PAGE_SIZE = 100;
export const ENTERPRISE_QUEUE_CAP = 100;

// ── Count state ───────────────────────────────────────────────────────────
// A truthful count carrier. `value` is null unless `status === 'ready'`; a
// deferred/error/forbidden count is NEVER represented as a fabricated 0. Reuses
// the frozen five-state vocabulary (no separate state set is invented).
export interface EnterpriseCountState {
  value: number | null;
  status: SectionStatus;
  reason?: string;
}

// A source that could not be composed for a collection response (error /
// forbidden / deferred) — surfaced so the client never mistakes it for empty.
export interface EnterpriseUnavailableSource {
  key: string;
  status: SectionStatus;
  reason: string;
}

// ── Summary (GET /enterprise/summary) ─────────────────────────────────────
export interface EnterpriseSummaryCount {
  key: QueueKey;
  count: EnterpriseCountState;
}

export interface EnterpriseSummaryResponse {
  asOf: string; // request time; NOT an owner scan/last-computed timestamp
  counts: EnterpriseSummaryCount[]; // one per queue, frozen order; all deferred in E2A
  unavailable: EnterpriseUnavailableSource[];
}

// ── Queue catalog (GET /enterprise/queues) ────────────────────────────────
export interface EnterpriseQueueCatalogItem {
  key: QueueKey;
  label: string;
  category: QueueCategory;
  count: EnterpriseCountState; // deferred (value null) in E2A
  ownerPath: string | null;
}

export interface EnterpriseQueueCatalogResponse {
  asOf: string;
  queues: EnterpriseQueueCatalogItem[]; // exactly 13, frozen order
  unavailable: EnterpriseUnavailableSource[];
}

// ── Queue detail (GET /enterprise/queues/:queue) ──────────────────────────
export interface EnterpriseQueueRecordItem {
  id: string;
  identifier: string | null;
  labNumber: string | null;
  formType: string | null;
  status: string; // RecordStatus verbatim (owner-recorded)
  urgent: boolean;
  specimenDate: string | null;
  createdAt: string;
  statusChangedAt: string | null;
  assignedToId: string | null;
  assignedTo: string | null;
  overdue: boolean; // derived overlay flag (labeled)
  signals: Record<string, boolean>; // cross-owner presence booleans only
  ownerPath: string | null;
}

export interface EnterpriseQueueDetailData {
  items: EnterpriseQueueRecordItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  cap: number;
  truncated: boolean;
}

/**
 * The validated + retained query, echoed back so the contract is visible even
 * while composition is deferred. E2A does NOT apply these filters.
 */
export interface EnterpriseQueueDetailEcho {
  page: number;
  pageSize: number;
  assignedToId: string | null;
}

export interface EnterpriseQueueDetailResponse {
  queue: QueueKey;
  category: QueueCategory;
  // Deferred in E2A: `{ status: 'deferred', data: null }` — never `items: []`
  // with `total: 0` (that would read as an empty, fully-composed queue).
  section: Section<EnterpriseQueueDetailData>;
  echo: EnterpriseQueueDetailEcho;
}

/** Shared deferred reason for the E2A shell. */
export const ENTERPRISE_DEFERRED_REASON = 'Queue composition not yet loaded (E2A shell)';
