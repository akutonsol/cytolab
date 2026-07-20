# Osieri — Enterprise Administration & Controls Workspace (Phase 2D) implementation plan

| Field | Value |
|---|---|
| Status | Binding implementation contract — architecture only; no code, no schema, no Helix change until each checkpoint is separately approved |
| Current Phase | Osieri Phase 2D (Enterprise Administration & Controls Workspace) |
| Owner | Founder |
| Dependencies | [OSIERI_ENTERPRISE_ADMINISTRATION_WORKSPACE.md](OSIERI_ENTERPRISE_ADMINISTRATION_WORKSPACE.md) (architecture), [OSIERI_ENTERPRISE_ADMINISTRATION_FEASIBILITY_AUDIT.md](OSIERI_ENTERPRISE_ADMINISTRATION_FEASIBILITY_AUDIT.md) (feasibility), [OSIERI_QUALITY_IMPLEMENTATION_PLAN.md](OSIERI_QUALITY_IMPLEMENTATION_PLAN.md) (method), Helix v1.0 (frozen) |
| Last Updated | 2026-07-12 |
| Priority | P1 (follows Phase 2C, closed) |
| Expected Next Milestone | Plan approval → checkpoint A1; each checkpoint separately approved, isolated commit, verified against §10 |

This is the **binding implementation contract** for the Enterprise Administration & Controls Workspace.
It inherits the composition contract of Operations (2A), Sign-Out (2B), and Quality (2C) **without
modification**. It is a plan only: **no code, no wireframes, no schema, no permission change, no Helix
change, no roadmap edit, no commit** until each checkpoint (A1…A12) is separately approved. Every claim
traces to the verified audits in the two dependency documents.

---

## 1. Orchestration rule (binding)

Enterprise Administration **orchestrates existing owner systems**. It may **observe, summarize, compose,
link, and describe**. It must **never own configuration, lifecycle, permissions, secrets, validation, or
persistence; never duplicate an owner workflow; never bypass tenancy or auditing.** Every write continues
to happen **inside the owner module**, through the owner's own endpoint, guard, validation, and audit.
The workspace holds **no Prisma**, computes no administration state that is not already recorded, and is
the enforcement authority for **nothing** — owner endpoints remain authoritative.

---

## 2. Workspace lifecycle

