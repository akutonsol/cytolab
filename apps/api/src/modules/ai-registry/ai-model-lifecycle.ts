import { AiModelLifecycleState } from '@prisma/client';

/**
 * Program 6 · Phase 6A — the AI model-version lifecycle state machine (pure, dependency-free).
 *
 * Legal transitions only; RETIRED is terminal. This is the single source of truth for transition legality —
 * the service enforces it and records every accepted transition append-only. No execution/inference is implied.
 */
export const AI_MODEL_LIFECYCLE_TRANSITIONS: Record<AiModelLifecycleState, AiModelLifecycleState[]> = {
  DRAFT: ['VALIDATION'],
  VALIDATION: ['APPROVED', 'DRAFT'], // → APPROVED (promote) or → DRAFT (send back)
  APPROVED: ['DEPRECATED'],
  DEPRECATED: ['RETIRED'],
  RETIRED: [], // terminal — no transition out of RETIRED
};

export function isLegalLifecycleTransition(from: AiModelLifecycleState, to: AiModelLifecycleState): boolean {
  return AI_MODEL_LIFECYCLE_TRANSITIONS[from]?.includes(to) ?? false;
}

/** The version stamp column set on entry into a state (the append-only event log remains authoritative). */
export const LIFECYCLE_ENTRY_STAMP: Partial<Record<AiModelLifecycleState, 'validatedAt' | 'approvedAt' | 'deprecatedAt' | 'retiredAt'>> = {
  VALIDATION: 'validatedAt',
  APPROVED: 'approvedAt',
  DEPRECATED: 'deprecatedAt',
  RETIRED: 'retiredAt',
};
