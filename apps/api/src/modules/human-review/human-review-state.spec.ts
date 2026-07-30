import { isLegalRequestTransition, effectiveDecision } from './human-review-state';

/** Program 6 · Phase 6E — pure workflow-state + effective-decision rules. */
describe('P6-6E human-review state', () => {
  it('permits only the legal request transitions', () => {
    expect(isLegalRequestTransition('PENDING', 'ASSIGNED')).toBe(true);
    expect(isLegalRequestTransition('PENDING', 'COMPLETED')).toBe(true);
    expect(isLegalRequestTransition('ASSIGNED', 'COMPLETED')).toBe(true);
    expect(isLegalRequestTransition('COMPLETED', 'PENDING')).toBe(true); // governed reopen
    expect(isLegalRequestTransition('CANCELLED', 'PENDING')).toBe(true); // governed reopen
    // illegal
    expect(isLegalRequestTransition('CANCELLED', 'COMPLETED')).toBe(false);
    expect(isLegalRequestTransition('COMPLETED', 'CANCELLED')).toBe(false);
    expect(isLegalRequestTransition('PENDING', 'PENDING')).toBe(false);
  });

  it('derives the effective decision as the latest by (submittedAt, decisionUuid), never mutating input', () => {
    expect(effectiveDecision([])).toBeNull();
    const decisions = [
      { decisionUuid: 'a', submittedAt: new Date('2026-01-01T00:00:00Z'), reviewDecision: 'ACCEPT' as const },
      { decisionUuid: 'c', submittedAt: new Date('2026-01-03T00:00:00Z'), reviewDecision: 'MODIFY' as const },
      { decisionUuid: 'b', submittedAt: new Date('2026-01-02T00:00:00Z'), reviewDecision: 'REJECT' as const },
    ];
    const snapshot = JSON.stringify(decisions);
    expect(effectiveDecision(decisions)?.decisionUuid).toBe('c'); // latest timestamp
    expect(JSON.stringify(decisions)).toBe(snapshot); // input not mutated
  });

  it('breaks a same-timestamp tie deterministically by decisionUuid', () => {
    const t = new Date('2026-01-01T00:00:00Z');
    const eff = effectiveDecision([
      { decisionUuid: 'aaa', submittedAt: t, reviewDecision: 'ACCEPT' as const },
      { decisionUuid: 'zzz', submittedAt: t, reviewDecision: 'REJECT' as const },
    ]);
    expect(eff?.decisionUuid).toBe('zzz');
  });
});
