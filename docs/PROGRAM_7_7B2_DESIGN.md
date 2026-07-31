# Program 7 · Phase 7B.2 — Staff Invitations — DESIGN OF RECORD (proposed)

**Status:** Architecture-level design of record, **AWAITING governance review**. Governance-only: **no** implementation,
schema, migration, dependency, endpoint, test, workflow, tag, or baseline change is authorized here. Additive to the
frozen Programs 1–6, Phase 7A (`p7-7a-complete` → `aef3faa`), and **Phase 7B.1** (`p7-7b1-accepted` → `9142d20`);
modifies no accepted baseline. Phase 7B DoR: [`PROGRAM_7_7B_DESIGN.md`](./PROGRAM_7_7B_DESIGN.md) (L1–L12, esp. **L6**) ·
7B.1 closeout: [`PROGRAM_7_7B1_CLOSEOUT.md`](./PROGRAM_7_7B1_CLOSEOUT.md).

7B.2 is the **entry-by-invitation** provisioning path into the frozen lifecycle: a governed, token-based flow that takes
a staff identity from **INVITED → ACTIVE** on acceptance. It **activates access; it never grants permissions,
authenticates, provisions externally, links federated identities, or changes tenancy.**

---

## 1. Read-only preflight — current-state architecture (verified at `9142d20`)
**Reusable infrastructure (do not modify):**
- **Lifecycle entry hooks (7B.1, frozen):** `IdentityLifecycleService.provision(userId, INVITED)` creates the initial
  lifecycle evidence; `activate(userId)` performs `INVITED/PROVISIONED → ACTIVE` through the **single command boundary
  (L8)**. `IdentityLifecycleEvent` is the authoritative durable record (L9). `UserLifecycleState.INVITED` already exists.
- **Token pattern (portal):** `PortalAccessToken { labId, portalUserId (FK Cascade), type PortalTokenType{Invite,Reset},
  tokenHash @unique, expiresAt, usedAt?, createdAt }` + `common/portal-token.util` (`hashToken`, `expiryFromNow`) — a
  **hash-only, typed, single-use, expiring** token store. The exact shape to mirror for staff (FK **RESTRICT** per 7B
  convention; a richer status).
- **Hashing:** `common/crypto/phi-crypto.ts::sha256` (hash-only token storage; the unique hash index is the lookup key,
  so verification is a constant-time DB lookup — no plaintext compare). Argon2id (`argon2`) for the password the invitee
  sets on acceptance (same as `AuthService`).
- **Email:** `MailService.send(to, subject, html)` (nodemailer) — currently in the **portal**-scoped `MailModule`.
- **Auth gate (7A, frozen):** `AuthService` login requires `isActive` (`auth.service.ts:163`); an INVITED user is
  `isActive=false`, so it **cannot authenticate before acceptance** — even with a null password (the `isActive` check
  precedes any password verification).
- **Authorization (frozen):** the single `PermissionsGuard`; permission catalogue in `prisma/seed.ts` (`SPECIAL_OBJECTS`
  + `byPrefix` no-default-grant); 7B.1 added the `identitylifecycle:manage` namespace.
- **Portal invitation (analogue, NOT reused directly):** `portal-users.service` invites **PortalUsers** (a separate
  external identity class); its pattern informs 7B.2 but staff invitations are a **distinct** flow (L6).

**New capability (7B.2):** a **staff** invitation entity + issue/accept/cancel/resend flow bound to the frozen lifecycle,
a staff-facing email, additive invitation audit codes, and an additive admin permission namespace.

**Central preflight finding:** staff `User.passwordHash` is **required** (`schema:414`), whereas `PortalUser.passwordHash`
is nullable. An INVITED staff user has **no password until acceptance** — resolved by **I1/I8** below.

