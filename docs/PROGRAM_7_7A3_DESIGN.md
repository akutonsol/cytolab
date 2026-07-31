# Program 7 · Phase 7A.3 — SAML Federation — DESIGN OF RECORD (approved with required revisions)

**Status:** Architecture-level design of record — **APPROVED WITH REQUIRED REVISIONS** (governance rulings S1–S8, the
RelayState-integrity ruling, and the NameID-linkage constraints, all incorporated below). Implementation is **not yet
authorized** — a separate implementation authorization is required after this revised DoR is confirmed. Additive to the
frozen 7A.1 / 7A.2a / 7A.2b baselines; references — and modifies nothing in — the frozen Programs 1–6, 7A.1, 7A.2a, or
7A.2b. **Interactive human** federation only. Charter: [`PROGRAM_7_CHARTER.md`](./PROGRAM_7_CHARTER.md) · Guardrails:
[`PROGRAM_7_GUARDRAILS.md`](./PROGRAM_7_GUARDRAILS.md) · 7A design: [`PROGRAM_7_7A_DESIGN.md`](./PROGRAM_7_7A_DESIGN.md) ·
7A.2 design: [`PROGRAM_7_7A2_DESIGN.md`](./PROGRAM_7_7A2_DESIGN.md).

This remains a **governance and architecture document**. It defines *what* SAML federation is and the ratified
decisions that bind implementation; it authorizes **no** schema, migration, DTO, controller, service, adapter,
dependency, endpoint, test, CI, workflow, acceptance infrastructure, gate, closeout, tag, or freeze. Implementation,
when separately authorized, must conform to S1–S8 and the constraints in §3a–§3c exactly.

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
`state`/`nonce` analogue), the Osieri-controlled `relayState` correlation token (§3a), the expected ACS/destination, the
resolved provider + lab, and a **`configFingerprint`** captured at initiation (trusted-config-immutability invariant,
re-checked at ACS — identical discipline to OIDC). `verifyAndConsume` enforces existence + not-expired + single-use +
fingerprint match, fail-closed. **Single-use is a compare-and-set on `consumedAt`** (the OIDC `updateMany where
consumedAt: null` pattern): two concurrent attempts to consume the same still-valid response resolve to **exactly one
success and one fail-closed** result. **Assertion/response `ID` replay is prevented separately** by a consumed-assertion
store (a distinct single-use CAS keyed on the assertion `ID` within its validity window) so a replayed assertion that
rides a *fresh* transaction is still rejected. Lab-scoped; provider FK `onDelete: Restrict`; stable `samlAuthRequestUuid`
(GG7); no PHI/secret columns.

### 2.3 SAML-specific trust model (the security obligations)
The `SamlAssertionValidator` shell (the `OidcTokenValidator` analogue) must enforce, deterministically and fail-closed:

- **XML signature validation** against the provider’s **configured X.509 signing certificate(s)** — the *configured
  cert is the trust anchor*; nothing in the message (or fetched metadata) may redefine it (mirrors OIDC issuer-as-anchor).
- **Signature-Wrapping (XSW) defense — validate and consume the SAME signed node.** Identity attributes must be read
  **only** from the exact element whose signature was verified; the validator must reject relocated/detached/multiple
  signatures and any document with **duplicate security-critical elements** or more than **one unambiguous
  assertion/subject**. Validating one XML element and consuming identity from another is the core failure this rule
  forbids (S2/S8). This is the single most common SAML break and the reason hand-rolling is prohibited (S2).
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

## 3. Ratified governance rulings (S1–S8) — APPROVED with required revisions
These are binding on implementation.

- **S1 — SAML as a third front-end behind the accepted seam. APPROVED.** The flow terminates strictly as: SAML Response
  → `SamlAssertionValidator` → `FederatedIdentityService` → canonical **HUMAN** principal → the existing federated
  session bridge. **No downstream domain module may depend on SAML attributes or provider details**; **no** new
  authorization point (terminates at the single `PermissionsGuard`); the human session path and token contract are
  unchanged.
