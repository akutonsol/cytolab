# Program 3 · C6 — Request Tracking Test Design

**Status:** Accepted (design) — frozen C6 baseline
**Owner:** engineering (quality)
**Governs:** the Request Tracking test-hardening checkpoint (C6)
**Grants:** no test-implementation authorization. Read-only design artifact. No production, schema,
migration, tenancy, or Program-2 changes are authorized.
**Parent strategy:** `docs/PROGRAM_3_TEST_STRATEGY.md` (Phase 0, frozen `9fb04f5`)
**Sibling baselines:** C1–C5 — C6 reuses the same production-parity `_test` harness. No monetary surface.

**Files examined (read-only):** `req-tracking.service.ts` (217), `req-tracking.controller.ts` (68),
`dto/req-tracking.dto.ts` (36), `req-tracking.module.ts`; schema models `RequisitionTracking`,
`TrackingEvent`, enums `TrackingStage`, `FormCondition`.

---

## 0. Grounding truth (implementation vs generalized expectations)

- **Module identity / disambiguation.** C6 = the **`req-tracking`** module (`ReqTrackingService`,
  `RequisitionTracking` + `TrackingEvent`) — the requisition intake pipeline with a stage status and an
  event timeline. A **separate** `change-requests` module (`ChangeRequest` + its own **guarded**
  `ALLOWED_TRANSITIONS` state machine) also matches the word "request"; it is a **distinct bounded
  context and is OUT of C6** (a candidate for its own future checkpoint). This design covers `req-tracking`
  only.
- **Self-contained; no scheduler.** `req-tracking` owns `RequisitionTracking` + `TrackingEvent`; there is
  **no cron/scheduler** in this module.
- **Status is a stage field, transitions are event-driven and UNGUARDED.** `RequisitionTracking.currentStage`
  (`TrackingStage`) is set by transition methods that **do not enforce stage order** — `advance()` sets
  `currentStage = target` unconditionally (SD-1). A sibling module (`change-requests`) *does* guard its
  transitions; `req-tracking` does not.
- **`Processing` is a dead enum stage.** `TrackingStage` includes `Processing`, but **no transition
  method ever produces it** (`STAGE_ORDER` is `Pending → FormReceived → BenchReceived → Verified →
  Filed`; `Rejected` is a terminal side transition). `Processing` is unreachable via this module (SD-4).
- **Reads have write side effects.** `getByRequisition` uses **get-or-create** (creates a `Pending`
  tracking row if none exists), and `list`/`stats` call `ensureAll()` which **backfills** missing tracking
  rows — all under the `requisition:view` permission (SD-3).
- **No transaction boundaries.** `advance()` performs a `RequisitionTracking` update **then** a separate
  `TrackingEvent` insert with **no `$transaction`** (SD-2).
- **No monetary surface; no exported pure function.** The only export besides the class is the
  `STAGE_ORDER` **constant array** (data, not a function) → **no pure-unit layer** (like C5 Reagent).

---

## 1. Public surface inventory

**Exported helpers:** `STAGE_ORDER` (a `TrackingStage[]` constant). No exported pure function.

**`ReqTrackingService` public methods (9):**

| Area | Methods |
|---|---|
| Queries | `list`, `getByRequisition`, `scan`, `stats` |
| Transitions | `receiveForm`, `receiveBench`, `verify`, `file`, `reject` |

Private helpers (not test targets): `ensureAll`, `stageEnteredAt`, `toCard`, `detailFields`,
`getOrCreate`, `logEvent`, `advance`.

**`ReqTrackingController` routes (9) — all permissioned (base `req-tracking`):**

| Handler | Route | Permission |
|---|---|---|
| `list` | `GET req-tracking` | `requisition:view` |
| `stats` | `GET req-tracking/stats` | `requisition:view` |
| `scan` | `POST req-tracking/scan` | `requisition:view` |
| `get` | `GET req-tracking/:requisitionId` | `requisition:view` |
| `receiveForm` | `POST req-tracking/:requisitionId/receive-form` | `requisition:change` |
| `receiveBench` | `POST req-tracking/:requisitionId/receive-bench` | `requisition:change` |
| `verify` | `POST req-tracking/:requisitionId/verify` | `requisition:change` |
| `file` | `POST req-tracking/:requisitionId/file` | `requisition:change` |
| `reject` | `POST req-tracking/:requisitionId/reject` | `requisition:change` |

