# Program 6 · Phase 6F — Validation — DESIGN APPROVED (implementation target)

**Status:** **DESIGN APPROVED (2026-07-30).** Twelve governance decisions + four additional guardrails recorded below.
**Implementation NOT yet authorized** — this is the approved design of record a future authorized implementation
follows. References — never modifies — the frozen Program 5 clinical path, the accepted Program 6A registry + model
lifecycle (`p6-6a-accepted → 391dcd8`), 6B datasets + ground truth (`p6-6b-accepted → 1c27092`), 6C inference
(`p6-6c-accepted → 1e31c4f`), 6D explainability (`p6-6d-accepted → b20a69c`), and 6E human review
(`p6-6e-accepted → 71efc5c`), and stays additive. Charter: [`PROGRAM_6_CHARTER.md`](./PROGRAM_6_CHARTER.md). Preflight
baseline: `origin/feat/program-6-ai-foundation` @ `edcaa04`.

**Governing principle (charter §3 / Decision 8):** *No component may claim anything beyond the validation evidence
actually recorded.* 6F governs what evidence may legitimately be claimed about a **model version** — it does not
establish clinical performance, certify a model, or produce regulatory claims.

---

## 1. Scope (6F only)
A governed **Validation Evidence** subsystem: **immutable validation runs**, **immutable structured metrics**,
**immutable validation provenance**, and a **deterministic non-clinical validation stub**. Each run permanently binds a
**FROZEN 6B `DatasetVersion`** (the immutable reference corpus + ground truth) to a **6A `AiModelVersion`** (the
evaluated model), and records structured metrics as evidence attached to the **model version**. **Real model-performance
computation is explicitly outside 6F.** 6F **informs** promotion but never performs it; it mutates no upstream, model
lifecycle, dataset, or clinical state. No worker, no automation, no regulatory/clinical/accuracy claim.

## 2. Recorded governance decisions
1. **6F produces a governed Validation Evidence subsystem** — immutable validation runs + immutable metrics + immutable
   provenance + a deterministic non-clinical stub. It does **not** establish real clinical performance, certify a
   model, or produce regulatory claims. Real model-performance computation is outside 6F.
2. **Validation is separate from lifecycle state.** Validation evidence **informs** promotion but **never** performs
   promotion, changes lifecycle, approves a model, or rejects a model. Promotion remains exclusively the governed human
   `aimodel:promote` action from 6A. Explicit boundary: **No support lifecycle promotion.**
3. **Dataset ↔ model linkage (the 6B-deferred relationship).** A validation run permanently binds a **Frozen
   `DatasetVersion` × `AiModelVersion`**, both references `ON DELETE RESTRICT`. Dataset requirements: **same lab,
   immutable, `FROZEN`**. Model requirements: **validatable lifecycle state, immutable identity**. This linkage is
   permanent evidence.
4. **Metrics are structured immutable evidence** — **not** JSON blobs, report text, or arbitrary documents. Structured
   child entities only. May include: confusion-matrix counts, sensitivity, specificity, precision, recall, F-score,
   ROC coordinates, calibration coordinates, operating thresholds. **Every numeric value is validated.** No PHI, no
   slide diagnosis, no narrative clinical report.
5. **Validation belongs to the model version** — attached to the **`AiModelVersion`**, not to an inference, slide,
   patient, or dataset. The dataset is the immutable reference corpus; the evidence belongs to the evaluated model
   version.
6. **Immutability.** Validation runs are immutable; revalidation creates a **new** run; the current validation state
   (where needed) is **derived**; nothing is rewritten.
7. **Eligibility.** Dataset: **`FROZEN` only**. Model lifecycle: **`VALIDATION` or `APPROVED`** eligible; `DRAFT` /
   `DEPRECATED` / `RETIRED` ineligible (prevents validating unfinished/retired artifacts while allowing evidence to
   accumulate for approved versions).
8. **Claim boundary (the governing principle).** No component may claim anything beyond the validation evidence
   actually recorded. Allowed: *"validated against dataset X"*, *"sensitivity recorded"*. **Not** allowed: *clinically
   accurate*, *proven safe*, *FDA validated*, *diagnostic quality* — unless future governed evidence explicitly
   supports them. Schema/DTO field names and stored values must not assert any such claim.
9. **Permissions** `validation:view` / `validation:run` / `validation:manage` — **no default grant**. `manage`
   governs workflow only, **never** authority (never rewrites evidence, promotes a model, or asserts a claim).
10. **Trigger.** Validation is initiated **manually**. No worker, scheduler, inference-completion trigger, automatic
    recomputation, or lifecycle-event hook.
11. **Existing-subsystem protection.** Validation must never mutate the AI Registry (6A), Dataset Governance (6B),
    Inference (6C), Explainability (6D), Human Review (6E), the clinical workflow, `ResultSheet`, `Record`, or
    `AiDraft` — **and never mutates model lifecycle**.
