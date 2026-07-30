# Program 6 · Phase 6H — Clinical Performance — DESIGN APPROVED (implementation target)

**Status:** **DESIGN APPROVED (2026-07-30).** Twelve governance decisions + six additional guardrails recorded below.
**Implementation NOT yet authorized** — this is the approved design of record a future authorized implementation
follows. References — never modifies — the frozen Program 5 clinical path and the accepted 6A registry/lifecycle
(`p6-6a-accepted → 391dcd8`), 6B datasets (`p6-6b-accepted → 1c27092`), 6C inference (`p6-6c-accepted → 1e31c4f`),
6D explainability (`p6-6d-accepted → b20a69c`), 6E human review (`p6-6e-accepted → 71efc5c`), 6F validation
(`p6-6f-accepted → 47e08ca`), and 6G continuous evaluation (`p6-6g-accepted → b794fe4`), and stays additive. Charter:
[`PROGRAM_6_CHARTER.md`](./PROGRAM_6_CHARTER.md). Preflight baseline: `origin/feat/program-6-ai-foundation` @ `5d935fc`.

**Governing principle (charter §2.3 + governance ruling):** *Clinical Performance is measurement evidence only. It is
never evidence of clinical validity, safety, effectiveness, regulatory clearance, or diagnostic correctness.* 6H
**measures the AI; it creates no new diagnoses.** The primary risk is semantic overreach — measurement evidence read
as clinical authority — and it is barred **structurally**.

---

## 1. Scope (6H only)
A governed **Clinical Performance Measurement Evidence** subsystem: immutable measurement windows recording **reader
agreement, concordance, review time, turnaround impact, workload metrics, and operational KPIs** over governed
upstream evidence (6C inference, 6E human review, optional 6F validation baseline, and reference-only Program-5
operational metadata). The default evaluator is a **deterministic, non-clinical stub**. 6H establishes **no** real
clinical performance and makes **no** clinical/safety/effectiveness/regulatory/diagnostic claim; it **never** creates
or alters a diagnosis, sign-out, authorization, lifecycle, or any upstream evidence. **Manual-trigger only**; no
worker/scheduler; **no lifecycle/clinical recommendations** (measurement only).

## 2. Recorded governance decisions
1. **Claim boundary (foundational — the governing principle).** 6H produces **Clinical Performance Measurement
   Evidence** and **never** clinical validation, clinical authorization, diagnostic correctness, or effectiveness/
   safety/regulatory/superiority/non-inferiority claims. The schema/DTOs must **structurally prohibit** terminology
   such as `clinicallyValid`, `clinicallyApproved`, `clinicallyVerified`, `clinicallySafe`, `clinicallyEffective`,
   `FDAApproved`, `FDACleared`, `FDAValidated`, `certified`, `diagnosticAccuracy`, `superiorTo`, `nonInferior`.
   Measurements are descriptive, never authoritative.
2. **6H produces an immutable Clinical Performance Evidence subsystem** — reader agreement, concordance, review time,
   turnaround impact, workload metrics, operational KPIs, and measurement provenance. It does **not** establish real
   clinical performance; a deterministic non-clinical stub is used until a future governed implementation provides
   observed measurements.
3. **Measures AI, never creates a diagnosis.** 6H shall never create/modify a diagnosis, modify clinical sign-out,
   authorize results, influence authorization, or alter model lifecycle/inference/validation/continuous-evaluation.
   New frozen boundary: **No support diagnostic authority** (in addition to 6E no-support-clinical-authorization,
   6F no-support-lifecycle-promotion, 6G no-support-lifecycle-mutation).
4. **Input scope & Program-5 interaction (the principal new decision).** 6H may read Program-5 **operational metadata
   only** when required for operational measurements: identifiers, timestamps, coded status values, workflow state,
   authorization timestamps, review timing. It may **never** read narrative reports, diagnoses, findings,
   interpretations, free text, images, or PHI, and may **never** modify any Program-5 object. **Strictly
   reference-only.**
5. **Reader agreement** measures agreement between recorded decisions — it does **not** determine correctness. High
   agreement never implies correctness, clinical validity, diagnostic accuracy, or regulatory performance
   (observational evidence only).
