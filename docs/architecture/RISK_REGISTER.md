# RISK_REGISTER.md

**Purpose:** Maintain an authoritative, evolving register of engineering risks in PathOS / CYTOLAB so that future checkpoints remediate from a shared, evidence-backed source of truth rather than ad-hoc discovery.
**Scope:** Backend (`apps/api`), web (`apps/web`), and cross-cutting concerns (security, observability, testing, design-system debt). Marketing site is out of scope except where noted.
**Status:** Living document — active.
**Owner:** PathOS Engineering (unassigned).
**Last Updated:** 2026-07-13.

---

## How to read this register

- **Severity** = impact if the risk is realized (Critical / High / Medium / Low).
- **Likelihood** = probability of realization given current code (High / Medium / Low).
- **Status** = Open / Mitigated / Accepted / Deferred / Closed.
- **Recommended checkpoint** references the isolated remediation checkpoints defined in the R1 audit; each checkpoint is a single branch/commit/review and never combines categories (security, logging, tests, color migration, accessibility, realtime).
- Risks are documented, **not fixed**, in this checkpoint.

---

## R-001 — PermissionsGuard fails open on absent metadata

| Field | Value |
|---|---|
| **Risk ID** | R-001 |
| **Title** | Authorization guard authorizes routes with no permission metadata |
| **Category** | Security — authorization |
| **Description** | `PermissionsGuard` returns `true` when a route carries no `@RequirePermissions` metadata. Authentication is enforced separately and globally, so the exposure is "any authenticated staff user, regardless of role," not anonymous access. |
| **Current impact** | A route missing a permission decorator is reachable by any logged-in staff member. Today most such routes are covered by alternate guards or are legitimate self-service; one confirmed exception (see R-002). |
| **Evidence** | `apps/api/src/modules/auth/guards/permissions.guard.ts:22`; global guard registration `apps/api/src/modules/auth/auth.module.ts:20-21`; fail-open locked by test `apps/api/src/modules/auth/guards/permissions.guard.spec.ts:55-58`. |
| **Affected modules** | auth, and every controller relying on implicit "authenticated-only" access. |
| **Severity** | High |
| **Likelihood** | Medium (a forgotten decorator silently fails open) |
| **Recommended checkpoint** | CP-3 (explicit authorization contract + startup policy assertion, then fail-closed flip). Gated behind CP-1. |
| **Status** | Open |
| **Verification required** | Route-level enforcement test; startup assertion that every non-`@Public` route declares a policy. |
| **Owner** | Unassigned |
| **Notes** | Fail-closed cannot be a one-line change — it would break all portal, self-service, and alternate-guard routes until each declares an explicit policy. See PERMISSION_MATRIX.md. |

## R-002 — Appointments read routes are an accidental fail-open hole

| Field | Value |
|---|---|
| **Risk ID** | R-002 |
| **Title** | Appointment read endpoints expose scheduling data to any staff role |
| **Category** | Security — authorization |
| **Description** | Six GET routes on the appointments controller carry no permission decorator while every write route on the same controller is gated `@RequirePermissions('record:change')`. Asymmetric — reads as an oversight. |
| **Current impact** | Any authenticated staff user (any role) can list the lab's patient-linked schedule and fetch any appointment by id. PHI-adjacent. |
| **Evidence** | `apps/api/src/modules/appointments/appointments.controller.ts:17-37` (reads, no guard) vs `:34-69` (writes, gated). |
| **Affected modules** | appointments |
| **Severity** | High |
| **Likelihood** | High (directly reachable today) |
| **Recommended checkpoint** | CP-1 (add permission decorators to the six read routes + regression spec). Controller is clean in the working tree. |
| **Status** | Open |
| **Verification required** | Spec asserting each read route 403s a principal lacking the read permission. |
| **Owner** | Unassigned |
| **Notes** | Smallest confirmed-security fix; isolated to one clean controller. |

## R-003 — Payment callback settlement is not idempotent and unverified

