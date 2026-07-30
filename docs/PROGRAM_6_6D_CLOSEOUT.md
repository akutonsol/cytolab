# Program 6 · Phase 6D — Explainability — Acceptance Closeout

**Status:** **ACCEPTED · FROZEN.** The governed explainability-artifact architecture only — **explanatory aids that
assist, they never assert correctness** (charter §3). Immutable, append-only artifacts attached to a completed
(`SUCCEEDED`) 6C `InferenceRecord` by identity (`RESTRICT`); a single generation request produces the complete
artifact set **atomically** under one shared identity; every geometry-bearing artifact records immutable
coordinate-space provenance; content is **digest/reference only** — no bytes/tiles/PHI. The default generator is a
**deterministic, non-clinical stub**. **No diagnostic interpretation, no correctness/accuracy/confidence claim, no
ground truth, no dataset/human-review/validation coupling, no support inference.** A parallel subsystem that
references the frozen Program 5 slide foundation, the accepted Program 6A registry, the accepted 6B datasets, and the
accepted 6C inference engine + immutable `InferenceRecord`, and modifies none of them. Charter:
[`PROGRAM_6_CHARTER.md`](./PROGRAM_6_CHARTER.md) · Design of record: [`PROGRAM_6_6D_DESIGN.md`](./PROGRAM_6_6D_DESIGN.md).

---

## 1. Accepted scope
- **One governed `ExplainabilityArtifact` aggregate** with kind enum `{ HEATMAP, ATTENTION_OVERLAY, FEATURE_REGION,
  PROBABILITY_DISTRIBUTION }`; kind-specific content in **tightly-validated child rows** (`ExplainabilityRegion`,
  `ExplainabilityProbability`), never arbitrary JSON.
- **Artifact-set aggregate** (`ExplainabilityGeneration`, Guardrail 2) — one deterministic generation request → one
  atomic, immutable set sharing `generationUuid` + `eventId`.
- **"Assists, never asserts correctness" enforced structurally** — no `diagnosis`/`correct`/`accuracy`/
  `clinicalConfidence`/`groundTruth`/`validated`/`approvedInterpretation` column anywhere; `validationOnly` inherited
  immutably from the record; artifacts never promote/override model or inference status.
- **Immutable & append-only** — attached to `InferenceRecord` via `ON DELETE RESTRICT`; no update/overwrite/delete
  service path; regeneration creates a **new** immutable set, never mutating prior rows.
- **Eligibility** — only a `SUCCEEDED` inference record is eligible; `FAILED`/incomplete are rejected. VALIDATION-run
  explainability is `validationOnly`; APPROVED-model explainability implies no clinical correctness.
- **Probability distributions** — coded, non-diagnostic classes; finite values; deterministic ordering; **Σ = 1.0 ±
  tolerance** (a testable invariant).
- **Feature regions** — validated slide-pixel geometry (bounding box / polygon; finite, non-negative, bounded by
  slide dims when known); coded categories; **distinct from `SlideAnnotation` and `GroundTruthLabel`**.
- **Coordinate-space provenance** (Guardrail 1) — the generation snapshots `coordinateSpace` + slide dimensions used;
  geometry-bearing artifacts carry the coordinate space + slide reference — so future viewer changes cannot alter the
  meaning of historical geometry.
- **Provider-independent generator boundary** — an `ExplainabilityGenerator` interface; **only** a deterministic
  non-clinical stub ships. No saliency/Grad-CAM/attention/ONNX/Torch/scanner-vendor/external implementation.
- **Deterministic generation** — identical (record identity + provenance, request, generator version, config digest)
  → identical content + content digests (new rows take new identities/timestamps; semantic content is identical).
- **Manual trigger only** — `explainability:generate` from a completed record; no automatic/event/scheduled/dataset
  generation; no worker (a synchronous service preserves provenance + determinism + atomicity).
- **Permissions** `explainability:view` / `explainability:generate` / `explainability:manage` — granted to **no
  default role** (super-role reach only); `generate` distinct from `view`; **no artifact-mutation route** exists.
- **All Program 6D provenance foreign keys use `ON DELETE RESTRICT`** (11 FKs). **No support inference** — generation
  never writes `InferenceRecord`, its outcome/result, model lifecycle, or validation status.

