# Program 7 · Phase 7B — Identity Lifecycle — DESIGN OF RECORD (approved with required revisions)

**Status:** Architecture-level design of record — **APPROVED WITH REQUIRED REVISIONS** (rulings L1–L12, the 7B.1–7B.5
decomposition, and the required DoR revisions, all incorporated below). Implementation is **not yet authorized** — a
separate implementation authorization is required after this revised DoR is confirmed. Governance-only: **no** schema,
migration, dependency, endpoint, SCIM implementation, service, or test is authorized here. Additive to the frozen
Programs 1–6 and the certified Program 7A (`p7-7a-complete` → `aef3faa`); references — and modifies nothing in — any
accepted baseline. Charter: [`PROGRAM_7_CHARTER.md`](./PROGRAM_7_CHARTER.md) · Guardrails:
[`PROGRAM_7_GUARDRAILS.md`](./PROGRAM_7_GUARDRAILS.md) (ET1–ET8 / GG1–GG7) · Phase 7A master closeout:
[`PROGRAM_7_7A_MASTER_CLOSEOUT.md`](./PROGRAM_7_7A_MASTER_CLOSEOUT.md).

7A answered *“who are you?”*. 7B answers *“how does your identity **enter, evolve within, and leave** the platform?”* —
identity **lifecycle**, not authentication protocols (7A), authorization policy (7C), organizations (7D), tenancy, or
clinical/AI authority.

---

## 1. Read-only preflight — current state (verified at `feat/program-7-iam` tip `aef3faa`)
- **Lifecycle state = `User.isActive` (boolean).** Only transition: `UsersService.setActive`. No status enum,
  soft-delete, invitation state, provisioning-source, or sync metadata.
- **`isActive` is the live authentication gate** — re-checked at password login (`auth.service.ts:163`), MFA (`:224`),
  session/refresh validation (`:277`), and federated login (`:433`). Deactivation blocks **new** auth + refresh;
  stateless short-lived access tokens live to expiry (no denylist — consistent with 7A.2b/D4).
- **`setActive` is not wired to session teardown** — emits only a generic `recordEntityStateChanged`; the existing
  `SessionService.revokeSession` / `revokeByRefreshToken` primitives are unused by it.
- **D5 unrealized** — `FederatedIdentityService.link()` has **zero production callers**; federated login fails closed on
  an unlinked subject.
- **Staff provisioning = admin-set password** (no staff invitation). Invitations exist **only** for portal users (a
  separate external identity class) — 7B must not conflate them.
- **Anchors (frozen, reused):** `User` (`@@unique[labId,email]`), `FederatedIdentity`
  (`@@unique[labId,identityProviderId,externalSubject]`, sole external→`User.id` link), `IdentityProvider`,
  `UserRole`/`Role`, `UserSession`/`RefreshToken`, `Account`/`Workspace`; tenancy = `labId`+`LabContext`+extension.
- **Audit present:** `ROLE_*`, `ACCOUNT_UNLOCKED`, `USER_MFA_RESET`, 7A `LOGIN_*`, 7A.2b `SERVICE_*`. **Absent:** any
  provisioning/suspend/reactivate/deprovision/invitation/JIT lifecycle codes.

**Conclusion:** 7B is a net-additive governance + lifecycle layer over frozen anchors; the materially new elements are a
canonical lifecycle state machine (additive overlay on `isActive`), governed provisioning paths (manual/invitation/SCIM/
JIT) terminating at the existing `User`/`FederatedIdentity`, and an additive lifecycle audit vocabulary.

## 2. Ratified governance rulings (L1–L12) — binding on implementation

### L1 — Lifecycle-state representation (APPROVED WITH REVISION)
An **additive** lifecycle-state overlay; `User.isActive` remains the **frozen runtime authentication gate**. Five
**distinct** canonical states — **INVITED and PROVISIONED are NOT a shared start path** (different evidence):
- **INVITED** — activation pending acceptance by the intended person.
- **PROVISIONED** — identity exists via an authoritative administrative lifecycle source but may not yet be login-enabled.
- **ACTIVE** — authentication permitted (subject to all other controls).
- **SUSPENDED** — reversible administrative block.
- **DEPROVISIONED** — terminal.

