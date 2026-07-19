import { deriveExportFilterClass } from './audit-export.filter-class';

describe('P2-9A filter-class — value-free predicate shape', () => {
  it('none when nothing is constrained', () => {
    expect(deriveExportFilterClass({})).toBe('none');
  });

  it('time_only for an explicit time bound with no dimension', () => {
    expect(deriveExportFilterClass({ timeFrom: '2026-07-01T00:00:00Z' })).toBe('time_only');
    expect(deriveExportFilterClass({ timeTo: '2026-07-02T00:00:00Z' })).toBe('time_only');
  });

  it('single_dimension for exactly one non-time filter', () => {
    expect(deriveExportFilterClass({ category: ['SECURITY'] })).toBe('single_dimension');
    expect(deriveExportFilterClass({ actorId: 'u1', timeFrom: '2026-07-01T00:00:00Z' })).toBe('single_dimension');
  });

  it('multi_dimension for two or more non-time filters', () => {
    expect(deriveExportFilterClass({ category: ['SECURITY'], outcome: 'SUCCESS' })).toBe('multi_dimension');
    expect(deriveExportFilterClass({ actorId: 'u1', resourceType: 'User', correlationId: 'c1' })).toBe('multi_dimension');
  });

  it('ignores empty arrays and blank strings (presence only)', () => {
    expect(deriveExportFilterClass({ category: [], actorId: '   ' })).toBe('none');
  });
});