## 2. Boundary analysis — 7B.2 extends the frozen lifecycle without changing it
| Constraint | How 7B.2 satisfies it |
|---|---|
| `IdentityLifecycleService` remains the sole lifecycle writer | Invite **issue** provisions the user via `provision(INVITED)`; **acceptance** calls `activate()`. 7B.2 **never** writes `lifecycleState`/`isActive` — the sole-writer arch spec (7B.1) continues to pass. |
| Acceptance cannot bypass lifecycle transitions | The only state change is `activate()` (INVITED→ACTIVE) through the boundary; illegal source states fail closed. |
| Acceptance cannot bypass `PermissionsGuard` / never grants permissions | Acceptance is `@Public` + token-bound (invitee has no session yet); it sets a password + activates. It assigns **no** roles/permissions (L6/L11). Admin issue/cancel go through `PermissionsGuard`. |
| Never changes tenancy | Every invitation row carries `labId`; the invited user is created in the acting admin's lab; `labId`/`LabContext` unchanged (ET3). |
| Never becomes authentication | 7B.2 issues/consumes an invitation token; it does **not** mint sessions or JWTs, does not touch 7A strategies/guards. The user authenticates later via the normal 7A path once ACTIVE. |
| Never becomes provisioning (SCIM) / JIT linking | Invitation source is `INVITATION`; SCIM (7B.3/4) and JIT (7B.5) are distinct sources, deferred (I15/I16). |
| Never modifies 7A auth / 7B.1 lifecycle semantics | Additive entity + additive namespace + additive audit codes only; no change to `User` auth semantics beyond an additive nullable column (I1). |

## 3. Threat model
- **Token theft/guessing:** high-entropy (256-bit) token, emailed once, **hash-only** at rest (sha256); no plaintext
  persisted/logged/audited. Guessing infeasible; DB compromise yields only hashes.
- **Replay / double-accept:** single-use **compare-and-set** on `acceptedAt` (mirrors 7B.1 L9) — exactly one acceptance.
- **Expired-token use:** explicit `expiresAt`; expired → rejected + coded audit.
- **Cross-lab / cross-user misuse:** token bound to exactly one `(labId, userId)` INVITED identity; lookup is by hash
  then bound-identity check.
- **Enumeration:** acceptance failures are generic (invalid/expired/consumed indistinguishable); throttled.
- **Privilege escalation via acceptance:** acceptance grants **no** permissions; authorization is separate (L6/L11).
- **Email as attack surface:** email carries the one-time token to the intended recipient only; email is best-effort and
  never authoritative (the persisted invitation is). No secrets beyond the one-time token in the email body.
- **Admin abuse:** issue/cancel require `identityinvitation:manage` (no default grant), audited with actor attribution;
  break-glass remains a 7B.1 concern.

## 4. Governance decisions requiring ratification (I1–I16)
- **I1 — Invitation entity model.** *Recommendation:* **Model A** — the invited `User` exists in lifecycle **INVITED**
  (created via `provision(INVITED)`), and a new additive `StaffInvitation` binds to it (FK RESTRICT); `User.passwordHash`
  becomes **additively nullable** (null until acceptance; backward-compatible — existing rows unaffected; an INVITED
  user is `isActive=false` so cannot authenticate). *Alternative:* **Model B** — `StaffInvitation` holds pending data and
  the `User` is created only on acceptance (avoids the nullable column but diverges from L1, which defines INVITED as a
  *User* lifecycle state). Ratify A vs B.
- **I2 — Token generation.** 256-bit `randomBytes(32).base64url`; raw token returned once (email), never stored.
- **I3 — Hashing.** Store **sha256(token)** only (`@unique`); verification = lookup by hash (constant-time by
  construction). Never Argon2 for the lookup token (fast-hash lookup is correct for high-entropy tokens; Argon2 is for
  the user-chosen **password** set at acceptance).
- **I4 — Expiry.** Explicit `expiresAt` (default proposal **72h**, configurable); expired → fail closed.
- **I5 — Single-use.** Compare-and-set on `acceptedAt` (exactly-one; the 7B.1 CAS pattern). Resend **invalidates** the
  prior token (supersede).
- **I6 — Replay protection.** Consumed/expired/cancelled tokens fail closed; unique `tokenHash`; single-use CAS.
- **I7 — Invitation states.** `PENDING → ACCEPTED | CANCELLED | EXPIRED` (all terminal). Enum `StaffInvitationStatus`.
- **I8 — Lifecycle interaction.** Issue → `provision(INVITED)`; accept → set password (Argon2id) **then**
  `activate(INVITED→ACTIVE)` **through the lifecycle boundary** (L8) in one governed operation; the durable
  `IdentityLifecycleEvent` (ACTIVATED) is authoritative. Cancellation never changes lifecycle state (the user stays
  INVITED until an admin deprovisions — and per 7B.1 **L5, deprovision cancels outstanding invitations**).
