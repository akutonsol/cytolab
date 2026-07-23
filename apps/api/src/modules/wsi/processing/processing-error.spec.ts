import { isRetryable, shouldRetry } from './processing-error';

describe('processing error classification (P5-3B.1A)', () => {
  it('treats deterministic-input failures as non-retryable', () => {
    expect(isRetryable('CHECKSUM_MISMATCH')).toBe(false);
    expect(isRetryable('UNSUPPORTED_FORMAT')).toBe(false);
    expect(isRetryable('CANCELLED')).toBe(false);
  });

  it('treats transient/environmental failures as retryable', () => {
    expect(isRetryable('ENGINE_CRASH')).toBe(true);
    expect(isRetryable('STORAGE_TRANSIENT')).toBe(true);
    expect(isRetryable('WORKER_TERMINATED')).toBe(true);
    expect(isRetryable('UNKNOWN')).toBe(true); // bounded by maxAttempts
  });

  it('shouldRetry gates on both classification and the attempt budget', () => {
    expect(shouldRetry('ENGINE_CRASH', 1, 3)).toBe(true);
    expect(shouldRetry('ENGINE_CRASH', 3, 3)).toBe(false); // budget exhausted
    expect(shouldRetry('CHECKSUM_MISMATCH', 1, 3)).toBe(false); // non-retryable
  });
});
