# Osieri — Enterprise Administration & Controls Workspace (Phase 2D) composition feasibility audit

| Field | Value |
|---|---|
| Status | Audit complete — composition is feasible and truthful for the Existing/Reusable set; secrets are already owner-protected; schema-gated items named |
| Current Phase | Osieri Phase 2D (Enterprise Administration & Controls Workspace) |
| Owner | Founder |
| Dependencies | [OSIERI_ENTERPRISE_ADMINISTRATION_WORKSPACE.md](OSIERI_ENTERPRISE_ADMINISTRATION_WORKSPACE.md) (approved architecture), [OSIERI_QUALITY_FEASIBILITY_AUDIT.md](OSIERI_QUALITY_FEASIBILITY_AUDIT.md) / [OSIERI_SIGNOUT_FEASIBILITY_AUDIT.md](OSIERI_SIGNOUT_FEASIBILITY_AUDIT.md) (method), Helix v1.0 (frozen) |
| Last Updated | 2026-07-12 |
| Priority | P1 |
| Expected Next Milestone | Architectural review of this audit → (separately) an implementation plan; nothing built until then |

This audit answers **one** question and nothing else: **can the Enterprise Administration & Controls
Workspace be built truthfully today through composition alone, using existing owner modules?** It is an
audit only — **no code, no schema, no permission change, no Helix change, no roadmap edit, no commit.**
Every claim is verified against `apps/api/src/modules/*`, `apps/api/prisma/schema.prisma`, and
`apps/web/src/app/(app)/*`. Where an owner does not expose something today, it is stated truthfully and
never invented.

---

## Governing rule (binding for this workspace)

**Enterprise Administration may reveal recorded configuration state and invoke its owner. It must never
expose a secret value, bypass owner validation, bypass owner permissions, bypass tenancy, bypass
auditing, duplicate an owner workflow, or compute administration state that is not already recorded.**
If an owner does not expose something today, the workspace says so; it does not fabricate it.

---

## The one question, answered

**Yes — for a well-bounded compose-only scope, and the boundary is unusually clean because the owners
already do the hard part.** Every administrative capability has an owner module, service, route, model,
and permission. Critically, **the owner read paths already exclude secrets by design** (the FHIR
`endpointSelect` carries the comment *"Never leak secrets to the client"* and omits `authToken`/
`clientSecret`; MFA `getStatus()` returns only enabled-flags + a backup-code count; the security service
returns no tokens/hashes). So composition can surface `configured / enabled / disabled / last verified /
status / environment` truthfully **without ever touching a secret**. The genuinely new administrative
constructs (credential vault, notification templates, `Released`/`Archived`, provider registry,
environment promotion, config-change ledger, delegated/multi-site admin, department hierarchy,
transition/approval engines) have **no owner today** and are named as schema-gated or prohibited-to-simulate.

---

## 1. Classification taxonomy

Each capability is exactly one of:

- **Existing** — full owner (service+route+model+permission) *and* a shipped admin UI; the workspace links to it.
- **Reusable through composition** — owner read exists and is safe to surface read-only; no new owner work.
- **Partially supported** — an owner exists but the admin view/config is thin, embedded, or superuser-only; composition is possible but limited.
- **Requires schema** — no owner model exists; needs a data-model decision before anything truthful can be shown.
- **Explicitly prohibited to simulate** — must never be faked in a composition layer (secrets, free status editing, invented registries/ledgers/engines).

---

## 2. Capability audit

Columns: **Capability · Class · Owner module·service · Route(s) · Model(s) · Recorded evidence · Permission · Composition strategy · Risk.** All routes/services/models/permissions verified to exist.

### 2A. Laboratory configuration

