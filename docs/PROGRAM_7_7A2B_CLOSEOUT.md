# Program 7 · Phase 7A.2b — Service-Principal OAuth — Acceptance Closeout

**Status:** **ACCEPTED · FROZEN** at evidence head `e58ffb5`. Machine (non-human) authentication via **OAuth 2.0 Client
Credentials** for the frozen 7A.1 `ServicePrincipal` class, plus its credential lifecycle. Additive and non-invasive; the
human login path is unchanged. References — and modifies nothing in — the frozen Programs 1–6, Phase 7A.1, or Phase
7A.2a. Charter: [`PROGRAM_7_CHARTER.md`](./PROGRAM_7_CHARTER.md) (v1.3) · Guardrails:
[`PROGRAM_7_GUARDRAILS.md`](./PROGRAM_7_GUARDRAILS.md) · Design of record: [`PROGRAM_7_7A2B_DESIGN.md`](./PROGRAM_7_7A2B_DESIGN.md).

---

## 1. Phase overview
7A.2b delivers the **non-human** authentication half of Phase 7A: a machine (service) principal authenticates with the
**Client Credentials** grant to obtain a short-lived service token whose authority is a set of existing-catalogue
`Permission` scopes, enforced by the **single existing `PermissionsGuard`**. It builds on the 7A.1 `ServicePrincipal`
entity (unchanged) and is fully separate from the interactive human path (7A.2a).

## 2. Ratified Design-of-Record summary (D1–D6)
- **D1** — credential is a **child** `ServicePrincipalCredential`; the frozen `ServicePrincipal` shape is unchanged.
- **D2** — a **signing seam** (`ServiceTokenSigner`) issues/verifies machine tokens; today it reuses the existing
  keyset, structured so a future dedicated **service keyset** swaps in without consumer change.
- **D3** — **distinct** machine audit events (a Program-7-authorized additive Program 2 registry extension), not the
  human `LOGIN_*` events.
- **D4** — short-lived access tokens only; **no** refresh, introspection, live JWT denylist, or machine session.
- **D5** — scopes are the **existing `Permission` catalogue** (a `ServicePrincipalScope` join); one authorization
  vocabulary; enforcement is the single existing `PermissionsGuard`; `isSuperRole` never applies.
- **D6** — **Machine Identity Immutability:** stable `principalUuid`; `key`/`client_id` never renamed/reassigned/
  recycled; no hard-delete (deactivation only); audit attributable forever.

## 3. Architecture summary
- **Machine identity model:** the 7A.1 `SERVICE` canonical principal; a service principal is never a human user and
  never holds clinical/diagnostic/sign-out/AI-approval authority (ET6). `client_id` = the globally-unique
  `principalUuid`; `isSuperRole` is always false.
- **Service authentication flow:** `POST enterprise-auth/oauth/token` (`@Public`, throttled, `grant_type=client_
  credentials` only) → resolve the principal + lab **system-scoped** by `principalUuid` → mandatory `SERVICE_AUTH_
  INITIATED` → verify the secret vs. its Argon2id hash under the principal's lab (constant-work anti-enumeration;
  generic failure) → on success mint a short-lived token (`aud=service`, `scope=service`, `type=access`, restricted
  `permissions`, `isSuperRole=false`, **no `sid`**) + `SERVICE_AUTH_SUCCEEDED`; on failure `SERVICE_AUTH_FAILED`. No
  `SessionService` record (D4).
- **Live request path:** a `@Service` route → `JwtAuthGuard` stands down (mirrors `@Portal`) → the global
  `ServiceAuthGuard` validates the `'jwt-service'` token and binds the `SERVICE` principal → the **existing
  `PermissionsGuard`** evaluates the route's `@RequirePermissions` against the token's scopes. `ServiceAuthGuard` stands
  down (no-op) on every non-`@Service` route, so the human/public/portal path is unchanged.
- **Permission-catalogue authorization model:** service scopes are `ServicePrincipalScope → Permission` grants; the
  token's `permissions[]` are those codes; the one `PermissionsGuard` enforces them. No second scope language, no
  second evaluator.
- **Additive schema:** `ServicePrincipalCredential` + `ServicePrincipalScope` + enum `ServiceCredentialStatus`;
  provenance FKs `ON DELETE RESTRICT`; 0 destructive; `ServicePrincipal` unchanged.
- **Machine-specific audit events (D3):** `SERVICE_AUTH_INITIATED` (mandatory once a valid attempt is processed),
  `SERVICE_AUTH_SUCCEEDED`, `SERVICE_AUTH_FAILED`, `SERVICE_CREDENTIAL_ROTATED`, `SERVICE_CREDENTIAL_REVOKED` — on the
  existing append-only `AuditEvent` ledger, coded metadata, **no secrets** (never the client secret, token, or
  plaintext).

