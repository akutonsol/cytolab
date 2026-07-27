import { isStable, extractAccession } from './watch-folder-util';

describe('P5B-B2 isStable — quiescence rule', () => {
  const now = 1_000_000;
  it('not stable when never previously observed (prev size null)', () => {
    expect(isStable(null, 100, now - 10_000, now, 5_000)).toBe(false);
  });
  it('not stable when size changed since the last poll', () => {
    expect(isStable(90, 100, now - 10_000, now, 5_000)).toBe(false);
  });
  it('not stable when mtime is still within the settle window', () => {
    expect(isStable(100, 100, now - 1_000, now, 5_000)).toBe(false);
  });
  it('stable when size is unchanged AND mtime has been quiet for settleMs', () => {
    expect(isStable(100, 100, now - 6_000, now, 5_000)).toBe(true);
  });
  it('settleMs=0 → stable as soon as size is unchanged across a poll', () => {
    expect(isStable(100, 100, now, now, 0)).toBe(true);
  });
});

describe('P5B-B2 extractAccession — deterministic, no fuzzy step', () => {
  it('defaults to the filename stem (extension stripped)', () => {
    expect(extractAccession('sub/CBL26-06-465.svs', null)).toBe('CBL26-06-465');
  });
  it('uses a configured regex capture group when present', () => {
    expect(extractAccession('scan_CBL26-06-465_a.ndpi', { pattern: 'scan_([A-Z0-9-]+)_' })).toBe('CBL26-06-465');
  });
  it('falls back to the stem on an invalid configured pattern (never throws)', () => {
    expect(extractAccession('X-1.tif', { pattern: '([' })).toBe('X-1');
  });
});
