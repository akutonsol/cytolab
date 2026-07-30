# Program 6 · Phase 6E — Human Review Workflow — DESIGN APPROVED (implementation target)

**Status:** **DESIGN APPROVED (2026-07-30).** Eleven preflight decisions + six additional constraints recorded below.
**Implementation NOT yet authorized** — this is the approved design of record a future authorized implementation
follows. References — never modifies — the frozen Program 5 clinical path, the accepted Program 6A registry
(`p6-6a-accepted → 391dcd8`), 6B datasets (`p6-6b-accepted → 1c27092`), 6C inference engine + immutable
`InferenceRecord` (`p6-6c-accepted → 1e31c4f`), and 6D explainability (`p6-6d-accepted → b20a69c`), and stays additive.
Charter: [`PROGRAM_6_CHARTER.md`](./PROGRAM_6_CHARTER.md). Preflight baseline:
`origin/feat/program-6-ai-foundation` @ `cac7a05`.

**Governing principle (charter §2):** *The human owns the diagnosis. AI produces drafts/assists only; a pathologist
accepts, rejects, or modifies.* 6E records the human's decision **about** AI output as a **separate downstream
evidence layer** — it is **not** the authoritative diagnosis and never touches the clinical sign-out path.

---

## 1. Scope (6E only)
A governed **Human AI Review** subsystem attached to a completed 6C `InferenceRecord`. It records which AI inference
was reviewed, which explainability evidence was available/consulted, which authenticated human reviewed it, whether the
human **accepted / rejected / modified** the AI-assisted finding, and the immutable provenance + timing of that
decision. **6E does not produce the authoritative diagnosis** — it is a separate human-decision evidence layer. No
clinical-workflow integration, no automation, no worker; manual, human-initiated actions only.

## 2. Recorded governance decisions
1. **6E produces a governed Human AI Review record** attached to a completed `InferenceRecord`: the reviewed inference,
   the available/consulted explainability evidence, the authenticated human reviewer, the accept/reject/modify
   decision, and immutable provenance/timing. It is a **separate human-decision evidence layer**, not the diagnosis.
2. **Separate from clinical sign-out.** 6E may **reference** but must **never modify** `ResultSheet`,
   `ResultSheet.authorized`/`authorizedById`, `Record.status`, `RecordStatusEvent`, `AiDraft`, final report text, or
   clinical authorization state. An `ACCEPT` means only *"the human accepted the AI output for this AI-review record"* —
   it does **not** mean case signed out / diagnosis finalized / result authorized / report approved / AI output became
   clinical truth. **No automatic bridge from 6E to clinical sign-out is authorized.**
3. **Human ownership enforced structurally.** Every decision requires an **authenticated human actor** as a **non-null
   FK to `User`, `ON DELETE RESTRICT`**. A decision may **not** be created by an AI adapter, worker, scheduler, system
   actor, unauthenticated service account, or automatic event handler. The service derives the reviewer identity from
   **authenticated request context** — a client-supplied reviewer id is never accepted as authority. The system never
   creates, infers, or preselects a human decision.
4. **Decision model** — immutable enum `{ ACCEPT, REJECT, MODIFY }`. Each submitted decision is **append-only**; a
   change of mind creates a **new** immutable decision row; earlier decisions stay visible in history. The current
   *effective* decision is **derived** from the latest valid decision — never by rewriting prior rows.
5. **Request/assignment stage separated from the immutable decision log.** A **mutable** `HumanReviewRequest`
   (`PENDING → ASSIGNED → COMPLETED → CANCELLED`) carries operational routing state; the `HumanReviewDecision[]` rows
   are immutable. One request may accrue multiple decisions; assignment grants no clinical authority; cancellation must
   not delete submitted decisions; reopening is a governed new opportunity/state transition that never alters prior
   decisions. (The split prevents queue/assignment state from contaminating clinical decision evidence.)
