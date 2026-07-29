import { AiModelLifecycleState } from '@prisma/client';
import { AI_MODEL_LIFECYCLE_TRANSITIONS, isLegalLifecycleTransition, LIFECYCLE_ENTRY_STAMP } from './ai-model-lifecycle';

/** Program 6 · Phase 6A — the pure lifecycle state machine: legal transitions only, RETIRED terminal. */
const ALL: AiModelLifecycleState[] = ['DRAFT', 'VALIDATION', 'APPROVED', 'DEPRECATED', 'RETIRED'];

describe('P6-6A AI model lifecycle state machine', () => {
  it('permits exactly the approved legal transitions', () => {
    const legal: Array<[AiModelLifecycleState, AiModelLifecycleState]> = [
      ['DRAFT', 'VALIDATION'],
      ['VALIDATION', 'APPROVED'],
      ['VALIDATION', 'DRAFT'],
      ['APPROVED', 'DEPRECATED'],
      ['DEPRECATED', 'RETIRED'],
    ];
    for (const [f, t] of legal) expect(isLegalLifecycleTransition(f, t)).toBe(true);
    // every other ordered pair is illegal
    let illegalChecked = 0;
    for (const f of ALL) for (const t of ALL) {
      if (legal.some(([lf, lt]) => lf === f && lt === t)) continue;
      expect(isLegalLifecycleTransition(f, t)).toBe(false);
      illegalChecked++;
    }
    expect(illegalChecked).toBe(ALL.length * ALL.length - legal.length);
  });

  it('RETIRED is terminal — no transition out of RETIRED', () => {
    expect(AI_MODEL_LIFECYCLE_TRANSITIONS.RETIRED).toEqual([]);
    for (const t of ALL) expect(isLegalLifecycleTransition('RETIRED', t)).toBe(false);
  });

  it('self-transitions are illegal', () => {
    for (const s of ALL) expect(isLegalLifecycleTransition(s, s)).toBe(false);
  });

  it('maps each entered state to its stamp column (send-back to DRAFT stamps nothing)', () => {
    expect(LIFECYCLE_ENTRY_STAMP.VALIDATION).toBe('validatedAt');
    expect(LIFECYCLE_ENTRY_STAMP.APPROVED).toBe('approvedAt');
    expect(LIFECYCLE_ENTRY_STAMP.DEPRECATED).toBe('deprecatedAt');
    expect(LIFECYCLE_ENTRY_STAMP.RETIRED).toBe('retiredAt');
    expect(LIFECYCLE_ENTRY_STAMP.DRAFT).toBeUndefined();
  });
});
