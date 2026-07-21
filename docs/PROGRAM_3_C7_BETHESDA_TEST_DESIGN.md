# Program 3 · C7 — Bethesda Test Design

**Status:** Accepted (design) — frozen C7 baseline
**Owner:** engineering (quality)
**Governs:** the Bethesda test-hardening checkpoint (C7)
**Grants:** no test-implementation authorization. Read-only design artifact. No production, schema,
migration, tenancy, or Program-2 changes are authorized.
**Parent strategy:** `docs/PROGRAM_3_TEST_STRATEGY.md` (Phase 0, frozen `9fb04f5`)
**Sibling baselines:** C1–C6 — C7 reuses the same production-parity `_test` harness. No monetary surface.

**Files examined (read-only):** `bethesda.service.ts` (191), `bethesda-analytics.service.ts` (142),
`bethesda.controller.ts` (61), `dto/bethesda.dto.ts` (29), `dto/bethesda-analytics.dto.ts` (12),
`bethesda.module.ts`; schema `BethesdaResult` + enums (`SpecimenAdequacy`, `GeneralCategory`,
`SquamousCategory`, `ASCSubtype`, `GlandularCategory`, `HPVResult`, `BethesdaRecommendation`).

---

## 0. Grounding truth (implementation vs generalized expectations)

- **One `bethesda` module, TWO services:** `BethesdaService` (classification CRUD + pure derivation +
  outbound orchestration) and `BethesdaAnalyticsService` (in-process statistical reporting).