6. **`MODIFY` content** is a bounded, structured **AI-review finding — not a clinical diagnosis or report**: coded
   finding identifiers, structured numeric/categorical values, and bounded structured notes only where operationally
   necessary. **No** unrestricted report narrative, patient demographics, copied slide pixels, raw PHI payload, or any
   field named/representing a final diagnosis. Prefer **structured child rows over arbitrary JSON**. Free-text is
   excluded, or tightly limited to a short review rationale — never a parallel pathology-reporting system.
7. **Eligibility & inherited provenance.** Only an `InferenceRecord` with `outcome = SUCCEEDED` may enter review;
   FAILED/timed-out/incomplete are ineligible. The review immutably **inherits** `labId`, the originating inference
   identity, `validationOnly`, and (where needed for provenance) the model lifecycle state at run. A validation-only
   inference → review stays **validation-only** and can never be represented as clinical approval. Explainability is
   optional assistance, not a prerequisite.
8. **Explainability provenance (optional).** A decision may reference the exact immutable 6D
   `ExplainabilityGeneration` (or selected artifacts) the human consulted — **same lab, same `InferenceRecord`,
   immutable, `ON DELETE RESTRICT`**. It must **not** imply explainability proves correctness; its absence must not
   prevent review.
9. **Permissions** `review:view` / `review:request` / `review:assign` / `review:submit` / `review:manage` — **no
   default grant**. `view` ⊉ submission; `request` opens workflow only; `assign` controls assignment; `submit` permits
   a human decision; `manage` governs administrative workflow actions only. `review:manage` must **never** permit
   rewriting decisions, impersonating reviewers, changing the recorded actor, converting a review into clinical
   authorization, or deleting immutable decision history. Seed defaults remain **empty** in 6E.
10. **Trigger surface — all actions explicitly human-initiated:** manual request creation, manual assignment, manual
    human submission. **Not** approved: automatic review creation from inference completion, AI-generated decisions,
    scheduled/worker-submitted decisions, event-driven acceptance, automatic clinical escalation, automatic sign-out.
    **No worker is needed for 6E.**
11. **Audit & immutability.** Decisions form an **append-only** evidence log; each records at least: immutable decision
    identity, review-request identity, `InferenceRecord` identity, reviewer `User` identity, decision enum, inherited
    `validationOnly`, submitted timestamp, structured correction (digest/content) where applicable, optional
    explainability-generation reference, and an immutable event/audit identity. **No update/delete route** for
    submitted decisions. Administrative request-state changes are themselves auditable.

## 3. Additional required constraints
- **No support inference.** 6E never mutates `InferenceRecord`, `InferenceEvent`, explainability generations/artifacts,
  model-registry state, dataset state, the inference result digest/reference, or lifecycle approval state. The review is
  downstream evidence only.
- **No support clinical authorization.** 6E never mutates `ResultSheet`, `Record`, `AiDraft`, report authorization,
  final diagnosis, or case status. Any future AI-review ↔ clinical-sign-out integration requires a **separate governed
  phase and explicit authorization**.
- **Lab & subject isolation.** Every request and decision is lab-scoped; cross-lab references (inference records, users/
  assignments where tenancy applies, explainability generations, related slides) **fail closed**.
- **Concurrency.** Multiple immutable decisions may coexist, each preserved; the **effective** decision is a
  deterministic ordering (submission sequence / timestamp + immutable id) — **never** "last-write-wins" mutation of a
  single row. A one-reviewer-at-a-time policy is enforced at the **mutable request/assignment layer**, never by
  weakening decision immutability.
- **Clinical-terminology guardrail.** Avoid fields named `finalDiagnosis`, `diagnosis`, `authorized`,
  `approvedDiagnosis`, `clinicalTruth`, `confirmedCorrect`, `signOut`, `clinicalConfidence`. Use `reviewDecision`,
  `modifiedFinding`, `reviewRationale`, `effectiveReviewDecision`. (The schema must not suggest authority it lacks.)
- **Gate carry-forward.** `fetch-depth: 0` lineage checkout; exact-head + lineage verification; persisted-state
  assertions vs DB truth; explicit install+verify of any raw-SQL-only invariant (else standard datamodel
  reconstruction); focused 6E tests; Programs 5 + 6A–6D non-regression; strict TypeScript.

