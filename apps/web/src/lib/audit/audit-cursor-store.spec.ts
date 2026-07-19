import { useAuditCursorStore } from './audit-cursor-store';

const s = () => useAuditCursorStore.getState();
beforeEach(() => useAuditCursorStore.setState({ predicateKey: '', stack: [], current: null }));

describe('P2-8B — cursor store (forward-only keyset)', () => {
  it('starts at the first page with no Prev', () => {
    expect(s().current).toBeNull();
    expect(s().canPrev()).toBe(false);
  });

  it('Next pushes the arrival cursor; Prev returns to it (no dup/skip)', () => {
    s().next('c1');
    expect(s().current).toBe('c1');
    expect(s().canPrev()).toBe(true);
    s().next('c2');
    expect(s().current).toBe('c2');
    s().prev();
    expect(s().current).toBe('c1'); // back to page 2
    s().prev();
    expect(s().current).toBeNull(); // back to page 1
    expect(s().canPrev()).toBe(false);
  });

  it('Prev at the first page is a no-op', () => {
    s().prev();
    expect(s().current).toBeNull();
    expect(s().stack).toEqual([]);
  });

  it('a predicate change resets the stack/current; an unchanged predicate keeps position', () => {
    s().next('c1');
    s().syncPredicate('KEY_A'); // first sync from '' → resets (already at reset since predicateKey was '')
    useAuditCursorStore.setState({ predicateKey: 'KEY_A', stack: ['x'], current: 'c9' });
    s().syncPredicate('KEY_A'); // unchanged → keep
    expect(s().current).toBe('c9');
    s().syncPredicate('KEY_B'); // changed → reset
    expect(s().current).toBeNull();
    expect(s().stack).toEqual([]);
    expect(s().predicateKey).toBe('KEY_B');
  });
});
