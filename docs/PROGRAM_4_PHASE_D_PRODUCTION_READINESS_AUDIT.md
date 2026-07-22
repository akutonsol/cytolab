# Program 4 · Phase D — Production Readiness Audit

> **⚠️ HISTORICAL — SUPERSEDED (Program 4 closeout, D-6, 2026-07-22).** This audit is preserved
> unchanged as the point-in-time record from **2026-07-21**, before the D-1 hardening and D-2A/D-2B
> foundation work landed. Its findings below reflect that earlier state and are **no longer current**.
> For the reconciled status see **`PROGRAM_4_COMPLETION_REPORT.md`** (readiness verdict) and
> **Appendix A** at the foot of this document (per-item remediation status as of D-6). The original
> findings are **not rewritten** — only the appendix and this banner are added.

**Status:** Historical (audit) — superseded by the Completion Report · **Date:** 2026-07-21 · **Owner:** platform
**Authorization:** read-only production-readiness audit. **No code modified, nothing staged, nothing
committed.** Report only. (The remediation it recommended subsequently shipped — see Appendix A.)
**Scope:** Osieri platform (`apps/api` NestJS, `apps/web` Next.js 14) → GCP Cloud Run + Cloud SQL.
**Companions:** `docs/architecture/TARGET_PLATFORM_ARCHITECTURE.md`, `docs/deploy/DEPLOYMENT.md`,
`docs/deploy/CYTOLABS_ACCOUNT_PROVISIONING.md`, `docs/migration/CUTOVER_RUNBOOK.md`.

---

## 1. Executive summary

The platform has a **strong security and observability foundation** and is **containerized and
deployable** (Phase A). The application layer is largely production-grade: fail-hard secret/DB-TLS
validation, Helmet CSP/HSTS, allow-listed credentialed CORS, global + per-route rate limiting,
argon2 password hashing, hardened auth cookies, transparent PHI field encryption (AES-256-GCM), a
tamper-evident audit chain with an integrity monitor, fail-closed multi-tenant isolation, structured
Pino logging, and Sentry wiring.

What's **not yet done is the operational plumbing to run it in production**: graceful shutdown for
Cloud Run, Swagger exposure gating, container non-root hardening, Cloud SQL connection-pool sizing,
Secret Manager wiring, CI/CD activation, and the prod-DB migration baseline. None are architectural
— they are finite, well-understood remediation items.

**Verdict: CONDITIONAL GO.** Safe to deploy **after** the High-severity items (§5) are cleared; the
Critical items are process steps already covered by the cutover runbook.

## 2. Deployment readiness score

**78 / 100 — "Ready with conditions."**

| Dimension | Score | Note |
|---|---|---|
| Security (app) | 90 | Excellent fundamentals; gate Swagger, non-root container |
| Database | 70 | migrate-deploy fixed; needs prod baseline + pool sizing |
| Observability | 80 | Pino + Sentry + audit monitor; no ops `/metrics`, no health probe |
| Operations | 65 | No graceful shutdown; runbook exists; DR/restore unproven |
| Infrastructure / GCP | 72 | Containers build; Secret Manager + CI/CD + IAM not wired |
| CI/CD | 60 | Pipeline scaffolded (`if: false`); needs secrets + WIF |

## 3. Strengths (verified in code)

- **Startup safety** (`main.ts`): fails hard if `JWT_SECRET`/`JWT_PORTAL_SECRET` < 32 chars; **fails
  hard in production if `DATABASE_URL` lacks `sslmode=require`** (PHI-in-transit).
- **Security headers**: Helmet with strict CSP, HSTS (1y, includeSubDomains), `frameguard: deny`,
  `noSniff`, referrer policy.
- **CORS**: credentialed, restricted to an explicit `ALLOWED_ORIGINS` allow-list (no origin
  reflection).
- **Rate limiting**: global `ThrottlerGuard` (100/min) + tight per-route `@Throttle` (login/refresh
  5/min, portal 30–60/min).
- **Auth**: argon2 hashing; **HttpOnly + SameSite=strict + Secure** cookies (`session.service.ts`);
  short access (15m) + refresh rotation; MFA/session/lockout modules present.
- **PHI**: transparent field encryption extension (AES-256-GCM), `ENCRYPTION_KEY` fail-hard.
- **Tenancy**: `labId` fail-closed via `LabContext` + Prisma extension (verified in Program-3 tests).
- **Audit**: tamper-evident hash chain + startup integrity monitor (`AuditIntegrityMonitorService`).
- **Migrations**: `prisma migrate deploy` from empty now applies cleanly (ordering bug fixed, `c6a8ddd`).
- **Backups**: Cloud SQL automated backups enabled at provisioning **and** an app-level encrypted
  snapshot service (`backup.service.ts`, GCS/Sheets, ADC-based, cron).
- **Config docs**: `.env.example` (35 vars) present.

## 4. Findings by review area

Legend: ✅ ready · ⚠️ gap/needs work · ❌ missing/blocker.

### Infrastructure
- ✅ Docker images (web + api) build; web serves 200. Compose for local infra + silo preview.
- ⚠️ **API image ~2.23 GB** — copies full monorepo `node_modules`; slim (prune to prod deps) for
  faster deploys/cold starts. (Medium)
