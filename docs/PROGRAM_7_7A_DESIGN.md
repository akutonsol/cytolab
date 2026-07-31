# Program 7 · Phase 7A — Enterprise Authentication — DESIGN OF RECORD (architecture-level)

**Status:** Phase 7A design of record — **architecture-level, for review.** Authorized by the approved Program 7
Guardrails. **No implementation artifacts** are introduced here — no schema/models, migrations, endpoints, guards, or
code. This design defines the enterprise-authentication architecture, flows, trust boundaries, principal model,
federation and IdP-integration model, session model, and migration strategy, and shows how Phase 7A satisfies
Principles 1–12, GG1–GG7, and ET1–ET8. Concrete schema/API/implementation design follows **only** after this design is
approved and implementation is separately authorized.

Charter: [`PROGRAM_7_CHARTER.md`](./PROGRAM_7_CHARTER.md) · Guardrails: [`PROGRAM_7_GUARDRAILS.md`](./PROGRAM_7_GUARDRAILS.md)
· Architecture: [`PROGRAM_7_ARCHITECTURE_REVIEW.md`](./PROGRAM_7_ARCHITECTURE_REVIEW.md).

---

## 1. Scope & constraint
Phase 7A covers **authentication only** — establishing *who* a principal is and issuing a session — for both human and
non-human principals, including enterprise federation. It is **additive**: it extends the incumbent auth stack (staff +
portal JWT, `SessionService`, `security/*`) and never replaces it. Authorization, provisioning, organizations, and
administration are **out of scope** for 7A (owned by 7B–7H). This document commits **architecture**, not tables or
routes.

## 2. Enterprise-authentication architecture
One canonical outcome, many front-ends:

```
 ┌─ local password (incumbent) ─┐
 ┌─ SAML 2.0 (SP/IdP-initiated) ┤
 ┌─ OIDC / OAuth 2.1 (code+PKCE)┤──▶  [Credential Verification]  ──▶  [Principal Establishment]  ──▶  [Session]  ──▶  guard/app
 └─ service / machine principal ┘         (per front-end)            (→ ONE canonical principal)    (existing
                                                                                                     SessionService)
```

- Every authentication mechanism resolves to **one canonical authenticated principal** and the **same session
  contract** the platform already issues (`SessionService`: rotating refresh, device-bound session, idle/max-lifetime,
  HttpOnly cookies for staff). Downstream — guards, `@CurrentUser()`, realtime — is **unchanged** (Principle 1: 7A
  establishes the principal; it does not authorize).
- Federation is a **front-end**, not a replacement. Local password auth remains authoritative until a governed,
  per-organization migration retires it (Principle 8, GG5).

## 3. Authentication flows & trust boundaries
**Flows (architecture-level):**
- **Local password** — incumbent, unchanged (Argon2id, MFA, lockout, device trust).
- **SAML 2.0** — SP-initiated and IdP-initiated; assertion signature + audience/condition validation → normalized
  claims → principal establishment.
- **OIDC / OAuth 2.1** — authorization-code + PKCE; ID-token signature/issuer/audience/nonce validation → normalized
  claims → principal establishment.
- **Service / machine principal** — a **distinct non-human flow** (Principle 11): a machine credential is presented and
  validated to a **service principal**, never a human user; no interactive session, no clinical/AI authority.

**Trust boundaries (each an explicit validation seam):**
1. **External IdP boundary** — everything from an IdP is untrusted until validated (signatures, issuer/audience,
   freshness/replay).
2. **Assertion/token-validation boundary** — normalizes provider claims into an internal claim set; the point where
   external trust is converted to internal trust.
3. **Principal-establishment boundary** — maps validated claims to the **canonical principal** (via its stable internal
   identifier, GG7); the one place external identity becomes an internal principal.
4. **Session boundary** — the existing `SessionService` issues the same session artifacts regardless of front-end.
5. **Enforcement boundary** — the existing single `PermissionsGuard` (untouched by 7A).

## 4. Principal model (human + non-human)
- **Canonical principal** — carries a **stable internal identifier** (GG7) that never changes even as email/username/
  display-name/IdP-subject change; all downstream references (permissions, session, audit attribution, federation
  linkage) bind to it, not to mutable attributes.
- **Human principal** — corresponds to the existing per-lab user identity (preserving `@@unique([labId,email])` and
  per-lab identity); federation links an external subject to this canonical human principal.
- **Non-human / service principal** — a **structurally distinct class** (Principle 11): distinct governance, no
  interactive session, and **never** clinical, diagnostic, sign-out, or AI-approval authority.
- **External-identity linkage (concept, not schema)** — a `(provider, external-subject) → canonical human principal`
  association, established/consumed at authentication. Linkage is an authentication concern; it never makes IAM the
  system of record for domain facts (Principle 10). *Detailed linkage / SCIM JIT provisioning is D5 → Phase 7B.*

## 5. Federation architecture
- **IdP-agnostic federation layer** — SAML/OIDC/OAuth are **pluggable providers** behind one internal
  claims-normalization + principal-establishment path (Principle 7, federation-ready). Adding a protocol adds a
  provider adapter; it does not fork the principal or session model.
