# Program 6 · Phase 6D — Explainability — DESIGN APPROVED (implementation target)

**Status:** **DESIGN APPROVED (2026-07-30).** Fourteen governance decisions recorded below (eleven preflight + three
additional constraints). **Implementation NOT yet authorized** — this is the approved design of record a future
authorized implementation follows. References — never modifies — the frozen Program 5 slide foundation, the accepted
Program 6A registry (`p6-6a-accepted → 391dcd8`), the accepted 6B datasets (`p6-6b-accepted → 1c27092`), and the
accepted 6C inference engine + immutable `InferenceRecord` (`p6-6c-accepted → 1e31c4f`), and stays additive. Charter:
[`PROGRAM_6_CHARTER.md`](./PROGRAM_6_CHARTER.md). Preflight baseline: `origin/feat/program-6-ai-foundation` @ `d21ef0b`.

---

## 1. Scope (6D only)
The governed **explainability-artifact architecture** — **explanatory aids only, never a claim of correctness**
(charter §3). 6D delivers immutable explainability artifacts attached to a **completed, successful** inference,
structured artifact schemas, digest/reference storage, a deterministic generation contract, permissioned **manual**
generation, and a **deterministic, non-clinical stub generator**. It does **not** compute real explainability, assert
model accuracy/reliability, identify disease, justify an inference result, calculate clinical confidence, represent
ground truth, or perform real saliency/attention/feature-attribution. Concrete ML explainability adapters are deferred.
No dataset coupling, no metrics, no human-review/approval workflow, no clinical interpretation (later phases).

## 2. Recorded governance decisions
1. **6D produces the governed architecture + a deterministic non-clinical stub — not real clinical explainability.**
   The stub may emit synthetic heatmaps/overlays/regions/distributions suitable for testing the architecture. It must
   **not** explain why a diagnosis is correct, claim accuracy/reliability, identify disease, justify a result,
   calculate clinical confidence, represent ground truth, or perform real saliency/attention/attribution. Concrete ML
   adapters remain deferred.
2. **One governed `ExplainabilityArtifact` aggregate** with an artifact-kind enum `{ HEATMAP, ATTENTION_OVERLAY,
   FEATURE_REGION, PROBABILITY_DISTRIBUTION }`. The common row carries immutable identity, lab scope, `InferenceRecord`
   reference, kind, generator id + version, config digest, content digest, optional opaque content reference,
   validation-only provenance, coordinate-space metadata (where applicable), created-at, and a deterministic event
   identity. Kind-specific content uses **tightly-validated structures**, never unrestricted arbitrary JSON. **No raw
   image bytes, slide tiles, patient data, or PHI.**
3. **"Assists, never asserts correctness" — enforced structurally, not merely documented.** Artifacts are
   non-authoritative explanatory aids — not predictions, diagnoses, ground truth, validation evidence, or proof of
   correctness. The schema and DTOs must contain **no** field such as `diagnosis`, `correct`, `accuracy`,
   `clinicalConfidence`, `groundTruth`, `validated`, or `approvedInterpretation`. Every artifact **inherits the
   originating record's immutable `validationOnly` status** and may never promote/override the lifecycle or evidentiary
   status of the model or the inference record.
4. **Immutable & append-only, attached via `ON DELETE RESTRICT`** to `InferenceRecord`. No update/overwrite/in-place-
   replace/delete path through product services. A completed inference may have multiple artifact kinds. **Regeneration
   creates a NEW immutable artifact set with new identities + provenance; it never mutates prior artifacts.**
5. **Eligibility:** only an inference with `outcome = SUCCEEDED` is eligible; `FAILED` / timed-out / incomplete are
   ineligible. VALIDATION-run inference is eligible but **all** resulting artifacts remain **validation-only**;
   APPROVED-model inference is eligible **without implying clinical correctness**. 6D introduces **no** dataset
   coupling, dataset-scale generation, model validation, accuracy metrics, human-review/approval workflow, or clinical
   interpretation.
