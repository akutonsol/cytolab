# PRODUCTION_READINESS_CHECKLIST.md

**Purpose:** Provide an evolving, honest checklist of Osieri / CYTOLAB production readiness across security, reliability, compliance, and operations, so gaps are visible and tracked rather than discovered at release.
**Scope:** Whole platform (`apps/api`, `apps/web`, operations). Items are assessed from current code and configuration only.
**Status:** Living document — active.
**Owner:** Osieri Engineering (unassigned).
**Last Updated:** 2026-07-22 — Program 4 closeout (D-6) status reconciliation. Rows whose blocking risk closed during Program 4 (R-001, R-002, R-003, R-004, R-005, R-007, R-008 engine divergence) are restated below; still-open items are unchanged. Deferred work is inventoried in `PROGRAM_4_DEFERRED_ITEM_REGISTER.md`.

---

## Legend

- **Implemented** — present and working as designed.
- **Partial** — present but incomplete, inconsistent, or unverified.
- **Deferred** — intentionally not built yet.
- **Unknown** — cannot be confirmed from current code/config; needs investigation.

Statuses reflect engineering observation, not a formal sign-off.

## Security

| Item | Status | Notes |
|---|---|---|
| Authentication (staff + portal JWT) | Implemented | Global `JwtAuthGuard`; separate portal strategy. |
| Authorization (permissions) | Implemented | R-001 CLOSED (fail-closed, CI-enforced authorization contract); R-002 CLOSED (appointment reads gated `appointment:view`). |
| Session management (rotation, idle/max, revocation) | Implemented | R-007 CLOSED — regression coverage added. |
| MFA (TOTP/email/backup) | Implemented | R-007 CLOSED — regression coverage added. |
| Brute-force lockout + impossible-travel | Implemented | R-007 CLOSED — lockout ladder / stuffing / IP-block coverage added. |
| IP blocking | Implemented | R-007 CLOSED — IP-block guard covered; X-Forwarded-For handling exercised. |
| Tenant isolation | Implemented | Strong read-path tests; write-path/portal coverage to add. |
| Secrets fail-hard startup checks + DB TLS | Implemented | `main.ts`. |
| Helmet CSP / CORS allowlist / ValidationPipe | Implemented | R-005 CLOSED — route-scoped CSP (per-response nonce) on the payment callback; global Helmet unchanged. |
| Payment callback integrity (idempotency/amount/token binding) | Implemented | R-003 CLOSED — settlement idempotency + gateway-amount check + token↔batch binding, all fail-closed. |
| postMessage origin validation | Implemented | R-004 CLOSED — sender pinned to the portal origin; receiver validates origin/source/status/orderId. |
| Penetration test | Deferred | Not performed. |
| Unified audit log | Partial | Discrete events persisted; no unified subsystem. |

## Performance

| Item | Status | Notes |
|---|---|---|
| Experience budgets defined (cold/route/interaction) | Implemented | CLAUDE.md; `measure:experience` on prod build. |
| Route-level loading states | Partial | One group-root `loading.tsx` for ~100 routes (R-012). |
| Chart/bundle code-splitting | Partial | Recharts static in ~20 files (R-013). |
| Motion grammar compliance | Implemented | `check:motion-grammar` on prod build. |
| Automated performance gates in CI | Deferred | No CI documented. |

## Accessibility

| Item | Status | Notes |
|---|---|---|
| Keyboard operability | Partial | ~119 clickable divs not operable (R-010). |
| Dialog focus management | Partial | ~25 hand-rolled modals, no trap/Escape. |
| ARIA roles/labels | Partial | ~31/100 pages have any ARIA. |
| Contrast compliance | Unknown | Mid-migration color; audit post-tokens. |
| Automated a11y checks | Deferred | See ACCESSIBILITY_DEBT_REGISTER.md. |

## Monitoring

| Item | Status | Notes |
|---|---|---|
| Health endpoint | Implemented | `@Public()` `/health` (liveness) + `/health/ready` (`SELECT 1`, 503 on DB failure); `health.controller.ts`. |
| Metrics/APM | Deferred | No `/metrics` endpoint; see Deferred-Item Register §E. |
| Alerting | Partial | Security alerts (impossible-travel, stuffing) persisted; ops alert routing/thresholds deferred (Register §E). |
| Error tracking (e.g. Sentry) | Implemented | Sentry wired in-app (`instrument.ts`); alert routing deferred (Register §E). |

## Logging

| Item | Status | Notes |
|---|---|---|
| Structured logger (pino) | Implemented | `autoLogging: false`. |
| Degradation-path logging | Partial | Many catches log nothing; bare `catch {` (R-006). |
| PHI/PII redaction in logs | Partial | Redact covers headers only; bodies/`err.meta` not redacted. |
| Correlation/request ID in service logs | Partial | `req.id` at HTTP layer; not threaded into services. |
| Audit/security log standard | Deferred | See LOGGING_STANDARD.md. |

## Disaster Recovery