Entry is permission-gated at the aggregate endpoint (`record:view` as the base gate, mirroring the prior
workspaces; per-section owner permissions gate each section's data). One additive nav entry point under
**Platform** with a validated internal `returnTo` (Sign-Out/Quality continuity pattern). The workspace is
a read surface: it renders composed summaries and links to each owner's real screen for any change. No
tabs invent state; focus moves to the heading once on entry; guarded, non-mutating keyboard shortcuts
(W/Q/?/Esc) match the Quality workspace. Nothing is mutated from this surface.

---

## 3. Aggregate endpoint (contract)

Exactly **one** endpoint:

```
GET /enterprise-administration/overview
```

- Owner: a new **thin** NestJS module `enterprise-administration` (controller + service + web `types.ts` mirror).
- **Read-only, orchestration-only, no Prisma, no persistence, no business logic, no validation, no owner duplication.** It injects owner services and composes their reads into one aggregate.
- Base gate: `@RequirePermissions('record:view')` on the controller; each section resolves its own owner permission internally (descriptive map).
- Partial-failure isolation: each section loader is wrapped so a single source failure never rejects the aggregate (`Promise.all` cannot collapse — the Quality C13 guarantee).
- Additive owner-module exports only (the B5/C3 precedent): to compose an owner service, add `exports: [XService]` to its module in the same checkpoint; **no owner logic is added or changed.**

---

## 4. Frozen section-status contract

Every section permanently carries one status. **Frozen here; never reshaped after implementation begins.**

```
type SectionStatus = 'ready' | 'empty' | 'forbidden' | 'error' | 'deferred';
interface Section<T> { status: SectionStatus; data: T | null; reason?: string; }
```

- `ready` — owner data present. `empty` — owner reachable, nothing recorded. `forbidden` — caller lacks the owner permission. `error` — the owner read failed (isolated to this section). `deferred` — not yet implemented / schema-gated placeholder.
- Source-unavailable is distinguished from section-empty (an unavailable owner is named in an `unavailable[]` list where a section composes several owners; an empty section says "nothing recorded"). **No false empty state.**

---

## 5. Section plan (composition strategy per section)

Each section is **read + owner link**; changes route to the owner. Owner routes/services/permissions/models are verified in the feasibility audit (§2). Failure isolation = per-section try/catch → `error`/`unavailable`; owner invocation = navigate to the owner's real screen (no second editor).

| Section | Owner service | Owner route | Owner permission | Composition strategy | Failure isolation | Owner invocation |
|---|---|---|---|---|---|---|
| Laboratory | `LabService` | `GET /lab/profile` | `applicationprefs:view` | Read profile summary | try/catch→error | `/settings` |
| Branding | `LabService` | `GET /lab/branding` | `applicationprefs:view` | Read branding fields | →error | `/settings` |
| Departments | `DepartmentsService` | `GET /departments` | `department:view` | Read flat list | →forbidden/error | `/departments` |
| Users | `UsersService` | `GET /users` | `user:view` | Read directory + roles | →forbidden/error | `/users` |
| Roles | `RolesService` | `GET /roles` | `role:view` | Read role list | →forbidden/error | `/roles` |
| Permissions | `RolesService` | `GET /roles` (+`Permission`) | `role:view` | Descriptive role→permission map | →forbidden/error | `/roles` |
| Security | `SecurityService` | `/auth/sessions`, `/auth/login-attempts`, `/security/alerts`, `/security/password-policy` | `system:security` | Read posture (sessions/login/locks/alerts/policy) | per-source→unavailable | `/security/*` |
| Clients | `ClientsService` | `GET /clients` | `client:view` | Read directory | →forbidden/error | `/clients` |
| Lab Codes | `LabCodesService` | `GET /…lab-codes` | `labcode:view` | Read catalog | →forbidden/error | `/lab-codes` |
| Code Sheets | `CodeSheetsService` | (code-sheets) | `codesheet:view` | Read sheet config | →forbidden/error | `/lab-codes` |
| Forms | `FormConfigService` | `GET /…form-config` | `formconfig:view` | Read form config (superuser-only) | →forbidden/error | `/settings/forms` |
| FHIR | `FhirService` | `GET /fhir/endpoints`, `/fhir/transmissions` | `record:view` | Read endpoints+health (**owner select excludes secrets**) | per-source→unavailable | `/fhir` |
| Notifications | `NotificationsService` | `GET /notifications` | `notification:view` | Read preferences | →forbidden/error | `/notifications` |
| Billing | `BillingService` | `/billing` | `bill:view` | Read summary (never calculate) | →forbidden/error | `/billing` |
| Services | `ServicesCatalogService` | `GET /services` | `service:view` | Read pricing catalog | →forbidden/error | `/services` |
| Taxes | `TaxesService` | (taxes) | `tax:view` | Read tax config | →forbidden/error | `/services` |
| Feature Flags | `LabFeaturesService` | `GET /lab-features` | **`SuperuserGuard`** | Read module status (honest superuser gate) | →forbidden/error | `/settings/features` |
| System Health | `SystemHealthService` | `/system`, `/system/logs` | `system:health` | Read health/log status | →forbidden/error | `/system` |
| AI Settings | `AiReportingService` | `/…ai` | `applicationprefs:view` | Read enablement state | →forbidden/error | `/settings` |
| Portal Access | (portal admin) | (portal) | `portaluser:*` **(unseeded → superuser-only)** | Read access **status** only | →forbidden | (portal admin) |
| Lifecycle Observation | `RecordsService` | `findOne` (`statusHistory`) | `record:view` | **Observe** status history (§7) | →empty/error | records screen (constrained transition only) |
| Permission Matrix | (aggregate) | n/a (descriptive) | `record:view` (base) | Descriptive caller-permission map; owner-authoritative | always `ready` | n/a |

**Every panel value is shown verbatim; every change is delegated to the owner. No section writes.**

---

## 6. Secret contract (binding)

The aggregate payload **MAY expose only**: `configured`, `enabled`, `disabled`, `connected`,
`disconnected`, `environment`, `status`, `health`, `last verified`, `counts`.

It **MUST NEVER expose**: passwords, client secrets, refresh tokens, JWT/signing secrets, API keys,
webhook secrets, connection strings, encrypted values, hashes, TOTP secrets, backup codes.

- **If an owner does not expose something, the aggregate does not expose it.** This is already the case: the FHIR `endpointSelect` omits `authToken`/`clientSecret` (owner comment: *"Never leak secrets to the client"*); MFA `getStatus()` returns only `totpEnabled`/`emailEnabled`/backup-code **count**; the security service returns no tokens/hashes.
- The workspace reuses owner reads **verbatim** and never re-selects a secret column. Any panel that would need a secret to be meaningful shows **status only** (`configured`/`last verified`/`environment`). A checkpoint that surfaces any secret does not ship.

---

## 7. Lifecycle contract (observe-only, binding)

Administration **only observes** lifecycle; it **never owns** it. Verified mechanics:

- **`ALLOWED_TRANSITIONS`** — central forward-DAG in `records.service`; illegal transitions throw; status is not freely editable.
- **`RecordStatusEvent`** — every `transition()` writes one (userId + notes) → history fully explainable.
- **`transition()`** — the single owner path for state change; owner actions drive it (submit→Submitted, result→Resulted, authorization→Approved, billing→Billed, payment→Paid; QC records its own event).
- **Manual `PATCH /specimen/status/:id`** (`recordstatus:change`) — flows through the same constrained `transition()`; bounded, not arbitrary.

Administration **MAY**: observe status, summarize the recorded history, link to the records screen.
Administration **MAY NEVER**: transition, approve, authorize, release, archive, override, or bypass
`ALLOWED_TRANSITIONS`; it renders **no free status editor**. `Released`/`Archived` are not modeled and are
not simulated (§12).

---

## 8. Permission contract (binding)

- The workspace's permission map is **descriptive only**; owner endpoints remain the enforcement authority. Resolution is `isSuperRole || permissions.includes(code)` — surfaced honestly, never disguised.
- **`SuperuserGuard`** (feature flags) is surfaced as an honest superuser-only gate — read-only status; toggling stays on the superuser owner.
- **`portaluser:*` and `changerequest:*`** are declared-but-unseeded → reachable only via the `isSuperRole` bypass; those sections render `forbidden` for non-superusers and are never exposed.
- Administration is **permission-derived, not role-name driven** — no capability keys off a role named "Admin"/"Superuser".
- **No aliasing. No synthetic admin permission. No permission broadening.** A capability the caller cannot reach is shown `forbidden`, never quietly surfaced.

---

## 9. Deferred capabilities (remain explicitly blocked — do not weaken)

Credential vault · webhooks · environment promotion · notification templates · `Released` status ·
`Archived` status · provider registry · facility registry · department hierarchy · approval-chain engine ·
transition-policy engine · delegated administration · multi-site administration · configuration-audit
ledger. Each has **no owner model today** (verified) and is shown as a named gap — never simulated,
never partially faked. No checkpoint weakens these deferrals; each would require a separate data-model
decision outside this contract.

---

## 10. Implementation checkpoints

Each checkpoint is an isolated, separately-approved, reviewed commit (Sign-Out/Quality discipline).
Fields: **Scope · Files · Owner services · Permissions · Verification · Rollback · Commit boundary · Stop condition.**

**A1 — Workspace shell.**
Scope: route `app/(app)/enterprise-administration/page.tsx`; header, section scaffolding, all sections `deferred`; validated `returnTo` + focus/keyboard reuse.
Files: web page + `types.ts` mirror. Owner services: none. Permissions: `record:view` (page gate).
Verification: web tsc + build; a11y (one h1); zero-orange. Rollback: delete route + types. Commit: web page + types. Stop: shell renders with deferred sections.

**A2 — Aggregate endpoint.**
Scope: `enterprise-administration` NestJS module + `GET /enterprise-administration/overview` returning the §5 sections all `deferred` except the descriptive `permissions`/`permission-matrix`; frozen section-status contract; partial-failure harness.
Files: module/controller/service (API); web `types.ts`. Owner services: none yet (scaffold). Permissions: `record:view` (endpoint gate) + descriptive map.
Verification: API tsc + `nest build`; endpoint returns stable contract; tenancy (lab-scoped); **no Prisma**. Rollback: remove module + app-module registration. Commit: API module + web types. Stop: endpoint live, contract frozen.

**A3 — Laboratory configuration.**
Scope: Laboratory, Branding, Departments, AI Settings sections; owner links to `/settings`, `/departments`.
Files: service loaders + web panels. Owner services: `LabService`, `DepartmentsService`, `AiReportingService` (+ additive exports). Permissions: `applicationprefs:view`, `department:view`.
Verification: values trace to owner reads; superuser-only honesty; no secret. Rollback: sections→deferred. Commit: API + web. Stop: lab-config summary truthful + owner reachable.

**A4 — Identity & Access.**
Scope: Users, Roles, Permissions sections (read directory + role→permission matrix, descriptive).
Files: loaders + panels. Owner services: `UsersService`, `RolesService`. Permissions: `user:view`, `role:view`.
Verification: matrix mirrors owner; `isSuperRole` surfaced honestly; no permission evaluation performed. Rollback: deferred. Commit: API + web. Stop: identity/access read-truthful.

**A5 — Security posture.**
Scope: Security section (sessions, login history, locked accounts, MFA coverage, alerts, password policy).
Files: loader + panel. Owner services: `SecurityService`, `MfaService`. Permissions: `system:security`.
Verification: **MFA shows enabled-flags/count only; no `totpSecret`/backup codes; no tokens/hashes**; per-source isolation. Rollback: deferred. Commit: API + web. Stop: posture read-only + secret-free.

**A6 — Clients + Lab Codes + Form Configuration.**
Scope: Clients, Lab Codes, Code Sheets, Forms sections.
Files: loaders + panels. Owner services: `ClientsService`, `LabCodesService`, `CodeSheetsService`, `FormConfigService`. Permissions: `client:view`, `labcode:view`, `codesheet:view`, `formconfig:view`.
Verification: read + owner link; form-config superuser-only honesty. Rollback: deferred. Commit: API + web. Stop: config discovery truthful.

**A7 — Lifecycle observation.**
Scope: Lifecycle Observation section — **observe** status history + link to records screen; **no editor**.
Files: loader + panel. Owner services: `RecordsService`. Permissions: `record:view`.
Verification: history read-only; **no transition/approve/release/archive control**; changes only via owner constrained `transition()`; `Released`/`Archived` absent. Rollback: deferred. Commit: API + web. Stop: observe-only lifecycle view.

**A8 — Integrations + Notifications + Billing + Feature Flags.**
Scope: FHIR, Notifications, Billing, Services, Taxes, Feature Flags, System Health, Portal Access sections.
Files: loaders + panels. Owner services: `FhirService`, `NotificationsService`, `BillingService`, `ServicesCatalogService`, `TaxesService`, `LabFeaturesService`, `SystemHealthService`. Permissions: `record:view`, `notification:view`, `bill:view`, `service:view`, `tax:view`, `SuperuserGuard`, `system:health`, `portaluser:*` (unseeded→forbidden).
Verification: FHIR read excludes secrets; feature flags read-only with honest superuser gate; billing never calculated + kept separate from clinical config; portal-access forbidden for non-superusers. Rollback: deferred. Commit: API + web. Stop: integration/commercial/platform status truthful.

**A9 — Permission matrix.**
Scope: Permission Matrix section — descriptive caller-permission map with superuser-only honesty and unseeded-permission disclosure.
Files: loader + panel. Owner services: none (aggregate). Permissions: `record:view` (base).
Verification: descriptive only; owner endpoints authoritative; no aliasing/broadening; `SuperuserGuard`/`portaluser:*`/`changerequest:*` disclosed. Rollback: deferred. Commit: API + web. Stop: matrix truthful.

**A10 — Owner-invocation verification (verification-only).**
Scope: audit every action → real owner route, zero mutation, browser Back restores workspace + `returnTo` intact.
Files: **none** (audit); fix only a verified defect. Owner services: none new. Permissions: mirror owners.
Verification: no duplicate mutation UI; no free status editor; no secret in any payload; every route/permission exists. Rollback: n/a. Commit: **none if clean** (record as verification-only, no empty commit — the C11 precedent). Stop: all actions invoke owners only.

**A11 — Workflow continuity.**
Scope: one additive Platform nav entry point with validated `returnTo`; deterministic return; focus-once; guarded non-mutating shortcuts.
Files: web page + `nav.ts` + nav renderer. Owner services: none. Permissions: n/a.
Verification: `returnTo` internal-only + fallback; open-redirect rejected; owner round-trips restore workspace; shortcuts suppressed in inputs/modifiers/dialogs; no mutating shortcut. Rollback: revert page + nav. Commit: web. Stop: continuity verified.

**A12 — Final verification + closeout.**
Scope: full §11 contract; fix only verified defects; closeout doc update (this plan + architecture + feasibility).
Files: docs (+ any defect fix). Owner services: n/a. Permissions: full matrix verification.
Verification: §11 in full. Rollback: n/a. Commit: implementation defects (if any) + documentation closeout, **separated**. Stop: all gates pass → Phase 2D ready to declare complete.

---

## 11. Verification contract (per checkpoint; in full at A12)

- **API tsc** clean · **Web tsc** clean · **production builds** (API `nest build` + web `next build`) clean when substantial.
- **Authenticated browser** drive of the real flow; screenshot visual changes; **zero-orange 0 px**; responsive overflow **0** at 390/768/1024/1440/1920; no page errors.
- **No Prisma** in the aggregate service; all reads via owner services; **no secret in any payload** (grep + payload inspection); tenancy lab-scoped.
- **Partial-failure isolation** proven (force each section to error; overview + siblings survive; failed source named; no false empty).
- **Owner invocation** only (every action → real owner route; browser Back restores workspace; `returnTo` intact).
- **Lifecycle observe-only** (no transition/approve/release/archive/override control anywhere).
- **Accessibility** (one h1; logical headings; accessible names; visible focus; status not color-only; no keyboard trap; reduced-motion; shortcut help labeled).
- **No schema / Helix / permission-seed / roadmap change.** Present uncommitted → separate approval → exact staging list + message; unrelated dirty files untouched.

---

## 12. Implementation risk register (mitigations)

1. **God settings page** → composition/discovery only; one owner read + one owner link per section; writes nothing.
2. **Secret exposure** → §6 secret contract; reuse owner reads verbatim (already secret-excluding); status-only.
3. **Permission widening** → descriptive map only; per-section gate mirrors owner; forbidden shown, never exposed; no aliasing.
4. **Tenant leakage** → every read via owner services under the `LabContext` tenancy extension; nothing bypasses `labId`.
5. **Configuration without audit** → all changes on the owner (which keeps its audit); the missing cross-domain config-change ledger is named, not faked.
6. **Feature-flag drift** → flags read-only from `LabFeature`; toggled only on the superuser owner.
7. **Duplicate owner screens** → no second editor; each panel links to its owner (Sign-Out/Quality discipline).
8. **Lifecycle ownership drift** → §7 observe-only contract; no status control; changes via owner `transition()` only.
9. **Schema creep** → deferred set (§9) stays deferred; no checkpoint introduces a model.
10. **Helix scope creep** → consume Helix tokens/components only; Helix v1.0 frozen.

---

## 13. Success criterion

Every checkpoint must answer **yes** to:

> *"Does this reveal recorded configuration from one workspace and invoke its owner — without owning
> configuration/lifecycle/permissions/secrets, exposing a secret, duplicating an owner, bypassing
> tenancy or audit, editing status freely, or requiring schema?"*

A checkpoint that owns configuration, exposes a secret, duplicates an owner workflow, edits lifecycle,
broadens a permission, or requires schema **does not ship under this contract.**

---

## 14. Phase 2D completion record (A12 closeout)

Phase 2D is **complete — declared 100%**. Every checkpoint A1–A12 shipped or was verified under this
contract; the release gate (A12) passed all gates (A–K) with **no implementation defects requiring
correction**.

### 14a. Checkpoint → commit trace (isolated, separately-approved commits)

| Checkpoint | Delivered | Commit |
|---|---|---|
| Architecture | Workspace architecture doc | `32fbde4` |
| Feasibility | Composition feasibility audit | *(doc)* |
| Plan | Binding implementation plan | `9ff04fd` |
| A1 | Workspace shell (route + gate + deferred sections) | `e399b68` |
| A2 | Aggregate contract + descriptive permission map | `3b8e98e` |
| A3 | Laboratory configuration (Laboratory, Branding, Departments) | `6f216cf` |
| A4 | Identity & Access (Users, Roles, Permissions) | `d24b53e` |
| A5 | Security posture | `665a3fc` |
| A6 | Clients, Lab Codes, Code Sheets (Forms deferred) | `457affc` |
| A7 | Lifecycle Observation | `eb4d82c` |
| A8 | Integrations/Notifications/Billing/Services/Taxes/Feature Flags/System Health/AI/Portal Access | `60897e6` |
| A9 | Permission Matrix refinement (evidence rename, no seed-provenance) | `23018cd` |
| **A10** | **Owner-invocation verification — corrected Taxes route `/services`→`/settings` (2-file commit)** | `1086b9f` |
| A11 | Workflow continuity (nav entry + returnTo + W/A/?/Esc shortcuts) | `e03fcbc` |
| A12 | Final verification + this closeout | *(docs commit)* |

A10 was an owner-invocation audit that found and corrected **one real route defect** (Taxes navigated
to `/services`, which manages no taxes; the real owner surface is `/settings` → Taxes tab) — a two-file
route-correction commit, not an empty commit.

### 14b. Production entry point

One additive **Lab** nav item — `Enterprise Administration` → `/enterprise-administration`, permission
`record:view`, icon `Building2` (`nav.ts`). `nav-pills.tsx` `navTarget` appends a validated internal-only
`returnTo` (return-aware for `/quality-governance` and `/enterprise-administration`), omitted when already
on the workspace or on `/login`. The workspace's `safeReturnTo` re-validates and falls back to `/records`.

### 14c. Final supported sections (20 hydrated compose-only + 2 deferred)

Hydrated (owner read · gate): Laboratory (`LabService.getProfile` · applicationprefs:view) · Branding
(`getBranding` · applicationprefs:view) · Departments (`DepartmentsService.findAll` · department:view) ·
Users (`UsersService.findAll` · user:view, ≤200) · Roles (`RolesService.findRoles` · role:view, ≤100) ·
Permissions (`findPermissions` · permission:view, ≤300) · Security (`SecurityService.getDashboard` ·
system:security) · Clients (`ClientsService.findAll` · client:view, ≤100) · Lab Codes
(`LabCodesService.findAll` · labcode:view, ≤200) · Code Sheets (`CodeSheetsService.findCodeSheets` ·
codesheet:view, ≤100) · FHIR (`FhirService.listEndpoints` · record:view, ≤50) · Billing
(`BillingService.summary().byStatus` · bill:view) · Services (`ServicesCatalogService.findAll` ·
service:view, ≤100) · Taxes (`TaxesService.findAll` · tax:view → `/settings`) · Feature Flags
(`LabFeaturesService.listForLab` · SuperuserGuard, ≤100) · System Health (`SystemHealthService.getHealth`
· system:health) · AI Settings (`AiReportingService.getSettings` · applicationprefs:view) · Portal Access
(`PortalUsersService.findAll().total` · portaluser:view) · Lifecycle Observation (`RecordsService.findAll`
per RecordStatus · record:view) · Permission Matrix (descriptive · record:view base).
**Deferred: Forms & Notifications.**

### 14d. Final permission/guard matrix (from real seeded grants + deterministic resolution)

`has(code) = isSuperRole || permissions.includes(code)`. Derived from `apps/api/prisma/seed.ts`; **no
throwaway roles created.**

| Capability (gate) | Superuser | Pathologist | Authorizers | Lab Technician | Receptionist |
|---|:--:|:--:|:--:|:--:|:--:|
| **Entry** / FHIR / Lifecycle / Permission Matrix (`record:view`) | ✓ | ✓ | ✓ | ✓ | ✗ |
| Clients (`client:view`) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Lab Codes / Code Sheets (`labcode:`/`codesheet:view`) | ✓ | ✓ | ✓ | ✗ | ✗ |
| Billing (`bill:view`) | ✓ | ✗ | ✗ | ✗ | ✓ |
| Laboratory/Branding/AI (`applicationprefs:view`) · Departments · Users · Roles · Permissions · Security · Services · Taxes · System Health | ✓ | ✗ | ✗ | ✗ | ✗ |
| Feature Flags (`SuperuserGuard`) · Portal Access (`portaluser:view`, unseeded) | ✓ | ✗ | ✗ | ✗ | ✗ |

**Caveats:** Receptionist lacks `record:view` → cannot enter. `portaluser:*`/`changerequest:*` are
declared-but-catalog-absent → superuser-bypass-only; Feature Flags are SuperuserGuard-controlled;
`system:security`/`system:health`/`applicationprefs`/`department`/`user`/`role`/`permission`/`service`/
`tax` are held by no default staff role (superuser-only by default). Permission Matrix evidence is
**null** when catalog (`permission:view`) or grant (`role:view`) reads are unavailable — never false; no
seed-provenance is claimed; no role-name authorization; no aliasing; no synthetic admin permission.

### 14e. Section-contract status

Frozen `ready|empty|forbidden|error|deferred` intact. **20 sections ready, exactly 2 deferred (Forms,
Notifications) — no implemented section deferred.** Deferred is not shown as forbidden; forbidden not as
empty; source failure produces `error`/`forbidden`, never a false empty (verified E).

### 14f. Failure isolation

Verified: forcing Laboratory/Users/Security/Clients/Lifecycle/FHIR/Billing/System Health to `error` and
Portal Access to `forbidden`, plus Permission-Matrix evidence to null, left every other section usable,
the Permission Matrix available, failed sections named truthfully, no false empty, no unauthorized
fallback. Structurally guaranteed: every loader wraps its owner read and returns a `Section` (never
rejects), so `overview()`'s `Promise.all` cannot collapse.

### 14g. Secret-safety results

Full-payload scan clean: no password/hash, authToken/clientSecret, apiKey/access/refresh/session/reset/
portal token, JWT/signing/TOTP/backup/MFA secret, connection string, `backup.sheetId`/env secret, IPv4,
revenue sums, raw form schema, or portal username. FHIR excludes secrets (owner select); System Health
whitelists safe checks (excludes sheetId/version/uptime/raw log); AI shows only enabled/key-configured/
model; Portal Access is a single count; Security is counts + a timestamp (no PII rows). The only email
value is `UserRow.email` (approved user-directory identity, user:view-gated) and the only "message"
values are System Health check status text — neither is a secret or notification content.

### 14h. Lifecycle observation limitations

Observation-only: composes per-status counts via `RecordsService.findAll` per `RecordStatus`; **copies no
`ALLOWED_TRANSITIONS`, creates no `RecordStatusEvent`, mutates nothing.** Current 13 statuses only;
`Pending` is initial; `Started`/`Released`/`Archived` are not modeled; no lab-wide event history (no safe
record:view read); no transition metadata/diagram.

### 14i. Owner-invocation results

Every action opens only a real owner route: `/users`, `/roles`, `/security`, `/clients`, `/lab-codes`,
`/records`, `/fhir`, `/billing`, `/services`, `/settings` (incl. Taxes + AI), `/settings/features`,
`/system`. Taxes → `/settings` (fixed at A10; no `/services`). Laboratory/Branding/Departments are
display-only; Permission Matrix has no owner route; Forms/Notifications have no action. No duplicate
workflow, no inline editor, no mutation primitive; browser Back restores the workspace with `returnTo`.

### 14j. Accessibility & responsive results

Exactly one `h1`; logical `h1→h2` order; zero unnamed controls; visible focus ring; status by text
(never color-only); no keyboard trap; shortcut sheet labeled `role="dialog" aria-modal aria-label`;
**W/A/?/Esc** navigation-only, suppressed in form controls / with modifiers / while a dialog is open;
focus once on entry, not stolen on refetch; `prefers-reduced-motion` backstop present. Horizontal
overflow **0** and **zero-orange 0 px** at 390/768/1024/1440/1920 (incl. System Health warn/error badges,
which map to non-amber tones).

### 14k. Performance measurements

Aggregate **~28–43 ms warm** (~105 ms cold); payload **~41 KB**. ~19 distinct owner reads + duplicates
(Permission Matrix re-reads `findRoles`/`findPermissions` that Roles/Permissions also read) + Lifecycle's
**13× `findAll`** (one per RecordStatus) — all in `Promise.all` (parallel). **Duplicate-read observation
(not a defect):** the `findRoles`/`findPermissions` double-read and the 13-status lifecycle reads are not
a bottleneck at ~30 ms; a shared-read cache or a single owner status-count method would trim them but was
not warranted in A12 scope.

### 14l. Outcome & intentional deferrals

**No schema change, no Helix change, no permission seed/grant change** across all of Phase 2D. Deferred
(schema/product decisions, unchanged): Forms composition, Notifications composition, credential vault,
notification templates, `Released`/`Archived` lifecycle states, provider/facility registries, department
hierarchy, transition-policy/approval-chain engines, delegated/multi-site administration, configuration
audit ledger. Each remains a named gap, never simulated.

---

## Conflict check

No conflict with [OSIERI_ENTERPRISE_ADMINISTRATION_WORKSPACE.md](OSIERI_ENTERPRISE_ADMINISTRATION_WORKSPACE.md)
or [OSIERI_ENTERPRISE_ADMINISTRATION_FEASIBILITY_AUDIT.md](OSIERI_ENTERPRISE_ADMINISTRATION_FEASIBILITY_AUDIT.md):
this plan builds only the compose-only "Buildable today" set and defers every schema-gated capability.
It reuses the Operations/Sign-Out/Quality orchestration contract without modification and preserves the
Helix v1.0 freeze. No conflict with Phases 2A ([OSIERI_OPERATIONS_WORKSPACE.md](OSIERI_OPERATIONS_WORKSPACE.md)),
2B ([OSIERI_SIGNOUT_WORKSPACE.md](OSIERI_SIGNOUT_WORKSPACE.md)), or 2C
([OSIERI_QUALITY_WORKSPACE.md](OSIERI_QUALITY_WORKSPACE.md)).

---

## Status of this document

Binding engineering plan; architecture only. On approval, implementation proceeds checkpoint by
checkpoint (A1…A12), each tracing here and to the architecture and feasibility documents, verified
against §11, and separately approved. No code, no schema, no Helix, no permission change, no roadmap edit,
no commit until each checkpoint is separately approved.
