# Program 7 — Enterprise IAM — CROSS-PROGRAM BOUNDARY REVIEW (v1)

**Status:** Governance analysis — **for review**. Authorized by the approved Program 7 Architecture Review.
**No schema, APIs, or implementation are proposed or authorized here.** Purpose: prove that Enterprise IAM, as bounded
by the ratified charter (v1.2) and the approved architecture, **cannot encroach upon** (1) clinical authority
(Programs 1–5), (2) AI governance (Program 6), (3) laboratory tenancy, (4) immutable evidence, or (5) any previously
established governance boundary — and to resolve **D6** (hybrid-tenancy reconciliation). It also states the
**encroachment tests** a future acceptance gate must enforce (governance intent, not implemented now).

Charter: [`PROGRAM_7_CHARTER.md`](./PROGRAM_7_CHARTER.md) · Architecture:
[`PROGRAM_7_ARCHITECTURE_REVIEW.md`](./PROGRAM_7_ARCHITECTURE_REVIEW.md).

---

## 1. Method
For each protected boundary: name the authority it protects, state the **structural invariant** that prevents IAM
encroachment, name the **charter principle** that mandates it, and give the **verifiable encroachment test** (mirroring
the Program 6 "no-support" persisted-assertion discipline). "Verifiable" means a future folded acceptance gate can
assert it against real code/DB truth — exactly as Programs 5–6 proved their boundaries.

## 2. Boundary A — Clinical authority (Programs 1–5)
- **Protected authority:** diagnosis, result-sheet authorization / sign-out, record status transitions — owned by the
  clinical workflow (`ResultSheet`, `Record`, `RecordStatusEvent`, `AiDraft`, `Patient`).
- **Invariant:** IAM grants **platform access only** and never creates, alters, or infers clinical authority
  (Principles 2, 3). Clinical permission codes (e.g. `resultsheet:authorize`, `record:submit`) remain in the **existing
  catalogue** and gate the clinical action **inside the clinical module**; IAM merely computes whether a principal
  *holds* the code. Holding an administrative or organizational role never implies a clinical permission
  (Org Admin ≠ Medical Director).
- **Encroachment tests:** (a) no Program 7 production code writes `ResultSheet`/`Record`/`RecordStatusEvent`/`AiDraft`/
  `Patient`; (b) no IAM construct performs sign-out/authorization/diagnosis; (c) no IAM role or Organization membership
  grants a clinical permission code by identity alone.

## 3. Boundary B — AI governance (Program 6)
- **Protected authority:** model lifecycle (`aimodel:promote`), inference, validation, continuous evaluation, clinical
  performance — owned by the P6 modules under their frozen no-support boundaries.
- **Invariant:** IAM never grants AI-approval authority and never mutates any P6 evidence (Principles 2, 3). AI
  permission codes (`aimodel:*`, `inference:*`, `validation:*`, `clinicalperf:*`, …) remain **P6-owned** and gate P6
  actions; enterprise RBAC computes *access* to those codes but never performs the AI action or overrides P6
  governance.
- **Encroachment tests:** (a) no Program 7 production code mutates `AiModelVersion` lifecycle or any P6 evidence table;
  (b) no IAM construct promotes/retires a model or writes inference/validation/clinical-perf evidence; (c) the frozen
  P6 tags remain immutable (Program 7 amends nothing in Programs 1–6).

## 4. Boundary C — Laboratory tenancy
- **Protected authority:** operational data isolation — `labId` + `LabContext` (`AsyncLocalStorage`) + the Prisma
  `tenancyExtension`, with `labId` sourced only from the JWT.
- **Invariant (Principle 4):** Organizations are an **administrative overlay above `Lab`** and are **never consulted by
  the tenancy layer**; `labId` remains the sole isolation anchor. Enterprise hierarchy influences *who may administer
  which labs* (authorization scoping), never *what data is isolated*. Cross-lab administrative actions are explicit and
  audited (`organizationScope = CROSS_LAB`); there is no implicit ambient cross-lab access from Organization
  membership.
- **Encroachment tests:** (a) `tenancyExtension`/`LabContext`/`scopeArgs` behaviour is unchanged and never keys
  isolation off an Organization; (b) Organization models never appear as an isolation key in `TENANT_MODELS`/scoping;
  (c) any cross-lab admin path opens an explicit scoped context and emits a `CROSS_LAB` audit event.

## 5. Boundary D — Immutable evidence
- **Protected authority:** the append-only, hash-chained `AuditEvent` ledger (`AuditChainHead`/`AuditChainSeal`,
  CHECK-constrained) and every append-only Program 5/6 evidence table (`onDelete: Restrict`).
- **Invariant (Principle 5):** identity-governance events (7G) are **additive, append-only emitters on the same
  ledger**; IAM never mutates or deletes prior audit or P5/P6 evidence, and never creates a second audit chain.
