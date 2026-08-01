# Program 7 · Phase 7B.3 — SCIM Users — DESIGN OF RECORD (proposed)

**Status:** Architecture-level design of record — **REVISED per governance rulings R1–R8 (incorporated below); AWAITING
FINAL design approval.** Governance-only: **no**
implementation, schema, migration, dependency, endpoint, test, workflow, tag, or baseline change is authorized here.
Additive to the frozen Programs 1–6, Phase 7A (`p7-7a-complete` → `aef3faa`), Phase 7B.1 (`p7-7b1-accepted` → `9142d20`),
and Phase 7B.2 (`p7-7b2-accepted` → `53b936b`); modifies no accepted baseline. Phase 7B DoR:
[`PROGRAM_7_7B_DESIGN.md`](./PROGRAM_7_7B_DESIGN.md) (L1–L12, esp. **L3/L10/L11/L2**).

7B.3 adds **inbound SCIM 2.0 provisioning of Users** (RFC 7643/7644) as a **transport** into the frozen lifecycle. An
external IdM (Okta / Entra ID / …) creates, updates, activates, deactivates, and deprovisions staff identities via the
SCIM protocol; every lifecycle effect flows **only through `IdentityLifecycleService` (the sole lifecycle writer, L8)**.
**SCIM is transport, not domain truth; it is not an identity store, not a tenancy key, and grants no permissions.**

---

## 1. Read-only preflight — current-state surface (verified at `53b936b`)
**Reusable (do not modify):**
- **Lifecycle boundary (7B.1/7B.2, frozen):** `IdentityLifecycleService` — `provision(userId, state)`, `activate`,
  `suspend`, `reactivate`, `deprovision`, plus the additive **transaction-aware `activateInTx(tx, …)`** seam (7B.2). SCIM
  calls these; it performs **no** direct `lifecycleState`/`isActive` write (the L8 sole-writer arch scan continues to
  hold). `IdentityLifecycleEvent` is the authoritative durable record (L9).
- **Provisioning source (frozen):** `ProvisioningSource.SCIM` already exists (reserved in 7B.1). `originProvisioningSource`
  is immutable creation provenance (L2).
- **Lifecycle states:** `INVITED / PROVISIONED / ACTIVE / SUSPENDED / DEPROVISIONED`; deterministic mapping (only ACTIVE ⇒
  `isActive=true`). **`PROVISIONED`** ("identity exists via an authoritative admin lifecycle source; not yet login-enabled")
  is the natural landing state for SCIM-created identities.
- **Model C (7B.2):** `User.passwordHash` is NOT NULL; a SCIM-provisioned identity (federated-authenticated, no local
  password) gets a **random placeholder Argon2id hash** — it never authenticates locally; `isActive`/federation gate the
  rest.
- **Linkage anchor (7A.1, frozen):** `FederatedIdentity` is the **single** external-subject → `User.id` linkage. **SCIM
  `externalId` is the IdM's provisioning identifier — a DIFFERENT identifier** from the authentication subject
  (SAML `NameID` / OIDC `sub`) and from the canonical `User.id` (L10). SCIM does **not** create `FederatedIdentity`
  links (that is federation login / JIT — 7B.5).
- **Tenancy (frozen):** `labId` + `LabContext` + the Prisma extension. SCIM must resolve `labId` from the SCIM
  **credential**, never from the request body (ET3).
- **Machine authentication (7A.2b, frozen — REUSED, R1):** the `ServicePrincipal` OAuth 2.0 Client-Credentials path
  (`ServiceAuthGuard` + `jwt-service` strategy + `@Service` routes; service token carries `sub=servicePrincipalId`,
  `labId`, `scope`/`permissions`, `aud=service`, `isSuperRole=false`, no session). **SCIM reuses this — SCIM connectors
  authenticate as constrained `ServicePrincipal`s; there is NO second machine-authentication model.** The service token's
  `labId` scopes every SCIM request (never the body); a dedicated SCIM permission is enforced by the existing
  `PermissionsGuard`.
- **Authorization (frozen):** the single `PermissionsGuard`. SCIM authenticates via its own bearer path and evaluates
  **no** domain permissions; it introduces no second authorization evaluator.
- **Provisioning peers:** `UsersService.create` (MANUAL), `StaffInvitationService` (INVITATION). SCIM is the **third**
  source; sources are distinguished by immutable `originProvisioningSource` (L2).
- **Audit (frozen):** `AuditRecorder` + the append-only ledger; `IDENTITY_SCIM_SYNCED` was reserved in 7B DoR L7.

