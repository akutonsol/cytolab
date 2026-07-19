/**
 * Program 2 · P2-8D — hardened return-path validation. The detail `back` param must resolve to the
 * Audit List ONLY: origin-relative, exact `/audit` path (an optional query string is allowed for the
 * preserved predicate). Everything else — `/audit-other`, `/audit/123`, protocol-relative, absolute,
 * or cross-origin — falls back to `/audit`. No open redirect; the opaque cursor is never in the URL.
 */
export function safeAuditBackHref(raw: string | null | undefined): string {
  if (!raw) return '/audit';
  let u: URL;
  try {
    // Parse relative to a throwaway origin; an absolute/cross-origin input keeps its own host.
    u = new URL(raw, 'http://audit.local');
  } catch {
    return '/audit';
  }
  // Reject anything that escaped to another origin, and any path that is not exactly /audit.
  if (u.origin !== 'http://audit.local') return '/audit';
  if (u.pathname !== '/audit') return '/audit';
  return `/audit${u.search}`;
}
