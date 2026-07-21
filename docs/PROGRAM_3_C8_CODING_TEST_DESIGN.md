# Program 3 · C8 — Coding Test Design

**Status:** Accepted (design) — frozen C8 baseline
**Owner:** engineering (quality)
**Governs:** the Coding test-hardening checkpoint (C8)
**Grants:** no test-implementation authorization. Read-only design artifact. No production, schema,
migration, tenancy, or Program-2 changes are authorized.
**Parent strategy:** `docs/PROGRAM_3_TEST_STRATEGY.md` (Phase 0, frozen `9fb04f5`)
**Sibling baselines:** C1–C7 — C8 reuses the same production-parity `_test` harness. No monetary surface.

**Files examined (read-only):** `coding.service.ts` (239), `coding.controller.ts` (89),
`dto/coding.dto.ts` (33), `coding.module.ts`, **existing** `coding.phi-audit.spec.ts` (77); schema
`MedicalCode`, `RecordCoding`, enums `CodeSystem`, `CodingType`.

---

## 0. Grounding truth (implementation vs generalized expectations)

- **Module identity.** C8 = the `coding` module (`CodingService`, `CodingController`) owning **`MedicalCode`**
  (the per-lab code dictionary) and **`RecordCoding`** (per-record code assignments). The separate
  `CodeSheet`/`CodeFinding`/`LabCode` schema models are a **different legacy code-sheet structure NOT used
  by `CodingService`** → **out of C8 scope**.
- **Coding is manual dictionary assignment + read-only auto-suggest.** `assignCode` attaches an existing
  `MedicalCode` to a record; `suggest` proposes codes derived from `formType → LOINC` and `Bethesda short
  code → SNOMED/ICD10` (via the **imported** `deriveShortCode` from the C7 Bethesda module — a function
  import, not a service dependency) but **does not assign**.
- **Two `$transaction` boundaries (array/batch form):** `assignCode` (create coding **+** `usageCount++`)
  and `removeCoding` (delete coding **+** `usageCount--`). See §4.
- **PHI audit** is via `AuditRecorder`: `records()` → `recordPhiList`; `toCsv()` → `recordPhiExport`;
  `exportData()` emits nothing. **This placement contract is already OWNED by the existing
  `coding.phi-audit.spec.ts`** (mocked Prisma) — C8 extends around it, does not duplicate it (§5).
- **No scheduler.** **No exported pure function of its own** (`deriveShortCode` belongs to C7).
- **Codes:** dictionary entries are **mutable** (`updateCode`; `deactivateCode` = soft-delete via
  `isActive=false`). Assignments are **add/remove only** (no in-place update; `@@unique([recordId, codeId])`
  → duplicate assign is a `Conflict`); `usageCount` is a denormalized counter maintained only by the two
  transactions. **No versioning / revision history of assignments.**

---

## 1. Public surface inventory

**Exported helpers / pure functions:** **none** from `coding.service` (`SPECIMEN_LOINC`, `BETHESDA_MAP`,
`specimenLabel`, `initials` are module-local; `deriveShortCode` is imported from Bethesda).

**`CodingService` public methods (12):**

| Area | Methods |
|---|---|
| Dictionary | `listCodes`, `createCode`, `updateCode`, `deactivateCode` |
| Record codings | `getRecordCodings`, `assignCode` (**tx**), `removeCoding` (**tx**) |
| Derivation / worklist | `suggest`, `records` (**PHI audit**), `stats` |
| Export | `exportData`, `toCsv` (**PHI audit**) |

**Transaction entry points:** `assignCode`, `removeCoding` (§4). **Scheduled entry points:** none.

**`CodingController` routes (11) — all permissioned (base `coding`):**

| Handler | Route | Permission |
|---|---|---|
| `listCodes` | `GET coding/codes` | `record:view` |
| `createCode` | `POST coding/codes` | `record:change` |
| `updateCode` | `PATCH coding/codes/:id` | `record:change` |
| `deactivateCode` | `DELETE coding/codes/:id` | `record:change` |
| `records` | `GET coding/records` | `record:view` |
| `stats` | `GET coding/stats` | `record:view` |
| `suggest` | `GET coding/suggest/:recordId` | `record:view` |
| `export` | `GET coding/export` | `record:view` |
| `getRecordCodings` | `GET coding/record/:recordId` | `record:view` |
| `assign` | `POST coding/record/:recordId` | `record:change` |
| `remove` | `DELETE coding/record/:recordId/code/:codeId` | `record:change` |