**New capability (7B.3):** the inbound SCIM 2.0 Users protocol surface (create/read/replace/patch/delete/list),
per-lab SCIM bearer credentials, a SCIM↔canonical identifier mapping, and additive SCIM audit codes.

## 2. Boundary analysis — SCIM extends the frozen lifecycle without changing it
| Constraint | How 7B.3 satisfies it |
|---|---|
| `IdentityLifecycleService` remains the sole lifecycle writer | SCIM create → `provision(PROVISIONED)`; `active=false` → `suspend`; `active=true` → `activate`/`reactivate`; DELETE → `deprovision`. **All via the boundary; SCIM never writes `lifecycleState`/`isActive`** — the 7B.1 sole-writer arch scan still passes. |
| `PermissionsGuard` remains the sole authorization evaluator | SCIM routes are `@Service` + `@RequirePermissions(<scim>)`; the existing guard evaluates the connector's SCIM scope. SCIM grants no roles/permissions and adds no evaluator. Group→role mapping is **7B.4/7C**. |
| `labId` remains the only tenancy boundary | Every SCIM request is scoped to the `labId` in the connector's **service token** (never the body); all SCIM rows carry `labId` (ET3). |
| `FederatedIdentity` remains the single linkage authority | SCIM stores its own `externalId` mapping; it does **not** create/modify `FederatedIdentity` (auth-subject linkage stays federation/JIT). |
| SCIM terminates at `IdentityLifecycleService` (R6) | SCIM never directly mutates **sessions, invitations, federation links, passwords, permissions, or authorization state** — lifecycle effects go through the boundary; attribute writes touch only `User` profile fields + `ScimUserMapping`. |
| SCIM is transport, not authority (R2) | SCIM is transport ONLY; it never becomes authority for **employment, licensing, permissions, tenancy, diagnosis, or AI**. Attributes are provisioning/contact data, coded (L12/Principle 10). |
| Programs 1–6 / 7A / 7B.1 / 7B.2 immutable | Additive entities + additive namespace + additive audit codes only; **no frozen-model change** (S7 keeps `User` untouched via a mapping entity). |

## 3. Guardrails
- **R2 — transport, not authority:** SCIM is transport ONLY and **never** becomes authority for employment, licensing,
  permissions, tenancy, diagnosis, or AI.
- **R6 — terminates at `IdentityLifecycleService`:** SCIM never directly mutates sessions, invitations, federation links,
  passwords, permissions, or authorization state. Lifecycle transitions go through the boundary; the only direct writes
  SCIM performs are `User` profile attributes (name/email) and its own `ScimUserMapping`.
- SCIM `id` = the canonical `User.id`; `externalId` = the IdM's identifier (**never** a canonical key); `userName`/
  `emails` are mutable and never canonical (L10).
- SCIM `active` maps deterministically to lifecycle via the boundary; SCIM never bypasses a lifecycle transition.
- **R1 — one machine-auth model:** SCIM authenticates ONLY as a constrained `ServicePrincipal` (7A.2b); it introduces no
  new credential model, mints no user session, and never touches 7A user-authentication strategies/guards.
- **R3 — immutable mapping:** a `ScimUserMapping` (`externalId → User.id`) is immutable after creation; re-pointing it is
  only possible through an explicit governed reconciliation process — never automatic reassignment.

## 4. Canonical data model (additive; no frozen-model change)
- **NO standalone SCIM credential model (R1).** SCIM authentication reuses the frozen 7A.2b `ServicePrincipal` + its
  OAuth Client-Credentials + service-token path. A SCIM connector is a `ServicePrincipal` granted a **dedicated additive
  SCIM permission** (proposed namespace `identityprovisioning:manage`, no default grant) — enforced by the existing
  `PermissionsGuard` on `@Service` SCIM routes. No `ScimClient` table.
- **`ScimUserMapping`** (SCIM↔canonical identifier separation — L10; **immutable — R3**): `id`, `mappingUuid @unique`,
  `labId` (FK RESTRICT), `userId` (FK RESTRICT, `@@unique[labId,userId]`), `externalId` (the IdM's id;
  `@@unique[labId, externalId]`), `servicePrincipalId?` (the connector that created it; attribution), `createdAt`. **No
  `updatedAt`-driven re-pointing** — the `externalId → userId` binding is set once at creation and never automatically
  reassigned; a changed binding requires an explicit governed reconciliation (delete-and-recreate under audit), not an
  in-place update. Keeps SCIM's mutable external identifier off the frozen `User` model. **`User` is unchanged** (S7).
- No JSON columns; provenance FKs `onDelete: Restrict`.