6. **Probability distributions** are structured numeric data over **coded, non-diagnostic** categories. Each entry
   carries only a stable coded class id, a finite numeric value, and deterministic ordering. **Values must sum to 1.0
   within an accepted numeric tolerance** (a clear, testable invariant — required for the stub and for stored
   distributions). Coded classes are **not** diagnoses/clinical conclusions; free-text labels are **not** accepted as
   authoritative class identity; a probability value is **not** "clinical confidence."
7. **Feature-region geometry** is entirely separate from `SlideAnnotation`, `GroundTruthLabel`, and human-authored
   viewer markup. Slide **pixel space** with explicit coordinate-space provenance. Approved geometry: **bounding box**
   and **polygon**. Coordinates must be finite, non-negative, and validated against the slide's known dimensions when
   available. **Coded region categories only** — no diagnostic narrative, no human ground-truth semantics.
8. **Trigger = a separate, explicit manual operation** (`explainability:generate`) from an already-completed
   `InferenceRecord`. **Not** generated automatically during 6C terminalization (preserves the frozen 6C execution
   boundary; no retroactive coupling). No event/scheduler/dataset/automatic background trigger. A worker runtime may
   exist **only if the approved design needs one** and must be **disabled by default and under test**; a
   synchronous/manual service is preferred when it preserves provenance + determinism without queue complexity.
9. **Permissions** `explainability:view` / `explainability:generate` / `explainability:manage` — **no default grant**;
   `view` ⊉ `generate`; `generate` ⊉ `manage`. `generate` must also enforce access to the referenced inference + lab.
   `manage` governs administrative configuration/operational actions — **never** artifact rewriting (artifacts are
   immutable).
10. **Determinism.** The default stub generator is deterministic: identical (inference-record identity + immutable
    provenance, artifact request, generator version, config digest) → **identical artifact content + content digests**.
    New rows may take new identities/timestamps, but the generated **semantic content is identical** — so determinism
    coexists with append-only regeneration (this distinction is explicit so the two never conflict).
11. **Acceptance-gate carry-forward (the 6C lesson).** Any invariant introduced via raw migration SQL and omitted by
    Prisma datamodel reconstruction must be **installed explicitly by the folded gate, verified against DB truth before
    tests, and exercised in persisted-state assertions**. 6D should **avoid** specialized geometry extensions/indexes
    unless demonstrably required — **plain validated numeric coordinates suffice** and reduce migration/portability risk.
12. **Artifact-set provenance.** A single generation request may create several artifacts; they **share an immutable
    generation / artifact-set identifier**, proving a heatmap + overlay + feature regions + probability distribution
    came from the **same deterministic generation request** — without making them mutable children of one another.
13. **Generator boundary.** Define an `ExplainabilityGenerator` interface analogous to the 6C adapter boundary. 6D
    ships **only** the interface + a deterministic non-clinical stub. **No** ONNX/Torch/scanner-vendor/saliency/
    Grad-CAM/attention/external-service implementation is authorized.
14. **No support inference.** Explainability generation must **not** modify `InferenceRecord`, its `outcome`, its
    `resultDigest`/`resultRef`, model lifecycle status, or validation status. An explainability artifact is
    **downstream evidence only**.

## 3. Schema (net-new; additive migration; lab-scoped; immutable-by-idiom; reference-not-copy)
All tables: `labId String` + `@@index([labId])` (auto-tenancy); provenance FKs `onDelete: Restrict`; permanent UUIDs.

- `enum ExplainabilityArtifactKind { HEATMAP ATTENTION_OVERLAY FEATURE_REGION PROBABILITY_DISTRIBUTION }`
- `enum ExplainabilityRegionType { BOUNDING_BOX POLYGON }` *(Decision 7)*

