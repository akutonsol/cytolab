# Program 7 — Enterprise IAM — ARCHITECTURE REVIEW (v1)

**Status:** Architecture & governance analysis — **for review**. Authorized by the ratified Program 7 Charter (v1.1).
**No schema changes, APIs, or implementation are proposed or authorized here.** This document establishes the
architectural boundaries and integration seams between Enterprise IAM and the existing platform (Programs 1–6), so that
those boundaries can be agreed before the Cross-Program Boundary Review, the Guardrails stage, and any phase design.

Charter: [`PROGRAM_7_CHARTER.md`](./PROGRAM_7_CHARTER.md) · Reconciles with:
[`architecture/TARGET_PLATFORM_ARCHITECTURE.md`](./architecture/TARGET_PLATFORM_ARCHITECTURE.md) ·
[`architecture/HYBRID_TENANCY_AND_CUSTOM_DOMAINS.md`](./architecture/HYBRID_TENANCY_AND_CUSTOM_DOMAINS.md).

---

## 1. Method & constraint
This review reads the current implementation and states target **boundaries**, not designs. It proposes no tables,
routes, or code. Every position below is subject to approval and may be revised at the Guardrails stage. The analysis
is grounded in the current-state map (file:symbol references retained so claims are checkable).

## 2. Current-state summary (the incumbent Program 7 extends)
- **Authentication** — two independent JWT families, both passport-based: **staff** (`AuthService`, `JwtStrategy`,
  `JwtAuthGuard`; HttpOnly access+refresh cookies; claims `sub/labId/roles[]/permissions[]/isSuperRole/sid`, `aud:'staff'`)
  and **portal** (`PortalAuthService`, `PortalJwtStrategy`, `PortalAuthGuard`; bearer, `aud:'portal'`). Session/token
  lifecycle in `SessionService` (opaque rotating refresh tokens, device-bound `UserSession`, idle/max-lifetime). MFA,
  lockout, trusted-device, password-policy in `src/modules/security/*`. **All auth is local password + JWT.**
- **Authorization** — a single global `PermissionsGuard` (`APP_GUARD`, fail-closed) evaluates flat `"<object>:<action>"`
  permission codes against the **JWT claim array** `user.permissions`; `isSuperRole` bypasses. Catalogue + roles in
  `prisma/seed.ts` (`STANDARD_OBJECTS`, `SPECIAL_OBJECTS`, `buildRoleDefs`, no-default-grant). Services do **not**
  re-check permissions.
- **Identity model** — `User` (per-lab: `@@unique([labId,email])`), `Account`→`Workspace` **below** `Lab`; `Role`
  (global, `@unique` name, `isSuperRole`, `scope User|Workspace`), `Permission` (`code @unique`), joins `UserRole`/
  `RolePermission`. `PortalUser` is the external identity. **`Lab` is the identity + tenancy ceiling.**
- **Tenancy** — `labId` isolation via `LabContext` (`AsyncLocalStorage`) + `tenancyExtension` (auto-scopes reads,
  stamps writes; fail-closed with no lab context; `runSystem` bypass). **`labId` is sourced only from the JWT.**
  `Lab` already carries `tenancyMode POOL|SILO`, `databaseSecretRef`, `dataRegion`; `LabDomain` maps hostnames→lab.
- **Audit / immutable events** — `AuditRecorder` façade + append-only **hash-chained** `AuditEvent` ledger
  (`AuditChainHead`/`AuditChainSeal`, DB CHECK-constrained). Identity/authz events already exist as typed emitters
  (`recordRoleCreated/Updated/Deleted`, `recordRoleAssignmentChanged`, `recordSessionTerminated`, …) with **counts-only,
  id/name-free** metadata; attribution comes from `ExecutionContext`.
- **Notably absent (current → target gap):** no SAML/OIDC/SSO/SCIM; no Organization/Region/Network/Group above `Lab`;
  no runtime service-account/API-key (only reserved `SERVICE` actor + `servicePrincipal` field + `api-key|service`
  contract *placeholders*); no ABAC/ReBAC; permissions are JWT-baked (revocation lags until refresh).

## 3. Target architectural model — Identity as a Platform Service (Principle 9)
Enterprise IAM is one shared capability that **owns** authentication and authorization and that every program
**consumes**. The architecture adds **seams in front of / above** the incumbent, never replacements inside it:
- a **federation front-end** that resolves external credentials to the *same* internal principal + session contract;
- an **enterprise-RBAC layer** that computes a richer effective-permission set but feeds the *same* guard boundary;
- an **administrative overlay** (Organizations) *above* `Lab` that never participates in data isolation;
- an **identity-governance event stream** on the *existing* immutable audit ledger.

## 4. Answers to the Architecture Review questions

