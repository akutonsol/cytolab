# Program 4 — Deferred-Item Register

**Status:** Authoritative · created at Program 4 closeout (D-6).
**Purpose:** the **single** inventory of work consciously carried forward out of Program 4. Every other
Program 4 document (Completion Report, Readiness Checklist, Phase-D Audit, Environment Specification,
Risk Register) **references** this register rather than reproducing a deferred list of its own.
**Rule of this register:** it *records* deferred work; it does not schedule, design, or expand it. An
entry here is a promise that the item is not lost — not a commitment to a solution.
**Owner:** Osieri Engineering (unassigned).

Each item carries four governance fields:

- **Origin** — where the item was first raised (checkpoint / risk / audit / decision).
- **Disposition** — Accepted (knowingly live with it for now) · Deferred (do later) · Operational
  (a deploy-time action, not engineering) · Blocked (waiting on an external dependency).
- **Routed To** — the future workstream / document that owns the eventual resolution.
- **Blocking Condition** — what must be true before it can proceed (blank if none).

> Anything closed during Program 4 is **not** in this register. Closed risks (R-001…R-005, R-007,
> R-008 engine divergence, R-016a, R-016b) and the two correctness follow-ups are recorded as
> complete in `PROGRAM_4_COMPLETION_REPORT.md` and `docs/architecture/RISK_REGISTER.md`.

---

## A. Open product-quality risks (non-blocking)

| Item | Origin | Disposition | Routed To | Blocking Condition |
|---|---|---|---|---|
| R-006 — degradation `catch` blocks log nothing | RISK_REGISTER R-006 | Accepted | Observability / logging-standard workstream | — |
| R-009 — raw-hex / Tailwind color debt (design-token migration) | RISK_REGISTER R-009 | Deferred | Design-system / Helix theme-migration workstream | — |
| R-011 — inconsistent realtime event emission | RISK_REGISTER R-011 | Deferred | Realtime consistency workstream | — |
| R-012 — inconsistent loading / empty / error-state adoption | RISK_REGISTER R-012 | Deferred | Experience-budget / UX-state workstream | — |
| R-013 — bundle / perf debt (static Recharts + antd) | RISK_REGISTER R-013 | Deferred | Performance workstream | — |
| R-015 — app-shell content clipping at ~390px | RISK_REGISTER R-015 | Deferred | Responsive-shell workstream | — |
| R-014 — dead code in route directories | RISK_REGISTER R-014 | Deferred | Codebase-hygiene pass | — |

## B. Accessibility

| Item | Origin | Disposition | Routed To | Blocking Condition |
|---|---|---|---|---|
| R-010 — accessibility debt (keyboard/focus/contrast) | RISK_REGISTER R-010 | Deferred | Accessibility workstream | Contractual-a11y applicability decision (WCAG target) |
| Clickable-`div` → `button`/`role` conversion | ACCESSIBILITY_DEBT_REGISTER | Deferred | Accessibility workstream | — |
| Adopt shared `Modal` primitive (focus trap / Escape) | ACCESSIBILITY_DEBT_REGISTER | Deferred | Accessibility workstream | — |
| Post-token-migration contrast audit + darker on-soft foreground pairs | ACCESSIBILITY_DEBT_REGISTER; PROGRAM_2_CERTIFICATION_RECORD §5 | Deferred | Accessibility workstream | Depends on R-009 token migration |

## C. Financial-engine follow-ups (off the closed R-008)

| Item | Origin | Disposition | Routed To | Blocking Condition |
|---|---|---|---|---|
| Pension pre-tax deductibility in the statutory base | R-008 resolution notes | Deferred | Payroll-correctness workstream | Requires an authoritative statutory-rule decision |
| Broader financial-path regression coverage (beyond payroll integrity) | R-008; PRODUCTION_READINESS_CHECKLIST (Testing) | Deferred | Financial test-hardening workstream | — |

> Note: the R-008-adjacent "integrity hash not recomputed on `updateAdvice` / edits after approval"
> concern was **CLOSED** by Correctness Follow-up (1) (`fix(payroll): keep the integrity hash truthful
> and freeze approved runs`); it is **not** deferred. The appointment write-gate mismatch was **CLOSED**
> by Correctness Follow-up (2) (`fix(auth): gate appointment writes on appointment:manage, not
> record:change`). Both are recorded as complete, not carried here.

