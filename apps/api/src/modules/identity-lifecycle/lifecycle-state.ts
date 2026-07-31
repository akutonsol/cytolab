import { UserLifecycleState } from '@prisma/client';

/**
 * Program 7 · Phase 7B.1 — the canonical identity access-lifecycle state graph and the deterministic
 * lifecycle-state ↔ `isActive` mapping (L1). This is pure policy (no I/O); the single lifecycle command boundary
 * (`IdentityLifecycleService`) is the only production writer that applies it. Lifecycle state confers no permissions and
 * is not employment/licensing truth (L11/L12).
 */

export type LifecycleOp = 'activate' | 'suspend' | 'reactivate' | 'deprovision';

/** Deterministic mapping — ONLY ACTIVE is login-enabled (L1). Every other state maps to isActive=false. */
export function isActiveForState(state: UserLifecycleState): boolean {
  return state === UserLifecycleState.ACTIVE;
}

/**
 * The legal transition graph (L1). Each op declares the states it may transition FROM and the single state it
 * transitions TO. Anything not listed here fails closed (illegal transition). DEPROVISIONED is terminal (never a
 * `from` for a state-changing op).
 */
export const LIFECYCLE_TRANSITIONS: Record<LifecycleOp, { from: UserLifecycleState[]; to: UserLifecycleState }> = {
  activate: { from: [UserLifecycleState.INVITED, UserLifecycleState.PROVISIONED], to: UserLifecycleState.ACTIVE },
  suspend: { from: [UserLifecycleState.ACTIVE], to: UserLifecycleState.SUSPENDED },
  reactivate: { from: [UserLifecycleState.SUSPENDED], to: UserLifecycleState.ACTIVE },
  deprovision: {
    from: [UserLifecycleState.INVITED, UserLifecycleState.PROVISIONED, UserLifecycleState.ACTIVE, UserLifecycleState.SUSPENDED],
    to: UserLifecycleState.DEPROVISIONED,
  },
};

/** Is `op` legal from `current`? (A no-op where `current` already equals the target is handled as idempotent elsewhere.) */
export function isLegalTransition(op: LifecycleOp, current: UserLifecycleState): boolean {
  return LIFECYCLE_TRANSITIONS[op].from.includes(current);
}

/** The terminal state cannot transition to any other state. */
export function isTerminal(state: UserLifecycleState): boolean {
  return state === UserLifecycleState.DEPROVISIONED;
}