- **S2 — Vetted SAML/XML-signature library, MANDATORY; no hand-rolling. APPROVED AND MANDATORY.** The implementation
  must **not** hand-roll XML parsing, canonicalization, XML Digital Signature validation, X.509 certificate handling,
  signature-reference resolution, or XSW defenses. A maintained SAML/XML-DSig library is selected **only after
  confirming it supports the exact fail-closed validation contract of this DoR (S8)**; all library-specific types and
  parsing behavior stay **behind the `SamlAssertionValidator` seam** and never leak into downstream services. (Adding
  the dependency is an implementation-stage action, not authorized by this document.)
- **S3 — SP-initiated only. APPROVED (frozen baseline boundary).** The 7A.3 baseline supports **only** SP-initiated
  authentication. **Unsolicited IdP-initiated responses fail closed** because they lack the accepted request and the
  `InResponseTo` correlation boundary. IdP-initiated SSO may be considered later as separately governed work.
- **S4 — Certificate trust anchor and rollover. APPROVED.** Configured provider trust includes: the expected IdP
  **entityID**; one or more **explicitly configured** signing certificates; **deterministic certificate identifiers/
  fingerprints**; and **bounded rollover** via multiple concurrently-valid certificates. **Metadata or assertions may
  never silently replace or redefine the configured trust anchor.** Certificate removal/rollover during an active
  transaction has **deterministic** behavior via the request’s bound `configFingerprint` (mirrors 7A.2a): a trust
  change mid-transaction fails closed at ACS.
- **S5 — Request transaction and replay storage. APPROVED.** Introduce an additive `SamlAuthRequest` (or equivalent
  persisted) transaction recording at minimum: a **stable request identity**; the SAML **request ID**; **lab + provider**
  identity; the **expected ACS/redirect target**; the **provider-configuration fingerprint**; **issue + expiry** times;
  **single-use consumption state**; a **safe RelayState correlation** (§3a); timestamps and an immutable identifier.
  **Consumption uses compare-and-set semantics**; two concurrent consumptions of the same valid response yield
  **exactly one success and one fail-closed**. A separate consumed-assertion store enforces assertion/response **ID
  replay** protection. Frozen `IdentityProvider` scalar shape preserved — SAML config is carried as **additive nullable
  columns** (SP entityID, ACS URL, IdP SSO URL, IdP signing cert(s)/fingerprints, NameID-format policy,
  wantAssertionsSigned…), exactly as OIDC added `clientId`/`redirectUri`.
- **S6 — Audit vocabulary: REUSE the human `LOGIN_*` codes. APPROVED.** `LOGIN_INITIATED` / `LOGIN_SUCCEEDED` /
  coded `LOGIN_FAILED`, all with `method='saml'` — SAML is human interactive authentication (the deliberate opposite of
  7A.2b’s distinct **machine** codes); **no Program 2 registry change**. Coded failure reasons include: `unknown_request`,
  `expired_request`, `replay`, `provider_disabled`, `config_fingerprint_mismatch`, `malformed_response`,
  `invalid_signature`, `certificate_mismatch`, `issuer_mismatch`, `audience_mismatch`, `destination_recipient_mismatch`,
  `in_response_to_mismatch`, `assertion_time_invalid`, `unlinked_identity`. **Audit metadata must NEVER contain** raw
  SAML XML, assertions, signatures, certificates, `NameID`, email, RelayState secrets, `SessionIndex`, or any PHI.
- **S7 — Encrypted assertions: EXCLUDED FROM THE 7A.3 BASELINE (binding).** The accepted baseline **supports signed,
  unencrypted assertions** and must **explicitly detect and reject `EncryptedAssertion`** with a **coded fail-closed
  error** + safe audit evidence — **not** ambiguous/undefined runtime behavior. Encrypted-assertion support (SP
  decryption keys, key custody, rotation, algorithm policy, `EncryptedKey` handling, deployment secret management) is
  **separately governed later work**. This is a **deliberate baseline exclusion**, not an unfinished decision.