**Deterministic mapping (only ACTIVE ⇒ true):**

| Lifecycle state | `isActive` |
|---|---|
| INVITED | false |
| PROVISIONED | false |
| ACTIVE | **true** |
| SUSPENDED | false |
| DEPROVISIONED | false |

**Only the lifecycle service may coordinate state ↔ `isActive`; any direct state/`isActive` drift fails closed** (L8).

### L2 — Provisioning sources + precedence (APPROVED WITH CLARIFICATION)
Sources = {MANUAL, INVITATION, SCIM, JIT}. Provisioning source is **immutable creation provenance, not current
authority**. Distinguish three concerns: **`originProvisioningSource`** (immutable, set once at creation, never
overwritten — SCIM later managing a manually-created identity does **not** rewrite origin); **lifecycle events** (who/
what performed each later transition); **external-management policy** (whether a source may continue managing the
identity). **Break-glass is NOT a fifth source** — it is an exceptional administrative action with elevated permission,
a bounded reason, explicit audit, **no** silent override of terminal DEPROVISIONED, **no** self-approval, and **no**
change to clinical/AI authority.

### L3 — SCIM scope (APPROVED)
Baseline: **SCIM 2.0 inbound Users + inbound Groups**; **no outbound SCIM**; SCIM is a **transport/protocol boundary,
not an identity database**. SCIM identifiers (SCIM `id`/`externalId`) map to stable internal records; **mutable username/
email must never become a canonical identity key** (L10). A **SCIM Group is lifecycle membership evidence only** — it
**must not** grant Osieri permissions in 7B; any group→role/permission mapping is **7C** (L11). *Evidence/Capability/
Authority separation: SCIM may report membership; 7B stores/synchronizes it; 7C decides whether it has authorization
meaning.*

### L4 — JIT policy / D5 (APPROVED WITH BASELINE RESTRICTION)
Baseline: **JIT linking** may be enabled by governed **per-provider** policy; **JIT user-creation is DISABLED**.
Accepted baseline behavior: `validated external identity → existing governed internal identity found → create
FederatedIdentity link → authentication continues only if lifecycle = ACTIVE`. **No** email-only / display-name / fuzzy
matching; **no** automatic reactivation; **no** link creation for SUSPENDED/DEPROVISIONED users unless a **separately
authorized** administrative workflow first restores an eligible lifecycle state. **JIT user-creation is a later
sub-increment (7B.5) with its own acceptance boundary** (it introduces identity-creation authority, duplicate-account
risk, source precedence, invitation interaction, default-role risk, rollback concerns).

### L5 — Deprovisioning semantics (APPROVED)
DEPROVISIONED is **terminal** in the 7B baseline. The transition **atomically/deterministically** coordinates: state →
DEPROVISIONED · `isActive=false` · **revoke all active human sessions** · **invalidate refresh capability** · deactivate
federated links · **cancel outstanding staff invitations** · **prevent new linking** · preserve stable `User.id` ·
preserve identity/event/audit evidence · preserve existing domain references. **No hard delete; no identifier recycling;
no email/username reuse that makes historical attribution ambiguous.** **Access-token boundary (explicit):** already-
issued **stateless** access tokens remain valid **until expiry**, bounded by their configured short lifetime; the
closeout must **not** claim immediate revocation of issued access tokens unless the runtime actually enforces it
(session/refresh revocation is enforced; access-token denylist is **not** in scope).

### L6 — Staff invitations (APPROVED WITH SECURITY CONTRACT)
Separate from portal-user invitations. Baseline contract: high-entropy **single-use** token; **hash-only** persistence;
explicit **expiry**; **lab** binding; **intended-recipient** binding; binding to exactly **one INVITED identity**;
deterministic **cancellation**; **replay failure**; **no** password transmission or admin-set password; acceptance
transitions **exactly once** to ACTIVE (L9); audit initiation/acceptance/cancellation/expiry/failure; **no permissions
granted by acceptance** (acceptance activates access; authorization is assigned/enforced separately via the existing
permission system).

