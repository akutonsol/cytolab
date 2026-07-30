# Program 6 · Phase 6C — Inference Engine — DESIGN APPROVED (implementation target)

**Status:** **DESIGN APPROVED (2026-07-29).** Ten governance decisions recorded below. **Implementation NOT yet
authorized** — this is the approved design of record a future authorized implementation follows. References — never
modifies — the frozen Program 5 slide/provenance foundations, the accepted Program 6A registry + **inference-record
shell** (`p6-6a-accepted → 391dcd8`), and the accepted 6B dataset governance (`p6-6b-accepted → 1c27092`), and stays
additive. Charter: [`PROGRAM_6_CHARTER.md`](./PROGRAM_6_CHARTER.md). Preflight baseline:
`origin/feat/program-6-ai-foundation` @ `99ce5d0`.

---

## 1. Scope (6C only)
An **inference execution engine** that *orchestrates* — it does **not** clinically interpret. 6C queues work, leases
work, selects an eligible model version, invokes an inference **adapter**, and captures provenance, timing, runtime
metadata, deterministic execution state, references, and immutable evidence. The default adapter is **deterministic
and non-clinical**. 6C introduces **no** explainability (6D), human-review workflow (6E), validation metrics (6F),
continuous evaluation (6G), clinical-performance reporting (6H), and **no model training, federated learning, adaptive
models, LLM report generation, or vendor/scanner-specific AI** (hard non-goals). No automatic, event-driven, scheduled,
or dataset-scale execution.

## 2. Recorded governance decisions
1. **6C orchestrates; it never performs medical inference.** The engine can invoke an adapter, but its responsibility
   is orchestration — not clinical interpretation. The default adapter is deterministic and non-clinical: it **may**
   return structured metadata, deterministic stub outputs, or synthetic/demo outputs; it **must never** diagnose,
   classify disease, produce patient-facing conclusions, or claim medical accuracy.
2. **Execution is separated from evidence — three entities.** A **mutable `InferenceJob`** (lease / retry / heartbeat /
   status / runtime) produces, on terminalization, an **immutable `InferenceRecord`** (provenance / identity /
   references / timing), with an **append-only `InferenceEvent`** audit trail. This mirrors Program 5 and preserves the
   6A invariant that **`InferenceRecord` is immutable** (written once, never mutated).
3. **Model-version eligibility:** `DRAFT` ❌ · `VALIDATION` ✅ (non-clinical only) · `APPROVED` ✅ · `DEPRECATED` ❌ ·
   `RETIRED` ❌. Outputs generated with a `VALIDATION` model carry **immutable provenance** marking them
   validation-only / not approved for clinical use — recorded in provenance, **never** in mutable metadata.
4. **Result storage is digest/reference, not payload.** Persist execution metadata, hashes, reference URIs, structured
   output, and provenance. **No** raw binaries, **no** PHI, **no** diagnostic narrative. 6C is not a repository for
   arbitrary model payloads.
5. **Idempotency:** at most one active inference for `(modelVersionId, subjectSlideId, inputDigest)`, enforced by the
   Program-5 partial-unique active-job pattern (raw SQL — Prisma cannot express a partial index).
6. **Manual dispatch only.** No automatic execution, no event-driven inference, no dataset pipelines, no scheduled
   execution. Dataset-scale orchestration belongs to Program 6F. 6C stays intentionally small.
7. **Permissions `inference:view` / `inference:run` / `inference:manage`** — granted to **no default role** (super-role
   reach only), the same governance model as `aimodel:*` and `dataset:*`. `run` distinct from `view`/`manage`.
8. **Failure never propagates into the clinical workflow.** `RUNNING → FAILED → record evidence → emit audit →
   finish`. No exception escapes into any clinical path (AI is optional; graceful degradation, consistent with the
   existing `AiService`).
9. **Adapter boundary.** The engine must never know which AI system performs inference. 6C defines **only** an
   `InferenceAdapter` interface; concrete adapters (OpenAI, Claude, ONNX, Torch, TensorRT, vendor scanner, …) belong to
   later phases. Only a default deterministic **stub** adapter ships in 6C. This keeps the engine provider-independent
   and testable.
10. **Deterministic execution contract.** Every execution permanently records: model version · adapter identifier ·
    adapter version · engine version · execution timestamp · input digest · configuration digest · runtime duration ·
    outcome · immutable event identifier — so every inference is reproducible from an audit perspective even as the
    underlying model evolves.

## 3. Schema (net-new + additive extension of the reserved 6A shell; lab-scoped; immutable-by-idiom; reference-not-copy)
All tables: `labId String` + `@@index([labId])` (auto-tenancy); provenance FKs `onDelete: Restrict`; permanent UUIDs.

