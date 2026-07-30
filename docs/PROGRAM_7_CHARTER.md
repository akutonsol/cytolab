# Program 7 — Enterprise Identity & Access Management (IAM) — CHARTER & ROADMAP

**Status:** **RATIFIED — v1.1 (2026-07-30).** Governance framing for a NEW programme; **no engineering authorized.**
Ratification authorizes only the move to the Program 7 Architecture Review. v1.1 adds Principle 9 (Identity is a
Platform Service), recorded at ratification. This document establishes the mission, governing principles, scope, phase
structure, hard non-goals, relationship to existing systems, and governance lifecycle for Program 7. It **references** —
and modifies nothing in — the frozen Programs 1–6 baselines (Program 6 complete at tag `p6-complete`; Program 5 frozen).

---

## 1. Mission
Program 7 establishes Osieri's enterprise identity, authentication, authorization, organizational administration, and
identity-governance framework — secure, scalable enterprise access management for healthcare organizations — while
**preserving every clinical, AI, and governance boundary established in Programs 1–6**. Program 7 governs **who** may
access the platform, **what** they may access, and **how** that access is administered. It does **not** govern clinical
authority, AI authority, or diagnostic decision-making.

## 2. Governing principles (asserted at every phase; structural and immutable)
1. **Authentication is not Authorization.** Proving identity never grants permission by itself. Authentication
   establishes *who* a principal is; authorization determines *what* it may do. These remain structurally separate.
2. **Identity is not Clinical Authority.** Identity determines platform access only. It never grants diagnostic
   authority, sign-out authority, clinical authorization, or AI-approval authority — those remain governed by prior
   programs.
3. **Identity never *changes* Clinical Authority (structural, immutable).** Enterprise IAM determines platform access,
   not clinical authority, and can never transmute into it. Concretely and enforceably: signing in via SAML/OIDC does
   not authorize pathology sign-out; SCIM provisioning does not grant diagnostic privileges; an Organization Admin does
   not become a Medical Director; identity lifecycle does not modify Program 5 workflow authority; enterprise RBAC does
   not override clinical or AI governance decisions established in Programs 5–6. No Program 7 construct may create,
   alter, or infer clinical/AI/diagnostic authority.
4. **Organization is not Tenancy — and the Laboratory remains the authoritative operational boundary.** Organizations
   (and regions/networks/departments/teams) are **administrative** constructs describing ownership and delegation.
   **Laboratory tenancy (`labId` + `AsyncLocalStorage`/`LabContext` + the Prisma tenancy extension) remains the
   authoritative operational isolation boundary** established in Programs 2–6, unless a future architecture decision
   explicitly and separately changes that model. Enterprise hierarchy must never inadvertently redefine isolation.
5. **Identity Evidence is Immutable.** Identity-governance evidence follows the Program 6 discipline: append-only,
   immutable, traceable, reproducible, auditable; provenance foreign keys `onDelete: Restrict`.
6. **Least Privilege by Default.** Every permission begins denied; access is explicitly granted; permission
   inheritance is deterministic. (Continues the existing `SPECIAL_OBJECTS` / `buildRoleDefs` no-default-grant model.)
7. **Enterprise Standards First — Federation-Ready.** Program 7 promises **compatibility** with widely adopted
   standards (SAML 2.0, OpenID Connect, OAuth 2.1, SCIM 2.0) as the architectural **seams**; the depth and timing of
   protocol support is decided per **phase design review**, not committed wholesale in the charter (consistent with the
   "finish the product first" directive).
8. **Evolutionary, not Replacement Architecture.** Program 7 **extends**, and does not replace, the platform's existing
   authentication and authorization infrastructure. The existing custom auth, session, and permission systems remain
   **authoritative** until intentionally superseded through a **governed migration**. This preserves backward
   compatibility and reduces migration risk.
9. **Identity is a Platform Service.** Identity is a shared platform capability, not a feature owned by individual
   modules. Identity owns authentication and authorization; every other program **consumes** it as a single source of
   truth. Clinical modules (Programs 1–5) do not implement their own identity logic; AI modules (Program 6) do not
   implement their own identity logic; audit/governance modules **consume** identity events rather than duplicating
   identity behaviour. This reduces duplication and keeps one authoritative access-decision boundary.

## 3. Relationship to existing systems (the incumbent Program 7 extends)
- **Authentication / sessions:** custom JWT staff + portal auth in `apps/api/src/modules/auth` (e.g. `PermissionsGuard`,
  `require-permissions` metadata). Enterprise federation (7A) sits **alongside/in front of** custom auth; direct users
  are unaffected.
