import type { IngestionDiscoveryStatus, ProcessingJobStatus } from '@prisma/client';

/**
 * Program 5B · B5-a — read-only operational-monitoring response contract.
 *
 * Every value is derived from PERSISTED database truth (IngestionSource / IngestionDiscovery /
 * SlideProcessingJob / DerivativeGeneration), tenant-scoped by the Prisma extension. The projection is
 * deliberately infrastructure-safe: NO rootPath / absolute path / mount / credential / token / storage key /
 * object-store or scanner configuration is ever returned. No fabricated scanner/poller health — only facts
 * that are persisted are reported.
 */

/** Full per-status discovery tallies (all nine states, so DISCOVERED + STABILIZING are both present). */
export type DiscoveryCounts = Record<IngestionDiscoveryStatus, number>;

/** Processing-job tallies for the automated (WATCH_FOLDER) path only. */
export type ProcessingCounts = Record<ProcessingJobStatus, number>;

/** Deterministic, persisted-derived facts (no clock, no invented health). */
export type SourceFact = 'ENABLED' | 'DISABLED' | 'HAS_BACKLOG';

export interface SourceMonitor {
  id: string;
  kind: string; // IngestionSourceKind (e.g. FILESYSTEM) — NOT the path
  enabled: boolean;
  discoveryCounts: DiscoveryCounts;
  /** UNMATCHED + AMBIGUOUS + DUPLICATE + FAILED (the B4 reconciliation backlog for this source). */
  reconciliationBacklog: number;
  ingestedCount: number;
  /** READY generations for this source's ingested slides (READY ≠ published/viewable). */
  readyCount: number;
  oldestUnresolvedExceptionAt: string | null;
  lastActivityAt: string | null; // max discovery updatedAt for this source
  lastIngestedAt: string | null; // max updatedAt among INGESTED discoveries
  recentFailureAt: string | null;
  recentFailureReason: string | null; // persisted IngestionDiscovery.failureReason (no path/secret)
  facts: SourceFact[];
  // P5C-C5 — import-connection health snapshot (null until the first check). No endpoint/credential/path.
  health: SourceHealthSummary | null;
}

/** P5C-C5 — the safe per-source health projection (structured code only; `stale` is derived). */
export interface SourceHealthSummary {
  state: string; // SourceHealthState
  errorCode: string | null; // structured HealthCheckErrorCode
  checkedAt: string | null;
  lastSuccessfulCheckAt: string | null;
  lastFailedCheckAt: string | null;
  consecutiveFailures: number;
  responseTimeMs: number | null;
  stale: boolean; // derived from lastSuccessfulCheckAt + cadence
}

/** P5C-C5 — windowed discovery throughput (query-time; no rollups). */
export interface ThroughputWindow {
  discovered: number;
  ingested: number;
  duplicate: number;
  unmatched: number;
  ambiguous: number;
  failed: number;
}

export interface MonitoringTotals {
  sources: { total: number; enabled: number; disabled: number };
  discoveries: DiscoveryCounts & { total: number };
  reconciliationBacklog: number;
  processing: ProcessingCounts; // WATCH_FOLDER-scoped
  ready: number; // READY generations on WATCH_FOLDER slides (lab-wide)
  oldestUnresolvedExceptionAt: string | null;
  lastActivityAt: string | null;
  lastIngestedAt: string | null;
  // P5C-C5 — windowed discovery throughput (lab-wide), query-time from IngestionDiscovery.discoveredAt.
  windows: { hour: ThroughputWindow; day: ThroughputWindow; week: ThroughputWindow };
}

export interface IngestionMonitoringResponse {
  asOf: string;
  totals: MonitoringTotals;
  sources: SourceMonitor[];
}
