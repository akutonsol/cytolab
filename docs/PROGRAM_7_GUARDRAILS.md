# Program 7 — Enterprise IAM — GUARDRAILS & GOVERNANCE DECISIONS (v1)

**Status:** Governance decisions of record — **for review**. Authorized by the approved Cross-Program Boundary Review.
**No schema, APIs, or implementation are proposed or authorized here.** This document transforms the ratified
architectural principles into **immutable governance decisions** that govern **every** subsequent Program 7 phase. It
(1) ratifies Principles 1–12 as binding rules, (2) formalizes the encroachment tests as required acceptance criteria for
all phases, (3) records the deferred design decisions with their assigned phases, and (4) defines the additional
identity-specific guardrails. Once approved, these bind each phase's design, implementation, and folded acceptance gate.

Charter: [`PROGRAM_7_CHARTER.md`](./PROGRAM_7_CHARTER.md) · Architecture:
[`PROGRAM_7_ARCHITECTURE_REVIEW.md`](./PROGRAM_7_ARCHITECTURE_REVIEW.md) · Boundary review:
[`PROGRAM_7_CROSS_PROGRAM_BOUNDARY_REVIEW.md`](./PROGRAM_7_CROSS_PROGRAM_BOUNDARY_REVIEW.md).

---

## 1. Part 1 — Immutable governing principles (ratified)
Principles 1–12 from the charter (v1.3) are ratified as **immutable governance rules**; no Program 7 phase may weaken
them, and any change requires a separately governed charter amendment.

| # | Principle | Binding rule (one line) |
|---|---|---|
| 1 | Authentication ≠ Authorization | Proving identity never grants permission by itself. |
| 2 | Identity ≠ Clinical Authority | Identity grants platform access only; never diagnostic/sign-out/clinical/AI-approval authority. |
| 3 | Identity never *changes* Clinical Authority | No IAM construct creates, alters, or infers clinical/AI/diagnostic authority. |
| 4 | Organization ≠ Tenancy; Laboratory authoritative | `labId` is the sole operational isolation anchor; Organizations are administrative only. |
| 5 | Identity Evidence is Immutable | Append-only, immutable, traceable, reproducible, auditable; `RESTRICT` provenance. |
| 6 | Least Privilege by Default | Every permission denied until explicitly granted; deterministic inheritance; no default grant. |
| 7 | Enterprise Standards First — Federation-Ready | SAML/OIDC/OAuth2.1/SCIM are the seams; protocol depth per phase design. |
| 8 | Evolutionary, not Replacement | Extend the incumbent; it stays authoritative until a governed migration. |
| 9 | Identity is a Platform Service | Identity owned centrally; every other program consumes it, never re-implements it. |
| 10 | Source of Authentication, not Domain Truth | IAM asserts who/how/permissions only; never the system of record for domain facts. |
| 11 | Human ≠ Non-Human principal classes | Distinct classes; non-human principals never hold clinical/AI authority. |
| 12 | Deterministic Authorization | Same principal + org + lab + resource + permission set ⇒ same decision, always. |

## 2. Part 2 — Required acceptance criteria (encroachment tests ET1–ET8)
Every Program 7 phase acceptance gate **must** assert these against real code/DB truth (the Program-7 analogue of the
Program-6 "no-support" persisted-state assertions). A phase cannot be accepted or frozen unless all applicable tests
pass GREEN on the exact evidence head.

| ET | Required assertion |
|---|---|
| ET1 | **No clinical-path writes** — 0 Program 7 production writes to `ResultSheet`/`Record`/`RecordStatusEvent`/`AiDraft`/`Patient`. |
| ET2 | **No AI-evidence mutation** — 0 Program 7 writes to `AiModelVersion` lifecycle or any Program 6 evidence table. |
| ET3 | **Tenancy unchanged** — `tenancyExtension`/`LabContext`/`scopeArgs` behaviour intact; Organization never an isolation key. |
| ET4 | **Single immutable ledger** — identity events append-only on `AuditEvent`; no mutation/deletion of prior evidence; no second chain. |
| ET5 | **No authority-by-identity** — no IAM role/Organization grants a clinical or AI action authority by identity alone; clinical/AI codes stay owned by their catalogues. |
| ET6 | **Principal-class separation** — non-human principals hold no clinical/AI action authority. |
| ET7 | **No domain-truth capture** — no IAM model becomes the authoritative source for a domain fact owned elsewhere (licensing/accreditation/employment/clinical state). |
| ET8 | **Programs 1–6 immutable** — no Program 7 change amends any frozen 1–6 commit/tag/schema/closeout. |