## 5. SCIM lifecycle model (Users; RFC 7644)
```
POST   /scim/v2/Users        → create User (source=SCIM, placeholder hash) → provision(PROVISIONED)
                                → if active=true: activate() → ACTIVE     · persist ScimUserMapping(externalId)
GET    /scim/v2/Users/{id}    → read (canonical User + mapping)           · GET /Users → list + filter (userName/externalId)
PUT    /scim/v2/Users/{id}    → replace attributes; active→lifecycle transition (activate/suspend) via the boundary
PATCH  /scim/v2/Users/{id}    → partial (RFC 7644 PatchOp); `active` op → suspend/activate via the boundary
DELETE /scim/v2/Users/{id}    → deprovision() (terminal, L5) via the boundary
```
- `active=true` → `activate`/`reactivate`; `active=false` → `suspend`; DELETE → `deprovision`. Attribute-only changes
  (name/email) update `User` profile fields (respecting `@@unique[labId,email]`) — **not** a lifecycle transition.

### PUT vs PATCH (R4 — both idempotent)
- **PUT `/Users/{id}` (full replace):** the request body is the **complete** desired resource. The server sets each
  managed attribute to the supplied value (or its default/cleared state when omitted, per RFC 7644 §3.5.1) and drives
  `active` to the requested lifecycle state via the boundary. Applying the **same** PUT again yields the **same** result
  (idempotent).
- **PATCH `/Users/{id}` (partial, RFC 7644 §3.5.2 PatchOp):** applies `add`/`replace`/`remove` operations to the named
  paths only; unreferenced attributes are untouched. An `active` `replace` op drives the lifecycle transition via the
  boundary. Re-applying the **same** PatchOp yields the **same** result (idempotent).
- Both are idempotent by construction: attribute writes are set-to-value, and lifecycle transitions use the frozen 7B.1
  idempotent CAS (repeat active/suspend/deprovision is a benign no-op). Repeat **POST** for an existing `externalId`
  resolves to the same mapping (returns the existing resource, `409` only on a genuine uniqueness conflict — §5b).
  Repeat **DELETE** is idempotent (already-DEPROVISIONED ⇒ no-op success). Discovery endpoints
  (`/ServiceProviderConfig`, `/ResourceTypes`, `/Schemas`) are static and read-only.

## 5b. Deterministic conflict behavior (R5 — no heuristic resolution)
Every conflict resolves to a fixed, non-heuristic outcome (no fuzzy matching, no auto-merge, no silent overwrite):
- **Duplicate `externalId`** (create for an `externalId` already mapped in the lab): return the existing resource for an
  identical create; otherwise **`409 Conflict`** (SCIM `uniqueness`). Never re-point an existing mapping (R3).
- **Duplicate `email`/`userName`** (would violate `@@unique[labId,email]`): **`409 Conflict`** (SCIM `uniqueness`) —
  never reassign the email to a different identity.
- **Concurrent updates** on the same resource: the frozen single-winner CAS (lifecycle) + a row-version check (attributes)
  yield exactly one winner; the loser gets **`409 Conflict`**, never a partial/merged state.
- **Stale version (optimistic concurrency):** with an `If-Match`/`meta.version` (ETag) that no longer matches → **`412
  Precondition Failed`**; the client must re-read and retry.
- **All uniqueness violations** surface the RFC 7644 error schema (`urn:ietf:params:scim:api:messages:2.0:Error`,
  `scimType:"uniqueness"`), never a heuristic reconciliation. Mapping re-pointing is out of band (governed reconciliation).