## 2. Accepted implementation lineage
| SHA | Meaning |
|---|---|
| `33f9738` | Program 6D design-of-record baseline (fourteen governance decisions + two guardrails) |
| **`dd3338e`** | **6D implementation candidate** (schema + migration + module + specs + seed permission) |
| `b20a69c` | final exact-head candidate (acceptance gate + seed/assert scripts; product unchanged from `dd3338e`) |

The implementation is unchanged from `dd3338e`: `git diff dd3338e b20a69c` touches **0 product files** — the delta is
the acceptance gate (workflow + two scripts + `apps/web/acceptance/.gitignore`). 6D is **purely additive** — no
accepted-phase test required modification (the 6A shell test is untouched).

**CI infrastructure commits (recorded separately — NOT part of the accepted implementation lineage):**
| SHA (on `main`) | Meaning |
|---|---|
| `5fd274e` | 6D gate registration on `main` (default-branch `workflow_dispatch` registration; byte-identical blob `d5f83a5` to branch copy `b20a69c`) |

This `main` commit is **CI registration infrastructure only** — a `workflow_dispatch`-only gate, byte-identical to the
Program 6 branch copy. It is not the accepted Phase 6D implementation and carries no product/schema/runtime change.

## 3. Authoritative acceptance evidence
- **Workflow:** `p6-explainability-acceptance`
- **Run number:** `1` · **Run ID:** `30558022107`
- **Event:** `workflow_dispatch` · **Branch:** `feat/program-6-ai-foundation`
- **Exact tested SHA:** `b20a69c` (run header + in-run `git rev-parse HEAD == github.sha`, and
  `git merge-base --is-ancestor dd3338e HEAD` — the lineage proof — satisfied)
- **Conclusion:** `success`

Accepted results:
- explainability tables: **4** (`ExplainabilityGeneration`, `ExplainabilityArtifact`, `ExplainabilityRegion`, `ExplainabilityProbability`) · enums: **2** (`ExplainabilityArtifactKind`, `ExplainabilityRegionType`)
- provenance foreign keys: **11, all `RESTRICT`**
- persisted-state assertions: **all passed** (artifact-set hierarchy + immutable identity, SUCCEEDED-only eligibility, validation-only inheritance, coordinate-space provenance, probability normalization Σ=1±tol, region validation, deterministic generation, append-only regeneration, atomic all-or-nothing persistence, no support inference, no prohibited semantic columns, no PHI, digest/reference-only storage, permission separation + no default grant, no mutation route, Program-5/6A/6B/6C non-regression)
- focused explainability tests: **26/26** (4 suites)
- Program-5 / 6A / 6B / 6C non-regression tests: **68/68** (13 suites)
- TypeScript: **zero errors** (strict `npx tsc --noEmit -p tsconfig.json`, exit 0)
- evidence artifact: **`p6-6d-explainability-acceptance`** generated (schema SQL + fixtures)

**Gate note:** 6D introduces **no** raw-SQL migration-only invariant (plain validated numeric coordinates), so — unlike
the 6C gate — there is **no** explicit raw-index install step; the from-datamodel reconstruction produced the complete
schema, and persisted-state assertions verified the artifact hierarchy, immutability, and boundaries against DB truth.

## 4. Frozen reconciliation decisions
- Explainability is **downstream evidence only** — it never becomes diagnosis, validation, ground truth, human
  annotation, or model evaluation.
- Artifacts are **immutable** and **append-only**; regeneration is a new set; the `InferenceRecord` is never mutated.
- Concrete ML/vendor generators, human-review workflow, validation metrics, and continuous evaluation remain
  **deferred** to later phases.
- **Program 5 remains immutable; accepted Program 6A, 6B, and 6C remain unmodified.**

## 5. Deferred scope (NOT in Phase 6D)
real saliency/attention/attribution or any concrete ML/vendor generator · human-review Accept/Reject/Modify workflow
(6E) · validation metrics / calibration / accuracy (6F) · continuous evaluation / drift (6G) · clinical-performance
reporting (6H) · dataset coupling / dataset-scale generation · automatic/event/scheduled generation · any diagnostic
or correctness claim.

## 6. Freeze statement
**Program 6 · Phase 6D is immutable at `b20a69c`.** Future work must reference the accepted Phase 6D explainability
foundation rather than modifying its accepted historical baseline. Corrections require a separately governed amendment.
