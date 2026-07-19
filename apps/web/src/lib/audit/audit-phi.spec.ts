import { shouldPhiFailClosedRevert } from './audit-phi';

describe('P2-8D — PHI fail-closed decision', () => {
  it('does not revert when not in PHI mode or no error', () => {
    expect(shouldPhiFailClosedRevert(false, { response: { status: 500 } })).toBe(false);
    expect(shouldPhiFailClosedRevert(true, null)).toBe(false);
    expect(shouldPhiFailClosedRevert(true, undefined)).toBe(false);
  });

  it('reverts on a genuine PHI operational failure (5xx / network / malformed)', () => {
    expect(shouldPhiFailClosedRevert(true, { response: { status: 500 } })).toBe(true);
    expect(shouldPhiFailClosedRevert(true, { response: { status: 503 } })).toBe(true);
    expect(shouldPhiFailClosedRevert(true, new Error('network'))).toBe(true);
  });

  it('does NOT revert on 403 (unauthorized) or 404 (concealment) — those keep their states', () => {
    expect(shouldPhiFailClosedRevert(true, { response: { status: 403 } })).toBe(false);
    expect(shouldPhiFailClosedRevert(true, { response: { status: 404 } })).toBe(false);
  });
});
