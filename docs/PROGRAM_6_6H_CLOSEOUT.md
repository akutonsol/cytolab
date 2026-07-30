# Program 6 · Phase 6H — Clinical Performance — Acceptance Closeout

**Status:** **ACCEPTED · FROZEN.** The governed **Clinical Performance MEASUREMENT Evidence** subsystem only —
*measurement, never clinical authority.* Immutable `ClinicalPerfWindow`s bind one eligible `AiModelVersion` to an
explicit time window + cohort and aggregate its accepted **6C `InferenceRecord`** + **6E `HumanReviewDecision`**
evidence into immutable, structured `ClinicalPerfMetric` measurements — workload count/throughput, reader agreement,
concordance (both **consistency, never correctness**), with review/turnaround duration reported `UNAVAILABLE` and
workload-reduction as `SYNTHETIC_STUB`. The default evaluator is a **deterministic, non-clinical stub**. 6H is
**manual-trigger only** (no worker/scheduler/hook), **measures but never asserts** clinical validity, safety,
effectiveness, or regulatory standing (**no support diagnostic authority**), issues **no recommendation** (Guardrail 5),
treats Program 5 as **read-only coded operational metadata** with its **narrative structurally unreachable** (Guardrail
1), and mutates no 6A–6G, dataset, inference, human-review, or clinical state. A parallel evidence subsystem that
references the frozen Program 5 clinical path and the accepted 6A–6G baselines and modifies none of them. Charter:
[`PROGRAM_6_CHARTER.md`](./PROGRAM_6_CHARTER.md) · Design of record: [`PROGRAM_6_6H_DESIGN.md`](./PROGRAM_6_6H_DESIGN.md).

---

## 1. Accepted scope
- **Governed clinical-performance-MEASUREMENT-evidence architecture** — immutable windows + immutable dual-source
  membership snapshots + structured measurements + a deterministic non-clinical stub. **Measurement only:** **no**
  clinical validity/safety/effectiveness/regulatory/diagnostic claim; prohibited terminology
  (`clinicallyValid`/`FDACleared`/`diagnosticAccuracy`/`superiorTo`/`certified`/`diagnosis`/`correct`) is structurally
  absent from the schema.
- **The AI never creates the diagnosis** — 6H measures the human-owned clinical process; it **never** creates/alters a
  diagnosis, sign-out, authorization, model lifecycle, inference, validation, or continuous-eval record (**no support
  diagnostic authority**). Model version, inference records, and human-review decisions are **byte-identical** after a
  measurement.