| Item | Status | Notes |
|---|---|---|
| DR plan / RTO-RPO defined | Unknown | Not documented. |
| Failover strategy | Unknown | Not confirmed. |

## Backups

| Item | Status | Notes |
|---|---|---|
| Database backups | Partial/Unknown | A backup module/service is referenced in code; policy, schedule, and restore testing Unknown. |
| Object storage (GCS) durability | Partial | GCS used; retention/versioning policy Unknown. |
| Restore drills | Unknown | Not confirmed. |

## Feature Flags

| Item | Status | Notes |
|---|---|---|
| Feature-flag system | Implemented | Lab features + superuser features; `FeatureGuard`. |
| Flag-gated rollout process | Partial | Mechanism exists; governance process Unknown. |

## Deployment

| Item | Status | Notes |
|---|---|---|
| Reproducible build | Implemented | `next build` (`.next-prod`), Nest build. |
| CI/CD pipeline | Partial | `.github/workflows/deploy.yml` build+test job live; deploy job gated (`if: false`) pending secrets/WIF (Register §E). |
| Migrations process | Implemented | `migrate diff` → timestamped SQL → `migrate deploy`; `db push` banned. |
| Environment config validation | Implemented | Fail-hard secret/TLS checks at boot. |

## Rollback

| Item | Status | Notes |
|---|---|---|
| Code rollback (revert commit) | Implemented | Isolated checkpoints support clean revert. |
| Migration rollback strategy | Partial/Unknown | Forward-only migrations documented; down-migration/rollback policy Unknown. |
| Feature-flag kill switch | Partial | Flags can gate features; kill-switch process Unknown. |

## Browser Support

| Item | Status | Notes |
|---|---|---|
| Supported browser matrix | Unknown | Not documented. |
| Classic/space-consuming scrollbar handling | Partial | Known constraint (shared scroll container); verify per screen. |
| CSP-enforcing browser behavior (payment callback) | Implemented | R-005 CLOSED — route-scoped CSP with a per-response nonce on the callback; inline script no longer blocked. |

## Mobile

| Item | Status | Notes |
|---|---|---|
| Responsive layouts | Partial | Not uniformly verified; raw `<img>` usage. |
| Mobile-specific testing | Unknown | Not documented. |

## HIPAA

| Item | Status | Notes |
|---|---|---|
| PHI tenant isolation | Implemented | Prisma extension + `LabContext`. |
| PHI redaction to AI | Implemented | `ai/redaction.ts`. |
| PHI-safe logging | Partial | Redaction list incomplete (R-006). |
| Audit trail for PHI access | Partial/Deferred | No unified audit subsystem. |
| BAA / compliance program | Unknown | Non-engineering; not documented here. |
| Encryption at rest (DB/object store) | Unknown | App-level encryption for MFA/tokens/passwords Implemented; storage-level Unknown. |

## Testing

| Item | Status | Notes |
|---|---|---|
| Tenant isolation tests | Implemented | Strong. |
| Security path tests (auth/session/MFA/IP) | Implemented | R-007 CLOSED — focused regression suites (login-protection, MFA, IP-block, session lifecycle); e2e realigned to the cookie-session contract. |
| Financial path tests (billing/payments/payroll/tax) | Partial | R-008 engine divergence CLOSED (single statutory core) + payroll integrity coverage; broader financial-path tests remain (Register §C). |
| Route-level authorization tests | Partial | Guard tested in isolation only. |
| Production verification workflow | Implemented | Manual per CLAUDE.md (typecheck/build/drive flow/pixel detector). |
| Automated coverage gates | Deferred | No CI. |

## Analytics

| Item | Status | Notes |
|---|---|---|
| Product analytics | Unknown | Analytics pages exist; instrumentation/telemetry backend Unknown. |
| Usage/audit reporting | Partial | Some reporting features exist; scope Unknown. |

## Operations

| Item | Status | Notes |
|---|---|---|
| Runbooks | Unknown | Not documented. |
| On-call / incident process | Unknown | Not documented. |
| Realtime event consistency | Partial | Emit gaps in messaging/records (R-011). |
| Config/secret management process | Partial | Fail-hard checks exist; rotation process Unknown. |

---

## Related documents
- SECURITY_ARCHITECTURE.md, PERMISSION_MATRIX.md, LOGGING_STANDARD.md, TEST_STRATEGY.md, THEME_MIGRATION.md, ACCESSIBILITY_DEBT_REGISTER.md, RISK_REGISTER.md
- PROGRAM_4_COMPLETION_REPORT.md (readiness verdict) · PROGRAM_4_DEFERRED_ITEM_REGISTER.md (deferred-work inventory)

## Future revisions
- Resolve every **Unknown** by investigating monitoring, backups, DR, encryption-at-rest, browser matrix, and analytics, then restate the status.
- Update statuses as remediation checkpoints (CP-1..CP-7) land.
- Add a formal sign-off column when a release process is defined.

## Verification requirements
- No item may be marked Implemented without evidence; unverified items stay Partial or Unknown.
- This checklist is an engineering assessment, not a compliance certification.
- Documentation only — it changes no code or configuration.
