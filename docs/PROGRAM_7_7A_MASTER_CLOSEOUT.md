# Program 7 · Phase 7A — Enterprise Authentication — MASTER CLOSEOUT (COMPLETE)

**Status:** **PHASE COMPLETE.** The four governed increments of Phase 7A — 7A.1, 7A.2a, 7A.2b, 7A.3 — are each
independently Accepted & Frozen and together constitute one completed **Enterprise Authentication** capability. This
master closeout is the phase-level record; it declares completion and creates no new engineering. Companion records:
per-increment closeouts (`PROGRAM_7_7A1_CLOSEOUT.md`, `PROGRAM_7_7A2A_CLOSEOUT.md`, `PROGRAM_7_7A2B_CLOSEOUT.md`,
`PROGRAM_7_7A3_CLOSEOUT.md`), the baseline index (`PROGRAM_7_BASELINE_INDEX.md`), charter (`PROGRAM_7_CHARTER.md` v1.3),
and guardrails (`PROGRAM_7_GUARDRAILS.md`, ET1–ET8 / GG1–GG7).

Program 7 (Enterprise IAM) opened after Program 6 completed (`p6-complete` → `40d810e`) and **references — never modifies
— the frozen Programs 1–6.**

---

## 1. The completed capability
Phase 7A delivers enterprise authentication as a **platform service** (Principle 9): every authentication front-end —
local password, interactive OIDC, service-principal OAuth, and SP-initiated SAML — resolves to a single canonical
principal and terminates at the existing session/authorization boundary. Downstream clinical (Programs 1–5) and AI
(Program 6) code remains identity-agnostic and unchanged.

```
Local Password ─┐
OIDC Federation ┤
SAML Federation ┤─▶ AuthenticationAdapter ─▶ Canonical Principal ─▶ Existing Session Bridge ─▶ PermissionsGuard
Service OAuth ──┘        (provider-isolation seam)     (HUMAN | SERVICE)     (no parallel session)   (one evaluator)
```

## 2. Architectural continuity (the phase invariant)
- **One provider-isolation seam** — `AUTHENTICATION_ADAPTERS = [local, oidc, saml]`; each adapter's sole output is a
  `CanonicalPrincipal`; protocol/assertion/token knowledge terminates inside its adapter (7A.1 invariant, preserved
  through 7A.3).
- **One canonical principal** — human (`User.id`, GG7) vs. non-human service (`ServicePrincipal.id`); a non-human
  principal never holds clinical/diagnostic/sign-out/AI-approval authority (Principle 11 / ET6).
- **One authorization vocabulary + one evaluator** — the existing single `PermissionsGuard` (APP_GUARD); no second
  authorization engine emerged. `ServiceAuthGuard` (7A.2b) authenticates only and stands down off `@Service`.
- **One session bridge** — OIDC and SAML both resolve via the shared `FederatedIdentityService` linkage and hand off to
  the existing `AuthService.completeFederatedLogin` (no parallel session).
- **Tenancy unchanged** — `labId` + `LabContext` + the Prisma tenancy extension remain the sole isolation anchor; an
  IdP/provider is never a tenancy key (Principle 4 / ET3).

## 3. Governance decisions (spanning the phase)
- Federation is a **front-end**, not a replacement — incumbent local auth stays authoritative (Principle 8).
- Interactive OIDC (7A.2a): Authorization Code + PKCE, discovery/JWKS/claim validation fail-closed, transaction
  config-immutability + single-use; **no** auto-provisioning (7B/D5).
- Service OAuth (7A.2b): OAuth 2.0 Client Credentials, Argon2id hash-only credentials, **distinct machine audit codes**,
  Permission-catalogue scopes via the single `PermissionsGuard`, machine-identity immutability (D1/D6).
- SAML (7A.3): SP-initiated only (S3), a **vetted library behind a validator seam** (S2), configured-cert trust anchor
  with rollover (S4), request/assertion single-use + replay (S5), **reuse** of human `LOGIN_*` audit codes (S6),
  EncryptedAssertion excluded (S7), full assertion semantic binding (S8), RelayState-as-correlation (§3a), opaque NameID
  linkage (§3b).
- **Audit:** OIDC/SAML reuse the human `LOGIN_*` codes (`method=oidc|saml`); 7A.2b added five **distinct** machine codes.
  All additive on the existing append-only ledger — **no** second identity chain (ET4).

## 4. The four frozen increments
| Increment | Accepted evidence head | Tag | Authoritative CI run |
|---|---|---|---|
| 7A.1 — Enterprise Authentication Foundation | `84b9f74` | `p7-7a1-accepted` | `30603180627` (success) |
| 7A.2a — Interactive OIDC Federation | `e7bd388` | `p7-7a2a-accepted` | `30608520089` (success) |
| 7A.2b — Service-Principal OAuth | `e58ffb5` | `p7-7a2b-accepted` | `30635759436` (success) |
| 7A.3 — SAML Federation (SP-initiated) | `4da3afd` | `p7-7a3-accepted` | `30657622621` (success) |

Each tag is annotated and peels to its evidence head; each closeout is a docs-only descendant; the freeze chain is
linear (`84b9f74 → e7bd388 → e58ffb5 → 4da3afd`). Every increment carried **ET1–ET8 GREEN**, strict tsc 0, and full
no-exclusions cumulative non-regression. Gate registrations on `main`: `3e71e4d` / `6049cae` / `d014315` / `a55d8f4`.

## 5. Completion Review disposition
The Phase 7A Completion Review (read-only, 2026-07-31) **PASSED** all eight audits with no deficiencies: frozen-tag
integrity, baseline-index consistency, per-increment Design→Implementation→Acceptance→Freeze lineage, no post-tag
baseline mutation, authoritative acceptance evidence per increment, architectural continuity, governance consistency,
and documentation accuracy.

## 6. Cross-program boundary preservation
Enterprise IAM acquired **no** authority over clinical workflows, AI governance, tenancy, audit ownership, or diagnostic
authority. Programs 1–6 and every Phase-7A increment baseline remain immutable: `p6-6h-accepted` → `f98b9f1`,
`p6-complete` → `40d810e`, `p7-7a1-accepted` → `84b9f74`, `p7-7a2a-accepted` → `e7bd388`, `p7-7a2b-accepted` → `e58ffb5`,
`p7-7a3-accepted` → `4da3afd`.

## 7. Deferred / out of scope (not Phase 7A)
Just-in-time provisioning / automatic linking / SCIM (Phase 7B / D5) · IdP-initiated SAML · EncryptedAssertion · Single
Logout (SLO) · SP-metadata publishing · HTTP-Artifact binding · enterprise RBAC / permission graph / custom roles (7C) ·
Organization model (7D) · delegated administration (7E) · session/token governance & device trust (7F) · identity
governance & reporting (7G–7H). None of these are implied by Phase 7A completion.

## 8. Immutable completion statement
**Program 7 · Phase 7A — Enterprise Authentication is COMPLETE at this master closeout.** The four increments are frozen
and immutable; this phase-level record is pinned by the annotated tag `p7-7a-complete`. Phase 7A completion is **not** an
acceptance of any later Program 7 phase (7B–7H); each remains separately governed. Future changes to enterprise
authentication must be additive and backward-compatible with these baselines, or proceed as separately governed work.
