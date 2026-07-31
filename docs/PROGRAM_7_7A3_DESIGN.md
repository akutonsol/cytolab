# Program 7 · Phase 7A.3 — SAML Federation — DESIGN OF RECORD (proposed)

**Status:** Architecture-level design of record, **AWAITING governance review**. No implementation is authorized by this
document. Additive to the frozen 7A.1 / 7A.2a / 7A.2b baselines; references — and modifies nothing in — the frozen
Programs 1–6, 7A.1, 7A.2a, or 7A.2b. **Interactive human** federation only. Charter:
[`PROGRAM_7_CHARTER.md`](./PROGRAM_7_CHARTER.md) · Guardrails: [`PROGRAM_7_GUARDRAILS.md`](./PROGRAM_7_GUARDRAILS.md) ·
7A design: [`PROGRAM_7_7A_DESIGN.md`](./PROGRAM_7_7A_DESIGN.md) · 7A.2 design: [`PROGRAM_7_7A2_DESIGN.md`](./PROGRAM_7_7A2_DESIGN.md).

This is a **governance and architecture exercise only** (read-only preflight + DoR). It defines *what* SAML federation
would be and the decisions requiring ratification; it authorizes **no** schema, migration, DTO, controller, service,
adapter, dependency, endpoint, test, CI, workflow, acceptance infrastructure, gate, closeout, tag, or freeze.

---

## 1. Read-only preflight — current state (verified at `feat/program-7-iam` tip `ffb626b`)

SAML is the **third** authentication front-end behind the **already-accepted 7A.1 provider-isolation seam**. The
preflight confirms the seam and its consumers are exactly the reusable substrate 7A.2a used for OIDC — SAML plugs in
identically, adding only SAML-protocol knowledge inside a new adapter.

- **Provider-isolation seam** — `authentication-adapter.ts`: `AuthenticationAdapter { providerKey; protocol;
  authenticate(input): Promise<AuthenticationResult|null> }`; its *only* output is a `CanonicalPrincipal`.
  `AuthenticationProtocol = 'LOCAL' | IdentityProviderProtocol`, and `IdentityProviderProtocol` **already includes
  `SAML`** (schema line 6190; reserved in 7A.1). No enum change is needed to name a SAML provider.
- **Canonical principal** — `canonical-principal.ts`: `{ kind: 'HUMAN'|'SERVICE'; principalId; labId }`. SAML yields a
  **HUMAN** principal; `principalId` is the stable `User.id` (GG7). `mayHoldClinicalAuthority` is HUMAN-only (Principle
  11 / ET6) — unchanged.
- **Principal-establishment boundary** — `authentication.service.ts`: routes `(providerKey, input)` to the registered
  adapter and returns the canonical principal. Deterministic (Principle 12). A SAML adapter registers under
  `providerKey='saml'` with zero change to this router.
- **Federated linkage** — `federated-identity.service.ts` + model `FederatedIdentity`
  (`@@unique([labId, identityProviderId, externalSubject])`, FKs `onDelete: Restrict`): `resolve(providerId,
  externalSubject) → humanPrincipal(User.id, labId) | null`. The comment already anticipates *“the provider’s
  subject/nameID”*. SAML’s `NameID` **is** `externalSubject`; the durable key is `User.id`, never the NameID (GG7).
  Unlinked → `null` → fail closed. **No JIT/provisioning** (that is 7B / D5).
- **OIDC precedent (the pattern SAML mirrors)** — `oidc/`:
  - `OidcAuthenticationAdapter` (behind the seam; output = canonical principal; unlinked → null).
  - `OidcTransactionService` + model `OidcAuthTransaction`: short-lived **single-use** server-side transaction that
    survives the IdP redirect, binding `state` (CSRF), `nonce` (replay), PKCE verifier, and a **`configFingerprint`
    captured at initiation**; `verifyAndConsume` enforces existence + not-expired + single-use (compare-and-set on
    `consumedAt`) + the **configuration-immutability invariant** (trusted config may not change mid-transaction), all
    fail-closed.
  - `OidcTokenValidator` + `oidc-config.ts`: the **security-obligation** shell — the *configured issuer is the trust
    anchor* (discovery may never redefine it), an **asymmetric-only algorithm allowlist** enforced *before* any key is
    fetched (`alg:none`/HMAC rejected), bounded **clock skew** (`OIDC_CLOCK_SKEW_SECONDS`), explicit future-`iat`
    rejection, replay `nonce` match, and a required **stable subject**.
  - `OidcController`: `@Public` + `@Throttle` (a login flow — no JWT yet); lab is resolved from the request **host**
    (`LabDomain`) on initiate and from the **transaction** on callback — routing **never derives or changes `labId`**
    isolation (ET3).
