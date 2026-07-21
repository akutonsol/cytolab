# Program 3 · C1 — Billing Test Design

**Status:** Accepted (design) — Pending commit as the frozen C1 baseline
**Owner:** engineering (quality)
**Governs:** the Billing test-hardening checkpoint (C1) only
**Grants:** no test-implementation authorization. C1 test implementation requires a **separate**
authorization issued after this artifact is committed. No production, schema, migration, tenancy, or
Program-2 changes are authorized.
**Parent strategy:** `docs/PROGRAM_3_TEST_STRATEGY.md` (Phase 0, frozen `9fb04f5`)

---

## 0. Grounding findings (from reading the actual code)

- **(F1) Monetary representation — RESOLVED (strategy §4).** Every monetary field on `Bill`,
  `BillLine`, `BillTax`, `Payment`, and `Service.price` is Prisma **`Int` = integer minor units (cents)**;
  `Tax.rateBasisPoints` is **`Int` basis points** (1% = 100). No `Decimal`, no float anywhere in Billing.
  → All monetary assertions use **exact integer equality**.
- **(F2) Tenancy-harness seam.** In production `BillingService` uses `PrismaService`, which is
  `new PrismaClient().$extends(tenancyExtension(labContext)).$extends(phiEncryptionExtension())`
  (`src/database/prisma.service.ts`). `createTestPrisma()` returns a **bare** client. Tenancy is only
  exercised when the test composes the same extensions in the same order (see §5). This is a
  **test-harness composition of already-exported seams** — no production change, **no missing seam**
  (strategy §6 clears).
- **(F3) Billing owns a subset of the Bill state machine.** Billing writes only `Draft` (create) →
  `Issued` (issue). `PartiallyPaid` / `Paid` and `amountPaid` recomputation are written by the Payments
  module → **deferred to C2**. C1 asserts `amountPaid = 0` at create and never drives the paid states
  through Billing.
- **(F5) issue() consistency — contract-review result:** see §6 (the required read-only §2 evidence
  check). Result: **no authoritative contract requires `issue()` atomicity**; C1 tests the defined
  successful lifecycle and the guards, and does **not** bless partial-state failure.

---

## 1. Public service inventory (exact) — clarifications 1 & 2

`BillingService` (`src/modules/billing/billing.service.ts`) exposes **six public methods**. `decorate()`
and `generateReference()` are **private and are not test targets** — their behavior is verified only
through public methods (clarification 1). Extracting `decorate()` into a public pure function would be a
**separate production-seam checkpoint, not authorized in C1**.

