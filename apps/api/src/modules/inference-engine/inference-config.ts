/**
 * Program 6 · Phase 6C — inference-engine runtime configuration.
 *
 * OPERATIONAL defaults (not domain invariants) — all overridable by env. Lease DURATION and cadences live here,
 * never in the schema (the DB stores only the resulting expiry timestamps). The background worker loop is DISABLED
 * by default and ALWAYS disabled under test (Decision 6 — manual dispatch only; no automatic/scheduled execution).
 * Enqueue (dispatch) is a separate, always-available manual write path and is NOT gated by `workerEnabled`.
 */
export interface InferenceConfig {
  /** Lease lifetime taken at claim; the worker must renew within this window or lose ownership. */
  leaseDurationMs: number;
  /** How often the owning worker renews its lease (must be ≤ lease/3 so a couple of misses never lapse it). */
  heartbeatIntervalMs: number;
  /** Cadence of the reclaimer sweep (RUNNING jobs whose lease has expired → TIMED_OUT). */
  reclaimIntervalMs: number;
  /** Cadence of the claim/process tick (how often an enabled worker tries to fill free slots). */
  claimIntervalMs: number;
  /** Bounded concurrency of the worker loop. */
  workerConcurrency: number;
  /** Master gate for the background worker/reclaimer scheduler (NOT the manual dispatch write path). */
  workerEnabled: boolean;
}

const MIN = 60_000;

const num = (v: string | undefined, d: number): number => {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

export function loadInferenceConfig(env: NodeJS.ProcessEnv = process.env): InferenceConfig {
  return {
    leaseDurationMs: num(env.AI_INFERENCE_LEASE_MS, 5 * MIN),
    heartbeatIntervalMs: num(env.AI_INFERENCE_HEARTBEAT_MS, 60_000),
    reclaimIntervalMs: num(env.AI_INFERENCE_RECLAIM_MS, 60_000),
    claimIntervalMs: num(env.AI_INFERENCE_CLAIM_MS, 10_000),
    workerConcurrency: num(env.AI_INFERENCE_CONCURRENCY, 2),
    // Gated OFF unless explicitly enabled, and NEVER under test — manual dispatch only.
    workerEnabled: env.AI_INFERENCE_WORKER === 'true' && env.NODE_ENV !== 'test',
  };
}

/**
 * Reject an UNSAFE worker configuration at startup rather than silently running a worker whose lease can expire
 * mid-attempt. The heartbeat must fit comfortably inside the lease (≤ 1/3 of it) so a couple of missed renewals
 * never let the lease lapse while adapter work is still in flight.
 */
export function validateInferenceConfig(cfg: InferenceConfig): void {
  if (!(cfg.leaseDurationMs > 0)) throw new Error(`invalid inference config: leaseDurationMs must be > 0 (got ${cfg.leaseDurationMs})`);
  if (!(cfg.heartbeatIntervalMs > 0 && cfg.heartbeatIntervalMs <= cfg.leaseDurationMs / 3)) {
    throw new Error(`invalid inference config: require 0 < heartbeatIntervalMs (${cfg.heartbeatIntervalMs}) <= leaseDurationMs/3 (${cfg.leaseDurationMs / 3})`);
  }
  if (!(cfg.workerConcurrency >= 1)) throw new Error(`invalid inference config: workerConcurrency must be >= 1 (got ${cfg.workerConcurrency})`);
}
