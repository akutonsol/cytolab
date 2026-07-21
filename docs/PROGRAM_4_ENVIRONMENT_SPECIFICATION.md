# Program 4 · Environment Specification

**Status:** DRAFT — awaiting architectural review (not yet a frozen baseline)
**Checkpoint:** Program 4 · Environment Specification (read-only documentation)
**Date:** 2026-07-21
**Owner:** Osieri platform / deployment (individual owner TBD)
**Governance:** This document, once reviewed and frozen, becomes the **immutable deployment
baseline** that Phase D-2 (infrastructure provisioning) and Phase D-3 (deployment rehearsal &
cutover) must follow. It records **only established facts**; every undecided value is marked
**`TBD`**. It infers no cloud configuration and changes no code, infrastructure, or deployment.

**Source-of-truth inputs** (facts below are traced to these):
`docs/architecture/TARGET_PLATFORM_ARCHITECTURE.md` ·
`docs/architecture/HYBRID_TENANCY_AND_CUSTOM_DOMAINS.md` ·
`docs/deploy/DEPLOYMENT.md` · `docs/deploy/CYTOLABS_ACCOUNT_PROVISIONING.md` ·
`docs/migration/CUTOVER_RUNBOOK.md` · `docs/architecture/PRODUCTION_READINESS_CHECKLIST.md` ·
`.github/workflows/deploy.yml` · `apps/api/Dockerfile` · `apps/web/Dockerfile` ·
`apps/api/.env.example` · Program 4 · Phase D-1 hardening (`1fe5d28`).

---

## 1. Executive Summary

### Deployment objectives
Stand up Osieri as a cloud-hosted, multi-tenant SaaS with three deployment shapes served from **one
codebase and one container image per app** (`apps/api`, `apps/web`): a **demo** showcase, a **pooled
production** deployment (many labs, one DB, `labId`-isolated), and physically-isolated **silo** labs
(CytoLabs first, in its own account/DB/domain). A single release pipeline deploys the same image to
every target so all environments stay on the same code (TARGET_PLATFORM_ARCHITECTURE §1, §4).

### Environment philosophy
- **One image, many environments.** The codebase is the single source of truth; the demo is a
  *showcase of the latest build*, not a master that pushes updates. Updates propagate because the
  pipeline redeploys the same image to every target.
- **Record facts or mark TBD.** No cloud value is invented here; anything not yet decided is `TBD`
  and appears in §11 as a blocking decision if it gates Phase D-2.
- **Governance-frozen baseline.** Deployment decisions are frozen in this document *before*
  infrastructure work begins, preventing configuration drift across D-2/D-3.

### Supported environments
| Env | Established? | Notes |
|---|---|---|
| **Development** (local) | ✅ Established | Docker Compose, local Postgres/MailHog/Redis. |
| **Demo** | ✅ Named (`demo.osieri.com`) | Demo/seed data only, never real PHI. |
| **Pooled Production** | ✅ Named (`app.osieri.com`) | Real PHI, many labs, one shared DB. |
| **Silo — CytoLabs** | ✅ Named (`cytologylab.com`) | Own GCP account/DB/domain; account-gated. |
| **Staging** (pre-prod) | ⛔ `TBD` | Not defined. The release pipeline matrix is currently `[demo, prod]` only — no dedicated staging env exists. Decision required (§11). |

### Document ownership
Owned by Osieri platform/deployment. Individual accountable owner: **`TBD`**. This document is
authoritative for deployment configuration once frozen; changes to a frozen baseline require a new
governance checkpoint.

---

## 2. Environment Matrix

Legend: ✅ established fact · ⛔ `TBD` (not yet decided).

