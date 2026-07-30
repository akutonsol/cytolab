import { StubExplainabilityGenerator } from './explainability-generator';
import { validateProbabilityDistribution } from './explainability-artifact';

/**
 * Program 6 · Phase 6D — the default generator is deterministic and non-clinical (Decision 1 + Decision 10). Identical
 * (record identity + provenance + config + generator version + kinds) → identical content + content digests; the output
 * is coded/numeric/reference only, never a diagnosis or accuracy claim.
 */
describe('P6-6D StubExplainabilityGenerator (deterministic, non-clinical)', () => {
  const gen = new StubExplainabilityGenerator();
  const req = {
    recordUuid: 'rec-uuid-1',
    inputDigest: 'a'.repeat(64),
    resultDigest: 'b'.repeat(64),
    configDigest: 'c'.repeat(64),
    kinds: ['HEATMAP', 'ATTENTION_OVERLAY', 'FEATURE_REGION', 'PROBABILITY_DISTRIBUTION'] as const,
    slide: { width: 1000, height: 800 },
  };

  it('is deterministic for identical inputs (same content digests)', async () => {
    const a = await gen.generate({ ...req, kinds: [...req.kinds] });
    const b = await gen.generate({ ...req, kinds: [...req.kinds] });
    expect(a.map((x) => x.contentDigest)).toEqual(b.map((x) => x.contentDigest));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('changes content when record identity or config changes', async () => {
    const base = (await gen.generate({ ...req, kinds: ['HEATMAP'] }))[0].contentDigest;
    expect((await gen.generate({ ...req, kinds: ['HEATMAP'], recordUuid: 'other' }))[0].contentDigest).not.toBe(base);
    expect((await gen.generate({ ...req, kinds: ['HEATMAP'], configDigest: 'd'.repeat(64) }))[0].contentDigest).not.toBe(base);
  });

  it('produces a probability distribution that sums to 1 with coded classes', async () => {
    const [artifact] = await gen.generate({ ...req, kinds: ['PROBABILITY_DISTRIBUTION'] });
    expect(validateProbabilityDistribution(artifact.probabilities!)).toBeNull();
    expect(artifact.probabilities!.every((p) => /^class-/.test(p.classCode))).toBe(true);
    expect(artifact.contentRef).toBeNull(); // a distribution is structured data, not an opaque raster
  });

  it('produces in-bounds coded feature regions (boxes), never diagnostic labels', async () => {
    const [artifact] = await gen.generate({ ...req, kinds: ['FEATURE_REGION'] });
    expect(artifact.regions!.length).toBeGreaterThan(0);
    for (const r of artifact.regions!) {
      const g = r.geometry as { x: number; y: number; w: number; h: number };
      expect(g.x + g.w).toBeLessThanOrEqual(1000);
      expect(g.y + g.h).toBeLessThanOrEqual(800);
      expect(r.categoryCode).toMatch(/^region-/); // coded, not a diagnosis
    }
  });

  it('heatmap/overlay carry an opaque reference + digest, no raw content', async () => {
    for (const kind of ['HEATMAP', 'ATTENTION_OVERLAY'] as const) {
      const [a] = await gen.generate({ ...req, kinds: [kind] });
      expect(a.contentDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(a.contentRef).toMatch(/^stub:\/\/explain\//);
      expect(a.regions ?? []).toHaveLength(0);
    }
  });
});
