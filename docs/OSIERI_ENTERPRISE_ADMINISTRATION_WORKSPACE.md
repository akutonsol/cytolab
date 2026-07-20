# Osieri — Enterprise Administration & Controls Workspace (Phase 2D architecture)

| Field | Value |
|---|---|
| Status | Draft — architecture only; no implementation, no schema, no Helix change |
| Current Phase | Osieri Phase 2D (Enterprise Administration & Controls Workspace) |
| Owner | Founder |
| Dependencies | [OSIERI_v2.md](OSIERI_v2.md) §4, Helix v1.0 (frozen), existing administration modules (audit below); follows Phase 2C ([OSIERI_QUALITY_WORKSPACE.md](OSIERI_QUALITY_WORKSPACE.md), closed) |
| Last Updated | 2026-07-12 |
| Priority | P1 (follows Phase 2C Quality & Governance, now closed) |
| Expected Next Milestone | Architecture approval → composition feasibility audit → checkpointed build (existing config first; hierarchy / credential vault / config-change ledger / notification templates gated on data-model decisions) |

This is the architecture for the **Enterprise Administration & Controls Workspace** — the surface where
a lab administrator configures and governs Osieri: laboratory identity, access, clients, lab codes,
workflow settings, integrations, notifications, commercial configuration, and platform controls. It is
architecture only: **no code, no wireframes, no layout dimensions, no schema changes, no Helix changes,
no roadmap edits.** Every claim traces to the read-only audit below; where a capability is missing it is
stated honestly and identified as a future decision requiring schema evolution — never silently assumed.

Governing principle (consistent with Operations, Sign-Out, and Quality):
**administration is composed from recorded configuration; the workspace orchestrates existing owner
systems and owns no configuration behaviour; access is never broadened, secrets are never exposed, and
record status is never turned into a freely editable field.**

---

## 1. Purpose

Osieri already contains a complete administration surface — but it is **scattered** across the Platform,
Security, and Superuser nav groups (`/settings`, `/settings/forms`, `/settings/features`, `/users`,
`/roles`, `/workspaces`, `/departments`, `/clients`, `/lab-codes`, `/system`, `/system/logs`,
`/security/*`, `/fhir`, `/billing`, `/payments`, `/services`, `/notifications`, `/superuser/features`).
There is **no single place** that answers: *how is this laboratory configured, who can do what, and
which controls exist?*

The Enterprise Administration Workspace is a **composition and discovery layer** over those owners. It
answers:

- How is the laboratory configured (profile, branding, departments, preferences, turnaround, reports)?
- Who can access each capability (users, roles, the real permission map, security posture)?
- Which clients, providers, and lab codes exist?
- Which workflow and lifecycle settings are recorded?
- Which integrations and environments are configured?
- Which security and system controls are available?
- Which administrative capabilities are missing or require schema evolution?

It must **not** become a second implementation of any settings or administration subsystem, a
"god settings page", or a place where status, permissions, or secrets can be edited outside their owner.

---

## 2. Governing principles

