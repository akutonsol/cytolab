# Program 6 · Phase 6A — AI Infrastructure — DESIGN APPROVED (implementation target)

**Status:** **DESIGN APPROVED (2026-07-29).** Governance decisions recorded below. **Implementation NOT yet
authorized** — this document is the approved design of record that a future authorized implementation follows.
References the frozen Program 5 baseline; changes nothing in it. Charter: [`PROGRAM_6_CHARTER.md`](./PROGRAM_6_CHARTER.md).

---

## 1. Scope (6A only)
Model **governance architecture** — registry, versioned metadata (permanent identity + semver + provenance),
immutable inference-record **shell**, and the model **lifecycle** state machine. **No** image inference,
predictions, execution engine, queue, worker, datasets, explainability, validation metrics, or review workflow.

## 2. Recorded governance decisions
1. **Registry scope = LAB-SCOPED.** Rides the existing tenancy extension (`labId` + `@@index([labId])`);
   each lab governs which model versions are Approved for its patients. No platform-global catalogue in 6A
   (a curated global catalogue may be introduced by a later governance stage).
2. **`InferenceRecord` = immutable SHELL in 6A** carrying **only** identity, provenance, requested timestamp,
   and model-version reference. Execution/runtime/timing fields are added **additively in 6C**. No rows are
   written in 6A (no execution exists).
3. **Existing AI reporting remains separate and UNCHANGED.** `AiService` / `AiDraft` are not refactored;
   clinical inference is a parallel subsystem that may only *optionally* reference the registry later.
4. **`AIScreeningResult` = Legacy Demonstration Component** — functional, truthful, not clinical, not connected
   to Program 6 inference, removable by a future governance stage. 6A neither builds on nor legitimizes it.
5. **Lifecycle transitions (approved as proposed):** `DRAFT → VALIDATION → APPROVED → DEPRECATED → RETIRED`,
   plus `VALIDATION → DRAFT` (send-back). **`RETIRED` is terminal — no transition out of RETIRED.**
6. **Permanent immutable identity per model & version.** In addition to the human-facing key and semver, every
   `AiModel` and `AiModelVersion` carries a UUID assigned at creation that never changes; downstream inference
   records and audit logs reference the UUID, not display fields.

## 3. Schema (net-new; additive migration; lab-scoped; immutable-by-idiom)
All tables: `labId String` + `@@index([labId])` (auto-tenancy); provenance FKs `onDelete: Restrict`.

- `enum AiModelLifecycleState { DRAFT VALIDATION APPROVED DEPRECATED RETIRED }`
- `enum InferenceRecordStatus { REQUESTED }`  *(6A shell value only; 6C extends the enum additively)*

- **`AiModel`** — registry entry (logical model):
  `id @id @default(cuid)`, `modelUuid @unique @default(uuid)` *(permanent identity, Decision 6)*, `labId`,
  `key` (stable human slug), `displayName`, `task` (descriptive, **no clinical claim**), `description?`,
  `createdByUserId?` (no FK), `createdAt`, `updatedAt`; `@@unique([labId, key])`, `@@index([labId])`.

- **`AiModelVersion`** — versioned, lifecycle-bearing, provenance:
  `id @id @default(cuid)`, `versionUuid @unique @default(uuid)` *(permanent identity, Decision 6)*, `labId`,
  `modelId → AiModel (onDelete: Restrict)`, `semverMajor Int`, `semverMinor Int`, `semverPatch Int`,
  `lifecycleState AiModelLifecycleState @default(DRAFT)`,
  provenance: `artifactDigest?` (sha256 of an artifact **reference** — never weights/binaries),
  `provenanceRef?` (URI/text; **no PHI**), `createdByUserId?` (no FK),
  lifecycle stamps: `validatedAt? approvedAt? deprecatedAt? retiredAt?`, `createdAt`, `updatedAt`;
  `@@unique([labId, modelId, semverMajor, semverMinor, semverPatch])`, `@@index([labId])`,
  `@@index([labId, lifecycleState])`. Content immutable; only `lifecycleState` transitions (logged below).

- **`AiModelLifecycleEvent`** — append-only lifecycle audit trail (the deterministic transition record):
  `id`, `labId`, `modelVersionId → AiModelVersion (onDelete: Restrict)`, `fromState`, `toState`,
  `actorUserId?` (no FK), `reason?` (structured; **no PHI**), `eventId` (shared across a multi-row transition),
  `occurredAt`; `@@index([labId])`, `@@index([labId, modelVersionId])`. No update/delete path.

