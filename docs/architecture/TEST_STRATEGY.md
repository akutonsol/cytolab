# TEST_STRATEGY.md

**Purpose:** Define the testing standards for PathOS / CYTOLAB — what each test class is for, where the current gaps are, and the invariants that must be pinned before the money and security layers can be trusted or refactored.
**Scope:** `apps/api` and `apps/web`. Reflects coverage verified 2026-07-13. This document defines standards; it adds no tests.
**Status:** Living document — active. Several sections describe **Deferred** future capability (CI, performance, portal E2E).
**Owner:** PathOS Engineering (unassigned).
**Last Updated:** 2026-07-13.

---

## Current coverage snapshot (as-built)

**Present:** tenant isolation integration (strong — `apps/api/src/common/tenancy/tenancy.integration.spec.ts`), tenancy extension unit, `PermissionsGuard` unit (isolation only — `.../permissions.guard.spec.ts`), services/taxes CRUD integration, a **stale** auth e2e (`apps/api/src/modules/auth/auth.e2e.spec.ts` asserts a removed token-in-body contract), plus specs in ai, analytics, appointments, messaging, patients, portal, records, reports, requisitions, result-sheets.

**Absent (high-risk):** billing, payments, PowerTranz callback, payroll (both engines), taxes application, MFA, sessions, IP blocking, authentication lockout, route-level authorization. See RISK_REGISTER.md R-007, R-008.

## Test classes

### Unit
Pure functions and single-service logic with dependencies mocked. Priority targets: billing tax rounding (`round(subtotal*bps/10000)`), payroll `computeAdvice()` (explicitly exported "for unit testing" — currently untested), JWT claim construction, session token hashing, IP-block expiry logic. Fast, no DB.

### Integration (service)
A service against a real (or transactional) DB with external I/O mocked. Priority: bill issue lifecycle, payment overpayment guard + `amountPaid` no-drift within a `$transaction`, payroll `processPeriod` re-run safety, auth lockout ladder, session idle/max revocation.

### Integration (controller)
Route through guards/interceptors to the handler. Priority: **route-level authorization** (a `@RequirePermissions` route 403s a principal lacking the code; the appointments read routes are gated — R-002), blocked-IP 403 before handler, revoked/idle session 401 at the route (idle enforcement lives in the interceptor, not `JwtStrategy`).

### Integration (database)
Constraint- and transaction-level behavior. Priority: tenant write-path isolation (can lab A update/delete a lab-B row by id?), SET-NULL-on-delete preserving `BillTax` snapshots, concurrent partial payments summing correctly.

### Composition
Aggregate read endpoints that compose sub-sources with per-section degradation (signout case context, diagnostic-case, quality-governance). Assert: a failed sub-source degrades to `{status:'error'}` without failing the request, and (post-CP-6) emits a log without changing the returned value.

### Contract
Shape contracts between API and web, and with external gateways. Priority: the login response contract (cookies vs body — the stale e2e encodes the *old* contract), and the PowerTranz request/response shapes used by `powertranz.service.ts`. Formalized contract tests are **Deferred**.

### Regression
Lock a fixed defect so it cannot recur. Every security/financial fix ships with its regression test in the **same** checkpoint (e.g. CP-1 ships the appointments authz spec). Broad regression suites otherwise belong to CP-5.

### Security
Adversarial invariants. Priority matrix:
- **Payment callback:** replayed callback is a no-op for an already-PAID batch; forged/unsigned callback rejected; cross-batch token binding rejected; settled amount ≠ billed rejected (R-003).
- **Auth:** lockout at 3/5/7/10 attempts → 5min/15min/60min/permanent; generic non-enumerating error; bcrypt→argon2 transparent migration.
- **Sessions:** refresh rotation prevents old-token reuse; revoke-all on password change; revoked session fails `touchSession`.
- **MFA:** backup code single-use; TOTP ±1 window; email OTP single-use + TTL; verify precedence TOTP→email→backup.
- **IP block:** blocked IP 403s pre-handler; credential-stuffing auto-block idempotent.
- **Tenancy:** cross-lab read/write returns nothing; portal scope; `runSystem`/`runLabScoped` escapes used by the payment callback.

### Performance
Experience-budget measurement on a **production** build (`cd apps/web && npm run measure:experience`, :3100): cold startup ≤ 2000ms, route loading ≤ 400ms (cue ≤ 200ms), interaction ≤ 100ms. Motion grammar check (`npm run check:motion-grammar`). Automated perf gates in CI are **Deferred**.

