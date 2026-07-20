# SECURITY_ARCHITECTURE.md

**Purpose:** Document the current security architecture of Osieri / CYTOLAB — authentication, authorization, sessions, tenancy, secrets, encryption, and the financial/clinical trust boundaries — so future hardening builds on an accurate map rather than assumptions.
**Scope:** `apps/api` primarily, with the web portal auth surface where relevant. Reflects architecture verified 2026-07-13. Describes **current** state only; recommendations are marked as such and are not implemented.
**Status:** Living document — active.
**Owner:** Osieri Engineering (unassigned).
**Last Updated:** 2026-07-13.

---

## Authentication

- **Staff:** global `JwtAuthGuard` (`APP_GUARD`) enforces a valid staff JWT on every route unless `@Public()` or `@Portal()`. Evidence: `apps/api/src/modules/auth/guards/jwt-auth.guard.ts`, `apps/api/src/modules/auth/auth.module.ts:20-21`.
- **Portal:** separate JWT strategy behind `PortalAuthGuard`; routes opt in with `@Portal()`.
- **Password verification:** legacy bcrypt (`$2`) hashes are verified then transparently re-hashed to **argon2id**, with a `passwordHistory` record. Wrong-credential responses are **generic** (`Invalid username or password.`) to prevent user enumeration.
- **Brute-force lockout** (`login` + `login-protection`): ladder at 3 → 5min, 5 → 15min, 7 → 60min, 10 → permanent. A locked account returns `ACCOUNT_LOCKED` and records an `account_locked` attempt without disclosing credential validity.
- **Impossible-travel detection:** > 500km AND < 2h from a prior session → HIGH alert + email (`login-protection`).
- **Public auth routes:** register-lab, login, mfa/challenge (+ email), refresh, logout — all explicitly `@Public()`.

## Authorization

Layered on authentication by `PermissionsGuard` (colon-namespaced permission strings, super-role bypass via `isSuperRole`). **Known limitation:** fail-open on absent permission metadata (RISK_REGISTER.md R-001), with one confirmed accidental hole on appointment reads (R-002). Full model and remediation in **PERMISSION_MATRIX.md**.

## Sessions

- Server-side sessions with `sid` bound into the JWT. Refresh tokens are **hashed at rest** (`sha256`), raw value returned once.
- **Refresh rotation:** presenting a refresh token deletes it and mints a new one on the same bound `deviceId`; a revoked/expired/unknown token → 401. Rotation is intended to prevent old-token reuse (untested — R-007).
- **Idle timeout** (default 15min) and **max lifetime** (default 12h) enforced via `rotateRefreshToken`/`touchSession` and the `session-activity.interceptor`, throwing `SESSION_IDLE_TIMEOUT`/`SESSION_EXPIRED` at the boundaries. Note: idle enforcement is in the interceptor, not `JwtStrategy.validate`.
- **Revocation:** `revokeSession` (session + its refresh tokens), `revokeAllForUser` (used by `changePassword`), `revokeOthersForUser` (keep current).
- **Legacy tokens** without `sid` are treated as always-active — a compatibility path worth explicit test coverage so it cannot bypass revocation.
- **Cookies:** `httpOnly`, `sameSite:'strict'`, `secure` in production. Env: `SESSION_IDLE_MINUTES`, `SESSION_MAX_HOURS`, `COOKIE_SECURE`, `NODE_ENV`.

## JWT

- Access-token claims include `ver=3`, `sid`, `type:'access'`, `scope:'staff'`, `audience:'staff'`, plus `permissions[]`, `roles[]`, `isSuperRole`. Env: `JWT_SECRET`, `JWT_EXPIRES_IN`.
- **Login contract note:** login returns `{status, user}` with HttpOnly cookies — **not** tokens in the body (the stale `auth.e2e.spec.ts` still asserts the old body shape; see TEST_STRATEGY.md).

## MFA

- Config in `apps/api/src/modules/security/mfa.service.ts`.
- **TOTP:** verify window ±1 (±30s), secret stored **encrypted** via `EncryptionService`; enabled only after a first valid code; disable requires a valid code.
- **Backup codes:** 8 minted, argon2-hashed, single-use (`consumeBackupCode` removes the matched hash).
- **Email OTP:** 6-digit (`randomInt`), 10-min TTL, single-use (`usedAt`), latest-live challenge only.
- **Login gating:** MFA challenged only when `hasMfa && (!trustedDevice || impossibleTravel)`; email-only method auto-sends the OTP; returns `MFA_REQUIRED` + a 5-min `mfaToken`.
- **Verify precedence:** TOTP → live email OTP → backup code.

## Tenant isolation