12. **Acceptance gate.** No raw-SQL invariant appears necessary; expect the standard folded gate — `fetch-depth: 0`
    lineage verification, persisted-state assertions vs DB truth, focused 6F tests, 6A–6E regression, Program 5
    regression, strict TypeScript.

## 3. Additional guardrails
- **Guardrail 1 — Dataset identity snapshot.** A validation run permanently snapshots the **dataset version identity**,
  **dataset `manifestDigest`**, and a **ground-truth snapshot digest**. Future dataset changes (even new frozen
  versions) must never change what was validated.
- **Guardrail 2 — Model identity snapshot.** A validation run permanently snapshots the **model version identity**
  (`versionUuid`), **model/registry identity** (`modelUuid`), **adapter identity/version where applicable**, and the
  **model artifact digest** (`artifactDigest`). Future registry evolution must never alter validation provenance.
- **Guardrail 3 — Metric provenance.** Every aggregate metric identifies its **numerator source**, **denominator
  source**, **computation version**, and **deterministic calculation identifier** — so that even a stub-produced metric
  is traceable to how it was produced.
- **Guardrail 4 — Validation reproducibility.** Two runs with identical **model snapshot + frozen dataset snapshot +
  validation configuration** produce **identical deterministic stub output** (mirrors 6C/6D determinism).

## 4. Schema (net-new; additive migration; lab-scoped; immutable-by-idiom; reference-not-copy)
All tables: `labId String` + `@@index([labId])` (auto-tenancy); provenance FKs `onDelete: Restrict`; permanent UUIDs.
Terminology names evidence, never authority (Decision 8): `validationRun`/`metricKind`/`metricValue` — never
`certified`/`approved`/`clinicallyAccurate`/`fdaValidated`/`diagnosticQuality`/`provenSafe`.

- `enum ValidationMetricKind { CONFUSION_MATRIX SENSITIVITY SPECIFICITY PRECISION RECALL F_SCORE ROC_POINT CALIBRATION_POINT OPERATING_THRESHOLD }`

- **`ValidationRun`** (immutable evidence aggregate — Decisions 1/3/5/6 + Guardrails 1/2): `id`,
  `runUuid @unique @default(uuid)`, `labId`, `modelVersionId → AiModelVersion (Restrict)`,
  `datasetVersionId → DatasetVersion (Restrict)`. Guardrail-1 dataset snapshot: `datasetManifestDigest`,
  `groundTruthDigest`. Guardrail-2 model snapshot: `modelVersionUuid`, `modelUuid`, `modelArtifactDigest?`,
  `adapterId?`, `adapterVersion?`, `modelLifecycleStateAtRun AiModelLifecycleState`. Guardrail-3/4 computation
  provenance: `validatorId`, `validatorVersion`, `computationVersion`, `configDigest?`, `calculationId` (deterministic
  identifier). `eventId String` (immutable audit identity), `createdById?` (no FK), `createdAt`. Append-only; no
  update/delete path. Eligibility (FROZEN dataset + VALIDATION/APPROVED model) enforced in the service (Decision 7).

- **`ValidationMetric`** (structured immutable metric — Decision 4 + Guardrail 3): `id`, `labId`,
  `runId → ValidationRun (Restrict)`, `metricKind ValidationMetricKind`, `labelClassCode String?` (coded class the
  metric is scoped to — never a diagnosis name; null for overall), `value Float?` (validated finite; ratios in [0,1]),
  `numeratorSource String?`, `denominatorSource String?`, `ordinal Int`, `createdAt`. `@@index`.

- **`ValidationConfusionCell`** (structured confusion-matrix counts — Decision 4): `id`, `labId`,
  `runId → ValidationRun (Restrict)`, `trueClassCode String`, `predClassCode String` (coded — never a diagnosis),
  `count Int` (validated ≥ 0), `createdAt`. `@@unique([labId, runId, trueClassCode, predClassCode])`.

- **`ValidationCurvePoint`** (ROC / calibration coordinates as structured points — Decision 4): `id`, `labId`,
  `runId → ValidationRun (Restrict)`, `curveKind ValidationMetricKind` (`ROC_POINT` | `CALIBRATION_POINT`),
  `x Float`, `y Float` (validated finite; coordinates in [0,1]), `threshold Float?` (associated operating threshold),
  `ordinal Int`, `createdAt`. `@@index`.

*(Operating thresholds are `ValidationMetric` rows of kind `OPERATING_THRESHOLD` and/or the `threshold` on a curve
point; all numeric values are validated — Decision 4.)*

