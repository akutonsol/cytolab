# Program 6 · Phase 6B — Dataset Governance — DESIGN APPROVED (implementation target)

**Status:** **DESIGN APPROVED (2026-07-29).** Governance decisions recorded below. **Implementation NOT yet
authorized** — this is the approved design of record a future authorized implementation follows. References —
never modifies — the frozen Program 5 slide/provenance foundations, the accepted Program 6A registry + inference
shell (`p6-6a-accepted → 391dcd8`), and stays additive. Charter: [`PROGRAM_6_CHARTER.md`](./PROGRAM_6_CHARTER.md).
Preflight baseline: `origin/feat/program-6-ai-foundation` @ `7e276cc`.

---

## 1. Scope (6B only)
Dataset **governance**: validation datasets, training-dataset **references**, immutable dataset versions, dataset
provenance, inclusion/exclusion rules, ground-truth labels, and annotation lineage — **referencing** Program-5
slides by identity, **never duplicating PHI**. **No** inference execution, explainability, human review, validation
**metrics**, continuous evaluation, clinical-performance reporting, **and no model-training/labeling pipeline,
federated learning, or automatic labeling** (later phases / hard non-goals).

## 2. Recorded governance decisions
1. **Two dataset kinds** — `VALIDATION` (in-platform curated membership + ground-truth labels over Program-5 slides) and `TRAINING_REFERENCE` (pointer-only provenance to an external corpus: descriptor + URI + digest; **no membership, no labels, no bytes, no PHI, no import**).
2. **Dataset↔model-version linkage DEFERRED to 6F** — datasets are standalone governed artifacts in 6B; the datasetVersion × modelVersion validation-run linkage is 6F's.
3. **Ground-truth labels immutable** — labels are part of the frozen `DatasetVersion` snapshot; corrections create a **new version** (append-only); lineage is append-only. Kept distinct from the viewer `SlideAnnotation` (a UI concept, never ML ground truth).
4. **Dataset-version lifecycle = `DRAFT → FROZEN`** (FROZEN immutable). **`ARCHIVED` is DEFERRED** until a demonstrated need (not introduced preemptively).
5. **Slides referenced by identity only** (`labId`, `slideId`, optional `specimenId`); eligibility semantics deferred (a dataset may reference any lab-owned `DigitalSlide` by id; 6F decides eligibility).
6. **Structured/coded labels and rules only — no PHI.** No free-text patient data in labels, exclusion reasons, rules, or lineage.
7. **Permissions `dataset:view` / `dataset:manage` / `dataset:freeze`** — granted to no default role (super-role reach only); `freeze` (the immutability commit) distinct from `manage`.
8. **Immutable dataset-purpose provenance** — every dataset version records a declared `purpose` (e.g. Algorithm Validation, Regulatory Submission, Internal Benchmarking, Clinical QA, Research, Demonstration), captured immutably with the frozen version. **Provenance only — never used for authorization.**

## 3. Schema (net-new; additive migration; lab-scoped; immutable-by-idiom; reference-not-copy)
All tables: `labId String` + `@@index([labId])` (auto-tenancy); provenance FKs `onDelete: Restrict`; permanent UUIDs.

- `enum DatasetKind { VALIDATION TRAINING_REFERENCE }`
- `enum DatasetVersionState { DRAFT FROZEN }`  *(ARCHIVED deferred — Decision 4)*
- `enum DatasetPurpose { ALGORITHM_VALIDATION REGULATORY_SUBMISSION INTERNAL_BENCHMARKING CLINICAL_QA RESEARCH DEMONSTRATION }`  *(provenance only — Decision 8)*
- `enum DatasetSlideMembership { INCLUDED EXCLUDED }`
- `enum AnnotationMethod { PATHOLOGIST_ASSERTED CONSENSUS IMPORTED }`

- **`Dataset`** — logical registry entry: `id @id @default(cuid)`, `datasetUuid @unique @default(uuid)`, `labId`, `key` (`@@unique([labId, key])`), `displayName`, `kind DatasetKind`, `description?`, `createdById?` (no FK), `createdAt`, `updatedAt`.

- **`DatasetVersion`** — immutable versioned snapshot: `id`, `versionUuid @unique @default(uuid)`, `labId`, `datasetId → Dataset (Restrict)`, `versionNumber Int` (`@@unique([labId, datasetId, versionNumber])`), `state DatasetVersionState @default(DRAFT)`, `purpose DatasetPurpose` (immutable; set no later than freeze), `inclusionRules Json?` (structured snapshot — slide/technical attributes only, no PHI), `manifestDigest?` (sha256 over frozen membership+labels — provenance without copying content), `createdById?`, `createdAt`, `frozenAt?`. FROZEN ⇒ immutable (membership/labels/rules/purpose fixed).