### Accessibility
Keyboard-only operability, focus management in dialogs, ARIA roles, contrast. Automated axe integration is **Deferred**; see ACCESSIBILITY_DEBT_REGISTER.md for the current backlog to convert into tests.

### Clinical correctness
Cytology/diagnostic logic: Bethesda categorization, correlation discordance, AI redaction allowlist (`apps/api/src/modules/ai/redaction.ts` — has a spec), AI graceful degradation (never throws, 20s timeout). New clinical logic must ship characterization tests. Full clinical validation strategy is **Deferred / Unknown** and should be defined with clinical stakeholders.

### Financial correctness
Golden-case gross→net for **both** payroll engines (they diverge on PAYE base — characterize as-is before reconciling), tax rounding boundaries, price-snapshot immutability, payment idempotency, `integrityHash` lifecycle (stale after `updateAdvice`; edits allowed after approval). See RISK_REGISTER.md R-008.

### Portal
Client-portal and requisition-portal flows behind `PortalAuthGuard`: portal-scoped reads, change requests, digital requisition + card payment. End-to-end portal tests are **Deferred**; start with controller-integration on portal scoping.

### AI
Redaction (allowlist-by-construction, dates→intervals, sha256 provenance) and graceful degradation (`{available:false}` on failure/timeout). Redaction has a spec; extend to reporting metadata paths. The AI service must **never throw**.

### Smoke
Minimal "app boots, key routes respond" checks per environment. A dedicated smoke suite is **Deferred**.

### Production verification
Per CLAUDE.md, non-negotiable before shipping: `npx tsc --noEmit` clean; production build clean for substantial changes; drive the real flow headless (not just types); screenshot visual changes + run the orange/pixel detector. This is a manual gate today; automation is **Deferred**.

## Future CI strategy (Deferred — not implemented)

No CI pipeline is documented as present. Recommended future shape (do not build now): typecheck + unit on every push; integration (with a disposable Postgres + mocked gateways) on PR; security-regression suite required for merge to protected branches; production build + experience-budget + pixel-detector as release gates. Turborepo pipeline is noted in CLAUDE.md as a Phase-1 item — **Deferred**.

## Cross-cutting test infrastructure

- **Mocks required:** PowerTranz `fetch` (`/Api/spi/Sale`, `/Api/spi/payment`); `MailService.send` (MFA, lockout, impossible-travel). No live network in tests.
- **Secrets/env:** `JWT_SECRET`, `JWT_EXPIRES_IN`, `POWERTRANZ_ID/PASSWORD/BASE_URL/CALLBACK_URL`, `SESSION_IDLE_MINUTES`, `SESSION_MAX_HOURS`, `COOKIE_SECURE`, `NODE_ENV`, `EncryptionService` key, `DATABASE_URL` (integration/e2e suites `describe.skip` without it — silent non-coverage).
- **Nondeterminism to control:** freeze the clock (all TTL/lockout/session/tax-period logic uses `Date.now()`/`new Date()`); seed `randomUUID`/`randomBytes`/`randomInt`; TOTP is wall-clock based (generate codes from the same secret under a frozen clock); geo/IP inputs.
- **Fixtures:** lab/user/role seed helper; `Employee`+`Timesheet`+`ClockEvent`+`OvertimeRule` (payroll); `Bill`+`Record`+`Service`+`Tax` (billing); `RequisitionBatch`+forms (payments); `MfaConfig`/`MfaChallenge`, `UserSession`/`RefreshToken`, `AccountLock`/`LoginAttempt`/`BlockedIp` (security).

## Standing rules

- The two payroll engines must be **characterized as-is** before any reconciliation — "fixing" one silently changes net pay.
- Security/financial fixes ship with their regression test in the same checkpoint.
- Tests are additive and never combined with color migration, logging, or feature checkpoints.

---

## Related documents
- RISK_REGISTER.md (R-007 security coverage, R-008 financial coverage)
- SECURITY_ARCHITECTURE.md (auth/session/MFA/tenancy behavior under test)
- PERMISSION_MATRIX.md (route-level authorization tests)
- LOGGING_STANDARD.md (asserting log emission without behavior change)

## Future revisions
- Add the CI pipeline definition once one exists.
- Replace "stale auth e2e" note when the login-contract test is corrected.
- Define clinical-validation and portal-E2E strategies with stakeholders.

## Verification requirements
- Coverage claims must cite the actual spec path or be marked absent.
- Any refactor of money/security logic must be preceded by characterization tests.
- This document adds no tests; test work lands only in CP-5 (and per-fix regression specs).
