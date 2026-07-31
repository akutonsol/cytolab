# Program 7 · Phase 7A.1 — Enterprise Authentication Foundation — Acceptance Closeout

**Status:** **ACCEPTED · FROZEN** at evidence head `84b9f74`. The Enterprise Authentication **foundation** only —
canonical principal + provider-isolation seam, additive and non-invasive; the existing local login path remains
authoritative. Identity is a platform service. No federated protocol (OIDC/OAuth/SAML) ships in 7A.1. References — and
modifies nothing in — the frozen Programs 1–6 (Program 6 complete at `p6-complete`). Charter:
[`PROGRAM_7_CHARTER.md`](./PROGRAM_7_CHARTER.md) (v1.3) · Guardrails: [`PROGRAM_7_GUARDRAILS.md`](./PROGRAM_7_GUARDRAILS.md)
· Design of record: [`PROGRAM_7_7A_DESIGN.md`](./PROGRAM_7_7A_DESIGN.md).

---

## 1. Accepted scope (7A.1 foundation)
- **Canonical principal** — one provider-agnostic representation of an authenticated identity, with a **stable internal
  identifier** (GG7) as the durable key; **human** and **non-human (service)** are structurally distinct principal
  classes (Principle 11); a non-human principal never holds clinical/AI authority.
- **Provider-isolation seam** — the `AuthenticationAdapter` interface + `AuthenticationService` (single principal-
  establishment boundary; deterministic — Principle 12); the `LocalAuthenticationAdapter` maps an already-verified user
  to the canonical principal and **does not reimplement or rewire password auth**. Downstream depends only on the
  canonical principal (Authentication Provider Isolation invariant).
- **Additive schema** — `IdentityProvider` (inert config), `ServicePrincipal` (non-human class), `FederatedIdentity`
  (inert linkage → the stable `User.id`); lab-scoped; 5 provenance FKs all `ON DELETE RESTRICT`; stable identifiers on
  each. `IdentityProvider` + `FederatedIdentity` are **inert** until the 7A.2/7A.3 adapters.
- **Administration** — `enterprise-auth` routes gated `identity:view` / `identity:manage` (**no default grant**); no
  clinical/AI/lifecycle/diagnostic route; the existing global `PermissionsGuard` remains the single enforcement point.
- **Non-invasive** — the live staff/portal login (`AuthService`/`SessionService`/`JwtAuthGuard`) is unchanged and
  authoritative; enterprise-auth introduces no login/session/token route.

## 2. Accepted implementation lineage
| SHA | Meaning |
|---|---|
| `98cc795` (+ invariant `75056f9`) | Program 7 · Phase 7A design of record (architecture-level) + Authentication Provider Isolation implementation invariant |
| **`112e6f8`** | **7A.1 implementation candidate** (schema + additive migration + `enterprise-auth` module + specs + `identity` permission) |
| `84b9f74` | final exact-head candidate = **frozen evidence head** (acceptance gate + seed/assert scripts + 2 PAIC corrections; product unchanged from `112e6f8`) |

`git diff 112e6f8 84b9f74` touches **0 product files** — the delta is the acceptance gate + two scripts + `.gitignore`
plus the two test-only PAIC corrections below. This phase required **no product reconciliation**.

**Platform Acceptance Infrastructure Corrections (PAIC — test-only; production byte-identical; pre-existing, unrelated
to Program 7):**
| SHA | Correction |
|---|---|
| `d90f4b6` | R-001a authz-contract arch scan recognizes the P5-5B composed `@DeliveryProtected()` contract (was flagging authorized delivery routes) |
| `1d8a82e` | P2-7B audit-catalog expectation reflects the accepted P5C `system:['health','security','ingestion']` |

**CI infrastructure (NOT accepted-implementation lineage):**
| SHA (on `main`) | Meaning |
|---|---|
| `3e71e4d` | 7A.1 gate registration on `main` (byte-identical blob `1a42f26` to the branch copy `84b9f74`) |

## 3. Authoritative acceptance evidence
- **Workflow:** `p7-enterprise-auth-acceptance` · **Run:** `30603180627` (#1, `workflow_dispatch`, `feat/program-7-iam`)
- **Exact tested SHA:** `84b9f74` (in-gate `git rev-parse HEAD == github.sha`; `git merge-base --is-ancestor 112e6f8 HEAD` satisfied)
- **Conclusion:** `success`

Accepted results:
- schema: **3 tables** (`IdentityProvider`, `ServicePrincipal`, `FederatedIdentity`) + **1 enum**
  (`IdentityProviderProtocol`) + **5 provenance FKs, all `RESTRICT`**; stable identifiers (GG7); no JSON columns.
- persisted-state assertions: **all passed** — provider-isolation seam + deterministic principal establishment;
  human/non-human principal classes; federated linkage → stable `User.id`; INERT IdP/FederatedIdentity; lab-scoping +
  cross-lab fail-closed; **existing local auth authoritative**; **downstream terminates at the existing
  PermissionsGuard**.
- **ET1–ET8: all GREEN** — no clinical-path writes; no AI-evidence mutation; tenancy anchor unchanged / no Org
  isolation key; single immutable ledger (no parallel identity chain); no authority-by-identity / no default grant;
  principal-class separation; no domain-truth/PHI; Programs 1–6 present.
- focused 7A.1 tests: **14/14** (3 suites).
- full cumulative non-regression (module-scoped batches, **no exclusions**): **~1,850 passed, 0 failed, 4 skipped**
  across ~214 suites (NR1 210, NR2 695, NR3 157, NR4 477, NR5 163, NR6 148).
- TypeScript: **0 errors** (strict `tsc --noEmit`).
- in-gate integrity: post-candidate delta asserted **acceptance-infra + PAIC only**; frozen `p6-6h-accepted`
  (`f98b9f1`) and `p6-complete` (`40d810e`) confirmed **unmoved**.
- evidence artifact: **`p7-7a-enterprise-auth-acceptance`** generated.

## 4. Frozen decisions
- Authentication establishes the principal; it never authorizes (Principle 1) and never becomes clinical/AI authority
  (Principles 2/3). The single global `PermissionsGuard` remains the authoritative enforcement point.
- The incumbent local auth remains authoritative (Principle 8); federation is added in front of it later, behind the
  same seam, with zero downstream change (Provider-Isolation invariant).
- The stable internal identifier is the durable key (GG7); external attributes are mutable and never the key.
- **Program 5 remains immutable; Program 6 remains complete and immutable; the two PAIC corrections are test-only with
  production byte-identical.**

## 5. Deferred scope (NOT in Phase 7A.1)
Any OIDC/OAuth 2.1 protocol adapter (**7A.2**) · any SAML 2.0 adapter (**7A.3**) · the service-principal machine-auth
(client-credentials) credential runtime · JIT/SCIM provisioning + durable external-subject linkage (D5 → 7B) · live-vs-
baked permission freshness (D1 → 7C) · role scoping (D2 → 7C) · the Organization model (D4 → 7D). Phase 7A is **not**
accepted as a whole by 7A.1's acceptance.

## 6. Freeze statement
**Program 7 · Phase 7A.1 is immutable at `84b9f74`.** Future work must reference this accepted foundation rather than
modify its baseline; corrections require a separately governed amendment. The `p7-7a1-accepted` tag pins the exact
evidence head `84b9f74`; this closeout is kept as a descendant.
