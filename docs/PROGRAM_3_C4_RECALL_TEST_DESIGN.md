# Program 3 · C4 — Recall Test Design

**Status:** Accepted (design) — frozen C4 baseline
**Owner:** engineering (quality)
**Governs:** the Recall test-hardening checkpoint (C4)
**Grants:** no test-implementation authorization. Read-only design artifact. No production, schema,
migration, tenancy, or Program-2 changes are authorized.
**Parent strategy:** `docs/PROGRAM_3_TEST_STRATEGY.md` (Phase 0, frozen `9fb04f5`)
**Sibling baselines:** C1 Billing, C2 Payments, C3 Payroll — C4 reuses the same production-parity `_test`
harness. Recall has **no monetary surface** (strategy §4 N/A).

---

## 0. Grounding truth vs the authorization wording (read first)

The Recall module is **self-contained**: it owns its interval logic (`recall-interval.ts`), its scheduler
(`recall.scheduler.ts`), service, controller, DTO, module. No external module owns the scheduler or
interval logic; it is **not** a thin wrapper. **No hard STOP condition is triggered.** However, several
terms in the authorization do **not** map to the implementation and are documented here as grounding
truth (not fabricated into tests):

- **Intervals are month-based ONLY.** `recallIntervalMonths: Int` and `recallIntervalFor` returns
  `{ months }`. There are **no** day/week/year intervals, no fixed-date intervals, and no cron-style
  recurrence rules.
- **There is NO recurrence / `generateNextRecall`.** A recall is **single-shot per trigger record**
  (`@@unique([labId, triggerRecordId])`). Completion does **not** generate a next-cycle recall.
- **Method names differ from the authorization's paraphrase.** Actual: `manual` /
  `autoCreateFromBethesda` (not `createRecall`), `update`/`complete`/`cancel`/`decline` (not a single
  `updateRecall`), `checkDue` (not `processDueRecalls`). This design uses the **real** method names.
- **The scheduler entry `run()` is a global all-lab sweep** and is **not** isolable in the shared `_test`
  DB (see §4); the testable unit is the per-lab business method `checkDue()` (strategy §7).

---

## 1. Public surface inventory

**Exported pure function (unit-testable, no DB):**
- `recallIntervalFor(b: BethesdaLite | null): RecallInterval | null` (`recall-interval.ts`) — maps a
  Bethesda classification to `{ months, diagnosis }` or `null`. Interfaces `BethesdaLite`,
  `RecallInterval` exported.

**`RecallService` public methods (14):**

| Area | Methods |
|---|---|
| Create | `autoCreateFromBethesda(recordId)`, `manual(dto)` |
| Queries | `list`, `summary`, `detail`, `byPatient`, `generateList`, `recordIdsWithOpenRecall` |
| Lifecycle mutations | `update`, `complete`, `cancel`, `decline`, `notifyClient` |
| Scheduler business method | `checkDue()` |

Private helpers (not test targets): `addMonths`, `clientName`, `toRow`, `getRecall`.

**`RecallScheduler`:** `run()` — `@Cron('45 6 * * *')`, sweeps all labs (`runSystem` → `lab.findMany`),
per-lab `runLabScoped(lab.id, () => checkDue())` with per-lab try/catch error isolation.

**`RecallController` routes (11) — all permissioned (base `recalls`):**

| Handler | Route | Permission |
|---|---|---|
| `list` | `GET recalls` | `record:view` |
| `summary` | `GET recalls/summary` | `record:view` |
| `generateList` | `GET recalls/generate-list` | `record:view` |
| `byPatient` | `GET recalls/patient/:patientId` | `record:view` |
| `manual` | `POST recalls/manual` | `record:change` |
| `detail` | `GET recalls/:id` | `record:view` |
| `update` | `PATCH recalls/:id` | `record:change` |
| `complete` | `POST recalls/:id/complete` | `record:change` |
| `cancel` | `POST recalls/:id/cancel` | `record:change` |
| `decline` | `POST recalls/:id/decline` | `record:change` |
| `notifyClient` | `POST recalls/:id/notify-client` | `record:change` |