### Development (local)
| Attribute | Value | Source |
|---|---|---|
| Purpose | Local dev + local container smoke-test | Established |
| GCP project | N/A (local) | — |
| Region | N/A | — |
| Runtime | Docker Compose; `docker run` smoke-test of both images | DEPLOYMENT.md |
| Database | Local Postgres `cytolab:cytolab@localhost:5432/cytolab` | .env.example |
| Artifact Registry | N/A | — |
| Secret Manager | N/A (`.env` file, dev values) | .env.example |
| Networking | localhost; web :3000, api :4000 | .env.example |
| Scaling | N/A | — |

### Demo
| Attribute | Value | Source |
|---|---|---|
| Purpose | Sales demos + QA of the latest build | TARGET_PLATFORM §1 |
| GCP project | ⛔ `TBD` | — |
| Region | ⛔ `TBD` (candidate `us-central1`, see note) | — |
| Cloud Run services | `osieri-api`, `osieri-web` (+ `osieri-migrate` job) | DEPLOYMENT.md |
| Cloud SQL instance | ⛔ `TBD` (demo/seed data, never PHI) | — |
| Artifact Registry | repo `osieri` (per project) | deploy.yml |
| Secret Manager | Demo-scoped secrets (§6) | — |
| Networking | HTTPS LB, path-route `/api/v1/*`→API else→web; managed SSL for `demo.osieri.com` | DEPLOYMENT.md |
| Scaling profile | ⛔ `TBD` (min/max instances, CPU/mem) | — |
| Cost note | User goal: host demo with **no monthly fees** (Render+Neon considered) — may diverge from Cloud Run. Decision required (§11). | memory / prior discussion |

### Pooled Production
| Attribute | Value | Source |
|---|---|---|
| Purpose | Most labs — shared deployment + shared DB, isolated by `labId` | TARGET_PLATFORM §1 |
| GCP project | ⛔ `TBD` (see note on `compact-surfer-318619`) | — |
| Region | `us-central1` (existing migrated DB) — confirm as launch region | CUTOVER_RUNBOOK |
| Cloud Run services | `osieri-api`, `osieri-web` (+ `osieri-migrate` job) | DEPLOYMENT.md |
| Cloud SQL instance | Migrated DB exists: `compact-surfer-318619:us-central1:pathos-prod`, database `pathos_prod`, user `postgres`. **Role-at-launch is an open decision** (launch-prod vs. migration-staging; optional recreate as `osieri-prod`). | CUTOVER_RUNBOOK |
| Artifact Registry | repo `osieri` | deploy.yml |
| Secret Manager | Prod secrets incl. `DATABASE_URL` via Cloud SQL connector | DEPLOYMENT.md |
| Networking | HTTPS LB, path routing; managed SSL for `app.osieri.com` (+ per-lab subdomains) | DEPLOYMENT.md, TARGET_PLATFORM §1 |
| Scaling profile | ⛔ `TBD` | — |

> **Note on `compact-surfer-318619` / `pathos-prod`:** this instance already holds the fully-migrated,
> reconciled dataset (29,099 patients / 32,448 records / 150,416 result lines). Whether it becomes the
> launch pooled-prod database or is recreated as a clean `osieri-prod` (runbook post-cutover, optional)
> is **undecided** — see §11. The `pathos-*` names are internal infra labels; end users never see them.

