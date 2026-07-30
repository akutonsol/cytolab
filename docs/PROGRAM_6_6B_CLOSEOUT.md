# Program 6 · Phase 6B — Dataset Governance — Acceptance Closeout

**Status:** **ACCEPTED · FROZEN.** The dataset-governance architecture only — lab-scoped validation datasets,
pointer-only training-dataset references, immutable dataset versions with a DRAFT→FROZEN lifecycle, dataset
provenance and purpose, inclusion/exclusion membership referencing Program-5 slides **by identity only**, structured
ground-truth labels, and append-only annotation lineage. **No inference, training, model linkage, validation metrics,
explainability, human-review workflow, continuous evaluation, or clinical-performance functionality.** A parallel
subsystem that references the frozen Program 5 baseline and the accepted Program 6A foundation and modifies nothing in
either. Charter: [`PROGRAM_6_CHARTER.md`](./PROGRAM_6_CHARTER.md) · Design of record:
[`PROGRAM_6_6B_DESIGN.md`](./PROGRAM_6_6B_DESIGN.md).

---

## 1. Accepted scope
- **Two dataset kinds** (`DatasetKind`) — `VALIDATION` (governed slide-membership versions) and `TRAINING_REFERENCE`
  (pointer-only external references). Kind is enforced: versions exist only for `VALIDATION`; training references exist
  only for `TRAINING_REFERENCE`.
- **Lab-scoped datasets** (`Dataset`) — tenant-scoped via the Prisma tenancy extension (`labId`), cross-lab access
  fails closed; dataset `key` unique per lab (`@@unique([labId, key])`); immutable `datasetUuid` identity.
- **Immutable dataset versions** (`DatasetVersion`) — `versionNumber` unique per dataset (`@@unique([labId, datasetId,
  versionNumber])`), immutable `versionUuid`, immutable `purpose` (`DatasetPurpose`) captured as provenance at creation.
- **DRAFT→FROZEN lifecycle** (`DatasetVersionState`) — freeze via compare-and-set (`updateMany where state:'DRAFT'`),
  computing a `manifestDigest` (sha256 over membership + labels). A frozen version is immutable: membership and label
  mutations are rejected; re-freeze is rejected; **corrections require a new version**.
- **Slide membership by identity** (`DatasetSlide`) — `INCLUDED`/`EXCLUDED` membership referencing `DigitalSlide` and
  `Specimen` by relation (id) only; excluded members carry an `exclusionReason`. No PHI is denormalised into any 6B table.
- **Structured ground-truth labels** (`GroundTruthLabel`) — coded `labelSchemaKey`/`labelSchemaVersion`/`labelValue`,
  one label per `(datasetVersion, slide, labelSchemaKey)` (`@@unique`), distinct from `SlideAnnotation`.
- **Append-only annotation lineage** (`AnnotationLineageEvent`) — exactly one event per label assertion (including
  corrections during DRAFT); shared `eventId`; `AnnotationMethod` provenance; `onDelete: Restrict`.
- **Pointer-only training references** (`TrainingDatasetReference`) — `descriptor` + `provenanceUri` + `contentDigest`;
  no PHI, no copied content.
- **Separate permissions** `dataset:view`, `dataset:manage`, `dataset:freeze` — granted to **no default role**
  (super-role reach only); `freeze` (lifecycle transition) distinct from `manage`.
- **All Program 6B provenance foreign keys use `ON DELETE RESTRICT`** (14 FKs) — accepted provenance cannot lose its
  subject/version/slide reference via a later deletion.
- **No inference, training, model linkage, validation metrics, explainability, human review, continuous evaluation, or
  clinical-performance functionality.** Dataset↔model linkage is deferred to Phase 6F.

## 2. Accepted implementation lineage
| SHA | Meaning |
|---|---|
| `4e7ff36` | Program 6B design-of-record baseline |
| `80063a4` | 6B implementation candidate (schema + migration + module + specs + seed permission) |
| `bf79a04` | 6B folded acceptance gate (workflow + seed/assert scripts) — first authoritative dispatch |
| **`1c27092`** | **final exact-head candidate (full-history checkout correction; product unchanged from `80063a4`)** |

The implementation itself is unchanged from `80063a4`: `git diff 80063a4 1c27092` touches **0 product files** — the
delta is the acceptance gate (workflow + two scripts + `apps/web/acceptance/.gitignore`) plus a one-line CI checkout
correction.

