# Program 7 · Phase 7A.2 — OIDC / OAuth 2.1 Federation — DESIGN OF RECORD (architecture-level)

**Status:** Phase 7A.2 design of record — **architecture-level, for review.** Authorized by governance (7A.2 design
only). **No implementation artifacts** are introduced here — no schema/models, migrations, endpoints, guards, adapters,
or code. This design defines the OIDC/OAuth 2.1 federation architecture that plugs the **first real protocol** into the
**accepted 7A.1 provider-isolation seam** (frozen at `p7-7a1-accepted` → `84b9f74`), and shows conformance to
Principles 1–12, GG1–GG7, and ET1–ET8. Concrete schema/API/implementation design follows **only** after this design is
approved and implementation is separately authorized.

Charter: [`PROGRAM_7_CHARTER.md`](./PROGRAM_7_CHARTER.md) (v1.3) · Guardrails: [`PROGRAM_7_GUARDRAILS.md`](./PROGRAM_7_GUARDRAILS.md)
· 7A design: [`PROGRAM_7_7A_DESIGN.md`](./PROGRAM_7_7A_DESIGN.md) · 7A.1 closeout: [`PROGRAM_7_7A1_CLOSEOUT.md`](./PROGRAM_7_7A1_CLOSEOUT.md).

---

## 1. Scope & constraint
Phase 7A.2 adds an **OIDC / OAuth 2.1 authentication provider** behind the accepted 7A.1 seam: it verifies an external
assertion and resolves it to a **canonical principal**, then hands off to the existing `SessionService`. It is
**additive** and **non-invasive** — the incumbent local login and every downstream consumer are unchanged (Principle 8).
7A.2 **authenticates**; it does not provision, authorize, or redesign policy. This document commits **architecture**,
not tables or routes.

## 2. Position in the accepted seam
```
 OIDC/OAuth IdP ──▶ [OidcAuthenticationAdapter] ──▶ CanonicalPrincipal ──▶ SessionService ──▶ existing guards/app
                    (the ONLY component that knows          (7A.1)              (existing)         (unchanged)
                     OIDC/OAuth; behind the 7A.1 AuthenticationAdapter interface)
```
The new adapter registers behind the existing `AUTHENTICATION_ADAPTERS` seam alongside `local`. Downstream depends
**only** on the canonical principal (Authentication Provider Isolation invariant); no clinical/AI/authorization code
changes.

## 3. Supported flow
- **Authorization Code + PKCE** is the **default interactive flow** (OAuth 2.1; PKCE mandatory, S256). The
  browser/agent is redirected to the IdP authorize endpoint; the IdP redirects back to a platform callback with a
  code; the platform exchanges the code (+PKCE verifier) at the token endpoint for an ID token (and access token).
- Implicit and password grants are **not** supported (OAuth 2.1 prohibits them).
- **Client-credentials** (non-interactive, machine) is the natural fit for the 7A.1 **service-principal** machine-auth
  runtime; whether it lands in 7A.2 or a dedicated service-principal increment is a design decision flagged here
  (recommended: a small, clearly-separated sub-scope, since it reuses the same token machinery but a distinct principal
  class — Principle 11).

## 4. Issuer discovery & metadata validation
- OIDC discovery via the provider's `/.well-known/openid-configuration`; the resolved `issuer`, `authorization_endpoint`,
  `token_endpoint`, `jwks_uri`, and supported algorithms are validated against the registered `IdentityProvider`
  configuration (the 7A.1 inert config becomes active). Discovery documents are cached with a bounded TTL and refetched
  deterministically (no ambient/time-random inputs beyond the declared TTL + trust material — Principle 12/GG1).
- The `issuer` in every token must exactly equal the discovered/configured issuer.

## 5. Signing-key & JWKS handling
- Fetch + cache the provider JWKS from `jwks_uri`; select the key by `kid`; validate the ID-token signature against it.
- **Algorithm allowlist** (asymmetric only, e.g. RS256/ES256); `alg: none` and symmetric HMAC with the client secret
  are rejected. Key rotation is handled by JWKS refresh on unknown `kid` (bounded, rate-limited).

## 6. Token & claim validation (fail-closed)
- **ID token:** validate signature, `iss`, `aud` (== client id), `exp`/`iat`/`nbf` (with bounded clock skew), and
  `nonce` (== the value bound to this authentication). Reject on any failure.
- **Required claims:** a stable subject (`sub`) is mandatory (it is the external subject used for linkage). Additional
  claims (email, etc.) are treated as **mutable external attributes**, never the durable key (GG7).
- Access/refresh tokens from the IdP are used only as needed for the flow; the platform issues its **own** session via
  `SessionService` (§9) — IdP tokens are not the platform session.

## 7. Provider → canonical-principal resolution (via the 7A.1 seam)
- The validated `(issuer/provider, sub)` is resolved through the 7A.1 `FederatedIdentityService` to a **canonical human
  principal bound to the stable `User.id`** (GG7). If no linkage exists, authentication **fails closed** — 7A.2 performs
  **no auto-provisioning / JIT / account creation** (that is provisioning → **7B / D5**, an explicit non-goal here).
- The adapter's only output is the canonical principal; the IdP/token/claims never leak downstream (Provider
  Isolation).

