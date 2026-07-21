# Program 3 · C2 — Payments Test Design

**Status:** Accepted (design) — Pending commit as the frozen C2 baseline
**Owner:** engineering (quality)
**Governs:** the Payments test-hardening checkpoint (C2) only
**Grants:** no test-implementation authorization. C2 test implementation requires a **separate**
authorization issued after this artifact is committed. No production, schema, migration, tenancy, or
Program-2 changes are authorized.
**Parent strategy:** `docs/PROGRAM_3_TEST_STRATEGY.md` (Phase 0, frozen `9fb04f5`)
**Sibling baseline:** `docs/PROGRAM_3_C1_BILLING_TEST_DESIGN.md` (C1, frozen `4b4c731`); C2 reuses the C1
harness verbatim and consumes C1's frozen Billing behavior as a dependency.

---

## 0. Grounding findings (from the actual code)

- **(P-F1) Monetary representation — RESOLVED (strategy §4).** `Payment.amount`, `Bill.amountPaid`, and
  `Bill.total` are all Prisma **`Int` = integer cents**; `PaymentType` is an enum. No `Decimal`/float in
  persistence. (The notification body computes `amount / 100` for a **display** string only — not stored,
  not a §4 concern.) → All monetary assertions use **exact integer equality**.
- **(P-F2) Harness — reuse C1 verbatim.** Same production-parity extended `_test` client
  (`createTestPrisma().$extends(tenancyExtension(labContext)).$extends(phiEncryptionExtension())`), bare
  client for seeding + scoped teardown, driven inside `labContext.run`. **Two** heavy collaborators to
  stub: `RecordsService.updateStatus` and `NotificationsHelper.notifyPermission`.
- **(P-F3) The `$transaction` boundary is explicit and establishable.** `create()` wraps **exactly three**
  operations atomically: `payment.create` → `payment.aggregate(_sum.amount WHERE billId)` →
  `bill.update({ amountPaid, status })`. **Outside** the tx: the pre-read bill lookup + all guards
  (before), and the record `Billed→Paid` transition + the notification (after). Guarantee boundary =
  *"a payment row and the bill's `amountPaid`/`status` move together atomically."*
- **(P-F4) SUSPECTED CONCURRENCY DEFECT — SD-1 (see §7); ruled Outcome A.** The overpayment guard and the
  `outstanding` it checks come from a bill read **outside** the tx, with no row lock and no DB constraint
  bounding `SUM(payments) ≤ total`. Under concurrent `create()` on one bill this is a plausible race
  (overpayment and/or drift). Per the architect ruling (§7) this is a **potential race, not a proven
  behavioral defect**: C2 verifies sequential correctness only and neither blesses nor fails on the race.
- **(P-F5) Post-tx side effects are non-atomic with settlement — SD-2.** The record `Billed→Paid`
  transition and the notification run **after** the tx; a failure there can leave the bill `Paid` while
  the record stays `Billed`. Analogous to C1's F5: no contract asserts bill↔record atomicity (the
  transition is an explicit post-settlement side effect). Characterized, not remediated.

---

## 1. Public service inventory (exact)

`PaymentsService` (`src/modules/payments/payments.service.ts`) exposes **five public methods**.

| # | Method | Test layer |
|---|---|---|
| 1 | `create(dto, userId)` | Integration (`_test`, real `$transaction`) + stub `RecordsService` + stub `NotificationsHelper` |
| 2 | `findAll(query)` | Integration |
| 3 | `paymentsForBill(billId, query)` | Integration (thin wrapper → `findAll({ ...query, billId })`) |
| 4 | `summary()` | Integration |
| 5 | `verify(id)` | Integration |

## 2. Controller permission inventory (exact) + delegation

Enumerated **independently** from `payments.controller.ts` — **five routes; every route is permissioned,
none is open.**

| Handler | HTTP route | Required permission |
|---|---|---|
| `create` | `POST payment/create` | `payment:create` |
| `summary` | `GET payments/summary` | `payment:view` |
| `findAll` | `GET payments` | `payment:view` |
| `paymentsForBill` | `GET bill/payments/:id` | `payment:view` |
| `verify` | `PUT payment/verify/:id` | `payment:change` |

