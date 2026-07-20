# PRODUCTION_READINESS_CHECKLIST.md

**Purpose:** Provide an evolving, honest checklist of Osieri / CYTOLAB production readiness across security, reliability, compliance, and operations, so gaps are visible and tracked rather than discovered at release.
**Scope:** Whole platform (`apps/api`, `apps/web`, operations). Reflects state verified 2026-07-13. Items are assessed from current code and configuration only.
**Status:** Living document — active.
**Owner:** Osieri Engineering (unassigned).
**Last Updated:** 2026-07-13.

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
| Authorization (permissions) | Partial | `PermissionsGuard` fail-open on missing metadata (R-001); appointments read hole (R-002). |
| Session management (rotation, idle/max, revocation) | Implemented | Untested (R-007). |
| MFA (TOTP/email/backup) | Implemented | Untested (R-007). |
| Brute-force lockout + impossible-travel | Implemented | Untested (R-007). |
| IP blocking | Implemented | Untested; X-Forwarded-For handling to verify. |
| Tenant isolation | Implemented | Strong read-path tests; write-path/portal coverage to add. |
| Secrets fail-hard startup checks + DB TLS | Implemented | `main.ts`. |
| Helmet CSP / CORS allowlist / ValidationPipe | Implemented | CSP blocks payment callback inline script (R-005). |
| Payment callback integrity (idempotency/amount/token binding) | Partial | Not idempotent; unverified `confirmPayment` (R-003). |
| postMessage origin validation | Partial | Wildcard sender + unvalidated receiver (R-004). |
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
| Health endpoint | Implemented | `@Public()` `/health`; system-health checks exist. |
| Metrics/APM | Unknown | Not confirmed from code. |
| Alerting | Partial | Security alerts (impossible-travel, stuffing) persisted; general ops alerting Unknown. |
| Error tracking (e.g. Sentry) | Unknown | Not confirmed. |

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
| CI/CD pipeline | Deferred | No CI documented; Turborepo pipeline noted as Phase-1. |
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
| CSP-enforcing browser behavior (payment callback) | Partial | Inline script blocked under strict CSP (R-005). |

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
| Security path tests (auth/session/MFA/IP) | Deferred | None; stale auth e2e (R-007). |
| Financial path tests (billing/payments/payroll/tax) | Deferred | None; dual payroll engines diverge (R-008). |
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

## Future revisions
- Resolve every **Unknown** by investigating monitoring, backups, DR, encryption-at-rest, browser matrix, and analytics, then restate the status.
- Update statuses as remediation checkpoints (CP-1..CP-7) land.
- Add a formal sign-off column when a release process is defined.

## Verification requirements
- No item may be marked Implemented without evidence; unverified items stay Partial or Unknown.
- This checklist is an engineering assessment, not a compliance certification.
- Documentation only — it changes no code or configuration.
