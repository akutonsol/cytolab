# Program 6 · Phase 6C — Inference Engine — Acceptance Closeout

**Status:** **ACCEPTED · FROZEN.** The inference EXECUTION ENGINE architecture only — orchestration, never clinical
interpretation. A lab-scoped, lease-based execution/queue (`InferenceJob`) that selects an eligible model version,
invokes a **pluggable, provider-independent adapter**, and — at terminalization — writes an **immutable evidence
record once** (`InferenceRecord`, additively activating the 6A-reserved shell) plus an **append-only audit trail**
(`InferenceEvent`). The default adapter is **deterministic and non-clinical**. **No diagnostic interpretation, no
accuracy claim, no dataset-driven/automatic/scheduled execution, no vendor integrations.** A parallel subsystem that
references the frozen Program 5 slide foundation, the accepted Program 6A registry, and the accepted Program 6B
datasets, and modifies none of them. Charter: [`PROGRAM_6_CHARTER.md`](./PROGRAM_6_CHARTER.md) · Design of record:
[`PROGRAM_6_6C_DESIGN.md`](./PROGRAM_6_6C_DESIGN.md).

---

## 1. Accepted scope
- **Manual dispatch only** — the sole trigger (no automatic, event-driven, scheduled, or dataset-scale execution).
- **Model-version eligibility** — only `VALIDATION` and `APPROVED` may be dispatched; `DRAFT`/`DEPRECATED`/`RETIRED`
  are rejected. A `VALIDATION` run is recorded **validation-only** (immutable "not approved for clinical use"
  provenance).
- **Execution / evidence / audit separation** — a **mutable `InferenceJob`** (lease/heartbeat/status/timing) →
  a **written-once immutable `InferenceRecord`** (identity + provenance + references + deterministic contract) →
  an **append-only `InferenceEvent`** trail. The 6A `InferenceRecord` immutability invariant is preserved.
- **Lease-based ownership** (mirrors the Program-5 job engine) — `claim` via `FOR UPDATE SKIP LOCKED`, lease-expiry
  authority, ownership-checked compare-and-set on renew/terminalize; a lost lease writes no evidence.
- **Single-active idempotency** — at most one active inference per `(modelVersionId, subjectSlideId, inputDigest)`,
  enforced by a **raw-SQL partial unique index** (`WHERE status IN ('QUEUED','RUNNING')`); a terminated job frees a
  later manual re-dispatch of the same tuple.
- **Provider-independent adapter boundary** — the engine depends only on the `InferenceAdapter` interface; **only a
  deterministic non-clinical stub** ships in 6C. Concrete providers are later phases.
- **Deterministic execution contract** — every execution records model version · adapter id/version · engine
  version · execution timestamps · input digest · **immutable configuration digest** · runtime duration · outcome ·
  immutable event id (audit-reproducible).
- **Failure isolation** — an adapter failure is recorded as `FAILED` evidence + audit and **never propagates into a
  clinical path** (AI-optional; graceful degradation).
- **Result boundary** — results are **digest + opaque reference only**; no raw bytes, no PHI, no diagnostic narrative.
  Slides are referenced by id only.
- **Reclaim** — an expired `RUNNING` lease → `TIMED_OUT`, released, **with no auto-retry** (manual dispatch only).
- **Permissions** `inference:view` / `inference:run` / `inference:manage` — granted to **no default role**
  (super-role reach only); `run` distinct from `view`/`manage`.
- **Worker disabled by default** and never under test; enqueue and the permissioned manual drain are always available.
- **All Program 6C provenance foreign keys use `ON DELETE RESTRICT`** (9 FKs incl. the additively-added
  `InferenceRecord.jobId` and the 6A-era record FKs). **No diagnostic/clinical field; no dataset coupling** (dataset-
  driven inference is Phase 6F).

## 2. Accepted implementation lineage
| SHA | Meaning |
|---|---|
| `3f9fc12` | Program 6C design-of-record baseline (ten governance decisions + two guardrails) |
| **`1f1856b`** | **6C implementation candidate** (schema + migration + module + specs + seed permission; governed 6A-test evolution) |
| `1e31c4f` | final exact-head candidate (acceptance gate + seed/assert scripts; product unchanged from `1f1856b`) |