- **Encroachment tests:** (a) identity-governance events are written via the existing `AuditRecorder` + chain;
  (b) no update/delete of prior `AuditEvent` or P5/P6 evidence; (c) a single immutable evidence chain (no parallel
  ledger); (d) metadata stays id/name-free per the existing pattern.

## 6. Boundary E — Domain-truth boundary (Principle 10)
- **Protected authority:** domain systems of record — pathology credentials, employment status, medical licensing,
  laboratory accreditation, AI governance, clinical-workflow state.
- **Invariant:** IAM asserts only *who / how-authenticated / current-permissions*; it is **never** the authoritative
  source for domain truth. Those facts remain owned by their domains; IAM may reference them but never becomes their
  system of record.
- **Encroachment test:** no Program 7 model becomes the authoritative store for a domain fact owned elsewhere (e.g. no
  IAM-owned "is licensed" / "is accredited" / "is board-certified" authority column that clinical decisions read as
  truth).

## 7. Boundary F — Principal-class boundary (Principle 11)
- **Protected authority:** the separation of human vs non-human (service) principals.
- **Invariant:** service/machine principals are a distinct class and can never acquire clinical, diagnostic, sign-out,
  or AI-approval authority.
- **Encroachment test:** a non-human principal is never treated as a human user and never holds/executes a clinical or
  AI action authority (exact runtime rule refined at phase design; the class boundary is fixed now).

## 8. D6 resolution — hybrid-tenancy reconciliation
Two **orthogonal** axes, owned by different layers and never conflated:
- **Axis 1 — Data isolation (platform-owned):** `labId` + `tenancyMode POOL|SILO` + `databaseSecretRef` + `dataRegion`
  + `LabDomain`. This is the *isolation mechanism*; it stays exactly as the target-platform/hybrid-tenancy work defines
  it and is enforced at the data layer (`tenancyExtension`).
- **Axis 2 — Administrative grouping (IAM-owned):** the Organization overlay (7D). This is an *administrative scoping*
  construct for delegation and access administration.

**Resolution:** Axis 2 **never determines or overrides** Axis 1. A lab's tenancy mode / region / domain is a platform
property; an Organization grouping labs is an administrative property. The **Control Center** control plane and the
**Organization** overlay operate on the *same labs* but for *different concerns* (control-plane operations vs. IAM
administrative scoping); **neither redefines `labId` isolation**, and data isolation is never keyed off Organization
membership. Whether a Control-Center grouping and an IAM Organization are the *same object* or *linked-but-distinct* is
a Phase 7D / platform design question — constrained now by the invariant that isolation stays platform-owned and
Organization stays administrative. **D6 is resolved at the boundary level; the detailed model is deferred to Phase 7D
under this constraint.**

## 9. Encroachment-test summary (governance intent for future acceptance gates)
A Program 7 phase acceptance gate must assert, against real code/DB truth:
1. **No clinical-path writes** — 0 Program 7 production writes to `ResultSheet`/`Record`/`RecordStatusEvent`/`AiDraft`/
   `Patient`.
2. **No AI-evidence mutation** — 0 Program 7 writes to `AiModelVersion` lifecycle or any P6 evidence table.
3. **Tenancy unchanged** — `tenancyExtension`/`LabContext` behaviour intact; Organization never an isolation key.
4. **Single immutable ledger** — identity events append-only on `AuditEvent`; no mutation/deletion of prior evidence;
   no second chain.
5. **No authority-by-identity** — no IAM role/Organization grants a clinical or AI action authority by identity alone;
   clinical/AI codes remain owned by their catalogues.
6. **Principal-class separation** — non-human principals hold no clinical/AI action authority.
7. **No domain-truth capture** — no IAM model becomes the authoritative source for a domain fact owned elsewhere.
8. **Programs 1–6 immutable** — no Program 7 change amends any frozen 1–6 commit/tag/schema/closeout.

These are the Program-7 analogue of the Program-6 "no-support" assertions and will be bound into each phase's folded
acceptance gate.

## 10. Determination
Under the charter (v1.2) and the approved architecture, Enterprise IAM **cannot** encroach upon clinical authority, AI
governance, laboratory tenancy, immutable evidence, the domain-truth boundary, or any prior governance boundary; the
invariants are structural and the encroachment tests are verifiable. **D6 is resolved** at the boundary level
(orthogonal isolation vs. administrative axes). **Recommendation:** proceed to the **Program 7 Guardrails & Governance
Decisions** stage, where these invariants + encroachment tests are ratified as immutable governance decisions and the
phase-assigned decisions (D1/D2 → 7C, D5 → 7B, D4/D6-detail → 7D) are scheduled.

## 11. What this review does NOT authorize
No schema, migration, API, guard change, or implementation. The Guardrails & Governance Decisions stage is **pending
authorization**; Phase 7A design begins only after guardrails are approved.