## 4. Schema (net-new; additive migration; lab-scoped; immutable-by-idiom; reference-not-copy)
All tables: `labId String` + `@@index([labId])` (auto-tenancy); provenance FKs `onDelete: Restrict`; permanent UUIDs.
Deliberately uses `reviewDecision`/`modifiedFinding`/`reviewRationale` terminology — never clinical-authority names.

- `enum HumanReviewRequestState { PENDING ASSIGNED COMPLETED CANCELLED }` *(mutable workflow routing — Decision 5)*
- `enum HumanReviewDecisionType { ACCEPT REJECT MODIFY }` *(immutable — Decision 4)*

- **`HumanReviewRequest`** (mutable routing, NOT clinical truth): `id`, `requestUuid @unique @default(uuid)`, `labId`,
  `inferenceRecordId → InferenceRecord (Restrict)`, `state HumanReviewRequestState @default(PENDING)`,
  `assigneeUserId? → User (Restrict)`, `validationOnly Boolean` *(inherited)*, `createdById?` (no FK — machine/actor
  provenance), `createdAt`, `updatedAt`. State transitions are auditable; cancellation never deletes decisions.

- **`HumanReviewDecision`** (immutable, append-only — Decisions 3/4/11): `id`, `decisionUuid @unique @default(uuid)`,
  `labId`, `requestId → HumanReviewRequest (Restrict)`, `inferenceRecordId → InferenceRecord (Restrict)`,
  **`reviewerUserId → User (Restrict)`** *(NON-NULL — Decision 3; identity from authenticated context)*,
  `reviewDecision HumanReviewDecisionType`, `validationOnly Boolean` *(inherited immutably — Decision 7)*,
  `modelLifecycleStateAtReview AiModelLifecycleState?` *(provenance)*, `reviewRationale String?` *(SHORT bounded
  rationale only — no report narrative, no PHI; may be omitted per Decision 6)*, `correctionDigest String?`
  *(sha256 over the structured `modifiedFinding` rows, when MODIFY)*, `explainabilityGenerationId? →
  ExplainabilityGeneration (Restrict)` *(optional consulted evidence — Decision 8)*, `eventId String` *(immutable audit
  identity)*, `submittedAt DateTime @default(now())`. **No update/delete path.**

- **`HumanReviewModifiedFinding`** (structured MODIFY content — Decision 6; child rows, not JSON): `id`, `labId`,
  `decisionId → HumanReviewDecision (Restrict)`, `findingCode String` *(coded — never a diagnosis name)*,
  `valueCode String?` *(coded categorical)*, `valueNum Float?` *(structured numeric)*, `ordinal Int`, `createdAt`.
  No PHI, no free-text narrative, no `finalDiagnosis`/`diagnosis` field.

- **`HumanReviewRequestEvent`** (append-only audit of mutable request-state changes — Decision 11): `id`, `labId`,
  `requestId → HumanReviewRequest (Restrict)`, `fromState HumanReviewRequestState?`, `toState HumanReviewRequestState`,
  `actorId?` (no FK), `eventId String`, `occurredAt DateTime @default(now())`. No update/delete path.

## 5. Human-ownership, immutability & effective-decision (Decisions 3/4/11 + concurrency)
The reviewer is a **non-null `User` FK (`RESTRICT`)** derived from the authenticated principal — never the request
body. Decisions are append-only; a correction is a **new** decision row. The **effective** decision is derived as the
latest by `(submittedAt, decisionUuid)` deterministic ordering — never by mutating a row. One-reviewer-at-a-time (if
desired operationally) is enforced on `HumanReviewRequest.state`/`assigneeUserId`, not on the decision log. No service
method updates or deletes a submitted decision or a modified-finding row.