6. **Concordance** is a measurement of consistency between governed evidence sources — **not** a correctness metric.
   The schema distinguishes **agreement**, **concordance**, and **correctness**; only agreement + concordance belong in
   6H (correctness is out of scope).
7. **Metric taxonomy** — structured immutable entities (agreement/concordance statistics, review duration, turnaround
   duration, workload counts, workload-reduction estimates, operational throughput). Every metric records provenance,
   cohort, units, numerator, denominator, sample count, calculation version, schema version, and calculation
   identifier. **No arbitrary JSON evidence.**
8. **Empty & sparse measurements.** Truthful absence is mandatory — windows with insufficient evidence record sample
   count, coverage, unavailable reason, and provenance; **no synthetic operational KPI may masquerade as observed
   evidence**.
9. **Immutability.** Clinical Performance Windows are append-only; recomputation creates a **new** window; current
   state is **derived**; **no mutable summaries**.
10. **Cohorts.** `validationOnly` evidence remains structurally separated — independent cohorts or an explicit cohort
    selection; **no silent aggregation**.
11. **Permissions** `clinicalperf:view` / `clinicalperf:run` / `clinicalperf:manage` — **no default grant**; **no
    permission grants clinical or diagnostic authority**.
12. **Existing-system protection.** 6H reads governed evidence and **writes only Clinical Performance Evidence**; it
    never mutates the 6A registry, 6B datasets, 6C inference, 6D explainability, 6E human review, 6F validation, 6G
    continuous evaluation, or the Program-5 clinical workflow.

## 3. Additional guardrails
- **Guardrail 1 — Operational-data isolation.** Any Program-5 reference terminates at **coded operational metadata**;
  narrative clinical content is **structurally unreachable** (no relation/column can surface a report/finding/PHI).
- **Guardrail 2 — Measurement provenance.** Each measurement permanently records observed-vs-synthetic-vs-unavailable,
  source subsystem, computation version, calculation identifier, and operational cohort.
- **Guardrail 3 — Window membership.** Like 6G, every window permanently snapshots the **exact member population** as
  immutable rows; membership is reconstructable.
- **Guardrail 4 — Operational compatibility.** A window verifies compatibility among model version, review evidence,
  inference evidence, optional validation baseline, and optional operational metadata; **incompatible evidence becomes
  UNAVAILABLE — never coerced**.
- **Guardrail 5 — Recommendation prohibition.** Unlike 6G, 6H shall **not** generate any lifecycle/clinical/deployment
  recommendation — no retire/promote/clinical/deployment recommendation. Its purpose ends at measurement.
- **Guardrail 6 — Program boundary.** Although 6H is the final phase, completing 6H must **not** declare Program 6
  complete; program completion / master closeout / consolidated baseline / governance certification are separate
  post-program governance activities.

## 4. Schema (net-new; additive migration; lab-scoped; immutable-by-idiom; reference-not-copy)
All tables: `labId String` + `@@index([labId])` (auto-tenancy); provenance FKs `onDelete: Restrict`; permanent UUIDs.
Terminology names measurement, never authority (Decision 1): `performanceWindow`/`metricKind`/`measurementProvenance` —
never `clinicallyValid`/`FDACleared`/`diagnosticAccuracy`/`superiorTo`/`certified`.

- `enum ClinicalPerfMetricKind { READER_AGREEMENT CONCORDANCE REVIEW_DURATION TURNAROUND_DURATION WORKLOAD_COUNT WORKLOAD_REDUCTION OPERATIONAL_THROUGHPUT }`
  *(agreement + concordance are consistency measures — NOT correctness; Decisions 5/6)*
- `enum ClinicalPerfEvidenceProvenance { OBSERVED SYNTHETIC_STUB UNAVAILABLE }` *(Guardrail 2)*
- `enum ClinicalPerfCohort { CLINICAL VALIDATION_ONLY }` *(Decision 10 — no silent aggregation)*
- `enum ClinicalPerfCoverageStatus { COVERED SPARSE EMPTY }` *(Decision 8)*
- `enum ClinicalPerfMemberSource { INFERENCE_RECORD HUMAN_REVIEW_DECISION }` *(Guardrail 3 — member kind)*

