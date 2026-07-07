// @cytolab/config — cross-cutting constants shared by API and Web.
// These values are currently duplicated across apps (main.ts prefix, next.config
// rewrite, axios baseURL, session cookie names, portal audience). This is the
// canonical home; wiring the apps to import from here is a follow-up migration
// tracked in TECH_DEBT.md (kept non-breaking for now — no app imports changed).

/** Global API prefix (NestJS `setGlobalPrefix`, Next rewrite, axios baseURL). */
export const API_PREFIX = 'api/v1';

/** HttpOnly auth cookie names (staff session). */
export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

/** JWT audiences. */
export const STAFF_AUDIENCE = 'staff';
export const PORTAL_AUDIENCE = 'portal';

/** Minimum length for token-signing secrets (fail-hard at API startup). */
export const MIN_SECRET_LENGTH = 32;