## 6. Eligibility, provenance inheritance & no-support boundaries (Decisions 2/7 + §3)
A request/decision is accepted only for a `SUCCEEDED` `InferenceRecord` (service-enforced, lab-scoped → cross-lab fails
closed). `labId` + `validationOnly` (+ lifecycle state where needed) are **inherited immutably**; a validation-only
review can never be represented as clinical approval. 6E writes **nothing** to `InferenceRecord`/6C/6D/6A/6B **or** to
`ResultSheet`/`Record`/`AiDraft`/clinical authorization (no support inference; no support clinical authorization).

## 7. Permissions (new `review` namespace; no default grant)
Add to `SPECIAL_OBJECTS`: `review: ['view', 'request', 'assign', 'submit', 'manage']` — no default-role grant
(super-role reach only), mirroring `aimodel:*`/`dataset:*`/`inference:*`/`explainability:*`. `submit` (a human
decision) distinct from `view`/`request`/`assign`; `manage` is administrative only and **never** rewrites decisions,
changes the recorded actor, converts a review into clinical authorization, or deletes decision history.

## 8. PHI, claims & clinical boundary (reference-not-copy; assists-not-authority)
Records/slides/inferences referenced by **id only**; MODIFY content is coded/structured (no PHI, no report narrative);
rationale is short/bounded or omitted. No column names or values assert diagnosis, authorization, correctness, or
clinical confidence (terminology guardrail). The authoritative diagnosis remains solely the existing `ResultSheet`
authorization / `Record` status — untouched by 6E.

## 9. Trigger surface (Decision 10)
Manual, permissioned operations only: `review:request` (create), `review:assign` (assign), `review:submit` (a human
decision). No worker, no scheduler, no automatic/event/inference-completion trigger, no auto clinical escalation/sign-out.

## 10. Migration & dependencies
One additive timestamped migration (2 enums + ~4 tables + indexes + `Restrict` FKs). Prefer plain validated
structured columns (no raw-SQL-only invariant expected; if one is introduced, the gate installs + verifies it — the 6C
lesson). **No change** to any Program 5 / 6A / 6B / 6C / 6D model or the clinical `Record`/`ResultSheet`/`AiDraft`;
**no new runtime dependency**. Additive-only.

## 11. Acceptance design (folded gate; run only under a future authorization)
`scripts/seed-human-review-acceptance.ts` + `scripts/assert-human-review-state.ts` + a `p6-human-review-acceptance.yml`
gate (registered byte-identically on `main` under its own authorization; **checkout `fetch-depth: 0`**). Persisted-truth
assertions: additive schema (enums/tables/columns/RESTRICT FKs); reviewer is a **non-null `User` FK RESTRICT** (human
ownership); a client-supplied reviewer id is ignored (identity from context); SUCCEEDED-only eligibility; `validationOnly`
inherited immutably; append-only decisions (no update/delete path; correction = new decision; prior untouched);
effective-decision derived by deterministic ordering; request/decision separation (cancellation preserves decisions;
request-state changes audited); MODIFY = structured coded child rows (no PHI, no diagnosis field); optional
explainability reference RESTRICT + same-record/lab; **no support inference** (InferenceRecord/6C/6D/6A/6B untouched);
**no support clinical authorization** (ResultSheet/Record/AiDraft untouched); no prohibited clinical-terminology columns;
permission separation + no default grant; tenancy + cross-lab fail-closed; Program-5/6A/6B/6C/6D non-regression; strict
TypeScript.

## 12. Explicitly NOT in 6E
authoritative diagnosis / clinical sign-out / result authorization · any write to `ResultSheet`/`Record`/`AiDraft` ·
automatic review creation / AI-authored decisions / workers / schedulers / event triggers · full clinical report
narrative or free-text diagnosis · validation metrics / accuracy / calibration (6F) · continuous evaluation (6G) ·
clinical-performance reporting (6H) · any mutation of Program 5 or accepted 6A/6B/6C/6D.

## 13. Verdict
**PROGRAM 6 · PHASE 6E — DESIGN APPROVED**, eleven decisions + six additional constraints recorded (§2–§3).
Implementation is authorized only by a subsequent explicit instruction; this document is the design of record it follows.