## 8. State / nonce / PKCE / callback / replay protections
- **State** parameter binds the callback to the initiating request (CSRF protection); single-use, bounded lifetime.
- **Nonce** binds the ID token to the authentication (replay protection); single-use, verified against the token.
- **PKCE** (S256) binds the code to the client that requested it.
- **Callback** is validated against a registered redirect URI (exact match); authorization codes are single-use and
  short-lived. Replays (reused code/state/nonce) are rejected.

## 9. Lab & organization login routing (tenancy unchanged)
- A login request routes to the correct `IdentityProvider` by an explicit selector — lab/organization or the existing
  `LabDomain` host mapping. **`labId` remains sourced canonically and is never derived from Organization**; the
  Organization/administrative overlay is **never** a tenancy/isolation key (Principle 4 / **ET3**). Routing selects a
  provider; it does not change what data is isolated.

## 10. Session establishment (existing SessionService)
- After principal establishment, the existing `SessionService` issues the **same** session/token artifacts (rotating
  refresh, device-bound `UserSession`, idle/max-lifetime, HttpOnly cookies for staff) — **no parallel session system**
  (GG4). Session establishment is provider-independent and deterministic (Principle 12).

## 11. Failure behavior & audit evidence
- Every validation failure (discovery/JWKS/signature/claim/state/nonce/PKCE/callback/replay/unlinked-subject) **fails
  closed** — no session is issued and no principal is established.
- Authentication events (attempt, success, failure, method=oidc/oauth, provider, reason-code) are emitted through the
  **existing `AuditRecorder` + hash-chained `AuditEvent` ledger**, append-only, **id/name-free** metadata, attribution
  from `ExecutionContext` (**ET4/GG3**). No PHI, no tokens, no external claims are logged (**ET7**).

## 12. Feature-gated rollout & rollback
- OIDC/OAuth per provider ships behind **per-lab/per-org FeatureKey gating** (opt-in; GG5). Local auth remains
  authoritative; disabling the feature or a provider **falls back to local authentication** with no data migration and
  no downstream change. Rollback is a flag flip, not a redeploy.

## 13. Dependency & external trust boundaries
- A **single vetted OIDC/OAuth library** (e.g. `openid-client`) performs protocol mechanics; the exact dependency is an
  implementation-design decision, added only at implementation.
- **Trust boundaries (from the 7A design):** the IdP and everything it returns are **untrusted** until validated
  (discovery, JWKS, signature, claims, state/nonce/PKCE, callback). Network egress is limited to the configured IdP
  discovery/JWKS/token endpoints. The platform never trusts an IdP to assert platform identity — it only maps a
  validated subject to an existing internal principal.

## 14. Explicit non-goals (7A.2)
Provisioning / JIT account creation · **SCIM** (→ 7B) · **SAML** (→ 7A.3) · any clinical, diagnostic, sign-out, or
AI-approval authority (Principles 2/3) · any authorization-policy redesign (the single `PermissionsGuard` boundary and
the existing catalogue are unchanged) · any change to `labId` tenancy · any modification of Programs 1–6.

## 15. Governance conformance
**Principles 1–12** — 1: 7A.2 establishes the principal, never authorizes. 2/3: no clinical/AI authority created or
changed. 4: routing never makes Organization a tenancy key; `labId` unchanged. 5: auth events append-only on the
existing ledger. 6: no permission grants in 7A.2. 7: OIDC/OAuth is the first concrete protocol behind the federation-
ready seam. 8: additive; local auth authoritative; flag-gated rollback. 9: identity owned centrally; consumers
unchanged. 10: only who/how/subject asserted — external claims are not domain truth. 11: human vs service principal
classes preserved (client-credentials → service principal only). 12: discovery/JWKS/validation/session are deterministic.
**GG1–GG7** — GG1 deterministic validation; GG2 provenance (method + provider recorded); GG3 append-only auth evidence;
GG4 single enforcement boundary + one session system; GG5 FeatureKey-gated rollback; GG6 no self-elevation; **GG7** the
stable `User.id` is the durable key, `sub`/email are mutable.
**ET1–ET8** — writes nothing to the clinical path (ET1) or AI evidence (ET2); no tenancy change / Org never isolation
key (ET3); events on the existing immutable ledger only (ET4); grants no authority-by-identity (ET5); service
principals hold no clinical/AI authority (ET6); captures no domain truth/PHI (ET7); amends nothing in Programs 1–6
(ET8). The 7A.2 folded acceptance gate will assert the applicable ET1–ET8 alongside focused tests, the full cumulative
non-regression suite, strict tsc, additive-only migration, and persisted-state assertions.

## 16. Deferred to implementation design / later phases
Concrete `IdentityProvider` protocol-config fields, callback/route surface, the adapter + discovery/JWKS clients, the
dependency selection, and the service-principal client-credentials runtime are **implementation-design** artifacts
produced only **after** this architecture design is approved and implementation is authorized. Durable external-subject
linkage / JIT / SCIM provisioning is **7B (D5)**; SAML is **7A.3**; permission freshness (D1) and role scoping (D2) are
**7C**; the Organization model (D4) is **7D**.

## 17. What this design does NOT authorize
No schema, migration, API, guard change, dependency addition, or implementation. Phase 7A.2 implementation begins
**only** after this design of record is reviewed and approved and implementation is separately authorized.
