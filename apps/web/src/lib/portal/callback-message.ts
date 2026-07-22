/**
 * Validation for postMessage events from the payment callback iframe (R-004b).
 *
 * The callback page runs inside the 3DS iframe and posts a status to the portal.
 * A message is acted on ONLY when it comes from the expected origin AND the active
 * iframe window, carries a supported status, and names the active batch. The
 * authenticated status poll — not this message — remains the source of payment truth,
 * so a forged/malformed message can at most fail to advance a UI phase.
 */

export type CallbackStatus = 'payment_processing' | 'declined' | 'error';

const SUPPORTED_STATUSES: ReadonlySet<string> = new Set<CallbackStatus>([
  'payment_processing',
  'declined',
  'error',
]);

export interface ValidatedCallback {
  status: CallbackStatus;
  message?: string;
}

export interface CallbackContext {
  /** Origin the callback iframe is served from (where the gateway posts back). */
  expectedOrigin: string;
  /** The active iframe's contentWindow — the only allowed message source. */
  expectedSource: Window | null;
  /** The batch this modal is paying for; the message's orderId must match it. */
  batchId: string;
}

/**
 * Returns the validated status ONLY when every check passes; otherwise null (the
 * message must be ignored — no UI transition, no mutation, poll untouched).
 */
export function validateCallbackMessage(e: MessageEvent, ctx: CallbackContext): ValidatedCallback | null {
  // 1. Exact origin match.
  if (!ctx.expectedOrigin || e.origin !== ctx.expectedOrigin) return null;
  // 2. Exact source-window match (rejects messages from any other window).
  if (!ctx.expectedSource || e.source !== ctx.expectedSource) return null;
  // 3. Object payload.
  const data = e.data as unknown;
  if (!data || typeof data !== 'object') return null;
  const rec = data as Record<string, unknown>;
  // 4. orderId is a string matching the active batch.
  if (typeof rec.orderId !== 'string' || rec.orderId !== ctx.batchId) return null;
  // 5. status is one of the supported values.
  if (typeof rec.status !== 'string' || !SUPPORTED_STATUSES.has(rec.status)) return null;
  return {
    status: rec.status as CallbackStatus,
    message: typeof rec.message === 'string' ? rec.message : undefined,
  };
}

/**
 * The origin the callback iframe is served from — where `POWERTRANZ_CALLBACK_URL`
 * points. In production this is the same origin as the portal (behind one load
 * balancer); in development the API runs on a different origin, set via
 * `NEXT_PUBLIC_API_ORIGIN`. Defaults to same-origin (the production case).
 */
export function expectedCallbackOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_API_ORIGIN?.trim();
  if (configured) return configured;
  return typeof window !== 'undefined' ? window.location.origin : '';
}
