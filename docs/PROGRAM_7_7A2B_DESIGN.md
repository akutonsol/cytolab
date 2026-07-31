# Program 7 · Phase 7A.2b — Service-Principal OAuth — DESIGN OF RECORD (ratified)

**Status:** Ratified design of record (governance-approved D1–D6). Implementation authorized strictly against this
document. Additive to the frozen 7A.1 / 7A.2a baselines; references — and modifies nothing in — the frozen Programs
1–6, 7A.1, or 7A.2a. Machine (non-human) authentication only. Charter: [`PROGRAM_7_CHARTER.md`](./PROGRAM_7_CHARTER.md)
· Guardrails: [`PROGRAM_7_GUARDRAILS.md`](./PROGRAM_7_GUARDRAILS.md) · 7A.2 design: [`PROGRAM_7_7A2_DESIGN.md`](./PROGRAM_7_7A2_DESIGN.md).

---

## 1. Scope
OAuth 2.0 **Client Credentials** authentication of the existing 7A.1 `ServicePrincipal` (non-human) class, plus its
credential lifecycle. **In:** credential issuance · Argon2id hash-only storage · verification · rotation · revocation/
deactivation · the client-credentials token endpoint · a service-token signing/verification seam · a dedicated
service-token strategy + guard · `Permission`-catalog scope assignment · integration with the existing
`PermissionsGuard` · machine-specific audit events · admin credential/scope routes. **Out:** human auth · OIDC · SAML ·
SCIM · auto-provisioning · API keys · personal tokens · JWT-bearer · Device Code · Token Exchange · Authorization Code ·
Implicit · any tenancy change · any authorization-policy redesign · any clinical/AI authority.

## 2. Ratified decisions (D1–D6)
- **D1** — credential is a **child** `ServicePrincipalCredential`; the frozen `ServicePrincipal` shape is unchanged.
- **D2** — machine tokens are issued/verified only through a **service-token signing seam**; today it reuses the
  existing keyset (with `kid`/alg policy), structured so a future **service keyset** swaps in without consumer changes.
- **D3** — **distinct** machine events (a Program-7-authorized additive Program 2 registry extension), **not** the human
  `LOGIN_*` events: `SERVICE_AUTH_INITIATED` (**mandatory** once a syntactically valid client-credentials attempt
  reaches the authentication service), `SERVICE_AUTH_SUCCEEDED`, `SERVICE_AUTH_FAILED`, `SERVICE_CREDENTIAL_ROTATED`,
  `SERVICE_CREDENTIAL_REVOKED`. Requests rejected before authentication processing (malformed/throttled) stay in
  platform security telemetry.
- **D4** — short-lived access tokens only; **no** refresh, introspection, denylist, or machine session; the short `exp`
  is the accepted bound for tokens issued before deactivation.
- **D5** — scopes are the **existing `Permission` catalog** (a `ServicePrincipalScope` join → `Permission`); one
  authorization vocabulary; enforcement is the **single existing `PermissionsGuard`**. `isSuperRole` never applies.
- **D6** — **Machine Identity Immutability:** stable `principalUuid`; `key`/`client_id` never renamed/reassigned/
  recycled; **no hard-delete** (deactivation only); audit remains attributable forever (stable-id references + RESTRICT
  FKs).

## 3. Entities (additive)
- `ServicePrincipalCredential` (child of `ServicePrincipal`, FK RESTRICT): `credentialUuid` (stable), `secretHash`
  (Argon2id), `status` (`ServiceCredentialStatus{ACTIVE,REVOKED}`), `rotatedAt?`, `expiresAt?`, timestamps. Lab-scoped.
- `ServicePrincipalScope` (join): `servicePrincipalId` → `ServicePrincipal` (RESTRICT) + `permissionId` → `Permission`
  (RESTRICT); `@@unique([labId, servicePrincipalId, permissionId])`. Lab-scoped.