- **I9 — Email delivery architecture.** Reuse `MailService` (extract a **shared** `MailModule` or import it) — best-effort,
  **asynchronous**, never authoritative; a delivery failure leaves the invitation persisted and re-sendable. No PHI; the
  one-time token is the only secret in the body.
- **I10 — Audit vocabulary.** Additive `IDENTITY_INVITED`, `IDENTITY_INVITATION_ACCEPTED`, `IDENTITY_INVITATION_CANCELLED`
  (+ coded failure reasons: `unknown`, `expired`, `consumed`, `cancelled`, `mismatch`) — the codes reserved in 7B DoR
  **L7**. Coded metadata; **never** the token, password, or PHI. `IDENTITY_ACTIVATED` (7B.1) fires for the lifecycle
  transition.
- **I11 — Permission model.** Admin issue/cancel/resend require a **new** additive `identityinvitation:manage` namespace
  (no default grant; distinct from `identitylifecycle:manage`), enforced at `PermissionsGuard`. **Acceptance is `@Public`
  + token-bound + throttled** (no session yet) and grants **no** permissions.
- **I12 — Concurrency.** Acceptance CAS (exactly-one); accept-vs-cancel → deterministic winner; resend supersedes;
  idempotent double-cancel.
- **I13 — Invitation revocation.** Cancel → `CANCELLED` + token voided (single-use consumed). Deprovision (7B.1) cancels
  all outstanding invitations for the user (already an L5 effect — 7B.2 wires the cancellation of its rows).
- **I14 — Administrative authority.** Issue/cancel/resend gated by `identityinvitation:manage`; actor attributed on the
  invitation + audit. No self-approval semantics required at this layer.
- **I15 — Interaction with SCIM (future 7B.3/7B.4).** Provisioning source is recorded (7B.1 `originProvisioningSource` =
  `INVITATION`). A SCIM-managed identity is not invitation-managed (source precedence, L2) — coordination **deferred** to
  the SCIM increments; 7B.2 makes no SCIM assumption.
- **I16 — Interaction with JIT (future 7B.5).** JIT links **ACTIVE** users only (7B.1 `assertLinkable`); an INVITED
  (pending-acceptance) user is not linkable until accepted. No conflict; coordination **deferred**.

## 5. Data model proposal (additive)
- Enum `StaffInvitationStatus { PENDING, ACCEPTED, CANCELLED, EXPIRED }`.
- Model `StaffInvitation`: `id`, `invitationUuid @unique` (GG7), `labId` (FK RESTRICT), `userId` (FK RESTRICT → the
  INVITED `User`), `tokenHash @unique` (sha256; hash-only), `status`, `expiresAt`, `acceptedAt?`, `cancelledAt?`,
  `invitedById?` (actor; no FK), timestamps. `@@index([labId])`, `@@index([userId])`. No PHI/secret columns.
- `User.passwordHash` → **additively nullable** (I1/Model A). *(No other frozen-model change.)*

## 6. State machine
```
StaffInvitation:  PENDING ──accept──▶ ACCEPTED (terminal)
                     │  └─expire──▶ EXPIRED (terminal)
                     └────cancel──▶ CANCELLED (terminal)

User lifecycle (7B.1, unchanged):  INVITED ──activate (on acceptance)──▶ ACTIVE
```

## 7. Sequence (issue → accept)
```
Admin ─(identityinvitation:manage)─▶ InvitationService.issue(email, roles?)
   └▶ IdentityLifecycleService.provision(user, INVITED)         [sole writer, L8]
   └▶ persist StaffInvitation{tokenHash=sha256(raw), expiresAt}  [hash-only]
   └▶ MailService.send(one-time link)  [best-effort, async]
   └▶ audit IDENTITY_INVITED (coded, no token)

Invitee ─(@Public, throttled, token)─▶ InvitationService.accept(raw, password)
   └▶ lookup by sha256(raw); assert PENDING + not-expired; CAS acceptedAt   [single-use]
   └▶ set User.passwordHash = argon2id(password)
   └▶ IdentityLifecycleService.activate(user)  [INVITED→ACTIVE, sole writer, L8]
   └▶ audit IDENTITY_INVITATION_ACCEPTED + (via lifecycle) IDENTITY_ACTIVATED
   └▶ NO session minted, NO permission granted   (user logs in later via 7A)
```

