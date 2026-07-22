# RISK_REGISTER.md

**Purpose:** Maintain an authoritative, evolving register of engineering risks in Osieri / CYTOLAB so that future checkpoints remediate from a shared, evidence-backed source of truth rather than ad-hoc discovery.
**Scope:** Backend (`apps/api`), web (`apps/web`), and cross-cutting concerns (security, observability, testing, design-system debt). Marketing site is out of scope except where noted.
**Status:** Living document — active.
**Owner:** Osieri Engineering (unassigned).
**Last Updated:** 2026-07-19.

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
| **Status** | **Mitigated / Closed** — PermissionsGuard now fails closed; every production handler carries a recognized authorization contract, CI-enforced. |
| **Resolution** | Delivered in two phases. **R-001a** (`feat(auth): declare explicit authorization contracts before fail-closed enforcement`): new generalized `@AuthorizationContract(kind)` decorator; 34 previously-implicit routes annotated; `authz-contract.arch.spec.ts` fails CI if any handler lacks a recognized contract (permissions/public/portal/authorizationContract/SuperuserGuard; FeatureGuard **not** accepted). **R-001b** (`fix(auth): enforce fail-closed authorization contracts`): PermissionsGuard flipped fail-closed — a handler with no recognized contract is **denied** (no fail-open-by-omission). Effective order: @Public → allow; @Portal → stand down (PortalAuthGuard + client-scoped tenancy + service ownership govern); no principal → deny; super-role → allow; @RequirePermissions → allow iff all held; @AuthorizationContract('authenticated') → allow; empty/malformed perms → deny; unknown contract → deny; no contract → deny. Metadata override semantics (`getAllAndOverride`) preserved. **Portal spot-audit (26 handlers): PASS** — all portal-touched models carry `clientId`; the tenancy extension fail-closed client-scopes every portal query (Rule B) and the one lab-scope-drop path (report PDF) proves ownership first; no cross-tenant gap. No role grants / seed / schema changes. |
| **Closed by** | `feat(auth): declare explicit authorization contracts before fail-closed enforcement` (R-001a) + `fix(auth): enforce fail-closed authorization contracts` (R-001b). |
| **Verification** | `tsc --noEmit` clean ✅; real-guard regression suite `permissions.guard.spec.ts` **18 tests** ✅; `authz-contract.arch.spec.ts` **0 unclassified handlers** ✅; auth/roles/portal-auth suites (33) + portal e2e (17) green under the fail-closed guard ✅. |
| **Owner** | Unassigned |
| **Notes** | Fail-closed was NOT a one-line change — it required every portal, self-service, and alternate-guard route to declare an explicit policy first (R-001a), verified by the architecture invariant before the flip. See PERMISSION_MATRIX.md. |

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
| **Status** | **Mitigated / Closed (Platform Readiness · R-002, commit `fix(auth): close appointment read authorization gap`)** |
| **Verification required** | Spec asserting each read route 403s a principal lacking the read permission. ✅ Met — see Resolution. |
| **Owner** | Unassigned |
| **Notes** | Smallest confirmed-security fix; isolated to one clean controller. |
| **Resolution** | Gated all six read routes (`list`, `calendar`, `today`, `upcoming`, `stats`, `findOne`) with `@RequirePermissions('appointment:view')` — the correct catalog permission (NOT `record:view`, which Front Desk lacks). **Least-privilege decision (approved):** roles retaining schedule read = Superuser, Lab Technician, Receptionist; roles intentionally losing it = Authorizers, Pathologist (they hold no appointment permission by design). **Write routes unchanged** (still `record:change`); the `record:change` vs. intended `appointment:manage` write-gate mismatch is logged as a separate follow-up, deliberately out of this checkpoint's scope. **Evidence:** `apps/api/src/modules/appointments/appointments.controller.spec.ts` — 33 tests driving the real `PermissionsGuard` + real decorator metadata (per-route: requires `appointment:view`; denies a principal lacking it; allows a holder; allows super-role bypass; fails if any decorator is removed). `tsc --noEmit` clean; focused suite 33/33 green. |

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
| **Status** | **Mitigated / Closed** — all three payment-settlement controls enforced before unsafe side effects, fail-closed. |
| **Closed** | • Callback settlement idempotency • Duplicate-callback protection (no second gateway `complete()` capture) • Paid-state overwrite protection (replay/late-decline cannot re-write or clobber a settled batch) • Amount verification (gateway-settled amount === batch billed total, integer-cents compare) • Token↔batch binding (approved SpiToken for batch A cannot settle batch B) |
| **Closed by** | `fix(payments): make requisition payment callback settlement idempotent` (idempotency) + `fix(payments): validate requisition payment amount and token binding` (amount + binding). |
| **Verification** | Focused payment security regression suite (`requisition-portal.payment.spec.ts`, **14 tests**) ✅ — matching token+amount settles once; amount mismatch / missing amount fail closed; cross-batch token refused pre-capture; forged body caught authoritatively post-`complete()`; missing binding fails closed; duplicate/late-decline idempotent; atomic single-PAID. TypeScript clean ✅. See TEST_STRATEGY.md §Financial. |
| **Owner** | Unassigned |
| **Notes** | Discovered during R1 deep read; not in the original survey. |
| **Resolution — idempotency** | `markPaid` is an atomic idempotent transition (`updateMany where paymentStatus not PAID`; `paymentStatus @default(PENDING)`, never null → the guard matches every unsettled batch; returns whether this call transitioned). `handlePaymentCallback` pre-checks the settled state and short-circuits **before** calling the gateway `complete()`, so a replayed callback triggers **no second capture** and **no re-write**; its decline write is guarded so a late decline cannot flip a settled batch to FAILED. `confirmPayment` returns an already-PAID batch as-is (no overwrite of the first `paymentRef`/`paymentPaidAt`). |
| **Resolution — amount + binding** | **Token↔batch binding** is two-layered: a cheap pre-`complete()` reject when the callback body names a `TransactionIdentifier`/`OrderIdentifier` that does not match the batch's stored `paymentRef`/`batchNumber` (refused before capture), plus an authoritative post-`complete()` check that the gateway-returned `TransactionIdentifier` equals the batch's `paymentRef` (the transaction minted for this batch at Sale) — so an approved token for another batch never marks this batch PAID (a forged body is caught here). **Amount verification** compares the gateway-settled amount (`CompleteResult.settledAmount`, surfaced from `pt.TotalAmount`) to `batch.totalAmountCents` via integer cents (`Math.round(dollars*100)`). Both **fail closed** on missing/malformed/ambiguous data (no `markPaid`, batch left unsettled, error logged without tokens/PAN). No schema change (uses existing `paymentRef`/`batchNumber`/`totalAmountCents`). **Note:** binding assumes `TransactionIdentifier` is stable Sale→`complete()` (true for PowerTranz SPI); confirm with a real-gateway integration test before production. The frictionless (same-request) settle path is unchanged — no cross-batch risk — and is a candidate for the same amount check as a later hardening. **Evidence:** `requisition-portal.payment.spec.ts` — 14 tests; `tsc --noEmit` clean. |

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
| **Status** | **Mitigated / Closed** (CP-4, with R-005). |
| **Resolution** | Sender pins the postMessage `targetOrigin` to the configured canonical portal origin (never `'*'`) and posts **only to `window.parent`** (the iframe embedder — no top/opener broadcast); payload is status-only and HTML/JS-escaped against `<script>` breakout. Receiver (`CardPaymentModal` via `validateCallbackMessage`) accepts a message only when `event.origin`, `event.source` (active iframe window), payload shape, supported status, and `orderId === active batchId` all match — otherwise ignored (no UI transition, poll untouched). Browser messages remain **non-authoritative**: the authenticated status poll is the source of payment truth. |
| **Verification** | `tsc` (API+web) clean; API callback suite (10 tests — pinned origin, parent-only, nonce, XSS-safe, fail-closed origin config) + web receiver suite (11 tests — origin/source/status/orderId rejection, fail-safe); real-HTTP header check confirms the emitted callback markup. |
| **Owner** | Unassigned |
| **Notes** | Closed jointly with R-005 as one browser boundary. |

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
| **Status** | **Mitigated / Closed** (CP-4, with R-004). |
| **Resolution** | The payment callback response now carries a **route-scoped** CSP set in the controller (overriding the global Helmet headers for that response only): `default-src 'none'; script-src 'nonce-<per-response>'; base-uri 'none'; frame-ancestors <PORTAL_WEB_ORIGIN>`, and `X-Frame-Options: DENY` is removed. The inline callback script runs (nonce), and only the configured portal origin may frame it. **Global Helmet policy is unchanged for every other route** (verified by a real-HTTP header comparison: an ordinary route retains `script-src 'self'` + `X-Frame-Options: DENY`). Portal origin comes from the validated canonical `PORTAL_WEB_ORIGIN` (fail-closed in prod). |
| **Verification** | Real-HTTP header check — callback emits the nonce CSP + pinned `frame-ancestors`, no `X-Frame-Options`; ordinary route retains global helmet. Unit-level controller header test + config validation tests. |
| **Owner** | Unassigned |
| **Notes** | `frame-ancestors` (not `frame-src`) is the controlling directive for who may frame the callback. Closed jointly with R-004. |

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
| **Status** | **Divergence resolved** — both engines delegate to one authoritative statutory core. (Broader financial test expansion + the `integrityHash`/post-approval-edit tamper-evidence sub-item remain separate follow-ups.) |
| **Forensic (design review)** | Two production-wired engines diverged in **three compounding** ways, all making the workforce engine over-deduct: (1) Education Tax on **gross** vs **gross−NIS**; (2) PAYE on annualised **gross** vs **gross−NIS** (NIS-deductibility); (3) PAYE nil band **1,500,096/yr** (outdated) vs **1,700,088/yr** (current). Worked example (gross JMD 300,000/mo): workforce net 23,450,200¢ vs payroll-wizard net 24,112,100¢ — a **JMD 6,619** gap per employee-month. |
| **Resolution** | Extracted a single authoritative statutory core `common/payroll/statutory-deductions.ts` encoding the confirmed **2024/25** ruleset (NIS 3% capped; NHT 2%; statutory base = gross−NIS; Education Tax 2.25%; PAYE nil band 1,700,088/yr, 25% then 30% above 6,000,000/yr; round-per-component). **Both** engines (`payroll/payroll.service.ts` `computeAdvice`, `workforce/payroll-engine.service.ts`) now `calculateStatutoryDeductions(...)` — no duplicated NIS/NHT/EdTax/PAYE arithmetic remains in either. Engines still own gross construction, timesheet aggregation, manual/voluntary deductions, advice generation, persistence, and workflow. **Historical `PayrollEntry`/`PayAdvice` are NOT recomputed** — future calculations only. |
| **Verification** | `common/payroll/statutory-deductions.spec.ts` — golden cases (below-band / 25% / 30% / NIS-ceiling), **characterization of the original divergence** (documents A net 23,450,200 vs B net 24,112,100, Δ 661,900), delegation equality, and a **no-duplication source-scan** (neither engine file re-implements the math). Engine B's existing specs (`payroll.compute.spec.ts`, `payroll.service.spec.ts`, `payroll.controller.spec.ts`) pass **unchanged** → behavior preserved. tsc clean. |
| **Owner** | Unassigned |
| **Notes** | Engine divergence is a latent correctness landmine, not merely a test gap. Out of this checkpoint (separate items): pension pre-tax deductibility; broader financial regression expansion; the `integrityHash`-not-recomputed-on-`updateAdvice` + edits-after-approval tamper-evidence defect. |

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