- **Authorization / RBAC:** the permission catalogue + role definitions in `prisma/seed.ts` (`SPECIAL_OBJECTS`,
  `buildRoleDefs`, super-role vs. default-role, no default grant). Enterprise RBAC (7C) **extends** this graph
  additively; it does not rewrite it.
- **Tenancy:** `labId` on every tenant-owned model, enforced via `LabContext` + the Prisma extension. The Organization
  model (7D) layers administrative ownership **above** this anchor without altering it (Principle 4).
- **Reconciliation with planned platform work:** the Architecture Review will reconcile Program 7 with the existing
  target-platform blueprint — `docs/architecture/TARGET_PLATFORM_ARCHITECTURE.md` and
  `docs/architecture/HYBRID_TENANCY_AND_CUSTOM_DOMAINS.md` — determining whether Program 7 is the identity layer *of*
  that platform or a parallel construct.

## 4. Phase structure
| Phase | Name | Core deliverables | Explicitly still NOT |
|---|---|---|---|
| **7A** | Enterprise Authentication | SAML / OIDC / OAuth federation seams; identity federation; session establishment; service identities | not a replacement of custom auth; protocol depth per design review |
| **7B** | Identity Lifecycle | SCIM; provisioning / deprovisioning; group sync; invitations; suspension / reactivation | provisioning never grants clinical/AI authority |
| **7C** | Enterprise Authorization | enterprise RBAC; permission graph; custom roles; deterministic inheritance; resource permissions; scope evaluation | extends the existing RBAC; never overrides clinical/AI governance |
| **7D** | Organization Model | organizations; regions; networks; labs; departments; teams; administrative hierarchy | administrative only; never redefines `labId` tenancy isolation |
| **7E** | Administration | delegated / scoped administration; break-glass; approval workflows; administrative delegation | admin roles never become clinical roles |
| **7F** | Enterprise Security | session & token governance; conditional-access hooks; device trust; service-account governance; security policies | access controls only; no clinical/AI policy authority |
| **7G** | Identity Governance | immutable identity events; login / permission / role / administrative / SCIM history; audit evidence | append-only evidence; never mutates prior programs |
| **7H** | Operational Reporting | access reviews; dormant / orphaned identities; least-privilege reports; permission drift; identity health; administrative reporting | reporting only; no enforcement authority of its own |

## 5. Explicitly out of scope (Program 7 neither implements nor modifies)
clinical workflow · patient records · pathology interpretation · AI inference · AI governance · model lifecycle ·
validation · explainability · clinical performance · billing · licensing · financial systems. Program 7 also amends
**nothing** in the frozen Programs 1–6 (no commit/tag/schema/closeout).

## 6. Governance lifecycle (same discipline as Program 6)
Program 7 opens under a governance sequence and does **not** authorize implementation up front:
1. **Charter Ratification** (this document, amended — current step).
2. **Architecture Review** — how Enterprise IAM integrates with Programs 1–6 (auth, RBAC, tenancy, target platform).
3. **Cross-Program Boundary Review** — prove identity cannot encroach on clinical or AI authority (Principles 2 & 3).
4. **Guardrails & Governance Decisions** — establish immutable principles/decisions before any coding.
5. **Per-phase cycle:** read-only preflight → design of record → implementation authorization → narrow implementation →
   local verification → authoritative exact-head acceptance gate → closeout → freeze tag.
6. **Program completion:** program-level Completion Review → master closeout → formal completion declaration.

**Execution conventions (carried over from Program 6):** branch **`feat/program-7-iam`** (forked from the accepted
platform tip `40d810e`, which carries Programs 1–6); accepted-tag convention **`p7-<phase>-accepted`** (annotated,
pinned to the exact CI evidence head); folded `workflow_dispatch` acceptance gates registered byte-identically on the
default branch; persisted-state assertions against real DB truth; every phase additive and non-regressive.

## 7. Hard non-goals (later programmes only, if ever)
Program 7 IAM never becomes clinical or AI authority; never a diagnostic, sign-out, or model-approval mechanism; never
an autonomous access decision that bypasses clinical governance; never a replacement of the frozen Programs 1–6.

---

*Ratification of this amended charter authorizes only the move to the Program 7 Architecture Review. No implementation
is authorized until a phase design of record is separately approved.*