- **`ClinicalPerfWindow`** (immutable aggregate — Decisions 2/9 + Guardrails 3/4): `id`,
  `windowUuid @unique @default(uuid)`, `labId`, `modelVersionId → AiModelVersion (Restrict)`, model snapshot
  (`modelVersionUuid`, `modelUuid`, `modelLifecycleStateAtRun`), `windowStart DateTime`, `windowEnd DateTime`,
  `timeBasis`, `windowDefinitionVersion`, `cohort ClinicalPerfCohort`,
  `baselineValidationRunId? → ValidationRun (Restrict)`, `baselineCalculationId?`,
  `evidenceCompatibility ClinicalPerfEvidenceProvenance` (OBSERVED when sources are compatible; UNAVAILABLE otherwise —
  Guardrail 4), `operationalDataUsed Boolean` (whether reference-only Program-5 operational metadata was read —
  Decision 4), `sampleCount Int`, `coverageStatus ClinicalPerfCoverageStatus`, `evaluatorId`, `evaluatorVersion`,
  `computationVersion`, `metricSchemaVersion`, `configDigest?`, `calculationId`, `windowSignature`, `completionState`
  *(single `COMPLETE` enum value)*, `eventId`, `createdById?` (no FK), `createdAt`. Append-only; no update/delete path.

- **`ClinicalPerfWindowMember`** (Guardrail 3 — immutable membership): `id`, `labId`,
  `windowId → ClinicalPerfWindow (Restrict)`, `source ClinicalPerfMemberSource`,
  `inferenceRecordId? → InferenceRecord (Restrict)`, `humanReviewDecisionId? → HumanReviewDecision (Restrict)`,
  `ordinal Int`, `createdAt`. Exactly one of the two references is set (by `source`).

- **`ClinicalPerfMetric`** (structured immutable measurement — Decision 7 + Guardrail 2): `id`, `labId`,
  `windowId → ClinicalPerfWindow (Restrict)`, `metricKind ClinicalPerfMetricKind`,
  `provenance ClinicalPerfEvidenceProvenance`, `cohort ClinicalPerfCohort`, `sourceSubsystem String` (coded:
  `6c`/`6e`/`6f`/`program5-operational`), `binCode String?`, `value Float?` (validated by kind; UNAVAILABLE ⇒ null),
  `numeratorSource String?`, `denominatorSource String?`, `unit String?`, `sampleCount Int?`, `unavailableReason
  String?`, `ordinal Int`, `createdAt`. **No JSON evidence; no correctness/clinical field.**

*(No recommendation entity exists — Guardrail 5: 6H reports measurements only, and there is no membership/metric
column that could surface a Program-5 narrative/PHI — Guardrail 1.)*

## 5. Window lifecycle, membership & immutability (Decisions 2/9 + Guardrails 3/4)
A manual `clinicalperf:run` selects a model version, a time window, a cohort, and optional inputs (a 6F baseline; an
opt-in to read reference-only Program-5 operational timing). The service materializes the **exact eligible members**
(6C `InferenceRecord`s and/or 6E `HumanReviewDecision`s in the window + cohort) as immutable `ClinicalPerfWindowMember`
rows (Guardrail 3), verifies source compatibility (Guardrail 4 — else `UNAVAILABLE`), runs the deterministic stub,
validates all numerics + provenance **before** persistence, and writes the window + members + metrics **atomically**.
Re-computation makes a **new** window (Decision 9); current state/trend is derived, never stored.

## 6. Observed / synthetic / unavailable, cohorts & sparsity (Decisions 5/6/7/8/10 + Guardrail 2)
Every metric carries `provenance ∈ {OBSERVED, SYNTHETIC_STUB, UNAVAILABLE}` + `cohort` + `sourceSubsystem`. `OBSERVED`
measurements are computed from real recorded evidence (review decisions, inference timing, coded Program-5 operational
timestamps); operational KPIs the stub cannot ground are `SYNTHETIC_STUB` or `UNAVAILABLE` — never presented as
observed. Empty/sparse windows record truthful `sampleCount` + `coverageStatus` + `UNAVAILABLE` reason (no invented
KPI). `validationOnly` evidence is a separate cohort — never silently aggregated with clinical evidence. Reader
agreement + concordance are **consistency** measures, never correctness (Decisions 5/6).

