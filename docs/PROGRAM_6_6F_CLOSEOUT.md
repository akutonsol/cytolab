# Program 6 · Phase 6F — Validation — Acceptance Closeout

**Status:** **ACCEPTED · FROZEN.** The governed **Validation Evidence** subsystem only — *no claim beyond the
validation evidence actually recorded* (charter §3). A `ValidationRun` permanently binds a **FROZEN 6B
`DatasetVersion`** (the immutable reference corpus + ground truth) to a **6A `AiModelVersion`** (the evaluated model),
and records **immutable structured metrics** (confusion cells, sensitivity/specificity/precision/recall/F, ROC +
calibration points, operating thresholds) as evidence attached to the **model version**. The default validator is a
**deterministic, non-clinical stub** — 6F does **not** compute real model performance, certify a model, or make
regulatory/clinical/accuracy claims. Validation **informs** promotion but **never** performs it (**no support
lifecycle promotion**); it mutates no 6A–6E, dataset, or clinical state. A parallel subsystem that references the
frozen Program 5 clinical path and the accepted 6A–6E baselines and modifies none of them. Charter:
[`PROGRAM_6_CHARTER.md`](./PROGRAM_6_CHARTER.md) · Design of record: [`PROGRAM_6_6F_DESIGN.md`](./PROGRAM_6_6F_DESIGN.md).

---

## 1. Accepted scope
- **Governed validation-evidence architecture** — immutable runs + structured metrics + immutable provenance + a
  deterministic non-clinical stub. **Not** real model-performance computation, certification, or regulatory claims.
- **Dataset ↔ model linkage (the 6B-deferred relationship, now activated)** — a run binds a **FROZEN `DatasetVersion`
  × `AiModelVersion`**, both `ON DELETE RESTRICT`; dataset must be **same-lab, immutable, `FROZEN`**; model must be a
  **validatable lifecycle state (`VALIDATION`/`APPROVED`)**.
- **Validation belongs to the model version** — attached to `AiModelVersion`, never to an inference, slide, patient,
  or dataset; aggregate metrics only, no per-slide diagnostic claim.
- **Structured immutable metrics** — child entities (`ValidationMetric` / `ValidationConfusionCell` /
  `ValidationCurvePoint`), never JSON blobs/narrative; every numeric validated (ratios in [0,1], counts ≥ 0,
  coordinates in [0,1]); metrics computed **from** the confusion cells so each carries a real numerator/denominator.
- **Immutable & append-only** — revalidation creates a **new**, fully independent evidence graph; the current state is
  derived, never rewritten.
- **Identity + provenance snapshots** (Guardrails 1/2/3/5/7) — each run permanently records the dataset identity +
  `manifestDigest` + ground-truth digest, the model `versionUuid`/`modelUuid`/`artifactDigest`/lifecycle-state-at-run,
  the validation config as digests, the metric-schema + computation versions, and a deterministic `calculationId`, so
  later dataset/registry/config evolution never alters the evidence.
- **Deterministic** (Guardrail 4) — identical (model snapshot, frozen-dataset snapshot, config) → identical output +
  `calculationId`.
- **Atomic** (Guardrail 6) — the whole evidence set is validated **before** persistence and committed all-or-nothing.
- **Claim boundary** — nothing may be claimed beyond recorded evidence; no `certified`/`clinicallyAccurate`/
  `fdaValidated`/`diagnosticQuality`/`provenSafe`/`diagnosis` column or value.
- **Permissions** `validation:view` / `validation:run` / `validation:manage` — **no default grant**; `run` distinct
  from `view`; `manage` administrative only (**no** evidence-mutation or lifecycle-promotion route).
- **Manual trigger only** — no worker, scheduler, inference-completion trigger, automatic recomputation, or
  lifecycle-event hook.
- **All Program 6F provenance foreign keys use `ON DELETE RESTRICT`** (9 FKs). **No support lifecycle promotion**
  (never mutates model lifecycle); never writes 6A–6E, datasets, or the clinical path.

## 2. Accepted implementation lineage
| SHA | Meaning |
|---|---|
| `1e35af6` | Program 6F design-of-record baseline (twelve decisions + four original guardrails) |
| **`b9b9da6`** | **6F implementation candidate** (schema + migration + module + specs + seed permission; + the four additional implementation guardrails) |
| `47e08ca` | final exact-head candidate (acceptance gate + seed/assert scripts; product unchanged from `b9b9da6`) |

