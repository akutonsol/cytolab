# Program 6 · Phase 6G — Continuous Evaluation — DESIGN APPROVED (implementation target)

**Status:** **DESIGN APPROVED (2026-07-30).** Twelve governance decisions + a permissions ruling + six additional
guardrails recorded below. **Implementation NOT yet authorized** — this is the approved design of record a future
authorized implementation follows. References — never modifies — the frozen Program 5 clinical path and the accepted
6A registry/lifecycle (`p6-6a-accepted → 391dcd8`), 6B datasets (`p6-6b-accepted → 1c27092`), 6C inference
(`p6-6c-accepted → 1e31c4f`), 6D explainability (`p6-6d-accepted → b20a69c`), 6E human review
(`p6-6e-accepted → 71efc5c`), and 6F validation (`p6-6f-accepted → 47e08ca`), and stays additive. Charter:
[`PROGRAM_6_CHARTER.md`](./PROGRAM_6_CHARTER.md). Preflight baseline: `origin/feat/program-6-ai-foundation` @ `0e65d01`.

**Governing principle:** 6G **observes and records evidence over time without becoming an autonomous
model-governance actor.** "Continuous" means **longitudinal, not autonomous.** It informs; it never acts.

---

## 1. Scope (6G only)
A governed **Continuous Evaluation Evidence** subsystem: **immutable evaluation windows** over a model version's
inference stream, recording structured evidence — inference volume, outcome/failure/timeout rates, latency
distributions, drift and calibration-decay indicators, confidence distributions where supported, and **advisory**
lifecycle-review indicators. It establishes **no real clinical performance**, and it **does not retrain, update,
promote, deprecate, retire, disable, or suppress a model**. A deterministic non-clinical evaluator stub is used where
real inputs are unavailable, with synthetic values **explicitly distinguishable** from observed production evidence.
**Manual-trigger only** — no worker, scheduler, or automation.

## 2. Recorded governance decisions
1. **6G produces a governed Continuous Evaluation Evidence subsystem** — immutable evaluation windows of structured
   evidence (volume, outcome/failure/timeout rates, latency, drift, calibration decay, confidence where supported,
   advisory retirement indicators). It does **not** establish clinical performance and does **not** retrain, update,
   promote, deprecate, or retire a model. A deterministic non-clinical stub may fill unavailable inputs, but synthetic
   values must remain **explicitly distinguishable** from observed production evidence.
2. **Model retirement — inform, never perform.** 6G may create structured **advisory** evidence that human lifecycle
   review should be considered. It must **never** transition a model to `DEPRECATED`/`RETIRED`, invoke
   `aimodel:promote`, modify any lifecycle field, disable inference, or suppress a model. Boundary: **No support
   lifecycle mutation. No automatic retirement.**
3. **"Continuous" = longitudinal, not autonomous.** Repeated immutable windows + comparable accumulated evidence +
   current state **derived** from windows. **Manual-trigger only** — **no** worker, scheduler, cron, queue consumer,
   inference-completion hook, or recurring background execution is authorized in 6G. (A future phase may add gated
   scheduling under separate governance.)
4. **Evaluation-window inputs.** Each window permanently references + snapshots: one `AiModelVersion`; laboratory
   scope; explicit start/end time; the selected population of eligible `InferenceRecord` rows; an optional 6F
   `ValidationRun` baseline; evaluation configuration; evaluator identity + version. **Cross-lab fails closed;** a
   baseline (when present) must belong to the **same model version + lab**; all provenance FKs `ON DELETE RESTRICT`.
5. **Validation baseline.** A 6F `ValidationRun` may serve as a comparison baseline for calibration-decay, drift,
   operating-threshold comparison, and expected metric distributions. 6G must **not** describe a run as "accepted"
   (no structural acceptance status exists) — eligibility is: an **immutable completed 6F `ValidationRun`, same lab,
   same model version, structurally valid, explicitly selected** by the human initiator. 6G infers **no** regulatory
   or clinical authority from a baseline.
