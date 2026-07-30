import { HumanReviewRequestState, HumanReviewDecisionType } from '@prisma/client';

/**
 * Program 6 · Phase 6E — human-review workflow state + effective-decision rules (pure, dependency-free).
 *
 * The mutable HumanReviewRequest has a small legal state machine (routing only — never clinical truth). The immutable
 * HumanReviewDecision log is append-only; the EFFECTIVE decision is DERIVED as the latest submitted decision by a
 * deterministic ordering — never by rewriting rows (Decision 4 + concurrency rule). Completion is a deterministic
 * boundary; a governed reopen transitions away from COMPLETED without erasing decision/event history (Guardrail 3).
 */
export const REQUEST_TRANSITIONS: Record<HumanReviewRequestState, HumanReviewRequestState[]> = {
  PENDING: ['ASSIGNED', 'COMPLETED', 'CANCELLED'],
  ASSIGNED: ['PENDING', 'COMPLETED', 'CANCELLED'], // PENDING = unassign
  COMPLETED: ['ASSIGNED', 'PENDING'], // governed reopen
  CANCELLED: ['PENDING'], // governed reopen
};

export function isLegalRequestTransition(from: HumanReviewRequestState, to: HumanReviewRequestState): boolean {
  return REQUEST_TRANSITIONS[from]?.includes(to) ?? false;
}

export const DECISION_TYPES: HumanReviewDecisionType[] = ['ACCEPT', 'REJECT', 'MODIFY'];

/** A decision for effective-decision derivation — ordered by (submittedAt, decisionUuid) deterministically. */
export interface OrderedDecision {
  decisionUuid: string;
  submittedAt: Date;
  reviewDecision: HumanReviewDecisionType;
}

/**
 * The EFFECTIVE decision is the latest by submittedAt, ties broken by decisionUuid (deterministic, never
 * "last-write-wins" mutation). Returns null when no decision has been submitted. Pure — does not mutate input.
 */
export function effectiveDecision<T extends OrderedDecision>(decisions: readonly T[]): T | null {
  if (!decisions.length) return null;
  return [...decisions].sort((a, b) => {
    const t = b.submittedAt.getTime() - a.submittedAt.getTime();
    return t !== 0 ? t : b.decisionUuid.localeCompare(a.decisionUuid);
  })[0];
}