## 5. Immutability, dataset↔model linkage & eligibility (Decisions 3/5/6/7 + Guardrails 1/2)
A run references a **FROZEN `DatasetVersion`** (service-enforced `state = FROZEN`, same lab) and an `AiModelVersion`
whose lifecycle is **`VALIDATION` or `APPROVED`** (service-enforced); both `RESTRICT`. At creation the run **snapshots**
the dataset (`manifestDigest` + a ground-truth digest computed over the frozen `GroundTruthLabel` set) and the model
(`versionUuid`/`modelUuid`/`artifactDigest`/lifecycle-state-at-run) so later evolution never alters the evidence
(Guardrails 1/2). Runs + metrics + cells + curve points are **append-only** (no update/delete path); revalidation is a
**new** run; the current/derived validation state is computed, never rewritten (Decision 6).

## 6. Deterministic validation stub & metric provenance (Guardrails 3/4 + Decision 1)
A provider-independent validator interface with a **deterministic non-clinical stub** as the only shipped
implementation. Given identical (model snapshot, frozen-dataset snapshot, validation configuration) it yields
**identical metrics + confusion cells + curve points** (Guardrail 4) — derived deterministically from the frozen
ground truth + snapshot digests, computing no real predictions. Every metric records `numeratorSource`,
`denominatorSource`, `computationVersion`, and the run's deterministic `calculationId` (Guardrail 3). **Real
model-performance computation is out of scope.**

## 7. Permissions (new `validation` namespace; no default grant)
Add to `SPECIAL_OBJECTS`: `validation: ['view', 'run', 'manage']` — no default-role grant (super-role reach only),
mirroring `aimodel:*`/`dataset:*`/`inference:*`/`explainability:*`/`review:*`. `run` (create a validation run) distinct
from `view`; `manage` is administrative workflow only — never rewrites evidence, promotes a model, or asserts a claim.

## 8. Claim, PHI & lifecycle boundary (Decisions 2/5/8/11)
Metrics are aggregate over the dataset version, attached to the **model version** — never per-slide/patient/inference
diagnostic claims. No column or value asserts certification, clinical accuracy, safety, regulatory, or diagnostic
quality. No PHI (slides/records referenced only via the frozen dataset's identity-only membership; digests, not
content). Validation **informs** promotion but the system **never** promotes, changes lifecycle, approves, or rejects a
model (**no support lifecycle promotion**), and never writes 6A/6B/6C/6D/6E or the clinical path.

## 9. Trigger surface (Decision 10)
A single manual, permissioned `validation:run` over an eligible (`VALIDATION`/`APPROVED`) model version + a `FROZEN`
dataset version. No worker, scheduler, inference-completion trigger, automatic recomputation, or lifecycle-event hook.

## 10. Migration & dependencies
One additive timestamped migration (1 enum + ~4 tables + indexes + `Restrict` FKs). Plain validated numeric/coded
columns — **no raw-SQL-only invariant expected** (if one is introduced, the gate installs + verifies it — the 6C
lesson). **No change** to any Program 5 / 6A / 6B / 6C / 6D / 6E model or the clinical path; **no new runtime
dependency**. Additive-only.

## 11. Acceptance design (folded gate; run only under a future authorization)
`scripts/seed-validation-acceptance.ts` + `scripts/assert-validation-state.ts` + a `p6-validation-acceptance.yml`
gate (registered byte-identically on `main` under its own authorization; **checkout `fetch-depth: 0`**). Persisted-truth
assertions: additive schema (enum/tables/columns/RESTRICT FKs); dataset↔model linkage bound to a **FROZEN** dataset +
**VALIDATION/APPROVED** model (ineligible states + non-frozen dataset rejected, cross-lab fails closed); dataset +
model identity snapshots recorded (Guardrails 1/2) and independent of later dataset/registry evolution; structured
validated metrics/confusion-cells/curve-points (ratios/coordinates in [0,1], counts ≥ 0; no JSON blob/narrative);
metric provenance present (numerator/denominator/computationVersion/calculationId — Guardrail 3); deterministic stub
reproducibility (identical snapshot+config → identical output — Guardrail 4); append-only immutability (no update/delete;
revalidation = new run; derived current state); validation **attached to the model version** not slide/inference; no
claim/clinical-authority/PHI columns (Decision 8); **no support lifecycle promotion** (model lifecycle unchanged after a
run) and no write to 6A–6E or the clinical path; permission separation + no default grant; tenancy + cross-lab
fail-closed; Program-5/6A-6E non-regression; strict TypeScript.

## 12. Explicitly NOT in 6F
real model-performance computation / real predictions · model certification / regulatory or clinical-accuracy /
safety / diagnostic-quality claims · any lifecycle promotion or model approval/rejection · continuous evaluation /
drift (6G) · clinical-performance reporting (6H) · automatic/scheduled/event-driven validation or recomputation · any
mutation of Program 5 or accepted 6A/6B/6C/6D/6E (including model lifecycle) or the clinical `Record`/`ResultSheet`/
`AiDraft` path.

## 13. Verdict
**PROGRAM 6 · PHASE 6F — DESIGN APPROVED**, twelve decisions + four guardrails recorded (§2–§3). Implementation is
authorized only by a subsequent explicit instruction; this document is the design of record it will follow.