- **Session bridge** — `AuthService.completeFederatedLogin(userId, req, res, {method, providerId})`: reuses the
  **existing** `SessionService.createSession` + `buildAccessToken` + `setAuthCookies` path (no parallel session), and
  emits `AUTHENTICATION/LOGIN_SUCCEEDED` with `producerModule:'enterprise-auth'`, `metadata:{method, identityProviderId}`
  (no secrets/PHI). SAML calls this **unchanged**.
- **Authorization boundary** — the **single global `PermissionsGuard`** (`auth/guards/permissions.guard.ts`) is the one
  enforcement point (GG4). SAML introduces **no** authorization point; the human `JwtAuthGuard` and the session token
  contract are unchanged.
- **Provider configuration** — model `IdentityProvider` (per-lab; `@@unique([labId, key]`; **never a tenancy key** —
  Principle 4 / ET3): `providerUuid` (GG7), `protocol` (incl. `SAML`), `issuer` (*“issuer / entityID; protocol-specific
  config fields land with each adapter increment”*), OIDC-only `clientId`/`redirectUri` (nullable), `isEnabled`
  (default false — **inert until an adapter activates it**). SAML-specific config columns do **not** exist yet.
- **Audit** — `audit.registry.ts`: `AUTHENTICATION` carries `LOGIN_SUCCEEDED`, `LOGIN_FAILED`, `LOGIN_INITIATED`
  (LOGIN_INITIATED added additively in 7A.2a), plus the five 7A.2b machine codes. Human federation reuses `LOGIN_*`.
- **Dependencies present** — `jose` (JWT/JWK) and `passport`/`passport-jwt` only. **No XML, XML-DSig, or SAML library
  exists** in `apps/api`. This is the central new-capability gap for SAML (see S2).

**Preflight conclusion:** the seam, canonical principal, linkage, transaction pattern, security-obligation shell,
lab-routing rule, session bridge, and single authorization boundary are all present and were proven by 7A.2a. SAML is a
**net-additive third adapter** with **one materially new element** relative to OIDC: **XML digital-signature validation
of the SAML assertion**, whose failure modes (signature wrapping, XXE) are the dominant risk and the reason S2 (below)
is the pivotal governance decision.

## 2. Architecture analysis — proposed SAML federation

### 2.1 Shape
A `SamlAuthenticationAdapter` (`providerKey='saml'`, `protocol='SAML'`) behind the accepted seam. **Web Browser SSO
profile**, **SP-initiated**: HTTP-Redirect binding for the `AuthnRequest` (SP→IdP), HTTP-POST binding for the SAML
`Response` at the SP **Assertion Consumer Service (ACS)** (IdP→SP). Its only output is a HUMAN `CanonicalPrincipal`
resolved from the assertion’s `NameID` via the accepted 7A.1 linkage; unlinked → `null` (fail closed). Downstream
depends only on the canonical principal — no assertion/XML/certificate detail leaks past the adapter.

### 2.2 SP-initiated transaction (mirrors `OidcAuthTransaction`)
A short-lived, single-use `SamlAuthRequest` row created at **initiate**, surviving the IdP round-trip, binding:
`requestId` (the `AuthnRequest` ID → matched to the assertion’s **`InResponseTo`**, the SAML CSRF/replay binding, the
`state`/`nonce` analogue), `relayState`, the resolved provider, and a **`configFingerprint`** captured at initiation
(trusted-config-immutability invariant, re-checked at ACS — identical discipline to OIDC). `verifyAndConsume` enforces
existence + not-expired + single-use (compare-and-set on `consumedAt`) + fingerprint match, fail-closed. Lab-scoped.

### 2.3 SAML-specific trust model (the security obligations)
The `SamlAssertionValidator` shell (the `OidcTokenValidator` analogue) must enforce, deterministically and fail-closed:

- **XML signature validation** against the provider’s **configured X.509 signing certificate(s)** — the *configured
  cert is the trust anchor*; nothing in the message (or fetched metadata) may redefine it (mirrors OIDC issuer-as-anchor).
- **Signature-Wrapping (XSW) defense** — validate that the signature covers the **exact element that is consumed**
  (assertion), reject multiple/relocated/detached signatures, and read claims only from the signed, verified subtree.
  This is the single most common SAML break and is why hand-rolling is discouraged (S2).
- **XXE / entity-expansion hardening** — parse with DTD processing **disabled**, no external entity resolution, no
  network fetch during parse, bounded document size.
- **Algorithm allowlist** — approved signature + digest algorithms only (e.g. RSA-SHA256 / ECDSA-SHA256; **SHA-1 and
  “none” rejected**) and an **exclusive-C14N** canonicalization allowlist — enforced before trust is extended (the
  asymmetric-only-allowlist analogue).
