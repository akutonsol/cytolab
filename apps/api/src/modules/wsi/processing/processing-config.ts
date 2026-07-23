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
  /** Randomised jitter added to the claim loop so instances do not poll in lockstep. */
  claimJitterMs: number;
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
    claimJitterMs: num(env.WSI_PROCESSING_CLAIM_JITTER_MS, 5_000),
    // Gated OFF unless explicitly enabled, and NEVER under test. B.1A has no processing body to run.
    workerEnabled: env.WSI_PROCESSING_WORKER === 'true' && env.NODE_ENV !== 'test',
  };
}

/** Backoff (ms) that must elapse after the prior attempt's finishedAt before the next attempt is eligible. */
export function backoffForAttempt(cfg: ProcessingConfig, priorAttempt: number): number {
  if (cfg.backoffMs.length === 0) return 0;
  const idx = Math.min(Math.max(priorAttempt, 1) - 1, cfg.backoffMs.length - 1);
  return cfg.backoffMs[idx];
}
