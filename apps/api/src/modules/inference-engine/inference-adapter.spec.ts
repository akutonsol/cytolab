import { StubInferenceAdapter } from './inference-adapter';

/**
 * Program 6 · Phase 6C — the default adapter is deterministic and non-clinical (Decision 1 + Guardrail 2). Identical
 * (modelVersionId, inputDigest, configDigest) → identical output; different inputs → different output; and the
 * output is a digest/reference only, never a diagnostic claim.
 */
describe('P6-6C StubInferenceAdapter (deterministic, non-clinical)', () => {
  const adapter = new StubInferenceAdapter();
  const input = { modelVersionId: 'mv-1', inputDigest: 'a'.repeat(64), configDigest: 'c'.repeat(64) };

  it('is deterministic for identical (modelVersion, input, config)', async () => {
    const a = await adapter.execute(input);
    const b = await adapter.execute({ ...input });
    expect(a.resultDigest).toBe(b.resultDigest);
    expect(a.resultRef).toBe(b.resultRef);
    expect(a.resultDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes output when any of model version / input / config changes', async () => {
    const base = (await adapter.execute(input)).resultDigest;
    expect((await adapter.execute({ ...input, modelVersionId: 'mv-2' })).resultDigest).not.toBe(base);
    expect((await adapter.execute({ ...input, inputDigest: 'b'.repeat(64) })).resultDigest).not.toBe(base);
    expect((await adapter.execute({ ...input, configDigest: null })).resultDigest).not.toBe(base);
  });

  it('returns a reference/digest only — no diagnostic/classification field', async () => {
    const r = await adapter.execute(input);
    expect(Object.keys(r).sort()).toEqual(['resultDigest', 'resultRef']);
    expect(r.resultRef).toMatch(/^stub:\/\/inference\//);
    expect(adapter.adapterId).toBe('stub');
    expect(adapter.adapterVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
