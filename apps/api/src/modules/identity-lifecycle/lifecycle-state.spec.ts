import { UserLifecycleState } from '@prisma/client';
import { LIFECYCLE_TRANSITIONS, isActiveForState, isLegalTransition, isTerminal } from './lifecycle-state';

/**
 * Program 7 · Phase 7B.1 — pure lifecycle-policy unit tests (no I/O). Deterministic isActive mapping (L1), the legal
 * transition graph, and terminality.
 */
describe('lifecycle-state (L1 policy)', () => {
  it('maps ONLY ACTIVE to isActive=true', () => {
    expect(isActiveForState(UserLifecycleState.ACTIVE)).toBe(true);
    for (const s of [UserLifecycleState.INVITED, UserLifecycleState.PROVISIONED, UserLifecycleState.SUSPENDED, UserLifecycleState.DEPROVISIONED]) {
      expect(isActiveForState(s)).toBe(false);
    }
  });

  it('encodes the legal transition graph', () => {
    expect(LIFECYCLE_TRANSITIONS.activate).toEqual({ from: [UserLifecycleState.INVITED, UserLifecycleState.PROVISIONED], to: UserLifecycleState.ACTIVE });
    expect(LIFECYCLE_TRANSITIONS.suspend).toEqual({ from: [UserLifecycleState.ACTIVE], to: UserLifecycleState.SUSPENDED });
    expect(LIFECYCLE_TRANSITIONS.reactivate).toEqual({ from: [UserLifecycleState.SUSPENDED], to: UserLifecycleState.ACTIVE });
    expect(LIFECYCLE_TRANSITIONS.deprovision.to).toBe(UserLifecycleState.DEPROVISIONED);
    expect(LIFECYCLE_TRANSITIONS.deprovision.from).toEqual(expect.arrayContaining([UserLifecycleState.INVITED, UserLifecycleState.PROVISIONED, UserLifecycleState.ACTIVE, UserLifecycleState.SUSPENDED]));
  });

  it('rejects illegal transitions (DEPROVISIONED terminal; ACTIVE cannot go back to INVITED/PROVISIONED)', () => {
    expect(isTerminal(UserLifecycleState.DEPROVISIONED)).toBe(true);
    // no op may transition FROM DEPROVISIONED
    for (const op of ['activate', 'suspend', 'reactivate', 'deprovision'] as const) {
      expect(isLegalTransition(op, UserLifecycleState.DEPROVISIONED)).toBe(false);
    }
    // ACTIVE cannot become INVITED/PROVISIONED (no such op targets them)
    expect(Object.values(LIFECYCLE_TRANSITIONS).some((t) => t.to === UserLifecycleState.INVITED || t.to === UserLifecycleState.PROVISIONED)).toBe(false);
    // reactivate is only from SUSPENDED
    expect(isLegalTransition('reactivate', UserLifecycleState.ACTIVE)).toBe(false);
    expect(isLegalTransition('reactivate', UserLifecycleState.SUSPENDED)).toBe(true);
    // suspend only from ACTIVE
    expect(isLegalTransition('suspend', UserLifecycleState.SUSPENDED)).toBe(false);
    expect(isLegalTransition('suspend', UserLifecycleState.ACTIVE)).toBe(true);
  });
});