6. **Confidence-distribution gap.** 6C exposes no structured confidence, so real confidence evidence may be computed
   only from a future governed structured-confidence source. The stub's confidence bins are **synthetic**, marked
   **`SYNTHETIC_STUB`**, **not** represented as derived from `InferenceRecord`, and must not support drift/retirement/
   clinical/performance claims. Evidence carries a coded provenance: at least **`OBSERVED` / `SYNTHETIC_STUB` /
   `UNAVAILABLE`**. **No fabricated production signal is permitted.**
7. **Empty & sparse streams.** A window with zero eligible inferences records that **truthfully** (sample count 0,
   coverage status, reason for unavailable metrics, window boundaries + provenance). It must **not** store invented
   failure rates, latency percentiles, drift scores, calibration-decay values, or confidence distributions. Sparse
   windows preserve their actual denominator + coverage limitation; **no metric may imply statistical sufficiency
   merely because it is numerically calculable.**
8. **Metric architecture.** Structured immutable child entities, **not** JSON blobs. Kinds may include counts, rates,
   latency percentiles, distribution bins, drift indicators, calibration-decay indicators, advisory lifecycle-review
   indicators. Each metric records: metric kind; **observed-vs-synthetic status**; numerator/denominator where
   applicable; unit; sample count; computation version; metric-schema version; calculation id; baseline relationship
   where applicable. Numeric constraints validated **before** persistence.
9. **Immutability.** Windows + all owned evidence are immutable and append-only. Re-evaluation creates a **new**
   window; no recalculation-in-place; no replacement of historical metrics; current status/trend is derived from
   immutable windows; each window owns an **independent** child-evidence graph.
10. **Eligibility & cohorts.** Model states eligible: **`VALIDATION`, `APPROVED`, `DEPRECATED`** (pre-approval
    monitoring architecture / primary operational state / managed phase-out). **Not** eligible: `DRAFT`, `RETIRED`
    (terminal). Inference eligibility: completed terminal outcomes within the window — `SUCCEEDED` / `FAILED` /
    `TIMED_OUT`. **Required decision:** `validationOnly` and non-validation inference evidence are kept in **separate
    cohorts** (or an explicit cohort selection) — **no silent aggregation across them** (the window's `cohort` is
    explicit).
11. **Hard non-goals — structural, not merely documented.** 6G provides **no** route/service/worker/callback/event
    handler for: automatic retraining · automatic model updates · adaptive model behavior · reinforcement learning ·
    automatic threshold modification · automatic lifecycle transition · automatic inference disabling · automatic
    retirement.
12. **Existing-system protection.** 6G never mutates the 6A registry/lifecycle, 6B datasets/ground truth, 6C
    inference records, 6D explainability, 6E human-review evidence, 6F validation evidence, the clinical `Record`,
    `ResultSheet`, `AiDraft`, or patient/slide state. It **reads** governed upstream evidence and **writes only its
    own append-only evidence.**

## 3. Permissions (new `evaluation` namespace; no default grant)
Add to `SPECIAL_OBJECTS`: `evaluation: ['view', 'run', 'manage']` — **no default-role grant** (super-role reach only).
`run` initiates a **manual** evaluation; `manage` governs administrative workflow only and confers **no** lifecycle
authority. **No permission in this namespace may imply the ability to retire, deprecate, promote, retrain, or disable
a model.** `run` distinct from `view`; `manage` distinct from `run`.

## 4. Additional guardrails
- **Guardrail 1 — Window membership snapshot.** Each window permanently captures the **exact inference population**
  used, as **immutable member rows** referencing each included `InferenceRecord` (`RESTRICT`) — a digest alone is
  insufficient; membership must be independently reconstructable + verifiable.
- **Guardrail 2 — Observed/synthetic separation.** Observed and synthetic evidence are **never** combined into one
  metric without explicit structured separation; a stub must not emit an apparently-observed production metric merely
  because real inference records exist in the same window.