### L7 — Lifecycle audit vocabulary (APPROVED)
Additive Program-7 extension to the existing audit registry (no modification/overloading of `LOGIN_*` or `ROLE_*`).
Codes: `IDENTITY_PROVISIONED`, `IDENTITY_INVITED`, `IDENTITY_INVITATION_ACCEPTED`, `IDENTITY_INVITATION_CANCELLED`,
`IDENTITY_ACTIVATED`, `IDENTITY_SUSPENDED`, `IDENTITY_REACTIVATED`, `IDENTITY_DEPROVISIONED`, `IDENTITY_LINKED`,
`IDENTITY_LINK_DEACTIVATED`, `IDENTITY_SCIM_SYNCED`, `IDENTITY_GROUP_MEMBERSHIP_ADDED`,
`IDENTITY_GROUP_MEMBERSHIP_REMOVED` (final set may be tightened at increment design). Metadata is **coded** and must
**never** contain invitation tokens, SCIM bearer tokens, passwords, raw SCIM payloads, full external claims, PHI, or
mutable profile fields unless explicitly safe and necessary.

### L8 — Single lifecycle command boundary (BINDING)
**All** lifecycle transitions pass through **one** lifecycle service / command boundary. No controller, SCIM handler,
invitation handler, or JIT handler may directly mutate **lifecycle state**, **`isActive`**, **session-revocation
state**, or **federated-link active state** — they **request a governed transition**. This prevents source-specific
logic from producing inconsistent identity states.

### L9 — Transition atomicity + concurrency (BINDING)
Transitions use **compare-and-set / transactional** protection: two invitation acceptances → exactly one succeeds; SCIM
deprovision racing manual reactivation → one deterministic winner; suspension racing JIT linking → **no active link may
emerge for a non-active identity**; repeated SCIM requests are **idempotent**. Each accepted transition produces its
lifecycle evidence **and** audit event in the **same transaction where technically possible**; where audit is
intentionally best-effort under the platform’s existing rule, the **durable lifecycle event** (the persisted state
transition) remains the authoritative record.

### L10 — Identifier separation (BINDING)
Three distinct identifiers with separate provenance, never conflated: **authentication-subject identity** (SAML
`NameID` / OIDC `sub`, via `FederatedIdentity`) · **SCIM resource identity** (SCIM `id` / `externalId`, a lifecycle/
provisioning reference) · **canonical internal identity** (`User.id`). **A SCIM operation must not silently rewrite an
authentication linkage.**

### L11 — Group-membership vs authorization boundary (BINDING)
SCIM group membership in 7B is **evidence + lifecycle data only**. It may support reconciliation, reporting, future
authorization mapping, and explicitly-governed lifecycle-policy input. It must **not** grant permissions, create
clinical roles, grant AI-approval authority, override existing role assignments, or bypass `PermissionsGuard`. External-
group → Osieri-role/permission mapping is **deferred to 7C**.

### L12 — Access lifecycle ≠ HR/licensing truth (BINDING)
ACTIVE/SUSPENDED/DEPROVISIONED are **Osieri access-lifecycle states only** — never authoritative proof of employment,
medical licensure, credentialing, board certification, clinical privileges, or external organization membership
(Principle 10; preserves the Evidence/Governance/Capability/Authority separation).

## 3. Standing architectural invariants (carried forward, unmodified)
I1 `FederatedIdentity` = the only external→`User.id` linkage · I2 `IdentityProvider` = federation config anchor (7B
extends lifecycle, never redefines authentication) · I3 `labId`+`LabContext` = sole tenancy; orgs/groups/invitations are
administrative overlays only · I4 JIT = governed policy on the frozen linkage (never changes auth, never reactivates a
non-ACTIVE identity) · I5 additive-only over immutable Programs 1–6 + 7A; `isActive` remains the auth gate.

