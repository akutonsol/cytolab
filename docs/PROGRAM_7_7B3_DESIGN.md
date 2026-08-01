# Program 7 · Phase 7B.3 — SCIM Users — DESIGN OF RECORD (proposed)

**Status:** Architecture-level design of record, **AWAITING architecture review**. Governance-only: **no**
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
- **Bearer-auth analogue (7A.2b):** `ServiceAuthGuard` + the `jwt-service` strategy show the pattern for a non-session
  machine principal; SCIM needs its own lab-scoped bearer credential (S2).
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
| `PermissionsGuard` remains the sole authorization evaluator | SCIM authenticates a provisioning client via a bearer credential; it grants no roles/permissions and adds no authorization evaluator. Group→role mapping is **7B.4/7C**. |
| `labId` remains the only tenancy boundary | Every SCIM request is scoped to the lab bound to its **credential** (never the body); all SCIM rows carry `labId` (ET3). |
| `FederatedIdentity` remains the single linkage authority | SCIM stores its own `externalId` mapping; it does **not** create/modify `FederatedIdentity` (auth-subject linkage stays federation/JIT). |
| SCIM is transport, not domain truth | SCIM attributes are contact/provisioning data, coded; not authoritative for employment/licensing/clinical state (L12/Principle 10). |
| Programs 1–6 / 7A / 7B.1 / 7B.2 immutable | Additive entities + additive namespace + additive audit codes only; **no frozen-model change** (S7 keeps `User` untouched via a mapping entity). |

## 3. Guardrails
- SCIM `id` = the canonical `User.id`; `externalId` = the IdM's identifier (stored, mutable, **never** a canonical key);
  `userName`/`emails` are mutable and never canonical (L10).
- SCIM `active` maps deterministically to lifecycle via the boundary; SCIM never bypasses a lifecycle transition.
- SCIM writes no permissions/roles/sessions; provisions no clinical/AI authority; is idempotent.
- The SCIM bearer credential is **hash-only** at rest (sha256, the 7B.2 token pattern), lab-bound, revocable.
- SCIM never mints a user session and never touches 7A authentication strategies/guards.

## 4. Canonical data model (additive; no frozen-model change)
- **`ScimClient`** (per-lab SCIM provisioning credential): `id`, `clientUuid @unique`, `labId` (FK RESTRICT), `displayName`,
  `tokenHash @unique` (sha256, hash-only), `isActive`, `createdById?`, timestamps. The bearer credential the IdM presents;
  resolves the request's `labId`.