- **Guardrail 3 — Baseline compatibility.** Before comparing a window to a `ValidationRun`, verify same lab, same
  model version, compatible metric-schema/config semantics, compatible label/output schema where applicable. An
  incompatible baseline is **rejected or recorded as `UNAVAILABLE`** — never coerced into a comparison.
- **Guardrail 4 — Advisory recommendation provenance.** Any lifecycle-review recommendation records the rule id, rule
  version, **supporting metric references**, threshold configuration, evaluation coverage, and observed/synthetic
  status. **No free-text recommendation; no opaque Boolean** such as `shouldRetire`. Terminology is advisory —
  `LIFECYCLE_REVIEW_RECOMMENDED` — and must **not** be named `RETIRE`, `AUTO_RETIRE`, or `RETIREMENT_APPROVED`.
- **Guardrail 5 — Atomic evidence completeness.** The window, membership snapshot, metrics, distributions,
  comparisons, and advisory evidence are validated + persisted **atomically**; a visible window never contains a
  partially generated evidence set.
- **Guardrail 6 — Deterministic reproducibility.** Identical (model snapshot, baseline snapshot, inference
  membership, time-window definition, cohort selection, evaluation config, evaluator version) → identical evidence +
  calculation id.

## 5. Schema (net-new; additive migration; lab-scoped; immutable-by-idiom; reference-not-copy)
All tables: `labId String` + `@@index([labId])` (auto-tenancy); provenance FKs `onDelete: Restrict`; permanent UUIDs.
Terminology names evidence, never authority: `evaluationWindow`/`metricKind`/`LIFECYCLE_REVIEW_RECOMMENDED` — never
`retire`/`autoRetire`/`shouldRetire`/`deprecate`/`disable`.

- `enum EvaluationEvidenceProvenance { OBSERVED SYNTHETIC_STUB UNAVAILABLE }` *(Decision 6 / Guardrail 2)*
- `enum EvaluationCohort { NON_VALIDATION VALIDATION_ONLY }` *(Decision 10 — no silent cross-cohort aggregation)*
- `enum EvaluationCoverageStatus { COVERED SPARSE EMPTY }` *(Decision 7 — truthful sparsity)*
- `enum EvaluationMetricKind { INFERENCE_COUNT SUCCESS_RATE FAILURE_RATE TIMEOUT_RATE LATENCY_PERCENTILE CONFIDENCE_BIN DRIFT_INDICATOR CALIBRATION_DECAY }` *(Decision 8)*
- `enum EvaluationRecommendationCode { LIFECYCLE_REVIEW_RECOMMENDED }` *(Guardrail 4 — structurally advisory only)*

- **`EvaluationWindow`** (immutable aggregate — Decisions 1/4/9 + Guardrail 6): `id`, `windowUuid @unique @default(uuid)`,
  `labId`, `modelVersionId → AiModelVersion (Restrict)`, model snapshot (`modelVersionUuid`, `modelUuid`,
  `modelLifecycleStateAtRun AiModelLifecycleState`), `windowStart DateTime`, `windowEnd DateTime`, `cohort
  EvaluationCohort`, `baselineValidationRunId? → ValidationRun (Restrict)`, `baselineCalculationId?` (snapshot),
  `baselineCompatibility EvaluationEvidenceProvenance` (OBSERVED when a compatible baseline is used; UNAVAILABLE
  otherwise — Guardrail 3), `sampleCount Int`, `coverageStatus EvaluationCoverageStatus`, `evaluatorId`,
  `evaluatorVersion`, `computationVersion`, `metricSchemaVersion`, `configDigest?`, `calculationId`, `eventId`,
  `createdById?` (no FK), `createdAt`. Append-only; no update/delete path.

- **`EvaluationWindowMember`** (Guardrail 1 — immutable membership): `id`, `labId`, `windowId → EvaluationWindow
  (Restrict)`, `inferenceRecordId → InferenceRecord (Restrict)`, `ordinal Int`, `createdAt`;
  `@@unique([labId, windowId, inferenceRecordId])`.