The implementation is unchanged from `1f1856b`: `git diff 1f1856b 1e31c4f` touches **0 product files** — the delta is
the acceptance gate (workflow + two scripts + `apps/web/acceptance/.gitignore`). The reserved 6A `InferenceRecord`
shell was **extended additively, not redesigned**; a single forward-looking 6A test assertion was narrowly updated to
the 6C invariants (6A columns intact, additive-not-redesign, no PHI) as a governed evolution — a regression-suite
change in a later phase, not an amendment to the frozen 6A baseline.

**CI infrastructure commits (recorded separately — NOT part of the accepted implementation lineage):**
| SHA (on `main`) | Meaning |
|---|---|
| `dce2981` | 6C gate registration on `main` (default-branch `workflow_dispatch` registration; byte-identical blob `765ee78` to branch copy `1e31c4f`) |

This `main` commit is **CI registration infrastructure only** — a `workflow_dispatch`-only gate, byte-identical to the
Program 6 branch copy. It is not the accepted Phase 6C implementation and carries no product/schema/runtime change.

## 3. Authoritative acceptance evidence
- **Workflow:** `p6-inference-engine-acceptance`
- **Run number:** `1` · **Run ID:** `30516569762`
- **Event:** `workflow_dispatch` · **Branch:** `feat/program-6-ai-foundation`
- **Exact tested SHA:** `1e31c4f` (run header + in-run `git rev-parse HEAD == github.sha`, and
  `git merge-base --is-ancestor 1f1856b HEAD` — the lineage proof — satisfied)
- **Conclusion:** `success`

Accepted results:
- inference tables: **2** (`InferenceJob`, `InferenceEvent`) · enums: **2** (`InferenceJobStatus`, `InferenceOutcome`)
- `InferenceRecord`: 6A-era columns preserved + **13 additive immutable-evidence columns**
- provenance foreign keys: **9, all `RESTRICT`**
- raw-SQL active-job **partial unique index verified** against DB truth (tuple `modelVersionId, COALESCE(subjectSlideId,''), inputDigest`; predicate `QUEUED`/`RUNNING`) — installed explicitly by the gate after datamodel reconstruction
- persisted-state assertions: **all passed** (schema, raw index, RESTRICT FKs, preserved 6A columns, eligibility, immutable validation-only provenance, idempotency + freeing after terminalization, tenancy + cross-lab fail-closed, immutable single-write evidence, append-only audit, deterministic adapter, immutable config digest, digest/reference results, failure isolation, reclaim→TIMED_OUT no-retry, permission separation + no default grant, worker disabled by default, no dataset/clinical coupling, Program-5/6A/6B non-regression)
- focused inference-engine tests: **24/24** (5 suites)
- Program-5 / 6A / 6B non-regression tests: **44/44** (8 suites)
- TypeScript: **zero errors** (strict `npx tsc --noEmit -p tsconfig.json`, exit 0)
- evidence artifact: **`p6-6c-inference-engine-acceptance`** generated (schema SQL + raw-invariants SQL + fixtures)

**Gate note:** the active-job partial unique index is a **raw-SQL migration-only invariant** that Prisma's datamodel
reconstruction does not reproduce. The folded gate installs it **explicitly** (extracted from the authoritative
migration) after the from-datamodel schema build and **before** seeding/assertions, then verifies it against DB truth —
it does not rely on the integration test's private re-creation. `migrate deploy` installs it in real runtimes.

## 4. Frozen reconciliation decisions
- 6C **orchestrates**; it never performs medical inference. The default adapter is deterministic and non-clinical.
- `InferenceRecord` remains **immutable** (written once at terminalization); the mutable execution row is
  `InferenceJob`; the audit trail is append-only `InferenceEvent`.
- Concrete vendor/model adapters, dataset↔model linkage, validation metrics, explainability, human review, and
  continuous evaluation remain **deferred** to later phases.
- **Program 5 remains immutable; accepted Program 6A and 6B remain unmodified.**

## 5. Deferred scope (NOT in Phase 6C)
explainability / heatmaps (6D) · human-review Accept/Reject/Modify workflow (6E) · validation metrics / calibration
(6F) · continuous evaluation / drift (6G) · clinical-performance reporting (6H) · concrete vendor/model adapters ·
model training / automatic labeling / federated learning / adaptive models / LLM report generation (hard non-goals) ·
automatic / event-driven / scheduled / dataset-scale execution.

## 6. Freeze statement
**Program 6 · Phase 6C is immutable at `1e31c4f`.** Future work must reference the accepted Phase 6C inference-engine
foundation rather than modifying its accepted historical baseline. Corrections require a separately governed amendment.