## R-015 — Global app-shell content clipping at ~390px

| Field | Value |
|---|---|
| **Risk ID** | R-015 |
| **Title** | `(app)` content column has a ~700px minimum width; content/actions clip at ~390px |
| **Category** | Performance / UX (responsive) |
| **Description** | Across the authenticated `(app)` shell, the main content column does not shrink below ~700px, so at ~390px the content extends beyond the viewport and is clipped by an overflow-hidden ancestor (no horizontal page scroll). This is product-wide, not specific to any one screen. |
| **Current impact** | On ~390px viewports, actions and content are cut off. Page-level horizontal overflow is zero at all widths; the effect is clipped (not scrollable) content. Desktop-first product, so real-world staff impact is currently limited. |
| **Evidence** | Phase-3A runtime certification at committed HEAD `c352dee`: identical clipping observed on `/diagnostic-case/:id` (band card width ~679px at 390), `/records`, and `/dashboard` (buttons extend past the 390 viewport; `scrollWidth == clientWidth` at 390/768/1024/1440/1920). |
| **Affected modules** | web — `(app)` shell layout (global); all authenticated pages |
| **Severity** | Low |
| **Likelihood** | Medium (reproducible on any ≤~700px viewport) |
| **Recommended checkpoint** | Separate responsive-shell workstream (not part of Phase 3A; not a Diagnostic Case / A12 / Final Polish defect). |
| **Status** | Open |
| **Verification required** | Define the supported-width policy; confirm the content column reflows below ~700px without clipping, verified at 390/768/1024/1440/1920. |
| **Owner** | Unassigned |
| **Notes** | Explicitly **not fixed** and **not introduced by** A12/Final Polish — certified as a pre-existing, global limitation. Tracked here per the Phase-3A certification (ARCHITECTURE_LEDGER.md §15). |