- ⚠️ **Containers run as root** — Dockerfiles set no `USER`; add a non-root user. (High, security)
- ✅ `.env.example` documents required vars; secrets never committed (`.dockerignore`/`.gitignore`).
- ❌ **Secret Manager not wired** — prod secrets still env-based; must source `DATABASE_URL`, JWT,
  `ENCRYPTION_KEY`, etc. from Secret Manager. (Critical)

### Security
- ✅ Helmet/CSP/HSTS, CORS allow-list, throttling, argon2, hardened cookies, PHI encryption (see §3).
- ⚠️ **Swagger exposed unconditionally** — `SwaggerModule.setup('api/v1/docs')` has no `NODE_ENV`
  gate; the full API surface is served in production. Gate to non-prod or auth. (High, info-disclosure)
- ⚠️ No CSRF token — mitigated by SameSite=strict cookies + CORS allow-list; acceptable, document
  the decision. (Low)

### Database
- ✅ Migrations apply cleanly from empty (ordering bug fixed).
- ❌ **Prod DB (`pathos_prod`) not migration-baselined** — it was built via `migrate diff` DDL, so
  `_prisma_migrations` is empty; the app can't manage migrations until baselined (or rebuilt via
  `migrate deploy`). Handled by the cutover runbook, but a prerequisite. (Critical → process)
- ⚠️ **Connection pooling unsized for Cloud Run** — `PrismaService` uses default pool; N autoscaled
  instances × default pool can exhaust Cloud SQL `max_connections`. Set `connection_limit` in the
  URL or front with PgBouncer/Cloud SQL connector pooling. (High)
- ✅ Indexes present on hot paths (`labId`, status, dates — reviewed in schema).

### Observability
- ✅ Structured Pino logging (JSON in prod); Sentry (`instrument.ts`, no-op without `SENTRY_DSN`).
- ✅ Tamper-evident audit chain + integrity monitor.
- ⚠️ **No ops metrics endpoint** (`/metrics`) — rely on Cloud Run/Cloud Monitoring built-ins; add
  `prom-client` if you want app-level SLOs. (Medium)
- ⚠️ **No alerting wired** — Sentry present but alert routing/thresholds + Cloud Monitoring alerts
  (5xx, latency, DB CPU/conns) not configured. (Medium)

### Operations
- ❌ **No graceful shutdown** — `app.enableShutdownHooks()` is never called, so Cloud Run's SIGTERM
  won't trigger `PrismaService.onModuleDestroy` (clean disconnect / drain in-flight). (High)
- ⚠️ **No dedicated liveness/readiness endpoint** — Cloud Run's default port probe works, but a
  cheap unauthenticated `/healthz` (+ readiness that checks DB) is best practice (and needed for an
  LB health check). `system-health` is superuser-gated, not a probe. (Medium)
- ⚠️ **DR/restore unproven** — backups exist; a restore drill (Cloud SQL PITR + app snapshot) has
  not been rehearsed. (Medium)
- ✅ Cutover + rollback runbook exists (`CUTOVER_RUNBOOK.md`).

### GCP readiness
- ✅ Cloud SQL `pathos-prod` provisioned; automated backups on.
- ❌ Artifact Registry, Cloud Run services, Secret Manager, IAM/WIF, LB + managed SSL, DNS — **not
  yet created** (per the provisioning checklist). (Critical for go-live)
- ⚠️ Custom-domain routing + managed SSL: designed, not implemented (cutover step). (High)

### CI/CD
- ⚠️ **Pipeline scaffolded but inert** — `.github/workflows/deploy.yml` deploy job guarded by
  `if: false`; needs repo secrets/vars (project, WIF provider, deploy SA, Cloud SQL instance,
  DB secret) before it can ship. Build/test job is live. (High)

## 5. Blocker list (by severity)

**Critical (must be resolved for any production go-live):**
1. **Provision the GCP runtime** — Artifact Registry, Cloud Run (api/web + migrate job), IAM/WIF, LB
   + managed SSL, DNS (per `CYTOLABS_ACCOUNT_PROVISIONING.md`).
2. **Secret Manager wiring** — move `DATABASE_URL`, `JWT_SECRET`, `JWT_PORTAL_SECRET`,
   `ENCRYPTION_KEY`, `STORAGE_BUCKET`, `ALLOWED_ORIGINS` into Secret Manager; inject at runtime.
3. **Prod DB migration baseline** — rebuild `pathos_prod` via `migrate deploy` (or baseline
   `_prisma_migrations`) so the app owns the migration state. (Covered by the cutover runbook.)

**High (resolve before go-live):**
4. **Graceful shutdown** — call `app.enableShutdownHooks()`; ensure Prisma disconnect + request drain.
5. **Gate Swagger** — only mount `/api/v1/docs` when `NODE_ENV !== 'production'` (or behind auth).
6. **Non-root container** — add a `USER` to both Dockerfiles.
7. **Cloud SQL connection pooling** — set `connection_limit`/pooling for Cloud Run autoscale.
8. **Activate CI/CD** — wire secrets/WIF, flip the deploy job on; deploy same image to demo → prod.
9. **Custom-domain routing + managed SSL** — LB path-routing (`/api/v1`→api) + Google-managed cert.