### Q1 — How does IAM integrate with the existing authentication stack?
Enterprise authentication (7A) is an **additional front-end**, not a replacement. SAML/OIDC/OAuth verification resolves
to the **same `AuthUser` principal** and the **same `SessionService` session + cookie/JWT contract** the platform
already issues; everything downstream (guards, `@CurrentUser()`, realtime) is unchanged. Local password auth remains
authoritative until a governed, per-organization migration retires it. Service identities (7A) fill the **already-
reserved** `SERVICE` actor / `servicePrincipal` / `api-key|service`-contract seams rather than introducing a parallel
principal type. **Integration seam:** "credential verification → principal establishment," upstream of the guards.

### Q2 — How does enterprise RBAC coexist with current permissions?
**Additively.** The existing `"<object>:<action>"` catalogue remains the authorization vocabulary and the no-default-
grant + super-role model is preserved. Enterprise capabilities (custom roles, deterministic permission inheritance,
resource/scoped permissions) **layer above** the current model and resolve **down to the same flat effective-permission
set** the guard already consumes. New enterprise capabilities appear as **additive permission objects**, exactly as
Program 6 added `aimodel:*`/`clinicalperf:*`. Coexistence rule: enrich *how* effective permissions are computed; do not
change *what* a permission code means or *where* it is enforced.

### Q3 — Where is the authoritative permission-evaluation boundary?
It **stays exactly where it is:** the single global `PermissionsGuard`. Enterprise RBAC changes permission *computation*
(upstream — at principal establishment / token issuance), never the *enforcement point*. One authoritative boundary,
fail-closed, unchanged. Tenancy isolation remains a **separate, orthogonal** DB-layer boundary (`tenancyExtension`) and
is not merged into authorization. (**Open decision D1:** whether effective permissions remain JWT-baked — current, with
revocation lag — or move to live per-request evaluation. Escalated to Guardrails.)

### Q4 — How are Organizations related to `labId` without replacing tenancy?
**Organizations are an administrative overlay strictly *above* `Lab`; `labId` remains the sole operational isolation
anchor (Principle 4).** The Organization hierarchy (7D: Organization→Region→Network→Lab→Department→Team) groups labs for
**administration and delegation**; it is **never consulted by `tenancyExtension` or `LabContext`**, which continue to
isolate on `labId` sourced only from the JWT. Organization membership influences **who may administer which labs** (an
authorization/admin-scoping concern evaluated at the guard/admin layer), never **what data is isolated**. Any cross-lab
administrative action is explicit and audited via the existing `organizationScope = CROSS_LAB` classification. This is
the review's most important safeguard: enterprise hierarchy must not silently redefine the tenancy boundary.

### Q5 — Which services become identity-aware consumers?
The **IAM-owning** and **identity-consuming** surfaces: `auth`/`portal`/`security`/`session` (owners), the `roles` and
`users` admin CRUD, the new 7D–7H administrative + reporting surfaces, the `audit` module (already consumes identity
events), and `RealtimeGateway` (consumes the principal for room routing). These **consume** identity through the shared
principal + guard; none re-implements identity logic.

### Q6 — Which services remain identity-agnostic?
The **clinical modules (Programs 1–5:** records, result sheets, patients, WSI) and the **AI modules (Program 6)** remain
identity-agnostic **consumers** — they receive an already-established principal (`@CurrentUser()`) and enforce access
via the shared guard; they never implement identity logic (Principle 9). The **tenancy extension stays identity-agnostic
at the data layer** — it knows only `labId` from context. This preserves "identity is a platform service": no clinical
or AI module owns any authentication, authorization, or federation behaviour.

### Q7 — How are immutable identity-governance events produced?
Through the **existing** `AuditRecorder` façade and hash-chained `AuditEvent` ledger — **no parallel audit system.**
7G's identity-governance events (login history, permission history, role history, administrative history, SCIM history)
are **additive typed emitters** following the proven `recordRoleCreated/…/recordRoleAssignmentChanged` /
`recordSessionTerminated` pattern (category `AUTHORIZATION`/`AUTHENTICATION`, counts-only, id/name-free metadata,
attribution from `ExecutionContext`, durability tiers, chain-sealed). This satisfies Principle 5 (identity evidence
immutable/append-only/traceable/reproducible/auditable) by **reusing** the Program-5/6 audit-immutability machinery,
not rebuilding it.

### Q8 — What migration path exists from current mechanisms to the expanded architecture?
**Evolutionary and additive (Principle 8), phase-gated exactly like Program 6:**
1. Federation is added **in front of** local auth; both resolve to one principal. Local password auth persists.
2. Enterprise RBAC is added **over** the current catalogue; the guard contract is unchanged.
3. The Organization overlay is added **above** `Lab`; tenancy is untouched.
4. Each capability ships behind the existing **per-lab FeatureKey gating**, so Enterprise IAM is **opt-in per lab/org**
   and the base experience is unchanged (base-vs-advanced tiering already in the platform).
5. Reserved seams (`SERVICE` actor + `servicePrincipal`, `api-key|service` contracts, `tenancyMode POOL|SILO`,
   `LabDomain`, `RoleScope.Workspace`) are the designated extension points — no big-bang cutover.
