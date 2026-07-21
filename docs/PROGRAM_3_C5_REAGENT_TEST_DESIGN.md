# Program 3 · C5 — Reagent Test Design

**Status:** Accepted (design) — frozen C5 baseline
**Owner:** engineering (quality)
**Governs:** the Reagent test-hardening checkpoint (C5)
**Grants:** no test-implementation authorization. Read-only design artifact. No production, schema,
migration, tenancy, or Program-2 changes are authorized.
**Parent strategy:** `docs/PROGRAM_3_TEST_STRATEGY.md` (Phase 0, frozen `9fb04f5`)
**Sibling baselines:** C1–C4 — C5 reuses the same production-parity `_test` harness. Reagent has **no
monetary surface**.

**Files examined (read-only):** `reagent.service.ts` (245), `reagent.scheduler.ts` (28),
`reagent.controller.ts` (80), `dto/reagent.dto.ts` (46), `reagent.module.ts`; schema models
`ReagentLot`, `ReagentUsage`, enum `ReagentStatus`.

---

## 0. Grounding truth (implementation vs generalized expectations)

- **Self-contained; owns its scheduler + expiry logic** (`reagent.scheduler.ts`, `@Cron('30 6 * * *')`).
  Not a thin wrapper; no external module owns the scheduler or expiry logic. **No hard STOP triggered.**
- **Quantities are `Float`** (`ReagentLot.quantity`, `ReagentUsage.quantityUsed`) — **stored verbatim,
  never computed or aggregated** into a stock figure. No arithmetic/rounding logic → no float-equality
  concern (nothing is calculated from them).
- **`use()` logs a `ReagentUsage` row but does NOT decrement `ReagentLot.quantity`** — `quantity` is a
  **manually-maintained field**, not an auto-depleted authoritative stock level (SD-1).
- **No reorder / replenishment / transfer model exists.** There is no reorder threshold, low-stock
  alert, restock, or lot-to-lot transfer.
- **No automatic `Depleted` / `Recalled` transition.** Those `ReagentStatus` values are reachable **only**
  via `update(dto.status)`; the engine auto-produces only `Active` (create) → `Quarantined` (quarantine)
  / `Expired` (checkExpiry).
- **Expiry model is date-window filtering**, not a computed interval: `Active` + `expiryDate < now` →
  `Expired`; "expiring soon" = `Active` + `expiryDate ∈ [now, now+30d]`. Notify-once dedup is keyed on
  the **Notification table** (SD-3).
- **The scheduler entry `run()` is a global all-lab sweep** and is **not** isolable in the shared `_test`
  DB (§5); the deterministic surface is the per-lab `checkExpiry()`.
- **No exported pure function** (unlike C1 money / C3 `computeAdvice` / C4 `recallIntervalFor`) → **C5 has
  no pure-unit layer**; date-window logic is embedded in service methods and tested via integration with
  controlled dates.

---

## 1. Public surface inventory

**Exported pure helpers:** none. (`EXPIRING_WINDOW_DAYS = 30`, `DAY` are module-local constants, not
exported.)

**`ReagentService` public methods (12):**

| Area | Methods |
|---|---|
| Lots | `list`, `create`, `detail`, `update`, `remove` |
| Usage | `use`, `usedOnRecord` |
| Quarantine | `quarantine`, `affectedRecords` |
| Reporting | `expiring`, `stats` |
| Scheduler business method | `checkExpiry()` |

Private helpers (not test targets): `toLot`, `getLot`.

**`ReagentScheduler`:** `run()` — `@Cron('30 6 * * *')`; `runSystem` → `lab.findMany` (all labs), per-lab
`runLabScoped(lab.id, () => checkExpiry())` with per-lab try/catch.

**`ReagentController` routes (11) — all permissioned (base `reagents`):**

| Handler | Route | Permission |
|---|---|---|
| `list` | `GET reagents` | `record:view` |
| `expiring` | `GET reagents/expiring` | `record:view` |
| `stats` | `GET reagents/stats` | `record:view` |
| `usedOnRecord` | `GET reagents/record/:recordId` | `record:view` |
| `create` | `POST reagents` | `record:change` |
| `detail` | `GET reagents/:id` | `record:view` |
| `update` | `PATCH reagents/:id` | `record:change` |
| `remove` | `DELETE reagents/:id` | `record:change` |
| `use` | `POST reagents/:id/use` | `record:change` |
| `quarantine` | `POST reagents/:id/quarantine` | `record:change` |
| `affectedRecords` | `GET reagents/:id/affected-records` | `record:view` |