**Medium:**
10. Add a cheap unauthenticated `/healthz` (+ DB readiness). 
11. Slim the API image (prod deps only / multi-stage prune).
12. Wire alerting (Sentry alert rules + Cloud Monitoring: 5xx, latency, DB conns/CPU).
13. Rehearse a DR restore (Cloud SQL PITR + app snapshot).
14. Consider `/metrics` (prom-client) for app-level SLOs.

**Low:**
15. Document the CSRF posture (SameSite=strict + CORS allow-list as the mitigation).
16. Verify `.env.example` lists every required prod var (STORAGE_BUCKET, SENTRY_DSN, BACKUP_SHEET_ID…).
17. Add `compression` if payloads warrant (Cloud Run/LB may handle it).

## 6. Remediation roadmap

**Sprint D-1 — app hardening (code; ~1–2 days):** #4 shutdown hooks, #5 Swagger gate, #6 non-root
containers, #7 pooling config, #10 `/healthz`, #11 slim image, #15/#16 docs. All small, testable
changes — each its own scoped checkpoint under this governance model.

**Sprint D-2 — cloud provisioning (infra; gated on the CytoLabs/target account):** #1 runtime, #2
Secret Manager, #8 CI/CD activation, #9 domain + SSL, #12 alerting.

**Sprint D-3 — cutover dress rehearsal:** #3 DB baseline via `migrate deploy`, #13 DR restore drill,
end-to-end deploy to a staging/demo target, smoke test, then production cutover per the runbook.

## 7. Go / No-Go recommendation

**CONDITIONAL GO.**

- **GO** once **Sprint D-1** (app hardening: shutdown, Swagger gate, non-root, pooling, healthz) and
  **Sprint D-2** (runtime + Secret Manager + CI/CD + domain/SSL) are complete.
- The **Critical** items are provisioning/process steps (not code defects) and are covered by the
  provisioning + cutover runbooks.
- **No architectural blocker exists.** The security/tenancy/PHI/audit foundation is production-grade;
  the remaining work is finite operational hardening + cloud plumbing.

**Recommended next governance action:** authorize **Sprint D-1 (application hardening)** as a scoped
implementation checkpoint — the highest-value, code-only, fully-testable slice — before the
account-gated infra work.

## 8. Governance

Read-only audit: nothing created besides this document; no production/schema/migration/config change;
nothing staged or committed. Implementation remains blocked pending review of this audit. Any
remediation proceeds only under a separate, explicitly-authorized checkpoint.

---

## Appendix A — Remediation status as of Program 4 closeout (D-6, 2026-07-22)

Added at closeout; the audit body above is unchanged. Each blocker from §5/§4–§6 is mapped to its
current state, verified against the code/config that landed in D-1 and D-2A/D-2B. Deferred items are
carried in `PROGRAM_4_DEFERRED_ITEM_REGISTER.md` (§ references below).

**DONE (D-1 application hardening — code, verified):**
- Graceful shutdown for Cloud Run — `app.enableShutdownHooks()` + bounded SIGTERM/SIGINT watchdog (`apps/api/src/main.ts`).
- Swagger gated to non-prod — mounted only when `SWAGGER_ENABLED==='true'` or `NODE_ENV!=='production'` (`main.ts`).
- Non-root containers — `USER node` in both `apps/api/Dockerfile` and `apps/web/Dockerfile`.
- Cloud SQL connection pooling — `poolDatasourceOptions()` (`connection_limit`/`pool_timeout`) in `prisma.service.ts` (sizing value TBD, Register §E).
- Liveness/readiness — `@Public()` `/health` + `/health/ready` (`SELECT 1`, 503 on DB failure) in `health.controller.ts`.
- Slim API image — multi-stage `prod-deps` (`npm ci --omit=dev`) in `apps/api/Dockerfile`.

**PARTIAL (foundation applied; runtime/values pending):**
- GCP provisioning — Artifact Registry, service accounts, IAM, enabled APIs applied in `osieri-prod-9317`; Cloud Run/SQL are placeholder shells / default-off skeletons; no LB/SSL/DNS yet (Register §E).
- Secret Manager — 11 empty containers + accessor IAM created; values/rotation not yet set (Register §E).
- CI/CD — `deploy.yml` build+test job live; deploy job `if: false` pending secrets/WIF (Register §E).

**OPEN / cutover-time (Register §E–§F):**
- Prod-DB migration baseline (`migrate deploy`) — cutover-time; needs the prod Cloud SQL instance.
- Custom-domain routing + managed SSL — blocked on the external DNS dependency (`osieri.com`).
- Alerting/APM, backup/DR + restore drills, `/metrics` — deferred to the infra/observability track.

**Net:** every code-only D-1 blocker is cleared; the remainder is account-gated infrastructure and the
external DNS dependency, consistent with this audit's original "CONDITIONAL GO." See
`PROGRAM_4_COMPLETION_REPORT.md` §13 for the readiness verdict.