| Field | Value |
|---|---|
| **Risk ID** | R-003 |
| **Title** | PowerTranz callback `markPaid` lacks idempotency, amount check, and token↔batch binding |
| **Category** | Security — financial integrity |
| **Description** | The `@Public()` payment callback marks a batch PAID with no check that it is already paid, no comparison of settled amount to billed amount, and no verification that the gateway token was issued for the batch identified by the query `bid`. A separate `confirmPayment` flips status to PAID from a client-supplied reference with no gateway verification. |
| **Current impact** | Replayed callbacks can re-run settlement; an approved token for one batch combined with another batch's `bid` could settle the wrong batch; `confirmPayment` trusts client input. Practical exploitability is limited by the gateway's own `complete()` approval requiring a valid token, but there is no application-level idempotency key. |
| **Evidence** | `apps/api/src/modules/requisition-portal/requisition-portal.service.ts` `markPaid` (~:378-388), `confirmPayment` (~:390-401); callback `apps/api/src/modules/requisition-portal/requisition-payment.controller.ts:19-33`. |
| **Affected modules** | requisition-portal, payments |
| **Severity** | Critical |
| **Likelihood** | Medium |
| **Recommended checkpoint** | CP-2 (settlement hardening: idempotent `markPaid`, amount + token↔batch binding, gate `confirmPayment`). API-only. |
| **Status** | Open |
| **Verification required** | Replay no-op test; amount-mismatch rejection; cross-batch token rejection; `confirmPayment` authorization test. See TEST_STRATEGY.md §Financial. |
| **Owner** | Unassigned |
| **Notes** | Discovered during R1 deep read; not in the original survey. |

## R-004 — Payment callback postMessage uses wildcard target origin; receiver validates neither origin nor source

| Field | Value |
|---|---|
| **Risk ID** | R-004 |
| **Title** | 3DS callback postMessage `'*'` + unvalidated receiver |
| **Category** | Security — footgun |
| **Description** | The callback HTML posts `{status, orderId(=batch UUID), message}` to `window.parent/top/opener` with target origin `'*'`. The web receiver validates neither `event.origin` nor `event.source`. Payload contains no PAN/token/amount/PII. |
| **Current impact** | Low — leaks a batch UUID and a decline string only; `X-Frame-Options: DENY` blocks cross-site framing; the message drives UI phase only (money-truth comes from the authenticated status poll). Receiver-side gap allows only a spoofed UI error state. |
| **Evidence** | `apps/api/src/modules/requisition-portal/requisition-payment.controller.ts:41-43`; receiver `apps/web/src/components/portal/CardPaymentModal.tsx:67-79`; framing headers `apps/api/src/main.ts:70-85`. |
| **Affected modules** | requisition-portal, web portal payment |
| **Severity** | Low |
| **Likelihood** | Low |
| **Recommended checkpoint** | CP-4 (pin sender + validate receiver origin/source), shipped together with the CSP inline-script fix (R-005). |
| **Status** | Open |
| **Verification required** | Receiver origin/source assertion; sender pins to configured portal origin. |
| **Owner** | Unassigned |
| **Notes** | Fixing origin pinning is moot until R-005 is resolved. |

## R-005 — CSP blocks the callback's inline script

| Field | Value |
|---|---|
| **Risk ID** | R-005 |
| **Title** | `scriptSrc 'self'` (no nonce) blocks the inline postMessage script; `X-Frame-Options: DENY` blocks intended framing |
| **Category** | Correctness / operational (security config) |
| **Description** | Helmet applies `scriptSrc: ['self']` and `frameguard: deny` globally. The payment callback relies on an inline `<script>` and on being framed by the portal — both blocked in a strict browser, so postMessage silently never fires and the flow depends entirely on the status poll. |
| **Current impact** | Latent functional fragility in the payment UX; masks R-004 but for the wrong reason. |
| **Evidence** | `apps/api/src/main.ts:70-85`; inline script `apps/api/src/modules/requisition-payment.controller.ts:39`. |
| **Affected modules** | requisition-portal, api security config |
| **Severity** | Medium |
| **Likelihood** | Medium |
| **Recommended checkpoint** | CP-4 (scoped CSP nonce or external self script + scoped `frame-ancestors` for the callback route). |
| **Status** | Open |
| **Verification required** | Confirm callback script executes under enforced CSP in a real browser. |
| **Owner** | Unassigned |
| **Notes** | — |

