# Program 7 · Phase 7A.3 — SAML Federation — Acceptance Closeout

**Status:** **ACCEPTED · FROZEN** at evidence head `4da3afd`. SP-initiated interactive **human** SAML Web-SSO as a third
authentication front-end behind the frozen 7A.1 provider-isolation seam. Additive and non-invasive; local, OIDC, and
service-principal auth + the human session path are unchanged. References — and modifies nothing in — the frozen
Programs 1–6, Phase 7A.1, 7A.2a, or 7A.2b. Design of record: [`PROGRAM_7_7A3_DESIGN.md`](./PROGRAM_7_7A3_DESIGN.md)
(S1–S8, §3a RelayState, §3b NameID linkage) · Charter: [`PROGRAM_7_CHARTER.md`](./PROGRAM_7_CHARTER.md) · Guardrails:
[`PROGRAM_7_GUARDRAILS.md`](./PROGRAM_7_GUARDRAILS.md).

---

## 1. Phase overview
7A.3 delivers **SP-initiated** SAML 2.0 Web-Browser-SSO for the existing human identity. A `SamlAuthenticationAdapter`
sits behind the accepted 7A.1 seam; the flow is **SAML Response → `SamlAssertionValidator` → `FederatedIdentityService`
→ canonical HUMAN principal → the existing federated session bridge → the existing single `PermissionsGuard`**. It
introduces no new authorization evaluator, no tenancy change, and no clinical/AI authority. NameID is an opaque external
subject; the durable platform identity remains `User.id` (GG7).

## 2. Ratified decision conformance (S1–S8)
- **S1** — SAML terminates at the canonical-principal boundary; no downstream module depends on SAML attributes/provider details.
- **S2** — the vetted **`@node-saml/node-saml`** (→ `xml-crypto`) performs all XML parsing/canonicalization/XML-DSig/
  X.509/signature-reference/XSW handling **behind the `SamlAssertionValidator` seam**; no hand-rolled XML security.
- **S3** — **SP-initiated only** (frozen baseline boundary); a response without a persisted request + present `InResponseTo` fails closed.
- **S4** — the **configured** X.509 signing certificate(s) are the trust anchor (deterministic fingerprints, bounded
  rollover via concurrently-valid certs); message/metadata never redefines the anchor.
- **S5** — persisted `SamlAuthRequest` (config-fingerprint immutability, single-use CAS — **exactly one success / one
  fail-closed** under concurrency) + an assertion-`ID` replay store; frozen `IdentityProvider` scalar shape preserved (additive nullable columns).
- **S6** — reuse of the human `LOGIN_INITIATED`/`LOGIN_SUCCEEDED`/coded `LOGIN_FAILED` events with `method='saml'`; **no
  new Program 2 audit registry code**; metadata never carries XML/assertion/signature/cert/NameID/email/RelayState/`SessionIndex`/PHI.
- **S7** — **EncryptedAssertion is excluded from the baseline** and explicitly detected + rejected (coded fail-closed).
- **S8** — assertion **semantic binding** on the signature-verified assertion: issuer, audience, destination/`Recipient`,
  exact `InResponseTo`, replay-protected IDs, `NotBefore`/`NotOnOrAfter` (bounded skew), bearer `SubjectConfirmation`,
  signed-node == consumed-node (XSW), single unambiguous assertion/subject, stable NameID + allowed format. §3a RelayState
  is request-bound / single-use / local-only / length-bounded; §3b NameID linkage keyed on `(identityProviderId, NameID)`,
  unlinked ⇒ fail closed, no JIT/auto-link/SCIM/email matching.