## 4. Accepted implementation lineage
| SHA | Meaning |
|---|---|
| `7f70a0c` (7A.2 design additions) | 7A.2a/7A.2b split + the config-immutability invariant; DoR ratified D1–D6 |
| `9218467` | 7A.2b core implementation (schema + credential lifecycle + token endpoint + audit codes + strategy/guard/decorator) |
| **`f072538`** | **live-wiring completion candidate** (global guard-chain integration; representative `@Service` route; `client_id`=principalUuid) |
| `e58ffb5` | final exact-head candidate = **frozen evidence head** (acceptance gate YAML fix; product unchanged from `f072538`) |

`git diff f072538 e58ffb5` = **acceptance-infrastructure only** (workflow + seed); **0 product files** after the live-
wiring candidate. **CI infrastructure (NOT accepted-implementation lineage):** `d014315` — 7A.2b gate registration on
`main` (byte-identical blob `ab45f1e` to the branch copy `e58ffb5`).

## 5. Authoritative acceptance evidence
- **Workflow:** `p7-service-principal-oauth-acceptance` · **Run:** `30635759436` (#3, `workflow_dispatch`, `feat/program-7-iam`)
- **Exact tested SHA:** `e58ffb5` — descends the chain `9218467` / `f072538` (verified in-gate)
- **Conclusion:** `success` · **all 21/21 steps OK**

### ET1–ET8 (persisted assert, all GREEN)
No clinical-path writes (ET1) · no AI-evidence mutation (ET2) · `labId` tenancy anchor unchanged (ET3) · single
immutable ledger — no parallel identity chain (ET4) · no authority-by-identity / no default grant (ET5) · principal-
class separation (ET6) · no domain-truth/PHI (ET7) · Programs 1–6 + 7A.1 + 7A.2a present/immutable (ET8). Plus:
Argon2id hash-only / no plaintext, distinct service token, Permission-catalogue scopes, bad-secret/unknown-client
fail-closed, rotation revokes prior, single-PermissionsGuard enforcement, cross-lab fail-closed, machine-identity
immutability, existing-auth authoritative.

### Verification totals
| Area | Result |
|---|---|
| Focused enterprise-auth incl. live e2e | 57/57 |
| NR1 identity/auth-adjacent + core | 210/210 |
| NR1b audit (isolated process) | 391/391 |
| NR2 Program 6 AI + WSI | 695 passed / 4 skipped |
| NR3 records/billing/reporting | 157/157 |
| NR4 messaging/ops | 86/86 |
| NR5 enterprise-admin/case/requisitions | 163/163 |
| NR6 remaining modules | 148/148 |
| **Full non-regression (no exclusions)** | **~1,850 passed · 0 failed · 4 skipped** |
| Strict TypeScript | 0 errors |
| Artifact | `p7-7a2b-service-principal-oauth-acceptance` |

**Protected anchors (verified unmoved in-gate):** `p6-6h-accepted` → `f98b9f1` · `p6-complete` → `40d810e` ·
`p7-7a1-accepted` → `84b9f74` · `p7-7a2a-accepted` → `e7bd388`.

## 6. Frozen decisions
- Authentication establishes the machine principal; it never authorizes (single `PermissionsGuard`) and never becomes
  clinical/AI authority. `ServiceAuthGuard` authenticates only.
- `client_id` = the globally-unique, immutable `principalUuid`; the client secret is stored only as an Argon2id hash and
  returned once; machine identity is never recycled (D6).
- Human authentication is unchanged (no `@Public` widening, `JwtAuthGuard` not weakened, staff strategy still requires
  `aud=staff`, no session/OIDC change).
- **Programs 1–6 remain immutable; Phases 7A.1 and 7A.2a remain frozen.** The five machine audit codes are an additive
  Program 2 extension only.

## 7. Scope exclusions (NOT in Phase 7A.2b)
Human authentication · OIDC expansion · SAML (7A.3) · SCIM · API keys · personal access tokens · JWT-bearer grant ·
Device Code · Token Exchange · refresh tokens · live JWT revocation / denylist · introspection endpoint · any tenancy
change · any clinical/AI authority.

## 8. Protected boundary / freeze statement
**Program 7 · Phase 7A.2b is immutable at `e58ffb5`.** Future work affecting machine authentication must be additive and
backward-compatible with this baseline, or proceed as separately governed work. The `p7-7a2b-accepted` tag pins the
exact evidence head `e58ffb5`; this closeout is kept as a descendant. **This acceptance does not accept Phase 7A.2 as a
whole and creates no broader `p7-7a2-accepted` tag; 7A.3 (SAML) remains unauthorized.**