- **`EvaluationMetric`** (structured immutable metric — Decision 8 + Guardrail 2): `id`, `labId`, `windowId →
  EvaluationWindow (Restrict)`, `metricKind EvaluationMetricKind`, `provenance EvaluationEvidenceProvenance`,
  `binCode String?` (coded percentile/bin/label; e.g. `p50`/`p95`/a confidence bin — never a diagnosis), `value
  Float?` (validated finite; rates in [0,1]; UNAVAILABLE ⇒ null value + reason), `numeratorSource String?`,
  `denominatorSource String?`, `unit String?`, `sampleCount Int?`, `baselineRelation String?` (e.g.
  `delta-vs-baseline`, coded), `unavailableReason String?`, `ordinal Int`, `createdAt`.

- **`EvaluationRecommendation`** (advisory — Guardrail 4): `id`, `labId`, `windowId → EvaluationWindow (Restrict)`,
  `recommendationCode EvaluationRecommendationCode`, `ruleId String`, `ruleVersion String`, `thresholdConfigDigest
  String?`, `coverageStatus EvaluationCoverageStatus`, `provenance EvaluationEvidenceProvenance`, `ordinal Int`,
  `createdAt`. **No** `shouldRetire`/`autoRetire`/free-text field.

- **`EvaluationRecommendationEvidence`** (supporting metric references — Guardrail 4): `id`, `labId`,
  `recommendationId → EvaluationRecommendation (Restrict)`, `metricId → EvaluationMetric (Restrict)`, `ordinal Int`,
  `createdAt`; `@@unique([labId, recommendationId, metricId])`.

## 6. Window lifecycle, membership & immutability (Decisions 4/9 + Guardrails 1/5)
A manual `evaluation:run` selects a model version (eligible state), a time window, a cohort, and an optional baseline.
The service materializes the **exact eligible `InferenceRecord` population** as immutable `EvaluationWindowMember`
rows (Guardrail 1), computes metrics/recommendations, validates all numerics + provenance **before** persistence, and
writes the window + members + metrics + recommendation(s) + supporting-evidence **atomically** (Guardrail 5).
Re-evaluation makes a **new** window with an independent evidence graph (Decision 9). Nothing is recalculated in place;
current status/trend is derived from immutable windows.

## 7. Observed / synthetic / unavailable provenance & sparsity (Decisions 6/7 + Guardrail 2)
Every metric + recommendation carries `provenance ∈ {OBSERVED, SYNTHETIC_STUB, UNAVAILABLE}`. `OBSERVED` metrics are
computed from real `InferenceRecord` fields (latency `durationMs`, outcome counts). Confidence bins are
`SYNTHETIC_STUB` (no structured confidence exists in 6C) and never claim to be observed. When a metric cannot be
computed (empty/sparse/incompatible-baseline), it is recorded `UNAVAILABLE` with an `unavailableReason` and a **null**
value — never an invented number. `coverageStatus ∈ {COVERED, SPARSE, EMPTY}` + the true `sampleCount` preserve the
denominator; observed and synthetic evidence are never merged into one metric (Guardrail 2).

## 8. Determinism (Guardrail 6)
A provider-independent evaluator interface with a **deterministic non-clinical stub** as the only shipped
implementation. Identical (model snapshot, baseline snapshot, member set, window definition, cohort, config, evaluator
version) → identical metrics/recommendations + `calculationId`. Observed metrics are deterministic aggregations of the
frozen member set; synthetic bins are deterministic from the snapshot digests.

## 9. Eligibility, cohorts & baseline (Decisions 5/10 + Guardrail 3)
Model lifecycle eligible: `VALIDATION`/`APPROVED`/`DEPRECATED`; `DRAFT`/`RETIRED` rejected. Members are terminal-outcome
`InferenceRecord`s (`SUCCEEDED`/`FAILED`/`TIMED_OUT`) in `[windowStart, windowEnd)`, filtered by the explicit `cohort`
(`NON_VALIDATION` excludes `validationOnly`; `VALIDATION_ONLY` includes only them) — no silent mixing. A baseline, if
selected, must be an immutable completed `ValidationRun`, same lab + same model version, structurally compatible —
else rejected or recorded `UNAVAILABLE` (Guardrail 3); no clinical/regulatory authority is inferred.