## 6. Trust boundaries
External IdM → **OAuth Client-Credentials** as a constrained `ServicePrincipal` (7A.2b) → `@Service` SCIM route →
`ServiceAuthGuard` (validates the service token) → **`PermissionsGuard`** (evaluates the SCIM scope) → `runLabScoped`
(from the **token's** `labId`) → SCIM Users handler → `IdentityLifecycleService` (all lifecycle effects) + `User`
attribute writes + `ScimUserMapping` (immutable). SCIM never: mints a user session, evaluates domain authorization
itself, mutates sessions/invitations/federation/passwords/permissions/authorization state (R6), writes `FederatedIdentity`,
sets a tenancy key from the body, or touches the clinical/AI path.

## 7. Governance decisions requiring ratification (S1–S12)
- **S1 — SCIM as inbound transport into the frozen lifecycle.** All lifecycle effects via `IdentityLifecycleService`; SCIM
  is not an identity store. *Recommend: approve.*
- **S2 — SCIM authentication. RATIFIED (R1): reuse the frozen 7A.2b `ServicePrincipal` OAuth infrastructure.** SCIM
  connectors authenticate as constrained `ServicePrincipal`s (OAuth Client-Credentials → service token → `@Service`
  route). **No standalone SCIM credential model.** A dedicated additive SCIM permission (`identityprovisioning:manage`,
  no default grant) is granted to a SCIM connector and enforced by the existing `PermissionsGuard`; the token's `labId`
  scopes the request.
- **S3 — Create landing state.** *Recommend:* SCIM create → **`PROVISIONED`** (exists, not yet login-enabled); if the SCIM
  payload has `active=true`, immediately `activate()` → ACTIVE. Model C placeholder password (federated-only identity).
- **S4 — `active` mapping.** `true → activate/reactivate`, `false → suspend`, `DELETE → deprovision` — all via the boundary.
- **S5 — Idempotency + concurrency.** POST by `externalId` idempotent; lifecycle transitions use the frozen single-winner
  CAS; concurrent SCIM ops resolve deterministically.
- **S6 — Attribute updates.** name/email updates are `User` profile writes (not lifecycle); enforce `@@unique[labId,email]`;
  reject/þ conflict per SCIM error schema.
- **S7 — Identifier separation (L10) + immutable mapping (R3).** SCIM `externalId` lives in **`ScimUserMapping`**, NOT on
  `User` — no frozen-model change; canonical id is `User.id`; auth-subject stays in `FederatedIdentity`. The mapping is
  **immutable after creation** — `externalId → User.id` changes only via an explicit governed reconciliation (never
  automatic reassignment).
- **S8 — Provisioning-source precedence (L2).** SCIM-created ⇒ `originProvisioningSource=SCIM` (immutable). Whether SCIM may
  manage a MANUAL/INVITATION-origin identity (adopt) is a governed policy — *recommend: 7B.3 manages only identities it
  created or that are explicitly SCIM-linked; broader adoption deferred.*
- **S9 — Groups excluded.** No `groups` provisioning, no group→role mapping (7B.4/7C); a `groups` attribute in a payload is
  ignored/echoed, never authorization.
- **S10 — Audit (expanded, R7).** Additive `IDENTITY_SCIM_SYNCED` (create/replace/patch/delete outcome) + reuse of the
  7B.1 lifecycle codes (`IDENTITY_PROVISIONED/ACTIVATED/SUSPENDED/DEPROVISIONED`) for the transitions. Every SCIM audit
  record carries: a **correlation id** (groups the SCIM op + its lifecycle transition), the **request id**, the
  **authenticated `ServicePrincipal` identity** (the connector), the **lifecycle outcome** (target state / no-op /
  rejected), and the affected `User.id`. It **never persists the raw SCIM payload**, the service token, a password, or
  PHI — coded metadata only (bounded attribute NAMES at most, not values).
- **S11 — SCIM protocol conformance.** RFC 7644 response/error schema (`urn:ietf:params:scim:api:messages:2.0:*`),
  `meta`/`version` (ETag), pagination + filtering scope (baseline: `eq` on `userName`/`externalId`); `/ServiceProviderConfig`
  advertises supported features honestly.
- **S12 — No outbound SCIM.** Inbound only (IdM→Osieri); Osieri never pushes SCIM outward. Ratify.

## 8. ET1–ET8 review
ET1/ET2 — no clinical/AI writes; SCIM provisioning confers no diagnostic/AI authority. ET3 — `labId` from the SCIM
credential (never the body); all SCIM rows `labId`-scoped; SCIM is never a tenancy key. ET4 — SCIM + lifecycle events
additive on the one append-only ledger. ET5 — SCIM grants no permissions; the connector `ServicePrincipal` holds only the dedicated
SCIM permission (no default grant), authorizing the SCIM provisioning surface, not domain resources. ET6 — human `User` provisioning only. ET7 — SCIM
attributes are provisioning/contact data, not employment/licensing/clinical truth (L12). ET8 — Programs 1–6 + all 7A + 7B.1
+ 7B.2 immutable; **no frozen model modified** (mapping entity, not a `User` column). Conforms to Principles 1–12 +
GG1–GG7 (GG7 stable `User.id`; SCIM `externalId`/`userName` are mutable, never the durable key).

## 9. Risks
- **Protocol surface size:** SCIM 2.0 is broad; the baseline scopes to **Users** (+ discovery), deferring Groups/filtering
  breadth — must advertise honestly in `/ServiceProviderConfig` (no silent partial support).
- **Adoption/precedence ambiguity (S8):** a SCIM client managing a non-SCIM-origin identity could conflict with manual/
  invitation management — mitigated by scoping 7B.3 to SCIM-created/linked identities; broader policy deferred.
- **Credential handling (R1):** SCIM reuses the 7A.2b `ServicePrincipal` credential lifecycle (Argon2id hash-only, rotation/
  revocation already frozen); a compromised connector is contained to one lab's SCIM provisioning surface (its scope),
  never domain authorization — no new credential model to secure.
- **Mapping immutability (R3):** the `externalId → User.id` binding is set once; a mistaken binding is corrected only via a
  governed reconciliation (audited delete-and-recreate), never a silent re-point — this trades convenience for auditable
  correctness.
- **Sole-writer preservation:** SCIM handlers MUST route lifecycle through `IdentityLifecycleService` (enforced by the 7B.1
  arch scan + the gate assert), and may use the 7B.2 `activateInTx` seam for atomic create+activate.

## 10. Deferred decisions
SCIM **Groups** + membership (7B.4) · group→role/permission mapping (7B.4/7C) · outbound SCIM · SCIM bulk operations ·
advanced filtering/sorting beyond the baseline · adoption of non-SCIM-origin identities (S8 broad policy) · JIT federation
linkage (7B.5) · organization-scoped SCIM (7D).

## 11. Acceptance strategy (proposed folded gate — draft; not authorized to build)
`p7-scim-users-acceptance`: exact-head + candidate ancestry; acceptance-infra-only delta; frozen anchors immutable
(`p6-*`/all 7A/`p7-7a-complete`/`p7-7b1-accepted`/**`p7-7b2-accepted`**); persisted assertions (additive schema + RESTRICT
FKs, **no frozen-`User` change**; create → `PROVISIONED` / `active`→ACTIVE **via the lifecycle boundary**; `active=false`→
SUSPENDED; DELETE→deprovision (terminal); identifier separation `externalId` ≠ `User.id` ≠ auth-subject; **the 7B.1
sole-writer arch scan still passes**; cross-lab fail-closed on the token's `labId`; ET1–ET8). Per **R8**, the gate must
additionally prove:
- **ServicePrincipal authentication ONLY** — a valid SCIM route requires a service token with the SCIM permission; user
  sessions and any non-`ServicePrincipal` path are rejected; no standalone SCIM credential exists.
- **RFC idempotency** — repeated **PUT / PATCH / DELETE** yield the same committed state (no duplicate transition/mapping/
  event); repeated create-by-`externalId` returns the existing resource.
- **Duplicate `externalId` rejection** — a second identity for an existing `externalId` fails closed (`409` uniqueness).
- **Immutable mapping** — no in-place `externalId → User.id` re-pointing (governed reconciliation only).
- **Deterministic conflict handling** — duplicate email/externalId/concurrent/stale-version all resolve to fixed
  `409`/`412` outcomes, never a heuristic merge.
- **Sole `PermissionsGuard` authorization boundary** — SCIM authorization terminates at the existing guard; SCIM grants
  no role/permission.

Focused SCIM suites (ServicePrincipal auth, create/read/PUT/PATCH/DELETE, active-mapping, idempotency, RFC error schema,
conflict determinism, immutable mapping, no-permission-grant, R7 audit fields) + the 7B.1 sole-writer arch spec; full
no-exclusions non-regression; strict tsc. Freeze tag (later) `p7-7b3-accepted`.

## 12. Implementation decomposition
7B.3 is delivered as **one** increment (SCIM Users core: the additive `identityprovisioning:manage` permission for
connector `ServicePrincipal`s + `ScimUserMapping` + `@Service` SCIM Users CRUD/PATCH/DELETE + lifecycle mapping via the
boundary + discovery endpoints), with its own design-refinement → implementation → acceptance → freeze. SCIM **Groups** is
the separate **7B.4** increment. No standalone SCIM credential model is built (R1).

## 13. What this document authorizes
**Nothing beyond its own authoring.** No schema/migration/dependency/endpoint/service/test/workflow/tag/baseline change is
authorized until this DoR is reviewed and approved and implementation is **separately** authorized. No accepted baseline
(`p6-complete` → `40d810e`, `p7-7a-complete` → `aef3faa`, `p7-7b1-accepted` → `9142d20`, `p7-7b2-accepted` → `53b936b`, and
the four 7A increment tags) is modified.

## 14. Governance state
| Stage | Status |
|---|---|
| 7B.3 read-only preflight + current-state map | Complete (§1) |
| 7B.3 architecture / boundary / guardrails review | Rulings R1–R8 issued |
| 7B.3 Design of Record (S1–S12 + R1–R8) | **Revised — R1–R8 incorporated; awaiting FINAL design approval** |
| 7B.3 implementation | **Not authorized** (separate authorization required) |
