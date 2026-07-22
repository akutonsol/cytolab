/**
 * Canonical-origin configuration for security-sensitive equality/pinning checks
 * (postMessage targetOrigin, CSP frame-ancestors).
 *
 * A canonical origin is scheme + host [+ port] ONLY — e.g. `https://portal.example.com`.
 * We deliberately do NOT reuse the broad `ALLOWED_ORIGINS` list here: these values feed
 * exact-match browser security controls, so they must be single, unambiguous origins.
 */

/**
 * Parse + validate a single canonical origin from an env var. Rejects paths, query
 * strings, fragments, credentials, and wildcards. Fails closed in production when the
 * value is missing or invalid; falls back to a localhost dev default otherwise.
 */
export function canonicalOriginFromEnv(envVar: string, devDefault: string): string {
  const raw = process.env[envVar]?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `SECURITY: ${envVar} is required in production. Set it to a canonical origin ` +
          `(scheme + host[:port] only), e.g. https://portal.example.com`,
      );
    }
    return devDefault;
  }
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`SECURITY: ${envVar} must be a valid absolute origin URL. Got: ${raw}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`SECURITY: ${envVar} must use http or https. Got: ${raw}`);
  }
  if (u.username || u.password) {
    throw new Error(`SECURITY: ${envVar} must not contain credentials.`);
  }
  if ((u.pathname && u.pathname !== '/') || u.search || u.hash) {
    throw new Error(`SECURITY: ${envVar} must be an origin only (no path, query, or fragment). Got: ${raw}`);
  }
  if (u.hostname.includes('*')) {
    throw new Error(`SECURITY: ${envVar} must not be a wildcard origin.`);
  }
  // Normalize (drops any trailing slash / default port) — this is the value used for
  // postMessage targetOrigin and CSP frame-ancestors.
  return u.origin;
}

/** The client-portal web origin — the parent window that hosts the payment iframe. */
export function getPortalWebOrigin(): string {
  return canonicalOriginFromEnv('PORTAL_WEB_ORIGIN', 'http://localhost:3000');
}