| Capability | Class | Owner · service | Route(s) | Model | Evidence | Permission | Composition strategy | Risk |
|---|---|---|---|---|---|---|---|---|
| Lab profile | Existing | `lab` · `LabService` | `GET/PUT /lab/profile` | `Lab` | profile fields | `applicationprefs:view/change` | Read summary + link `/settings` | Low |
| Branding | Existing | `lab` · `LabService` | `GET /lab/branding` | `Lab` | branding fields | `applicationprefs:view` | Read + link | Low |
| Logo | Existing | `lab` · `LabService` | `POST/DELETE /lab/logo` | `Lab` | logo asset ref | `applicationprefs:change` | Show presence; invoke owner | Low |
| Departments (flat) | Existing | `departments` · `DepartmentsService` | `GET /departments` | `Department` | department rows | `department:view` | Read list + link `/departments` | Low |
| Operating/report/system prefs | Reusable | `lab` · `LabService` | `GET /lab/profile` | `Lab` | recorded prefs | `applicationprefs:view` | Read verbatim | Low |
| Turnaround targets | Partially supported | `tat` · (TAT) | `GET /tat` | Record timestamps | recorded TAT data | `record:view` | Read display; **no config-policy object** | Med |
| AI settings | Existing | `ai` · `AiReportingService` | `/…ai` | `LabAiSettings` | enablement/config | `applicationprefs:view` | Read enablement state | Low |
| Department hierarchy | Requires schema | — | — | — | — | — | No parent/child in `Department` | — |

### 2B. Identity, access & RBAC

| Capability | Class | Owner · service | Route(s) | Model | Evidence | Permission | Composition strategy | Risk |
|---|---|---|---|---|---|---|---|---|
| Users | Existing | `users` · `UsersService` | `GET /users` | `User`, `UserRole` | directory + roles | `user:view` | Read directory + link `/users` | Low |
| Roles | Existing | `roles` · `RolesService` | `GET /roles` | `Role`, `RolePermission` | role→perm matrix | `role:view` | Read matrix + link `/roles` | Low |
| Permissions catalog | Existing | `roles` · `RolesService` | `GET /roles` (+ `Permission`) | `Permission` | seeded catalog | `role:view` | Descriptive map only | Low |
| RBAC resolution | Reusable | `auth` (guard) | n/a (server) | `RolePermission`, `isSuperRole` | `has()` result | (surfaced) | Display `isSuperRole` bypass honestly | Med (never disguise superuser-only) |
| Account lifecycle | Reusable | `users`/`security`/`portal` | `/users`, `/auth` | `User` (isActive/pwd expiry), `PasswordHistory`, `PortalAccessToken` | active/invited/reset **status** | `user:view`/`system:security` | Status only; **no token values** | Med |

### 2C. Security posture

| Capability | Class | Owner · service | Route(s) | Model | Evidence | Permission | Composition strategy | Risk |
|---|---|---|---|---|---|---|---|---|
| Login history | Reusable | `security` · `SecurityService` | `GET /auth/login-attempts` | `LoginAttempt` | attempts/IP/outcome | `system:security` | Read-only access-governance | Med (sensitive; gate strictly) |
| Active sessions | Reusable | `security` · `SecurityService` | `GET /auth/sessions` | `UserSession` | active sessions | `system:security` | Read; invoke owner to terminate | Med |
| Locked accounts | Reusable | `security` · `SecurityService` | `GET /auth/locked-users` | `AccountLock` | lock state | `system:security` | Read; invoke owner to unlock | Low |
| MFA coverage | Reusable | `security` · `MfaService` | `GET /auth/mfa/status` | `MfaConfig` | `totpEnabled`/`emailEnabled`/count | `system:security` | **enabled-flags only** | Low (secret excluded by owner) |
| Password policy | Existing | `security` · `PasswordPolicyService` | `GET /security/password-policy` | (policy) | recorded policy | `system:security` | Read + link | Low |
| Security alerts | Reusable | `security` · `SecurityService` | `GET /security/alerts` | `SecurityAlert` | alert rows | `system:security` | Read; invoke owner to resolve | Low |
| Trusted devices | Reusable | `security` · `SecurityService` | (security) | `TrustedDevice` | device list | `system:security` | Read; invoke owner to revoke | Low |

### 2D. Client & provider administration

