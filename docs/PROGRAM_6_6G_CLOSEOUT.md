# Program 6 · Phase 6G — Continuous Evaluation — Acceptance Closeout

**Status:** **ACCEPTED · FROZEN.** The governed **Continuous Evaluation Evidence** subsystem only — *longitudinal, not
autonomous.* Immutable `EvaluationWindow`s over a model version's 6C inference stream record structured evidence —
inference volume, outcome/failure/timeout rates, latency distributions, drift + calibration-decay (vs an optional
immutable 6F `ValidationRun` baseline), confidence bins (SYNTHETIC_STUB only — 6C exposes no structured confidence),
and **advisory** lifecycle-review recommendations. The default evaluator is a **deterministic, non-clinical stub**.
6G is **manual-trigger only** (no worker/scheduler/hook), **informs but never performs** any lifecycle change (**no
support lifecycle mutation; no automatic retirement**), and mutates no 6A–6F, dataset, inference, or clinical state.
A parallel subsystem that references the frozen Program 5 clinical path and the accepted 6A–6F baselines and modifies
none of them. Charter: [`PROGRAM_6_CHARTER.md`](./PROGRAM_6_CHARTER.md) · Design of record:
[`PROGRAM_6_6G_DESIGN.md`](./PROGRAM_6_6G_DESIGN.md).

---

## 1. Accepted scope
- **Governed continuous-evaluation-evidence architecture** — immutable windows + structured metrics + advisory
  recommendations + a deterministic non-clinical stub. **Not** real clinical performance; **no** retraining/adaptive/
  RL/automatic action.
- **"Continuous" = longitudinal, not autonomous** — repeated immutable windows; current state/trend **derived** from
  them, never stored. **Manual-trigger only** (no worker/scheduler/cron/queue/hook).
- **Model retirement — inform, never perform** — advisory `LIFECYCLE_REVIEW_RECOMMENDED` only; **no** lifecycle
  transition, promotion, deprecation, retirement, or inference disabling (**no support lifecycle mutation; no
  automatic retirement**).
- **Window inputs + snapshots** — each window binds one `AiModelVersion` + lab + explicit time window, snapshots model
  identity, **time basis + window-definition version** (G7), the **exact eligible `InferenceRecord` population as
  immutable member rows** (G1), config as digests, and an optional same-lab/same-model-version 6F `ValidationRun`
  baseline (G3); all provenance FKs `RESTRICT`; cross-lab fails closed.
- **Provenance separation** (G2) — every metric carries `OBSERVED` / `SYNTHETIC_STUB` / `UNAVAILABLE`; confidence bins
  are `SYNTHETIC_STUB` only; drift/calibration are `UNAVAILABLE` without a compatible baseline; **no fabricated
  production signal**.
- **Truthful empty/sparse windows** — real `sampleCount` + `coverageStatus` (`EMPTY`/`SPARSE`/`COVERED`); unavailable
  metrics carry a null value + reason; **no invented numbers**; recommendations issue only on `COVERED` evidence.
- **Cohort separation** (G9/Decision 10) — `validationOnly` vs ordinary inference kept in distinct cohorts (each metric
  records its cohort); no silent mixing.
- **Structured immutable metrics** — child entities (`EvaluationMetric`), never JSON blobs; validated numeric bounds
  (rates/coordinates in [0,1], counts/latency ≥ 0).
- **Advisory isolation** (G4/G11) — recommendations are a separate entity referencing supporting metrics via
  `EvaluationRecommendationEvidence`; coded `LIFECYCLE_REVIEW_RECOMMENDED` only (no `shouldRetire`/free-text).
- **Immutable & append-only** (Decision 9) — re-evaluation creates a **new**, independent window; nothing is
  recalculated in place; a deterministic `calculationId` (G6) + `windowSignature` (G8) + explicit `COMPLETE` state
  (G12) support reproducibility, duplicate detection, and atomic completeness (G5).
- **Eligibility** — model `VALIDATION`/`APPROVED`/`DEPRECATED` (not `DRAFT`/`RETIRED`); members are terminal-outcome
  inferences (`SUCCEEDED`/`FAILED`/`TIMED_OUT`) in the window.
- **Permissions** `evaluation:view` / `evaluation:run` / `evaluation:manage` — **no default grant**; `run` distinct
  from `view`; `manage` administrative only, **no** lifecycle authority; no evidence-mutation route.
- **All Program 6G provenance foreign keys use `ON DELETE RESTRICT`** (13 FKs). Never mutates 6A–6F, datasets,
  inference, or the clinical path.

