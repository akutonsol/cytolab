/**
 * Program 5A · P5-3B.1A — stable processing-error classification.
 *
 * Retry decisions are based on a STABLE error code, not on message text. Deterministic-input failures
 * (a bad checksum, an unsupported format, an operator cancellation) are non-retryable — retrying would
 * just fail identically. Transient/environmental failures (a native crash, a transient storage error,
 * a worker termination) are retryable up to the attempt budget.
 */
export type ProcessingErrorCode =
  | 'CHECKSUM_MISMATCH' // the source no longer matches its verified checksum → deterministic, non-retryable
  | 'UNSUPPORTED_FORMAT' // the engine cannot read this WSI → deterministic, non-retryable
  | 'CANCELLED' // operator/lifecycle cancellation → non-retryable
  | 'ENGINE_CRASH' // native subprocess crashed/killed → retryable
  | 'STORAGE_TRANSIENT' // transient object-store failure → retryable
  | 'WORKER_TERMINATED' // lease loss / SIGTERM / reclaimed → retryable
  | 'UNKNOWN'; // unclassified → treated as transient (retryable, but bounded by maxAttempts)

const NON_RETRYABLE = new Set<ProcessingErrorCode>(['CHECKSUM_MISMATCH', 'UNSUPPORTED_FORMAT', 'CANCELLED']);

export function isRetryable(code: ProcessingErrorCode): boolean {
  return !NON_RETRYABLE.has(code);
}

/** A retry is eligible only when the error is retryable AND the attempt budget is not yet exhausted. */
export function shouldRetry(code: ProcessingErrorCode, priorAttempt: number, maxAttempts: number): boolean {
  return isRetryable(code) && priorAttempt < maxAttempts;
}