Each phase gate additionally carries the standard Program-6 controls: strict `tsc` 0, focused phase tests, a
non-regression suite over Programs 1–6 + prior Program-7 phases, additive-only migration (0 destructive), and
persisted-state assertions driven through the real DI graph.

## 3. Part 3 — Deferred design-decisions register
Open decisions from the Architecture Review, with assigned phase and the question each must settle (constrained by the
principles + ETs above). D3 and D6 are already closed (Principle 11 and the Boundary Review, respectively).

| ID | Decision | Assigned to | Must settle (within the guardrails) |
|---|---|---|---|
| D1 | Permission freshness | **Phase 7C** | JWT-baked vs live per-request evaluation — without breaking GD-Determinism (Principle 12) or the single enforcement boundary (GD1). |
| D2 | Role scoping | **Phase 7C** | Global vs lab/org-scoped roles (`RoleScope.Workspace` reserved) — preserving the super-role bypass and no-default-grant. |
| D4 | Organization model shape | **Phase 7D** | The administrative hierarchy above `Lab` — administrative only (Principle 4/ET3); never a tenancy key. |
| D5 | Federated-identity linking | **Phase 7B** | SAML/OIDC subject → `User` linking, SCIM JIT provisioning — preserving `@@unique([labId,email])` and per-lab identity. |

## 4. Part 4 — Additional identity-specific guardrails (GG1–GG6)
- **GG1 — Deterministic authorization evaluation** (Principle 12). Authorization is a pure function of (principal, org
  context, lab context, resource, effective permission set). No hidden policy engine, no implicit override, no
  ambient/time/random inputs; the same inputs always yield the same decision. The single global `PermissionsGuard`
  remains the one enforcement point (GD1).
- **GG2 — Permission provenance.** Every effective permission is **traceable to its grant source** — the role,
  assignment, inheritance edge, or federation mapping that conferred it — so any access decision can be explained and
  audited. Inheritance is deterministic and acyclic; the resolved effective set is reproducible.
- **GG3 — Append-only governance evidence.** All Program 7 identity-governance events (login/permission/role/admin/SCIM
  history) are produced through the existing `AuditRecorder` + hash-chained `AuditEvent` ledger (ET4), append-only,
  id/name-free metadata, attribution from `ExecutionContext`; no phase introduces a parallel or mutable identity
  ledger.
- **GG4 — Single enforcement boundary; additive vocabulary.** Enterprise RBAC computes richer effective permissions but
  resolves to the existing flat `"<object>:<action>"` set enforced at the one guard (GD1); new capabilities are
  additive permission objects, never a second authorization engine.
- **GG5 — Evolutionary rollout; opt-in.** Every capability ships behind per-lab FeatureKey gating (base-vs-advanced),
  is additive and non-regressive, and retires an incumbent component only through an explicit, separately governed
  migration (Principle 8).
- **GG6 — Separation of duties for administration.** Administrative authority (7D/7E) is scoped and delegable but never
  self-elevating into clinical/AI authority; break-glass and cross-lab actions are explicit, time-bounded where
  applicable, and always audited (`organizationScope = CROSS_LAB`).

## 5. Governance decision summary
The binding decisions for every Program 7 phase are: **Principles 1–12** (Part 1, immutable) · **ET1–ET8** (Part 2,
required acceptance criteria) · **GG1–GG6** (Part 4, identity-specific guardrails) · the **deferred-decision register**
(Part 3, phase-assigned). A phase design that violates any of these is out of scope by construction; a phase gate that
cannot assert the applicable ETs cannot be accepted.

## 6. Governance sequence — remaining
Guardrails approval → **Phase 7A (Enterprise Authentication) design of record** → implementation authorization → narrow
implementation → local verification → authoritative folded acceptance gate (carrying ET1–ET8) → closeout → freeze
`p7-7a-accepted` → subsequent phases (7B–7H) → program-level Completion Review → master closeout.

## 7. What this document does NOT authorize
No schema, migration, API, guard change, or implementation. Phase 7A design begins only after these guardrails are
reviewed and approved. Implementation remains unauthorized until a phase design of record is separately approved.
