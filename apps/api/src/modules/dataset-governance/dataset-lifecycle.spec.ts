import { isMutable, isFreezable, MUTABLE_STATE } from './dataset-lifecycle';

/** Program 6 · Phase 6B — dataset-version lifecycle rules (pure): DRAFT mutable/freezable, FROZEN terminal. */
describe('P6-6B dataset-version lifecycle', () => {
  it('DRAFT is the only mutable state', () => {
    expect(MUTABLE_STATE).toBe('DRAFT');
    expect(isMutable('DRAFT')).toBe(true);
    expect(isMutable('FROZEN')).toBe(false);
  });

  it('only DRAFT is freezable; FROZEN is terminal (no re-freeze / no ARCHIVED path)', () => {
    expect(isFreezable('DRAFT')).toBe(true);
    expect(isFreezable('FROZEN')).toBe(false);
  });
});