- **S8 — Assertion semantic binding (REQUIRED). A valid XML signature alone is insufficient.** The validator fails
  closed unless **all applicable** semantic checks pass: expected IdP **issuer/entityID**; expected SP **audience**
  (`AudienceRestriction`); expected **ACS destination**; expected **`SubjectConfirmationData.Recipient`**; **exact
  `InResponseTo`** match to the persisted SP request; **response + assertion IDs replay-protected**; **`NotBefore` /
  `NotOnOrAfter`** within **centrally bounded clock skew** (a `SAML_CLOCK_SKEW_SECONDS` mirroring
  `OIDC_CLOCK_SKEW_SECONDS`); a **valid bearer `SubjectConfirmation`**; the **signed element is the exact response/
  assertion consumed** (§2.3 XSW rule); **no duplicate security-critical elements**; **one unambiguous assertion + one
  subject**; a **required stable `NameID` present**; the **allowed NameID-format policy satisfied**; an **`AuthnStatement`
  present where required**; and **provider + request remain enabled and configuration-compatible**. The implementation
  must **never validate one XML element and consume identity attributes from another**.

### 3a. RelayState integrity ruling (binding)
`RelayState` is **correlation data, not a trusted free-form redirect**. It must be: **generated or allowlisted by
Osieri**; **bound to the persisted `SamlAuthRequest`**; **single-use with that request**; **length-bounded**; **excluded
from sensitive logs**; and **resolved only to approved local destinations**. **No arbitrary external redirect may be
accepted from RelayState** — an unrecognized/unbound RelayState fails closed.

### 3b. NameID and identity-linkage constraints (binding)
Linkage key is **`(identityProviderId, NameID)`** (the accepted `FederatedIdentity` uniqueness). `NameID` is an **opaque
external subject**; **email / display name / any mutable claim is NEVER used for account matching**. **Unlinked
identities fail closed** — **no JIT user creation, no automatic linking, no SCIM behavior**. Provisioning and linking
policy remain owned by **Phase 7B / D5**. The durable internal identity stays `User.id` (GG7); `NameID` is never the key.

### 3c. Required design revisions — incorporated (record)
Per the governance review, this DoR now records, as binding: **S7** as an explicit **rejection of encrypted assertions**
in the baseline (§3 S7); **S8** assertion **semantic-binding** requirements (§3 S8); **RelayState** integrity + safe-
redirect rules (§3a); **configuration-fingerprint binding** for active SAML requests (§2.2, §3 S4/S5); **persisted
single-use + concurrent-consumption** (exactly one success / one fail-closed) (§2.2, §3 S5); the explicit **XSW
validate-and-consume-the-same-signed-node** rule (§2.3, §3 S8); **safe audit outcome** requirements (§3 S6); and
**SP-initiated-only** as a **frozen baseline boundary** (§3 S3).

## 4. Deferred decisions (out of 7A.3 regardless of S1–S8)
- **Just-in-time provisioning / auto-linking** of an unlinked NameID → 7B / D5 (baseline: unlinked ⇒ fail closed, as
  OIDC).
- **SCIM** provisioning/deprovisioning → 7B.
- **Single Logout (SLO)** — significant added protocol surface; baseline does **login only** (logout uses the existing
  session-logout path). *Proposed deferred.*
- **SP metadata publishing endpoint** (auto-configuration for IdP admins) — convenience, not a security primitive;
  proposed deferred (or a thin later increment).
- **HTTP-Artifact binding**, additional NameID formats (transient/custom), and multi-IdP discovery UX — out of scope.
- **EncryptedAssertion** — **excluded from the baseline (S7)**; the baseline explicitly **detects and rejects** it
  (coded fail-closed + safe audit). Support is separately governed later work (SP decryption keys / custody / rotation /
  algorithm policy / `EncryptedKey` handling / secret management).
- **IdP-initiated (unsolicited) SSO** — excluded from the baseline (S3); separately governed later work.

## 5. Boundaries (ET1–ET8) — all preserved (to be asserted by the eventual gate)
No clinical/AI writes (ET1/ET2) · `labId` the sole isolation anchor, SAML routing never a tenancy key (ET3) · human
federation events append-only on the existing `AuditEvent` ledger, no parallel chain (ET4) · no authority-by-identity /
no default grant; authorization still terminates at `PermissionsGuard` (ET5) · human/non-human separation preserved —
SAML yields a HUMAN principal only (ET6) · no domain-truth/PHI captured; NameID is a linkage key, not domain truth
(ET7) · Programs 1–6 + 7A.1 + 7A.2a + 7A.2b immutable (ET8). Conforms to Principles 1–12 and GG1–GG7 (GG4 single
enforcement boundary; GG7 stable identifiers).

