# Program 7 · Phase 7B.2 — Staff Invitations — Acceptance Closeout

**Status:** **ACCEPTED · FROZEN** at evidence head `53b936b`. Governed **entry-by-invitation** into the frozen 7B.1
lifecycle: a token-based staff invitation flow (issue / accept / cancel / resend) that takes a staff identity from
**INVITED → ACTIVE** on acceptance — **only through `IdentityLifecycleService` (the sole lifecycle writer, L8)**, as one
atomic transaction. Additive and non-invasive; **no frozen model is modified** (Model C), `User.isActive` remains the
authentication gate, the single `PermissionsGuard` is unchanged, and `labId`/`LabContext` remain the sole tenancy
boundary. References — and modifies nothing in — the frozen Programs 1–6, Phase 7A (`p7-7a-complete` → `aef3faa`), or
Phase 7B.1 (`p7-7b1-accepted` → `9142d20`). Design of record: [`PROGRAM_7_7B2_DESIGN.md`](./PROGRAM_7_7B2_DESIGN.md)
(Model C + I1–I16 + 3 clarifications).

---

## 1. Accepted scope
Issue (create the invited User + hash-only token + advisory email), accept (activate), cancel, resend. **Out (deferred):**
staff password reset, SCIM Users (7B.3), SCIM Groups (7B.4), governed JIT linking (7B.5), invitation-time role assignment
as an authorization act (7C), and all organization/delegation work.

## 2. Ratified-decision conformance (Model C + I1–I16 + clarifications)
- **I1 / Model C** — the invited `User` is created in **INVITED** (`isActive=false`) with a **random placeholder Argon2id
  hash** (never NULL, unusable); `User.passwordHash` **stays NOT NULL** (no frozen-model change). Acceptance replaces the
  placeholder with the invitee's Argon2id password.
- **I2 / Clarification 3** — 256-bit opaque token; the invitation URL carries **only the token** (no email/userId/labId/
  invitationId); the server resolves everything from the token hash.
- **I3** — token stored **sha256 hash-only**; plaintext emailed once, never persisted/logged/audited.
- **I4–I7** — 72h explicit expiry; single-use; replay fail-closed; terminal states `PENDING → ACCEPTED | CANCELLED |
  EXPIRED`.
- **I8 / Clarification 1 (atomic acceptance)** — acceptance is **one database transaction**: validate token → CAS-claim
  `PENDING→ACCEPTED` → verify still INVITED → persist Argon2id password → `activateInTx` (INVITED→ACTIVE, same tx) →
  durable evidence. **All-or-nothing.** Failure before commit leaves invitation PENDING/reusable, user INVITED,
  `isActive=false`, placeholder unchanged, no acceptance/lifecycle event, no session/permission. Audit + advisory email
  fire **only after** the authoritative commit.
- **I9 / Clarification 2** — reuses `MailService`; **email is advisory only** — the DB commit is authoritative; mail
  failures never roll back identity state.
- **I10** — additive `IDENTITY_INVITED`, `IDENTITY_INVITATION_ACCEPTED`, `IDENTITY_INVITATION_CANCELLED` audit codes
  (distinct from `LOGIN_*`/`ROLE_*`), coded metadata, never the token/password/PHI.
- **I11 / I14** — admin issue/cancel/resend require the new additive `identityinvitation:manage` namespace (no default
  grant); **acceptance is `@Public` + token-bound + throttled and grants no permission**; enforcement terminates at the
  existing `PermissionsGuard`.
- **I8 / L8 — sole lifecycle writer preserved** — a new **additive transaction-aware seam** `activateInTx(tx, …)` runs
  the transition inside the caller's tx with **byte-identical** semantics to the public `activate()`; 7B.1's public
  methods, tests, and the sole-writer arch spec are unchanged/green. `StaffInvitationService` writes only `passwordHash`
  directly; all lifecycle-state writes remain inside `IdentityLifecycleService`.
- **I15 / I16** — SCIM/JIT coordination deferred to their owning increments.

