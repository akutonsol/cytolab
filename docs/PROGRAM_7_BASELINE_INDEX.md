# Program 7 — Accepted Baseline Index

> **✅ PHASE 7A — ENTERPRISE AUTHENTICATION IS COMPLETE.** All four increments (7A.1, 7A.2a, 7A.2b, 7A.3) are Accepted &
> Frozen and together constitute one completed authentication capability. Phase-level record:
> [`PROGRAM_7_7A_MASTER_CLOSEOUT.md`](./PROGRAM_7_7A_MASTER_CLOSEOUT.md); completion tag **`p7-7a-complete`** (annotated,
> pinned to the master-closeout commit — the `p6-complete` pattern). Phase 7A completion does **not** accept any later
> Program 7 phase (7B–7H). Frozen anchors unchanged; no baseline mutated after acceptance.


Single authoritative reference for every accepted Program 7 phase/increment. **Append-only:** update a row **only**
when its increment is formally accepted and frozen. `origin/feat/program-7-iam` is the authoritative Program 7 history;
each acceptance tag is the immutable governance anchor. Program 7 (Enterprise IAM) opened after Program 6 completed
(`p6-complete` → `40d810e`) and **references — never modifies — the frozen Programs 1–6**.

Per the stage convention: **Implementation Candidate** = the exact product head the acceptance CI ran against ·
**Frozen Evidence Head** = the accepted head the acceptance tag points to (the exact CI evidence head; the closeout/
index commit is kept as a descendant) · **Accepted Tag** = annotated `p7-<increment>-accepted`. **PAIC** = Platform
Acceptance Infrastructure Corrections (test-only; production byte-identical) applied on top of a candidate before its
gate; recorded separately from product implementation.

## Governance stages (pre-implementation, complete)
| Stage | Artifact | Status |
|---|---|---|
| Charter (v1.3) | `PROGRAM_7_CHARTER.md` (Principles 1–12) | Ratified |
| Architecture Review | `PROGRAM_7_ARCHITECTURE_REVIEW.md` | Approved |
| Cross-Program Boundary Review | `PROGRAM_7_CROSS_PROGRAM_BOUNDARY_REVIEW.md` | Approved |
| Guardrails & Governance Decisions | `PROGRAM_7_GUARDRAILS.md` (ET1–ET8, GG1–GG7) | Approved |

## Accepted increments
| Phase | Design head | Implementation Candidate | Frozen Evidence Head | Accepted Tag | Status |
|-------|-------------|--------------------------|----------------------|--------------|--------|
| 7A.1 — Enterprise Authentication Foundation | `98cc795` (+invariant `75056f9`) | `112e6f8` | `84b9f74` | `p7-7a1-accepted` → `84b9f74` | **Accepted & Frozen** |
| 7A.2a — Interactive OIDC Federation | `98cc795`/`75056f9` → `7f70a0c` (7A.2 design + split + config-immutability invariant) | `5dfb970` → `67e99ba` → `4fb8fcf` | `e7bd388` | `p7-7a2a-accepted` → `e7bd388` | **Accepted & Frozen** |
| 7A.2b — Service-Principal OAuth | `7f70a0c` (7A.2 design + split) → DoR `PROGRAM_7_7A2B_DESIGN.md` (D1–D6) | `9218467` → `f072538` (live-wiring) | `e58ffb5` | `p7-7a2b-accepted` → `e58ffb5` | **Accepted & Frozen** |
| 7A.3 — SAML Federation (SP-initiated) | `PROGRAM_7_7A3_DESIGN.md` → `4c32bf2` (S1–S8 + §3a/§3b, approved-with-revisions) | `bd6d5cd` | `4da3afd` | `p7-7a3-accepted` → `4da3afd` | **Accepted & Frozen** |
| 7B.1 — Identity Lifecycle Core | `PROGRAM_7_7B_DESIGN.md` (L1–L12, `cdc9629`) → `PROGRAM_7_7B1_DESIGN.md` (`59ed066`) | `268472b` | `9142d20` | `p7-7b1-accepted` → `9142d20` | **Accepted & Frozen** |
| 7B.2 — Staff Invitations | `PROGRAM_7_7B2_DESIGN.md` (Model C + I1–I16 + 3 clarifications, `8becdb3`) | `f31c827` | `53b936b` | `p7-7b2-accepted` → `53b936b` | **Accepted & Frozen** |

