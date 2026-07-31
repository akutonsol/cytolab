# Program 7 · Phase 7B.1 — Identity Lifecycle Core — Acceptance Closeout

**Status:** **ACCEPTED · FROZEN** at evidence head `9142d20`. Governed human-identity **access-lifecycle** core over the
frozen 7A authentication foundation: the lifecycle-state overlay, the single lifecycle command boundary, deterministic
`isActive` coordination, suspend/reactivate/terminal-deprovision with coordinated session/refresh revocation +
federated-link deactivation, append-only durable evidence, and the additive lifecycle audit vocabulary. Additive and
non-invasive; `User.isActive` remains the frozen authentication gate, the single `PermissionsGuard` is unchanged, and
`labId`/`LabContext` remain the sole tenancy boundary. References — and modifies nothing in — the frozen Programs 1–6,
Phase 7A (`p7-7a-complete` → `aef3faa`). Design of record: [`PROGRAM_7_7B1_DESIGN.md`](./PROGRAM_7_7B1_DESIGN.md) ·
Phase 7B DoR: [`PROGRAM_7_7B_DESIGN.md`](./PROGRAM_7_7B_DESIGN.md) (L1–L12).

---

## 1. Accepted scope (7B.1 only)
The lifecycle **core**: additive `UserLifecycleState` overlay + immutable `originProvisioningSource`; the single
`IdentityLifecycleService` command boundary; deterministic state ↔ `isActive` coordination; suspend / reactivate /
terminal deprovision; coordinated session + refresh revocation and federated-link deactivation; the transition-legality
graph; single-winner CAS + idempotency; append-only durable lifecycle evidence; and six additive lifecycle audit codes.
**Out (deferred):** staff invitations (7B.2), SCIM Users (7B.3), SCIM Groups (7B.4), governed JIT linking (7B.5), and
all authorization/organization/delegation work.

## 2. Ratified-decision conformance (L1–L12)
- **L1** — five distinct states `INVITED/PROVISIONED/ACTIVE/SUSPENDED/DEPROVISIONED`; deterministic mapping **only ACTIVE
  ⇒ `isActive=true`**; the lifecycle service is the only coordinator (drift fails closed).
- **L2** — `originProvisioningSource` is immutable creation provenance (never current authority).
- **L3–L4** — SCIM + JIT are deferred (7B.3–7B.5); JIT is link-only when it lands.
- **L5** — deprovision is terminal: `isActive=false`, sessions + refresh revoked, links deactivated, `User.id` preserved,
  no hard delete; **already-issued stateless access tokens remain valid only to their short expiry** (no denylist).
- **L6–L7** — staff invitations deferred (7B.2); six additive `IDENTITY_*` audit codes, distinct from `LOGIN_*`/`ROLE_*`,
  coded, no secrets/PHI.
- **L8** — **single lifecycle command boundary:** `IdentityLifecycleService` is the sole production writer of
  `User.lifecycleState`/`isActive`; the legacy `UsersService.setActive` was reconciled to delegate to it (no direct
  write). Enforced in-gate by a source-scan.
- **L9** — atomic single-winner CAS + idempotency; the durable `IdentityLifecycleEvent` (same transaction) is the
  authoritative record; the AuditEvent is best-effort (OPERATIONAL).
- **L10–L12** — identifier separation, group/authorization boundary, and access-lifecycle ≠ HR/licensing truth apply to
  the later SCIM/group increments; 7B.1 introduces no domain-truth and no authorization meaning.

## 3. Design lineage
| SHA | Meaning |
|---|---|
| `cdc9629` | Phase 7B DoR (L1–L12 + 7B.1–7B.5 decomposition), ratified |
| `59ed066` | 7B.1 increment DoR (`PROGRAM_7_7B1_DESIGN.md`) |
| **`268472b`** | **accepted implementation candidate** (schema/migration + lifecycle module + L8 setActive reconciliation + tests) |
| `9142d20` | acceptance-infra head = **frozen evidence head** (gate + assert + docs; product unchanged from `268472b`) |