## R-006 — Backend section-degradation catches log nothing

| Field | Value |
|---|---|
| **Risk ID** | R-006 |
| **Title** | Intentional graceful-degradation catches discard the error with no logging |
| **Category** | Observability |
| **Description** | Numerous services isolate a failed sub-source to `{status:'error'}`/`[]`/`null` (a sound pattern) but use bare `catch {` with no error binding and no logger, so the underlying cause is invisible. 23 services with catch blocks import no Logger. |
| **Current impact** | Section failures (which could be bugs, tenancy refusals, or DB errors) are undiagnosable in production. Not a data-safety defect. |
| **Evidence** | `apps/api/src/modules/signout/signout.service.ts` (~11 sites incl. aggregate `:416`); `diagnostic-case.service.ts` (~10 sites); quality-governance, enterprise-administration, system-health. Pino config `apps/api/src/app.module.ts:89-98`. |
| **Affected modules** | signout, diagnostic-case, quality-governance, enterprise-administration, system, +18 others |
| **Severity** | Medium |
| **Likelihood** | High |
| **Recommended checkpoint** | CP-6 (add `catch (e)` + structured PHI-safe logs; extend pino redact). **Excludes** `diagnostic-case.service.ts` while it is under active Phase 3A work. |
| **Status** | Open |
| **Verification required** | Confirm logs emit with safe structured context and zero behavior change to returned degraded state. See LOGGING_STANDARD.md. |
| **Owner** | Unassigned |
| **Notes** | `system-health.service.ts:64` echoes `e.message` into the HTTP response — review for host/connection-string leakage. Prisma `err.meta` must never be logged (echoes field values). |

## R-007 — Security-critical code paths have no tests

| Field | Value |
|---|---|
| **Risk ID** | R-007 |
| **Title** | Auth lockout, sessions, MFA, IP-block, and route-level authorization are untested |
| **Category** | Test coverage — security |
| **Description** | No specs for MFA, sessions, IP blocking, impossible-travel, or the auth lockout ladder. The one auth e2e spec is stale (asserts a removed token-in-body contract). PermissionsGuard is tested only in isolation, not at route level. Tenant isolation is well covered. |
| **Current impact** | Security regressions in lockout, session rotation/revocation, MFA single-use, and IP blocking would not be caught. |
| **Evidence** | Absent specs across `apps/api/src/modules/security/*` and `auth/*`; stale `apps/api/src/modules/auth/auth.e2e.spec.ts`; good `apps/api/src/common/tenancy/tenancy.integration.spec.ts`. |
| **Affected modules** | auth, security (mfa/session/ip-block/login-protection) |
| **Severity** | High |
| **Likelihood** | Medium |
| **Recommended checkpoint** | CP-5 (critical money/security test suite). Gated behind test DB + gateway/mail mocks. |
| **Status** | Open |
| **Verification required** | Suite runs green with `DATABASE_URL` + mocked externals. See TEST_STRATEGY.md. |
| **Owner** | Unassigned |
| **Notes** | — |

## R-008 — Financial code paths have no tests; two payroll engines diverge

| Field | Value |
|---|---|
| **Risk ID** | R-008 |
| **Title** | Billing, payments, taxes, and payroll are untested; two PAYE engines compute differently |
| **Category** | Test coverage — financial correctness |
| **Description** | No specs for billing tax calc, bill payments (overpayment/drift), payment callback, or payroll. Two payroll engines (`workforce/payroll-engine.service.ts` and `payroll/payroll.service.ts`) use different PAYE nil bands and differ on whether NIS is deducted before edTax/PAYE — producing different net pay for the same gross. Payroll `integrityHash` is not recomputed on `updateAdvice`, and edits are allowed after approval (only blocked at `Paid`). |
| **Current impact** | Incorrect bills, double-settlement, or wrong net pay could ship undetected; tamper-evidence hash can go stale. |
| **Evidence** | `apps/api/src/modules/billing/billing.service.ts`, `payments/payments.service.ts`, `workforce/payroll-engine.service.ts`, `payroll/payroll.service.ts`. |
| **Affected modules** | billing, payments, taxes, workforce/payroll, payroll |
| **Severity** | High |
| **Likelihood** | Medium |
| **Recommended checkpoint** | CP-5. The two engines must be **characterized as-is** before any reconciliation. |
| **Status** | Open |
| **Verification required** | Golden-case gross→net per engine; tax rounding boundaries; integrity-hash lifecycle. |
| **Owner** | Unassigned |
| **Notes** | Engine divergence is a latent correctness landmine, not merely a test gap. |