## 10. No-support boundary (Decisions 2/11/12)
6G writes only its own append-only evidence. It never mutates model lifecycle (no automatic retirement/deprecation/
promotion), datasets, inference, explainability, human review, validation, or the clinical path; it provides **no**
route/worker/hook for retraining, adaptive/RL behavior, threshold modification, lifecycle transition, inference
disabling, or retirement. Recommendations are advisory (`LIFECYCLE_REVIEW_RECOMMENDED`) with full provenance and no
authority.

## 11. Migration, trigger & dependencies
One additive timestamped migration (5 enums + ~5 tables + indexes + `Restrict` FKs). **Manual `evaluation:run` only —
no worker/scheduler** (Decision 3). Plain validated numeric/coded columns — **no raw-SQL-only invariant expected**;
the design does **not** pre-decide this — if implementation discovers a relational invariant Prisma cannot express
(e.g. a partial-unique constraint), the gate installs + verifies it (the 6C lesson). **No change** to any Program 5 /
6A–6F model or the clinical path; **no new runtime dependency**. Additive-only.

## 12. Acceptance design (folded gate; run only under a future authorization)
`scripts/seed-continuous-eval-acceptance.ts` + `scripts/assert-continuous-eval-state.ts` + a
`p6-continuous-eval-acceptance.yml` gate (registered byte-identically on `main` under its own authorization;
**checkout `fetch-depth: 0`**; if any raw-SQL-only invariant is introduced, install + verify it before assertions).
Persisted-truth assertions: additive schema (enums/tables/columns/RESTRICT FKs); immutable window + membership
snapshot (Guardrail 1) reconstructable; model eligibility (`VALIDATION`/`APPROVED`/`DEPRECATED` only; `DRAFT`/`RETIRED`
rejected); explicit cohort separation (`validationOnly` not silently mixed); observed metrics from real records +
`OBSERVED` provenance; synthetic confidence bins marked `SYNTHETIC_STUB` and never observed; empty/sparse windows
truthful (`sampleCount`, `coverageStatus`, `UNAVAILABLE` + reason, no invented values); baseline compatibility
(same lab + model version, incompatible → rejected/`UNAVAILABLE`); advisory recommendation provenance (rule id/version,
supporting metric refs, coded `LIFECYCLE_REVIEW_RECOMMENDED`, no `shouldRetire`); atomic all-or-nothing (Guardrail 5);
deterministic reproducibility (Guardrail 6); immutability/append-only (re-eval = new window, independent graph);
**no support lifecycle mutation** (model lifecycle byte-identical after a window; no automatic retirement) and no write
to 6A–6F/clinical; permission separation + no default grant; no evidence-mutation/lifecycle route; no PHI / no
clinical-authority terminology; tenancy + cross-lab fail-closed; Program-5/6A-6F non-regression; strict TypeScript.

## 13. Explicitly NOT in 6G
real clinical performance (6H) · automatic retraining / model updates / adaptive models / RL · automatic threshold
modification / lifecycle transition / retirement / inference disabling · any worker/scheduler/cron/queue/hook/
inference-completion trigger · any mutation of Program 5 or accepted 6A/6B/6C/6D/6E/6F (including model lifecycle) or
the clinical `Record`/`ResultSheet`/`AiDraft` path · any claim of clinical/regulatory authority from a baseline.

## 14. Verdict
**PROGRAM 6 · PHASE 6G — DESIGN APPROVED**, twelve decisions + permissions ruling + six additional guardrails recorded
(§2–§4). Implementation is authorized only by a subsequent explicit instruction; this document is the design of record
it will follow.