- **Per-organization / per-lab IdP configuration (concept)** — an organization or lab may register an IdP (issuer/
  entityID, signing material, attribute mapping) as **IAM-owned configuration**. This configuration is administrative;
  it is **never** a tenancy key (ET3) — routing to an IdP must not let Organization redefine `labId` isolation.
- **Login routing** — a login request is routed to the correct IdP by an explicit selector (e.g. organization/lab or
  the existing `LabDomain` host mapping), keeping `labId` sourced canonically and isolation unchanged.

## 6. Session model
- **Reuse, don't rebuild** — federated and service authentications produce the **same** session/token artifacts via the
  existing `SessionService`; there is **no parallel session system** (GG4/ET4 spirit). Session establishment is
  **provider-independent** and happens strictly **after** principal establishment.
- **Determinism (Principle 12)** — given the same validated claims and the same principal, session establishment is
  deterministic; token/assertion validation has no hidden/ambient inputs beyond the declared trust material and time
  window.

## 7. Identity-provider integration model
- **7A owns authentication + principal establishment only.** IdP registration/config (metadata, keys, attribute
  mapping) is modeled as IAM-owned configuration; the 7A seam ends at "validated claims → canonical principal →
  session."
- **Provisioning is 7B.** Just-in-time provisioning, SCIM synchronization, and durable external-subject linkage are
  **deferred to Phase 7B** (D5) — 7A may *establish* a session for an already-known principal but does not own the
  lifecycle of creating/deprovisioning identities.
- **Governance evidence** — authentication events (login success/failure, method, MFA, federation) are emitted through
  the existing `AuditRecorder` + hash-chained ledger, append-only, id/name-free (GG3/ET4), following the existing
  `recordSession*`/auth-event pattern.

## 8. Migration strategy (from the current authentication system)
Evolutionary and additive (Principle 8, GG5):
1. Federation and service-principal auth are added **in front of** local auth; all resolve to one canonical principal +
   the existing session contract.
2. Local password auth remains **authoritative**; nothing about the incumbent staff/portal flow changes in 7A.
3. Each capability ships behind **per-lab/per-org FeatureKey gating** (opt-in; base experience unchanged).
4. The **reserved `SERVICE` principal seam** (already present in the audit/execution-context model) is realized for the
   non-human class rather than inventing a parallel mechanism.
5. Retiring local auth for an organization happens **only** through a later, separately governed migration — never as a
   side effect of 7A.

## 9. Governance conformance
**Principles 1–12** — 1: 7A establishes the principal, never authorizes (guard untouched). 2 & 3: authentication grants
access only; it creates/alters/infers **no** clinical or AI authority. 4: no tenancy change; `labId` stays the anchor;
IdP config/routing never an isolation key. 5: auth/governance events append-only on the existing ledger. 6: no permission
grants in 7A (least privilege preserved). 7: SAML/OIDC/OAuth as pluggable seams; depth here, protocol implementation
later. 8: extends the incumbent; local auth authoritative. 9: identity owned centrally; other modules keep consuming the
principal. 10: IAM asserts who/how/permissions only; linkage is not domain truth. 11: human vs non-human principal
classes are distinct in the flow model. 12: validation + principal + session establishment are deterministic.

**GG1–GG7** — GG1 deterministic evaluation (validation is a pure function of declared trust material + time). GG2
provenance (authentication method + provider are recorded for every principal establishment). GG3 append-only auth
evidence. GG4 single enforcement boundary (guard untouched) + additive front-ends. GG5 FeatureKey-gated opt-in rollout.
GG6 service principals cannot self-elevate to clinical/AI authority. **GG7 central to 7A** — the canonical principal's
stable internal identifier is the durable key; email/username/IdP-subject are mutable and never the key.

**ET1–ET8** — 7A writes nothing to the clinical path (ET1) or AI evidence (ET2); makes no tenancy change (ET3); emits
identity events only on the existing immutable ledger (ET4); grants no authority-by-identity (ET5); keeps non-human
principals free of clinical/AI authority (ET6); captures no domain truth (ET7); amends nothing in Programs 1–6 (ET8).
The Phase 7A folded acceptance gate will assert the applicable ET1–ET8 alongside focused tests, a Programs 1–6
non-regression suite, strict `tsc`, additive-only migration, and persisted-state assertions.

## 10. Deferred to implementation design / later phases
Concrete schema (principal/identifier/linkage/IdP-config models), API/route surface, guard/strategy wiring, and the
service-principal credential runtime are **implementation-design** artifacts produced only **after** this architecture
design is approved and implementation is authorized. External-subject durable linkage + SCIM JIT provisioning are **D5 →
Phase 7B**. Live-vs-baked permission freshness (D1) and role scoping (D2) are **Phase 7C**; organization model (D4) is
**Phase 7D**.

## 11. What this design does NOT authorize
No schema, migration, API, guard change, or implementation. Phase 7A implementation begins **only** after this design of
record is reviewed and approved and implementation is separately authorized.