- **Window inputs + snapshots** — each window binds one `AiModelVersion` + lab + explicit time window + cohort,
  snapshots model identity (`modelVersionUuid`/`modelUuid`/lifecycle-at-run), **time basis + window-definition version**,
  the **exact eligible member population as immutable member rows** (Guardrail 3), config as digests, and an optional
  same-lab/**same-model-version** 6F `ValidationRun` baseline (Guardrail 4); all provenance FKs `RESTRICT`; cross-lab
  fails closed.
- **Dual-source membership** — each `ClinicalPerfWindowMember` references **exactly one** governed AI-evidence object —
  a 6C `InferenceRecord` or a 6E `HumanReviewDecision` — **never** a Program-5 clinical/narrative object
  (`ResultSheet`/`Record`/`RecordStatusEvent`/`AiDraft`/`Patient`/`SlideAnnotation` are structurally unreferenced;
  Guardrail 1).
- **Provenance separation** (Guardrail 2) — every metric carries `OBSERVED` / `SYNTHETIC_STUB` / `UNAVAILABLE`;
  reader-agreement + concordance are `OBSERVED` **consistency** measures (modal-decision fraction / ACCEPT fraction),
  explicitly **not correctness**; workload-reduction is `SYNTHETIC_STUB` only; review/turnaround duration are
  `UNAVAILABLE` (timing not read) with a null value + reason; **no fabricated production signal**.
- **Truthful empty/sparse windows** — real `sampleCount` + `coverageStatus` (`EMPTY`/`SPARSE`/`COVERED`); an empty
  window records `WORKLOAD_COUNT` = 0 (a real observation) and marks agreement/concordance `UNAVAILABLE`; **no invented
  numbers**.
- **Cohort separation** (Decision 10) — `CLINICAL` vs `VALIDATION_ONLY` kept in distinct cohorts (each metric records
  its cohort); no silent mixing.
- **Reference-only Program-5 operational boundary** (Decision 4 / Guardrail 1) — `operationalDataUsed` truthfully
  records whether reference-only Program-5 **coded** operational metadata was read; it defaults to `false`, and the
  Program-5 **narrative is structurally unreachable** from every 6H model.
- **Structured immutable measurements** — child entities (`ClinicalPerfMetric`), never JSON blobs; validated numeric
  bounds (agreement/concordance/reduction in [0,1], counts/durations ≥ 0; `UNAVAILABLE` ⇒ null + reason).
- **No recommendation entity** (Guardrail 5) — 6H produces measurements only; there is **no** `ClinicalPerf…
  Recommendation` model and no advisory/lifecycle output.
- **Immutable & append-only** — re-measurement creates a **new**, independent window; nothing is recalculated in place;
  a deterministic `calculationId` + `windowSignature` + explicit `COMPLETE` state support reproducibility, duplicate
  detection, and atomic completeness (invalid evaluator output persists nothing).
- **Eligibility** — model `VALIDATION`/`APPROVED`/`DEPRECATED` (not `DRAFT`/`RETIRED`); members are the human-review
  decisions and terminal-outcome inference records for that model version + cohort in the window.
- **Permissions** `clinicalperf:view` / `clinicalperf:run` / `clinicalperf:manage` — **no default grant**; `run`
  distinct from `view`; **no** evidence-mutation, lifecycle, diagnostic, or recommendation route.
- **All Program 6H provenance foreign keys use `ON DELETE RESTRICT`** (9 FKs). Never mutates 6A–6G, datasets,
  inference, human-review, or the clinical path.

## 2. Accepted implementation lineage
| SHA | Meaning |
|---|---|
| `2f2e072` | Program 6H design-of-record baseline (twelve decisions + claim-boundary foundation + six guardrails) |
| **`9aba652`** | **6H implementation candidate** (schema + additive migration + module + specs + seed permission) |
| `f98b9f1` | final exact-head candidate = **frozen evidence head** (acceptance gate + seed/assert scripts; product unchanged from `9aba652`) |

The implementation is unchanged from `9aba652`: `git diff 9aba652 f98b9f1` touches **0 product files** — the delta is
the acceptance gate (workflow + two scripts + `apps/web/acceptance/.gitignore`; 4 files, +416 lines). 6H is **purely
additive** — no accepted-phase test required modification. This phase required **no reconciliation commit** (approved
for acceptance testing directly from the implementation candidate).

**CI infrastructure commits (recorded separately — NOT part of the accepted implementation lineage):**
| SHA (on `main`) | Meaning |
|---|---|
| `4424ded` | 6H gate registration on `main` (default-branch `workflow_dispatch` registration; byte-identical blob `e08e690` to branch copy `f98b9f1`) |

This `main` commit is **CI registration infrastructure only** — byte-identical to the Program 6 branch copy, no
product/schema/runtime change.

## 3. Authoritative acceptance evidence
- **Workflow:** `p6-clinical-perf-acceptance`
- **Run number:** `1` · **Run ID:** `30585318569`
- **Event:** `workflow_dispatch` · **Branch:** `feat/program-6-ai-foundation`
- **Exact tested SHA:** `f98b9f1` (run header + in-run `git rev-parse HEAD == github.sha`, and
  `git merge-base --is-ancestor 9aba652 HEAD` — the lineage proof — satisfied)
- **Conclusion:** `success`

Accepted results:
- clinical-performance tables: **3** (`ClinicalPerfWindow`, `ClinicalPerfWindowMember`, `ClinicalPerfMetric`) · enums:
  **6** (`ClinicalPerfMetricKind`, `ClinicalPerfEvidenceProvenance`, `ClinicalPerfCohort`, `ClinicalPerfCoverageStatus`,
  `ClinicalPerfMemberSource`, `ClinicalPerfWindowStatus`)
- provenance foreign keys: **9, all `RESTRICT`**
- persisted-state assertions: **all passed** (immutable window + dual-source membership snapshot, model-identity
  snapshot, window-def/time-basis integrity, cohort separation, observed-consistency/synthetic/unavailable separation,
  truthful empty window, baseline compatibility, `operationalDataUsed` truthful + Program-5 narrative unreachable,
  deterministic calculationId + windowSignature, re-measurement = new window, atomic persistence + completion state,
  **no support diagnostic authority** (model/inference/decision byte-identical), claim boundary / no
  correctness-diagnostic-clinical-validity terminology, no recommendation entity, no PHI, permission separation + no
  default grant, no lifecycle/diagnostic/recommendation route, Program-5/6A-6G non-regression)
- focused clinical-perf tests: **19/19** (4 suites)
- Program-5 / 6A-6G non-regression tests: **156/156** (28 suites)
- TypeScript: **zero errors** (strict `npx tsc --noEmit -p tsconfig.json`, exit 0)
- migration: **additive only** (3 CREATE TABLE, 6 CREATE TYPE, 10 CREATE INDEX, 1 CREATE UNIQUE INDEX, 9 ADD
  CONSTRAINT — all `ON DELETE RESTRICT`; **0 destructive statements**)
- evidence artifact: **`p6-6h-clinical-perf-acceptance`** generated (schema SQL + fixtures)

**Gate note:** 6H introduces **no** raw-SQL migration-only invariant (plain additive tables + validated numeric/coded
columns), so — like the 6D/6E/6F/6G gates — there is **no** explicit raw-index install step; the from-datamodel
reconstruction produced the complete schema, and persisted-state assertions verified the evidence boundaries against DB
truth.

## 4. Frozen reconciliation decisions
- Clinical performance is **downstream MEASUREMENT evidence only** — it never becomes a clinical/diagnostic claim, a
  lifecycle action, or an authoritative decision.
- Reader **agreement** and **concordance** are **consistency** measures, **never correctness**; the schema carries no
  correctness/diagnostic-accuracy/clinical-validity column.
- **No support diagnostic authority** — 6H measures the human-owned clinical process; the human owns the diagnosis.
- Program 5 is **reference-only coded operational metadata**; its **narrative is structurally unreachable**; **6H issues
  no recommendation** (Guardrail 5).
- **Program 5 remains immutable; accepted Program 6A, 6B, 6C, 6D, 6E, 6F, and 6G remain unmodified.**

## 5. Deferred scope (NOT in Phase 6H)
any clinical/diagnostic/regulatory validity, safety, or effectiveness claim · any correctness or diagnostic-accuracy
metric · reader agreement/concordance as correctness · any recommendation, advisory, lifecycle transition, retirement,
promotion, or inference disabling · any worker/scheduler/cron/queue/hook trigger · any read of Program-5 narrative/
findings/PHI · any mutation of Program 5 or accepted 6A–6G (including model lifecycle) or the clinical `Record`/
`ResultSheet`/`AiDraft` path · **the formal declaration of Program 6 completion** (a distinct governance milestone
requiring its own review).

## 6. Freeze statement
**Program 6 · Phase 6H is immutable at `f98b9f1`.** Future work must reference the accepted Phase 6H
clinical-performance-measurement-evidence foundation rather than modifying its accepted historical baseline. Corrections
require a separately governed amendment. With 6H frozen, all eight Program 6 phases (6A–6H) are Accepted & Frozen;
**the formal "Program 6 Complete" declaration remains a separate, not-yet-authorized governance milestone.**
