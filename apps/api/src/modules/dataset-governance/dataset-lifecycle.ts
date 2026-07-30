import { DatasetVersionState } from '@prisma/client';

/**
 * Program 6 · Phase 6B — dataset-version lifecycle rules (pure). Minimal by design: DRAFT (mutable) → FROZEN
 * (immutable). FROZEN is terminal; a correction is a NEW version. ARCHIVED is deferred until a demonstrated need.
 */
export const MUTABLE_STATE: DatasetVersionState = 'DRAFT';

/** True iff membership/labels/rules may still be modified (only in DRAFT). */
export function isMutable(state: DatasetVersionState): boolean {
  return state === 'DRAFT';
}

/** True iff a version may transition to FROZEN (only from DRAFT). */
export function isFreezable(state: DatasetVersionState): boolean {
  return state === 'DRAFT';
}