## Authoritative CI evidence
| Phase | Workflow | Run | Result |
|-------|----------|-----|--------|
| 7A.1 | `p7-enterprise-auth-acceptance` | run `30603180627` (#1, `workflow_dispatch`, `feat/program-7-iam` @ `84b9f74`) | success — focused 14/14; full cumulative non-regression ~1,850 passed / 0 failed / 4 skipped (no exclusions, module-scoped batches); strict tsc 0; persisted assertions all passed (3 tables, 1 enum, 5 RESTRICT FKs, stable identifiers, provider-isolation seam, human/non-human classes, federated linkage, inert IdP/FederatedIdentity, existing-auth-authoritative, terminates-at-PermissionsGuard); **ET1–ET8 all GREEN**; post-candidate delta acceptance-infra + PAIC only; `p6-6h-accepted`/`p6-complete` unmoved |
| 7A.2a | `p7-oidc-federation-acceptance` | run `30608520089` (#1, `workflow_dispatch`, `feat/program-7-iam` @ `e7bd388`) | success — focused enterprise-auth+OIDC 38/38; full cumulative non-regression ~1,850 passed / 0 failed / 4 skipped (no exclusions); strict tsc 0; persisted assertions all passed (`OidcAuthTransaction` + 2 IdP OIDC cols, 2 RESTRICT FKs, **configuration-fingerprint immutability**, single-use, **persisted concurrent-consume = 1 success / 1 fail-closed**, existing-auth-authoritative, terminates-at-PermissionsGuard); OIDC security obligations (PKCE S256, discovery/JWKS/token-time/rotation, feature-gate/rollback, fail-closed) + audit outcomes (`LOGIN_INITIATED`/`LOGIN_SUCCEEDED`/coded `LOGIN_FAILED`, no secrets) bound by focused suites; **ET1–ET8 all GREEN**; delta after candidate `4fb8fcf` acceptance-infra only; `p6-6h-accepted`/`p6-complete`/`p7-7a1-accepted` unmoved |
| 7A.2b | `p7-service-principal-oauth-acceptance` | run `30635759436` (#3, `workflow_dispatch`, `feat/program-7-iam` @ `e58ffb5`) | success (21/21 steps) — focused enterprise-auth incl. live e2e 57/57; full cumulative non-regression ~1,850 passed / 0 failed / 4 skipped (no exclusions, module-scoped batches; audit isolated in NR1b at 391/391); strict tsc 0; persisted assertions all passed (2 tables + 1 enum + 5 RESTRICT FKs, **Argon2id hash-only / no plaintext**, distinct service token `aud=service`/`isSuperRole=false`/no session, **Permission-catalogue scopes via the single existing PermissionsGuard**, bad-secret/unknown-client fail-closed, **rotation revokes the prior credential**, cross-lab fail-closed, **machine-identity immutability (D1/D6)**, existing-auth authoritative); the 5 machine audit outcomes (initiation/success/failure/rotation/revocation, no secrets) bound by focused suites; **ET1–ET8 all GREEN**; delta after live-wiring candidate `f072538` acceptance-infra only; `p6-6h-accepted`/`p6-complete`/`p7-7a1-accepted`/`p7-7a2a-accepted` unmoved |
| 7A.3 | `p7-saml-federation-acceptance` | run `30657622621` (#1, `workflow_dispatch`, `feat/program-7-iam` @ `4da3afd`) | success (21/21 steps) — focused enterprise-auth incl. **live ACS e2e + the S8 security matrix** 100/100; full cumulative non-regression ~1,850 passed / 0 failed / 4 skipped (no exclusions; NR1 210, NR1b audit-isolated 391, NR2 695+4skip, NR3 157, NR4 86, NR5 163, NR6 148); strict tsc 0; persisted assertions all passed (**3 tables + 1 enum + 6 RESTRICT FKs** + nullable IdentityProvider SAML columns, no JSON; provider seam `[local,oidc,saml]`; **vetted-library S8 semantic binding** incl. XSW/XXE/unsigned/wrong-cert/issuer/audience/**Recipient**/InResponseTo/NameID-format/time/**EncryptedAssertion-reject** fail-closed; **config-fingerprint single-use** with exactly-one concurrent consume; **assertion-ID replay** fail-closed; NameID → **HUMAN** principal (GG7) / unlinked → null, no JIT; RelayState request-bound/local-only; existing-auth authoritative; single PermissionsGuard); coded `LOGIN_INITIATED`/`LOGIN_SUCCEEDED`/`LOGIN_FAILED` (`method=saml`, **no new registry codes**, no secrets) bound by focused suites; **ET1–ET8 all GREEN**; delta after candidate `bd6d5cd` acceptance-infra only; `p6-6h-accepted`/`p6-complete`/`p7-7a1-accepted`/`p7-7a2a-accepted`/`p7-7a2b-accepted` unmoved |
| 7B.1 | `p7-identity-lifecycle-core-acceptance` | run `30670404109` (#2, `workflow_dispatch`, `feat/program-7-iam` @ `9142d20`) | success (21/21 steps) — focused identity-lifecycle (state + integration + **sole-writer arch**) 17/17; full cumulative non-regression **1,950 passed / 0 failed / 4 skipped** (no exclusions; NR1 310, NR1b audit-isolated 391, NR2 695+4skip, NR3 157, NR4 86, NR5 163, NR6 148); strict tsc 0; persisted assertions all passed (2 enums + 4 User cols + `FederatedIdentity.deactivatedAt` + append-only `IdentityLifecycleEvent`, **2 RESTRICT FKs**, no JSON; additive migration 0 destructive + deterministic backfill; **deterministic state↔isActive no-drift (L1)**; legal/illegal transition matrix; **suspend/deprovision revoke sessions+refresh**; deprovision deactivates links + terminal + preserves `User.id`, no hard delete (L5); **single-winner CAS + idempotency (L9)**; durable append-only evidence; **L8 sole-writer source-scan**); six additive `IDENTITY_*` audit codes (distinct from `LOGIN_*`/`ROLE_*`, no secrets); `identitylifecycle:manage` no default grant; single PermissionsGuard; **ET1–ET8 all GREEN**; delta after candidate `268472b` acceptance-infra + docs only; `p6-*`/`p7-7a1`/`p7-7a2a`/`p7-7a2b`/`p7-7a3`/`p7-7a-complete` unmoved. *(Earlier gate head `4327aa2` / run `30670078424` failed on a gate-infra allowlist bug — `docs/` vs `docs/.*` — superseded by the regex fix; historical only.)* |
| 7B.2 | `p7-staff-invitations-acceptance` | run `30675465014` (#1, `workflow_dispatch`, `feat/program-7-iam` @ `53b936b`) | success (21/21 steps) — focused staff-invitations + identity-lifecycle (incl. **atomic-acceptance concurrency + failure-injection + sole-writer arch**) 32/32; full cumulative non-regression **1,950 passed / 0 failed / 4 skipped** (no exclusions; NR1 310, NR1b audit-isolated 391, NR2 695+4skip, NR3 157, NR4 86, NR5 163, NR6 148); strict tsc 0; persisted assertions all passed (1 enum + `StaffInvitation` table + **2 RESTRICT FKs**, no JSON, **NO `User` change**; additive migration 0 destructive; **Model C** — invited user INVITED/`isActive=false`/non-null placeholder Argon2id hash/`source=INVITATION`; **hash-only token**, opaque URL; **atomic acceptance** — one transaction {claim → verify INVITED → password → `activateInTx` INVITED→ACTIVE}, failure fully rolls back + retry succeeds, two concurrent → exactly one success/one fail-closed/one password swap/one transition/one durable event; single-use CAS; expiry/cancel fail-closed; acceptance grants **no** permission; **L8 sole-writer preserved** via the additive `activateInTx` seam, 7B.1 semantics byte-identical); three additive `IDENTITY_INVITED`/`IDENTITY_INVITATION_ACCEPTED`/`IDENTITY_INVITATION_CANCELLED` audit codes (coded, no token/password/PHI); `identityinvitation:manage` no default grant; single PermissionsGuard; **ET1–ET8 all GREEN**; delta after candidate `f31c827` acceptance-infra only; `p6-*`/all 7A increments/`p7-7a-complete`/`p7-7b1-accepted` unmoved. *(Earlier candidate `38a75a2` / gate head `b3e6ff6` superseded by the atomic-acceptance reconciliation; historical only.)* |

## Platform Acceptance Infrastructure Corrections (PAIC — test-only; NOT product)
Pre-existing acceptance-test drifts, unrelated to Program 7, corrected under explicit authorization (production
byte-identical):
- `d90f4b6` — R-001a authz-contract arch scan recognizes the P5-5B composed `@DeliveryProtected()` contract.
- `1d8a82e` — P2-7B audit-catalog expectation reflects the accepted P5C `system:['health','security','ingestion']`.

## Program-7-authorized additive cross-program extension (NOT a PAIC; adds production audit behavior)
- `4fb8fcf` — adds a single additive `AUTHENTICATION/LOGIN_INITIATED` code to the Program 2 audit registry (recorded
  when an OIDC authorization transaction is successfully created). Program 2's accepted baseline is historically
  unchanged; this is a new additive code (no modification/reinterpretation of an existing code), governance-authorized
  for Program 7 · Phase 7A.2a.
- `9218467` — adds **five** additive `AUTHENTICATION` codes to the Program 2 audit registry for **machine** (service-
  principal) authentication: `SERVICE_AUTH_INITIATED`, `SERVICE_AUTH_SUCCEEDED`, `SERVICE_AUTH_FAILED`,
  `SERVICE_CREDENTIAL_ROTATED`, `SERVICE_CREDENTIAL_REVOKED` (D3 — distinct from the human `LOGIN_*` codes). New additive
  codes only (no modification/reinterpretation of an existing code); Program 2's accepted baseline is historically
  unchanged; governance-authorized for Program 7 · Phase 7A.2b.
- `268472b` (7B.1 candidate) — adds **six** additive `ADMINISTRATIVE` codes to the Program 2 audit registry for human-
  identity **lifecycle** transitions: `IDENTITY_PROVISIONED`, `IDENTITY_ACTIVATED`, `IDENTITY_SUSPENDED`,
  `IDENTITY_REACTIVATED`, `IDENTITY_DEPROVISIONED`, `IDENTITY_LINK_DEACTIVATED` (distinct from human `LOGIN_*` and
  authorization `ROLE_*` codes). New additive codes only; Program 2's accepted baseline is historically unchanged;
  governance-authorized for Program 7 · Phase 7B.1. 7B.1 also adds the additive `identitylifecycle:manage` permission
  namespace (no default grant; the frozen 7A `identity` catalogue is unchanged).
- `f31c827` (7B.2 candidate) — adds **three** additive `ADMINISTRATIVE` codes for staff **invitations**:
  `IDENTITY_INVITED`, `IDENTITY_INVITATION_ACCEPTED`, `IDENTITY_INVITATION_CANCELLED` (distinct from `LOGIN_*`/`ROLE_*`;
  coded, never the token/password/PHI). New additive codes only; Program 2's accepted baseline is historically unchanged;
  governance-authorized for Program 7 · Phase 7B.2. 7B.2 also adds the additive `identityinvitation:manage` permission
  namespace (no default grant; acceptance is `@Public`/token-bound and grants no permission).

## CI registration infrastructure (NOT accepted-implementation lineage)
Gate registered on the default branch (`main`) so it is `workflow_dispatch`-dispatchable; byte-identical to the branch
copy, no product/schema/runtime change:
- `3e71e4d` — 7A.1 gate registration on `main` (byte-identical blob `1a42f26` to branch copy `84b9f74`).
- `6049cae` — 7A.2a gate registration on `main` (byte-identical blob `08a0059` to branch copy `e7bd388`).
- `d014315` — 7A.2b gate registration on `main` (byte-identical blob `ab45f1e` to branch copy `e58ffb5`).
- `a55d8f4` — 7A.3 gate registration on `main` (byte-identical blob `01c4b30` to branch copy `4da3afd`).
- `1f747f4` — 7B.1 gate registration on `main` (byte-identical blob `2f04ec2` to branch copy `9142d20`; supersedes the earlier `7b40c14` after the gate-infra `docs/.*` allowlist fix).
- `a8731f7` — 7B.2 gate registration on `main` (byte-identical blob `113e02b` to branch copy `53b936b`).

## Notes
- Each increment opens only via its own authorized design → implementation → acceptance, and is accepted only on a
  **GREEN exact-head authoritative CI run** carrying the **ET1–ET8** encroachment tests, then frozen with
  `p7-<increment>-accepted`.
- Program 7 references — and never modifies — the frozen Programs 1–6 (`p6-complete` → `40d810e`).
- **No accepted increment accepts Phase 7A as a whole.** 7A.2a is accepted for **interactive human OIDC only**
  (Authorization Code + PKCE); 7A.2b for **machine (service-principal) OAuth 2.0 Client Credentials only**; 7A.3 for
  **SP-initiated interactive human SAML Web-SSO only** (no IdP-initiated, EncryptedAssertion, SLO, SCIM, JIT
  provisioning, or email-based linking). **All four 7A increments (7A.1, 7A.2a, 7A.2b, 7A.3) are now Accepted & Frozen.**
  No broader `p7-7a2-accepted` or `p7-7a-accepted` tag exists; Phase 7A is now *eligible* for a **distinct,
  separately-authorized** phase-level completion review (a cross-increment audit of the four increments as one governed
  capability — never an automatic rollup).
- **7A.3 dependency (S2):** `@node-saml/node-saml` (→ `xml-crypto`) is adopted for all SAML XML parsing / canonicalization
  / XML-DSig / X.509 / signature-reference / XSW handling, isolated behind the `SamlAssertionValidator` seam. Per S6,
  7A.3 reuses the existing human `LOGIN_*` audit codes (`method=saml`) and adds **no** Program 2 audit registry code.