## 7. Program-5 interaction — reference-only operational metadata (Decision 4 + Guardrail 1)
When operational KPIs require it, 6H reads Program-5 **coded operational metadata only** — identifiers, timestamps,
coded status/workflow state, authorization/review timing — **by identity, never the narrative/findings/PHI**, and
**never modifies** any Program-5 object. The schema exposes no relation or column that could surface clinical narrative
content; `operationalDataUsed` records whether any such read occurred. If a required operational input is absent or
incompatible, the affected metric is `UNAVAILABLE` (Guardrail 4).

## 8. Determinism, permissions & claim boundary (Decisions 1/11 + Guardrails 2)
A provider-independent evaluator interface with a **deterministic non-clinical stub** only. Identical (model snapshot,
member set, baseline snapshot, cohort, config, evaluator version) → identical metrics + `calculationId`; a stable
`windowSignature` supports duplicate detection. Permissions `clinicalperf:view/run/manage` — no default grant; `run`
distinct from `view`; `manage` administrative only, **no clinical/diagnostic/lifecycle authority**; no
evidence-mutation route. No field/value asserts clinical validity, safety, effectiveness, regulatory, superiority, or
diagnostic accuracy (Decision 1). No PHI.

## 9. Migration, trigger & dependencies
One additive timestamped migration (5 enums + ~3 tables + indexes + `Restrict` FKs). **Manual `clinicalperf:run`
only — no worker/scheduler** (Decision 2). Plain validated numeric/coded columns — **no raw-SQL-only invariant
expected**; the design does not pre-decide this (if implementation reveals a relational invariant Prisma cannot
express, the gate installs + verifies it — the 6C lesson). **No change** to any Program 5 / 6A–6G model or the clinical
path; **no new runtime dependency**. Additive-only.

## 10. Acceptance design (folded gate; run only under a future authorization)
`scripts/seed-clinical-perf-acceptance.ts` + `scripts/assert-clinical-perf-state.ts` + a
`p6-clinical-perf-acceptance.yml` gate (registered byte-identically on `main` under its own authorization; **checkout
`fetch-depth: 0`**; install + verify any raw-SQL-only invariant if one is introduced). Persisted-truth assertions:
additive schema (enums/tables/columns/RESTRICT FKs); immutable window + membership snapshot (Guardrail 3)
reconstructable; measurement provenance (observed/synthetic/unavailable + source subsystem + cohort — Guardrail 2);
reader-agreement/concordance are consistency (never correctness) measures; structured metrics (no JSON) + validated
bounds; truthful empty/sparse (no synthetic KPI as observed); cohort separation (validationOnly not mixed); operational
data isolation (Guardrail 1 — no narrative/PHI column/relation; reference-only; Program-5 untouched); operational
compatibility → UNAVAILABLE not coerced (Guardrail 4); **no recommendation entity/route** (Guardrail 5); deterministic
calculationId + windowSignature; atomic all-or-nothing + explicit completion state; append-only (re-compute = new
window); eligibility; **claim-boundary enforcement** (no clinical/safety/effectiveness/regulatory/diagnostic
terminology — Decision 1); **no support diagnostic authority / no lifecycle mutation / no clinical mutation** (Program
5 + 6A–6G byte-identical after a run); permission separation + no default grant + no clinical/diagnostic authority; no
PHI; tenancy + cross-lab fail-closed; Program-5/6A-6G non-regression; strict TypeScript. **The gate does not declare
Program 6 complete** (Guardrail 6).

## 11. Explicitly NOT in 6H
real clinical performance / clinical validity / safety / effectiveness / regulatory / diagnostic-correctness or
superiority/non-inferiority claims · any diagnosis creation/modification or clinical sign-out/authorization · any
lifecycle transition or recommendation (retire/promote/deploy/clinical) · reading any Program-5 narrative/finding/PHI ·
any worker/scheduler/automatic trigger · any mutation of Program 5 or accepted 6A/6B/6C/6D/6E/6F/6G · **any declaration
that Program 6 is complete** (a separate post-program governance activity).

## 12. Verdict
**PROGRAM 6 · PHASE 6H — DESIGN APPROVED**, twelve decisions + six additional guardrails recorded (§2–§3).
Implementation is authorized only by a subsequent explicit instruction; this document is the design of record it
follows. Completion of 6H does not, by itself, declare Program 6 complete (Guardrail 6).