## 2. Accepted implementation lineage
| SHA | Meaning |
|---|---|
| `aad2753` | Program 6G design-of-record baseline (twelve decisions + permissions ruling + six original guardrails) |
| **`e6cfba7`** | **6G implementation candidate** (schema + migration + module + specs + seed permission; + the six additional implementation guardrails) |
| `b794fe4` | final exact-head candidate (acceptance gate + seed/assert scripts; product unchanged from `e6cfba7`) |

The implementation is unchanged from `e6cfba7`: `git diff e6cfba7 b794fe4` touches **0 product files** — the delta is
the acceptance gate (workflow + two scripts + `apps/web/acceptance/.gitignore`). 6G is **purely additive** — no
accepted-phase test required modification. This phase required **no reconciliation commit** (approved for acceptance
testing directly from the implementation candidate).

**CI infrastructure commits (recorded separately — NOT part of the accepted implementation lineage):**
| SHA (on `main`) | Meaning |
|---|---|
| `ab64689` | 6G gate registration on `main` (default-branch `workflow_dispatch` registration; byte-identical blob `97369e7` to branch copy `b794fe4`) |

This `main` commit is **CI registration infrastructure only** — byte-identical to the Program 6 branch copy, no
product/schema/runtime change.

## 3. Authoritative acceptance evidence
- **Workflow:** `p6-continuous-eval-acceptance`
- **Run number:** `1` · **Run ID:** `30578009282`
- **Event:** `workflow_dispatch` · **Branch:** `feat/program-6-ai-foundation`
- **Exact tested SHA:** `b794fe4` (run header + in-run `git rev-parse HEAD == github.sha`, and
  `git merge-base --is-ancestor e6cfba7 HEAD` — the lineage proof — satisfied)
- **Conclusion:** `success`

Accepted results:
- evaluation tables: **5** (`EvaluationWindow`, `EvaluationWindowMember`, `EvaluationMetric`, `EvaluationRecommendation`, `EvaluationRecommendationEvidence`) · enums: **6** (`EvaluationEvidenceProvenance`, `EvaluationCohort`, `EvaluationCoverageStatus`, `EvaluationMetricKind`, `EvaluationRecommendationCode`, `EvaluationWindowStatus`)
- provenance foreign keys: **13, all `RESTRICT`**
- persisted-state assertions: **all passed** (immutable window + membership snapshot, model/window-def/time-basis integrity, baseline compatibility, observed/synthetic/unavailable separation, cohort separation, structured metrics not JSON, validated bounds, truthful empty/sparse windows, advisory isolation + evidence linkage, deterministic calculationId + windowSignature, atomic persistence + completion state, append-only ownership, eligibility, claim boundary, **no lifecycle mutation / no automatic retirement**, permission separation + no default grant, no lifecycle-authority terminology, no PHI, Program-5/6A-6F non-regression)
- focused continuous-eval tests: **23/23** (4 suites)
- Program-5 / 6A-6F non-regression tests: **133/133** (24 suites)
- TypeScript: **zero errors** (strict `npx tsc --noEmit -p tsconfig.json`, exit 0)
- evidence artifact: **`p6-6g-continuous-eval-acceptance`** generated (schema SQL + fixtures)

**Gate note:** 6G introduces **no** raw-SQL migration-only invariant (plain validated numeric/coded columns), so —
like the 6D/6E/6F gates — there is **no** explicit raw-index install step; the from-datamodel reconstruction produced
the complete schema, and persisted-state assertions verified the evidence boundaries against DB truth.

## 4. Frozen reconciliation decisions
- Continuous evaluation is **downstream evidence only** — it never becomes real clinical performance, a lifecycle
  action, or an authoritative decision.
- "Continuous" is **longitudinal** (repeated immutable windows), **not** autonomous; there is no worker/scheduler.
- **No support lifecycle mutation** — 6G informs but never performs promotion/deprecation/retirement; retirement stays
  the human 6A `aimodel:promote` action.
- **Program 5 remains immutable; accepted Program 6A, 6B, 6C, 6D, 6E, and 6F remain unmodified.**

## 5. Deferred scope (NOT in Phase 6G)
real clinical performance (6H) · automatic retraining / model updates / adaptive models / RL · automatic threshold
modification / lifecycle transition / retirement / inference disabling · any worker/scheduler/cron/queue/hook/
inference-completion trigger · any mutation of Program 5 or accepted 6A/6B/6C/6D/6E/6F (including model lifecycle) or
the clinical `Record`/`ResultSheet`/`AiDraft` path · any claim of clinical/regulatory authority.

## 6. Freeze statement
**Program 6 · Phase 6G is immutable at `b794fe4`.** Future work must reference the accepted Phase 6G
continuous-evaluation-evidence foundation rather than modifying its accepted historical baseline. Corrections require a
separately governed amendment.
