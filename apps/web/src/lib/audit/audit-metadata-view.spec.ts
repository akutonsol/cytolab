import { orderedMetadataEntries, formatMetadataValue } from './audit-metadata-view';

describe('P2-8C — metadata view helpers', () => {
  it('orders keys deterministically (alphabetical) and handles null', () => {
    expect(orderedMetadataEntries({ b: 2, a: 1, c: 3 }).map(([k]) => k)).toEqual(['a', 'b', 'c']);
    expect(orderedMetadataEntries(null)).toEqual([]);
    expect(orderedMetadataEntries({})).toEqual([]);
  });

  it('formats scalars, booleans, and null safely; JSON-stringifies the (unexpected) object/array case', () => {
    expect(formatMetadataValue('x')).toBe('x');
    expect(formatMetadataValue(42)).toBe('42');
    expect(formatMetadataValue(true)).toBe('true');
    expect(formatMetadataValue(false)).toBe('false');
    expect(formatMetadataValue(null)).toBe('—');
    expect(formatMetadataValue(undefined)).toBe('—');
    expect(formatMetadataValue([1, 2])).toBe('[1,2]');
    expect(formatMetadataValue({ a: 1 })).toBe('{"a":1}');
  });
});
