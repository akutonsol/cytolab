# Cytolab LIMS — QA Report

**Date:** 2026-07-05  **Engineer:** Senior QA (automated pass)  **Build:** branch `feat/theme-system`
**Environment:** API `localhost:4000/api/v1`, Web `localhost:3000` (dev servers, live demo DB — `cytolab` lab, 87 patients)

---

## 1. Executive Summary

The application is in **strong shape** for a pre-human-testing build. Across the phases executed,
**no CRITICAL and no code-level HIGH defects were found.** Security posture is notably mature
(HttpOnly cookie auth, Argon2id, progressive lockout, mass-assignment rejection, Prisma-parameterized
queries, Helmet headers, strict per-lab tenancy with **zero** null-`labId` rows across 98 models).
All 29 smoke-tested routes render cleanly.

The findings that exist are **configuration / production-hardening** items (secret strength, CORS
scope, an uncapped page size) plus two minor issues (a background 404 on `/specimens`, a stray
`console.log`). None block functional use.

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 1 (config: weak `JWT_PORTAL_SECRET`) |
| MEDIUM | 4 |
| LOW | 1 |

**Release recommendation: 🟡 CONDITIONAL GO** — cleared for internal/human QA now; the HIGH + MEDIUM
config items must be remediated before any production/PHI deployment (see §7).

---

## 2. Bug List (by severity)

### 🔴 CRITICAL
_None found._

### 🟠 HIGH

**QA-H1 — Weak `JWT_PORTAL_SECRET` (patient-portal token signing secret)**
- **Area:** API config (`apps/api/.env`) · Security / PHI
- **Observed:** `JWT_PORTAL_SECRET` is **16 characters**. The portal JWT protects external
  client/consultant access to lab data (PHI). A 16-char secret is below the ≥256-bit (32-byte)
  recommendation for token-signing keys.
- **Expected:** ≥32-byte high-entropy secret, unique per environment.
- **Repro:** `grep JWT_PORTAL_SECRET apps/api/.env` → length 16.
- **Fix:** Generate a 32-byte random secret (`openssl rand -hex 32`) for every non-dev environment;
  never ship the dev value. Confirm `JWT_SECRET` (currently 23 chars) is also rotated to ≥32 bytes.
- **Filed:** support ticket (see §8).

### 🟡 MEDIUM

**QA-M1 — Unbounded pagination `pageSize` accepted (bulk PHI pull / DoS vector)**
- **Observed:** `GET /patients?pageSize=999999` → **200** (returns unbounded page). `pageSize=-1`
  and `page=-1` are correctly rejected (400), but there is **no upper cap**.
- **Risk:** An authenticated user can pull an entire lab's PHI in one request; also a resource-
  exhaustion / DoS surface under load.
- **Fix:** Clamp `pageSize` to a max (e.g. 100–200) in the shared pagination DTO/pipe.

**QA-M2 — CORS reflects any origin with credentials**
- **Observed:** `apps/api/src/main.ts` → `app.enableCors({ origin: true, credentials: true })`.
  `origin: true` reflects the caller's Origin for **credentialed** CORS.