**DTOs:** `CodeQueryDto`, `CreateCodeDto`, `UpdateCodeDto`, `AssignCodeDto`, `ExportQueryDto`.

**Module/collaborators:** `CodingModule` imports `PrismaModule`; `CodingService` injects `PrismaService`
+ `AuditRecorder` (globally provided). The `export` controller route uses `@Res` passthrough (streams CSV
or returns JSON).

## 2. Bounded context

- **Owned entities/state:** `MedicalCode` (`@@unique([labId, system, code])`), `RecordCoding`
  (`@@unique([recordId, codeId])`) — both `labId`-scoped.
- **Owned workflows:** dictionary CRUD; record code assignment/removal (transactional); auto-suggest;
  worklist/stats/export.
- **Collaborators:** `PrismaService` (data); `AuditRecorder` (PHI audit on `records`/`toCsv`).
- **Function import:** `deriveShortCode` (Bethesda/C7) — used by `suggest`/`records`; not a service dep.
- **Data deps:** `Record`, `BethesdaResult` (suggest/records/export), `Patient` (initials), `User`
  (`assignedBy`).
- **Verdict:** **primarily a coding/classification engine + code dictionary**, with a PHI-audit boundary.
  Self-contained ownership; not orchestration-heavy.

## 3. Coding architecture

- **Dictionary:** `createCode` (`Conflict` on duplicate `[system, code]`); `updateCode`
  (display/category/isActive; `NotFound`); `deactivateCode` (**soft** — `isActive=false`; `NotFound`);
  `listCodes` (system/category/search filters).
- **Assignment lifecycle:** `assignCode` → validate record + code exist (`NotFound`), reject duplicate
  (`Conflict`), then **tx**(create `RecordCoding` + `usageCount++`). `removeCoding` → guard exists
  (`NotFound`), then **tx**(delete + `usageCount--`). `getRecordCodings` lists by record.
- **Auto-suggest:** read-only; derives LOINC (formType) + Bethesda-mapped SNOMED/ICD10 (via
  `deriveShortCode`), resolves to existing dictionary rows, flags `alreadyAssigned`; `NotFound` for an
  unknown record. Proposes only — never persists.
- **Mutability / revision:** dictionary codes are **mutable**; assignments are **add/remove only** (no
  in-place edit); **no history/versioning**; `usageCount` maintained solely by the two transactions.
- **Ownership of coding decisions:** the assigning `User` is recorded (`assignedById`/`assignedAt`); a
  removal deletes the row (no soft-delete, no audit event — SD-3).

## 4. Transaction architecture

**TX-1 — `assignCode` (`coding.service.ts:81`):**
`$transaction([ recordCoding.create(...), medicalCode.update({ usageCount: { increment: 1 } }) ])`.
- **Operations:** create the assignment + increment the dictionary code's usage counter.
- **Ownership:** Coding; both operations are plain Prisma (no external collaborator inside the tx).
- **Failure / rollback:** array/batch `$transaction` → **atomic all-or-nothing**; if either fails, neither
  commits (the coding row and the counter never diverge). Pre-tx guards (record/code existence, duplicate)
  run **outside** the tx and short-circuit before it.

**TX-2 — `removeCoding` (`coding.service.ts:94`):**
`$transaction([ recordCoding.delete(...), medicalCode.update({ usageCount: { decrement: 1 } }) ])`.
- **Operations:** delete the assignment + decrement the usage counter. Atomic; guard (`NotFound`) before.

**Testable invariant:** `usageCount` moves exactly with assignments (+1 on assign, −1 on remove), atomic
with the `RecordCoding` row. (No floor — see SD-1.)

## 5. PHI audit architecture

- **Emit points:** `records()` → `AuditRecorder.recordPhiList` (bounded metadata:
  `{accessSurface:'coding', producerModule:'coding', resultCount, resourceType:'CodingWorklist'}`);
  `toCsv()` → `recordPhiExport` (after the CSV bytes are built; empty export emits nothing);
  `exportData()` emits **nothing** (it only shapes data).
- **Existing ownership:** **`coding.phi-audit.spec.ts` (77 lines, mocked Prisma + mocked `AuditRecorder`)
  already OWNS this contract** — it asserts emit placement, bounded metadata, no-PHI-leak, and
  emit-after-artifact (a serialization failure emits nothing). **C8 must NOT duplicate or modify it.**
