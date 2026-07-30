# Program 6 · Phase 6E — Human Review Workflow — Acceptance Closeout

**Status:** **ACCEPTED · FROZEN.** The governed **Human AI Review** evidence layer only — *the human owns the
diagnosis*. Records a pathologist's ACCEPT/REJECT/MODIFY decision **about** a completed (`SUCCEEDED`) 6C
`InferenceRecord`, as an immutable append-only decision with authenticated human provenance — **separate from, and
never modifying, the authoritative clinical sign-out** (`ResultSheet`/`Record`/`RecordStatusEvent`/`AiDraft`). A mutable
`HumanReviewRequest` carries operational routing; the immutable `HumanReviewDecision` rows carry the human's decision
(change of mind = a NEW decision; the effective decision is DERIVED, never rewritten). No support inference; no support
clinical authorization; no diagnostic/correctness claim; no PHI. A parallel subsystem that references the frozen
Program 5 clinical path, the accepted Program 6A registry, 6B datasets, 6C inference engine, and 6D explainability,
and modifies none of them. Charter: [`PROGRAM_6_CHARTER.md`](./PROGRAM_6_CHARTER.md) · Design of record:
[`PROGRAM_6_6E_DESIGN.md`](./PROGRAM_6_6E_DESIGN.md).

---

## 1. Accepted scope
- **A downstream human-decision evidence layer** over a `SUCCEEDED` `InferenceRecord`. `ACCEPT` means only *the human
  accepted the AI output for this AI-review record* — never case signed out / diagnosis finalized / result authorized.
- **Separate from the clinical sign-out** — references but never modifies `ResultSheet`/`Record`/`RecordStatusEvent`/
  `AiDraft` or any clinical authorization state. No automatic bridge to sign-out.
- **Human ownership enforced structurally** — the reviewer is a **non-null `User` FK (`ON DELETE RESTRICT`)** taken
  from the **authenticated principal**, never the request body; no AI/worker/scheduler/system/event path may author a
  decision.
- **Immutable, append-only decisions** `{ ACCEPT, REJECT, MODIFY }` — a change of mind is a new row; the **effective**
  decision is derived by deterministic ordering `(submittedAt, decisionUuid)`, never by rewriting a row. **No
  update/delete route.**
- **Request/decision separation** — a mutable `HumanReviewRequest` (`PENDING → ASSIGNED → COMPLETED → CANCELLED`)
  carries routing; **`COMPLETED`/`CANCELLED` are terminal to submission** — a later decision requires the governed
  reopen transition first, which records its own append-only event. Completion is represented once (`completedAt`
  preserved across reopen→recomplete cycles); cancellation never deletes decisions.
- **Decision snapshot integrity** (Guardrail 1) — each decision immutably records the reviewed model-version identity,
  result digest, lifecycle state, and inherited `validationOnly`, so it never depends on mutable downstream lookups.
- **`MODIFY` content** is structured coded child rows (`HumanReviewModifiedFinding`) + a deterministic
  `correctionDigest` — **no PHI, no report narrative, no diagnosis field**; `ACCEPT`/`REJECT` may not carry findings.
- **Eligibility & inheritance** — only a `SUCCEEDED` inference record is eligible (FAILED/incomplete rejected);
  `labId` + `validationOnly` inherited immutably; a validation-only review can never be represented as clinical
  approval.
- **Explainability provenance** (Guardrail 2, optional) — a decision may reference a 6D `ExplainabilityGeneration`
  that belongs to the **same inference record + lab** (cross-record fails closed); it never implies correctness.
- **Permissions** `review:view` / `review:request` / `review:assign` / `review:submit` / `review:manage` — granted to
  **no default role**; `submit` (a human decision) distinct from `view`/`request`/`assign`; `manage` is administrative
  only (reopen/cancel) and **never** rewrites decisions or grants clinical authority. **No decision-mutation route.**
- **Manual, human-initiated only** — no worker, scheduler, automatic/event/inference-completion trigger, or auto
  sign-out.
- **All Program 6E provenance foreign keys use `ON DELETE RESTRICT`** (12 FKs). **No support inference** (never
  mutates `InferenceRecord`/6C/6D/6A/6B); **no support clinical authorization** (never mutates the clinical path).

## 2. Accepted implementation lineage
| SHA | Meaning |
|---|---|
| `cb1378d` | Program 6E design-of-record baseline (eleven decisions + six constraints + three guardrails) |
| `8d91c41` | 6E implementation candidate (schema + migration + module + specs + seed permission) |
| `e0227a3` | **terminal-state reconciliation** — reject decisions on `COMPLETED`/`CANCELLED`; require the governed reopen first (Guardrail 3 boundary) |
| `71efc5c` | final exact-head candidate (acceptance gate + seed/assert scripts; product unchanged from `e0227a3`) |