1. **Compose, never duplicate.** Every panel reads from an existing owner and links to the owner's real screen for any change.
2. **Owner modules remain authoritative** for validation, persistence, and audit.
3. **Administration is permission-driven, not role-name driven.** No capability keys off a role called "Admin"/"Superuser"; every gate is a real permission code (or the `isSuperRole` bypass, surfaced honestly).
4. **Configuration is recorded, not inferred.** Values shown are the owner's stored values; nothing is computed or assumed.
5. **Never silently broaden access.** The workspace shows only what the caller's permissions already allow; a capability the caller cannot reach is named as forbidden, never quietly exposed.
6. **Mutations occur only through existing owner workflows** (the owner's own screen/endpoint, with its guard).
7. **Every change retains the owner's validation and audit behaviour** — the workspace never writes.
8. **No schema changes during architecture.** 9. **Helix v1.0 remains frozen.**
10. **Record-lifecycle configuration respects the event-driven model** (§9): meaningful owner actions advance state; manual transitions stay minimal and constrained; status history stays explainable from recorded `RecordStatusEvent`s; **no freely editable record-status field is designed.**

---

## 3. Current-system inventory (read-only audit — ground truth)

Every capability below already has an owner module, route(s), a service, a model, and recorded evidence.
Verified in the codebase (`apps/api/src/modules/*`, `apps/api/prisma/schema.prisma`, `apps/web/src/app/(app)/*`).

| Domain | Owner module | Key model(s) | API base + gate | Web surface |
|---|---|---|---|---|
| Laboratory profile / branding / logo | `lab` | `Lab` | `/lab` · `applicationprefs:view/change` | `/settings` |
| AI reporting settings | `ai` | `LabAiSettings` | `/…ai` · `applicationprefs:view` | (settings) |
| Departments | `departments` | `Department` | `/departments` · `department:view` | `/departments` |
| Users | `users` | `User`, `UserRole` | `/users` · `user:view` | `/users` |
| Roles & permissions | `roles` | `Role`, `Permission`, `RolePermission` | `/roles` · `role:view` | `/roles` |
| Workspaces (saved views) | `workspaces` | `Workspace` | `/workspaces` · `workspace:view` | `/workspaces` |
| Authentication / sessions / login history | `security` (`auth-security-admin`) | `UserSession`, `LoginAttempt`, `AuthAttempt`, `AccountLock`, `TrustedDevice`, `SecurityAlert` | `/auth`, `/security` · `system:security` | `/security/*` |
| MFA | `security` (`mfa`) | `MfaConfig` (`totpSecret` encrypted) | `/auth/mfa` | `/security/mfa` |
| Account lifecycle / onboarding / reset | `security`/`users`/`portal` | `User` (`isActive`, `passwordChangedAt/ExpiresAt`), `PasswordHistory`, `RefreshToken`; portal invite/reset via `PortalAccessToken` | (auth) | (login/reset flows) |
| Clients | `clients` | `Client`, `ClientType`, `ClientAddress` | `/clients` · `client:view` | `/clients` |
| Portal access (client identities) | `portal` | `PortalUser` | `portaluser:*` **(unseeded)** | (portal admin) |
| Lab codes (Code Vault) | `lab-codes` | `LabCode` | `/…lab-codes` · `labcode:view` | `/lab-codes` |
| Code sheets | `code-sheets` | `CodeSheet` | `codesheet:view` | (lab-codes) |
| Form / clinical-feature config | `form-config` | `FormConfig` | `formconfig:view/manage` | `/settings/forms` |
| Cabinets (storage) | `cabinets` | `Cabinet` | `cabinet:view` | `/cabinets` |
| Record lifecycle | `records` | `Record`, `RecordStatusEvent`, `RecordStatus` enum | `/specimen/status/:id` · `recordstatus:change` | (records screens) |
| Turnaround / TAT | `tat` | (Record timestamps) | `/tat` · `record:view` | `/tat` |
| Escalation config | `escalation` | `EscalationRecord` | `/escalations` · `record:view` | `/escalations` |
| Recall config | `recall` | `RecallRecord` | `/recalls` · `record:view` | `/recalls` |
| FHIR / EMR interface | `fhir` | `FHIREndpoint`, `FHIRTransmission` | `/fhir` · `record:view` | `/fhir` |
| Notifications | `notifications` | `Notification`, `UserNotificationPreference` | `/notifications` · `notification:view` | `/notifications` |
| Billing / services / taxes | `billing`, `services-catalog`, `taxes` | `Bill`, `BillLine`, `BillTax`, `Service`, `Tax` | `bill:*` / `service:view` / `tax:view` | `/billing`, `/services` |
| Payments | `payments` | `Payment` | `payment:create` | `/payments` |
| Feature flags / modules | `lab-features` | `LabFeature` | **`SuperuserGuard`** (no permission) | `/settings/features`, `/superuser/features` |
| System health / logs / support | `system` | `MaintenanceWindow`, (unified log) | `system:health` | `/system`, `/system/logs`, `/system/support` |

There is **no existing unified admin workspace** — this workspace composes the above, it does not replace any of them.

---

## 4. Capability classification

`Existing` = full owner + UI; `Partial` = owner exists but the admin view/config is thin or embedded;
`Missing` = no owner/model (schema evolution); `Future` = deliberately gated; `Prohibited to simulate` =
must never be faked in a composition layer.

| Capability | Class | Note |
|---|---|---|
| Lab profile / branding / logo | Existing | `Lab` via `lab` (applicationprefs) |
| Departments (flat) | Existing | `Department`; **hierarchy = Missing** |
| Users / roles / permissions | Existing | full RBAC (`Role`/`Permission`/`RolePermission`) |
| Security posture (sessions, login history, MFA, locks, alerts, password policy) | Existing | `security` (`system:security`) |
| Clients / client types / addresses | Existing | `clients`; **first-class referring-provider/facility = Missing** |
| Portal access administration | Partial | `PortalUser` exists; `portaluser:*` **unseeded** → superuser-only |
| Lab codes / code sheets / form config | Existing | `lab-codes`, `code-sheets`, `form-config` |
| Record lifecycle (status + events) | Existing | event-driven, constrained; **Released/Archived = Missing** (§9) |
| Turnaround / escalation / recall settings | Partial | owners record data; **explicit config policy objects = Missing** |
| FHIR / EMR interface | Existing | `FHIREndpoint`/`FHIRTransmission` |
| Integration credential vault / webhooks / environment promotion | Missing | no `Credential`/`Webhook`/`Environment` model |
| Notification preferences | Existing | `UserNotificationPreference` |
| Notification templates / delivery config | Missing | no `NotificationTemplate` model |
| Billing / services / taxes / payments | Existing | `billing`/`services-catalog`/`taxes`/`payments` |
| Subscription plans / pricing tiers | Missing | no `Plan`/`Subscription`; `Service` = per-service price |
| Feature flags / modules | Existing | `LabFeature` (superuser guard) |
| System health / logs / support | Existing | `system` (`system:health`) |
| AI enablement / settings | Existing | `LabAiSettings` (applicationprefs) |
| Config-change audit ledger (cross-domain) | Missing | only per-domain audit today |
| Delegated / multi-site administration | Future | single `Account`/`Lab` tenancy today |
| **Editing status / permissions / secrets from the admin layer** | **Prohibited to simulate** | must route to the owner; never faked |

---

## 5. Owner and evidence map

Every workspace panel maps to exactly one owner read and (for change) one owner route. No panel writes.

| Panel | Owner service (read) | Recorded evidence | Change route (owner) | Permission enforced on arrival |
|---|---|---|---|---|
| Laboratory | `LabService` | `Lab` profile/branding | `/settings` | `applicationprefs:view/change` |
| Departments | `DepartmentsService` | `Department` rows | `/departments` | `department:view/*` |
| Users | `UsersService` | `User` + `UserRole` | `/users` | `user:view/*` |
| Roles & permissions | `RolesService` | `Role`/`RolePermission` | `/roles` | `role:view/*` |
| Security | `SecurityService` | sessions/login history/MFA/locks/alerts | `/security/*` | `system:security` |
| Clients | `ClientsService` | `Client`/`ClientType`/`ClientAddress` | `/clients` | `client:view/*` |
| Lab codes | `LabCodesService` | `LabCode`/`CodeSheet` | `/lab-codes` | `labcode:view/*` |
| Form config | `FormConfigService` | `FormConfig` | `/settings/forms` | `formconfig:view/manage` |
| Lifecycle | `RecordsService` | `RecordStatusEvent` history | records screen | `recordstatus:change` |
| Integrations | `FhirService` | `FHIREndpoint`/`FHIRTransmission` | `/fhir` | `record:view` |
| Notifications | `NotificationsService` | `UserNotificationPreference` | `/notifications` | `notification:view/change` |
| Billing/commercial | `Billing`/`ServicesCatalog`/`Taxes` | `Service`/`Tax`/`Bill` | `/services`, `/billing` | `service:view`, `bill:*` |
| Feature flags | `LabFeaturesService` | `LabFeature` | `/settings/features` | `SuperuserGuard` |
| System | `SystemHealthService` | `MaintenanceWindow`, unified log | `/system` | `system:health` |
| AI settings | `AiReportingService` | `LabAiSettings` | (settings) | `applicationprefs:view` |

Values are shown **verbatim**; secrets (MFA `totpSecret`, FHIR credentials) are **never** read into the workspace payload — only their presence/status is surfaced (§10, §15).

---

## 6. Identity & access architecture

- **Owners:** `users`, `roles`, `security`, `portal`. Models: `User`, `Role`, `Permission`, `UserRole`, `RolePermission`, `UserSession`, `LoginAttempt`, `AuthAttempt`, `AccountLock`, `TrustedDevice`, `SecurityAlert`, `MfaConfig`, `PasswordHistory`, `RefreshToken`; portal onboarding via `PortalAccessToken`.
- **The workspace composes** (read-only): the user directory (with roles), the role→permission matrix, and the security posture (active sessions, recent login history, MFA coverage, locked accounts, security alerts, password policy). Each links to its owner screen for any change.
- **It never evaluates permissions, assigns roles, authenticates, or issues/rotates credentials** — those stay in `roles`/`security`/`auth`.
- **Permission resolution surfaced honestly:** access is `isSuperRole || permissions.includes(code)`. The workspace must display the `isSuperRole` bypass as what it is (a role-flag that bypasses the permission guard), never disguise a superuser-only capability as broadly available.
- **Account lifecycle** (staff: `User.isActive` / password expiry / `PasswordHistory`; portal: `PortalAccessToken`) is surfaced as status only (active / invited / accepted / pending reset); token values are never exposed.

---

## 7. Laboratory configuration architecture

- **Owner:** `lab` (`Lab` model) for profile, branding, logo, operating preferences; `ai` (`LabAiSettings`) for AI reporting; `form-config` (`FormConfig`) for clinical-feature/form setup; `departments` (`Department`); `cabinets` (`Cabinet`); `tat` for turnaround display.
- **Composed read:** a configuration summary — lab identity/branding, department list, turnaround targets (as recorded), report/system preferences, AI enablement state — each linking to `/settings`, `/departments`, `/settings/forms` for change.
- **Report settings, specimen types, result codes, reference ranges:** report templates exist as `ResultTemplate` (owner `result-templates`); **specimen types and reference ranges are not first-class models** (embedded in form/lab-code config) — surfaced as-recorded, flagged Partial (§14).
- The workspace owns **discovery and navigation only**; it never renders a report template, validates a lab code, or evaluates AI behaviour.

---

## 8. Client & provider administration

- **Owner:** `clients` (`Client`, `ClientType`, `ClientAddress`) + `portal` (`PortalUser`) for portal identities + `change-requests` for client-initiated requests.
- **Composed read:** client directory with type, addresses, portal-access status, and billing relationship pointer; links to `/clients` and the portal admin surface for change.
- **Truthful limitation:** Osieri has **no first-class `ReferringProvider` or `Facility` model** — a referring practice/provider is represented as a `Client` (with `ClientAddress`/`ClientType`); client account grouping is `Account` (tenant-level). The workspace surfaces this structure as-is and does not invent a provider registry.
- **Portal access is superuser-only today** (`portaluser:*` is declared in controllers but **not seeded** → only `isSuperRole` reaches it). The workspace surfaces portal-admin as forbidden for non-superusers rather than exposing it.
- It never manages billing relationships or portal credentials directly — those route to their owners.

---

## 9. Workflow & lifecycle architecture (current reality vs. recommendation — kept separate)

### 9a. Current reality (verified)

- **Statuses (`RecordStatus` enum):** `Pending, Submitted, Processing, Partial, Completed, Resulted, Approved, Billed, Paid, OnHold, Disabled, Failed, Viewed`.
- **Transitions are constrained** by a central `ALLOWED_TRANSITIONS` map in `records.service.ts` (a forward DAG; `OnHold` reversible; `Disabled`/`Failed` from non-terminal states). Illegal transitions throw — **status is not freely editable.**
- **Every transition creates a `RecordStatusEvent`** (via the nested `statusHistory: { create }` on the record update) carrying `userId` + optional `notes` — so **status history is fully explainable from recorded events.**
- **Meaningful owner actions drive lifecycle:** submit → `Submitted`; result-sheet present → `Resulted` (Completed→Resulted); **authorization → `Approved`**; editing an approved sheet de-authorizes → back to `Resulted`; billing → `Billed`; payment → `Paid`; QC failure (`qc` service) records its own `RecordStatusEvent`. A **manual** endpoint exists — `PATCH /specimen/status/:id` gated by `recordstatus:change` — but it flows through the same constrained `transition()`, so it is bounded, not arbitrary.
- **Lifecycle rules are centralized** in `records.service` (not fragmented), with `qc` recording status events for its own domain action.

### 9b. Gaps against the desired lifecycle

- `Started` — **not modeled**; `Pending` is the initial state (≈ started/registered).
- `Submitted`, `Resulted`, `Approved` — **modeled** and event-driven.
- `Released` (delivery-driven) — **not modeled**; report delivery exists (`report-center`) and `Viewed` records client viewing, but there is no `Released` status.
- `Archived` — **not modeled**; no archival status/transition.

### 9c. Recommended future direction (recommendation only — not this workspace's build)

- Keep the lifecycle **event-driven** and **manual transitions minimal**; preserve `RecordStatusEvent` as the single explainable history.
- Where a deliberate human transition is wanted, model **"Submit for Review"** as an explicit action (as authorization already drives `Approved`).
- Consider modeling **`Released` (delivery-driven)** and **`Archived`** as new statuses + owner transitions — **schema-gated**, a separate decision.
- **Never** expose a free-text/dropdown status editor in the admin workspace; the workspace surfaces lifecycle **configuration and history**, and any change routes to the owner's constrained transition.

---

## 10. Integration administration

- **Owner:** `fhir` (`FHIREndpoint`, `FHIRTransmission`); environment/health via `system` (`MaintenanceWindow`, unified log).
- **Composed read:** configured endpoints (name, direction, status), recent transmission health, and environment metadata — links to `/fhir` and `/system` for change.
- **Missing (schema-gated):** a generic **integration/credential vault**, **webhook/delivery settings**, and **sandbox↔production environment promotion** have no owner model. Credentials that do exist (e.g. on `FHIREndpoint`) are **presence/status only** in the workspace — **secrets are never read into the payload** (§15).
- The workspace owns discovery/health display and owner invocation only; it never stores credentials or performs a transmission.

---

## 11. Notification administration

- **Owner:** `notifications` (`Notification`, `UserNotificationPreference`).
- **Composed read:** notification/alert **preferences** (per-user/lab, as recorded) with a link to `/notifications` for change.
- **Missing (schema-gated):** **notification templates** and **delivery/channel configuration** have no owner model (`NotificationTemplate` does not exist). The workspace does not simulate a template editor; it names the gap.
- The workspace never delivers a notification or renders a template.

---

## 12. Billing & platform controls

- **Commercial (owner):** `billing` (`Bill`/`BillLine`/`BillTax`), `services-catalog` (`Service` = pricing), `taxes` (`Tax`), `payments` (`Payment`). Composed as read-only pricing/tax/settings summaries linking to `/services`, `/billing`, `/payments`. **No `Plan`/`Subscription` model** → subscription tiers are Missing.
- **Platform (owner):** `lab-features` (`LabFeature`) feature flags — **`SuperuserGuard`-gated**, surfaced as read-only module status with the toggle routing to `/settings/features` (superuser); `system` health/logs (`system:health`); `ai` settings (`applicationprefs`).
- **Hard boundary:** commercial billing configuration is kept **visually and architecturally separate** from clinical configuration (a §15 risk). The workspace never calculates a bill, never toggles a feature flag itself, and never evaluates AI behaviour.

---

## 13. Permission model (complete map — no changes proposed)

The seeded permission catalog is generated in `apps/api/prisma/seed.ts` from `STANDARD_OBJECTS ×
{view,create,change,delete}` (+ `STANDARD_EXTRA`) and `SPECIAL_OBJECTS`. The seed **deletes any
permission not in the catalog**, so declared-but-uncatalogued codes can never be held by a role.

**Administrative permission map (verified):**

| Capability | Gate | Seeded? | Held by a default staff role? |
|---|---|---|---|
| Lab profile / branding / AI settings | `applicationprefs:view/change` | Yes | **No** → superuser-only by default |
| Users | `user:*` | Yes | **No** → superuser-only by default |
| Roles / permissions | `role:*`, `permission:*` | Yes | **No** → superuser-only by default |
| Departments | `department:*` | Yes | **No** → superuser-only by default |
| Employees / payroll | `employee:*`, `payroll:*` | Yes | **No** → superuser-only by default |
| Clients | `client:view/create` | Yes | **Yes** (Authorizers/Pathologist/LabTech/Receptionist) |
| Lab codes / code sheets | `labcode:*`, `codesheet:*` | Yes | **Yes** (Authorizers/Pathologist) |
| Workspaces | `workspace:view/create/change` | Yes | **Yes** (Pathologist/LabTech) |
| Record status transition | `recordstatus:change` | Yes | **Yes** (Authorizers/Pathologist/LabTech) |
| Services / taxes | `service:*`, `tax:*` | Yes | **No** → superuser-only by default |
| Form config | `formconfig:view/manage` | Yes | **No** (assigned to no role) → superuser-only |
| Knowledge-base authoring | `kb:manage` | Yes | **No** → superuser-only |
| System health / logs / support | `system:health` | Yes | **No** → superuser-only |
| Security center / sessions / MFA | `system:security` | Yes | **No** → superuser-only |
| Feature flags / modules | `SuperuserGuard` (no permission code) | n/a | **Superuser-only by guard** |
| Portal access administration | `portaluser:*` | **No (unseeded)** | **No one** → superuser-only via `isSuperRole` bypass |
| Client change requests | `changerequest:*` | **No (unseeded)** | **No one** → superuser-only via `isSuperRole` bypass |

**Concerns to surface (not fix):**
- **Enterprise administration is overwhelmingly superuser-only by default.** Delegating any of it requires a lab to create a custom role granting the specific permission — the workspace must make this visible, never imply broader access.
- **`changerequest:*` and `portaluser:*` are declared-but-unseeded** → reachable only by the `isSuperRole` bypass; a role can never be granted them under the current catalog.
- **Feature flags are guard-gated, not permission-gated** (`SuperuserGuard`), a hidden superuser-only behaviour the workspace must state plainly.
- No permission is **aliased or over-broad** in the audited admin paths; each endpoint enforces its own code. The workspace's own permission map is **descriptive only** — owner endpoints remain the enforcement authority.

---

## 14. Schema-gated capabilities (verified missing — require a data-model decision)

- **First-class department hierarchy** (`Department` is flat — no parent/child).
- **Structured workflow-transition policy / configurable status-transition rules / approval chains** (`ALLOWED_TRANSITIONS` is code, not data).
- **`Released` and `Archived` record statuses** and their owner transitions.
- **Integration credential vault, webhook/delivery settings, environment (sandbox↔prod) promotion** (no `Credential`/`Webhook`/`Environment` model).
- **Configurable notification templates & channel/delivery config** (no `NotificationTemplate`).
- **Cross-domain, audit-grade configuration-change ledger** (audit is per-domain today; no unified config-change log).
- **First-class referring-provider / facility registry** (represented as `Client` today).
- **Subscription plans / pricing tiers** (no `Plan`/`Subscription`).
- **Delegated administration & multi-site administration** (single `Account`/`Lab` tenancy; `isSuperRole` is the only elevation).

None of these are built here; each is named as a future product+schema decision.

---

## 15. Architectural risks

1. **"God settings page."** Mitigation: composition/discovery only; each panel links to its owner; the workspace writes nothing.
2. **Duplicating existing admin screens.** Mitigation: one owner read + one owner link per panel; no second editor (the Sign-Out/Quality discipline).
3. **Permission broadening.** Mitigation: descriptive map only; per-panel gate mirrors the owner; a capability the caller can't reach is shown forbidden, never exposed.
4. **Hidden superuser-only behaviour.** Mitigation: surface `isSuperRole` bypass and `SuperuserGuard`/unseeded-permission gates honestly (§13).
5. **Arbitrary record-status editing.** Mitigation: never render a free status editor; lifecycle changes route to the constrained `transition()` owner (§9).
6. **Secrets exposure.** Mitigation: MFA `totpSecret`, FHIR credentials, and tokens are **presence/status only** — never read into the payload.
7. **Config changes without audit evidence.** Mitigation: all changes happen on the owner (which keeps its audit); the workspace notes the missing cross-domain config-change ledger (§14) rather than faking one.
8. **Role-name assumptions.** Mitigation: every gate is a permission code or the honestly-labeled `isSuperRole` bypass — never a role name.
9. **Multi-tenant leakage.** Mitigation: every read goes through owner services under the `LabContext` tenancy extension; nothing bypasses `labId`.
10. **Stale / conflicting configuration owners.** Mitigation: one authoritative owner per capability (§5); the workspace never becomes a second source of truth.
11. **Mixing commercial billing with clinical configuration.** Mitigation: §12 keeps commercial and clinical config in separate regions with separate permissions.
12. **Feature-flag drift.** Mitigation: flags shown read-only from `LabFeature`, toggled only on the superuser owner.
13. **Helix scope creep.** Mitigation: consumes Helix tokens/components only; no Helix change (v1.0 frozen).

---

## 16. Buildable now vs. deferred

**Buildable now (compose-only, no schema):** laboratory-config summary, department list, user directory + role/permission matrix (read), security posture, client directory, lab-code/code-sheet/form-config discovery, record-lifecycle **history/configuration view** (read + owner-constrained transition link), FHIR endpoint/health display, notification-preference view, billing/services/taxes summary, feature-flag/module status (read), system-health/AI-settings status — each permission-gated, source-labeled, with partial-source isolation and owner invocation.

**Deferred (schema-gated — §14):** department hierarchy, transition-policy/approval-chain objects, `Released`/`Archived` statuses, credential vault / webhooks / environment promotion, notification templates, cross-domain config-change ledger, provider/facility registry, subscription plans, delegated/multi-site administration.

**Prohibited to simulate:** editing status, permissions, secrets, or billing calculations from the admin layer.

---

## 17. Recommended implementation sequence (existing configuration first)

Mirrors the checkpoint discipline of Phases 2B/2C (isolated, reviewed commits; one aggregate endpoint; frozen section-status contract; partial-source isolation; owner invocation; continuity last):

1. **A1** — Workspace shell + aggregate contract (`GET /enterprise-administration/overview`, sections `deferred`, descriptive permission map, entry gate).
2. **A2** — Laboratory configuration summary (lab/departments/preferences).
3. **A3** — Identity & access (user directory + role/permission matrix, read).
4. **A4** — Security posture (sessions/login history/MFA/locks/alerts).
5. **A5** — Client & lab-code/form-config discovery.
6. **A6** — Record-lifecycle view (history + owner-constrained transition link; no editor).
7. **A7** — Integrations (FHIR) + system/health status.
8. **A8** — Notifications, billing/services, feature-flag/module status.
9. **A9** — Permission-map panel (descriptive, superuser-only honesty).
10. **A10** — Owner-invocation audit (verification-only, à la C11).
11. **A11** — Continuity (entry point under Platform + validated `returnTo` + guarded shortcuts).
12. **A12** — Final verification + closeout.

Each checkpoint is separately approved; no schema, Helix, or permission change ships under this contract.

---

## 18. Success criterion

> *Can Osieri provide one coherent enterprise-administration workspace by composing existing owner
> systems — without broadening permissions, duplicating configuration logic, exposing secrets, or
> turning record status into a freely editable field?*

**Yes, for the compose-only scope in §16** — every administrative capability already has an owner,
route, service, model, permission, and recorded evidence; the workspace surfaces and navigates them
truthfully, owns no configuration behaviour, and defers every schema-gated capability (§14) honestly. A
checkpoint that broadens access, duplicates an owner, exposes a secret, edits status freely, or requires
schema does not ship under this contract.

---

## Status of this document

Architecture only — no code, no wireframes, no schema, no Helix change, no roadmap edit, no commit until
reviewed. On approval, the next step is a **composition feasibility audit** (in the manner of
[OSIERI_SIGNOUT_FEASIBILITY_AUDIT.md](OSIERI_SIGNOUT_FEASIBILITY_AUDIT.md) and
[OSIERI_QUALITY_FEASIBILITY_AUDIT.md](OSIERI_QUALITY_FEASIBILITY_AUDIT.md)) confirming the compose-only
path in §16 is truthful against the current data model, before any checkpoint build begins. Every claim
above traces to the read-only audit in §3; Missing/Future/schema-gated capabilities are named, not
assumed. No conflict with Phases 2A ([OSIERI_OPERATIONS_WORKSPACE.md](OSIERI_OPERATIONS_WORKSPACE.md)),
2B ([OSIERI_SIGNOUT_WORKSPACE.md](OSIERI_SIGNOUT_WORKSPACE.md)), or 2C
([OSIERI_QUALITY_WORKSPACE.md](OSIERI_QUALITY_WORKSPACE.md)): this workspace composes configuration
owners those workspaces do not touch and reuses their orchestration contract without modification.

---

## Completion status (Phase 2D — delivered)

The workspace shipped **compose-only** as architected: **20 sections hydrated** from existing owner reads
and **2 deferred** (Forms, Notifications), with **no schema, Helix, or permission change**. Every
Missing/Future capability in this document remains deferred: credential vault, notification templates,
`Released`/`Archived` statuses, provider/facility registry, department hierarchy, transition-policy/
approval-chain engines, delegated/multi-site administration, and a configuration-audit ledger. Two audit
expectations were tightened during the build: the record lifecycle is surfaced **observation-only** (no
`ALLOWED_TRANSITIONS` copy, no `RecordStatusEvent` creation, no status editor), and **Forms** proved
non-composable read-only (its owner reads persist a default config). Full completion record, permission
matrix, secret-safety, performance, and limitations:
[OSIERI_ENTERPRISE_ADMINISTRATION_IMPLEMENTATION_PLAN.md](OSIERI_ENTERPRISE_ADMINISTRATION_IMPLEMENTATION_PLAN.md) §14.
