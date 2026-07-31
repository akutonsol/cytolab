# Program 7 · Phase 7A.2a — Interactive OIDC Federation — Acceptance Closeout

**Status:** **ACCEPTED · FROZEN** at evidence head `e7bd388`. The **first real federation protocol** — interactive
**human** OIDC (Authorization Code + PKCE) — added **behind the accepted 7A.1 provider-isolation seam**; additive and
non-invasive; the existing local login remains authoritative. References — and modifies nothing in — the frozen
Programs 1–6 or the frozen Phase 7A.1 baseline. Charter: [`PROGRAM_7_CHARTER.md`](./PROGRAM_7_CHARTER.md) (v1.3) ·
Guardrails: [`PROGRAM_7_GUARDRAILS.md`](./PROGRAM_7_GUARDRAILS.md) · Design of record:
[`PROGRAM_7_7A2_DESIGN.md`](./PROGRAM_7_7A2_DESIGN.md) · 7A.1 baseline:
[`PROGRAM_7_7A1_CLOSEOUT.md`](./PROGRAM_7_7A1_CLOSEOUT.md).

---

## 1. Accepted implementation scope
Interactive **human** OIDC federation only — **Authorization Code + PKCE (S256)**. An `OidcAuthenticationAdapter`
plugs into the accepted 7A.1 `AUTHENTICATION_ADAPTERS` seam and resolves a validated external subject to a **canonical
HUMAN principal** via the 7A.1 `FederatedIdentity` linkage; session establishment reuses the existing `SessionService`
path. **No** machine authentication, client-credentials, SAML, automatic provisioning, or email-based linking (see §10).

## 2. Architecture summary
- **Provider-isolation preserved:** the OIDC adapter is the only component that knows OIDC; its sole output is the
  canonical principal. Downstream (guards, `@CurrentUser()`, realtime) is unchanged.
- **Transaction:** a short-lived, single-use `OidcAuthTransaction` (additive table) survives the IdP redirect, binding
  `state` (CSRF), `nonce` (replay), the PKCE verifier, the exact redirect URI, and a **configuration fingerprint**.
- **Validation pipeline:** OIDC discovery + metadata validation (configured issuer is the trust anchor) → code exchange
  (PKCE, exact redirect URI) → JWKS key selection by `kid` (`OidcJwksResolver`: bounded cache + one rotation refresh +
  cooldown + fail-closed) → ID-token validation (`jose`: signature/iss/aud/exp/nbf/iat within bounded skew/nonce;
  asymmetric-only) → federated resolution to the canonical human principal (unlinked ⇒ fail closed).
- **Additive schema:** `OidcAuthTransaction` + nullable `IdentityProvider.clientId`/`redirectUri` (public client;
  **no stored secret**); provenance FKs `ON DELETE RESTRICT`; 0 destructive.
- **Session:** reuses the existing single session mechanism (`AuthService.completeFederatedLogin` → `SessionService`);
  no parallel session; the live local login is unchanged and authoritative.

## 3. Accepted implementation lineage
| SHA | Meaning |
|---|---|
| `98cc795` (+ invariant `75056f9`) → design additions `7f70a0c` | 7A design of record + provider-isolation invariant; 7A.2 design (OIDC) + 7A.2a/7A.2b split + configuration-immutability invariant |
| `5dfb970` | initial interactive OIDC implementation |
| `67e99ba` | completion obligations (token-time, discovery, JWKS, error handling, audit, tests) |
| `4fb8fcf` | authorized additive `AUTHENTICATION/LOGIN_INITIATED` audit-registry extension |
| **`e7bd388`** | **folded acceptance / frozen evidence head** (acceptance gate + seed/assert; product unchanged from `4fb8fcf`) |

`git diff 4fb8fcf e7bd388` = **acceptance-infrastructure only** (workflow + two scripts + `.gitignore`); **0 product
files** after the candidate.

**CI infrastructure (NOT accepted-implementation lineage):** `6049cae` — 7A.2a gate registration on `main`
(byte-identical blob `08a0059` to the branch copy `e7bd388`).