The implementation is unchanged from `b9b9da6`: `git diff b9b9da6 47e08ca` touches **0 product files** — the delta is
the acceptance gate (workflow + two scripts + `apps/web/acceptance/.gitignore`). 6F is **purely additive** — no
accepted-phase test required modification. This phase required **no reconciliation commit** (approved for acceptance
testing directly from the implementation candidate).

**CI infrastructure commits (recorded separately — NOT part of the accepted implementation lineage):**
| SHA (on `main`) | Meaning |
|---|---|
| `9bb4ddc` | 6F gate registration on `main` (default-branch `workflow_dispatch` registration; byte-identical blob `a837326` to branch copy `47e08ca`) |

This `main` commit is **CI registration infrastructure only** — byte-identical to the Program 6 branch copy, no
product/schema/runtime change.

## 3. Authoritative acceptance evidence
- **Workflow:** `p6-validation-acceptance`
- **Run number:** `1` · **Run ID:** `30574190699`
- **Event:** `workflow_dispatch` · **Branch:** `feat/program-6-ai-foundation`
- **Exact tested SHA:** `47e08ca` (run header + in-run `git rev-parse HEAD == github.sha`, and
  `git merge-base --is-ancestor b9b9da6 HEAD` — the lineage proof — satisfied)
- **Conclusion:** `success`

Accepted results:
- validation tables: **4** (`ValidationRun`, `ValidationMetric`, `ValidationConfusionCell`, `ValidationCurvePoint`) · enums: **1** (`ValidationMetricKind`)
- provenance foreign keys: **9, all `RESTRICT`**
- persisted-state assertions: **all passed** (immutable FROZEN-dataset × model linkage, FROZEN + VALIDATION/APPROVED eligibility, dataset/ground-truth/model/artifact/lifecycle/config snapshots, structured metrics not JSON, validated numeric bounds + confusion-matrix consistency, metric provenance + metric-schema version + computation version + deterministic calculation id, deterministic reproducibility, atomic persistence, cross-run independence, claim-boundary enforcement, no automatic lifecycle promotion, permission separation + no default grant, no evidence-mutation route, no certification/clinical-authority terminology, no PHI columns, Program-5/6A-6E non-regression)
- focused validation tests: **19/19** (4 suites)
- Program-5 / 6A-6E non-regression tests: **114/114** (20 suites)
- TypeScript: **zero errors** (strict `npx tsc --noEmit -p tsconfig.json`, exit 0)
- evidence artifact: **`p6-6f-validation-acceptance`** generated (schema SQL + fixtures)

**Gate note:** 6F introduces **no** raw-SQL migration-only invariant (plain validated numeric/coded columns), so —
like the 6D/6E gates — there is **no** explicit raw-index install step; the from-datamodel reconstruction produced the
complete schema, and persisted-state assertions verified the evidence boundaries against DB truth.

## 4. Frozen reconciliation decisions
- Validation is **downstream evidence only** — it never becomes real clinical performance, certification, a regulatory
  claim, or an authoritative diagnosis.
- The deferred **DatasetVersion × ModelVersion** relationship is activated exactly here; the run snapshots both
  identities so the evidence is permanent regardless of later evolution.
- **No support lifecycle promotion** — validation informs but never performs the `VALIDATION → APPROVED` promotion,
  which remains the human `aimodel:promote` action from 6A.
- **Program 5 remains immutable; accepted Program 6A, 6B, 6C, 6D, and 6E remain unmodified.**

## 5. Deferred scope (NOT in Phase 6F)
real model-performance computation / real predictions · model certification / regulatory or clinical-accuracy /
safety / diagnostic-quality claims · any lifecycle promotion or model approval/rejection · continuous evaluation /
drift (6G) · clinical-performance reporting (6H) · automatic/scheduled/event-driven validation or recomputation · any
mutation of Program 5 or accepted 6A/6B/6C/6D/6E (including model lifecycle) or the clinical path.

## 6. Freeze statement
**Program 6 · Phase 6F is immutable at `47e08ca`.** Future work must reference the accepted Phase 6F validation-
evidence foundation rather than modifying its accepted historical baseline. Corrections require a separately governed
amendment.