- **`DatasetSlide`** (membership; `VALIDATION` kind): `id`, `labId`, `datasetVersionId → DatasetVersion (Restrict)`, `slideId → DigitalSlide (Restrict)` *(reference only; no PHI)*, `specimenId? → Specimen (Restrict)`, `membership DatasetSlideMembership`, `exclusionReason?` (coded), `addedAt`; `@@unique([labId, datasetVersionId, slideId])`.

- **`GroundTruthLabel`**: `id`, `labId`, `datasetVersionId → DatasetVersion (Restrict)`, `slideId → DigitalSlide (Restrict)`, `labelSchemaKey`, `labelSchemaVersion`, `labelValue` (structured/coded — no PHI), `assertedById?` (no FK), `assertedAt`; `@@unique([labId, datasetVersionId, slideId, labelSchemaKey])`.

- **`AnnotationLineageEvent`** (append-only): `id`, `labId`, `groundTruthLabelId → GroundTruthLabel (Restrict)`, `method AnnotationMethod`, `actorId?` (no FK), `sourceRef?` (provenance pointer; no PHI), `eventId`, `occurredAt`. No update/delete path.

- **`TrainingDatasetReference`** (`TRAINING_REFERENCE` kind): `id`, `labId`, `datasetId → Dataset (Restrict)`, `descriptor`, `provenanceUri`, `contentDigest?` — external-corpus provenance ONLY (no slide membership, no labels, no bytes, no PHI).

## 4. Immutability & lifecycle
`DRAFT` (membership/labels/rules/purpose mutable) → **`FROZEN`** (immutable snapshot; referenceable by 6C/6F). A correction to a FROZEN version creates a **new** `DatasetVersion`; frozen rows are never mutated. `freeze` is the governance-critical action (`dataset:freeze`, CAS on `state`). Ground-truth labels + inclusion/exclusion are captured in the frozen snapshot; lineage is append-only.

## 5. Permissions (new `dataset` namespace; no default grant)
Add to `SPECIAL_OBJECTS`: `dataset: ['view', 'manage', 'freeze']` — `view` (read), `manage` (create dataset/version, edit DRAFT membership/labels/rules/purpose), `freeze` (freeze a version). **No default-role grant** (super-role reach only), mirroring `aimodel:*`. `freeze` distinct from `manage`.

## 6. PHI boundary (reference-not-copy)
Membership references slides/specimens by **id only**; labels/rules/exclusion-reasons/lineage are structured/coded with no free-text patient data; training references hold no PHI/bytes and import nothing. PHI remains solely on Program 5's `Patient`/`Record`, reached only via the slide's own `recordId` — never surfaced into a 6B table. Digest-not-content, per the C6/6A discipline.

## 7. Migration & dependencies
One additive timestamped migration (new enums + ~6 tables + indexes + Restrict FKs); **no change** to any Program 5 / 6A model; **no new dependency**. Additive-only.

## 8. Acceptance design (folded gate; run only under a future authorization)
`scripts/seed-dataset-governance-acceptance.ts` + `scripts/assert-dataset-governance-state.ts` + a
`p6-dataset-governance-acceptance.yml` gate (registered on the default branch `main` — its own explicit
authorization at acceptance time, per the 6A precedent). Persisted-truth assertions: tenancy + cross-lab
fail-closed; FROZEN versions immutable (mutation rejected, corrections → new version); membership references
slides by id with **no PHI columns**; labels structured (no PHI) + append-only lineage; inclusion/exclusion
reconstructable; immutable `purpose` recorded; dataset↔slide/specimen FKs `RESTRICT`; training references hold no
PHI/bytes; `dataset:*` no-default-grant + `freeze`≠`manage`; references (not modifies) 6A registry + Program 5;
strict TypeScript.

## 9. Explicitly NOT in 6B
inference execution/queue/worker (6C) · explainability (6D) · human-review workflow (6E) · validation metrics /
calibration (6F) · continuous evaluation (6G) · clinical-performance reporting (6H) · model-training pipeline /
automatic labeling / federated learning (hard non-goals) · any change to `AiService`/`AiDraft`/`AIScreeningResult`,
`SlideAnnotation`, Program 5, or accepted 6A models.

## 10. Verdict
**PROGRAM 6 · PHASE 6B — DESIGN APPROVED**, eight governance decisions recorded (§2). Implementation is authorized
only by a subsequent explicit instruction; this document is the design of record it will follow.