## R-009 — Design-system: raw hex and Tailwind color debt

| Field | Value |
|---|---|
| **Risk ID** | R-009 |
| **Title** | ~4,830 raw hex literals + ~1,522 Tailwind named-color utilities bypass the token layer |
| **Category** | Design-system debt (theming) |
| **Description** | Components hard-code hex and Tailwind color utilities instead of consuming semantic tokens, blocking theming/dark-mode and the long-term Helix theme system. The token layer itself is mature (346 custom properties in globals.css). |
| **Current impact** | Re-theming requires touching thousands of sites; zero-orange compliance cannot be grep-audited (Tailwind utilities carry no hex). |
| **Evidence** | ~5,180 hex literals total (≈4,830 real after removing dead/demo/SVG/comments); ~1,522 Tailwind color utilities; tokens in `apps/web/src/app/globals.css`. Top offenders mostly dirty on `feat/theme-system`. |
| **Affected modules** | web — records/[id], dashboard, system/support, patients/[id], system, landing, qc, superuser, payments |
| **Severity** | Medium |
| **Likelihood** | High (already realized as debt) |
| **Recommended checkpoint** | CP-7 (token migration, presentation-only) on **clean files only**: `system/support`, `system`, `qc`. Dirty top offenders excluded. |
| **Status** | Open |
| **Verification required** | Pixel/orange detector reports 0; visual diff unchanged. See THEME_MIGRATION.md. |
| **Owner** | Unassigned |
| **Notes** | Landing (`app/page.tsx`, `PlatformShowcase`, hero-v2) additionally under landing scope-lock. |

## R-010 — Accessibility debt

| Field | Value |
|---|---|
| **Risk ID** | R-010 |
| **Title** | Clickable divs, unmanaged modals, raw images |
| **Category** | Accessibility |
| **Description** | ~119 clickable `<div onClick>` without keyboard support; ~25 hand-rolled modal overlays without focus trap / Escape / `aria-modal`; ~17 raw `<img>` vs 3 `next/image`. A `Modal` primitive exists but is used once. |
| **Current impact** | Keyboard and screen-reader users cannot operate large parts of the UI. |
| **Evidence** | Frontend survey counts; e.g. confirm dialog `apps/web/src/app/(app)/records/[id]/page.tsx:674`. |
| **Affected modules** | web — broad |
| **Severity** | Medium |
| **Likelihood** | High |
| **Recommended checkpoint** | Separate future accessibility workstream (not merged with security/logging/color). |
| **Status** | Open |
| **Verification required** | Keyboard-only pass; axe/screen-reader audit. See ACCESSIBILITY_DEBT_REGISTER.md. |
| **Owner** | Unassigned |
| **Notes** | Adopting the `Modal`/`Input` primitives fixes focus-trapping and hex debt simultaneously. |

## R-011 — Realtime event emission is inconsistent

| Field | Value |
|---|---|
| **Risk ID** | R-011 |
| **Title** | Core mutations do not emit realtime events |
| **Category** | Product consistency (realtime) |
| **Description** | Only ~8 emit sites exist. `messaging.service.ts` emits no `message:new`; `records.service.ts` status transitions emit nothing, so dashboards/queues can go stale. |
| **Current impact** | Live-update expectations unmet for messaging and record status changes. |
| **Evidence** | Emit sites in requisitions, result-sheets, lab, workforce, support, escalation, notifications, requisition-portal; absent in messaging and records. |
| **Affected modules** | messaging, records, appointments, billing, diagnostic-case |
| **Severity** | Low |
| **Likelihood** | Medium |
| **Recommended checkpoint** | Separate future realtime workstream. |
| **Status** | Open |
| **Verification required** | Define an emit convention (mutation → event/scope) and confirm delivery. |
| **Owner** | Unassigned |
| **Notes** | — |