- `enum InferenceJobStatus { QUEUED RUNNING SUCCEEDED FAILED TIMED_OUT }`  *(mirrors `ProcessingJobStatus`)*
- `enum InferenceOutcome { SUCCEEDED FAILED TIMED_OUT }`  *(the terminal outcome frozen onto the evidence record)*

- **`InferenceJob`** (mutable execution/queue; mirrors `SlideProcessingJob`): `id @id @default(cuid)`,
  `jobUuid @unique @default(uuid)`, `labId`, `modelVersionId → AiModelVersion (Restrict)`,
  `subjectSlideId? → DigitalSlide (Restrict)` *(reference only; no PHI)*, `inputDigest` (sha256 of a redacted/reference
  payload — proves input class without PHI), `configDigest?` (sha256 of the execution configuration),
  `adapterId String` (selected adapter identity), `status InferenceJobStatus @default(QUEUED)`, `attempt Int @default(1)`,
  `workerId?`, `heartbeatAt?`, `leaseExpiresAt?`, `startedAt?`, `finishedAt?`, `errorCode?`, `errorDetail?`,
  `createdById?` (no FK), `createdAt`, `updatedAt`. Indexes `@@index([labId])`, `@@index([labId, status])`,
  `@@index([status, leaseExpiresAt])` (reclaimer scan), `@@index([modelVersionId])`. Migration adds a raw-SQL **partial
  unique index** on `(modelVersionId, subjectSlideId, inputDigest) WHERE status IN ('QUEUED','RUNNING')` — the DB
  backstop for Decision 5.

- **`InferenceRecord`** — the **inert 6A shell, extended ADDITIVELY** (its 6A comment reserved execution/timing/result
  semantics for exactly this preflight; the table is empty and no 6A behavior changes). Existing 6A columns unchanged
  (`recordUuid`, `labId`, `modelVersionId → AiModelVersion (Restrict)`, `subjectSlideId? → DigitalSlide (Restrict)`,
  `inputDigest`, `requestedAt`, `createdAt`). Additive columns (all **immutable**, written once at terminalization):
  `jobId? → InferenceJob (Restrict)`, `adapterId`, `adapterVersion`, `engineVersion`, `configDigest?`,
  `modelLifecycleStateAtRun AiModelLifecycleState` (eligibility provenance), `validationOnly Boolean @default(false)`
  (Decision 3 — immutable "not approved for clinical use" provenance), `outcome InferenceOutcome`, `resultDigest?`
  (sha256 of the structured output), `resultRef?` (URI/opaque reference; no bytes, no PHI), `startedAt?`, `finishedAt?`,
  `durationMs? Int`. **No update/delete path in the application** — the row is written exactly once.

- **`InferenceEvent`** (append-only audit; mirrors `AiModelLifecycleEvent`): `id`, `labId`,
  `jobId → InferenceJob (Restrict)`, `fromStatus? InferenceJobStatus`, `toStatus InferenceJobStatus`, `actorId?`
  (no FK), `detail?` (structured; never PHI, never a diagnostic claim), `eventId` (shared across the rows of one
  transition), `occurredAt @default(now())`. No update/delete path.

## 4. Execution lifecycle & immutability
`QUEUED → RUNNING → (SUCCEEDED | FAILED | TIMED_OUT)`. Ownership is **lease-based**, reusing the Program-5 idiom
(`JobLeaseService`): `claim` via `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED LIMIT 1)`; the lease expiry —
not a wall clock — is the authority; `renew`/`terminalize` re-check `workerId + status='RUNNING'` (compare-and-set; 0
rows ⇒ ownership lost ⇒ abandon); a heartbeat **aborts adapter work on definitive lease loss**; `reclaimExpired`
terminalizes `TIMED_OUT` and schedules a bounded retry in the same transaction. Each accepted status transition writes
**exactly one** `InferenceEvent` in the same transaction. On terminalization the engine writes the **immutable**
`InferenceRecord` once (identity + provenance + references + deterministic-contract fields + outcome); it is never
mutated thereafter. The worker runtime/scheduler is **gated OFF unless explicitly enabled, and never under test**
(the `PROCESSING_CONFIG` precedent).

## 5. Adapter boundary (Decision 9)
6C defines an `InferenceAdapter` interface only — `{ adapterId, adapterVersion, execute(inputRef, config): structured
result reference/digest }` — and ships a single default **deterministic, non-clinical stub** (structured/synthetic
output, no diagnosis, no medical-accuracy claim). The engine depends solely on the interface and never on a concrete
provider. Concrete adapters (OpenAI / Claude / ONNX / Torch / TensorRT / vendor scanner) are out of scope for 6C and
introduce **no runtime model dependency** here.