| Capability | Class | Owner · service | Route(s) | Model | Evidence | Permission | Composition strategy | Risk |
|---|---|---|---|---|---|---|---|---|
| Clients | Existing | `clients` · `ClientsService` | `GET /clients` | `Client`, `ClientType`, `ClientAddress` | directory | `client:view` | Read + link `/clients` | Low |
| Portal access | Partially supported | `portal` · (portal admin) | (portal) | `PortalUser`, `PortalAccessToken` | access **status** | `portaluser:*` **(unseeded)** | Status only; superuser-only | Med |
| Referring provider / facility registry | Requires schema | — | — | — | (represented as `Client`) | — | No first-class model | — |

### 2E. Lab configuration (codes / sheets / forms)

| Capability | Class | Owner · service | Route(s) | Model | Evidence | Permission | Composition strategy | Risk |
|---|---|---|---|---|---|---|---|---|
| Lab codes | Existing | `lab-codes` · `LabCodesService` | `GET /…lab-codes` | `LabCode` | code catalog | `labcode:view` | Read + link `/lab-codes` | Low |
| Code sheets | Existing | `code-sheets` · `CodeSheetsService` | (code-sheets) | `CodeSheet` | sheet config | `codesheet:view` | Read + link | Low |
| Form configuration | Existing | `form-config` · `FormConfigService` | `GET /…form-config` | `FormConfig` | clinical-form config | `formconfig:view/manage` | Read + link `/settings/forms` | Low (superuser-only) |
| Specimen types / result codes / reference ranges | Partially supported | (embedded in form/lab-code config) | — | (no first-class model) | as recorded | — | Surface as-recorded; do not invent | Med |

### 2F. Workflow & record lifecycle

| Capability | Class | Owner · service | Route(s) | Model | Evidence | Permission | Composition strategy | Risk |
|---|---|---|---|---|---|---|---|---|
| Record status + history | Reusable | `records` · `RecordsService` | `findOne` (`statusHistory`), `PATCH /specimen/status/:id` | `RecordStatusEvent`, `RecordStatus` | status + events | `record:view` / `recordstatus:change` | **Observe** history; changes via constrained owner `transition()` | Med (never a free editor) |
| Escalation / recall settings | Partially supported | `escalation`/`recall` | `/escalations`, `/recalls` | `EscalationRecord`, `RecallRecord` | recorded data | `record:view` | Read; **no explicit config-policy object** | Med |
| Transition-policy / approval-chain engine | Requires schema | — | — | (`ALLOWED_TRANSITIONS` is code) | — | — | Not data-configurable today | — |
| `Released` / `Archived` statuses | Requires schema | — | — | not in `RecordStatus` enum | — | — | Not modeled | — |

### 2G. Integrations

| Capability | Class | Owner · service | Route(s) | Model | Evidence | Permission | Composition strategy | Risk |
|---|---|---|---|---|---|---|---|---|
| FHIR endpoints | Reusable | `fhir` · `FhirService` | `GET /fhir/endpoints` | `FHIREndpoint` | name/baseUrl/env/`lastTestStatus` | `record:view` | Read owner select (**secrets already excluded**) | Low |
| FHIR transmission health | Reusable | `fhir` · `FhirService` | `GET /fhir/transmissions` | `FHIRTransmission` | outcome/timestamps | `record:view` | Read health | Low |
| Credential vault / webhooks / env promotion | Requires schema | — | — | no `Credential`/`Webhook`/`Environment` model | — | — | No owner today | — |

### 2H. Notifications

| Capability | Class | Owner · service | Route(s) | Model | Evidence | Permission | Composition strategy | Risk |
|---|---|---|---|---|---|---|---|---|
| Notification preferences | Existing | `notifications` · `NotificationsService` | `GET /notifications` | `UserNotificationPreference` | recorded prefs | `notification:view/change` | Read + link `/notifications` | Low |
| Notification templates / delivery config | Requires schema | — | — | no `NotificationTemplate` model | — | — | No owner today | — |

### 2I. Billing & commercial configuration