- **`InferenceRecord`** — immutable shell (created in 6A, **populated only in 6C**):
  `id @id @default(cuid)`, `recordUuid @unique @default(uuid)`, `labId`,
  `modelVersionId → AiModelVersion (onDelete: Restrict)`, `subjectSlideId? → DigitalSlide` *(reference by
  `(labId, slideId)`; **no PHI copied**)*, `status InferenceRecordStatus @default(REQUESTED)`,
  `inputDigest?` (sha256 of a redacted/reference payload), `requestedAt`, `createdAt`;
  `@@index([labId])`, `@@index([labId, modelVersionId])`. **No runtime/timing columns in 6A** (6C adds them
  additively). **No update path in 6A**; the table remains empty (no inference exists).

## 4. Lifecycle state machine (service-enforced)
Legal: `DRAFT→VALIDATION`, `VALIDATION→APPROVED`, `VALIDATION→DRAFT`, `APPROVED→DEPRECATED`,
`DEPRECATED→RETIRED`. **`RETIRED` terminal.** Every accepted transition writes exactly one
`AiModelLifecycleEvent` in the same transaction (compare-and-set on the current `lifecycleState` to prevent
concurrent double-transition). Only `APPROVED` versions will be eligible for inference (enforced in 6C).
`→APPROVED` is the governance-critical action (strongest permission).

## 5. Permissions (new `aimodel` namespace; no default grant)
Add to `SPECIAL_OBJECTS` in `prisma/seed.ts`: `aimodel: ['view','manage','promote']` —
`view` (read registry/versions), `manage` (create model/version, edit DRAFT metadata),
`promote` (perform a lifecycle transition, incl. →APPROVED). **Granted to no default role** (super-role reach
only), mirroring `wsi:review/publish`. No collision with the existing `aidraft:*`; the reporting path's
`aidraft:create` gate is unchanged. `promote` is distinct from `manage`.

## 6. Migration & dependencies
One additive timestamped migration (`YYYYMMDDHHMMSS_ai_model_registry_6a`): new enums + 4 tables + indexes +
Restrict FKs + the two `@unique` UUID/semver constraints. **No change to any existing model.** **No new
dependency** (6A makes no runtime model call). Additive-only; the 6C runtime columns arrive in a later additive
migration. Generated via `migrate diff --from-schema-datamodel → timestamped SQL → migrate deploy` (db push banned).

## 7. Runtime surface (6A)
Registry CRUD + lifecycle-transition services (NestJS module `apps/api/src/modules/ai-registry/` — parallel to,
not inside, the existing `ai/` reporting module), DTOs (`class-validator`), controllers gated by `aimodel:*`,
tenant-scoped via `tenantCreate`/`LabContext`. Best-effort `AuditRecorder` on lifecycle transitions (field-names
only). **No worker, no scheduler, no queue, no model call.**

## 8. Acceptance design (folded gate + specs; run only under a future authorization)
`scripts/seed-ai-infra-acceptance.ts` + `scripts/assert-ai-infra-state.ts` (folded-gate pattern) and/or
unit+integration specs, asserting **persisted DB truth**: registry CRUD tenant-scoped + cross-lab fail-closed;
per-model semver uniqueness; **only legal lifecycle transitions succeed** (illegal → rejected, no mutation);
each transition writes exactly one append-only `AiModelLifecycleEvent`; `RETIRED` is terminal; the permanent
`modelUuid`/`versionUuid` are stable across metadata edits; `InferenceRecord` exists, has no update path, and is
**empty**; **no PHI column** on any new table; authz — `aimodel:*` denied to a non-super principal, `promote` ≠
`manage`; existing reporting path + `AIScreeningResult` behaviour **unchanged**.

## 9. Explicitly NOT in 6A
Image inference · predictions · execution/queue/worker/lease · runtime model call · datasets (6B) ·
explainability (6D) · review workflow (6E) · validation metrics (6F) · `AiService`/`AiDraft`/reporting change ·
`AIScreeningResult` change · diagnostic/clinical claim · new dependency · `main` change · any Program-5 change.

## 10. Verdict
**PROGRAM 6 · PHASE 6A — DESIGN APPROVED**, six governance decisions recorded (§2). Implementation of 6A is
authorized only by a subsequent explicit instruction; this document is the design of record it will follow.
