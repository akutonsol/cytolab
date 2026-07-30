import { isActiveStatus, isTerminalStatus, isEligibleForInference, isValidationOnly, ELIGIBLE_LIFECYCLE_STATES } from './inference-job-status';

/** Program 6 · Phase 6C — pure status + model-eligibility rules (Decision 3). */
describe('P6-6C inference status + eligibility', () => {
  it('classifies active vs terminal statuses', () => {
    expect(isActiveStatus('QUEUED')).toBe(true);
    expect(isActiveStatus('RUNNING')).toBe(true);
    for (const t of ['SUCCEEDED', 'FAILED', 'TIMED_OUT'] as const) {
      expect(isActiveStatus(t)).toBe(false);
      expect(isTerminalStatus(t)).toBe(true);
    }
  });

  it('only VALIDATION and APPROVED are eligible for inference', () => {
    expect(ELIGIBLE_LIFECYCLE_STATES).toEqual(['VALIDATION', 'APPROVED']);
    expect(isEligibleForInference('VALIDATION')).toBe(true);
    expect(isEligibleForInference('APPROVED')).toBe(true);
    for (const s of ['DRAFT', 'DEPRECATED', 'RETIRED'] as const) {
      expect(isEligibleForInference(s)).toBe(false);
    }
  });

  it('a VALIDATION run is validation-only; APPROVED is not', () => {
    expect(isValidationOnly('VALIDATION')).toBe(true);
    expect(isValidationOnly('APPROVED')).toBe(false);
  });
});