**CI infrastructure commits (recorded separately — NOT part of the accepted implementation lineage):**
| SHA (on `main`) | Meaning |
|---|---|
| `0a9d87c` | initial 6B gate registration on `main` (default-branch `workflow_dispatch` registration) |
| `2067a9f` | full-history-checkout gate re-registration on `main` (byte-identical to branch copy `1c27092`) |

These `main` commits are **CI registration infrastructure only** — a `workflow_dispatch`-only gate, byte-identical
(workflow blob `cd1c22b`) to the Program 6 branch copy. They are not the accepted Phase 6B implementation and carry no
product/schema/runtime change.

## 3. Authoritative acceptance evidence
- **Workflow:** `p6-dataset-governance-acceptance` · **Workflow ID:** `323445791`
- **Run number:** `2` · **Run ID:** `30512769904`
- **Event:** `workflow_dispatch` · **Branch:** `feat/program-6-ai-foundation`
- **Exact tested SHA:** `1c27092` (run header + in-run `git rev-parse HEAD == github.sha` verified, and
  `git merge-base --is-ancestor 80063a4 HEAD` — the strengthened lineage proof — satisfied)
- **Conclusion:** `success`

Accepted results:
- dataset tables: **6** (`Dataset`, `DatasetVersion`, `DatasetSlide`, `GroundTruthLabel`, `AnnotationLineageEvent`, `TrainingDatasetReference`)
- dataset enums: **5** (`DatasetKind`, `DatasetVersionState`, `DatasetPurpose`, `DatasetSlideMembership`, `AnnotationMethod`)
- provenance foreign keys: **14, all `RESTRICT`**
- ground-truth labels: **1** · lineage events: **2** (append-only, incl. one correction)
- versions: **2** (v1 `FROZEN`, v2 `DRAFT`)
- catalogue permissions: **3** (`dataset:view/manage/freeze`), no default grant
- focused dataset-governance tests: **14/14** (3 suites)
- Program-5 / 6A non-regression tests: **30/30** (5 suites — ai-registry ×4, dicom-conformance, reporting-service)
- TypeScript: **zero errors** (strict `npx tsc --noEmit -p tsconfig.json`, exit 0)
- persisted-state assertions: **all passed** (schema, RESTRICT FKs, tenancy, cross-lab fail-closed, kind enforcement,
  pointer-only training references, DRAFT→FROZEN CAS, frozen immutability, correction-as-new-version, structured labels,
  append-only lineage, immutable purpose, no-PHI columns, no model linkage, permission separation + no default grant,
  Program-5/6A non-regression)
- evidence artifact: **`p6-6b-dataset-governance-acceptance`** generated (schema SQL + fixtures)

The first authoritative dispatch (`30512326785`, `#1`, head `bf79a04`) was **RED** — a workflow-definition defect only:
`actions/checkout@v4`'s default shallow (`fetch-depth: 1`) clone left `80063a4` outside local history, so the step-4
`git merge-base --is-ancestor` lineage check could not resolve it. No implementation, schema, seed, or assertion step
ran. The authorized one-line correction (`fetch-depth: 0`) resolved it without altering the implementation or weakening
the gate; the `#2` run at `1c27092` is the authoritative acceptance evidence.

## 4. Frozen reconciliation decisions
- Governed ground truth (`GroundTruthLabel`) remains **separate** from `SlideAnnotation`.
- Datasets reference Program-5 slides and specimens **by identity only** — **no PHI is copied** into any 6B table.
- Dataset↔model linkage, validation metrics, and any inference coupling remain **deferred to Phase 6F**; `ARCHIVED`
  dataset state is deferred.
- Frozen dataset versions are **immutable**; corrections are new versions, never in-place edits.
- **Program 5 remains immutable; accepted Program 6A remains unmodified.**

## 5. Deferred scope (NOT in Phase 6B)
inference execution · model↔dataset linkage · validation metrics or scoring · confidence calibration · explainability ·
human review workflow · continuous evaluation · clinical-performance reporting · dataset archival lifecycle.

## 6. Freeze statement
**Program 6 · Phase 6B is immutable at `1c27092`.** Future work must reference the accepted Phase 6B dataset-governance
foundation rather than modifying its accepted historical baseline. Corrections require a separately governed amendment.
