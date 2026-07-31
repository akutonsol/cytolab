# Program 7 · Phase 7B.1 — Identity Lifecycle Core — DESIGN OF RECORD (increment)

**Status:** Increment design-of-record, derived from and bound by the ratified Phase 7B DoR
([`PROGRAM_7_7B_DESIGN.md`](./PROGRAM_7_7B_DESIGN.md), rulings L1–L12) and the approved 7B.1–7B.5 decomposition.
Implemented candidate: `5ae7818`. Additive over the frozen Programs 1–6 and Phase 7A (`p7-7a-complete` → `aef3faa`);
modifies no accepted baseline. `User.isActive` remains the frozen authentication gate; the single `PermissionsGuard` is
the only authorization evaluator; `labId`/`LabContext` remain the sole tenancy boundary.

---

## 1. Scope (7B.1 only)
The governed access-lifecycle **core**: the lifecycle-state overlay, the single lifecycle command boundary, deterministic
`isActive` coordination, suspend/reactivate, terminal deprovision (with coordinated session/refresh revocation + federated-
link deactivation), the transition-legality graph, single-winner concurrency + idempotency, append-only durable evidence,
and the additive lifecycle audit vocabulary. **Out (later increments):** staff invitations (7B.2), SCIM Users (7B.3),
SCIM Groups (7B.4), governed JIT linking (7B.5), and any authorization/organization/delegation work.

## 2. Additive schema (0 destructive; migration `20260731110000`)
- Enums `UserLifecycleState { INVITED, PROVISIONED, ACTIVE, SUSPENDED, DEPROVISIONED }` and
  `ProvisioningSource { MANUAL, INVITATION, SCIM, JIT }`.
- `User` (+4 columns): `lifecycleState` (default `ACTIVE`), `originProvisioningSource` (immutable, default `MANUAL` — L2),
  `lifecycleUpdatedAt?`, `deprovisionedAt?`. `isActive` is unchanged and remains the auth gate.
- `FederatedIdentity` (+1 nullable): `deactivatedAt?` — evidence of link deactivation on deprovision (the `isActive` gate
  is the runtime enforcement; frozen 7A `resolve()` behavior is unchanged).
- `IdentityLifecycleEvent` (new, append-only, **authoritative durable record** — L9): `labId`+`userId` (both FK `RESTRICT`),
  `fromState?`, `toState`, `reason?`, `actorUserId?`, timestamps. No JSON/PHI/secret columns.
- **Drift-safe backfill:** existing `isActive=false` rows → `SUSPENDED` (never terminal `DEPROVISIONED`), so no
  `lifecycleState`↔`isActive` disagreement is introduced (L1).

## 3. State machine + deterministic mapping (L1)
Legal graph: `INVITED/PROVISIONED → ACTIVE`; `ACTIVE → SUSPENDED`; `SUSPENDED → ACTIVE`; any of
`INVITED/PROVISIONED/ACTIVE/SUSPENDED → DEPROVISIONED` (terminal). Everything else fails closed. Deterministic mapping:
**only `ACTIVE` ⇒ `isActive=true`**; every other state ⇒ `false`. Encoded as pure policy in `lifecycle-state.ts`.

## 4. Single command boundary (L8) + atomicity/concurrency (L9)
`IdentityLifecycleService` is the **only** production writer of `lifecycleState` / its `isActive` coordination / the
coordinated effects. Each transition runs one DB transaction: guard idempotency (already-in-target ⇒ benign no-op) →
legality check → **single-winner compare-and-set** on `lifecycleState` (`updateMany … where lifecycleState IN (from)`;
exactly one concurrent writer wins) → write the durable `IdentityLifecycleEvent` in the **same** transaction → coordinated
effects. A lost CAS re-reads and resolves to idempotent-success (if already at target) or fails closed. Best-effort
`OPERATIONAL` AuditEvent is emitted afterwards; the committed lifecycle event is authoritative.

## 5. Coordinated effects (L5)
- **suspend:** `SUSPENDED`, `isActive=false`, revoke active sessions + refresh; **retain** federated links.
- **reactivate (SUSPENDED-only):** `ACTIVE`, `isActive=true`; does **not** restore revoked sessions; grants nothing.
- **deprovision (terminal):** `DEPROVISIONED`, `isActive=false`, `deprovisionedAt` set, revoke sessions + refresh,
  deactivate federated links; **preserve `User.id`** and all history (no hard delete, no identifier recycling).
- **Access-token boundary (explicit):** already-issued stateless access tokens remain valid **until their short
  expiry** (no denylist — consistent with 7A). Session + refresh revocation is enforced; immediate access-token
  invalidation is **not** claimed.

## 6. Authorization + audit
- New **additive** permission namespace `identitylifecycle:manage` — the frozen 7A `identity` catalog is **unchanged**;
  assigned to **no** default role (no default grant, ET5); enforced by the existing `PermissionsGuard`. Grants no clinical/
  AI authority (L11/L12).
- Six additive `ADMINISTRATIVE` audit codes: `IDENTITY_PROVISIONED`, `IDENTITY_ACTIVATED`, `IDENTITY_SUSPENDED`,
  `IDENTITY_REACTIVATED`, `IDENTITY_DEPROVISIONED`, `IDENTITY_LINK_DEACTIVATED` — distinct from `LOGIN_*`/`ROLE_*`; coded
  metadata only (no password/token/claim/PHI). Invitation/SCIM/group/JIT codes remain deferred (L7).

## 7. Boundaries (ET1–ET8)
No clinical/AI writes (ET1/ET2) · `labId` sole isolation anchor on every lifecycle row (ET3) · events additive on the one
append-only ledger (ET4) · lifecycle = eligibility, not permissions; no default grant (ET5) · human `User` lifecycle only
(ET6) · not employment/licensing truth (ET7 / L12) · Programs 1–6 + all 7A increments immutable (ET8).

## 8. Verification (local) + proposed gate
Local: strict tsc 0; `identity-lifecycle` 15/15; `audit`+`users`+`roles` 408/408; the frozen-7A identity-catalog guard
green (the additive namespace leaves `SPECIAL_OBJECTS.identity` unchanged). Proposed folded gate
`p7-identity-lifecycle-core-acceptance` (prepared, **not registered/dispatched**): exact-head + candidate `5ae7818`
ancestry; acceptance-infra-only post-candidate delta; frozen `p6-*`/`p7-7a*`/`p7-7a-complete` anchors immutable;
persisted-state assert (schema census, state↔isActive no-drift, transition matrix, coordinated effects, single-winner CAS
+ idempotency, ET1–ET8); focused + full no-exclusions non-regression; strict tsc. Freeze tag (later) `p7-7b1-accepted`.

## 9. What this authorizes
Nothing beyond the implemented 7B.1 scope. Acceptance-gate registration/dispatch, acceptance, and freeze remain
**unauthorized** pending completion review + separate authorizations. 7B.2–7B.5 remain not started.