> Recall reuses the **`record:*`** permission namespace — there is no recall-specific permission code.

**DTOs:** `RecallQueryDto`, `UpdateRecallDto`, `CompleteRecallDto`, `NotesDto`, `ManualRecallDto`
(`intervalMonths` `@Min(1) @Max(120)`), `GenerateListQueryDto`.

**Module/collaborators:** `RecallModule` imports `PrismaModule` + `NotificationsModule`. `RecallService`
injects `PrismaService` + `NotificationsHelper`. `RecallScheduler` injects `RecallService`,
`PrismaService`, `LabContext`.

## 2. Recall domain model

- **Entity:** `RecallRecord` — `@@unique([labId, triggerRecordId])` (one recall per trigger record);
  links `patient`, `triggerRecord` (`onDelete: Cascade`), optional `clientId`; carries
  `recallIntervalMonths`, `dueDate`, `status`, reminder/notify/completion timestamps.
- **`RecallStatus`:** `Pending` (not yet due) → `Due` (past `dueDate`) → `Overdue` (>90d past); terminal
  intents `Completed`, `Cancelled`, `Declined`.
- **Creation paths:** `autoCreateFromBethesda` (Bethesda-triggered, status `Pending`, **idempotent** via
  an existing-trigger check) and `manual` (upsert by `[labId, triggerRecordId]`, status `Pending`).
- **Observable state transitions:**
  - `checkDue`: `Pending → Due` when `dueDate ≤ now`; `Due → Overdue` when `dueDate ≤ now − 90d`.
  - `complete → Completed`; `cancel → Cancelled`; `decline → Declined`.
  - `update`: sets `status` to **any** `RecallStatus` from the DTO (and/or `notes`), with **no guard**
    (SD-1).
- **Ownership / linkage / scope:** patient linkage via `patientId`; trigger linkage via
  `triggerRecordId`; client linkage optional; every row carries `labId` (tenancy-scoped). Completion
  records `completedAt` + optional `completedRecordId`; `notifyClient` records `clientNotifiedAt` intent
  only (no live lab→portal channel).
- **No recurrence / expiration model:** recalls do not auto-renew, expire, or spawn successors.

## 3. Recall interval model

- **Representation:** integer **months** only (`recallIntervalMonths`). `recallIntervalFor` yields
  `{ months: 3 | 12 | 36, diagnosis }` or `null`.
- **Due-date calculation:** `dueDate = addMonths(triggerDate, months)` where `addMonths` uses
  `Date.setMonth(getMonth() + months)` (server-local month arithmetic; `triggerDate` from
  `bethesdaResult.reportedAt ?? specimenDate ?? createdAt` for auto, or `specimenDate ?? createdAt` for
  manual).
- **Overdue calculation:** constant `OVERDUE_DAYS = 90`; `checkDue` uses `dueDate ≤ now − 90d`.
  `daysUntilDue = ceil((dueDate − now)/DAY)` (`toRow`); `daysPastDue = ceil((now − dueDate)/DAY)`
  (`generateList`).
- **Timezone assumption:** month arithmetic is server-local; `dueDate` persists as UTC `DateTime`.
- **Interval invariants (to verify):** `recallIntervalFor` mapping + precedence (§7 A); `dueDate =
  triggerDate + N months` for clean (non-end-of-month) trigger dates; `manual.intervalMonths ∈ [1,120]`
  (DTO). **Edge (SD-2):** `setMonth` overflow (e.g. Jan 31 + 1mo → Mar 3) — **characterized, not
  blessed**; tests use clean mid-month trigger dates only.

## 4. Scheduler architecture

- **Entry point:** `RecallScheduler.run()` — `@Cron('45 6 * * *')` daily.
- **Execution:** `runSystem` → `prisma.lab.findMany` (ALL labs), then per lab `runLabScoped(lab.id, () =>
  recalls.checkDue())`, aggregating `{due, overdue}` counts; **per-lab try/catch** isolates one lab's
  failure from the sweep.
