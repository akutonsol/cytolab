/**
 * Program 5C · C5 — health-check configuration. The scheduler is DEFAULT OFF; the effective scheduled cadence
 * is never below the approved 5-minute floor. Any configured value under 300s (and the scheduler tick) is
 * clamped up to 300_000ms, so no runtime configuration can drive sub-5-minute recurring health checks.
 */
export const MIN_HEALTH_CADENCE_MS = 300_000; // 5 minutes — approved C5 floor; no runtime override may go below this.

export interface HealthConfig {
  enabled: boolean;
  intervalMs: number; // scheduler tick
  cadenceMs: number; // min spacing between checks of one source (nextEligibleCheckAt)
  timeoutMs: number; // per-check bound
  staleMultiple: number; // stale if lastSuccessfulCheckAt < now - staleMultiple*cadence
  degradedWindowMs: number; // operational window for the DEGRADED rule
  maxConcurrency: number;
}

export function loadHealthConfig(env: NodeJS.ProcessEnv = process.env): HealthConfig {
  const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
  // Clamp UP to the 5-minute floor: values below 300s become 300s (config parse, default, and min clamp in one).
  const cadence = Math.max(num(env.WSI_HEALTH_CHECK_CADENCE_MS, MIN_HEALTH_CADENCE_MS), MIN_HEALTH_CADENCE_MS);
  return {
    enabled: env.WSI_HEALTH_CHECK_ENABLED === 'true',
    intervalMs: Math.max(num(env.WSI_HEALTH_CHECK_INTERVAL_MS, MIN_HEALTH_CADENCE_MS), MIN_HEALTH_CADENCE_MS),
    cadenceMs: cadence,
    timeoutMs: num(env.WSI_HEALTH_CHECK_TIMEOUT_MS, 15_000),
    staleMultiple: num(env.WSI_HEALTH_STALE_MULTIPLE, 3),
    degradedWindowMs: num(env.WSI_HEALTH_DEGRADED_WINDOW_MS, 86_400_000),
    maxConcurrency: num(env.WSI_HEALTH_MAX_CONCURRENCY, 4),
  };
}

/** Derived (never persisted): a source is STALE when its last successful check is older than the cadence window. */
export function isStale(lastSuccessfulCheckAt: Date | null | undefined, nowMs: number, cfg: HealthConfig): boolean {
  if (!lastSuccessfulCheckAt) return true;
  return nowMs - lastSuccessfulCheckAt.getTime() > cfg.staleMultiple * cfg.cadenceMs;
}
