/**
 * Program 7 · Phase 7A.2b — service-token contract constants. Machine tokens carry a distinct audience + scope so the
 * human strategy can never accept them and vice-versa (ET6). Short lifetime is the accepted revocation bound (D4).
 */
export const SERVICE_AUDIENCE = 'service';
export const SERVICE_SCOPE = 'service';
export const SERVICE_TOKEN_TTL_SECONDS = 600; // 10 minutes — short-lived; no refresh, no session (D4)
export const SERVICE_TOKEN_ALGS = ['HS256'] as const; // fixed allowlist; never "none". D2: swap to a service keyset later behind the signer seam.
export const IS_SERVICE_KEY = 'is_service_route';