`git diff 268472b 9142d20` = **acceptance-infrastructure + docs only** (gate workflow + assert + `PROGRAM_7_7B1_DESIGN.md`);
**0 production files** after the candidate. **CI registration (NOT accepted-implementation lineage):** `1f747f4` — 7B.1
gate registration on `main` (byte-identical blob `2f04ec2` to the branch copy `9142d20`). *(An earlier gate head `4327aa2`
/ run `30670078424` failed on a gate-infrastructure allowlist bug — `docs/` vs `docs/.*` — and was superseded by the
regex fix; historical only, no product change.)*

## 4. Authoritative acceptance evidence
- **Workflow:** `p7-identity-lifecycle-core-acceptance` · **Run:** `30670404109` (#2, `workflow_dispatch`, `feat/program-7-iam`)
- **Exact tested SHA:** `9142d20` — `HEAD == github.sha`; descends candidate `268472b` (verified in-gate)
- **Conclusion:** `success` · **all 21/21 steps OK**

### Persisted-state assertions (real DI graph, isolated Postgres) — GREEN
Additive schema (2 enums + 4 `User` columns + `FederatedIdentity.deactivatedAt` + append-only `IdentityLifecycleEvent`,
**2 FKs `ON DELETE RESTRICT`**, no JSON; additive migration, 0 destructive, deterministic backfill) · **deterministic
state ↔ `isActive` mapping with no drift (L1)** · legal/illegal transition matrix · suspend/deprovision revoke sessions +
refresh · deprovision deactivates links + terminal + preserves `User.id` (no hard delete) (L5) · single-winner CAS +
idempotency (L9) · durable append-only evidence (L9) · **L8 sole-writer source-scan** · **ET1–ET8** all GREEN.

### Verification totals
| Area | Result |
|---|---|
| Focused identity-lifecycle (state + integration + sole-writer arch) | 17 / 17 |
| NR1 identity/auth-adjacent + core | 310 / 310 |
| NR1b audit (isolated) | 391 / 391 |
| NR2 Program 6 AI + WSI | 695 passed / 4 skipped |
| NR3 records / billing / reporting | 157 / 157 |
| NR4 messaging / ops | 86 / 86 |
| NR5 enterprise-admin / case / requisitions | 163 / 163 |
| NR6 remaining modules | 148 / 148 |
| **Full non-regression (no exclusions)** | **1,950 passed · 0 failed · 4 skipped** |
| Strict TypeScript | 0 errors |
| Artifact | `p7-7b1-identity-lifecycle-core-acceptance` |

**Protected anchors (verified unmoved in-gate + on GitHub):** `p6-6h-accepted` → `f98b9f1` · `p6-complete` → `40d810e` ·
`p7-7a1-accepted` → `84b9f74` · `p7-7a2a-accepted` → `e7bd388` · `p7-7a2b-accepted` → `e58ffb5` · `p7-7a3-accepted` →
`4da3afd` · `p7-7a-complete` → `aef3faa`.

## 5. Frozen decisions
- `IdentityLifecycleService` is the sole production writer of human-identity lifecycle state; the admin endpoint delegates
  to it. `isActive` stays the authentication gate; lifecycle grants no permissions, clinical, or AI authority.
- `originProvisioningSource` is immutable; `User.id` is preserved across every transition incl. terminal DEPROVISIONED
  (no hard delete, no identifier recycling; GG7).
- The frozen 7A `identity` permission catalogue is unchanged — lifecycle authority is the additive `identitylifecycle:manage`
  namespace (no default grant), enforced at the existing `PermissionsGuard`.

## 6. Deferred / out of scope
Staff invitations (7B.2) · SCIM Users (7B.3) · SCIM Groups (7B.4) · governed JIT linking (7B.5) · enterprise authorization
/ group→role mapping (7C) · organizations (7D) · delegated administration (7E) · hard deletion / erasure · outbound SCIM ·
HR/employment/licensing as domain truth.

## 7. Protected boundary / freeze statement
**Program 7 · Phase 7B.1 is immutable at `9142d20`.** Future work affecting identity lifecycle must be additive and
backward-compatible with this baseline, or proceed as separately governed work. The `p7-7b1-accepted` tag pins the exact
evidence head `9142d20`; this closeout is kept as a descendant. **This acceptance does not accept Phase 7B as a whole and
creates no broader `p7-7b-accepted` / `p7-7b-complete` tag; 7B.2–7B.5 remain not started.**