| Capability | Class | Owner · service | Route(s) | Model | Evidence | Permission | Composition strategy | Risk |
|---|---|---|---|---|---|---|---|---|
| Services / pricing | Existing | `services-catalog` · `ServicesCatalogService` | `GET /services` | `Service` | per-service price | `service:view` | Read + link `/services` | Low |
| Taxes | Existing | `taxes` · `TaxesService` | (taxes) | `Tax` | tax config | `tax:view` | Read + link | Low |
| Billing / payments | Existing | `billing`/`payments` · `BillingService`/`PaymentsService` | `/billing`, `/payments` | `Bill`, `BillLine`, `BillTax`, `Payment` | recorded bills/payments | `bill:*`/`payment:*` | Read summary; **never calculate** | Med (keep separate from clinical config) |
| Subscription plans / tiers | Requires schema | — | — | no `Plan`/`Subscription` | — | — | No owner today | — |

### 2J. Platform controls

| Capability | Class | Owner · service | Route(s) | Model | Evidence | Permission | Composition strategy | Risk |
|---|---|---|---|---|---|---|---|---|
| Feature flags / modules | Existing | `lab-features` · `LabFeaturesService` | `GET /lab-features`, `PATCH /lab-features/:key` | `LabFeature` | enabled state/tier | **`SuperuserGuard`** (no permission code) | Read status; toggle via superuser owner | Med (guard-gated, surface honestly) |
| System health / logs / support | Existing | `system` · `SystemHealthService` | `/system`, `/system/logs`, `/system/support` | `MaintenanceWindow`, unified log | health/log rows | `system:health` | Read + link | Low |
| Config-change audit ledger (cross-domain) | Requires schema | — | — | per-domain audit only | — | — | No unified ledger | — |
| Delegated / multi-site administration | Requires schema | — | — | single `Account`/`Lab` tenancy | — | — | No owner today | — |

---

## 3. Security audit (secret-by-secret)

The workspace may expose only: **configured · enabled · disabled · last verified · status · environment.**
Never the underlying secret. The good news: **the owner reads already enforce this.**

| Secret / credential | Model · field | Can it safely appear? | Why / owner behaviour |
|---|---|---|---|
| Staff password | `User.passwordHash` | **No** | One-way hash; never read by any owner endpoint into a response |
| Portal password | `PortalUser.passwordHash` | **No** | Same — hash only |
| Password history | `PasswordHistory` | **No** | Hashes for reuse-prevention; never surfaced |
| Session refresh token | `RefreshToken.token` | **No** | Auth material; owner never returns it; surface *session existence* only |
| Portal access/reset token | `PortalAccessToken.tokenHash` | **No** | Single-use hashed token; surface *invited/accepted status* only |
| TOTP secret | `MfaConfig.totpSecret` | **No** | Encrypted; `getStatus()` returns only `totpEnabled`/`emailEnabled`/`backupCodesRemaining` (count). Setup QR is returned **once** to the enrolling user via self-service `POST /auth/mfa/totp/setup` — never a composable admin read |
| MFA backup codes | `MfaConfig.backupCodes` | **No** | Hashed; only a *remaining count* is exposed |
| FHIR bearer/API token | `FHIREndpoint.authToken` | **No** | Excluded from `endpointSelect` (owner comment: *"Never leak secrets to the client"*); used only server-side in `authHeaders()` |
| FHIR OAuth client secret | `FHIREndpoint.clientSecret` | **No** | Same — excluded from `endpointSelect` |
| FHIR OAuth client id | `FHIREndpoint.clientId` | **Yes (as configured-only)** | Returned by owner select; not a secret, but surface as identity/status, not for reuse |
| FHIR endpoint status | `FHIREndpoint.isActive/isSandbox/lastTestStatus/lastTestedAt` | **Yes** | Exactly the allowed set (configured/enabled/environment/last-verified) |
| Webhook secrets / connection strings / API keys | — | **N/A** | No such model exists (Requires schema) — cannot appear, cannot be simulated |

**Verdict:** the aggregate payload may carry **only** status/enablement/environment/last-verified fields.
Because every composable owner read already omits secrets, the workspace does **not** need any new
"safe DTO" work to be secret-safe — it reuses owner reads verbatim. Any panel that would need a secret to
be meaningful (e.g. showing a live credential) is **prohibited to simulate** and simply shows status.

---

## 4. Permission audit

