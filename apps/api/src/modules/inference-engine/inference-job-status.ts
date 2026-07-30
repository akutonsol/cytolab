import { AiModelLifecycleState, InferenceJobStatus } from '@prisma/client';

/**
 * Program 6 · Phase 6C — inference execution status + model-eligibility rules (pure, dependency-free).
 *
 * Status lifecycle: QUEUED → RUNNING → (SUCCEEDED | FAILED | TIMED_OUT). ACTIVE = {QUEUED, RUNNING} is the set the
 * partial-unique idempotency index guards. Model-version eligibility (Decision 3): only VALIDATION and APPROVED may
 * be dispatched; a VALIDATION run is recorded validation-only (immutable "not approved for clinical use" provenance).
 */
export const ACTIVE_STATUSES: InferenceJobStatus[] = ['QUEUED', 'RUNNING'];
export const TERMINAL_STATUSES: InferenceJobStatus[] = ['SUCCEEDED', 'FAILED', 'TIMED_OUT'];

export function isActiveStatus(s: InferenceJobStatus): boolean {
  return s === 'QUEUED' || s === 'RUNNING';
}
export function isTerminalStatus(s: InferenceJobStatus): boolean {
  return !isActiveStatus(s);
}

/** Lifecycle states a model version must be in to be dispatched for inference (Decision 3). */
export const ELIGIBLE_LIFECYCLE_STATES: AiModelLifecycleState[] = ['VALIDATION', 'APPROVED'];

export function isEligibleForInference(state: AiModelLifecycleState): boolean {
  return state === 'VALIDATION' || state === 'APPROVED';
}

/** A VALIDATION-state run is validation-only — NOT approved for clinical use (immutable provenance). */
export function isValidationOnly(state: AiModelLifecycleState): boolean {
  return state === 'VALIDATION';
}