## 6. Deterministic execution contract (Decision 10)
Persisted immutably on `InferenceRecord` for every execution: `modelVersionId`, `adapterId`, `adapterVersion`,
`engineVersion`, execution timestamp (`startedAt`/`finishedAt`), `inputDigest`, `configDigest`, `durationMs`,
`outcome`, and an immutable `eventId` (via the terminal `InferenceEvent`). Reproducible from audit even as models
evolve; no reliance on mutable job columns for evidence.

## 7. Permissions (new `inference` namespace; no default grant)
Add to `SPECIAL_OBJECTS`: `inference: ['view', 'run', 'manage']` — `view` (read jobs/records/events), `run` (dispatch
an inference — Decision 6 manual trigger), `manage` (administrative reconcile/reclaim controls). **No default-role
grant** (super-role reach only), mirroring `aimodel:*` / `dataset:*`. `run` distinct from `view`/`manage`.

## 8. PHI & claims boundary (reference-not-copy; no diagnostic claim)
Slides are referenced by **id only**; `inputDigest`/`resultDigest` prove input/output class without copying content;
`resultRef` is a pointer, never bytes. No PHI enters any 6C table. No column or output carries a diagnostic,
disease-classification, patient-facing, or medical-accuracy claim; the default adapter is non-clinical. PHI remains
solely on Program 5's `Patient`/`Record`, reached only via the slide's own `recordId`, never surfaced into a 6C table.

## 9. Migration & dependencies
**One additive timestamped migration:** new enums (`InferenceJobStatus`, `InferenceOutcome`) + `InferenceJob` +
`InferenceEvent` tables + **additive columns on the already-reserved `InferenceRecord` shell** + indexes + the raw-SQL
partial-unique active-job index + `Restrict` FKs. **No change** to any Program 5 / 6A / 6B model beyond additively
populating the 6A shell that was explicitly reserved for 6C (table empty, no behavior change — this is "references,
never modifies, accepted 6A"). **No new runtime dependency** (stub adapter only; no real model runtime).

## 10. Acceptance design (folded gate; run only under a future authorization)
`scripts/seed-inference-engine-acceptance.ts` + `scripts/assert-inference-engine-state.ts` + a
`p6-inference-engine-acceptance.yml` gate (registered on the default branch `main` under its own explicit
authorization at acceptance time, per the 6A/6B precedent). **The checkout step uses `fetch-depth: 0`** so any
`git merge-base --is-ancestor` lineage assertion resolves the implementation candidate (the 6B gate lesson — retained
as the acceptance-workflow pattern whenever ancestry is asserted). Persisted-truth assertions: eligibility enforced
(`DRAFT`/`DEPRECATED`/`RETIRED` rejected at dispatch; `VALIDATION` runs recorded `validationOnly=true` immutably;
`APPROVED` runs clinical-eligible provenance); queue/lease concurrency (claim/renew/reclaim; exactly one active job per
`(modelVersionId, subjectSlideId, inputDigest)` via the partial unique index); `InferenceRecord` written **once** at
terminalization and **immutable** (no update path); append-only `InferenceEvent` (one per transition, shared
`eventId`); deterministic-contract fields all present; result is digest/reference only (no raw-payload / PHI /
diagnostic-narrative columns); default adapter deterministic + non-clinical (no diagnosis/claim); failure never throws
(`FAILED` recorded, audit emitted, no exception into a clinical path); tenancy + cross-lab fail-closed; every
provenance FK `RESTRICT`; `inference:*` no-default-grant with `run`≠`view`≠`manage`; references (not modifies) 6A/6B +
Program 5; strict TypeScript.

## 11. Explicitly NOT in 6C
explainability / heatmaps (6D) · human-review Accept/Reject/Modify workflow (6E) · validation metrics / ROC /
calibration (6F) · continuous evaluation / drift (6G) · clinical-performance reporting (6H) · concrete
vendor/model adapters · model training / automatic labeling / federated learning / adaptive models / LLM report
generation (hard non-goals) · automatic/event-driven/scheduled/dataset-scale execution · any change to
`AiService`/`AiDraft`/`AIScreeningResult`, `SlideAnnotation`, Program 5, accepted 6A, or accepted 6B.

## 12. Verdict
**PROGRAM 6 · PHASE 6C — DESIGN APPROVED**, ten governance decisions recorded (§2). Implementation is authorized only
by a subsequent explicit instruction; this document is the design of record it will follow.