> Reagent reuses the **`record:*`** permission namespace — no reagent-specific permission code.

**DTOs:** `CreateReagentDto`, `UpdateReagentDto` (`status?` any `ReagentStatus`), `ReagentQueryDto`
(`status?`, `expiringSoon?`), `UseReagentDto`, `QuarantineDto` (`reason` required).

**Module/collaborators:** `ReagentModule` imports `PrismaModule` + `NotificationsModule`. `ReagentService`
injects `PrismaService` + `NotificationsHelper`. `ReagentScheduler` injects `ReagentService`,
`PrismaService`, `LabContext`.

## 2. Bounded context

- **Owned state:** `ReagentLot`, `ReagentUsage` (both `labId`-scoped; `@@unique([labId, lotNumber])`).
- **Owned workflows:** lot CRUD, usage logging, quarantine + affected-record warning, expiry auto-check,
  reporting (`expiring`/`stats`).
- **Collaborators:** `PrismaService` (data); `NotificationsHelper` (outbound `system:health`
  notifications on quarantine + expiring-soon).
- **Inbound:** the controller exposes all workflows directly; `usedOnRecord`/`affectedRecords` are read
  projections consumed by record-detail / quality views.
- **Outbound / data deps:** `User` (`createdById` optional; `usedById` **required**), `Record`
  (`usage.recordId` optional), `Notification` (read for the expiry-dedup, written via the notifier).
- **Verdict:** **self-contained** — it owns its entities, lifecycle, and scheduler; it does not
  orchestrate other modules.

## 3. Inventory lifecycle

| Transition | Trigger | Notes |
|---|---|---|
| (create) → `Active` | `create` | trims name/lotNumber; sets `createdById`. |
| any field incl. `status`/`quantity` | `update` | **arbitrary `status`** from the DTO, **no guard** (SD-2). |
| usage logged (quantity **unchanged**) | `use` | inserts `ReagentUsage`; **does not deplete `quantity`** (SD-1); does **not** check lot status (SD-4). |
| → `Quarantined` | `quarantine` | sets `notes = reason` (**overwrites** prior notes, SD-5); notifies; warns on records used in the last 7 days. |
| `Active` → `Expired` | `checkExpiry` | `expiryDate < now`. |
| delete | `remove` | **guarded**: rejected if the lot has any recorded usage (`BadRequest`); else hard delete. |
| `Depleted` / `Recalled` | `update` only | no automatic path. |

**Not implemented:** stock decrement on use, reorder/low-stock, replenishment/restock, transfers,
archival/soft-delete (usage history is preserved by the `remove` guard, not a soft-delete column).

## 4. Expiry model

- `ReagentLot.expiryDate` is **nullable**; lots with no expiry never expire or warn.
- **`checkExpiry`:** `updateMany` `Active` + `expiryDate < now` → `Expired`; then find `Active` +
  `expiryDate ∈ [now, now+30d]` and notify **once per lot** — dedup via
  `notification.count({ entityId: lot.id, entityType: 'reagent-expiry' })` (SD-3). Returns
  `{ expired, notified }`.
- **Expiring-soon window = 30 days** (`EXPIRING_WINDOW_DAYS`), shared by `list(expiringSoon)`,
  `expiring()`, and `stats().expiringSoon`.
- **No consumption constraint:** `use()` does not block usage of an `Expired`/`Quarantined`/`Recalled`
  lot (SD-4).

## 5. Scheduler architecture

- **Entry:** `ReagentScheduler.run()` — `@Cron('30 6 * * *')` daily.
- **Execution:** `runSystem` → `lab.findMany` (ALL labs) → per-lab `runLabScoped(lab.id, () =>
  checkExpiry())`, aggregating counts; **per-lab try/catch** isolates one lab's failure.
- **Transaction boundaries:** **none** — `checkExpiry` runs `updateMany` → `findMany` → per-lot notify
  with **no `$transaction`**; notifications are emitted after the status `updateMany` (SD-6).
- **Deterministic test surface:** **`checkExpiry()`** (per-lab business method), tested directly with
  controlled dates. `run()` is a **global all-lab sweep** (`runSystem` bypasses tenancy → returns every
  lab in the shared `_test` DB) and is therefore **not deterministically isolable**; its logic (lab
  iteration + `runLabScoped(checkExpiry)` + per-lab error isolation) is covered indirectly. `run()` is
  **out** of C5's deterministic scope (an optional narrow mocked-delegation/metadata test may verify it
  without a shared-DB sweep).