## 4. Authoritative acceptance evidence
- **Workflow:** `p7-oidc-federation-acceptance` · **Run:** `30608520089` (#1, `workflow_dispatch`, `feat/program-7-iam`)
- **Exact tested SHA:** `e7bd388` — descends the full candidate chain `5dfb970` / `67e99ba` / `4fb8fcf` (verified in-gate)
- **Conclusion:** `success` · **all 20/20 steps OK**

### Security obligations satisfied (focused OIDC jest, step 12)
Authorization Code + PKCE S256 · strong `state`/`nonce`/verifier generation · exact redirect-URI reuse · configured
issuer as trust anchor · discovery endpoint + metadata validation · **asymmetric-only** algorithm allowlist (`none`/HMAC
rejected) · `kid`-based JWKS selection · **bounded JWKS caching + one rotation refresh + cooldown** · `exp`/`nbf`/`iat`
+ bounded clock-skew enforcement · fail-closed handling of provider errors + invalid callback state.

### Provider configuration immutability (persisted assert, step 11)
The transaction binds a config fingerprint at initiation; a config change mid-transaction **fails the callback closed**.

### Persisted concurrency (persisted assert, step 11)
Two concurrent consumes of one valid transaction → **exactly one success, one fail-closed** (substantiates the CAS
single-use boundary). Single-use verified.

### Authorized additive `LOGIN_INITIATED` audit extension
A **Program-7-authorized additive** `AUTHENTICATION/LOGIN_INITIATED` code was added to the Program 2 audit registry
(**not** a PAIC, **not** a historical modification of the Program 2 accepted baseline). It is emitted **only** after a
transaction is successfully created (never on pre-transaction failure). The full lifecycle — `LOGIN_INITIATED`,
`LOGIN_SUCCEEDED`, coded `LOGIN_FAILED` — is recorded on the existing append-only `AuditEvent` ledger with metadata
that **excludes** tokens, authorization codes, PKCE verifiers, nonce, raw state, email, PHI, and any secret.

### ET1–ET8 (all GREEN)
No clinical-path writes (ET1) · no AI-evidence mutation (ET2) · tenancy anchor unchanged / no Org isolation key (ET3) ·
single immutable ledger — no parallel identity chain (ET4) · no authority-by-identity / no default grant (ET5) ·
principal-class separation (ET6) · no domain-truth/PHI (ET7) · Programs 1–6 + 7A.1 present (ET8).

### Verification totals
| Area | Result |
|---|---|
| Focused enterprise-auth + OIDC | 38 / 38 |
| NR1 identity/auth-adjacent + audit registry | 601 / 601 |
| NR2 Program 6 AI + WSI | 695 passed / 4 skipped |
| NR3 records/billing/reporting | 157 / 157 |
| NR4 messaging/ops | 86 / 86 |
| NR5 enterprise-admin/case/requisitions | 163 / 163 |
| NR6 remaining modules | 148 / 148 |
| **Full non-regression (no exclusions)** | **~1,850 passed · 0 failed · 4 skipped** |
| Strict TypeScript | 0 errors |
| Artifact | `p7-7a2a-oidc-federation-acceptance` |

**Protected anchors (verified unmoved in-gate):** `p6-6h-accepted` → `f98b9f1` · `p6-complete` → `40d810e` ·
`p7-7a1-accepted` → `84b9f74`.

## 5. Frozen decisions
- Federation authenticates; it never authorizes (single global `PermissionsGuard` untouched) and never becomes
  clinical/AI authority. The configured issuer is the trust anchor; discovery may not redefine it.
- The stable `User.id` is the durable linkage key (GG7); external subject/email are mutable and never the key.
- The incumbent local login remains authoritative; OIDC is opt-in per enabled provider with a fail-closed
  callback-after-disablement policy; rollback is a flag flip (no schema rollback).
- **Programs 1–6 remain immutable; Phase 7A.1 remains frozen.** `LOGIN_INITIATED` is an additive P2 extension only.

## 6. Scope exclusions (NOT in Phase 7A.2a)
**7A.2b — Service-Principal OAuth** (client-credentials / machine authentication + credential lifecycle) and **7A.3 —
SAML federation** are **out of scope and unauthorized**. Also excluded: automatic / JIT / SCIM provisioning (7B),
email-based account linking, any authorization-policy redesign, any tenancy change, any clinical/AI authority.

## 7. Freeze statement
**Program 7 · Phase 7A.2a is immutable at `e7bd388`.** Future work must reference this accepted foundation rather than
modify its baseline; corrections require a separately governed amendment. The `p7-7a2a-accepted` tag pins the exact
evidence head `e7bd388`; this closeout is kept as a descendant. **This acceptance does not accept Phase 7A.2 as a whole
(7A.2b remains unauthorized) and creates no broader `p7-7a2-accepted` tag.**