> Reagent-style reuse: `req-tracking` uses the **`requisition:*`** permission namespace.

**DTOs:** `TrackingQueryDto`, `ReceiveFormDto` (`formCondition?`, `formConditionNotes?`, `barcodeValue?`),
`VerifyDto`, `FileDto` (`fileLocation` **required**), `RejectDto` (`notes` **required**), `ScanDto`
(`barcodeValue` required). (`NotesDto` is defined but unused by the controller.)

**Scheduled entry points:** **none.**

**Module/collaborators:** `ReqTrackingModule` imports `PrismaModule` + `NotificationsModule`.
`ReqTrackingService` injects `PrismaService`, `LabContext`, `NotificationsHelper`.

## 2. Bounded context

- **Owned state:** `RequisitionTracking` (one per requisition, `@unique(requisitionId)`), `TrackingEvent`
  (append-only timeline). Both `labId`-scoped.
- **Owned workflows:** stage transitions, get-or-create + backfill, barcode scan lookup, stats.
- **Collaborators:** `PrismaService` (data); `LabContext` (`getLabId` in `ensureAll`);
  `NotificationsHelper` (outbound `system:health` alert on `reject`).
- **Data deps:** `Requisition` (the tracked entity; `onDelete: Cascade`), `User`
  (`performedById`/receiver FKs), `Record`/`Patient`/`Client` (read for card display).
- **Inbound:** driven by controller actions; no other module orchestrates it.
- **Verdict:** **self-contained** — owns its entities, lifecycle, and timeline; reads `Requisition` as a
  data dependency but orchestrates no other module.

## 3. Lifecycle architecture