- **`checkDue()` (the per-lab business method):** two phases — (1) find `Pending` with `dueDate ≤ now`,
  notify `system:health` per row, then `updateMany → Due`; (2) find `Due` with `dueDate ≤ now − 90d`,
  notify, then `updateMany → Overdue`. Returns `{ due, overdue }` counts.
- **Transaction boundaries:** **none** — `checkDue` performs sequential reads / `updateMany` / notify
  calls with **no `$transaction`**. Notifications are emitted **before** the status `updateMany` commits
  (SD-4).
- **Idempotency / duplicate prevention:** a second `checkDue` with no newly-eligible rows returns
  `{0,0}` and emits no notifications (rows already advanced). Creation idempotency lives in
  `autoCreateFromBethesda` (existing-trigger check) and `manual` (upsert).
- **Testability boundary (strategy §7):** C4 tests **`checkDue()` directly** with controlled data/time.
  `run()` is a **global all-lab sweep** (`runSystem` bypasses tenancy → returns every lab in the shared
  `_test` DB, including other tests' labs) and is therefore **not deterministically isolable** in the
  capped-parallel pool; its logic (lab iteration + `runLabScoped(checkDue)` + per-lab error isolation) is
  covered **indirectly** via `checkDue()`. `run()` itself is out of C4's deterministic scope.

## 5. Core workflows (only those that exist)

| Workflow | Sequencing / collaborators / boundaries |
|---|---|
| `autoCreateFromBethesda(recordId)` | reads Record+BethesdaResult; `recallIntervalFor`; **skip** if no result / no interval (high-grade→null) / existing recall; else create `Pending` with `dueDate`. **Swallows all errors** (log.warn) → SD-5. Called **by BethesdaService** (inbound hook; C7 owns the call site, C4 owns this method's behavior). |
| `manual(dto)` | reads trigger Record; **upsert** by `[labId, triggerRecordId]`; sets interval/dueDate/notes. Trusts `dto.patientId` (SD-3). |
| `update/complete/cancel/decline` | `getRecall` (404 if missing) → single `update` to the target status/notes. **No prior-state guard** (SD-1). |
| `notifyClient` | records `clientNotifiedAt`; returns intent (`clientLinked`). No live channel. |
| `checkDue` | §4 (scheduler). Collaborators: Prisma + `NotificationsHelper`. |
| `list/summary/detail/byPatient/generateList/recordIdsWithOpenRecall` | read-only projections; `recordIdsWithOpenRecall` returns distinct sorted trigger-record ids for open statuses (Pending/Due/Overdue) — a mutation-free signal for another subsystem. |

**Observable outputs:** created/updated `RecallRecord` rows (+ derived `toRow` fields: `patientName`,
`labNo`, `clientName`, `daysUntilDue`); `checkDue` counts; `summary` aggregates + `overdueRate`;
`notifyPermission` calls (stubbed).

## 6. Authorization & tenancy

- **Permission model:** `record:view` (reads) / `record:change` (mutations) on all 11 routes — Recall
  reuses the record namespace. C4 asserts route→permission **metadata** only.
- **Tenancy:** `RecallRecord` carries `labId` → auto-scoped. Unscoped reads/`groupBy`/`updateMany` in the
  service are lab-scoped at query time. **Cross-lab (frozen outcomes):** `detail`/`update`/`complete`/
  `cancel`/`decline`/`notifyClient` on a foreign id → `NotFoundException`; `list`/`summary`/`generateList`
  /`byPatient`/`recordIdsWithOpenRecall` scoped to the acting lab; `checkDue` advances only the acting
  lab's recalls. **Missing lab context** → guard throws (fail-closed).
- **Scheduler execution context / system user:** `run()` uses `runSystem` only to **enumerate labs**
  (control-plane read), then executes `checkDue` inside each lab's `runLabScoped` context — so all recall
  mutations happen **lab-scoped**, never system-wide. There is no per-user actor on the cron path
  (notifications target permission holders, not a specific user).

## 7. Integration map

| Collaborator | Dependency |
|---|---|
| **Prisma** | all data access (`RecallRecord`, `Record`, `Patient`, `BethesdaResult`). |
| **NotificationsHelper** | `checkDue` emits `system:health` SYSTEM_ALERT notifications on Due/Overdue → **stub** (heavy emitter). |
| **LabContext** | scheduler `runSystem`/`runLabScoped`. |
| **BethesdaService (inbound)** | calls `autoCreateFromBethesda` on Bethesda upsert — the **call site** is C7's concern; C4 owns the method's own behavior. |
| **Data deps** | `Record` (trigger, `onDelete: Cascade`), `Patient`, `BethesdaResult`, `Client`. |
| Billing / Payments / Payroll / Audit | **none.** |

## 8. Test architecture proposal (design only)

**A. `recallIntervalFor` — pure unit (no DB):** every branch + precedence — `null` input; Unsatisfactory
→ `{3, UNSAT}` (and Unsatisfactory precedence over other categories); high-grade nulls (HSIL, SCC,
ASC+ASCH, glandular AIS/Adenocarcinoma/AGC_FavorNeoplastic, OtherMalignancy); low-grade `{12,…}`
(ASC+ASCUS, LSIL, AGC); NILM → `{36, NILM}`; unmatched → `null`.

**B. Service integration (`_test`, production-parity client, `labContext.run`):**
- `autoCreateFromBethesda`: creates `Pending` with `dueDate = triggerDate + months`; **idempotent**
  (second call = no duplicate); **skips** when no BethesdaResult / no interval (high-grade) / existing
  recall.
- `manual`: creates then upserts (second call updates interval/dueDate/notes, no duplicate).
- `update`/`complete`/`cancel`/`decline`: reach the target status; 404 on unknown. (SD-1 not blessed —
  transitions tested from the normal `Pending`/`Due` origin, not from terminal states.)
- `notifyClient`: sets `clientNotifiedAt`, returns `clientLinked`.
- `list` (status/client/due/search filters), `summary` (counts + `overdueRate`), `detail` (404),
  `byPatient`, `generateList`, `recordIdsWithOpenRecall` (open statuses only, distinct + sorted).

**C. Scheduler (`checkDue` direct, controlled time via safely-separated dates):** `Pending → Due` when
past due (+ notify called); `Due → Overdue` when >90d past (+ notify); a future-dated `Pending` stays
`Pending`; **idempotency** (second `checkDue` → `{0,0}`, no notify); returned counts. `NotificationsHelper`
stubbed.

**D. Tenancy:** cross-lab `detail`/mutations → `NotFound`; list/summary scoped; `checkDue` advances only
the acting lab; missing-context → guard throws.

**E. Controller:** all 11 route→permission metadata mappings via exported `PERMISSIONS_KEY` +
completeness. (Handlers are 1-line delegations; minimal forwarding assertions only where a param is
transformed — none here beyond pass-through.)

**Fixtures:** `Lab` ×2, `Patient`, `Record` (trigger), `BethesdaResult` (for auto-create), optional
`Client`; recalls created via the service or seeded via the bare client with explicit `dueDate`/`status`.
`NotificationsHelper` stub. Teardown child-first, `labId`-scoped: `RecallRecord → BethesdaResult →
Record → Patient → (Client) → Lab`. One fresh UUID lab per test; capped-parallel pool. **Controlled
time:** seed `dueDate` safely separated from `now` (past for Due, `< now − 90d` for Overdue, future for
Pending) so `checkDue`/`daysUntilDue` are deterministic without freezing the clock.

**Not in C4:** `run()` global sweep (§4, not isolable); recurrence/next-cycle (does not exist);
day/week/year intervals (do not exist); the BethesdaService call site (C7); SD-1…SD-5 remediation.

## 9. Suspected defects (record only — no fix, no green characterization test)

- **SD-1 — No prior-state guards on lifecycle transitions.** `complete`/`cancel`/`decline` and especially
  `update` (arbitrary `status` from the DTO) can transition a recall from **any** state, including the
  terminal `Completed`/`Cancelled`/`Declined`, with no state-machine enforcement (e.g. `Completed →
  Pending` via `update`). C4 does not encode any such transition as valid.
- **SD-2 — `addMonths` end-of-month overflow.** `Date.setMonth` rolls over (Jan 31 + 1mo → Mar 3), so a
  month-end `triggerDate` can yield an unexpected `dueDate` month. Standard JS behavior; clinical intent
  unconfirmed. Tests use clean mid-month dates and do not bless the overflow.
- **SD-3 — `manual` trusts `dto.patientId`.** The upsert stores `dto.patientId` without verifying it
  matches the trigger record's actual patient → a recall could link a trigger record to a mismatched
  patient.
- **SD-4 — `checkDue` non-atomic notify-before-persist + double transition in one sweep.** Notifications
  are emitted before the status `updateMany` commits (no `$transaction`); and a long-overdue `Pending`
  recall can advance `Pending → Due → Overdue` within a **single** sweep (two notifications), because the
  Due→Overdue phase re-selects the just-updated `Due` rows.
- **SD-5 — `autoCreateFromBethesda` silently swallows all errors** (try/catch → `log.warn`, returns
  void). Graceful by intent, but a creation failure is invisible to the caller.

None require a production change to test the accepted behavior; all are recorded for separate,
explicitly-authorized review and must not be encoded as passing characterization tests.

## 10. Accepted vs deferred scope

**Accepted (C4):** `recallIntervalFor` mapping/precedence (unit); `autoCreateFromBethesda` (create +
idempotency + skips); `manual` (create/upsert); lifecycle `update`/`complete`/`cancel`/`decline`/
`notifyClient`; queries (`list`/`summary`/`detail`/`byPatient`/`generateList`/`recordIdsWithOpenRecall`);
`checkDue` scheduler transitions + notify + idempotency; tenancy isolation; controller permission
metadata.

**Deferred:** `run()` global sweep (not isolable); recurrence/next-cycle & day/week/year intervals (do
not exist); the BethesdaService inbound call site (C7); SD-1…SD-5 remediation; DTO-layer validation
(`intervalMonths` bounds) → controller/pipe checkpoint; R1 test-infra.

## 11. Definition of done (inherits strategy §14)

One primary invariant per test; controlled time via safely-separated dates (no wall-clock coupling);
all §10-accepted invariants (happy + failure); cross-lab exact per §6; missing-context fails closed;
deterministic + parallel-safe (unique lab, scoped teardown, alone + capped-parallel); `tsc` clean; new
specs green; `test:parallel` stays green; **no** production/schema/migration/global-setup change;
`_test`-only; SD-1…SD-5 documented, not encoded. Pathspec-stage only the new spec file(s) → review →
commit on approval.

## 12. Governance

**Architectural-review rulings (recorded, frozen):** C4 covers only the self-contained Recall module
(Bethesda caller = inbound boundary, the open-recall projection = outbound boundary — neither expands
scope). Grounding truth accepted: month-based, single-shot recalls; no recurrence/successor; actual
method names govern the inventory; nonexistent day/week/year/fixed-date/recurrence/preview workflows are
**not** fabricated. `checkDue()` is the deterministic scheduler surface; `RecallScheduler.run()` global
DB execution is **out** of deterministic C4 scope (an optional narrow test may verify `run()` only via
**mocked delegation/metadata**, never a shared-DB sweep, and only if it needs no global cleanup / cross-
lab assumption / order dependence). **SD-1…SD-5 remain unresolved suspected defects and must not be
normalized by green characterization tests** (no terminal→active transition, no end-of-month-overflow
contract, no patient-mismatch acceptance, no notify-before-persist / duplicate-notify / double-state
advance blessing, no silent-failure contract); if implementing the design would require asserting any of
those as correct, **stop and return for review**.

- **Design only.** This audit was **read-only**: nothing created besides this document, nothing staged,
  nothing committed, no production/schema/migration/tenancy/Program-2 changes.
- **No hard STOP condition triggered** (Recall owns its scheduler + interval logic; not a wrapper; no
  cross-module ownership ambiguity). The §0 "grounding truth vs authorization wording" items are
  documented, not blocking.
- Grants no implementation authorization; C4 implementation requires a separate authorization after this
  artifact is reviewed and committed. One module per checkpoint; pathspec-scoped commits only.