- **Risk:** In production this widens the CSRF / credential-theft surface. **Partially mitigated**
  today by `SameSite=Strict` auth cookies (cross-site requests won't send them).
- **Fix:** Restrict `origin` to an explicit allow-list of production web origins before deploy.

**QA-M3 — `/specimens` fires a failing background request (404)**
- **Observed:** Phase-1 smoke — `/specimens` logs one console error: `Failed to load resource: 404`.
  Page still renders (no error boundary, no uncaught error).
- **Fix:** Identify the 404 call on the specimens page (likely a stats/count endpoint whose route
  name drifted) and correct it or remove the call.

**QA-M4 — `JWT_SECRET` below recommended length**
- **Observed:** `JWT_SECRET` is 23 chars (< 32 bytes). Acceptable for dev, sub-standard for prod.
- **Fix:** rotate to ≥32-byte random secret in non-dev environments (bundle with QA-H1).

### 🟢 LOW

**QA-L1 — `console.log` in API bootstrap**
- **Observed:** `apps/api/src/main.ts:65` — `console.log('Cytolab API running…')`. Only occurrence in
  API `src`. Should use the NestJS `Logger` for consistent structured logging.

---

## 3. Performance Report (Phase 10)

API response times (superuser, warm) — **all far under target:**

| Endpoint | Target | Actual |
|----------|--------|--------|
| `GET /patients?pageSize=10` | <1s | **0.049s** |
| `GET /specimens?pageSize=10` | <1s | **0.015s** |
| `GET /patients?q=jane` (search) | <0.5s | **0.003s** |
| `GET /analytics/home` (dashboard) | <2s | **0.021s** |
| `GET /workforce/payroll/periods` | <1s | **0.004s** |

_All 29 routes rendered to `networkidle` within the 20s smoke budget. Full page-render timing and
the k6 stress ramp (Phase 11) were not executed — see §6._

---

## 4. Security Report (Phases 6 & 7)

| Test | Result | Status |
|------|--------|--------|
| Auth enforcement — GET protected routes w/o token | 401 (all) | ✅ |
| SQL injection — `?q='; DROP TABLE "Patient"; --` | 200, no SQL error, no 5xx (Prisma parameterized) | ✅ |
| Mass assignment — inject `labId` / `isSuperRole` in body | 400 (`ValidationPipe` `whitelist`+`forbidNonWhitelisted`) | ✅ |
| Tenancy — null `labId` across 98 lab-scoped models | 0 rows | ✅ |
| IDOR — GET unknown/foreign patient id | 404 (no data) | ✅ |
| CSRF — state-change POST w/o session cookie | 401 | ✅ |
| JWT tampering — corrupted signature / garbage bearer | 401 | ✅ |
| Param tampering — `pageSize=-1`, `page=-1` | 400 | ✅ |
| Param tampering — `pageSize=999999` | 200 (no cap) | ⚠️ QA-M1 |
| Privilege esc. — staff → `/security/*`, `/auth/login-attempts`, `/system/support/stats` API | 403 | ✅ |
| Privilege esc. — staff → `PATCH /lab-features/:key` (SuperuserGuard) | 403 | ✅ |
| Error responses leak stack traces | No (`{message,error,statusCode}` only) | ✅ |
| Helmet headers (CSP, HSTS, X-Frame-Options, nosniff) | Present | ✅ |
| Progressive account lockout (403 after repeated failures) | Confirmed (E2E auth suite) | ✅ |
| CORS scope | `origin: true` reflect-all | ⚠️ QA-M2 |

**Brute force / lockout** was confirmed in the committed E2E auth suite (`auth.spec.ts` — lock gate
returns 403 after repeated failures) rather than re-run here to avoid locking shared demo accounts.

---

## 5. Database Integrity (Phase 9)

- Tenant models scanned: **98** — rows with `null` labId: **0** ✅
- Duplicate patients (same name + DOB): **0 groups** ✅
- Orphaned specimens: **schema-impossible** (specimen→patient FK is required) ✅
- Migration status: **up to date** (55 migrations, no drift) ✅

---

## 6. Coverage — Phases Executed vs Deferred

**Executed (with evidence in this report):** Phase 1 (smoke, 29 routes) · Phase 6 (permissions) ·
Phase 7 (security, core) · Phase 9 (DB integrity) · Phase 10 (API perf) · Phase 22 (code quality) ·
Phase 23 (readiness, partial).

**Not executed in this automated pass** (require significant time / additional tooling — documented
here with repro so they can be run next):

| Phase | Why deferred | How to run |
|-------|--------------|-----------|
| 2 UI / 14 Responsive | 6-viewport screenshot sweep across all pages | Playwright `page.setViewportSize` matrix + screenshots |
| 3 Form fuzzing (full) | Per-field 10k/XSS/SQLi/unicode across 12 forms | Partially covered: `whitelist`+`forbidNonWhitelisted` + Prisma proven in §4 |
| 4 CRUD / 5 Workflow / 21 E2E cases | Full create→authorize→PDF flows (writes to shared demo DB) | Scripted API sequence per §Phase-21 |
| 11 Stress (k6) | 12-min ramp to 100 VUs; k6 not installed | `brew install k6 && k6 run apps/api/test/stress-test.js` |
| 12 Accessibility | axe-core not installed | `npm i -D @axe-core/playwright` + per-page `checkA11y` |
| 13 Safari/WebKit | webkit project not configured | add `{ name:'webkit', use: devices['Desktop Safari'] }` |
| 15 Print / 16 Export / 17 Notifications / 18 Recovery / 19 Audit-detail / 20 AI | Feature-flow verification | see phase specs |

**Recommendation:** the deferred phases are worth a dedicated follow-up run; nothing observed in the
executed phases suggests they will surface CRITICALs, but a11y (Phase 12) and the k6 ramp (Phase 11)
are the highest-value next steps for an enterprise release.

---

## 7. Production Readiness Checklist (Phase 23)

| # | Item | Status | Note |
|---|------|--------|------|
| 1 | No TODO/FIXME in prod code | ✅ | Only match is a test-file template string |
| 2 | No `console.log` in API | ⚠️ | 1 (bootstrap banner) — QA-L1 |
| 3 | No debug endpoints exposed | ✅ | none |
| 4 | No mock data in prod paths | ⚠️ | AI screening uses generated "mock findings" (demo stub, by design) |
| 5 | No test credentials hardcoded | ✅ | none in src |
| 6 | No hardcoded secrets | ✅ | secrets in env |
| 7 | ENCRYPTION_KEY set, not dev default | ✅⚠️ | set (64 hex); **verify it differs from any committed default before prod** |
| 8 | JWT_SECRET strong | ⚠️ | 23 chars — QA-M4 |
| 9 | JWT_PORTAL_SECRET strong | ❌ | 16 chars — **QA-H1** |
| 10 | CORS = production domain only | ❌ | `origin: true` — QA-M2 |
| 11 | Rate limiting active | ✅ | global 100/min + auth 5/min (verified) |
| 12 | Helmet headers active | ✅ | CSP/HSTS/X-Frame-Options/nosniff verified |
| 13 | All migrations applied | ✅ | up to date, no drift |
| 14 | Seed run for role config | ✅ | 5 roles present (Superuser + 4) |
| 15 | package-lock reconciled | ⚠️ | multiple parallel-window dep changes uncommitted at time of test |
| 16 | Append-only audit log at DB level | ❓ | AuditLog has `detail` field; DB-level UPDATE/DELETE revocation not verified |
| 17 | ENCRYPTION_KEY rotation plan | ❌ | not documented |
| 18 | Backup strategy | ❌ | not verified |
| 19 | No PHI in logs | ❓ | not exhaustively verified (Phase 19 deferred) |
| 20 | SSL/TLS for prod | ❌ | dev HTTP only (expected) |
| 21 | `next build` clean (88 pages) | ❓ | not run (expensive); dev server compiles clean, `tsc --noEmit` clean |
| 22 | E2E tests passing | ✅ | 57/63 pass, 6 env-skips, 0 fail (post route-guard fix) |
| 23 | — | | |

---

## 8. Release Recommendation

**🟡 CONDITIONAL GO.**

**Cleared for internal / human QA immediately** — core workflows, auth, tenancy, and security
controls are functioning; no data-loss, crash, PHI-exposure, or broken-auth defects were found.

**Before any production / PHI deployment, remediate:**
1. **QA-H1** — strong `JWT_PORTAL_SECRET` (and QA-M4 `JWT_SECRET`) ≥32 bytes, per-env.
2. **QA-M2** — restrict CORS to explicit production origins.
3. **QA-M1** — cap `pageSize`.
4. Confirm readiness ❌ items: CORS, secret rotation plan, backups, SSL/TLS, `next build`, audit-log
   append-only DB enforcement, and PHI-in-logs verification (Phase 19).

Filed as tickets: **QA-H1 → TKT-2026-0006** (HIGH, OPEN). Remaining MEDIUM/LOW items are documented
here per the "report, don't file below HIGH" convention.