Metadata asserted via the exported `PERMISSIONS_KEY` (as C1). **Controller delegation:**
`paymentsForBill(id, query)` delegates to `payments.findAll` with `billId = id` (stubbed-service
assertion, mirroring C1's route-filter contract tests). Metadata proves the route→permission mapping
only — **not** runtime guard execution, JWT, role resolution, or 403s (design §2).

## 3. Business invariants

- **Settlement math / drift-free (sequential):** after each payment,
  `amountPaid = SUM(payment.amount WHERE billId)` (recomputed from authoritative rows, never
  incremented) and `status = amountPaid ≥ total ? Paid : PartiallyPaid`. After N sequential payments:
  `amountPaid == Σ amounts`, and Billing's derived `outstanding == total − amountPaid` stays consistent
  (cross-checked via `BillingService.findOne`).
- **`$transaction` atomicity (observable from a single call):** a committed payment row always coincides
  with the updated `bill.amountPaid`/`status`; a guard rejection creates **no** payment row and makes
  **no** bill change.
- **Guards (from evidence):** bill-not-found → `NotFoundException`; `Draft` →
  `BadRequestException('must be issued before it can be paid')`; `Paid` →
  `BadRequestException('already fully paid')`; `amount > outstanding` →
  `BadRequestException('exceeds the outstanding balance')`.
- **Legal transitions:** from `Issued` → partial `PartiallyPaid`, exact-full `Paid`; from
  `PartiallyPaid` → partial `PartiallyPaid`, final `Paid`. `Draft`/`Paid` are rejected entry states (the
  only prior-state guards the contract asserts; status is otherwise **computed** —
  `LIFECYCLE_STATE_MACHINES.md`). `Paid` is terminal (further payments rejected).
- **Record delegation (Payments-owned vs Records-owned):** on full settlement **and**
  `record.status === Billed`, `create` calls
  `records.updateStatus(recordId, userId, { status: Paid, notes: 'Bill fully paid' })`; if the record is
  **not** `Billed`, it is **not** called. C2 asserts **both branches** against the stub; it does **not**
  test the `Billed→Paid` legality (Records owns it; legal per `ALLOWED_TRANSITIONS[Billed]=[Paid]`).
- **Notification:** on success, `notifyPermission('payment:view', { type: PAYMENT_RECEIVED, … })` is
  called (stub asserted). It is best-effort (swallows its own errors) → C2 asserts the **call**, not
  delivery.
- **Verification:** `verify(id)` → not-found → `NotFoundException`; else sets `verified = true`; **no
  prior-state guard** → verifying an already-verified payment stays `true` with no error
  (**idempotent**).

## 4. Frozen expected outcomes

### 4a. summary() result contract — including the empty case (required clarification)

`summary()` returns, from the actual implementation:

- `count` — `payment.count()` → an integer; **`0`** with no payments.
- `collected` — `totals._sum.amount ?? 0` → an integer cents value; **`0`** with no payments (the
  aggregate's `_sum.amount` is `null` over zero rows, coalesced to `0`).
- `byType` — `groupBy(['type']).map(...)` → an **array** of `{ type, count, amount }`; **`[]`** (an empty
  **array**) with no payments.

**Frozen empty-result contract:** `{ count: 0, collected: 0, byType: [] }`.

> Note the deliberate distinction to preempt zero/null/undefined/empty-object ambiguity: Payments'
> `byType` is an **empty array `[]`**, unlike Billing's `summary().byStatus` which is an **empty object
> `{}`**. C2 asserts `byType` is `[]` (array), never `{}`, `null`, or `undefined`.

With payments present: `count` = number of payment rows; `collected` = `Σ amount`; `byType` = one entry
per present `PaymentType` with `{ type, count: rows-of-that-type, amount: Σ amount-of-that-type }`.

### 4b. Cross-lab expected outcomes (frozen)

| Operation (lab B on lab A data, unless noted) | Frozen result |
|---|---|
| `create(foreignBillId)` | bill read scoped to lab B → `NotFoundException('Bill not found')` **before the tx**; no payment row; `RecordsService`/`notifs` **not** called. |
| `findAll` / `paymentsForBill` | scoped to lab B payments only; lab A's payments **absent**; empty lab B → `data: []`, `total: 0`. |
| `summary` | aggregates lab B only; foreign rows contribute **0**; empty lab B → the §4a empty contract. |
| `verify(foreignPaymentId)` | payment read scoped to lab B → `NotFoundException('Payment not found')`; no update. |
| Missing lab context | tenancy guard **fails closed and throws** on the first tenant-model operation. |

## 5. Fixture / harness strategy

- **Client:** identical to C1 (production-parity extended `_test` client; bare client for seed/teardown;
  `labContext.run`). One extended `scoped` client + one bare `raw` client per suite; the service under
  test always receives `scoped`.
- **Stubs (design §6):** `RecordsService = { updateStatus: jest.fn() }`,
  `NotificationsHelper = { notifyPermission: jest.fn() }`; both reset between tests.
- **Fixtures (bills seeded via the bare client — Payments cannot create bills; that is Billing/C1):**
  `Lab` ×2, `Patient`, `Record` (status `Billed` for the full-settlement→record-delegation path, plus a
  non-`Billed` record for the negative branch), `Service`, `Bill` seeded in `Issued`/`PartiallyPaid`
  with exact `total`/`amountPaid`. Payments are created via the service under test, or seeded via the
  bare client for `verify`/`findAll`/`summary`.
- **Teardown (schema-verified, `labId`-scoped, child-first):**
  `Payment → BillTax → BillLine → Bill → RecordStatusEvent → Record → Patient → Service → Tax → Client → Lab`.
  One fresh UUID `Lab` per test; capped-parallel pool (50%), not the serialized-9 audit group; reset the
  `_test` DB first if the datamodel has drifted (R1). No global cleanup; teardown scoped strictly to the
  test's own lab ids.

## 6. Transaction & state-machine analysis

- **Atomic (inside `$transaction`):** `payment.create`, `payment.aggregate`, `bill.update`.
  **Non-atomic (outside):** the guards + bill pre-read (before), the record `Billed→Paid` transition +
  the notification (after).
- **Drift-free mechanism:** `amountPaid` is a **recompute from authoritative rows**, not a
  read-modify-write increment — so **sequentially** it cannot drift, and this is deterministically
  testable.
- **State machine (Payments-owned `BillStatus` subset):** `Issued | PartiallyPaid → PartiallyPaid | Paid`,
  gated by the computed `amountPaid ≥ total`; `Draft` and `Paid` rejected at entry; `Paid` terminal.
- **Why single-call atomicity ≠ concurrency safety:** the atomic unit excludes the guard's inputs, so
  atomicity of one call does not imply correctness under overlap → SD-1 (§7).

## 7. Suspected defects / unresolved questions

**(SD-1) Concurrent overpayment / `amountPaid` drift — RULED: Outcome A (approved).** The overpayment
guard and drift-free property are sound **sequentially**; concurrent `create()` on one bill can overpay
and/or drift because the guard reads outside the tx with no lock/constraint (READ COMMITTED). The current
evidence demonstrates a **potential race, not a proven behavioral defect**. Therefore:

- C2 verifies **sequential** settlement correctness, all **deterministic guards**, and **single-call**
  transaction semantics.
- C2 **deliberately avoids concurrency characterization** — it neither blesses the race with a green test
  nor fails on an unproven concurrency hypothesis (mirrors C1's F5 handling).
- **SD-1 is recorded as a future, separate architectural defect checkpoint**, which may determine whether
  row locking, `SERIALIZABLE`, optimistic concurrency, or an explicit exclusion of concurrent settlement
  is intended.

**(SD-2) Post-tx non-atomicity (P-F5).** Bill-`Paid` and the record `Billed→Paid` transition (and the
notification) are not atomic with settlement. No contract requires bill↔record atomicity. **Characterize
only**: C2 asserts the delegation on the success path and does **not** inject a post-write failure and
makes **no** atomicity claim.

**(SD-3) `amount ≥ 1` is DTO-enforced, not service-enforced.** `@Min(1)` lives on `CreatePaymentDto`
(pipe layer); `create()` does not re-check. A service-level call with `amount ≤ 0` would bypass it. C2
uses valid amounts and treats `amount ≥ 1` as a **controller/pipe-layer** contract — **no** service test
blesses a non-positive amount.

## 8. Accepted vs deferred scope

**Accepted (C2):** payment creation + **sequential** settlement math (drift-free); the four guards;
observable single-call `$transaction` atomicity; `Issued/PartiallyPaid → PartiallyPaid/Paid` transitions;
record-transition **delegation** (both branches, stubbed); the notification call (stubbed); `verify`
(set / idempotent / not-found); `findAll`, `paymentsForBill` (billId filter), `summary`
(count/collected/byType incl. the §4a empty contract); cross-lab + missing-context frozen outcomes;
controller permission metadata + `paymentsForBill` delegation.

**Deferred:** SD-1 concurrency remediation (separate checkpoint); Records `Billed→Paid` transition
legality (Records domain); Taxes (C9); Billing internals (C1, frozen); post-tx record/notification
atomicity (SD-2); DTO-layer `amount ≥ 1` validation (controller/pipe checkpoint); R1 test-infra
remediation.

## 9. Definition of done (inherits strategy §14, C1 §12)

- Each test exercises **one primary invariant** unless combining materially reduces setup duplication.
- All §8-accepted invariants covered; happy-path and failure-path verified.
- Cross-lab outcomes asserted exactly per §4b; the `summary()` empty contract per §4a; missing-context
  fails closed.
- **No concurrency characterization test** is added (SD-1 documented, not encoded).
- Deterministic and isolated: unique lab per test, schema-verified scoped teardown, passes alone and
  capped-parallel.
- Verification: `tsc --noEmit` clean; new specs green; `test:parallel` stays green (`+N`); **no**
  schema/migration/production/global-setup change; dev DB untouched (tests hit `_test`); dev audit
  fingerprint unaffected.
- **Pathspec-stage exactly the new spec file(s)** → review → commit on explicit approval.

## 10. Governance

- **Status:** Accepted (design) — pending commit as the frozen C2 baseline.
- Grants **no** test-implementation authorization; C2 implementation requires a **separate**
  authorization after this artifact is committed.
- SD-1 ruling is **Outcome A**: sequential correctness only; no concurrency test; SD-1 filed as a future
  checkpoint.
- No production, schema, migration, tenancy, or Program-2 changes are authorized.
- Any suspected defect (strategy §3) or missing seam (strategy §6) pauses the checkpoint.
- One module per checkpoint; **pathspec-scoped commits only** (excluding all ambient concurrent-agent
  changes).