- **Assertion conditions** — `NotBefore`/`NotOnOrAfter` within **bounded clock skew** (a `SAML_CLOCK_SKEW_SECONDS`
  mirroring `OIDC_CLOCK_SKEW_SECONDS`); `AudienceRestriction` **equals the SP entityID**; subject-confirmation
  `Recipient` **equals the ACS URL**; `InResponseTo` **equals the pending `SamlAuthRequest.requestId`**.
- **Assertion replay prevention** — the assertion `ID` is **single-use** within its validity window (a consumed-assertion
  store; the single-use CAS analogue), rejecting a replayed but otherwise-valid assertion.
- **NameID → stable subject** — the validated, signed `NameID` (persistent/emailAddress in the baseline) is the
  `externalSubject` handed to `FederatedIdentityService.resolve`; the durable key remains `User.id` (GG7). NameID is a
  mutable external attribute, never the key.

### 2.4 Lab routing, session, boundary (unchanged rules)
Lab is resolved from the request **host** (`LabDomain`) on initiate and from the **transaction** (`RelayState`/
`InResponseTo` → `SamlAuthRequest`) at ACS — routing selects a provider and **never derives or changes `labId`** (ET3).
On success the adapter’s canonical principal (HUMAN) is handed to the **existing** `AuthService.completeFederatedLogin`
— the existing session path, no parallel session. Authorization terminates at the **single existing `PermissionsGuard`**.
No new token contract, cookie, or guard for humans.

### 2.5 Certificate lifecycle
IdP signing certificates are **configured** (not trusted from message metadata). To allow rollover without an outage,
a small set of **concurrently-valid** configured certs is accepted; an expired/for-validation-only cert fails closed.
The exact rollover model (N certs, overlap window, admin surface) is S4.

### 2.6 Fail-closed & audit
Every security-significant failure (unknown/invalid message, signature failure, XSW/XXE rejection, condition/audience/
recipient/`InResponseTo` mismatch, replayed assertion, expired/invalid cert, provider-disabled, unlinked identity)
fails closed with a **coded** `AUTHENTICATION/LOGIN_FAILED` reason (never a certificate, raw assertion, XML, NameID,
email, or PHI). Success emits `LOGIN_SUCCEEDED (method='saml')` via the existing bridge. Initiation reuses the existing
additive `LOGIN_INITIATED` after a `SamlAuthRequest` is created (S6).

## 3. Governance decisions requiring ratification (S1–S7)

- **S1 — SAML as a third front-end behind the accepted seam.** `SamlAuthenticationAdapter` outputs only a HUMAN
  `CanonicalPrincipal`; **no** new authorization point (terminates at `PermissionsGuard`); the human session path and
  token contract are unchanged. *Recommendation: approve.*
- **S2 — Signature-validation seam: ADOPT a vetted library, do not hand-roll XML-DSig.** Isolate all XML/signature/XSW/
  XXE handling behind a `SamlAssertionValidator` seam (the `OidcTokenValidator`/D2 analogue), backed by an actively
  maintained, security-reviewed SAML/XML-DSig library rather than bespoke XML crypto. This **requires adding a
  dependency** (an implementation-stage action, not authorized here) and pins a build-vs-adopt choice now. *Recommendation:
  ADOPT (hand-rolling XML-DSig is the dominant SAML CVE source; the seam keeps the choice swappable and provider-isolated).*
- **S3 — SP-initiated only in the 7A.3 baseline; IdP-initiated (unsolicited) DISABLED/fail-closed.** IdP-initiated SSO
  has no `AuthnRequest` and therefore **no `InResponseTo`** binding (weaker CSRF/replay posture); if ever supported it
  is a **per-provider explicit opt-in** in a later increment, compensated by Recipient/Audience/NotOnOrAfter + the
  assertion-replay store. *Recommendation: SP-initiated only for 7A.3.*
- **S4 — Trust anchor = configured X.509 signing cert(s); rollover via a small set of concurrently-valid configured
  certs.** Message/metadata may never redefine the cert or the entityID (issuer-as-anchor analogue). *Recommendation:
  configured certs with an N-cert overlap window; expired ⇒ fail closed.*
- **S5 — Additive entities, frozen `IdentityProvider` shape preserved.** A `SamlAuthRequest` transaction (SP-initiated
  request/`InResponseTo`/`RelayState`/`configFingerprint`, single-use, TTL, lab-scoped, provider FK RESTRICT) + a
  consumed-assertion replay store; SAML provider config carried as **additive nullable columns** on `IdentityProvider`
  (SP entityID, ACS URL, IdP SSO URL, IdP signing cert(s), NameID format, wantAssertionsSigned…) — the frozen scalar
  shape gains only nullable, protocol-specific fields, exactly as OIDC added `clientId`/`redirectUri`. *Recommendation:
  approve the entity approach; the concrete columns are fixed at implementation-design under this ruling.*