## 4. Cross-program boundary review (ET1–ET8)
ET1/ET2 — no clinical/AI writes; lifecycle confers no diagnostic/AI-approval authority (reactivation grants no clinical
authority). ET3 — all lifecycle rows `labId`-scoped; SCIM org/group/invite never an isolation key. ET4 — lifecycle
events additive on the one append-only ledger; no second chain. ET5 — lifecycle = eligibility, not permissions; no
default grant. ET6 — human `User` lifecycle only; frozen non-human `ServicePrincipal` lifecycle referenced, not merged.
ET7 — not domain-truth for employment/licensing (L12/Principle 10). ET8 — Programs 1–6 + all 7A increments immutable.
Conforms to Principles 1–12 + GG1–GG7 (GG7 stable `User.id` preserved across every transition incl. DEPROVISIONED).

## 5. Recommended implementation decomposition (7B.1–7B.5)
Phase 7B is larger than one safe increment; each sub-increment gets its own design → acceptance → freeze cycle, and
Phase 7B receives a later phase-level completion review.
- **7B.1 — Lifecycle Core:** lifecycle-state overlay; the single lifecycle transition service (L8); `isActive`
  coordination; suspend/reactivate; deprovision (L5) incl. session/refresh revocation + federated-link deactivation;
  lifecycle events + audit vocabulary (L7); concurrency (L9).
- **7B.2 — Staff Invitations:** invitation model; issue/cancel/accept/expire; hash-only single-use tokens (L6);
  INVITED → ACTIVE; no permission grant.
- **7B.3 — SCIM Users:** inbound SCIM 2.0 Users; idempotent create/update/deactivate; `originProvisioningSource`
  provenance (L2); identifier separation (L10); no group authorization.
- **7B.4 — SCIM Groups:** inbound Groups + membership reconciliation; lifecycle evidence only (L11); no role/permission
  mapping.
- **7B.5 — Governed JIT Linking:** per-provider policy; **link existing users only** (no auto-create in the baseline);
  suspension/deprovision protection (L4).

## 6. Future folded-gate requirements (each increment)
Exact-head + candidate ancestry; post-candidate delta acceptance-infra only; **frozen anchors immutable in-gate**
(`p6-complete` → `40d810e`, `p7-7a-complete` → `aef3faa`, and the four 7A increment tags `84b9f74`/`e7bd388`/`e58ffb5`/
`4da3afd`); persisted-state assertions (additive schema + RESTRICT FKs; deterministic state↔`isActive` mapping; single
lifecycle command boundary; CAS single-winner + idempotency; deprovision coordinated effects; hash-only invite tokens;
identifier separation; group-membership-non-authoritative; no-JIT-auto-create); **ET1–ET8**; focused + full no-exclusions
non-regression; strict tsc. Freeze tags `p7-7b<n>-accepted` per increment.

## 7. Deferred / out of scope
7C authorization / permission graph / group→role mapping · 7D organizations · 7E delegated administration ·
authentication protocol changes (7A frozen) · hard deletion / erasure / retention · JIT user auto-creation (later 7B.5
sub-decision) · outbound SCIM / SCIM beyond L3 baseline · non-human `ServicePrincipal` lifecycle beyond 7A.2b · HR/
employment/licensing as domain truth.

## 8. What this document authorizes
**Nothing beyond its own authoring.** S/L rulings are binding on implementation, but no schema/migration/dependency/
SCIM/endpoint/service/test is authorized until a **separate implementation authorization** is granted against this
revised DoR (per-increment 7B.1–7B.5). No accepted baseline is modified.

## 9. Governance state
| Stage | Status |
|---|---|
| 7B read-only preflight + current-state map | Complete |
| 7B architecture review | Approved |
| 7B boundary review | Approved |
| 7B guardrails | Approved with additions L8–L12 |
| 7B Design of Record | **Approved with required revisions — incorporated (L1–L12, 7B.1–7B.5)** |
| 7B implementation | **Not authorized** |
| 7B.1–7B.5 | Not started |