- **Boundary for C8:** C8 adds **sibling** specs for the untested surface (dictionary CRUD, the two
  transactions, suggest, stats, tenancy, controller) using the real `_test` DB with `AuditRecorder`
  **stubbed** (no-op). C8 does **not** re-assert the PHI placement/metadata contract (that remains the
  existing spec's job). **"Extends the existing spec" = complements it via siblings**, not edits it.
- **Deterministic surface:** the existing spec is fully deterministic (mocked Prisma). C8's new tests are
  deterministic via the isolated `_test` DB + stubbed audit.

## 6. Scheduler architecture

**No scheduler exists** in the coding module — no `@Cron`, no worker, no scheduled entry point. No
scheduler test surface in C8.

## 7. Authorization & tenancy

- **Permission model:** `record:view` (reads: `listCodes`/`records`/`stats`/`suggest`/`export`/
  `getRecordCodings`) / `record:change` (`createCode`/`updateCode`/`deactivateCode`/`assign`/`remove`).
  C8 asserts route→permission **metadata** only.
- **Tenancy:** `MedicalCode` + `RecordCoding` carry `labId` → auto-scoped; the `$transaction` operations
  are built on the scoped client → **the batch is lab-scoped**. **Cross-lab (frozen outcomes):**
  `assignCode` with a foreign code or record → `NotFound`; `updateCode`/`deactivateCode`/`removeCoding` on
  a foreign row → `NotFound`; `getRecordCodings`/`listCodes`/`stats` scoped to the acting lab. **Missing
  lab context** → guard throws (fail-closed).
- **Transaction isolation:** the batch `$transaction` runs on the tenancy-scoped client; both operations
  are stamped/filtered by `labId`.

## 8. Proposed testing architecture (design only)

- **Pure unit:** **none of coding's own** (no exported pure function; `deriveShortCode` is C7's, tested
  there). `toCsv`'s deterministic CSV shaping is already exercised by the existing PHI-audit spec.
- **Service integration (`_test`, production-parity client, `labContext.run`; `AuditRecorder` STUBBED):**
  dictionary — `createCode` (+`Conflict`), `updateCode` (+`NotFound`), `deactivateCode` (soft +
  `NotFound`), `listCodes` filters; **`assignCode`** (creates coding + `usageCount++`; record/code
  `NotFound`; duplicate `Conflict`); **`removeCoding`** (deletes + `usageCount--`; `NotFound`);
  `getRecordCodings`; `suggest` (LOINC + Bethesda-derived suggestions resolved to dictionary rows;
  `alreadyAssigned` flag; record `NotFound`); `stats` (totals/`bySystem`/`mostUsed`); `exportData`
  (shapes + date filter).
- **Transaction:** assert the atomic `usageCount` invariant across assign/remove (counter tracks
  assignments); duplicate-assign `Conflict` leaves the counter unchanged.
- **PHI audit:** **owned by the existing `coding.phi-audit.spec.ts` — not duplicated.** C8's integration
  suites stub `AuditRecorder` and do not re-assert placement/metadata.
- **Controller:** all 11 route→permission metadata mappings via exported `PERMISSIONS_KEY` + completeness
  + representative parameter forwarding (`assign` threads `user.userId`; note the `export` route uses
  `@Res` passthrough — delegation asserted at the service level, not via a live `Response`).
- **Tenancy:** cross-lab code/coding isolation; `assignCode` foreign code/record → `NotFound`;
  missing-context → guard throws.