- Enum `ServiceCredentialStatus { ACTIVE, REVOKED }`. `ServicePrincipal` itself is **unchanged** (D1/D6).

## 4. Token contract (D2/D4)
A machine access token (`aud=service`, `scope=service`, `type=access`): `sub`=service-principal id · `labId` ·
restricted `permissions[]` (from the D5 catalog) · `isSuperRole=false` · short `exp` · **no `sid`**. No refresh token,
cookie, human session, or `SessionService` record.

## 5. Authentication + authorization flow
`POST enterprise-auth/oauth/token` (`@Public`, throttled, **only** `grant_type=client_credentials`) → resolve principal
by `client_id`=`ServicePrincipal.key` (lab-scoped) → **`SERVICE_AUTH_INITIATED`** → verify secret vs. Argon2id hash
(constant-time; **indistinguishable** failure for unknown client vs. bad secret) → on success mint the service token +
**`SERVICE_AUTH_SUCCEEDED`**, on failure **`SERVICE_AUTH_FAILED`** (coded reason, generic external error). A dedicated
`ServiceAuthGuard`/strategy validates the service token and binds a `SERVICE` canonical principal + its scopes into
`req.user`; the human `JwtStrategy` (requires `aud=staff`) rejects it, and the service strategy rejects human tokens
(ET6). Authorization then terminates at the **existing single `PermissionsGuard`** (D5/GG4). No `SessionService` for
machines. `IdentityProvider`/OIDC untouched.

## 6. Security
Argon2id hash-only (reuse `ARGON2_OPTS`); plaintext secret shown **once**, never persisted/logged/audited/in-errors;
anti-enumeration generic failure; rotation issues a new hash + `SERVICE_CREDENTIAL_ROTATED`; revocation/deactivation
fails new issuance closed + `SERVICE_CREDENTIAL_REVOKED`; short `exp`; `aud`/`scope` binding; fixed alg allowlist (no
`none`).

## 7. Boundaries (ET1–ET8) — all preserved
No clinical/AI writes (ET1/ET2) · `labId` sole isolation anchor (ET3) · machine events append-only on the existing
`AuditEvent` ledger, no parallel chain (ET4) · no authority-by-identity / no default grant (ET5) · human/non-human
separation, service principals hold no clinical/AI authority (ET6) · no domain-truth/PHI (ET7) · Programs 1–6 + 7A.1 +
7A.2a immutable (ET8).

## 8. Candidate components
Entities (§3) · enum `ServiceCredentialStatus` · migration · 5 additive audit codes · `ServiceTokenSigner` (seam) ·
`ServicePrincipalCredentialService` (issue/rotate/revoke/verify) · `ServicePrincipalScopeService` (assign/list) ·
`ClientCredentialsService` (grant→token) · `ServiceJwtStrategy` + `ServiceAuthGuard` + `@Service()` decorator ·
`ServiceOAuthController` (token endpoint) + admin routes on the enterprise-auth controller (`identity:manage`) · DTOs.

## 9. Acceptance strategy (proposed gate — draft; not authorized to run)
`p7-service-principal-oauth-acceptance`: exact-head + candidate-chain ancestry; post-candidate delta acceptance-infra
only; unchanged `p6-*`/`p7-7a1-accepted`/`p7-7a2a-accepted` anchors; persisted assertions (schema + RESTRICT FKs +
Argon2id hash-only + no-plaintext-persistence + machine-identity immutability + no session/refresh row + cross-lab
fail-closed + single PermissionsGuard); focused suites binding entropy/hash/verify/rotate/revoke, anti-enumeration,
token claims, strategy crossover, Permission-catalog enforcement, and the 5 audit outcomes (no secrets); ET1–ET8; full
no-exclusions non-regression; strict tsc. Freeze tag (later) `p7-7a2b-accepted`.

## 10. What this authorizes
Implementation only. No acceptance run or freeze tag at this stage.