- **Mechanism:** a Prisma client extension backed by `AsyncLocalStorage` (`LabContext`) stamps and filters `labId` on every query; `tenantCreate`/`portalCreate` helpers make it impossible for services to hand-set `labId`. Fail-closed. `labId` is sourced from the JWT, **never** from the request body.
- **Portal scoping (Rule B):** portal principals are additionally client-scoped.
- **Superuser cross-lab:** the only body-supplied `labId` path is the superuser support tool (`support.service.ts`), wrapped in `runLabScoped`.
- **Coverage:** strong read-isolation tests (`tenancy.integration.spec.ts`) across 8 models. Gaps to add: write-path isolation, portal-scope, and `runSystem`/`runLabScoped` escapes used by the payment callback (TEST_STRATEGY.md).

## Permissions

See PERMISSION_MATRIX.md. Summary: global `PermissionsGuard`, super-role bypass, class/handler-level `@RequirePermissions`, alternate guards (`SuperuserGuard`, `PortalAuthGuard`, `WorkforceManagerGuard`, `FeatureGuard`). Fail-open default is the primary hardening target.

## Audit

**Partially implemented / Deferred.** Discrete security events are persisted (login attempts, account locks, blocked IPs, security alerts; payroll integrity hashes). There is no single, documented, tamper-resistant audit-log subsystem. A unified audit standard (schema, immutability, retention) is **Deferred** — see LOGGING_STANDARD.md §AUDIT. Do not assume a comprehensive audit trail exists.

## Future penetration testing (Deferred — not performed)

No penetration test is documented. Recommended future scope (not scheduled here): the `@Public` payment callback (forgery/replay — R-003), authorization fail-open (R-001/R-002), session rotation/revocation, MFA bypass, IP-block evasion (X-Forwarded-For spoofing), and tenant-isolation escape attempts. **Deferred.**

## Secrets

- **Fail-hard startup checks** in `apps/api/src/main.ts` reject boot on missing critical secrets and enforce DB TLS. Env includes `JWT_SECRET`, DB credentials, PowerTranz credentials, encryption key, `ALLOWED_ORIGINS`.
- **HTTP hardening (helmet):** CSP `defaultSrc 'self'`, `scriptSrc 'self'` (no `unsafe-inline`), `frameSrc 'none'`, `frameguard: deny`, HSTS; credentialed CORS restricted to `ALLOWED_ORIGINS`. Global `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })` strips unknown input.
- **Config caveat (R-005):** the global `scriptSrc 'self'` + `frameguard: deny` block the payment callback's inline script and intended framing — a latent functional issue to resolve alongside origin pinning.

## Encryption

- **In transit:** HSTS + enforced DB TLS.
- **At rest (application-level):** MFA secrets encrypted via `EncryptionService`; refresh tokens hashed (`sha256`); passwords argon2id; backup codes argon2. Payroll runs carry a `sha256` integrity hash (with a known lifecycle gap — R-008).
- **Storage:** files via GCS (see ARCHITECTURE.md). Full at-rest encryption posture for the database/object store is **Unknown** at this layer — document when confirmed.

## Financial integrations

- **PowerTranz** card payments via the requisition portal. Trust boundaries: the settlement callback is `@Public`, keyed by query `bid`; server-side settlement is gated by the gateway's `complete()` approval requiring a valid `SpiToken`.
- **Known gaps (R-003/R-004/R-005):** `markPaid` is not idempotent; no amount or token↔batch binding; `confirmPayment` trusts a client-supplied reference; postMessage uses `'*'` and the receiver validates neither origin nor source; CSP blocks the callback's inline script. Redaction of card data: `SpiToken` stays server-side; the postMessage payload carries no PAN/token/amount.

## Clinical considerations

- **AI redaction** (`apps/api/src/modules/ai/redaction.ts`): allowlist-by-construction, dates→intervals/age-bands, free-text patient-token scrubbing, sha256 provenance. The AI service **never throws** (20s timeout, degrades to `{available:false}`); reporting is metadata-only on reads and gated on `enabled` + `hasApiKey`.
- PHI must never enter logs (LOGGING_STANDARD.md). Clinical data is tenant-scoped like all other data.

---

## Related documents
- PERMISSION_MATRIX.md (authorization model)
- LOGGING_STANDARD.md (security/audit logging, PHI rules)
- TEST_STRATEGY.md (security invariants to test)
- RISK_REGISTER.md (R-001..R-005, R-007)
- PRODUCTION_READINESS_CHECKLIST.md (security readiness state)

## Future revisions
- Document the audit subsystem and at-rest encryption posture once confirmed.
- Update the login-contract note when the stale e2e is corrected.
- Record penetration-test findings when a test is performed.

## Verification requirements
- Every mechanism described must be backed by the cited source; unknowns are marked Unknown, not assumed.
- Security changes land only in their isolated checkpoints (CP-1..CP-4), never combined with logging/tests/color.
- This document authorizes no code change.