**Fixtures:** `Lab` ×2, `Account → User` (`assignedById`), `Record → Patient` (assignment/suggest/
records/export targets), `MedicalCode` (dictionary; `@@unique([labId, system, code])`), `RecordCoding`
(via `assignCode` or seeded), `BethesdaResult` (for `suggest`'s `deriveShortCode`). `AuditRecorder`
injected as `jest.fn()` stubs. Teardown child-first, `labId`-scoped: `RecordCoding → MedicalCode →
BethesdaResult → Record → Patient → User → Account → Lab`. One fresh UUID lab per test; capped-parallel
pool.

## 9. Suspected defects (record only — no fix, no green characterization test)

- **SD-1 — `usageCount` has no floor.** `removeCoding` decrements `usageCount` unconditionally; a data
  inconsistency (or a decrement at `0`) can drive the denormalized counter **negative**. It is maintained
  only by TX-1/TX-2 with no reconciliation.
- **SD-2 — a deactivated code is still assignable.** `assignCode` checks the code **exists** but not
  `isActive`; a soft-deleted (`isActive=false`) `MedicalCode` can still be assigned to a record.
- **SD-3 — coding assignment mutations emit no audit event.** `assignCode`/`removeCoding` (clinical code
  changes) produce **no** `AuditRecorder` event; only the worklist read (`records`) and export (`toCsv`)
  are audited — there is no change trail for code assignment/removal.

None require a production change to test the accepted behavior; all are recorded for separate,
explicitly-authorized review and must not be encoded as passing characterization tests.

## 10. Stop conditions / items for review before implementation

- **No hard STOP triggered.** Coding owns `MedicalCode` + `RecordCoding`; two clear `$transaction`
  boundaries; PHI audit partly pre-covered; no scheduler; not a wrapper.
- **Ruling requested (PHI-audit boundary):** confirm C8 **does not modify or duplicate** the existing
  `coding.phi-audit.spec.ts` (which owns the PHI-audit placement contract), and that "extends" means C8
  adds **sibling** integration/controller specs for the untested surface.
- **Ruling requested (out-of-scope models):** confirm `CodeSheet`/`CodeFinding`/`LabCode` (a separate
  legacy structure not used by `CodingService`) are **out of C8**.
- **Suspected-defect rulings requested:** confirm SD-1…SD-3 remain documented-only — no `usageCount`
  floor fix, no `isActive`-on-assign guard invented, no assign/remove audit invented; `deactivateCode`
  and the counter are tested for their **actual** behavior only.

## 11. Accepted vs deferred scope

**Accepted (C8):** dictionary CRUD (+ conflict/not-found/soft-delete); the two transactional assign/remove
flows + `usageCount` invariant; `getRecordCodings`; `suggest` (LOINC + Bethesda-derived, `alreadyAssigned`);
`stats`; `exportData` shaping; tenancy isolation; controller permission metadata + delegation.

**Deferred:** the PHI-audit placement contract (owned by the existing spec — extended, not duplicated);
`CodeSheet`/`CodeFinding`/`LabCode` (out of scope); Bethesda `deriveShortCode` internals (C7, closed);
SD-1…SD-3 remediation; DTO-layer validation → controller/pipe checkpoint; R1 test-infra.

## 12. Definition of done (inherits strategy §14)

One primary invariant per test; deterministic assertions; all §11-accepted invariants (happy + failure);
the `usageCount` transactional invariant; cross-lab exact per §7; missing-context fails closed;
deterministic + parallel-safe (unique lab, scoped teardown, alone + capped-parallel); `tsc` clean; new
specs green; `test:parallel` stays green; **no** production/schema/migration/global-setup change;
`_test`-only; the existing `coding.phi-audit.spec.ts` **untouched**; SD-1…SD-3 documented, not encoded.
Pathspec-stage only the new spec file(s) → review → commit on approval.

## 13. Governance

**Architectural-review rulings (recorded, frozen):** C8 == the **Coding module only** (`CodingService`,
`CodingController`, DTOs, `MedicalCode`, `RecordCoding`); legacy `CodeSheet`/`CodeFinding`/`LabCode` are
**out of scope**. Grounding truth frozen: Coding owns the dictionary + per-record assignments;
classification is manual; suggestions are **read-only deterministic derivations** (not a clinical
decision engine); `deriveShortCode` is C7-owned; **no Coding-owned pure-unit layer**, **no scheduler**.
**Exactly two `$transaction` boundaries** (assign = create + `usageCount++`; remove = delete +
`usageCount--`) — verify **successful transactional behavior only**, no injected rollback. **The existing
`coding.phi-audit.spec.ts` remains the authoritative, UNCHANGED owner of the PHI-audit placement
contract** — C8 adds **sibling** suites and must not modify/duplicate/replace it. **SD-1…SD-3 remain
unresolved suspected defects, not normalized:** SD-1 no negative-`usageCount` normalization (successful
behavior only); SD-2 inactive-code assignability characterized as **current behavior**, not intent; SD-3
no invented audit events (audit behavior tested exactly as implemented). If implementing would require
asserting any SD as correct, **stop and return for review**.

- **Design only.** This audit was **read-only**: nothing created besides this document, nothing staged,
  nothing committed, no production/schema/migration/tenancy/Program-2 changes.
- No hard STOP condition triggered; the §0 grounding-truth items are documented, not blocking.
- Grants no implementation authorization; C8 implementation requires a separate authorization after this
  artifact is reviewed and committed. One module per checkpoint; pathspec-scoped commits only.