## D. Audit — operational follow-up

| Item | Origin | Disposition | Routed To | Blocking Condition |
|---|---|---|---|---|
| Run `AuditSealRegistrarService.registerInitialSystemSeal()` per environment holding the frozen `system` gen-0 fragment | R-016b resolution (`feat(audit): support sealed audit generations`) | Operational (deploy-time) | Production rollout procedure | Target environment provisioned; fails closed unless the deployed rows reproduce the authorized snapshot |

## E. Account-gated production infrastructure

The IaC **foundation** is applied (Artifact Registry, service accounts, IAM, enabled APIs, empty Secret
Manager containers in `osieri-prod-9317`). The items below are the remaining **runtime provisioning** —
finite, well-understood, and account/DNS-gated. None are architectural. Sources: `PROGRAM_4_PHASE_D_PRODUCTION_READINESS_AUDIT.md` §5 and `PROGRAM_4_ENVIRONMENT_SPECIFICATION.md` §11 (Open Decisions).

> **Routing (decided 2026-07-22):** actual **live provisioning of every recurring-cost resource below is
> deferred to `Program 9 — Production Launch Readiness Review`.** The current objective is
> production-readiness *validation* only — Terraform is authored, validated, and `plan`-clean, but
> **not applied**, so no Google Cloud costs are incurred and no production credentials are generated.
> The "Routed To" column below therefore reads **Program 9** for these items.
>
> **Readiness-validation status (each: Terraform authored + `validate` success + `plan`-clean, gated
> OFF by default so the default plan is "No changes"; NO apply, NO credentials, NO secret values):**
>
> | Stage | Scope | Gate (default false) | Plan when enabled |
> |---|---|---|---|
> | 2 · Cloud SQL | PG16, REGIONAL HA, `db-custom-1-3840`, backups+PITR, `ssl_mode=ENCRYPTED_ONLY`, deletion protection, `osieri` DB + `osieri_app` user | `provision_cloud_sql` | 4 add / 0 change / 0 destroy |
> | 3 · Cloud Run | `osieri-api` + `osieri-web` services + `osieri-migrate` job; internal-LB ingress; 8 real secrets wired from Secret Manager; CONFIG env; Cloud SQL Auth Proxy socket; startup/liveness probes on `/api/v1/health` | `provision_cloud_run` | +5 (api/web/job + 2 invokers) |
> | 4 · Secret wiring | 8 consumed secrets referenced by Cloud Run; `JWT_REFRESH_SECRET` + `REDIS_URL` deliberately left unwired (dead — no code reads them); `PORTAL_WEB_ORIGIN`/`ALLOWED_ORIGINS` set as CONFIG env, not secrets | (folded into Stage 3) | — |
> | 5 · HTTPS LB + SSL | external ALB, reserved global IP, serverless NEGs, path routing (`/api/*`→api, default→web), Google-managed cert (apex+www), 80→443 redirect | `provision_lb` | full compute+edge = 18 add / 0 change / 0 destroy |
> | 6 · Monitoring | Cloud Monitoring: email notification channel, HTTPS uptime check, alert policies (uptime, Cloud Run 5xx, Cloud SQL CPU>90%) | `provision_monitoring` | +6 |
> | 7 · Backup / DR | backups+PITR+REGIONAL HA+deletion protection defined in Stage 2; DR runbook `docs/deploy/DISASTER_RECOVERY.md` (RTO/RPO targets + restore procedures); live restore drill → Program 9 | (config in Stage 2) | — |
> | 8 · CI/CD + WIF | keyless GitHub Actions → `osieri-deployer` SA via Workload Identity Federation (pool + provider + impersonation, repo-scoped); `deploy.yml` already WIF-based, stays `if: false` until Program 9 | `provision_cicd` | +3 |
>
> **Full stack, all gates on:** `terraform plan` = **31 to add, 0 to change, 0 to destroy** — the entire
> production runtime is defined as IaC yet the project stays idle (default plan makes no resource
> changes; only output declarations resolve). Live provisioning of all the above is **deferred to
> Program 9** to avoid recurring cloud cost. No
> `terraform apply` was run; no DB credentials or Secret Manager values were generated. LAUNCH ORDERING
> (Program 9): reserve LB IP → set registrar A record (apex+www) → managed cert validates → migrate →
> health → smoke → verify. The registrar/DNS provider is external ("Other" — confirm at launch).

