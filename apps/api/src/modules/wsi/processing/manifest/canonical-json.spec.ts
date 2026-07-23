import { canonicalSerialize } from './canonical-json';

describe('canonicalSerialize (P5-3B.2A)', () => {
  it('sorts object keys and is independent of insertion order', () => {
    const a = canonicalSerialize({ b: 1, a: 2, c: { y: 1, x: 2 } });
    const b = canonicalSerialize({ c: { x: 2, y: 1 }, a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1,"c":{"x":2,"y":1}}');
  });

  it('preserves array order (the caller supplies deterministic order)', () => {
    expect(canonicalSerialize([3, 1, 2])).toBe('[3,1,2]');
  });

  it('preserves explicit null and omits undefined', () => {
    expect(canonicalSerialize({ a: null, b: undefined, c: 1 })).toBe('{"a":null,"c":1}');
  });

  it('serializes strings, numbers, booleans deterministically', () => {
    expect(canonicalSerialize({ s: 'x"y', n: 0.25, i: 300, t: true, f: false })).toBe('{"f":false,"i":300,"n":0.25,"s":"x\\"y","t":true}');
  });

  it('rejects non-finite numbers', () => {
    expect(() => canonicalSerialize({ n: Infinity })).toThrow(/non-finite/);
  });
});