- **Every referenced permission exists** in the seeded catalog (`seed.ts`: `STANDARD_OBJECTS × {view,create,change,delete}` + extras + `SPECIAL_OBJECTS`), except the two below which are **declared in controllers but not seeded**.
- **Declared-but-unseeded:** `portaluser:*` and `changerequest:*` — the seed deletes any uncatalogued permission, so **no role can ever hold them**; they are reachable only via the `isSuperRole` bypass. The workspace must show these surfaces as forbidden for non-superusers, never expose them.
- **SuperuserGuard:** feature flags (`lab-features`) are gated by a **guard**, not a permission code — a hidden superuser-only behaviour that must be surfaced honestly (read-only status; toggling stays on the superuser owner).
- **Superuser-only-by-default:** `applicationprefs`, `user`, `role`, `permission`, `department`, `employee`, `service`, `tax`, `system:health/security`, `formconfig`, `kb` are held by **no seeded staff role** — administration is a superuser/admin domain until a lab creates a custom role. Surface truthfully; **never alias, never broaden.**
- No permission is aliased or over-broad in the audited admin paths; each endpoint enforces its own code. The workspace's permission map is **descriptive only** — owner endpoints remain enforcement authority.

---

## 5. Lifecycle audit (observe-only — re-verified)

- **`ALLOWED_TRANSITIONS`** (a central forward-DAG in `records.service`) constrains every transition; illegal transitions throw — **status is not freely editable.**
- **`transition()`** writes a **`RecordStatusEvent`** (via nested `statusHistory: { create }`) with `userId` + `notes` on every state change → history is fully explainable.
- **Owner actions drive state:** submit→Submitted, result→Resulted, authorization→Approved, edit-approved→Resulted, billing→Billed, payment→Paid; `qc` records its own event.
- **Manual `PATCH /specimen/status/:id`** (`recordstatus:change`) flows through the same constrained `transition()` — bounded, not arbitrary.
- **Administration only OBSERVES lifecycle.** It never owns lifecycle, never edits status directly, and never renders a free status editor; any change is delegated to the owner's constrained transition. `Released`/`Archived` are **not modeled** (Requires schema).

---

## 6. Must-remain-deferred (schema-gated) and prohibited-to-simulate

**Requires schema (no owner today — verified absent):** credential vault, webhook/delivery config,
environment (sandbox↔prod) promotion, notification templates, `Released`/`Archived` statuses,
transition-policy/approval-chain engine, cross-domain configuration-change ledger, referring-provider/
facility registry, subscription plans, delegated administration, multi-site administration, department
hierarchy.

**Explicitly prohibited to simulate (must never be faked, even if "helpful"):** any secret value; a
credential vault; notification templates; `Released`/`Archived` status; a provider/facility registry;
environment promotion; a configuration-audit ledger; delegated or multi-site administration; a
department hierarchy; a transition-policy engine; an approval-chain engine; and **any free record-status
editor.** Each is shown as a named gap, not a fabricated feature.

---

## 7. Composability verdict per surface

| Surface | Verdict |
|---|---|
| Laboratory config, departments, prefs, AI settings | **Compose now** (read + owner link) |
| Users, roles, permission matrix (descriptive) | **Compose now** (read; superuser honesty) |
| Security posture (sessions/login/MFA/locks/alerts/policy) | **Compose now** (read; secrets already excluded) |
| Clients + lab-codes/code-sheets/form-config | **Compose now** (read + owner link) |
| Record-lifecycle **view** (history + owner-constrained transition link) | **Compose now** (observe only) |
| FHIR endpoints + transmission health | **Compose now** (owner read excludes secrets) |
| Notification preferences | **Compose now** (read + owner link) |
| Billing/services/taxes summary; feature-flag/module status; system/AI status | **Compose now** (read; commercial kept separate; flags surfaced honestly) |
| Portal-access administration | **Compose with limits** (superuser-only, unseeded permission) |
| Turnaround/escalation/recall **policy** objects, specimen types, reference ranges | **Partial** (surface as-recorded; no config-policy model) |
| Credential vault, notification templates, `Released`/`Archived`, provider registry, env promotion, config ledger, delegated/multi-site admin, department hierarchy, transition/approval engines | **Deferred — Requires schema** |
| Any secret value; any free status editor | **Never simulate** |

