/**
 * Program 5A · P5-3B.1A — processing runtime configuration.
 *
 * OPERATIONAL defaults (not domain invariants) — all overridable by env. Lease DURATION and cadences
 * live here, never in the schema (the DB stores only the resulting expiry timestamps). The end-to-end
 * worker loop is DISABLED by default and always disabled under test — B.1A ships the coordination
 * machinery but no processing body exists until B.1C/B.2, so nothing is run end-to-end yet.
 */
export interface ProcessingConfig {
  leaseDurationMs: number;
  heartbeatIntervalMs: number;
  reclaimIntervalMs: number;
  reconcileIntervalMs: number;
  maxAttempts: number;
  /** Backoff before the Nth retry is eligible, indexed by (attempt-1); the last value repeats. */
  backoffMs: number[];
  workerConcurrency: number;
  /** Cadence of the claim/process tick (how often the worker tries to fill free slots). */
  claimIntervalMs: number;
  /** Randomised jitter added to the claim loop so instances do not poll in lockstep. */
  claimJitterMs: number;
  /** How long graceful shutdown waits for in-flight attempts before releasing leases to reclaim. */
  drainTimeoutMs: number;
  /** W-ii — verification workload (independent of processing): concurrency, reconciler batch, cadence. */
  verifyMaxConcurrent: number;
  verifyBatchSize: number;
  verifyIntervalMs: number;
  /** Master gate for the background worker/reconciler/reclaimer schedulers (NOT the enqueue write path). */
  workerEnabled: boolean;
}

const MIN = 60_000;

const num = (v: string | undefined, d: number): number => {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

export function loadProcessingConfig(env: NodeJS.ProcessEnv = process.env): ProcessingConfig {
  return {
    leaseDurationMs: num(env.WSI_PROCESSING_LEASE_MS, 5 * MIN),
    heartbeatIntervalMs: num(env.WSI_PROCESSING_HEARTBEAT_MS, 60_000),
    reclaimIntervalMs: num(env.WSI_PROCESSING_RECLAIM_MS, 60_000),
    reconcileIntervalMs: num(env.WSI_PROCESSING_RECONCILE_MS, 60_000),
    maxAttempts: num(env.WSI_PROCESSING_MAX_ATTEMPTS, 3),
    backoffMs: [1 * MIN, 5 * MIN, 15 * MIN],
    workerConcurrency: num(env.WSI_PROCESSING_CONCURRENCY, 2),
    claimIntervalMs: num(env.WSI_PROCESSING_CLAIM_MS, 10_000),
    claimJitterMs: num(env.WSI_PROCESSING_CLAIM_JITTER_MS, 5_000),
    drainTimeoutMs: num(env.WSI_PROCESSING_DRAIN_MS, 30_000),
    verifyMaxConcurrent: num(env.WSI_VERIFY_CONCURRENCY, 2),
    verifyBatchSize: num(env.WSI_VERIFY_BATCH, 20),
    verifyIntervalMs: num(env.WSI_VERIFY_INTERVAL_MS, 30_000),
    // Gated OFF unless explicitly enabled, and NEVER under test. B.1A has no processing body to run.
    workerEnabled: env.WSI_PROCESSING_WORKER === 'true' && env.NODE_ENV !== 'test',
  };
}

/**
 * P5-3B (worker activation) — reject an UNSAFE worker configuration at startup rather than silently
 * running a worker whose lease can expire mid-attempt. The heartbeat must fit comfortably inside the lease
 * (≤ 1/3 of it) so a couple of missed renewals never let the lease lapse while work is still in flight.
 */
export function validateProcessingConfig(cfg: ProcessingConfig): void {
  if (!(cfg.leaseDurationMs > 0)) throw new Error(`invalid processing config: leaseDurationMs must be > 0 (got ${cfg.leaseDurationMs})`);
  if (!(cfg.heartbeatIntervalMs > 0 && cfg.heartbeatIntervalMs <= cfg.leaseDurationMs / 3)) {
    throw new Error(`invalid processing config: require 0 < heartbeatIntervalMs (${cfg.heartbeatIntervalMs}) <= leaseDurationMs/3 (${cfg.leaseDurationMs / 3})`);
  }
  if (!(cfg.workerConcurrency >= 1)) throw new Error(`invalid processing config: workerConcurrency must be >= 1 (got ${cfg.workerConcurrency})`);
  if (!(cfg.drainTimeoutMs >= 0)) throw new Error(`invalid processing config: drainTimeoutMs must be >= 0 (got ${cfg.drainTimeoutMs})`);
  // W-ii — verification workload must be independently well-formed.
  if (!(cfg.verifyMaxConcurrent >= 1)) throw new Error(`invalid processing config: verifyMaxConcurrent must be >= 1 (got ${cfg.verifyMaxConcurrent})`);
  if (!(cfg.verifyBatchSize >= cfg.verifyMaxConcurrent)) {
    throw new Error(`invalid processing config: verifyBatchSize (${cfg.verifyBatchSize}) must be >= verifyMaxConcurrent (${cfg.verifyMaxConcurrent})`);
  }
  if (!(cfg.verifyIntervalMs > 0)) throw new Error(`invalid processing config: verifyIntervalMs must be > 0 (got ${cfg.verifyIntervalMs})`);
}

/** Backoff (ms) that must elapse after the prior attempt's finishedAt before the next attempt is eligible. */
export function backoffForAttempt(cfg: ProcessingConfig, priorAttempt: number): number {
  if (cfg.backoffMs.length === 0) return 0;
  const idx = Math.min(Math.max(priorAttempt, 1) - 1, cfg.backoffMs.length - 1);
  return cfg.backoffMs[idx];
}
