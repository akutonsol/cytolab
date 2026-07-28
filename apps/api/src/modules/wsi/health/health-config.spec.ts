import { isStale, loadHealthConfig, MIN_HEALTH_CADENCE_MS } from './health-config';

/** Program 5C · C5 — config defaults + derived staleness. Effective scheduled cadence never below the 5-minute floor. */
describe('P5C-C5 health-config', () => {
  it('the approved floor is 5 minutes', () => {
    expect(MIN_HEALTH_CADENCE_MS).toBe(300_000);
  });

  it('scheduler is DEFAULT OFF and cadence defaults to at least 5 minutes', () => {
    const c = loadHealthConfig({});
    expect(c.enabled).toBe(false);
    expect(c.cadenceMs).toBeGreaterThanOrEqual(300_000);
    expect(c.intervalMs).toBeGreaterThanOrEqual(300_000);
  });

  it('clamps configured cadence UP to the 5-minute floor (30s / 60s / 299s → 300s); ≥300s preserved', () => {
    // values below the floor are clamped up to exactly 300s
    expect(loadHealthConfig({ WSI_HEALTH_CHECK_CADENCE_MS: '30000' }).cadenceMs).toBe(300_000);
    expect(loadHealthConfig({ WSI_HEALTH_CHECK_CADENCE_MS: '60000' }).cadenceMs).toBe(300_000);
    expect(loadHealthConfig({ WSI_HEALTH_CHECK_CADENCE_MS: '299000' }).cadenceMs).toBe(300_000);
    expect(loadHealthConfig({ WSI_HEALTH_CHECK_CADENCE_MS: '1000' }).cadenceMs).toBe(300_000);
    // at the floor, and above it, the configured value is honoured exactly
    expect(loadHealthConfig({ WSI_HEALTH_CHECK_CADENCE_MS: '300000' }).cadenceMs).toBe(300_000);
    expect(loadHealthConfig({ WSI_HEALTH_CHECK_CADENCE_MS: '600000' }).cadenceMs).toBe(600_000);
    expect(loadHealthConfig({ WSI_HEALTH_CHECK_CADENCE_MS: '3600000' }).cadenceMs).toBe(3_600_000);
  });

  it('the scheduler tick interval is likewise floored at 5 minutes', () => {
    expect(loadHealthConfig({ WSI_HEALTH_CHECK_INTERVAL_MS: '1000' }).intervalMs).toBe(300_000);
    expect(loadHealthConfig({ WSI_HEALTH_CHECK_INTERVAL_MS: '900000' }).intervalMs).toBe(900_000);
  });

  it('STALE is derived: never checked → stale; recent success → not stale; old success → stale', () => {
    const c = loadHealthConfig({ WSI_HEALTH_CHECK_CADENCE_MS: '300000', WSI_HEALTH_STALE_MULTIPLE: '3' });
    const now = Date.now();
    expect(isStale(null, now, c)).toBe(true);
    expect(isStale(new Date(now - 60_000), now, c)).toBe(false);
    expect(isStale(new Date(now - 10 * 300_000), now, c)).toBe(true); // > 3×cadence
  });
});