## 3. Design lineage
| SHA | Meaning |
|---|---|
| `8becdb3` | 7B.2 DoR (Model C + I1–I16 + 3 clarifications), ratified |
| `38a75a2` | initial implementation candidate |
| **`f31c827`** | **accepted implementation candidate** (atomic-acceptance reconciliation: `activateInTx` seam + one-transaction `accept()` + concurrency/failure-injection tests) |
| `53b936b` | acceptance-infra head = **frozen evidence head** (gate re-root; product unchanged from `f31c827`) |

`git diff f31c827 53b936b` = **acceptance-infrastructure only** (the gate workflow); **0 production files** after the
candidate. **CI registration (NOT accepted-implementation lineage):** `a8731f7` — 7B.2 gate registration on `main`
(byte-identical blob `113e02b` to the branch copy `53b936b`). *(An earlier candidate `38a75a2` / gate head `b3e6ff6` /
run `30675465014`'s predecessor were superseded by the atomic-acceptance reconciliation; historical only.)*

## 4. Authoritative acceptance evidence
- **Workflow:** `p7-staff-invitations-acceptance` · **Run:** `30675465014` (#1, `workflow_dispatch`, `feat/program-7-iam`)
- **Exact tested SHA:** `53b936b` — `HEAD == github.sha`; descends candidate `f31c827` (verified in-gate)
- **Conclusion:** `success` · **all 21/21 steps OK**

### Persisted-state assertions (real DI graph, isolated Postgres) — GREEN
Additive schema (1 enum + `StaffInvitation` table + **2 `ON DELETE RESTRICT` FKs**, no JSON, **NO `User` change**) ·
**Model C** (INVITED / `isActive=false` / non-null placeholder / `source=INVITATION`) · **hash-only token** · **atomic
frozen acceptance order** (password persisted → `activate` via the lifecycle boundary → ACTIVE) · single-use CAS ·
expiry/cancel fail-closed · acceptance grants **no** permission · **L8 sole-writer preserved** (source scan) · **ET1–ET8**.

### Verification totals
| Area | Result |
|---|---|
| Focused staff-invitations + identity-lifecycle (incl. concurrency + failure-injection + sole-writer arch) | 32 / 32 |
| NR1 / NR1b(audit-isolated) / NR2 / NR3 / NR4 / NR5 / NR6 | 310 / 391 / 695+4skip / 157 / 86 / 163 / 148 |
| **Full non-regression (no exclusions)** | **1,950 passed · 0 failed · 4 skipped** |
| Strict TypeScript | 0 errors |
| Artifact | `p7-7b2-staff-invitations-acceptance` |

**Protected anchors (verified unmoved in-gate + on GitHub):** `p6-6h-accepted` → `f98b9f1` · `p6-complete` → `40d810e`
· `p7-7a1-accepted` → `84b9f74` · `p7-7a2a-accepted` → `e7bd388` · `p7-7a2b-accepted` → `e58ffb5` · `p7-7a3-accepted` →
`4da3afd` · `p7-7a-complete` → `aef3faa` · `p7-7b1-accepted` → `9142d20`.

## 5. Frozen decisions
- Acceptance is atomic and never strands a consumed invitation; activation flows only through `IdentityLifecycleService`
  (sole lifecycle writer). Acceptance grants no permission, mints no session, and performs no SCIM/JIT.
- `User.passwordHash` stays NOT NULL (Model C); the frozen 7A `identity` catalogue and 7B.1 lifecycle semantics are
  unchanged (the `activateInTx` seam is additive and behavior-identical).

## 6. Protected boundary / freeze statement
**Program 7 · Phase 7B.2 is immutable at `53b936b`.** Future work affecting staff invitations must be additive and
backward-compatible with this baseline, or proceed as separately governed work. The `p7-7b2-accepted` tag pins the exact
evidence head `53b936b`; this closeout is kept as a descendant. **This acceptance does not accept Phase 7B as a whole and
creates no broader `p7-7b-accepted` / `p7-7b-complete` tag; 7B.3–7B.5 remain not started.**