## 3. Accepted implementation lineage
| SHA | Meaning |
|---|---|
| `4c32bf2` | ratified DoR (S1–S8, §3a/§3b) — docs |
| **`bd6d5cd`** | **implementation candidate** (dependency + additive schema/migration + saml/* module + full test suite) |
| `4da3afd` | acceptance-infra head = **frozen evidence head** (gate + seed + assert; product unchanged from `bd6d5cd`) |

`git diff bd6d5cd 4da3afd` = **acceptance-infrastructure only** (`p7-saml-federation-acceptance.yml` + `seed`/`assert`
scripts); **0 product files** after the candidate. **CI registration (NOT accepted-implementation lineage):** `a55d8f4`
— 7A.3 gate registration on `main` (byte-identical blob `01c4b30` to the branch copy `4da3afd`).

## 4. Authoritative acceptance evidence
- **Workflow:** `p7-saml-federation-acceptance` · **Run:** `30657622621` (#1, `workflow_dispatch`, `feat/program-7-iam`)
- **Exact tested SHA:** `4da3afd` — `HEAD == github.sha`; descends candidate `bd6d5cd` (verified in-gate)
- **Conclusion:** `success` · **all 21/21 steps OK**

### Persisted-state assertions (real DI graph, isolated Postgres) — GREEN
Additive schema (**3 tables + 1 enum + 6 `ON DELETE RESTRICT` FKs** + nullable `IdentityProvider` SAML columns, no JSON)
· provider seam `[local, oidc, saml]` · vetted-library **S8** validation · config-fingerprint **single-use** ·
assertion-`ID` **replay** fail-closed · NameID → **HUMAN** principal (GG7) / unlinked → null (no JIT) · existing local
auth authoritative · **ET1–ET8** all GREEN.

### Verification totals
| Area | Result |
|---|---|
| Focused enterprise-auth (S8 matrix + live e2e ACS + seam) | 100 / 100 |
| NR1 identity/auth-adjacent + core | 210 / 210 |
| NR1b audit (isolated process) | 391 / 391 |
| NR2 Program 6 AI + WSI | 695 passed / 4 skipped |
| NR3 records / billing / reporting | 157 / 157 |
| NR4 messaging / ops | 86 / 86 |
| NR5 enterprise-admin / case / requisitions | 163 / 163 |
| NR6 remaining modules | 148 / 148 |
| **Full non-regression (no exclusions)** | **~1,850 passed · 0 failed · 4 skipped** |
| Strict TypeScript | 0 errors |
| Artifact | `p7-7a3-saml-federation-acceptance` |

**Protected anchors (verified unmoved in-gate + on GitHub):** `p6-6h-accepted` → `f98b9f1` · `p6-complete` → `40d810e`
· `p7-7a1-accepted` → `84b9f74` · `p7-7a2a-accepted` → `e7bd388` · `p7-7a2b-accepted` → `e58ffb5`.

## 5. Frozen decisions
- Authentication establishes the human principal; it never authorizes (single `PermissionsGuard`) and never becomes
  clinical/AI authority. The vetted library's XML/signature behavior stays behind the `SamlAssertionValidator` seam.
- The configured X.509 cert(s) are the sole trust anchor; SP-initiated only; EncryptedAssertion rejected; RelayState is
  correlation, never a redirect; NameID is opaque and never matched on email/mutable claims.
- Human authentication is unchanged (no `@Public` widening beyond the login routes, `JwtAuthGuard` not weakened, staff/
  portal/OIDC/service paths intact). **Programs 1–6 remain immutable; Phases 7A.1/7A.2a/7A.2b remain frozen.**

## 6. Scope exclusions (NOT in Phase 7A.3)
IdP-initiated (unsolicited) SSO · EncryptedAssertion · Single Logout (SLO) · SP-metadata publishing endpoint ·
HTTP-Artifact binding · additional NameID formats · JIT provisioning / auto-linking / SCIM (7B / D5) · any tenancy
change · any clinical/AI authority.

## 7. Protected boundary / freeze statement
**Program 7 · Phase 7A.3 is immutable at `4da3afd`.** Future work affecting SAML federation must be additive and
backward-compatible with this baseline, or proceed as separately governed work. The `p7-7a3-accepted` tag pins the exact
evidence head `4da3afd`; this closeout is kept as a descendant. **This acceptance does not accept Phase 7A as a whole and
creates no broader `p7-7a-accepted` tag.** With 7A.1/7A.2a/7A.2b/7A.3 now all frozen, Phase 7A becomes *eligible* for a
distinct, separately-authorized phase-level completion review (a cross-increment audit — never an automatic rollup).
