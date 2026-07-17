/**
 * Program 2 · P2-2 — Correlation & id utilities.
 *
 * Correlation ids are platform-controlled: every execution gets one. For HTTP we accept a
 * caller-provided id only if it is well-formed (UUID v4), otherwise we reject it — an
 * attacker cannot inject an arbitrary trace token, and a malformed value never silently
 * pollutes the trail. `randomUUID` from node:crypto is the repository's established id source.
 */
import { randomUUID } from 'node:crypto';

/** Header carrying an inbound correlation id (case-insensitive in Express). */
export const CORRELATION_HEADER = 'x-correlation-id';
/** Header carrying an inbound request id, if a proxy assigns one. */
export const REQUEST_ID_HEADER = 'x-request-id';

// UUID v4, as produced by randomUUID(). Kept strict so a malformed inbound value is rejected.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function generateCorrelationId(): string {
  return randomUUID();
}

export function generateRequestId(): string {
  return randomUUID();
}

export function generateExecutionId(): string {
  return randomUUID();
}

export function isValidCorrelationId(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4.test(value);
}

export class MalformedCorrelationIdError extends Error {
  constructor(value: unknown) {
    super(
      `Malformed ${CORRELATION_HEADER}: expected a UUID v4, received ${JSON.stringify(
        typeof value === 'string' ? value.slice(0, 64) : value,
      )}.`,
    );
    this.name = 'MalformedCorrelationIdError';
  }
}

/**
 * Resolve the correlation id for an inbound request: reuse a well-formed inbound value,
 * generate one when absent, and REJECT a malformed one. A header value may be a string or an
 * array (duplicate headers) — an array is treated as malformed.
 */
export function resolveInboundCorrelationId(raw: string | string[] | undefined): string {
  if (raw === undefined) return generateCorrelationId();
  if (Array.isArray(raw)) throw new MalformedCorrelationIdError(raw);
  if (!isValidCorrelationId(raw)) throw new MalformedCorrelationIdError(raw);
  return raw;
}