- **Creation:** lazy — `getOrCreate` inserts a `Pending` `RequisitionTracking` on first access (throws
  `NotFound` if the requisition doesn't exist); `ensureAll` bulk-backfills (`createMany skipDuplicates`).
- **Transitions (event-driven, unguarded — SD-1):** each sets milestone fields + `currentStage` and
  appends a `TrackingEvent`:
  - `receiveForm` → `FormReceived` (`formReceivedAt/By`, `formCondition`, optional barcode).
  - `receiveBench` → `BenchReceived`.
  - `verify` → `Verified` (`verificationNotes`).
  - `file` → `Filed` (`fileLocation` required).
  - `reject` → `Rejected` (+ `NotificationsHelper` alert).
- **No order enforcement:** any transition may run from any current stage (e.g. `file` from `Pending`,
  `receiveForm` after `Filed`, `reject` then `verify`). The timeline records whatever sequence occurs.
- **No archival/soft-delete.** `Rejected` is terminal by convention (not enforced). `Processing` is never
  produced (SD-4).

## 4. Timeline architecture

- **History model:** `TrackingEvent` — one row appended per transition, with `stage`, `performedById`,
  `notes`, `scannedBarcode`, `performedAt` (default `now()`).
- **Immutability:** **append-only** — no update/delete path exists for events; history accumulates.
- **Generation:** `advance()` → `logEvent()` after the tracking update (**not** in a transaction, SD-2).
- **Ordering:** `getByRequisition` returns events `orderBy performedAt desc`. Ordering guarantee is by
  `performedAt`; same-millisecond transitions have an **undefined tie-break** (SD-5).
- **Event ownership:** owned by `req-tracking` (distinct from the enterprise audit chain / `AuditEvent`,
  which is not involved here).

## 5. Scheduler architecture

**No scheduler exists** in `req-tracking` — no `@Cron`, no background worker, no scheduled entry point.
(Transitions are user-driven via the controller.) There is therefore no scheduler test surface in C6.

## 6. Authorization & tenancy

- **Permission model:** `requisition:view` (reads: `list`/`stats`/`scan`/`get`) / `requisition:change`
  (transitions). C6 asserts route→permission **metadata** only. (Note SD-3: view-permission reads
  perform writes.)
- **Tenancy:** `RequisitionTracking`, `TrackingEvent`, `Requisition` all carry `labId` → auto-scoped.
  `getOrCreate`/`advance`/`list`/`stats`/`scan` are lab-scoped at query time. **Cross-lab (frozen
  outcomes):** `getByRequisition` and every transition on a foreign requisition → `getOrCreate` finds no
  scoped tracking and no scoped requisition → **`NotFoundException`**; `list`/`stats`/`scan` scoped to the
  acting lab (a foreign requisition/barcode is invisible → `scan` returns `{ found: false }`). **Missing
  lab context** → guard throws (fail-closed).
- **Transaction scope:** none (§4). Isolation is by the tenancy guard, not explicit transactions.

## 7. Proposed testing architecture (design only)

- **Pure unit:** **none** — no exported pure function (a trivial `STAGE_ORDER` shape assertion is
  optional and low-value; not required).
- **Service integration (`_test`, production-parity client, `labContext.run`):** `getByRequisition`
  (creates a `Pending` row on first access; returns card + detail + events; `NotFound` for a
  nonexistent requisition); each transition (`receiveForm`/`receiveBench`/`verify`/`file`/`reject`) sets
  `currentStage` + the milestone field(s) and **appends exactly one `TrackingEvent`**; `reject` invokes
  the notifier; `list` (stage/search/client filters); `scan` (by `barcodeValue` and by `referenceNo`;
  `{ found: false }` when unmatched; `nextAction` for the current stage); `stats` (counts by stage +
  `filedToday`).
- **Timeline:** a sequence of transitions appends events in order; `getByRequisition` returns them
  `performedAt desc`; events **accumulate** (append-only) and are never mutated.
- **Scheduler:** **none** (§5).
- **Tenancy:** cross-lab `get`/transition → `NotFound`; `list`/`scan` scoped; missing-context → guard
  throws.
- **Controller:** all 9 route→permission metadata mappings via exported `PERMISSIONS_KEY` + completeness
  + representative parameter forwarding (transitions thread `user.userId`; `scan` forwards
  `dto.barcodeValue`).

**Fixtures:** `Lab` ×2, `Account → User` (transition `performedById` is a **required** FK on
`TrackingEvent`; receiver FKs optional), `Requisition` (minimal — needs only `labId`), and
`RequisitionTracking`/`TrackingEvent` produced via the service (or seeded via the bare client with a
controlled `currentStage`). Teardown child-first, `labId`-scoped: `TrackingEvent → RequisitionTracking →
Requisition → User → Account → Lab`. One fresh UUID lab per test; capped-parallel pool. **Controlled
time:** assertions target stage/event presence and counts (deterministic); `stats` **avg-timing** metrics
are timing-derived and non-deterministic → C6 asserts stage counts / `filedToday`, not exact averages
(or seeds controlled timestamps if an average is asserted).

## 8. Suspected defects (record only — no fix, no green characterization test)

- **SD-1 — No stage-order guard.** `advance()` sets `currentStage` unconditionally; any transition may
  run from any stage (`file` from `Pending`, `receiveForm` after `Filed`, `reject` then `verify`). No
  state-machine enforcement (contrast: the sibling `change-requests` module *does* guard transitions).
- **SD-2 — `advance()` is non-atomic.** The `RequisitionTracking` update and the `TrackingEvent` insert
  are separate writes with no `$transaction`; a failure between them advances the stage without a
  timeline event (or vice-versa).
- **SD-3 — Read endpoints perform writes.** `getByRequisition` (get-or-create) and `list`/`stats` (via
  `ensureAll` backfill) **create rows** under the `requisition:view` permission — a read that mutates.
- **SD-4 — `Processing` is a dead stage.** The `TrackingStage.Processing` enum value is never produced by
  any transition; it is unreachable through this module.
- **SD-5 — Timeline ordering ties.** Events are ordered by `performedAt` (default `now()`); transitions
  within the same millisecond have an undefined relative order.

None require a production change to test the accepted behavior; all are recorded for separate,
explicitly-authorized review and must not be encoded as passing characterization tests.

## 9. Stop conditions / items for review before implementation

- **No hard STOP triggered.** `req-tracking` owns its state, timeline, and workflows; no scheduler; not a
  wrapper; no cross-module ownership ambiguity beyond the documented `change-requests` disambiguation
  (§0).
- **Ruling requested (module identity):** confirm C6 == `req-tracking` (RequisitionTracking) and that
  `change-requests` is out of scope (its own future checkpoint).
- **Suspected-defect rulings requested:** confirm SD-1…SD-5 remain documented-only and are **not**
  normalized — in particular that C6 tests transitions along the **normal pipeline order** and does **not**
  assert out-of-order transitions as valid (SD-1), and does **not** assert the read-side-effect
  create/backfill (SD-3) as the intended read contract. (C6 *may* exercise get-or-create's observable
  creation as current behavior if the ruling permits, framed as current behavior — mirroring the C5 SD-1
  precedent.)

## 10. Accepted vs deferred scope

**Accepted (C6):** lazy get-or-create; the five pipeline transitions (stage + milestone + one timeline
event each) along **normal order**; `reject` notify; timeline append/order/immutability; `list`/`scan`/
`stats` queries; tenancy isolation; controller permission metadata + delegation.

**Deferred:** `change-requests` module (separate context); SD-1…SD-5 remediation; DTO-layer validation →
controller/pipe checkpoint; R1 test-infra; Requisition/Record/Notification internals (owned elsewhere).

## 11. Definition of done (inherits strategy §14)

One primary invariant per test; deterministic assertions (stage/event/counts, not timing averages); all
§10-accepted invariants (happy + failure); cross-lab exact per §6; missing-context fails closed;
deterministic + parallel-safe (unique lab, scoped teardown, alone + capped-parallel); `tsc` clean; new
specs green; `test:parallel` stays green; **no** production/schema/migration/global-setup change;
`_test`-only; SD-1…SD-5 documented, not encoded. Pathspec-stage only the new spec file(s) → review →
commit on approval.

## 12. Governance

**Architectural-review rulings (recorded, frozen):** **C6 == `req-tracking`** (`ReqTrackingService` /
`RequisitionTracking` / `TrackingEvent`); the separate `change-requests` context is **out of scope** (a
comparative observation only — its guarded state machine does not expand C6). Grounding truth is the
frozen baseline: no scheduler, no exported pure function, no pure-unit layer; lazy `Pending` creation;
event-driven **unguarded** transitions; each normal transition updates the tracking row + appends one
`TrackingEvent`; timeline is append-only, `performedAt desc`; update+append are **not** transactional;
`Processing` is unreachable. **Approved test path = the normal pipeline order** `Pending → FormReceived →
BenchReceived → Verified → Filed` (+ `Rejected` from a normal origin) — **out-of-order transitions must
not be normalized** (SD-1). **Timeline tests must use deliberately separated timestamps** — no
same-millisecond tie assertions (SD-5). **SD-1…SD-5 remain unresolved suspected defects and must not be
normalized:** SD-3 lazy get-or-create / backfill **may be characterized as current implementation
behavior** (mirroring the C5 SD-1 precedent) — **not** as the desired read/authorization contract, and not
broadened to endorse write-on-read beyond the frozen inventory; SD-2 (no partial-failure blessing), SD-4
(no invented `Processing` transition). If implementing the design would require asserting any SD as
correct, **stop and return for review**.

- **Design only.** This audit was **read-only**: nothing created besides this document, nothing staged,
  nothing committed, no production/schema/migration/tenancy/Program-2 changes.
- No hard STOP condition triggered; the §0 grounding-truth items are documented, not blocking.
- Grants no implementation authorization; C6 implementation requires a separate authorization after this
  artifact is reviewed and committed. One module per checkpoint; pathspec-scoped commits only.