6. Every phase (7A–7H) is additive, non-regressive, and accepted through a folded exact-head acceptance gate before
   freeze — retiring any incumbent component happens only through an explicit, separately governed migration step.

## 5. Phase → integration-point map (architecture only)
| Phase | Primary seam | Touches (extends, never replaces) |
|---|---|---|
| 7A Authentication | credential→principal front-end | `AuthService`/`JwtStrategy`/`SessionService`; reserved `SERVICE` principal |
| 7B Identity Lifecycle | provisioning into the identity model | `User`/`Account` admin path; SCIM as an additive provisioning source |
| 7C Enterprise Authorization | effective-permission computation | `seed.ts` catalogue + `buildRoleDefs`; `PermissionsGuard` contract preserved |
| 7D Organization Model | administrative overlay above `Lab` | new admin hierarchy; **never** `tenancyExtension`/`labId` |
| 7E Administration | delegated/scoped/break-glass admin | admin authorization scoping; audited cross-lab actions |
| 7F Enterprise Security | session/token/policy governance | `SessionService`, `security/*`, conditional-access hooks |
| 7G Identity Governance | immutable identity events | `AuditRecorder` + hash-chain ledger (additive emitters) |
| 7H Operational Reporting | read-only identity analytics | consumes 7G evidence; no enforcement authority |

## 6. Principle conformance
All nine charter principles are upheld by the boundaries above — most critically **P3** (identity never becomes clinical
authority: no IAM construct touches sign-out, diagnosis, model approval, or Program-5 workflow authority), **P4** (Lab
tenancy stays authoritative; Organizations are administrative only), **P8** (evolutionary — incumbent stays
authoritative until governed migration), and **P9** (identity owned centrally, consumed everywhere).

## 7. Open architectural decisions (to resolve at Guardrails / Cross-Program Boundary Review)
- **D1 — Permission freshness:** keep JWT-baked permissions (revocation lag) vs. live per-request evaluation.
- **D2 — Role scoping:** `Role` is currently **global**; enterprise custom roles may need lab/org scoping (`RoleScope`
  already reserves `Workspace`). Decide the scoping model without breaking the global super-role bypass.
- **D3 — Service-account/API-key runtime:** promote the reserved `SERVICE`/`api-key` seams into a real inbound
  credential model (7A/7F) — issuer, store, guard, governance.
- **D4 — Organization model shape:** the administrative hierarchy above `Lab` — explicitly **not** a tenancy construct;
  define how admin scoping reads it at the guard/admin layer.
- **D5 — Federated-identity linking:** how a SAML/OIDC subject maps to a `User` (account linking, SCIM JIT
  provisioning) while preserving `@@unique([labId,email])` and per-lab identity.
- **D6 — Platform reconciliation:** align the Organization overlay with the target platform's `POOL|SILO` tenancy,
  `LabDomain` custom domains, and the Control-Center control plane — is an Organization the same grouping the Control
  Center administers, or distinct?

### 7.1 Governance disposition (Architecture-Review approval, 2026-07-30)
The Architecture Review was **APPROVED**; the open decisions were dispositioned by governance as follows:
- **D1 (permission freshness)** → **deferred to Phase 7C** (Enterprise Authorization) — an authorization-semantics/
  performance choice, not a platform-architecture choice.
- **D2 (role scoping)** → **carried to Phase 7C**; the architecture merely acknowledges scoped roles.
- **D3 (service accounts / API identities)** → **promoted to a charter principle** — Principle 11 (human vs non-human
  principal classes). No longer an open question; the runtime credential model follows at phase design.
- **D4 (Organization model shape)** → **carried to Phase 7D**; the invariant (administrative, not tenancy) is already
  fixed by Principle 4.
- **D5 (federated-identity linking / SCIM JIT)** → **carried to Phase 7B** (Identity Lifecycle).
- **D6 (hybrid-tenancy reconciliation)** → **escalated to the Cross-Program Boundary Review** (greatest cross-cutting
  impact; must be resolved before implementation). See `PROGRAM_7_CROSS_PROGRAM_BOUNDARY_REVIEW.md`.

## 8. Reconciliation with the target platform
The platform already encodes hybrid-tenancy primitives on `Lab` (`tenancyMode POOL|SILO`, `databaseSecretRef`,
`dataRegion`, `LabDomain`). Program 7 keeps these as the **data-isolation** mechanism and adds an **administrative**
Organization overlay as a distinct concern. The Cross-Program Boundary Review must confirm these two axes
(data-isolation vs. administrative-grouping) stay orthogonal and that neither the Control Center nor the Organization
model can redefine `labId` isolation.

## 9. What this review does NOT authorize
No schema, migration, API, guard change, or implementation. The Cross-Program Boundary Review (proving identity cannot
encroach on clinical/AI authority) and the Guardrails & Governance Decisions stage remain **pending**; Phase 7A design
begins only after those are approved.