- **`ExplainabilityGeneration`** (artifact-set aggregate — Decision 12): `id`, `generationUuid @unique @default(uuid)`,
  `labId`, `inferenceRecordId → InferenceRecord (Restrict)` *(SUCCEEDED-only, enforced in service — Decision 5)*,
  `generatorId`, `generatorVersion`, `configDigest?`, `validationOnly Boolean` *(inherited immutably from the record —
  Decision 3/5)*, `eventId` *(deterministic event identity)*, `createdById?` (no FK), `createdAt`. Append-only.

- **`ExplainabilityArtifact`** (common row — Decision 2): `id`, `artifactUuid @unique @default(uuid)`, `labId`,
  `generationId → ExplainabilityGeneration (Restrict)`, `inferenceRecordId → InferenceRecord (Restrict)`,
  `kind ExplainabilityArtifactKind`, `generatorId`, `generatorVersion`, `configDigest?`, `contentDigest` *(sha256 of
  the structured content — evidence without copying)*, `contentRef?` *(opaque reference; NO bytes/tiles/PHI)*,
  `validationOnly Boolean`, `slideId? → DigitalSlide (Restrict)` *(coordinate-space subject; reference only)*,
  `coordinateSpace String?` *(explicit provenance, e.g. "slide-pixel@sourceWidth×sourceHeight")*, `createdAt`.
  **No** `diagnosis`/`correct`/`accuracy`/`clinicalConfidence`/`groundTruth`/`validated`/`approvedInterpretation`
  columns (Decision 3). Kind-specific content lives in the tightly-validated child rows below (not arbitrary JSON):

- **`ExplainabilityRegion`** (FEATURE_REGION / heatmap-overlay geometry — Decision 7): `id`, `labId`,
  `artifactId → ExplainabilityArtifact (Restrict)`, `regionType ExplainabilityRegionType`, `categoryCode` *(coded —
  no narrative)*, `geometry Json` *(validated: box = finite non-negative x/y/w/h; polygon = ≥3 finite non-negative
  points; bounded by slide dims when known)*, `weight Float?` *(optional coded intensity; not confidence)*, `createdAt`.

- **`ExplainabilityProbability`** (PROBABILITY_DISTRIBUTION entries — Decision 6): `id`, `labId`,
  `artifactId → ExplainabilityArtifact (Restrict)`, `classCode` *(stable coded class — not a diagnosis)*, `value Float`
  *(finite)*, `ordinal Int` *(deterministic ordering)*; `@@unique([labId, artifactId, classCode])`. Service enforces
  Σ`value` = 1.0 ± tolerance (Decision 6).

*(HEATMAP / ATTENTION_OVERLAY store a `contentDigest` + optional `contentRef` on the artifact row plus, where a
region decomposition is provided, `ExplainabilityRegion` rows — never raw pixels.)*

## 4. Immutability, attachment & eligibility
Artifacts + generations + child rows are **append-only** (no update/overwrite/delete service path — Decision 4). A
generation references a **`SUCCEEDED`** `InferenceRecord` (Decision 5, service-enforced) via `RESTRICT`; ineligible
records (FAILED/timed-out/incomplete) are rejected. `validationOnly` is **inherited** from the record and frozen onto
the generation + every artifact (Decision 3/5). Regeneration makes a **new** `ExplainabilityGeneration` (new
`generationUuid`/`eventId`) with new artifacts — prior rows are never touched (Decision 4/10). Generation **never**
writes to `InferenceRecord` or any 6C/6A/6B row (Decision 14).

## 5. Generator boundary (Decision 13) & determinism (Decision 10)
An `ExplainabilityGenerator` interface (`{ generatorId, generatorVersion, generate(request, signal?) → structured
artifacts }`), with **only** a deterministic non-clinical **stub** shipping in 6D. Given identical (record identity +
immutable provenance, request, generator version, config digest) the stub yields **identical content + content
digests**; new rows may carry new ids/timestamps but identical semantic content. Config digest is a key-sorted stable
hash (the 6C idiom). No vendor/ML/external implementation.