## R-012 — Loading/empty/error-state adoption is inconsistent

| Field | Value |
|---|---|
| **Risk ID** | R-012 |
| **Title** | Route loading UX is a coin flip per screen |
| **Category** | Performance / UX |
| **Description** | One `loading.tsx` and one `error.tsx` for ~100 routes; 14 screens use the `Skeleton` primitive, 26 use `EmptyState`, 13 hand-roll spinners; only 9 files use Suspense. Heavy detail routes lack route-shaped skeletons. |
| **Current impact** | Inconsistent perceived performance; risk of false empty states while loading (a CLAUDE.md invariant). |
| **Evidence** | Frontend survey counts; group-root boundaries only at `apps/web/src/app/(app)/loading.tsx` and `error.tsx`. |
| **Affected modules** | web — broad |
| **Severity** | Low |
| **Likelihood** | Medium |
| **Recommended checkpoint** | Separate future UX workstream (per-route `loading.tsx`, standardize on primitives). |
| **Status** | Open |
| **Verification required** | Experience-budget measurement (route loading ≤ 400ms / cue ≤ 200ms). |
| **Owner** | Unassigned |
| **Notes** | — |

## R-013 — Bundle/performance opportunities

| Field | Value |
|---|---|
| **Risk ID** | R-013 |
| **Title** | Recharts and antd shipped statically into large client pages |
| **Category** | Performance — bundle |
| **Description** | Recharts imported statically in ~20 files; only ~7 files use `next/dynamic`. Dashboard page is ~1,228 lines, fully client-side, pulling antd + recharts. 17 antd-importing product pages remain (expected migration debt). |
| **Current impact** | Larger initial client bundles on heavy routes; potential cold-startup budget pressure. |
| **Evidence** | Frontend survey; `apps/web/src/app/(app)/dashboard/page.tsx`. |
| **Affected modules** | web — dashboard, analytics, charts |
| **Severity** | Low |
| **Likelihood** | Medium |
| **Recommended checkpoint** | Separate future performance workstream (dynamic-import charts, split monoliths). |
| **Status** | Open |
| **Verification required** | `measure:experience` on a production build (cold startup ≤ 2000ms). |
| **Owner** | Unassigned |
| **Notes** | Do not rewrite stable screens solely to adopt primitives (CLAUDE.md prime directive). |

## R-014 — Dead code in route directories

| Field | Value |
|---|---|
| **Risk ID** | R-014 |
| **Title** | Unreferenced files carry stale patterns and hex |
| **Category** | Maintainability |
| **Description** | `analytics-old.tsx`, `landing-v2/*`, and a `herov2` preview route are unreferenced. |
| **Current impact** | Minor — confuses audits and inflates debt counts (~51 hex). |
| **Evidence** | Import grep returns no references. |
| **Affected modules** | web — analytics, landing |
| **Severity** | Low |
| **Likelihood** | Low |
| **Recommended checkpoint** | Optional cleanup checkpoint (documentation-only for now; landing under scope-lock). |
| **Status** | Deferred |
| **Verification required** | Confirm zero imports before any removal. |
| **Owner** | Unassigned |
| **Notes** | Removal is out of scope for the current documentation checkpoint. |

---

## Related documents
- PERMISSION_MATRIX.md (R-001, R-002)
- LOGGING_STANDARD.md (R-006)
- TEST_STRATEGY.md (R-007, R-008)
- THEME_MIGRATION.md (R-009)
- SECURITY_ARCHITECTURE.md (R-003, R-004, R-005)
- ACCESSIBILITY_DEBT_REGISTER.md (R-010)
- PRODUCTION_READINESS_CHECKLIST.md (cross-cutting)

## Future revisions
- Add risks as new checkpoints and audits surface them; assign owners; update Status as checkpoints land.
- Re-score severity/likelihood after each remediation.
- Split accessibility, realtime, loading, and performance into their own dedicated registers if entries grow.

## Verification requirements
- Every risk must cite file:line evidence before it is acted on.
- No risk is closed without the Verification-required step being demonstrated.
- This register is documentation only; it authorizes no code change by itself.