### Silo — CytoLabs
| Attribute | Value | Source |
|---|---|---|
| Purpose | Physically-isolated lab (flagship) — own account/DB/app/domain | TARGET_PLATFORM §5, HYBRID §2 |
| GCP project | ⛔ `TBD` (candidate name `cytolabs-prod`; **owned by CytoLabs**, account-gated) | CYTOLABS_ACCOUNT_PROVISIONING |
| Region | ⛔ `TBD` | — |
| Cloud Run services | `osieri-api`, `osieri-web` (+ `osieri-migrate` job) | CYTOLABS_ACCOUNT_PROVISIONING |
| Cloud SQL instance | ⛔ `TBD` (candidate `osieri-prod`, Postgres 16, DB `osieri`) | CYTOLABS_ACCOUNT_PROVISIONING |
| Artifact Registry | repo `osieri` (in CytoLabs' project) | CYTOLABS_ACCOUNT_PROVISIONING |
| Secret Manager | Silo secrets in CytoLabs' project; control plane holds only a `databaseSecretRef` | HYBRID §3 |
| Networking | HTTPS LB + Google-managed SSL for `cytologylab.com`; path routing | CYTOLABS_ACCOUNT_PROVISIONING |
| Scaling profile | ⛔ `TBD` | — |
| App-host decision | **Own account + own app deployment** (max isolation; updates via pipeline). Cloud Run vs VM still to **confirm**. | TARGET_PLATFORM §5, CYTOLABS §"still need" |
| Control-plane registration | `Lab.tenancyMode = SILO`, `databaseSecretRef`, `LabDomain(cytologylab.com)`; `LabFeature` stays on the pool/control-plane DB | HYBRID §3, TARGET_PLATFORM §3 |

---

## 3. Naming Standards

Established conventions (from the pipeline scaffold, Dockerfiles, and provisioning docs). Where a
concrete name is not yet chosen, the **convention** is recorded and the **value** is `TBD`.

| Resource | Convention / established value | Status |
|---|---|---|
| GCP projects | Per-target project; candidates: demo `TBD`, pooled-prod `compact-surfer-318619` (existing, role TBD), silo `cytolabs-prod` (CytoLabs-owned) | Partial |
| Cloud Run — API | `osieri-api` | ✅ Established (deploy.yml, DEPLOYMENT.md) |
| Cloud Run — Web | `osieri-web` | ✅ Established |
| Cloud Run — migrate job | `osieri-migrate` (runs `prisma migrate deploy`) | ✅ Established |
| Cloud SQL instance | infra-label convention `*-prod` (existing `pathos-prod`; silo candidate `osieri-prod`) | Partial |
| Cloud SQL database | `pathos_prod` (existing) / `osieri` (silo candidate) | Partial |
| Artifact Registry repo | `osieri` | ✅ Established |
| Image paths | `<region>-docker.pkg.dev/<project>/osieri/api:<sha>` and `/web:<sha>` | ✅ Established (deploy.yml) |
| Image tags | `${{ github.sha }}` (commit SHA per build) | ✅ Established |
| GCS buckets (uploads) | ⛔ `TBD` (per-env bucket; `STORAGE_BUCKET` env) | .env.example |
| VPC connectors | ⛔ `TBD` (not defined) | — |
| Service accounts | deploy SA + runtime SA (names `TBD`) | Partial |
| Pub/Sub topics | N/A — no Pub/Sub in current architecture; cross-account silo channel transport is `TBD` | — |
| Domains | `demo.osieri.com`, `app.osieri.com` (+ per-lab subdomains), `cytologylab.com` | ✅ Established |

---

## 4. Networking

| Aspect | Decision | Status | Source |
|---|---|---|---|
| Load balancer strategy | One HTTPS LB per environment, both Cloud Run services behind it | ✅ Established | DEPLOYMENT.md |
| Path routing | `/api/v1/*` → API; everything else → web (LB routes `/api/v1` in prod; the Next rewrite is dev-only) | ✅ Established | DEPLOYMENT.md |
| HTTPS/TLS | HTTPS-only via the LB | ✅ Established | DEPLOYMENT.md |
| Managed certificates | Google-managed SSL per environment domain | ✅ Established | DEPLOYMENT.md, CYTOLABS |
| DNS ownership | `osieri.com` — **platform-owned** (registrar/zone `TBD`); `cytologylab.com` — **CytoLabs-owned** | Partial | TARGET_PLATFORM, CYTOLABS |
| Custom-domain resolution | Host→lab via `LabDomain` (globally-unique hostname); registry-driven CORS replaces static `ALLOWED_ORIGINS` | ✅ Designed / ⛔ build deferred | HYBRID §5 |
| Ingress policy | Cloud Run `--allow-unauthenticated` (public app; auth enforced in-app via JWT guards). Fronting via LB. | ✅ Established (scaffold) | deploy.yml |
| Egress policy | ⛔ `TBD` (VPC connector / egress controls not defined) | — | — |
| Cross-account silo channel | Control-plane↔silo link (telemetry + feature flags); **pull vs push undecided**; transport `TBD` | ⛔ `TBD` | TARGET_PLATFORM §6, CYTOLABS §7 |

---

## 5. Identity & IAM

Established principles and roles; concrete service-account identities and bindings are `TBD` (not to
be invented here).

| Aspect | Decision | Status | Source |
|---|---|---|---|
| Deployment identity (CI) | **Workload Identity Federation recommended** (`id-token: write`); alternative deploy SA key | ✅ Established (recommended) | deploy.yml, DEPLOYMENT.md |
| Deploy SA | `GCP_DEPLOY_SA` (secret); concrete identity `TBD` | Partial | deploy.yml |
| WIF provider | `GCP_WORKLOAD_IDENTITY_PROVIDER` (secret); concrete provider `TBD` | Partial | deploy.yml |
| Runtime identity (Cloud Run) | Dedicated runtime SA per service; needs Secret Manager accessor + Cloud SQL client + GCS access. Concrete SA + bindings `TBD` | Partial | DEPLOYMENT.md, CYTOLABS |
| Least-privilege principle | Runtime SA gets only accessor/client roles; deploy SA scoped to deploy roles | ✅ Principle stated | CYTOLABS |
| CytoLabs IAM (silo) | You receive IAM in CytoLabs' account to deploy/maintain (Cloud Run Admin, Cloud SQL Admin, Artifact Registry Admin, Secret Manager Admin, Service Account User) — **account-gated** | ✅ Listed / ⛔ not granted | CYTOLABS §1 |
| Role assignments (concrete) | **Not decided — not invented here** | ⛔ `TBD` | — |

---

## 6. Secret Inventory

Every runtime secret from `apps/api/.env.example`. **Source at launch = GCP Secret Manager** (per
DEPLOYMENT.md / CYTOLABS); values are environment-specific and `TBD`. Rotation policy is **not yet
formalized** (PRODUCTION_READINESS_CHECKLIST: "rotation process Unknown").

| Secret | Purpose | Source (launch) | Fail-hard? | Rotation | Notes |
|---|---|---|---|---|---|
| `DATABASE_URL` | Runtime DB connection (`sslmode=require` in prod) | Secret Manager | Yes — SSL required at boot | `TBD` | Via Cloud SQL connector |
| `DATABASE_MIGRATION_URL` | Privileged migrate connection (`osieri-migrate` job) | Secret Manager | — | `TBD` | Separate privileged user |
| `JWT_SECRET` | Staff access token signing (≥32 chars) | Secret Manager | Yes — refuses boot if <32 | `TBD` | |
| `JWT_REFRESH_SECRET` | Staff refresh token signing | Secret Manager | — | `TBD` | |
| `JWT_PORTAL_SECRET` | Client-portal access token (≥32 chars, separate) | Secret Manager | Yes — refuses boot if <32 | `TBD` | Never cross-verifiable with staff |
| `JWT_PORTAL_REFRESH_SECRET` | Portal refresh token signing | Secret Manager | — | `TBD` | |
| `ENCRYPTION_KEY` | PHI AES-256-GCM (64 hex chars) | Secret Manager | Yes — refuses boot if missing/malformed | **Manual re-encrypt** (no in-place rotation) | See SECURITY.md |
| `ANTHROPIC_API_KEY` | AI-assisted reporting (optional) | Secret Manager | No — graceful degradation | `TBD` | Off per-lab by default |
| `STORAGE_BUCKET` | GCS uploads bucket | Config/Secret Manager | No — falls back to DB base64 | N/A | Per-env bucket `TBD` |
| `BACKUP_SHEET_ID` | Google Sheets backup target (optional) | Config | No — backup skipped if unset | N/A | |
| `POWERTRANZ_ID` / `POWERTRANZ_PASSWORD` | Card-payment gateway (optional) | Secret Manager | No — card payments disabled if unset | `TBD` | JMD (388) |
| `REDIS_URL` | Sessions/cache | Config/Secret Manager | ⛔ prod requirement `TBD` (managed Memorystore?) | `TBD` | Optional in dev |
| `SMTP_HOST/PORT/FROM` | Mail | Config | No (dev MailHog) | N/A | Prod mail provider `TBD` |
| `ALLOWED_ORIGINS` | CORS allow-list | Config | — | N/A | Becomes registry-driven for custom domains (HYBRID §5) |
| `COOKIE_SECURE` | Force Secure cookie flag | Config | Auto-on when `NODE_ENV=production` | N/A | |
| GCS runtime credentials | Object storage access | ADC / runtime SA | — | N/A | GCP uses ADC |

Non-secret runtime knobs (config, not secrets): `NODE_ENV`, `PORT`, `API_PREFIX`, `SWAGGER_ENABLED`
(off in prod), `SHUTDOWN_TIMEOUT_MS` (default 10000), `DATABASE_CONNECTION_LIMIT`,
`DATABASE_POOL_TIMEOUT`, session/JWT expiries, `PORTAL_WEB_URL`, `POWERTRANZ_BASE_URL`/`CALLBACK_URL`.

---

## 7. Database

| Aspect | Decision | Status | Source |
|---|---|---|---|
| Engine | Cloud SQL for PostgreSQL | ✅ Established | DEPLOYMENT.md, CYTOLABS |
| Version | Existing prod: `TBD` (unrecorded); silo candidate **Postgres 16** | Partial | CYTOLABS §2 |
| Topology (pooled) | One shared instance/DB; all labs isolated by `labId` | ✅ Established | TARGET_PLATFORM §2 |
| Topology (silo) | Database-per-tenant — dedicated DB (ideally own instance) per silo lab | ✅ Established | HYBRID §2 |
| Existing prod instance | `compact-surfer-318619:us-central1:pathos-prod` / DB `pathos_prod` / user `postgres` — role-at-launch `TBD` | Partial | CUTOVER_RUNBOOK |
| Migration strategy | `prisma migrate deploy` (all 64 migrations, clean from empty; ordering bug fixed) run as the `osieri-migrate` Cloud Run job **before** rolling the API. `db push` and `migrate dev` banned in prod. **Forward-only.** | ✅ Established | DEPLOYMENT.md, CUTOVER_RUNBOOK, CLAUDE.md |
| N-way migrations (silos) | Every schema change runs against pool **and each silo DB**; a registry-iterating runner + deploy gating is **required but not built** | ⛔ `TBD` (build) | HYBRID §6 |
| Connection pooling | Per-instance pool via `DATABASE_CONNECTION_LIMIT` (+ `DATABASE_POOL_TIMEOUT`); size so `(max instances × limit) < max_connections`. Unset = Prisma default. | ✅ Established (D-1) | .env.example, DEPLOYMENT.md |
| Backup strategy | Cloud SQL automated backups assumed but **policy/schedule not defined**; app-level backup module Partial/Unknown | ⛔ `TBD` | PROD_READINESS "Backups" |
| Restore expectations | **Restore drills Unknown; RTO/RPO undefined** | ⛔ `TBD` | PROD_READINESS "DR/Backups" |
| Encryption at rest | Cloud SQL default at-rest encryption assumed; app-level AES-256-GCM for PHI fields Implemented; storage-level confirmation `TBD` | Partial | PROD_READINESS "HIPAA" |
| SSL | `sslmode=require` enforced fail-hard at boot in prod | ✅ Established | .env.example |

---

## 8. Deployment Architecture

| Stage | Decision | Status | Source |
|---|---|---|---|
| Container build | Two images from **repo-root context**: `apps/api/Dockerfile`, `apps/web/Dockerfile`. Multi-stage; API has a `prod-deps` stage (`npm ci --omit=dev` + `prisma generate`); both run **non-root `node`**; `$PORT` honored | ✅ Established (D-1) | Dockerfiles |
| Image registry | Artifact Registry repo `osieri`; images `api:<sha>` / `web:<sha>` | ✅ Established | deploy.yml |
| Deploy runtime | Cloud Run (recommended host): `osieri-api`, `osieri-web`, `--allow-unauthenticated`, `--set-cloudsql-instances`, `--set-secrets` | ✅ Established (scaffold) | deploy.yml, DEPLOYMENT.md |
| Migration sequence | `osieri-migrate` job runs `prisma migrate deploy` **before** the API rolls | ✅ Established | deploy.yml, DEPLOYMENT.md |
| Deploy order (per env) | migrate → API → Web | ✅ Established | deploy.yml |
| Multi-target fan-out | Same image deployed to demo + pooled prod + each silo (silo = another matrix entry / second workflow with that account's creds) | ✅ Established (design) | TARGET_PLATFORM §4, deploy.yml |
| Rollback strategy | Code: revert commit (isolated checkpoints). Data: keep legacy read-only ≥1 week, revert DNS if needed; full ETL load idempotent (~2 min). **Migration down/rollback policy Unknown (forward-only).** Image-level Cloud Run revision rollback `TBD` | Partial | CUTOVER_RUNBOOK §8, PROD_READINESS "Rollback" |

---

## 9. CI/CD

| Aspect | Decision | Status | Source |
|---|---|---|---|
| Platform | GitHub Actions — `.github/workflows/deploy.yml` (name `release`) | ✅ Established (scaffold) | deploy.yml |
| Repository | This monorepo (npm workspaces) | ✅ Established | — |
| Trigger strategy | `push` to `main` + `workflow_dispatch`; build+test always, **deploy job gated `if: false`** until secrets/vars set | ✅ Established | deploy.yml |
| Build/test job | `npm ci` → typecheck → `prisma generate` + API build → web prod build (container build deferred to deploy so untested code never ships) | ✅ Established | deploy.yml |
| Deployment matrix | `env: [demo, prod]` — **no staging entry**; each silo added as its own entry/project | ✅ Established / ⛔ staging `TBD` | deploy.yml |
| Environment promotion | Promote **demo → prod** as one gate | ✅ Established (design) | TARGET_PLATFORM §4 |
| Approval gates | GitHub `environment:` per matrix env (approval rules `TBD`) | Partial | deploy.yml |
| Required repo vars | `GCP_PROJECT`, `GCP_REGION`, `AR_REPO`, `WEB_SERVICE`, `API_SERVICE`, `CLOUDSQL_INSTANCE` — values `TBD` | Partial | deploy.yml |
| Required repo secrets | `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SA`, `DATABASE_URL_SECRET` — values `TBD` | Partial | deploy.yml |
| Activation | Set vars/secrets + flip `if: false` → `true` | ✅ Established (procedure) | deploy.yml |

---

## 10. Operations

| Capability | State | Status | Source |
|---|---|---|---|
| Health — liveness | `GET /<API_PREFIX>/health` (instant, no I/O; public, throttle-exempt) | ✅ Implemented (D-1) | DEPLOYMENT.md, `health.controller.ts` |
| Health — readiness | `GET /<API_PREFIX>/health/ready` (cheap `SELECT 1`; 503 if DB unreachable) | ✅ Implemented (D-1) | DEPLOYMENT.md |
| Graceful shutdown | SIGTERM drains + closes DB; `SHUTDOWN_TIMEOUT_MS` force-exit backstop | ✅ Implemented (D-1) | `main.ts` |
| Logging | Structured pino (`autoLogging:false`); PHI redaction **incomplete** (bodies/`err.meta` not redacted); correlation id at HTTP layer only | Partial | PROD_READINESS "Logging" |
| Monitoring / APM | **Not confirmed from code** — no APM/metrics backend | ⛔ Unknown/`TBD` | PROD_READINESS "Monitoring" |
| Alerting | Security alerts persisted (impossible-travel, stuffing); general ops alerting Unknown | Partial | PROD_READINESS |
| Error tracking | e.g. Sentry — **not confirmed** | ⛔ Unknown/`TBD` | PROD_READINESS |
| Audit verification | Discrete events persisted; **no unified audit subsystem** | Partial | PROD_READINESS |
| Incident response | Runbooks / on-call — **not documented** | ⛔ Unknown/`TBD` | PROD_READINESS "Operations" |
| Swagger in prod | OFF by default (`SWAGGER_ENABLED=true` to expose) | ✅ Implemented (D-1) | DEPLOYMENT.md |
| Cross-account silo monitoring | Control Center cannot see silos for free — needs the silo channel (not built) | ⛔ `TBD` (build) | TARGET_PLATFORM §3 |

---

## 11. Open Decisions

Every unresolved deployment decision required before **Phase D-2** may begin. Status: **OPEN** unless
noted. "Blocking" = whether it hard-blocks D-2 scope.

| # | Decision | Owner | Status | Blocking impact |
|---|---|---|---|---|
| 1 | **Pooled-prod GCP project + Cloud SQL role**: is `compact-surfer-318619` / `pathos-prod` the launch pooled-prod, or recreate as clean `osieri-prod`? | User / platform | OPEN | **HIGH** — sets `GCP_PROJECT`, `CLOUDSQL_INSTANCE`, migration target |
| 2 | **Demo environment host**: Cloud Run in a GCP project, **or** no-monthly-fee host (Render+Neon) to avoid GCP fees? | User | OPEN | **HIGH** — determines whether demo is in the GCP pipeline at all |
| 3 | **Staging environment**: introduce a dedicated staging env, or promote demo→prod only? | Platform | OPEN | **MEDIUM** — affects matrix + promotion model |
| 4 | **Demo GCP project ID + region** (if Cloud Run) | User | OPEN | HIGH (if #2 = GCP) |
| 5 | **CytoLabs silo project ID, region, and app host (Cloud Run vs VM)** | CytoLabs / user | OPEN (account-gated) | **HIGH** for silo D-2; not blocking pooled/demo D-2 |
| 6 | **DNS ownership & registrar for `osieri.com`** (is it registered? zone location?) | User | OPEN | **HIGH** — managed SSL + LB depend on it |
| 7 | **Prod Postgres version** (existing instance version + target) | Platform | OPEN | MEDIUM |
| 8 | **WIF provider + deploy SA identity** (concrete) | Platform | OPEN | **HIGH** — CI cannot deploy without it |
| 9 | **Runtime service-account identities + IAM bindings** (per env) | Platform | OPEN | **HIGH** |
| 10 | **Secret Manager secret names + rotation policy** (per env) | Platform | OPEN | **HIGH** for prod; rotation MEDIUM |
| 11 | **Backup/DR policy** — schedule, retention, restore drills, RTO/RPO | Platform | OPEN | **HIGH** (prod PHI) |
| 12 | **Redis in production** — managed Memorystore vs none; is it required? | Platform | OPEN | MEDIUM |
| 13 | **GCS bucket naming + per-env buckets + retention/versioning** | Platform | OPEN | MEDIUM |
| 14 | **VPC connector / egress controls** — needed? | Platform | OPEN | MEDIUM |
| 15 | **Scaling profiles** (min/max instances, CPU/mem, concurrency) per env → feeds `DATABASE_CONNECTION_LIMIT` sizing | Platform | OPEN | MEDIUM |
| 16 | **Monitoring/APM + error tracking** choice (e.g. Cloud Monitoring, Sentry) | Platform | OPEN | MEDIUM |
| 17 | **Prod mail provider** (SMTP) — replaces dev MailHog | Platform | OPEN | MEDIUM |
| 18 | **Cross-account silo channel** — pull vs push; transport | Platform | OPEN (deferred to silo phase) | Not blocking pooled/demo D-2 |
| 19 | **CI approval-gate rules** per GitHub environment | Platform | OPEN | LOW |
| 20 | **Migration rollback policy** (forward-only confirmed; any down-migration expectation?) | Platform | OPEN | MEDIUM |

---

## 12. Readiness Assessment

### Established deployment facts (stable inputs for D-2)
- One codebase → **two images** (`osieri-api`, `osieri-web`) + a migrate job (`osieri-migrate`),
  built repo-root, multi-stage, **non-root**, `$PORT`-aware, D-1-hardened (health probes, graceful
  shutdown, Swagger gating, pool sizing).
- **Cloud Run** is the recommended host; **Artifact Registry** repo `osieri`; images tagged by SHA.
- **Networking pattern** fixed: one HTTPS LB per env, path-route `/api/v1/*`→API else→web,
  **Google-managed SSL**, domains `demo.osieri.com` / `app.osieri.com` / `cytologylab.com`.
- **Migration mechanism** fixed: `prisma migrate deploy` (clean from empty, 64 migrations) via the
  migrate job **before** the API rolls; forward-only; `db push`/`migrate dev` banned.
- **CI/CD scaffold** exists: GitHub Actions, build+test on `main`, deploy matrix `[demo, prod]`,
  deploy gated `if:false`, **WIF recommended**; activation is set-vars/secrets + flip the guard.
- **Secret set** enumerated with fail-hard boot checks for `DATABASE_URL`(SSL)/`JWT_SECRET`/
  `JWT_PORTAL_SECRET`/`ENCRYPTION_KEY`.
- **Tenancy** established: pool + silo, `labId` fail-closed; CytoLabs = own account/app/DB/domain.
- A **fully-migrated, reconciled prod dataset** already exists in `pathos-prod`.

### Unresolved items
20 open decisions (§11), of which **9 are HIGH-blocking** for the *pooled-prod + demo* D-2 scope
(#1, #2, #4, #6, #8, #9, #10, #11 — plus #5 HIGH but scoped to the silo, which is account-gated and
separable). The remainder are MEDIUM/LOW and can be resolved during D-2 provisioning without blocking
its start, provided they are tracked.

### Recommendation on whether Phase D-2 may begin
**CONDITIONAL — do not begin general D-2 yet.** The build/image/networking/migration/CI mechanisms are
established and frozen-ready, but D-2 provisioning cannot start meaningfully until the **HIGH-blocking
identity decisions** are made — specifically the **pooled-prod project + Cloud SQL role (#1)**, the
**demo hosting decision (#2/#4)**, **DNS ownership of `osieri.com` (#6)**, and the **deploy/runtime IAM
identities (#8/#9)**. These define the very targets (`GCP_PROJECT`, `CLOUDSQL_INSTANCE`, WIF/SA) that
D-2 would provision against; provisioning without them would invent configuration this checkpoint
forbids.

**Suggested path:** (1) freeze this specification via architectural review; (2) resolve the ~4 HIGH
identity/target decisions (#1, #2, #6, #8/#9) and record them **back into this frozen baseline** under
a follow-up checkpoint; (3) then authorize **Phase D-2 · Infrastructure Provisioning** scoped to the
**pooled-prod + demo** targets, deferring the **CytoLabs silo (#5, account-gated)** and the
**cross-account channel (#18)** to a later, separately-authorized silo phase.

---

*End of specification. This is a DRAFT pending architectural review; it is not staged or committed.
No production code, infrastructure, cloud resources, or deployment were modified in producing it.*