| Item | Origin | Disposition | Routed To | Blocking Condition |
|---|---|---|---|---|
| Cloud Run services (replace placeholder shells) | Phase-D §5 #1 | Blocked | Infra track (post-D-5) | Account/runtime provisioning |
| Cloud SQL prod instance + connection-pool sizing | Phase-D §5 #1/#7; ENV SPEC #7/#15 | Blocked | Infra track | Prod instance stood up; Postgres version (#7) + scaling profile (#15) decided |
| Load balancer + Google-managed SSL | Phase-D §5 #9; ENV SPEC #6 | Blocked | Infra track | Requires the domain (external dependency, §F) |
| Secret Manager **values** + rotation policy | Phase-D §5 #2; ENV SPEC #10 | Blocked | Infra track | Containers exist; values/rotation TBD |
| CI/CD deploy job activation + Workload Identity Federation | Phase-D §5 #8; ENV SPEC #19 | Deferred | Infra track | Repo secrets/vars + WIF pool; deploy job currently `if: false` |
| Alerting / APM (Sentry alert routing + Cloud Monitoring policies) | Phase-D §5 #12; ENV SPEC #16 | Deferred | Observability / infra track | — |
| Backup / DR policy + restore rehearsal (RTO/RPO) | Phase-D §5 #13; ENV SPEC #11 | Deferred | Infra / DR track | — |
| `/metrics` (prom-client) endpoint | Phase-D §5 #14 | Deferred | Observability track | — |
| Staging environment | ENV SPEC #3 | Deferred | Infra track | — |
| CytoLabs silo account + cross-account channel | ENV SPEC #5/#18; CYTOLABS_ACCOUNT_PROVISIONING | Deferred | Silo-onboarding phase | CytoLabs account access |
| Redis in production | ENV SPEC #12 | Deferred | Infra track | — |
| GCS bucket naming / retention policy | ENV SPEC #13 | Deferred | Infra track | — |
| VPC connector / egress posture | ENV SPEC #14 | Deferred | Infra track | — |
| Production mail provider | ENV SPEC #17 | Deferred | Infra track | — |
| Migration rollback policy | ENV SPEC #20 | Deferred | Infra track | — |
| Production-DB migration baseline (`migrate deploy`, 64 migrations, own `_prisma_migrations`) | Phase-D §5 #3; CUTOVER_RUNBOOK step 2 | Operational (cutover-time) | Cutover runbook | Cloud SQL prod instance provisioned |
| Penetration test | PRODUCTION_READINESS_CHECKLIST (Security) | Deferred | Security-assurance workstream | — |

## F. External dependency

| Item | Origin | Disposition | Routed To | Blocking Condition |
|---|---|---|---|---|
| Register `osieri.com` and complete DNS → unblock D-5 production cutover | D-5 cutover design; ENV SPEC #6; CUTOVER_RUNBOOK step 7 | Blocked (external) | D-5 cutover execution | Domain registration + DNS delegation are outside the codebase; resume on "I registered osieri.com." |

---

## Related documents
- `PROGRAM_4_COMPLETION_REPORT.md` — the authoritative closeout + handoff (references this register).
- `docs/architecture/RISK_REGISTER.md` — risk dispositions (R-006/R-009…R-015 recorded here too).
- `PROGRAM_4_PHASE_D_PRODUCTION_READINESS_AUDIT.md` — historical audit + remediation-status appendix.
- `PROGRAM_4_ENVIRONMENT_SPECIFICATION.md` — §11 Open Decisions (the account-gated infra source).
- `docs/migration/CUTOVER_RUNBOOK.md` — the cutover-time operational steps.
