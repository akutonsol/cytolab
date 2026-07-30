import { loadInferenceConfig, validateInferenceConfig } from './inference-config';

/** Program 6 · Phase 6C — the worker is gated OFF by default and never under test (Decision 6). */
describe('P6-6C inference config gating', () => {
  it('worker is disabled by default', () => {
    expect(loadInferenceConfig({}).workerEnabled).toBe(false);
  });

  it('worker stays disabled under test even when the flag is set', () => {
    expect(loadInferenceConfig({ AI_INFERENCE_WORKER: 'true', NODE_ENV: 'test' }).workerEnabled).toBe(false);
  });

  it('worker enables only with the explicit flag outside test', () => {
    expect(loadInferenceConfig({ AI_INFERENCE_WORKER: 'true', NODE_ENV: 'production' }).workerEnabled).toBe(true);
  });

  it('rejects a heartbeat that does not fit safely inside the lease', () => {
    const cfg = loadInferenceConfig({});
    expect(() => validateInferenceConfig({ ...cfg, heartbeatIntervalMs: cfg.leaseDurationMs })).toThrow(/heartbeatIntervalMs/);
    expect(() => validateInferenceConfig(cfg)).not.toThrow();
  });
});