## R-016 — Backend transactional audit-chain integrity (Program 2 RELEASE Blocker)

| Field | Value |
|---|---|
| **Risk ID** | R-016 |
| **Title** | SYSTEM-scoped CRITICAL_TRANSACTIONAL audit capture fails on the shared `system` hash chain |
| **Category** | Security — audit persistence integrity |
| **Description** | Any `CRITICAL_TRANSACTIONAL` capture emitted SYSTEM-scoped appends to the shared `system` per-scope hash chain, where orphaned pre-existing rows (P2-4 `tat` scheduler writes) collide on the chain sequence, so the transactional append raises and the triggering request returns 500. This affects **both** SYSTEM-scoped PHI reads (`AUDIT_EVENT_PHI_ACCESSED`) **and** governed exports (`AUDIT_EXPORTED`). Because both captures are scoped by `isSystemReader(principal)` (the P2-7C precedent), **every export by an elevated/system-authorized reader captures SYSTEM regardless of the export's query scope** — so a superuser's base, LAB-selected, CSV, NDJSON, and PHI exports all fail closed. The Audit UI **correctly fails closed** (no file / no partial PHI); the backend **correctly refuses** rather than emit an unrecorded egress or PHI access. |
| **Current impact** | (1) SYSTEM-scoped PHI reads via the audit query API are unavailable (fail closed). (2) **ALL governed exports by an elevated/system reader are unavailable** — base + PHI, CSV + NDJSON — because `AUDIT_EXPORTED` captures SYSTEM for elevated readers. A **non-elevated LAB reader** (audit:read, no read_system, non-superuser) captures on the intact LAB chain and is unaffected. LAB-scoped non-PHI *reads* are unaffected. No data leaks; every failure is safe (capture-before-egress → zero bytes). |
| **Evidence** | PHI: P2-8D/P2-8E live drive (superuser PHI list `[500,500,200]`, auto-revert). Exports: P2-9B live drive (superuser base CSV / base NDJSON / PHI all POST 500, no file, fail-closed error toast). Identical mechanism. Recorder tx: `audit-recorder.service.ts` (`recordAuditEventPhiAccessed`, `recordAuditExported`); scoping via `runSystemAsCurrentActor` at the `audit-query.service.ts` / `audit-export.coordinator.ts` call sites; root cause is the P2-4 shared `system` chain. |
| **Affected modules** | audit (recorder / query / export), and the shared `system` chain seeded by the tat scheduler |
| **Severity** | High (now a release blocker — a required Enterprise Audit capability, export, is universally unusable for elevated readers) |
| **Likelihood** | High (deterministic on every SYSTEM-scoped critical capture today) |
| **Recommended checkpoint** | **P2-R016** — a dedicated, design-only-first backend audit-chain **forensic + remediation scope audit** (chain segmentation / orphan-row reconciliation) BEFORE any chain data or persistence code is touched. It must NOT reopen or weaken P2-9A/P2-9B, change durability, reroute elevated captures, or introduce fallback behavior. Sequenced **before P2-10**. |
| **Status** | **Partially Mitigated** — **R-016a CLOSED** (active SYSTEM write path restored); **R-016b** (sealed-generation monitor architecture) is a separate authorized follow-up, design-review-first. |
| **Forensic (R-016 design review)** | The shared `system` chain held 3 orphan events (seq 1–3) with **no head** (empirically confirmed) → every SYSTEM-scoped `CRITICAL_TRANSACTIONAL` append hit `HEADLESS_HISTORY` at `AuditChainService.allocate` and rolled back (500). Interior linkage is **broken** (seq 2 `prevHash` ≠ seq 1 `selfHash`), and each row's `selfHash` **covers chain topology** (`chainId`/`sequence`/`prevHash`) — so the rows can be neither re-linked nor relocated. Head reconciliation is therefore unsafe (would leave an active chain that fails verification). |
| **Resolution — R-016a** | `deriveChainId(SYSTEM)` now routes to an **active generation** (`ACTIVE_SYSTEM_CHAIN_ID = "system:g1"`), genesis-fresh and fully verifiable; the frozen generation-0 `"system"` chain is never appended again. No historical row mutated, no hash recomputed, no monitor/verifier semantics changed. **Evidence:** `audit-chain.spec.ts` (deriveChainId), `r016a-active-system-generation.regression.spec.ts` (genesis + concurrent contiguity + isolation from a headless legacy segment), `audit-recorder.integration.spec.ts` (real SYSTEM capture → active generation, valid selfHash), `audit-verification.service.spec.ts` (active SYSTEM chain verifies from genesis). tsc clean; all 9 audit integration suites (74) green. |
| **Known accepted condition (until R-016b)** | The integrity **monitor** still enumerates the frozen `"system"` generation and, under **unchanged semantics**, reports it `COMPROMISED`. This is **preserved behavior**, not a regression — the monitor correctly states "a historical chain is not verifiable." Reclassifying it (sealed-generation architecture: what a sealed generation is, who seals, enumeration, HEALTHY/SEALED/COMPROMISED, API/dashboard, per-generation verification) is the scope of **R-016b** (architectural, design-review-first). |
| **Verification (R-016a success criteria)** | SYSTEM PHI reads + governed exports append on the active chain ✅; active SYSTEM chain verifies from genesis ✅; historical 3-row segment immutable ✅; no duplicate/skipped sequences ✅; concurrent allocation cannot reconnect to the historical segment ✅; LAB chains unchanged ✅; Program 2 verification **behavior preserved** (no invariant weakened, no false HEALTHY) ✅. |
| **Owner** | Unassigned (backend) |
| **Follow-up** | **R-016b** — sealed-generation architecture (verifier/monitor enhancement). Also revisit `system-chain-contamination.regression.spec.ts`, whose premise now shifts to the frozen generation. |
| **Notes** | UI/Export UI/backend fail-closed: PASS. P2-9A/P2-9B unchanged. Do **not** clean/repair the frozen chain inside a UI/feature checkpoint. |

---

## Related documents
- PERMISSION_MATRIX.md (R-001, R-002)
- LOGGING_STANDARD.md (R-006)
- TEST_STRATEGY.md (R-007, R-008)
- THEME_MIGRATION.md (R-009)
- SECURITY_ARCHITECTURE.md (R-003, R-004, R-005)
- ACCESSIBILITY_DEBT_REGISTER.md (R-010)
- PROGRAM_2_CERTIFICATION_RECORD.md (R-016)
- PRODUCTION_READINESS_CHECKLIST.md (cross-cutting)

## Future revisions
- Add risks as new checkpoints and audits surface them; assign owners; update Status as checkpoints land.
- Re-score severity/likelihood after each remediation.
- Split accessibility, realtime, loading, and performance into their own dedicated registers if entries grow.

## Verification requirements
- Every risk must cite file:line evidence before it is acted on.
- No risk is closed without the Verification-required step being demonstrated.
- This register is documentation only; it authorizes no code change by itself.