## 6. Authorization & tenancy

- **Permission model:** `record:view` (reads) / `record:change` (mutations) on all 11 routes. C5 asserts
  route→permission **metadata** only.
- **Tenancy:** `ReagentLot` / `ReagentUsage` carry `labId` → auto-scoped. Unscoped
  reads/`groupBy`/`updateMany`/`count` are lab-scoped at query time. **Cross-lab (frozen outcomes):**
  `detail`/`update`/`remove`/`use`/`quarantine`/`affectedRecords` on a foreign id → `NotFoundException`
  (scoped read misses); `list`/`expiring`/`stats`/`usedOnRecord` scoped to the acting lab; `checkExpiry`
  expires only the acting lab's lots. **Missing lab context** → guard throws (fail-closed).
- **Transaction scope:** none (§5). Query/update isolation is by the tenancy guard, not by explicit
  transactions.

## 7. Proposed testing architecture (design only)

- **Pure unit:** **none** — no exported pure function (§0). (Date-window behavior is verified through
  integration with controlled dates.)
- **Service integration (`_test`, production-parity client, `labContext.run`):** `create` → `Active`;
  `detail` (+ usages; 404); `update` (fields incl. status/quantity; 404); `remove` (delete when no
  usage; **`BadRequest` when usages exist**; 404); `use` (logs a `ReagentUsage`, **asserts `quantity`
  unchanged** — grounding truth SD-1, not blessed as depletion); `quarantine` (→ `Quarantined`, notify
  called, affected-record count for last-7-day usages); `affectedRecords` (de-duped record list);
  `usedOnRecord`; `expiring` / `list(expiringSoon)` (30-day window with controlled dates); `stats`
  (counts + `mostUsedReagent` + `recentUsages`).
- **Scheduler (`checkExpiry` direct, controlled dates):** `Active` past-expiry → `Expired`; expiring-soon
  (within 30d) → notify + returns `notified`; **dedup** (seed a prior `reagent-expiry` Notification →
  `checkExpiry` skips that lot); a far-future / no-expiry `Active` lot untouched + not notified.
- **Tenancy:** cross-lab `detail`/mutations → `NotFound`; list/stats scoped; `checkExpiry` lab-scoped;
  missing-context → guard throws.
- **Controller:** all 11 route→permission metadata mappings via exported `PERMISSIONS_KEY` +
  completeness + representative parameter forwarding (`create`/`use` thread `user.userId`;
  `usedOnRecord` forwards `recordId`).

**Fixtures:** `Lab` ×2, `Account → User` (for `createdById`/`usedById`; `usedById` is **required** on
`ReagentUsage`), `ReagentLot` (via the service or bare client with controlled `expiryDate`/`status`),
`ReagentUsage` (bare client), `Record`+`Patient` for usage-linked/affected-record tests, and a seeded
`Notification` (bare client) to exercise the expiry-dedup skip. Teardown child-first, `labId`-scoped:
`ReagentUsage → ReagentLot → Notification → Record → Patient → User → Account → Lab`. One fresh UUID lab
per test; capped-parallel pool. **Controlled time:** seed `expiryDate` safely separated from `now` (past
for Expired, within 30d for expiring-soon, far future / null for neither).

## 8. Suspected defects (record only — no fix, no green characterization test)

- **SD-1 — `use()` does not decrement `quantity`.** Usage is logged but the lot's `quantity` is never
  reduced, so `quantity` is not an authoritative stock level. **Ruling:** C5 may assert `quantity` is
  **unchanged** after `use` to protect the current implementation from accidental change, but the test
  must describe this as the **current implementation behavior** — explicitly **not** the desired
  inventory/depletion contract. No depletion contract is asserted.
- **SD-2 — `update` allows arbitrary `status` transitions.** Any `ReagentStatus` from the DTO with no
  state-machine guard (e.g. `Expired → Active`, `Recalled → Active`). Not blessed.
- **SD-3 — expiry-dedup couples to the Notification table.** "Notify once per lot" is enforced by
  counting prior `reagent-expiry` notifications; pruning/clearing notifications causes re-notification —
  fragile idempotency across a table boundary.
- **SD-4 — `use()` imposes no consumption constraint.** Usage can be recorded against an `Expired`,
  `Quarantined`, `Recalled`, or `Depleted` lot; `getLot` does not gate on status.