- **THERE IS NO EXTERNAL AI / INTEGRATION PATH IN THIS MODULE (correcting the authorization's premise).**
  `BethesdaAnalyticsService` is **pure Prisma statistics** (category counts, rates, ratios, benchmarks,
  technician grouping) — the earlier keyword match was its **private method named `fetch()`**, not an
  HTTP call. `generateNarrative` is a **deterministic, rule-based TBS-2014 composer** (string assembly),
  **not AI**. The system's actual AI narrative path lives in a **separate `ai-reporting` / `AiDraft`
  module — OUT of C7**. → **C7 has no external boundary to stub**; there is no request/response/retry
  surface here.
- **No scheduler.**
- **Two exported PURE functions:** `generateNarrative(BethesdaSelections)` and
  `deriveShortCode(BethesdaSelections)` (+ the exported `BethesdaSelections` interface) — the C7
  pure-unit layer.
- **Classification is a single mutable result per record.** `BethesdaResult.recordId @unique`; `upsert`
  = create-or-**overwrite**; `reportedBy`/`reportedAt` are updated each time; there is **no version
  history / revision trail** (SD-2).
- **`upsert` orchestrates two outbound side effects** after persistence: `EscalationService.evaluateRecord`
  and `RecallService.autoCreateFromBethesda` (the C4 inbound hook) — **collaborators to stub** (SD-1: not
  transactional / failures not isolated despite the "best-effort" comment).
- **Taxonomy is TBS-2014, hard-coded.** No Bethesda version/edition switch exists.

---

## 1. Public surface inventory

**Exported pure functions (unit-testable, no DB):**
- `generateNarrative(d: BethesdaSelections): string` — composes the TBS-2014 narrative.
- `deriveShortCode(d: BethesdaSelections): string | null` — maps a classification to a short code
  (`UNSAT`/`NILM`/`ASCUS`/`ASC-H`/`LSIL`/`HSIL`/`SCC`/`AGUS`/`MALIG`/`null`).
- Interface `BethesdaSelections` (exported).

**`BethesdaService` public methods (3):** `getByRecord`, `upsert`, `remove`.
**`BethesdaAnalyticsService` public methods (4):** `summary`, `trend`, `benchmarks`, `byTechnician`.
Private helpers (not test targets): analytics `range`/`fetch`/`counts`, and module-local `pct`/`ratio`.

**`BethesdaController` routes (7) — all permissioned (base `bethesda`):**

| Handler | Route | Permission |
|---|---|---|
| `analyticsSummary` | `GET bethesda/analytics/summary` | `resultentry:view` |
| `analyticsTrend` | `GET bethesda/analytics/trend` | `resultentry:view` |
| `analyticsBenchmarks` | `GET bethesda/analytics/benchmarks` | `resultentry:view` |
| `analyticsByTechnician` | `GET bethesda/analytics/by-technician` | `resultentry:view` |
| `getByRecord` | `GET bethesda/record/:recordId` | `resultentry:view` |
| `upsert` | `PUT bethesda/record/:recordId` | `resultentry:change` |
| `remove` | `DELETE bethesda/record/:recordId` | `resultentry:change` |

**DTOs:** `UpsertBethesdaResultDto` (`specimenAdequacy` required; all category fields optional),
`AnalyticsSummaryQueryDto` (`period`/`year`/`month`), `AnalyticsTrendQueryDto` (`months?`).

**Scheduled entry points:** **none.** **External integration entry points:** **none.**

**Module/collaborators:** `BethesdaModule` imports `PrismaModule` + `EscalationModule` + `RecallModule`.
`BethesdaService` injects `PrismaService`, `EscalationService`, `RecallService`.
`BethesdaAnalyticsService` injects `PrismaService`.

## 2. Bounded context

- **Owned entity/state:** `BethesdaResult` (one per record, `labId`-scoped).
- **Owned workflows:** classification CRUD; narrative/short-code derivation; statistical analytics.
- **Collaborators:** `PrismaService` (data); `EscalationService.evaluateRecord` and
  `RecallService.autoCreateFromBethesda` (outbound side effects on `upsert` — **stub**).
- **Data deps:** `Record` (`recordId @unique`, `onDelete: Cascade`), `User` (`reportedById`).
- **Inbound:** `RecallService.autoCreateFromBethesda` is *invoked by* `upsert` (Recall is downstream; its
  own behavior is C4, already closed — C7 asserts the **delegation**, not Recall internals).
- **Verdict:** **primarily a classification engine + in-process analytics** — self-contained ownership of
  `BethesdaResult`, with outbound (best-effort) orchestration of Escalation + Recall. **Not** an
  integration boundary (no external system).

## 3. Classification architecture

- **Lifecycle:** `upsert(recordId, dto, userId)` → validate → `generateNarrative(dto)` → **upsert** the
  single `BethesdaResult` → `escalation.evaluateRecord` → `recall.autoCreateFromBethesda`; returns the
  row + derived `shortCode`. `getByRecord` returns the row + `shortCode`, or `null` when none. `remove`
  deletes the row (`NotFound` when none).
- **Manual only.** No automated classifier; analytics is reporting, not classification.
- **Validation:** a `Satisfactory` specimen **requires** `generalCategory` → `BadRequest`; a missing
  record → `NotFound`.
- **Persistence / revision / overwrite:** exactly **one** `BethesdaResult` per record; re-`upsert`
  **overwrites** it in place (the `generatedNarrative` and all fields are recomputed; `reportedBy`/
  `reportedAt` updated). **No versioning, no history** — the prior classification is lost (SD-2).
- **Auditability:** only the latest `reportedById`/`reportedAt` is retained; no change trail.
- **Result ownership:** `BethesdaResult` is owned by Bethesda; `shortCode` is **derived** (not persisted);
  `generatedNarrative` **is** persisted.

## 4. External integration architecture

**None.** There is **no** external AI/analytics integration in this module: `BethesdaAnalyticsService` is
pure in-process Prisma statistics, and `generateNarrative` is deterministic rule-based composition. There
is no external request/response, retry, timeout, or failure-handling surface, and nothing to stub as an
external boundary. (The system's AI narrative generation is the separate `ai-reporting`/`AiDraft` module,
which is **out of C7 scope**.)

## 5. Scheduler architecture

**No scheduler exists** in the bethesda module — no `@Cron`, no background worker, no scheduled entry
point. There is therefore no scheduler test surface in C7.

## 6. Authorization & tenancy

- **Permission model:** `resultentry:view` (reads: analytics + `getByRecord`) / `resultentry:change`
  (`upsert`, `remove`). C7 asserts route→permission **metadata** only.
- **Tenancy:** `BethesdaResult` carries `labId` → auto-scoped; analytics `findMany`/reads are lab-scoped
  at query time; `upsert` reads the `Record` scoped (a foreign record → `NotFound`). **Cross-lab (frozen
  outcomes):** `getByRecord` on a foreign record → scoped read misses → returns `null`; `upsert`/`remove`
  on a foreign record → `NotFound`; analytics scoped to the acting lab (foreign results excluded).
  **Missing lab context** → guard throws (fail-closed).
- **Transaction boundaries:** **none** — `upsert` persists then runs the two outbound side effects with
  **no `$transaction`** (SD-1). Isolation is by the tenancy guard.

## 7. Proposed testing architecture (design only)

- **Pure unit (primary layer):** `deriveShortCode` — every branch (`UNSAT`, `NILM`, `ASC→ASCUS/ASC-H`,
  `LSIL/HSIL/SCC`, glandular→`AGUS`, `OtherMalignancy→MALIG`, `null`) + precedence; `generateNarrative` —
  unsatisfactory short-circuit; satisfactory with general categorization + interpretation (NILM +
  organisms/other-non-neoplastic; EpithelialAbnormality → squamous/glandular text; OtherMalignancy); HPV
  block; recommendation block. Deterministic string assertions.
- **Service integration (`_test`, production-parity client, `labContext.run`; Escalation + Recall
  STUBBED):** `upsert` create (persists row + `generatedNarrative`; returns `shortCode`); `upsert`
  overwrite (re-upsert replaces the single row, no duplicate); validation (`Satisfactory` without
  `generalCategory` → `BadRequest`); record `NotFound`; **delegation** — `escalation.evaluateRecord` and
  `recall.autoCreateFromBethesda` each called once with `recordId` (NOT their internals); `getByRecord`
  (row + `shortCode`; `null` when none); `remove` (delete; `NotFound`).
- **Analytics integration:** `summary` (counts/rates/ratios over seeded results — use `period: 'all'` or
  seed controlled `reportedAt` to stay deterministic; see the date note); `trend` (month buckets;
  controlled `reportedAt`); `benchmarks` (ratio + `pass/warning/fail` thresholds); `byTechnician`
  (grouping + sort by total).
- **External integration (stubbed):** **N/A — none exists** (§4); no external suite.
- **Scheduler:** **none** (§5).
- **Controller:** all 7 route→permission metadata mappings via exported `PERMISSIONS_KEY` + completeness
  + representative parameter forwarding (`upsert` threads `user.userId`; analytics forward query params).
- **Tenancy:** cross-lab `getByRecord` (`null`) / `upsert`/`remove` (`NotFound`); analytics scoped;
  missing-context → guard throws.

**Fixtures:** `Lab` ×2, `Account → User` (`reportedById`), `Record` (the `recordId @unique` target;
minimal — `labId` + `identifier` + `patientId`, so `Patient` too), `BethesdaResult` (via `upsert` or
seeded via the bare client with a controlled `reportedAt`/`reportedById`). Escalation + Recall injected as
`jest.fn()` stubs. Teardown child-first, `labId`-scoped: `BethesdaResult → Record → Patient → User →
Account → Lab`. One fresh UUID lab per test; capped-parallel pool.

**Date-determinism note:** `summary`/`trend` derive period ranges from `new Date()`. C7 keeps analytics
assertions deterministic by using `period: 'all'` (no range) or seeding `reportedAt` inside a controlled
window — never asserting against the uncontrolled wall clock.

## 8. Suspected defects (record only — no fix, no green characterization test)

- **SD-1 — `upsert` is non-atomic and its side effects are not failure-isolated.** The `BethesdaResult`
  upsert, `escalation.evaluateRecord`, and `recall.autoCreateFromBethesda` run as separate awaited steps
  with **no `$transaction`** and **no per-call try/catch**; despite the "best-effort" comment, an
  `evaluateRecord` throw would propagate **after** the result is persisted and **skip** the recall step.
- **SD-2 — No classification revision history.** `upsert` overwrites the single `BethesdaResult`; the
  prior classification (a clinical result) is lost with no version/audit trail beyond the latest
  `reportedBy`/`reportedAt`.
- **SD-3 — `deriveShortCode` yields `null` for some classified-abnormal states.** A `Satisfactory`
  result with `generalCategory = EpithelialAbnormality` but **no** `squamousCategory`/`glandularCategory`
  returns `null` (no short code for an abnormal result); `OtherMalignancy` is only reached when no
  squamous category is set (precedence).
- **SD-4 — `generateNarrative` performs no internal consistency validation.** Called with the raw DTO, it
  tolerates incomplete/inconsistent selections (e.g. `Satisfactory` with no `generalCategory` → a
  narrative missing the general-categorization/interpretation blocks). The only guard is the service-layer
  `BadRequest`; the pure function itself does not enforce it.

None require a production change to test the accepted behavior; all are recorded for separate,
explicitly-authorized review and must not be encoded as passing characterization tests.

## 9. Stop conditions / items for review before implementation

- **No hard STOP triggered.** Bethesda owns its entity, workflows, and pure logic; no scheduler; **no
  external integration** (§4); the outbound Escalation/Recall calls are stubbable side effects.
- **Grounding correction requiring a ruling:** the authorization anticipated an **external
  bethesda-analytics AI/integration path**; the implementation has **none** (analytics is in-process
  statistics; `generateNarrative` is deterministic). **Ruling requested:** confirm C7 == the `bethesda`
  module (classification + in-process analytics + the two pure functions), with **no external-integration
  test suite**, and that the separate `ai-reporting`/`AiDraft` module is **out of scope**.
- **Orchestration ruling requested:** confirm C7 **stubs** `EscalationService` and `RecallService` and
  asserts only the **delegation** from `upsert` (Escalation is a separate module; Recall internals are C4,
  closed) — it does **not** test their behavior.
- **Suspected-defect rulings requested:** confirm SD-1…SD-4 remain documented-only and are **not**
  normalized (no partial-failure blessing for SD-1; overwrite tested as current behavior without endorsing
  the loss-of-history as intended, SD-2; `deriveShortCode`/`generateNarrative` tested for their **actual**
  outputs without asserting the null/partial results are the *desired* clinical contract, SD-3/SD-4).

## 10. Accepted vs deferred scope

**Accepted (C7):** the two pure functions (all branches); classification CRUD (`upsert` create/overwrite/
validation/not-found + Escalation/Recall **delegation**, both stubbed; `getByRecord`; `remove`);
statistical analytics (`summary`/`trend`/`benchmarks`/`byTechnician` with deterministic dates); tenancy
isolation; controller permission metadata + delegation.

**Deferred:** the separate `ai-reporting`/`AiDraft` module (out of scope); Escalation module behavior
(separate); Recall internals (C4, closed); SD-1…SD-4 remediation; DTO-layer validation → controller/pipe
checkpoint; R1 test-infra.

## 11. Definition of done (inherits strategy §14)

One primary invariant per test; deterministic assertions (including controlled dates for analytics); all
§10-accepted invariants (happy + failure); cross-lab exact per §6; missing-context fails closed;
deterministic + parallel-safe (unique lab, scoped teardown, alone + capped-parallel); `tsc` clean; new
specs green; `test:parallel` stays green; **no** production/schema/migration/global-setup change;
`_test`-only; SD-1…SD-4 documented, not encoded. Pathspec-stage only the new spec file(s) → review →
commit on approval.

## 12. Governance

**Architectural-review rulings (recorded, frozen):** C7 == the **Bethesda module only**
(`BethesdaService`, `BethesdaAnalyticsService`, `BethesdaController`, DTOs, `BethesdaResult`).
**Grounding correction frozen:** Bethesda is **not** an external AI integration — `BethesdaAnalyticsService`
is internal Prisma analytics and `generateNarrative`/`deriveShortCode` are deterministic; **no external
integration suite, no scheduler suite** (neither exists). `ai-reporting`/`AiDraft` is **out of scope**;
Escalation + Recall are **collaborators only** (C7 asserts `upsert` **delegation/invocation/parameters**,
never their behavior — Recall internals are C4-closed). **A pure-unit layer is REQUIRED** (`deriveShortCode`,
`generateNarrative`, no Prisma). Classification truth is frozen: one `BethesdaResult` per record, mutable
**overwrite**, no revision history, validate-before-persist, derived short code. Analytics is in-scope with
**deterministic dates** (`period:'all'`/seeded `reportedAt`). **SD-1…SD-4 remain unresolved suspected
defects, not normalized:** SD-1 no transaction/partial-failure blessing (verify successful orchestration
only); SD-2 overwrite characterized as **current behavior**, not architectural preference; SD-3/SD-4
`deriveShortCode`/`generateNarrative` asserted against **actual outputs only** (no invented validation, no
claim that all abnormal combinations must yield a short code). If implementing would require asserting any
SD as correct, **stop and return for review**.

- **Design only.** This audit was **read-only**: nothing created besides this document, nothing staged,
  nothing committed, no production/schema/migration/tenancy/Program-2 changes.
- No hard STOP condition triggered; the §0 grounding-truth items (no external AI path; overwrite-only
  classification) are documented, not blocking.
- Grants no implementation authorization; C7 implementation requires a separate authorization after this
  artifact is reviewed and committed. One module per checkpoint; pathspec-scoped commits only.