- **`ScimUserMapping`** (SCIM↔canonical identifier separation — L10): `id`, `labId` (FK RESTRICT), `userId` (FK RESTRICT,
  `@@unique[labId,userId]`), `externalId` (the IdM's id; `@@unique[labId, externalId]`), timestamps. Keeps SCIM's mutable
  external identifier off the frozen `User` model. **`User` is unchanged** (S7).
- Enum (if needed) for a SCIM sync outcome is optional; no JSON columns; provenance FKs `onDelete: Restrict`.

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
- **Idempotent:** repeat POST for an existing `externalId` resolves to the same mapping; repeat active/suspend is a no-op
  (the 7B.1 lifecycle idempotency). Discovery endpoints (`/ServiceProviderConfig`, `/ResourceTypes`, `/Schemas`) are
  static and read-only.

## 6. Trust boundaries
External IdM → **SCIM bearer credential** (hash-only, lab-bound) → resolve `labId` → `runLabScoped` → SCIM Users handler
→ `IdentityLifecycleService` (all lifecycle effects) + `User` attribute writes + `ScimUserMapping`. SCIM never: mints a
session, evaluates domain authorization, writes `FederatedIdentity`, sets a tenancy key from the body, or touches the
clinical/AI path.

## 7. Governance decisions requiring ratification (S1–S12)
- **S1 — SCIM as inbound transport into the frozen lifecycle.** All lifecycle effects via `IdentityLifecycleService`; SCIM
  is not an identity store. *Recommend: approve.*
- **S2 — SCIM authentication.** *Recommend:* a **dedicated per-lab `ScimClient` bearer credential** (hash-only, revocable)
  — the SCIM-standard static bearer, cleanly lab-scoped and distinct from user sessions and from the 7A.2b `ServicePrincipal`
  OAuth path. *(Alternative: reuse `ServicePrincipal` + a `scim:sync` scope — heavier, OAuth-only.)* Ratify.
- **S3 — Create landing state.** *Recommend:* SCIM create → **`PROVISIONED`** (exists, not yet login-enabled); if the SCIM
  payload has `active=true`, immediately `activate()` → ACTIVE. Model C placeholder password (federated-only identity).
- **S4 — `active` mapping.** `true → activate/reactivate`, `false → suspend`, `DELETE → deprovision` — all via the boundary.
- **S5 — Idempotency + concurrency.** POST by `externalId` idempotent; lifecycle transitions use the frozen single-winner
  CAS; concurrent SCIM ops resolve deterministically.
- **S6 — Attribute updates.** name/email updates are `User` profile writes (not lifecycle); enforce `@@unique[labId,email]`;
  reject/þ conflict per SCIM error schema.
- **S7 — Identifier separation (L10).** SCIM `externalId` lives in **`ScimUserMapping`**, NOT on `User` — no frozen-model
  change; canonical id is `User.id`; auth-subject stays in `FederatedIdentity`. Ratify (vs. an additive `User` column).
- **S8 — Provisioning-source precedence (L2).** SCIM-created ⇒ `originProvisioningSource=SCIM` (immutable). Whether SCIM may
  manage a MANUAL/INVITATION-origin identity (adopt) is a governed policy — *recommend: 7B.3 manages only identities it
  created or that are explicitly SCIM-linked; broader adoption deferred.*
- **S9 — Groups excluded.** No `groups` provisioning, no group→role mapping (7B.4/7C); a `groups` attribute in a payload is
  ignored/echoed, never authorization.
- **S10 — Audit.** Additive `IDENTITY_SCIM_SYNCED` (create/replace/patch outcome) + reuse of the 7B.1 lifecycle codes
  (`IDENTITY_PROVISIONED/ACTIVATED/SUSPENDED/DEPROVISIONED`) for the transitions; coded, **never** the bearer token or PHI.
- **S11 — SCIM protocol conformance.** RFC 7644 response/error schema (`urn:ietf:params:scim:api:messages:2.0:*`),
  `meta`/`version` (ETag), pagination + filtering scope (baseline: `eq` on `userName`/`externalId`); `/ServiceProviderConfig`
  advertises supported features honestly.
- **S12 — No outbound SCIM.** Inbound only (IdM→Osieri); Osieri never pushes SCIM outward. Ratify.

## 8. ET1–ET8 review
ET1/ET2 — no clinical/AI writes; SCIM provisioning confers no diagnostic/AI authority. ET3 — `labId` from the SCIM
credential (never the body); all SCIM rows `labId`-scoped; SCIM is never a tenancy key. ET4 — SCIM + lifecycle events
additive on the one append-only ledger. ET5 — SCIM grants no permissions; the `ScimClient` credential authorizes only the
SCIM provisioning surface, not domain resources; no default grant. ET6 — human `User` provisioning only. ET7 — SCIM
attributes are provisioning/contact data, not employment/licensing/clinical truth (L12). ET8 — Programs 1–6 + all 7A + 7B.1
+ 7B.2 immutable; **no frozen model modified** (mapping entity, not a `User` column). Conforms to Principles 1–12 +
GG1–GG7 (GG7 stable `User.id`; SCIM `externalId`/`userName` are mutable, never the durable key).

## 9. Risks
- **Protocol surface size:** SCIM 2.0 is broad; the baseline scopes to **Users** (+ discovery), deferring Groups/filtering
  breadth — must advertise honestly in `/ServiceProviderConfig` (no silent partial support).
- **Adoption/precedence ambiguity (S8):** a SCIM client managing a non-SCIM-origin identity could conflict with manual/
  invitation management — mitigated by scoping 7B.3 to SCIM-created/linked identities; broader policy deferred.
- **Credential handling:** the SCIM bearer must be hash-only, revocable, lab-bound; a leaked bearer is contained to one
  lab's provisioning surface (never domain authorization).
- **Sole-writer preservation:** SCIM handlers MUST route lifecycle through `IdentityLifecycleService` (enforced by the 7B.1
  arch scan + the gate assert), and may use the 7B.2 `activateInTx` seam for atomic create+activate.

## 10. Deferred decisions
SCIM **Groups** + membership (7B.4) · group→role/permission mapping (7B.4/7C) · outbound SCIM · SCIM bulk operations ·
advanced filtering/sorting beyond the baseline · adoption of non-SCIM-origin identities (S8 broad policy) · JIT federation
linkage (7B.5) · organization-scoped SCIM (7D).

## 11. Acceptance strategy (proposed folded gate — draft; not authorized to build)
`p7-scim-users-acceptance`: exact-head + candidate ancestry; acceptance-infra-only delta; frozen anchors immutable
(`p6-*`/all 7A/`p7-7a-complete`/`p7-7b1-accepted`/**`p7-7b2-accepted`**); persisted assertions (additive schema +
RESTRICT FKs, no frozen-`User` change; SCIM bearer hash-only; create → `PROVISIONED`/`active`→ACTIVE **via the lifecycle
boundary**; `active=false`→SUSPENDED; DELETE→deprovision (terminal); idempotency; identifier separation `externalId`≠
`User.id`≠auth-subject; **SCIM grants no permission**; **the 7B.1 sole-writer arch scan still passes**; cross-lab
fail-closed on the bearer; ET1–ET8); focused SCIM suites (bearer auth, create/read/update/patch/delete, active-mapping,
idempotency, RFC error schema, no-permission-grant) + the 7B.1 sole-writer arch spec; full no-exclusions non-regression;
strict tsc. Freeze tag (later) `p7-7b3-accepted`.

## 12. Implementation decomposition
7B.3 is delivered as **one** increment (SCIM Users core: bearer credential + Users CRUD + lifecycle mapping + discovery),
with its own design-refinement → implementation → acceptance → freeze. SCIM **Groups** is the separate **7B.4** increment.

## 13. What this document authorizes
**Nothing beyond its own authoring.** No schema/migration/dependency/endpoint/service/test/workflow/tag/baseline change is
authorized until this DoR is reviewed and approved and implementation is **separately** authorized. No accepted baseline
(`p6-complete` → `40d810e`, `p7-7a-complete` → `aef3faa`, `p7-7b1-accepted` → `9142d20`, `p7-7b2-accepted` → `53b936b`, and
the four 7A increment tags) is modified.

## 14. Governance state
| Stage | Status |
|---|---|
| 7B.3 read-only preflight + current-state map | Complete (§1) |
| 7B.3 boundary review | Drafted (§2) — awaiting governance review |
| 7B.3 Design of Record (S1–S12) | **Proposed — awaiting architecture review** |
| 7B.3 implementation | **Not authorized** |