## 8. ET1–ET8 analysis
ET1/ET2 — no clinical/AI writes; acceptance confers no diagnostic/AI authority. ET3 — every invitation row `labId`-scoped;
never a tenancy key. ET4 — invitation + lifecycle events additive on the existing append-only ledger; no parallel chain.
ET5 — acceptance grants no permissions; `identityinvitation:manage` no default grant. ET6 — human `User` invitations only
(portal is separate). ET7 — no domain-truth/PHI (an invitation email address is contact data, coded, not licensing/HR
truth). ET8 — Programs 1–6 + all 7A increments + 7B.1 immutable; the only frozen-model touch is an additive nullable
`passwordHash`. Conforms to Principles 1–12 + GG1–GG7 (GG7 stable `User.id` across INVITED→ACTIVE).

## 9. Acceptance strategy (proposed folded gate — draft; not authorized to build)
`p7-staff-invitations-acceptance`: exact-head + candidate ancestry; acceptance-infra-only delta; frozen anchors
immutable (`p6-*`/`p7-7a*`/`p7-7a-complete`/**`p7-7b1-accepted`**); persisted assertions (additive schema + RESTRICT FKs;
**hash-only, no plaintext token persisted**; single-use CAS = exactly-one accept; expiry/replay/cancel fail-closed;
acceptance → `activate` **through the lifecycle boundary**; acceptance grants **no** permission; **the 7B.1 sole-writer
arch scan still passes** — 7B.2 adds no direct lifecycle write; deprovision cancels outstanding invitations; ET1–ET8);
focused invitation suites (token entropy/hash/verify/expiry/single-use/replay/accept→activate/no-permission-grant/
concurrency) + the 7B.1 sole-writer arch spec; full no-exclusions non-regression; strict tsc. Freeze tag (later)
`p7-7b2-accepted`.

## 10. Deferred / out of scope
Password **reset** for staff (separate flow; portal has `PortalTokenType.Reset`, staff reset is its own concern) · SCIM
(7B.3/7B.4) · JIT (7B.5) · bulk invitations · invitation-time role assignment as an *authorization* act (role selection
may be captured but authorization remains a 7C/PermissionsGuard concern) · organization-scoped invitations (7D) ·
outbound notifications beyond email.

## 11. Risks
- **Frozen-model change (I1/Model A):** additive nullable `User.passwordHash` touches a core model — mitigated by
  backward-compatibility (existing rows unchanged; INVITED users are `isActive=false` so cannot authenticate; all
  password-verifying paths are gated by `isActive` first). Model B avoids it at the cost of L1 divergence. **Governance
  chooses.**
- **Mail-module extraction:** reusing the portal `MailService` requires a shared module — an additive refactor
  (move/registration), not a behavior change; must not alter portal mail behavior.
- **Sole-writer invariant:** acceptance MUST route through `IdentityLifecycleService.activate` — enforced by the 7B.1
  arch scan in the gate (a direct write would fail the gate closed).

## 12. Implementation decomposition
7B.2 is cohesive and delivered as **one** increment (issue · accept · cancel · resend), with its own design-refinement →
implementation → acceptance → freeze. (No sub-split proposed; the flow is a single trust boundary.)

## 13. What this document authorizes
**Nothing beyond its own authoring.** No schema/migration/dependency/endpoint/service/test/workflow/tag/baseline change
is authorized until this DoR is reviewed and approved and implementation is **separately** authorized. No accepted
baseline (`p6-complete` → `40d810e`, `p7-7a-complete` → `aef3faa`, `p7-7b1-accepted` → `9142d20`, and the four 7A
increment tags) is modified.

## 14. Governance state
| Stage | Status |
|---|---|
| 7B.2 read-only preflight + current-state map | Complete (this document, §1) |
| 7B.2 boundary review | Drafted (§2) — awaiting governance review |
| 7B.2 Design of Record (I1–I16) | **Proposed — awaiting review** |
| 7B.2 implementation | **Not authorized** |