## 6. Permissions (new `explainability` namespace; no default grant)
Add to `SPECIAL_OBJECTS`: `explainability: ['view', 'generate', 'manage']` — `view` (read generations/artifacts),
`generate` (manual generation from a completed record; also enforces access to the referenced inference + lab),
`manage` (administrative configuration/operational actions — never artifact mutation). **No default-role grant**
(super-role reach only), mirroring `aimodel:*` / `dataset:*` / `inference:*`. `generate` distinct from `view`;
`manage` distinct from `generate`.

## 7. PHI, claims & coordinate boundary (reference-not-copy; assists-not-asserts)
Slides/records referenced by **id only**; content is **digest + optional opaque reference**, never bytes/tiles/PHI.
Geometry is validated numeric slide-pixel coordinates with explicit coordinate-space provenance. No diagnostic/
correctness/accuracy/confidence field or narrative anywhere; coded classes/categories only; `validationOnly` inherited.
Artifacts are downstream evidence, never authoritative.

## 8. Trigger surface (Decision 8)
A single manual, permissioned `explainability:generate` operation over a completed `InferenceRecord` id. Synchronous
service preferred (no queue) unless the approved design demonstrably needs a worker; any worker is disabled by default
and under test. No automatic/event/scheduled/dataset trigger; no coupling to 6C terminalization.

## 9. Migration & dependencies
One additive timestamped migration (2 enums + ~4 tables + indexes + `Restrict` FKs). **Plain validated numeric
coordinates — no geometry extension/index** (Decision 11), so likely **no raw-SQL-only invariant**; if any is
introduced, the gate installs + verifies it explicitly (the 6C lesson). **No change** to any Program 5 / 6A / 6B / 6C
model; **no new runtime dependency** (stub only). Additive-only.

## 10. Acceptance design (folded gate; run only under a future authorization)
`scripts/seed-explainability-acceptance.ts` + `scripts/assert-explainability-state.ts` + a
`p6-explainability-acceptance.yml` gate (registered byte-identically on `main` under its own authorization at
acceptance time; **checkout `fetch-depth: 0`** for the lineage assertion). If any raw migration-only invariant exists,
the gate installs it after schema-from-datamodel and **before** seed/assert, and verifies it vs DB truth (6C lesson).
Persisted-truth assertions: additive schema (enums/tables/columns/RESTRICT FKs); eligibility (`SUCCEEDED` only;
FAILED/timed-out rejected); `validationOnly` inherited immutably; append-only immutability (no update/delete path;
regeneration = new set, prior untouched); artifact-set shared `generationUuid`/`eventId`; probability entries coded +
Σ=1±tolerance + deterministic ordering; region geometry validated (box/polygon, finite non-negative, bounded by slide
dims, coded categories, distinct from SlideAnnotation/GroundTruthLabel); digest/reference-only (no bytes/PHI columns);
**no diagnostic/correctness/accuracy/confidence/ground-truth field**; deterministic stub (identical inputs → identical
content digests); generation writes nothing to InferenceRecord/6C/6A/6B (no support inference); permission separation +
no default grant; tenancy + cross-lab fail-closed; Program-5/6A/6B/6C non-regression; strict TypeScript.

## 11. Explicitly NOT in 6D
real saliency/attention/attribution or any concrete ML/vendor generator · human-review Accept/Reject/Modify workflow
(6E) · validation metrics / calibration / accuracy (6F) · continuous evaluation (6G) · clinical-performance reporting
(6H) · dataset coupling / dataset-scale generation · automatic/event/scheduled generation · any diagnostic or
correctness claim · any mutation of `InferenceRecord`, `AiModelVersion`, datasets, `SlideAnnotation`, `GroundTruthLabel`,
Program 5, or accepted 6A/6B/6C.

## 12. Verdict
**PROGRAM 6 · PHASE 6D — DESIGN APPROVED**, fourteen governance decisions recorded (§2). Implementation is authorized
only by a subsequent explicit instruction; this document is the design of record it will follow.