- **SD-5 — `quarantine` overwrites `notes` with `reason`,** clobbering any prior notes on the lot.
- **SD-6 — non-atomic status-then-notify sequencing.** `quarantine` and `checkExpiry` perform their
  status writes and notifications without a `$transaction`; a failure between them leaves partial state /
  missing or duplicate notifications.
- **SD-7 — `use()` trusts `dto.recordId`.** The referenced `Record` is not verified to belong to the
  acting lab (the tenancy guard stamps `ReagentUsage.labId`, but `recordId` is an unvalidated FK).

None require a production change to test the accepted behavior; all are recorded for separate,
explicitly-authorized review and must not be encoded as passing characterization tests.

## 9. Stop conditions / items for review before implementation

- **No hard STOP triggered.** Reagent owns its scheduler + expiry logic; not a wrapper; no cross-module
  ownership ambiguity; no production change or missing seam required (all methods public;
  `NotificationsHelper` stubbable).
- **Note for implementation (not a blocker):** exercising the expiry **dedup** requires seeding a real
  `Notification` row (the stubbed notifier writes none), and the `run()` global sweep must not be
  integration-tested against the shared DB (§5). These are fixture/scope constraints, already reflected
  in §7.
- **Suspected-defect rulings requested** (as with prior checkpoints): confirm SD-1…SD-7 remain
  documented-only and are **not** to be normalized by green tests — in particular that C5 asserts
  `quantity`-unchanged-after-use as *observed truth* (SD-1) rather than as a desired depletion contract.

## 10. Accepted vs deferred scope

**Accepted (C5):** lot CRUD + `remove` guard; `use` logging (quantity-unchanged truth); `quarantine` +
affected warning + notify; `affectedRecords`/`usedOnRecord`; `expiring`/`stats`/`list` filters;
`checkExpiry` expiry + expiring-soon notify + dedup; tenancy isolation; controller permission metadata.

**Deferred:** `run()` global sweep (not isolable); reorder/replenishment/transfer/depletion (do not
exist); SD-1…SD-7 remediation; DTO-layer validation → controller/pipe checkpoint; R1 test-infra;
Notification module internals (C-owned elsewhere).

## 11. Definition of done (inherits strategy §14)

One primary invariant per test; controlled time via safely-separated dates; all §10-accepted invariants
(happy + failure); cross-lab exact per §6; missing-context fails closed; deterministic + parallel-safe
(unique lab, scoped teardown, alone + capped-parallel); `tsc` clean; new specs green; `test:parallel`
stays green; **no** production/schema/migration/global-setup change; `_test`-only; SD-1…SD-7 documented,
not encoded. Pathspec-stage only the new spec file(s) → review → commit on approval.

## 12. Governance

**Architectural-review rulings (recorded, frozen):** C5 covers only the self-contained Reagent module
(no expansion into Records/Recall/Billing/Payments/Payroll or other inventory domains). Grounding truth
is the frozen baseline — manual `quantity`, `use()` logs without depleting, no reorder/replenishment/
transfer/computed-ledger, no `$transaction`, Reagent-owned scheduler, no exported pure function.
`checkExpiry()` is the deterministic scheduler surface; `run()` global-DB execution is **out** of
deterministic scope (optional narrow mocked-delegation/metadata only). The expiry dedup mechanism (30-day
window, `Active→Expired`, Notification-record dedup) **may** be verified as implemented behavior — without
claiming the Notification-table coupling is preferred. **SD-1…SD-7 remain unresolved suspected defects
and must not be normalized by green tests:** SD-1 `quantity`-unchanged is characterized as **current
implementation behavior, not the desired contract**; SD-2 (no arbitrary/invalid lifecycle transitions),
SD-4 (no expired/quarantined-lot-use blessing), SD-5 (no notes-overwrite normalization), SD-6 (no
ordering/failure-contract blessing), SD-7 (no cross-lab record acceptance). Normal lifecycle paths only;
if implementing the design would require asserting any SD as correct, **stop and return for review**.

- **Design only.** This audit was **read-only**: nothing created besides this document, nothing staged,
  nothing committed, no production/schema/migration/tenancy/Program-2 changes.
- No hard STOP condition triggered; the §0 grounding-truth items are documented, not blocking.
- Grants no implementation authorization; C5 implementation requires a separate authorization after this
  artifact is reviewed and committed. One module per checkpoint; pathspec-scoped commits only.
