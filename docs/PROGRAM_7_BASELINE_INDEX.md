# Program 7 — Accepted Baseline Index

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

## Authoritative CI evidence
| Phase | Workflow | Run | Result |
|-------|----------|-----|--------|
| 7A.1 | `p7-enterprise-auth-acceptance` | run `30603180627` (#1, `workflow_dispatch`, `feat/program-7-iam` @ `84b9f74`) | success — focused 14/14; full cumulative non-regression ~1,850 passed / 0 failed / 4 skipped (no exclusions, module-scoped batches); strict tsc 0; persisted assertions all passed (3 tables, 1 enum, 5 RESTRICT FKs, stable identifiers, provider-isolation seam, human/non-human classes, federated linkage, inert IdP/FederatedIdentity, existing-auth-authoritative, terminates-at-PermissionsGuard); **ET1–ET8 all GREEN**; post-candidate delta acceptance-infra + PAIC only; `p6-6h-accepted`/`p6-complete` unmoved |

## Platform Acceptance Infrastructure Corrections (PAIC — test-only; NOT product)
Pre-existing acceptance-test drifts, unrelated to Program 7, corrected under explicit authorization (production
byte-identical):
- `d90f4b6` — R-001a authz-contract arch scan recognizes the P5-5B composed `@DeliveryProtected()` contract.
- `1d8a82e` — P2-7B audit-catalog expectation reflects the accepted P5C `system:['health','security','ingestion']`.

## CI registration infrastructure (NOT accepted-implementation lineage)
Gate registered on the default branch (`main`) so it is `workflow_dispatch`-dispatchable; byte-identical to the branch
copy, no product/schema/runtime change:
- `3e71e4d` — 7A.1 gate registration on `main` (byte-identical blob `1a42f26` to branch copy `84b9f74`).

## Notes
- Each increment opens only via its own authorized design → implementation → acceptance, and is accepted only on a
  **GREEN exact-head authoritative CI run** carrying the **ET1–ET8** encroachment tests, then frozen with
  `p7-<increment>-accepted`.
- Program 7 references — and never modifies — the frozen Programs 1–6 (`p6-complete` → `40d810e`).
- **7A.1 acceptance does NOT accept Phase 7A as a whole.** Deferred: 7A.2 (OIDC/OAuth), 7A.3 (SAML). No broader
  `p7-7a-accepted` tag exists until all 7A increments are accepted.