| # | Public method | Test layer |
|---|---|---|
| 1 | `create(dto)` | Integration (`_test` DB) |
| 2 | `findAll(query, statusFilter?)` | Integration |
| 3 | `findOne(id)` | Integration |
| 4 | `summary()` | Integration |
| 5 | `issue(id, userId)` | Integration (Billing's own writes) + **stubbed `RecordsService`** |
| 6 | `markViewed(id)` | Integration |

**Behavior of private helpers is tested only through the public surface:**

| Behavior | Test layer |
|---|---|
| Outstanding / overdue derivation (`decorate`) | Integration through `findOne()` / `findAll()` (decorated results) |
| Generated reference format (`generateReference`) | Integration through `create()` result (`referenceNo` shape) |
| Direct private-method unit tests | **Out of scope** |

Tax calculation is exercised **inside `create()`** with controlled `Tax` fixtures (clarification 9, §13
of the strategy) — never as a standalone Taxes suite.

## 2. Controller permission inventory (exact) — clarification 2 & 7

Enumerated **independently from the controller** (`src/modules/billing/billing.controller.ts`), not
inferred from the service inventory. There are **nine routes**; **every route carries a permission
requirement — none is intentionally unauthenticated/unpermissioned.**

| Handler | HTTP route | Required permission |
|---|---|---|
| `create` | `POST bill/create` | `bill:create` |
| `findBilled` | `GET bills/billed` | `bill:view` |
| `findUnpaid` | `GET bills/unpaid` | `bill:view` |
| `findPaid` | `GET bills/paid` | `bill:view` |
| `summary` | `GET bills/summary` | `bill:view` |
| `findAll` | `GET bills` | `bill:view` |
| `findOne` | `GET bill/:id` | `bill:view` |
| `issue` | `PUT bill/billed/:id` | `bill:change` |
| `markViewed` | `PUT bill/viewed/:id` | `bill:change` |

**What the metadata test proves / does not prove (clarification 7):**
- **C1 proves:** each handler's route→permission **metadata mapping** matches the table above.
- **C1 does NOT prove:** runtime guard execution, JWT behavior, role resolution, permission lookup, or
  denial (403) responses. Those belong to a controller/guard integration checkpoint, not C1.
- The assertion reads metadata via the Nest `Reflector` using the **exported** `PERMISSIONS_KEY`
  (`src/common/decorators/require-permissions.decorator.ts`), the same key the real guard reads —
  **not** a string literal duplicated in the test.

## 3. Business invariants

**Monetary correctness (integer cents, F1):**
- `line.amount = quantity × unitPrice`; `subtotal = Σ line.amount`.
- Per-tax `amount = round(subtotal × rateBasisPoints / 10000)` (`Math.round`, half-up); taxes are summed
  **independently, not compounded**; `taxTotal = Σ tax.amount`; `total = subtotal + taxTotal`.
- `amountPaid = 0` at create; `outstanding = total − amountPaid` (derived by `decorate`, read through
  public methods).

**Price-snapshot immutability:** `unitPrice` / `serviceName` / `serviceCode` are captured from `Service`
at create. Verified by: create → mutate `Service.price` (bare client) → re-read bill via `findOne` →
line **unchanged**.

**State-machine legality — Billing-owned subset (F3):** create ⇒ `Draft`; `issue`: `Draft → Issued`
only; re-issue ⇒ `BadRequestException`; issue missing bill ⇒ `NotFoundException`. `PartiallyPaid` /
`Paid` explicitly **out of scope** (C2).

**Authorization boundary (strategy §5):** route→permission metadata per §2.

**Tenancy isolation (strategy §5, via §5 harness):** exact frozen outcomes in §4.

## 4. Cross-lab expected outcomes (frozen) — clarification 3

Each derived from the tenancy extension (`scopeArgs`, `src/common/tenancy/tenancy.extension.ts`) + the
service contract. One authoritative outcome per operation; assertions key on the **exception class /
scoped result shape**, not incidental message text (unless the text is itself the documented contract).

| Operation (lab B acting on lab A data, unless noted) | Frozen expected result |
|---|---|
| `findOne(foreignBillId)` | Read auto-scoped to lab B → no row → **`NotFoundException`** ("Bill not found" is the stable service contract). |
| `findAll(...)` | Result contains **only lab B bills**; the lab-A bill is **absent**; `total` counts lab B only. Empty lab B → `data: []`, `total: 0`. |
| `summary()` | `groupBy` + `aggregate` scoped to lab B; foreign rows contribute **0**. Empty lab B → `byStatus: {}`, `billed: 0`, `collected: 0`, `outstanding: 0`. |
| `issue(foreignBillId, userId)` | Bill read scoped to lab B → no row → **`NotFoundException` before any write**; `RecordsService.updateStatus` **not called**; the foreign bill remains `Draft` (verified via bare client); no record/bill mutation. |
| `create` with a **foreign `recordId`** | Record read scoped to lab B → no row → **`NotFoundException("Record not found")`**; **no `Bill` row created** (verified by count). |
| `create` with lab-B record but **foreign `serviceId`** | Service read scoped to lab B → id absent from map → **`NotFoundException("Service not found: <id>")`**; no `Bill` row created. |
| **Missing lab context** (no `labId`, not system) | The tenancy guard **fails closed and throws** for the tenant-model operation (documented contract: refuses to run the op "with no lab context"). Assert the operation is **refused/throws**; key on the guard's stable fail-closed behavior, not Nest exception mapping. |

## 5. Fixture model & production-parity test client — clarifications 4, 6, 11

**Production-parity extended client (clarification 4).** Exactly one extended client is built per suite
lifecycle, mirroring `PrismaService`'s extension order:

```
base    = createTestPrisma()                       // bare, isolation-guarded (_test DB only)
lab     = new LabContext()
scoped  = base
  .$extends(tenancyExtension(lab))                  // 1st — tenancy guard
  .$extends(phiEncryptionExtension())               // 2nd — PHI encryption (production order)
billing = new BillingService(scoped as unknown as PrismaService, recordsStub)
```

- The **service under test always receives the extended (`scoped`) client** — never the bare client.
- The **bare (`base`) client is used only** for fixture setup, cross-lab seeding, and scoped teardown.
- **Do not** instantiate uncontrolled Prisma clients repeatedly; one `base` + one `scoped` per suite.
- Service calls run inside `lab.run({ labId }, () => billing.<method>(...))`.
- **Isolation preserved:** `$extends` wraps queries on the **same underlying client/`datasourceUrl`**
  (the `_test` URL resolved and guarded by `createTestPrisma`); it opens no new connection and changes
  no datasource — so applying the extensions **cannot** move the suite off the isolated `_test`
  database. C1 confirms this at setup.

**`RecordsService` stub boundary (clarification 6).** `issue()` calls only
`records.updateStatus(recordId, userId, { status: Billed, notes: 'Bill issued' })`; the real
`transition()` carries heavy unrelated side effects (status-event persistence, requisition sync,
notifications, audit) and the `Approved → Billed` **legality is the Records domain's contract, not
Billing's**. Per strategy §6 (thin-stub when heavy) → inject `{ updateStatus: jest.fn() }`.

- **C1 may verify:** called **once**; correct `recordId`; correct `userId`; correct target status
  (`Billed`) and notes; **rejection propagation** when the stub rejects **before** Billing's own writes.
- **C1 must NOT claim** this proves: the `Approved → Billed` transition legality; record status-event
  persistence; notifications/audit; or that the whole `issue` workflow is atomic. Those belong to the
  owning modules or a separately authorized cross-module workflow checkpoint.

**Entity graph (minimal):** `Lab` (×2 for isolation: A, B) → `Service{price}`, `Tax{rateBasisPoints,
isDefault}`, `Record{status, clientId?}` (`Approved` for `issue` tests), `Client?` — all per-lab.
`Bill`/`BillLine`/`BillTax` produced via `create()` or seeded. A `Paid` bill needed only to verify
`decorate` (overdue) may be **fixture-seeded through the bare client** — never reached through a Billing
transition (F3, clarification 8).

**Builders:** `makeLab()`, `makeService(labId,{price})`, `makeTax(labId,{rateBasisPoints,isDefault})`,
`makeRecord(labId,{status,clientId})`. Uniqueness (strategy §9): `Service` and `Tax` carry
`@@unique([labId, name])`; satisfied automatically by **one fresh `Lab` (UUID) per test** — names need
only per-lab uniqueness. `referenceNo` is generated. No shared static identifiers; unique fields carry
run-/worker-safe values.

**Teardown (clarification 11) — confirmed against the current schema.** The `Lab` relations on `Bill`,
`Record`, `Service`, `Tax` declare **no cascade** (Prisma default for a required relation = `Restrict`),
so deleting the `Lab` root is **refused while children exist** — deletion-by-lab-root is **not**
supported here. Therefore C1 uses **explicit child-first deletion, every query filtered by the test's
`labId`** (never by human-readable name alone), in this schema-verified order:

```
Payment → BillTax → BillLine → Bill → Record → Service → Tax → Client → Lab
```

The one confirmed cascade is `Bill → {BillLine, BillTax, Payment}` (`onDelete: Cascade`); deleting a
`Bill` removes those children, but C1 still deletes by `labId` scope for determinism. No global
`deleteMany`; no cleanup depends on another worker's data. Runs in the **capped-parallel pool (50%)**,
not the serialized-9 audit group; must pass **alone and in-suite**.

## 6. F5 — issue() consistency contract-review result (required)

**Question:** does an authoritative contract require `issue()` (three sequential un-wrapped writes:
`records.updateStatus` → `record.update({billed:true})` → `bill.update({status:Issued})`) to be atomic?

**Read-only §2 evidence check (highest authority first):**

1. **Frozen ADRs / architecture:** none govern `issue()` atomicity. Audit atomicity (B1/R016C) concerns
   the audit writer path, not the bill-issue business sequence.
2. **Domain / state-machine spec — `docs/platform/LIFECYCLE_STATE_MACHINES.md` (authoritative, §2 tier
   2):** the **Bill** section documents `Draft → Issued` as "throws if `!=Draft` | Record
   `Approved→Billed`; `record.billed=true` (`billing.service.ts:171-180`)" — i.e. it **documents the
   coupled side-effect sequence as the defined behavior and asserts no atomicity guarantee**. The same
   spec **explicitly flags atomicity/consistency gaps where they exist** (e.g. ScreeningBatch: "not
   proven fully atomic… no claim of fully atomic enforcement is made"; Bill: "UNKNOWN. the
   PartiallyPaid/Paid write has no prior-state guard"). Its **silence on `issue()` atomicity is therefore
   meaningful**, not an omission.
3. **Test strategy — `docs/architecture/TEST_STRATEGY.md` (§2 tier 2/3):** Integration(service) priority
   lists **"bill issue lifecycle"** with **no** transaction qualifier, while the payment line
   deliberately requires "`amountPaid` no-drift **within a `$transaction`**". Transactionality is
   positively scoped to **payments**, not to issue.
4. **Existing validated tests (§2 tier 4):** `records.service.spec.ts` validates the Records transition
   machinery (the owner). **No existing billing/issue test** blesses partial state.
5. **Implementation (§2 tier 5):** three sequential writes, no `$transaction`.

**Conclusion — Outcome 2 ("no authoritative contract speaks to atomicity"):** No ADR, domain spec, or
validated test requires `issue()` to be atomic; the authoritative state-machine spec documents the
coupled sequence as defined behavior **without** an atomicity guarantee, and positively scopes
transactionality to payments. Therefore, per the architect's Outcome-2 rule:

- **C1 tests the current successful `Draft → Issued` path and the individual guards** (non-Draft →
  `BadRequestException`; missing bill → `NotFoundException`) and the **pre-write rejection-propagation**
  case (stub rejects before Billing's own writes → bill remains `Draft`, no partial state).
- **C1 adds no green test that blesses partial-state failure as acceptable behavior.**
- **C1 does not inject failures after each internal write** to characterize partial corruption (not
  authorized).
- The non-atomic sequence is **not reclassified as "not a defect"**: it is **evidence-bounded** — no
  contract currently requires atomicity. If future contract evidence requires atomic consistency, that
  is a **separate suspected-defect checkpoint** (strategy §3), already listed in deferrals.

## 7. Time-dependent overdue assertions — clarification 8

`decorate`'s `isOverdue = !!dueDate && dueDate < now && status !== Paid`, tested **through public
methods** (`findOne`/`findAll`) with **controlled time** — never the uncontrolled wall clock. Use frozen
timers (restored after each test) or `dueDate` values safely separated from "now". Cover:

- `dueDate` before now, non-`Paid` → overdue **true**;
- `dueDate` at the domain boundary (only if contractually defined) — otherwise omit;
- future `dueDate` → **false**; missing `dueDate` → **false**;
- `Paid` bill with a past `dueDate` → **false** (the `Paid` bill is **fixture-seeded via the bare
  client** solely to verify decoration; **not** reached through a Billing transition).

## 8. Rounding fixtures — clarification 9

The rounding-boundary test states concrete integer inputs landing exactly on a half-cent boundary, with
the expected value **computed from a documented worked example — not by reproducing the production
expression in the assertion**. Worked example to encode:

```
subtotal      = 105 cents          (e.g. 1 line: quantity 1 × unitPrice 105)
rate          = 500 basis points   (5.00%)
unrounded tax = 105 × 500 / 10000 = 5.25 cents      → expected persisted taxTotal = 5 (round half-up, 5.25 → 5)

subtotal      = 150 cents
rate          = 500 basis points
unrounded tax = 150 × 500 / 10000 = 7.5 cents       → expected persisted taxTotal = 8 (Math.round half-up, 7.5 → 8)
```

The `.5` case (`7.5 → 8`) is the discriminating fixture; the expected `8` is asserted as a **literal
computed by hand**, so the test cannot inherit a rounding error from the implementation.

## 9. Amount-boundary note — clarification 10 (reframed)

Monetary fields are Postgres `int4` (ceiling 2,147,483,647 cents ≈ $21.47M per field). C1 covers a
**reasonably large but valid** business amount (well clear of overflow); it adds **no near-limit
executable test** because no public contract defines a supported maximum bill value. The database ceiling
is recorded here as a **documented constraint**. If DTO validation is later found to admit values that
can overflow during `quantity × unitPrice` or total aggregation, that is raised **separately as a
suspected boundary defect** (strategy §3) — not remediated in C1.

## 10. Accepted C1 scope

- Billing creation and exact monetary calculations (F1);
- controlled tax application as Billing-observable behavior (§13 of the strategy);
- price / service-data snapshots (immutability);
- Billing-owned `Draft → Issued` transition and its guards;
- query, pagination, `summary`, and `viewed` behavior;
- public-result decoration behavior (outstanding / overdue), tested through public methods;
- tenancy isolation through the production-parity extended test client (§4, §5);
- controller permission **metadata** (§2);
- deterministic, parallel-safe `_test` fixtures (§5).

## 11. Deferred (not C1)

- payment verification and `amountPaid` / balance recomputation → **C2**;
- `PartiallyPaid` and `Paid` transitions → **C2**;
- Taxes administration and lifecycle → **C9** (C1 uses controlled Tax fixtures only);
- `Approved → Billed` **Records** transition legality → the Records domain / its own checkpoint;
- `issue`-workflow **atomicity remediation** → a separate defect checkpoint **iff** contract evidence
  later requires it (§6);
- any production seam (e.g. extracting `decorate`) or refactoring → separate authorization.

## 12. Per-checkpoint definition of done (inherits strategy §14)

- Each Billing integration test exercises **exactly one primary business invariant**, unless combining
  invariants **materially** reduces setup duplication — keeping failures localized and maintenance simple.
- All §10 invariants covered; happy-path and failure-path verified.
- Cross-lab outcomes asserted exactly per §4; missing-context fails closed.
- Deterministic and isolated (§5): unique lab per test, schema-verified scoped teardown, passes alone and
  capped-parallel.
- Verification: new specs green; `test:parallel` stays green (`+N`); **no** schema/migration/production
  change; dev DB untouched (tests hit `_test`); dev audit fingerprint unaffected.
- **Pathspec-stage exactly the new spec file(s)** → review → commit on explicit approval.

## 13. Governance

- **Status:** Accepted (design) — pending commit as the frozen C1 baseline.
- Grants **no** test-implementation authorization; C1 implementation requires a **separate**
  authorization after this artifact is committed.
- No production, schema, migration, tenancy, or Program-2 changes are authorized.
- Any suspected defect (strategy §3) or missing seam (strategy §6) pauses the checkpoint.
- One module per checkpoint; **pathspec-scoped commits only** (excluding all ambient concurrent-agent
  changes).