- **S6 — Audit: REUSE the human `LOGIN_*` codes (SAML is human interactive federation), no new registry codes.**
  `LOGIN_SUCCEEDED`/`LOGIN_FAILED` (+ existing additive `LOGIN_INITIATED`) with `method='saml'` and coded reasons —
  the same treatment 7A.2a used for OIDC, and the deliberate opposite of 7A.2b’s distinct **machine** codes.
  *Recommendation: reuse (no Program 2 registry change).*
- **S7 — Signed assertions in the baseline; encrypted assertions (EncryptedAssertion) decision.** Baseline validates
  **signed** assertions. Encrypted assertions add SP-private-key decryption and key management. *Recommendation: state
  explicitly whether EncryptedAssertion is in the 7A.3 baseline or deferred; default proposal = **deferred** to keep
  7A.3 focused on the signature/XSW/replay core (open for the reviewer).*

## 4. Deferred decisions (out of 7A.3 regardless of S1–S7)
- **Just-in-time provisioning / auto-linking** of an unlinked NameID → 7B / D5 (baseline: unlinked ⇒ fail closed, as
  OIDC).
- **SCIM** provisioning/deprovisioning → 7B.
- **Single Logout (SLO)** — significant added protocol surface; baseline does **login only** (logout uses the existing
  session-logout path). *Proposed deferred.*
- **SP metadata publishing endpoint** (auto-configuration for IdP admins) — convenience, not a security primitive;
  proposed deferred (or a thin later increment).
- **HTTP-Artifact binding**, additional NameID formats (transient/custom), and multi-IdP discovery UX — out of scope.
- **EncryptedAssertion** if S7 defers it.

## 5. Boundaries (ET1–ET8) — all preserved (to be asserted by the eventual gate)
No clinical/AI writes (ET1/ET2) · `labId` the sole isolation anchor, SAML routing never a tenancy key (ET3) · human
federation events append-only on the existing `AuditEvent` ledger, no parallel chain (ET4) · no authority-by-identity /
no default grant; authorization still terminates at `PermissionsGuard` (ET5) · human/non-human separation preserved —
SAML yields a HUMAN principal only (ET6) · no domain-truth/PHI captured; NameID is a linkage key, not domain truth
(ET7) · Programs 1–6 + 7A.1 + 7A.2a + 7A.2b immutable (ET8). Conforms to Principles 1–12 and GG1–GG7 (GG4 single
enforcement boundary; GG7 stable identifiers).

## 6. Candidate components (named for review only — NOT authorized to build)
`SamlAuthenticationAdapter` · `SamlAssertionValidator` (S2 seam) · `SamlRequestBuilder` (AuthnRequest, HTTP-Redirect) ·
`SamlAuthRequestService` + entity `SamlAuthRequest` · consumed-assertion replay store · `saml-config.ts` (trust anchor,
alg/C14N allowlist, clock skew, fingerprint) · `SamlService` (initiate/ACS orchestration → existing session bridge) ·
`@Public` throttled `SamlController` (`initiate`, `acs`) · additive nullable `IdentityProvider` SAML columns · a vetted
XML-DSig/SAML dependency (S2) · DTOs. **No schema, migration, code, dependency, test, or CI is authorized by this
document.**

## 7. Proposed acceptance strategy (draft — NOT authorized to build or run)
A future `p7-saml-federation-acceptance` folded gate mirroring the OIDC gate: exact-head + candidate-chain ancestry;
post-candidate delta acceptance-infra only; unchanged `p6-*` / `p7-7a1-accepted` / `p7-7a2a-accepted` / `p7-7a2b-accepted`
anchors; persisted assertions (`SamlAuthRequest` single-use + `InResponseTo` + config-immutability, assertion-replay
single-use, unlinked ⇒ fail closed, existing-auth authoritative, terminates at `PermissionsGuard`); focused suites
binding a **negative security matrix** (XSW, XXE, `alg=none`/SHA-1, expired/wrong cert, audience/recipient/`InResponseTo`
mismatch, replayed assertion, NotBefore/NotOnOrAfter skew) plus the coded audit outcomes (no secrets); ET1–ET8; full
no-exclusions non-regression; strict tsc. Freeze tag (later) `p7-7a3-accepted`. **This is a sketch for the design
review only.**

## 8. What this document authorizes
**Nothing beyond its own authoring.** It is the reviewable design of record for a governance decision. Implementation,
schema, migrations, dependencies, endpoints, tests, CI, acceptance infrastructure, gates, closeouts, tags, and freeze
remain **unauthorized** until this DoR is reviewed and separately approved, and implementation is separately authorized.
No frozen baseline (`p6-complete` → `40d810e`, `p7-7a1-accepted` → `84b9f74`, `p7-7a2a-accepted` → `e7bd388`,
`p7-7a2b-accepted` → `e58ffb5`) is modified.
