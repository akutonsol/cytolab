import { validateProbabilityDistribution, validateRegionGeometry } from './explainability-artifact';

/** Program 6 · Phase 6D — pure content validation (Decision 6 probabilities; Decision 7 region geometry). */
describe('P6-6D explainability content validation', () => {
  describe('probability distribution', () => {
    it('accepts a coded distribution that sums to 1', () => {
      expect(validateProbabilityDistribution([
        { classCode: 'a', value: 0.5, ordinal: 0 },
        { classCode: 'b', value: 0.5, ordinal: 1 },
      ])).toBeNull();
    });
    it('rejects a distribution that does not sum to 1', () => {
      expect(validateProbabilityDistribution([{ classCode: 'a', value: 0.4, ordinal: 0 }, { classCode: 'b', value: 0.4, ordinal: 1 }])).toMatch(/sum to 1/);
    });
    it('rejects empty, duplicate-coded, negative, or non-finite entries', () => {
      expect(validateProbabilityDistribution([])).toMatch(/at least one/);
      expect(validateProbabilityDistribution([{ classCode: 'a', value: 0.5, ordinal: 0 }, { classCode: 'a', value: 0.5, ordinal: 1 }])).toMatch(/duplicate/);
      expect(validateProbabilityDistribution([{ classCode: 'a', value: -1, ordinal: 0 }, { classCode: 'b', value: 2, ordinal: 1 }])).toMatch(/non-negative/);
      expect(validateProbabilityDistribution([{ classCode: 'a', value: NaN, ordinal: 0 }])).toMatch(/finite/);
    });
  });

  describe('region geometry', () => {
    const bounds = { width: 1000, height: 800 };
    it('accepts an in-bounds bounding box and polygon', () => {
      expect(validateRegionGeometry('BOUNDING_BOX', { x: 10, y: 20, w: 100, h: 50 }, bounds)).toBeNull();
      expect(validateRegionGeometry('POLYGON', { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }] }, bounds)).toBeNull();
    });
    it('rejects negative, zero-area, or out-of-bounds boxes', () => {
      expect(validateRegionGeometry('BOUNDING_BOX', { x: -1, y: 0, w: 10, h: 10 }, bounds)).toMatch(/non-negative/);
      expect(validateRegionGeometry('BOUNDING_BOX', { x: 0, y: 0, w: 0, h: 10 }, bounds)).toMatch(/positive/);
      expect(validateRegionGeometry('BOUNDING_BOX', { x: 950, y: 0, w: 100, h: 10 }, bounds)).toMatch(/exceeds slide width/);
    });
    it('rejects polygons with fewer than 3 points or out-of-bounds points', () => {
      expect(validateRegionGeometry('POLYGON', { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }, bounds)).toMatch(/at least 3/);
      expect(validateRegionGeometry('POLYGON', { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 900 }] }, bounds)).toMatch(/exceeds slide height/);
    });
    it('accepts geometry when slide bounds are unknown (null)', () => {
      expect(validateRegionGeometry('BOUNDING_BOX', { x: 5000, y: 5000, w: 100, h: 100 }, { width: null, height: null })).toBeNull();
    });
  });
});