## 6. Candidate components (named for review only — NOT authorized to build)
`SamlAuthenticationAdapter` · `SamlAssertionValidator` (S2 seam — enforces S8 semantic binding, XSW same-signed-node,
XXE hardening, alg/C14N allowlist, and **explicit `EncryptedAssertion` reject** per S7) · `SamlRequestBuilder`
(AuthnRequest, HTTP-Redirect) · `SamlAuthRequestService` + entity `SamlAuthRequest` (RelayState correlation §3a,
`configFingerprint`, single-use CAS) · consumed-assertion replay store · `saml-config.ts` (configured trust anchor +
cert fingerprints/rollover, alg/C14N allowlist, `SAML_CLOCK_SKEW_SECONDS`, fingerprint) · `SamlService` (initiate/ACS
orchestration → existing `completeFederatedLogin`) · `@Public` throttled `SamlController` (`initiate`, `acs`) · additive
nullable `IdentityProvider` SAML columns · a vetted XML-DSig/SAML dependency (S2) · DTOs. **No schema, migration, code,
dependency, test, or CI is authorized by this document.**

## 7. Proposed acceptance strategy (draft — NOT authorized to build or run)
A future `p7-saml-federation-acceptance` folded gate mirroring the OIDC gate: exact-head + candidate-chain ancestry;
post-candidate delta acceptance-infra only; unchanged `p6-*` / `p7-7a1-accepted` / `p7-7a2a-accepted` / `p7-7a2b-accepted`
anchors; persisted assertions (`SamlAuthRequest` single-use + `InResponseTo` + config-immutability, **concurrent-consume
= exactly 1 success / 1 fail-closed**, assertion-`ID` replay single-use, unlinked ⇒ fail closed, existing-auth
authoritative, terminates at `PermissionsGuard`); focused suites binding a **negative security matrix** — XSW
(validate-and-consume-same-node; duplicate/relocated signature; >1 assertion/subject), XXE/entity-expansion, `alg=none`/
SHA-1/weak-C14N, expired/wrong/removed cert, **`EncryptedAssertion` explicitly rejected (S7)**, issuer/audience/
destination/`Recipient`/`InResponseTo` mismatch, replayed assertion, `NotBefore`/`NotOnOrAfter` skew, **IdP-initiated/
unsolicited rejected (S3)**, RelayState unbound/oversized/external-redirect rejected (§3a) — plus the coded audit
outcomes (no XML/assertion/signature/cert/NameID/email/RelayState/`SessionIndex`/PHI); ET1–ET8; full no-exclusions
non-regression; strict tsc. Freeze tag (later) `p7-7a3-accepted`. **This is a sketch for the design review only.**

## 8. What this document authorizes
**Nothing beyond its own authoring.** This is the **approved-with-revisions** design of record; S1–S8, §3a, and §3b are
binding on implementation. Implementation, schema, migrations, **dependencies**, endpoints, tests, CI, acceptance
infrastructure, gates, closeouts, tags, and freeze remain **unauthorized** until a **separate implementation
authorization** is granted against this revised DoR. No frozen baseline (`p6-complete` → `40d810e`, `p7-7a1-accepted` →
`84b9f74`, `p7-7a2a-accepted` → `e7bd388`, `p7-7a2b-accepted` → `e58ffb5`) is modified.

## 9. Governance state
| Stage | Status |
|---|---|
| 7A.1 Foundation | Accepted & Frozen (`84b9f74`) |
| 7A.2a Interactive OIDC | Accepted & Frozen (`e7bd388`) |
| 7A.2b Service-Principal OAuth | Accepted & Frozen (`e58ffb5`) |
| 7A.3 read-only preflight | Complete |
| 7A.3 Design of Record | **Approved with required revisions — incorporated (S1–S8, §3a, §3b)** |
| 7A.3 implementation | **Not authorized** |
| Phase 7A overall | Not accepted (7A.3 outstanding) |