---

## 8. Definitive feasibility verdict

- **Buildable today (compose-only, no schema):** laboratory-config summary; department list; user directory + role/permission matrix (read); security posture; client directory; lab-code/code-sheet/form-config discovery; record-lifecycle observe-view; FHIR endpoint + transmission health; notification-preference view; billing/services/taxes summary; feature-flag/module status; system-health/AI-settings status — each permission-gated, source-labeled, partial-source-isolated, with owner invocation and **secret-free payloads**.
- **Buildable only with composition (owner read exists but needs careful surfacing):** RBAC/superuser honesty; account-lifecycle status; portal-access (superuser-only); turnaround/escalation/recall as-recorded.
- **Requires schema:** credential vault, webhooks, environment promotion, notification templates, `Released`/`Archived`, transition-policy/approval-chain engine, config-change ledger, provider/facility registry, subscription plans, delegated/multi-site admin, department hierarchy.
- **Must remain deferred:** everything in the Requires-schema set, until a separate data-model decision.
- **Must never be simulated:** secret values, credential storage, and a free record-status editor.

**Conclusion:** the Enterprise Administration & Controls Workspace **can be built truthfully today through
composition alone** for the "Buildable today" set — and the secret-exposure risk is already mitigated by
the owners' own reads. The workspace reveals configuration and invokes owners; it never exposes a secret,
bypasses validation/permissions/tenancy/audit, duplicates a workflow, or computes unrecorded state.

---

## 9. Verification note

Every owner **route**, **service**, **model**, and **permission** cited above was verified in the
codebase; every capability is classified; every listed secret was inspected against its owner read
(all confirmed excluded); lifecycle findings re-verified (`ALLOWED_TRANSITIONS`, `RecordStatusEvent`,
`transition()`, constrained `PATCH /specimen/status/:id`). This audit changed **no Prisma, no schema, no
Helix, no roadmap, no permission, no seed, no implementation code**. Internal links resolve.

---

## Status of this document

Feasibility audit only — no code, no schema, no Helix change, no permission change, no roadmap edit, no
commit. Presented for architectural review. On approval, the next artefact is an implementation plan
(checkpointed, existing-configuration-first, secret-free, observe-only lifecycle); nothing is built until
that plan is separately approved. No conflict with Phases 2A
([OSIERI_OPERATIONS_WORKSPACE.md](OSIERI_OPERATIONS_WORKSPACE.md)), 2B
([OSIERI_SIGNOUT_WORKSPACE.md](OSIERI_SIGNOUT_WORKSPACE.md)), or 2C
([OSIERI_QUALITY_WORKSPACE.md](OSIERI_QUALITY_WORKSPACE.md)).

---

## Completion status (Phase 2D — delivered)

The feasibility verdicts held. Every "Buildable today" surface shipped with **zero direct Prisma in
`EnterpriseAdministrationService`** and **no owner logic duplicated**; the secret-exposure conclusion was
confirmed at closeout (full-payload scan clean — the owner reads already exclude authToken/clientSecret,
`backup.sheetId`, MFA/TOTP secrets, tokens, and hashes). The "Requires schema / never simulate" set stayed
deferred: credential vault, webhooks, environment promotion, notification templates, `Released`/`Archived`,
transition-policy/approval-chain engines, config-change ledger, provider/facility registry, subscription
plans, delegated/multi-site admin, department hierarchy. Two items proved narrower than hoped and were
**deferred, not simulated**: **Forms** (its only owner reads route through `getOrCreate`, which persists a
default config — no mutation-free read exists) and **Notifications** (per-user reads only; no lab-wide
administration-safe read). Lifecycle is **observation-only**. Full record:
[OSIERI_ENTERPRISE_ADMINISTRATION_IMPLEMENTATION_PLAN.md](OSIERI_ENTERPRISE_ADMINISTRATION_IMPLEMENTATION_PLAN.md) §14.