The implementation is unchanged from `e0227a3`: `git diff e0227a3 71efc5c` touches **0 product files** — the delta is
the acceptance gate (workflow + two scripts + `apps/web/acceptance/.gitignore`). 6E is **purely additive** — no
accepted-phase test required modification. (The `8d91c41 → e0227a3` reconciliation was a narrow, governance-directed
two-file correction: the terminal-state submission guard + its integration test; it changed no schema, migration,
permission, or controller.)

**CI infrastructure commits (recorded separately — NOT part of the accepted implementation lineage):**
| SHA (on `main`) | Meaning |
|---|---|
| `639d5af` | 6E gate registration on `main` (default-branch `workflow_dispatch` registration; byte-identical blob `c71deba` to branch copy `71efc5c`) |

This `main` commit is **CI registration infrastructure only** — byte-identical to the Program 6 branch copy, no
product/schema/runtime change.

## 3. Authoritative acceptance evidence
- **Workflow:** `p6-human-review-acceptance`
- **Run number:** `1` · **Run ID:** `30567815696`
- **Event:** `workflow_dispatch` · **Branch:** `feat/program-6-ai-foundation`
- **Exact tested SHA:** `71efc5c` (run header + in-run `git rev-parse HEAD == github.sha`, and
  `git merge-base --is-ancestor e0227a3 HEAD` — the lineage proof — satisfied)
- **Conclusion:** `success`

Accepted results:
- human-review tables: **4** (`HumanReviewRequest`, `HumanReviewDecision`, `HumanReviewModifiedFinding`, `HumanReviewRequestEvent`) · enums: **2** (`HumanReviewRequestState`, `HumanReviewDecisionType`)
- provenance foreign keys: **12, all `RESTRICT`** (incl. the non-null reviewer `User` FK)
- persisted-state assertions: **all passed** (non-null authenticated reviewer + reviewer-not-from-body, SUCCEEDED-only eligibility, validation-only inheritance, snapshot integrity, structured MODIFY + digest, ACCEPT/REJECT reject findings, append-only decisions, deterministic effective decision, terminal-state submission rejection + governed reopen + completedAt preservation + append-only request events, same-record explainability, tenancy + cross-lab fail-closed, permission separation + no default grant, no decision-mutation route, no support inference, no support clinical authorization, no clinical-terminology/PHI columns, Program-5/6A-6D non-regression)
- focused human-review tests: **20/20** (3 suites)
- Program-5 / 6A-6D non-regression tests: **94/94** (17 suites)
- TypeScript: **zero errors** (strict `npx tsc --noEmit -p tsconfig.json`, exit 0)
- evidence artifact: **`p6-6e-human-review-acceptance`** generated (schema SQL + fixtures)

**Gate note:** 6E introduces **no** raw-SQL migration-only invariant (plain validated structured columns), so — like the
6D gate — there is **no** explicit raw-index install step; the from-datamodel reconstruction produced the complete
schema, and persisted-state assertions verified the workflow boundaries against DB truth.

## 4. Frozen reconciliation decisions
- Human review is **downstream evidence only** — it never becomes the authoritative diagnosis, clinical sign-out,
  result authorization, ground truth, or model evaluation.
- The reviewer is an **authenticated human** (non-null `User` FK); the system never authors, infers, or preselects a
  decision.
- `COMPLETED`/`CANCELLED` are **terminal to submission**; later human review flows only through the governed reopen
  transition; the original completion timestamp is never overwritten.
- Any future AI-review ↔ clinical-sign-out integration requires a **separate governed phase and explicit
  authorization**.
- **Program 5 remains immutable; accepted Program 6A, 6B, 6C, and 6D remain unmodified.**

## 5. Deferred scope (NOT in Phase 6E)
authoritative diagnosis / clinical sign-out / result authorization · any write to `ResultSheet`/`Record`/`AiDraft` ·
automatic review creation / AI-authored decisions / workers / schedulers / event triggers · full clinical report
narrative or free-text diagnosis · validation metrics / accuracy / calibration (6F) · continuous evaluation (6G) ·
clinical-performance reporting (6H) · any mutation of Program 5 or accepted 6A/6B/6C/6D.

## 6. Freeze statement
**Program 6 · Phase 6E is immutable at `71efc5c`.** Future work must reference the accepted Phase 6E human-review
foundation rather than modifying its accepted historical baseline. Corrections require a separately governed amendment.
