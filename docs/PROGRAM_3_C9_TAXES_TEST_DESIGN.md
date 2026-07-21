# Program 3 · C9 — Taxes Test Design

**Status:** APPROVED WITH RULINGS — **FROZEN** (Architectural Review 2026-07-21; see §14). Read-only design; C9 **implementation remains BLOCKED** pending separate authorization.
**Owner:** engineering (quality)
**Governs:** the Taxes test-hardening checkpoint (C9 — the final planned Program-3 checkpoint)
**Grants:** no test-implementation authorization. Read-only design artifact. No production, schema,
migration, tenancy, or Program-2 changes are authorized.
**Parent strategy:** `docs/PROGRAM_3_TEST_STRATEGY.md` (Phase 0, frozen `9fb04f5`)
**Sibling baselines:** C1–C8 — C9 reuses the same production-parity `_test` harness. C9 completes the
Billing↔Taxes boundary that C1 established (C1 owns tax *application*; C9 owns tax *administration*).

**Files examined (read-only):** `taxes.service.ts` (47), `taxes.controller.ts` (36),
`dto/tax.dto.ts` (17), `taxes.module.ts`; schema `Tax`.

---

## 0. Grounding truth (implementation vs generalized expectations)

- **Module identity.** C9 = the `taxes` module (`TaxesService`, `TaxesController`) owning the **`Tax`**
  entity (per-lab tax dictionary: `name`, `code?`, `rateBasisPoints`, `isDefault`). The
  `services-catalog/services-taxes.integration.spec.ts` (Service↔Tax linkage in a **different** module)
  and the audit `*taxonomy*` specs (audit taxonomy, unrelated to `Tax`) are **out of C9 scope**.
- **Taxes is a plain lab-scoped CRUD admin module.** Injects only `PrismaService`. **No `$transaction`,
  no scheduler, no audit, no exported pure function.**
- **Rates are MUTABLE.** `update` changes `name`/`code`/`rateBasisPoints`/`isDefault` in place; **no
  versioning/history**. Historical bills are protected by **`BillTax` snapshots** (name/rate/amount) —
  `BillTax.taxId` is **`SET NULL` on Tax delete**.
- **No `isActive`/soft-deactivate.** `remove` is a **hard delete** (relying on the `SET NULL` FK action);
  unlike `MedicalCode`/`Service`, `Tax` has no active flag (§9 SD-3).
- **`isDefault` has NO single-default enforcement.** `create`/`update` may set `isDefault=true` on
  multiple taxes; setting a new default does **not** unset others. Billing applies **all** `isDefault`
  taxes (§9 SD-1).
- **Uniqueness:** `@@unique([labId, name])` → duplicate name **within a lab** is a `Conflict` (detected
  via `isUniqueConflict(e, 'name')`); two labs may share a name.

---

## 1. Public surface inventory

**Exported helpers / pure functions:** **none** (`isUniqueConflict` is a shared util owned by
`common/util/lab-sequence`, not by Taxes).

**`TaxesService` public methods (4):** `findAll`, `create`, `update`, `remove`.

**`TaxesController` routes (4) — all permissioned (base `/`, path `taxes`):**

| Handler | Route | Permission |
|---|---|---|
| `findAll` | `GET taxes` | `tax:view` |
| `create` | `POST taxes` | `tax:create` |
| `update` | `PUT taxes/update/:id` | `tax:change` |
| `remove` | `DELETE taxes/delete/:id` | `tax:delete` |

> Taxes uses **four distinct `tax:*` permissions** (view/create/change/delete) — not a reused namespace.

**DTOs:** `CreateTaxDto` (`name` required, `code?`, `rateBasisPoints` `@Min(0)` required, `isDefault?`),
`UpdateTaxDto` (all optional). **Transaction entry points:** none. **Scheduled entry points:** none.

**Module/collaborators:** `TaxesModule` imports `PrismaModule`; `TaxesService` injects `PrismaService`.

## 2. Bounded context

- **Owned entity/state:** `Tax` (`@@unique([labId, name])`, `labId`-scoped).
- **Owned workflows:** tax CRUD (list/create/update/delete).
- **Collaborators:** `PrismaService` only (+ the pure `isUniqueConflict` util).
- **Inbound dependencies:** **Billing reads the `Tax` MODEL directly** (`prisma.tax.findMany` for
  `isDefault` defaults / explicit `taxIds`) at bill-create time — it does **not** import `TaxesService`.
  `services-catalog` also references the `Tax` model (out of scope).
- **Outbound dependencies:** none.
- **Dependency direction (explicit):** **Billing → `Tax` model (data read); NO service-level dependency
  in either direction.** `TaxesService` does not depend on Billing; Billing does not depend on
  `TaxesService`. This **confirms the C1 boundary**: Taxes owns administration; Billing owns application.
- **Verdict:** **a self-contained CRUD administration module.**

## 3. Taxes architecture

- **`findAll`:** lab-scoped list ordered by `name`.
- **`create`:** stamps `labId` via `tenantCreate`; on `@@unique([labId, name])` violation →
  `ConflictException`.
- **`update`:** `findFirst` (scoped) → `NotFound` if missing; updates provided fields (incl.
  `rateBasisPoints`/`isDefault`); on name-uniqueness violation → `ConflictException`.
- **`remove`:** `findFirst` → `NotFound`; **hard delete** — `BillTax.taxId` `SET NULL` preserves each
  historical bill's snapshotted `name`/`rateBasisPoints`/`amount`. Returns `{ deleted: true }`.
- **Rate behavior:** `rateBasisPoints` is `Int` basis points (`@Min(0)`, no max); **mutable**.
- **Default selection:** `isDefault` boolean; **multiple defaults allowed** (no single-default
  constraint) — SD-1.
- **Overwrite/revision:** update mutates in place; **no history/versioning**; snapshots protect issued
  bills.

## 4. Transaction architecture

**None.** `TaxesService` uses no `$transaction`; every operation is a single Prisma statement
(`findMany`/`create`/`update`/`delete`). The `BillTax.taxId` `SET NULL` on delete is a **database-level FK
referential action**, not an application transaction.

## 5. Billing boundary (confirms / refines the C1 assumption)

- **How Billing consumes Taxes:** at bill-create time Billing reads `Tax` rows directly
  (`prisma.tax.findMany({ where: { id: { in: taxIds } } })` for explicit, or
  `{ where: { isDefault: true } }` for defaults), then **snapshots** `name`/`rateBasisPoints` and computes
  each `BillTax.amount = round(subtotal × rateBasisPoints / 10000)` (C1-owned).
- **Ownership boundary:** **Taxes owns the `Tax` dictionary (CRUD)**; **Billing owns the tax
  calculation + snapshotting**. There is **no service-level coupling** — the seam is the `Tax` model.
- **Dependency direction:** Billing → `Tax` (read-only); Taxes has no Billing dependency.
- **Testability:** C9 tests Taxes CRUD **in isolation** (no Billing). C1 already verified Billing's tax
  application with controlled `Tax` inputs. **The C1 assumption is CONFIRMED** — the boundary is clean;
  C9 need not (and must not) re-test Billing's calculation.
- **One cross-entity contract at the Tax-delete boundary:** `remove` relies on `BillTax` `SET NULL` to
  keep issued bills' snapshots. C9 **may optionally** verify that deleting a `Tax` referenced by a
  `BillTax` succeeds and leaves the `BillTax` snapshot (`name`/`rateBasisPoints`/`amount`) intact with
  `taxId = null` — this is `remove`'s documented contract, not Billing logic (fixture note in §8).

## 6. Scheduler architecture

**No scheduler exists** in the taxes module — no `@Cron`, no worker, no scheduled entry point. No
scheduler test surface in C9.

## 7. Authorization & tenancy

- **Permission model:** `tax:view` (`findAll`) / `tax:create` (`create`) / `tax:change` (`update`) /
  `tax:delete` (`remove`) — four distinct permissions. C9 asserts route→permission **metadata** only.
- **Tenancy:** `Tax` carries `labId` → auto-scoped. `findAll`/`create`/`update`/`remove` are lab-scoped;
  `@@unique([labId, name])` is **per-lab** (two labs may share a tax name). **Cross-lab (frozen
  outcomes):** `update`/`remove` on a foreign id → `findFirst` misses → `NotFound`; `findAll` scoped to
  the acting lab. **Missing lab context** → guard throws (fail-closed).
- **Administrative ownership:** Taxes is an admin surface; no per-user actor is recorded on `Tax`.

## 8. Proposed testing architecture (design only)

- **Pure unit:** **none** — Taxes owns no exported deterministic helper.
- **Service integration (`_test`, production-parity client, `labContext.run`; no collaborators to stub):**
  `create` (persists; `rateBasisPoints`/`isDefault`; **duplicate name → `Conflict`**); `update` (fields
  incl. `rateBasisPoints`/`isDefault`; `NotFound`; rename-collision → `Conflict`); `remove` (`{deleted:
  true}`; `NotFound`); `findAll` (lab-scoped, ordered by name); **`isDefault` multi-default behavior**
  (two taxes may both be `isDefault=true` — asserted as **current behavior**, SD-1, not endorsed);
  **optional** delete-with-`BillTax` snapshot preservation (§5) — **EXCLUDED per §14 Ruling 4**.
- **Transaction:** **none** (§4).
- **Controller:** all 4 route→permission metadata mappings via exported `PERMISSIONS_KEY` + completeness
  + representative parameter forwarding (`create`/`update`/`remove` forward dto/id).
- **Tenancy:** cross-lab `update`/`remove` → `NotFound`; `findAll` scoped; per-lab name uniqueness (same
  name in two labs succeeds); missing-context → guard throws.

**Fixtures:** `Lab` ×2, `Tax` (via the service or seeded — needs only `labId`/`name`/`rateBasisPoints`).
No `User` (Tax has no actor). Teardown child-first, `labId`-scoped: `Tax → Lab`. For the **optional**
delete-preservation test, additionally `Patient → Record → Bill → BillTax(taxId)` (seeded via the bare
client) with teardown `BillTax → Bill → Record → Patient` before `Tax → Lab`. One fresh UUID lab per
test; capped-parallel pool.

## 9. Suspected defects (record only — no fix, no green characterization test)

- **SD-1 — No single-default enforcement.** `create`/`update` may set `isDefault=true` on multiple taxes;
  a new default does not unset prior ones. Billing then applies **all** defaults. May be intended
  (multiple default taxes) or a gap; documented as current behavior.
- **SD-2 — No rate ceiling.** `rateBasisPoints` is `@Min(0)` with **no upper bound** — a 1000%
  (`100000` bp) tax is accepted. DTO-layer boundary.
- **SD-3 — Hard delete, no soft-deactivate.** `Tax` has no `isActive`; `remove` permanently deletes. If a
  **default** tax is deleted, subsequently-created bills silently lose that default (issued bills stay
  safe via `BillTax` snapshots).

None require a production change to test the accepted behavior; all are recorded for separate,
explicitly-authorized review and must not be encoded as passing characterization tests.

## 10. Stop conditions / items for review before implementation

- **No hard STOP triggered.** Taxes is a self-contained CRUD module; no transactions; no scheduler; the
  Billing/Taxes boundary is confirmed data-level (no service coupling).
- **Ruling requested (module scope):** confirm C9 == the `taxes` module (`TaxesService`), and that
  `services-catalog/services-taxes.integration.spec.ts` and the audit `*taxonomy*` specs are **out of
  scope**.
- **Ruling requested (delete-preservation test):** confirm whether C9 **should include** the optional
  `remove`-with-`BillTax`-`SET NULL` snapshot-preservation test (it seeds Billing fixtures but verifies a
  Tax-deletion contract, not Billing logic) — or exclude it to keep C9 strictly within the `Tax` entity.
- **Suspected-defect rulings requested:** confirm SD-1…SD-3 remain documented-only — multi-default and
  no-ceiling and hard-delete characterized as **current behavior**, not normalized as intended contracts.

## 11. Accepted vs deferred scope

**Accepted (C9):** `Tax` CRUD (create + duplicate `Conflict`; update + `NotFound`/`Conflict`; remove +
`NotFound`; findAll ordered/scoped); `isDefault`/`rateBasisPoints` behavior as current; tenancy isolation;
controller permission metadata + delegation. **Optional:** delete-preservation (`BillTax` `SET NULL`),
subject to the §10 ruling.

**Deferred:** Billing's tax *calculation* (C1, closed — not re-tested); `services-catalog` Service↔Tax
linkage (separate module); SD-1…SD-3 remediation; DTO-layer bounds (rate ceiling) → controller/pipe
checkpoint; R1 test-infra.

## 12. Definition of done (inherits strategy §14)

One primary invariant per test; deterministic assertions; all §11-accepted invariants (happy + failure);
cross-lab exact per §7; missing-context fails closed; deterministic + parallel-safe (unique lab, scoped
teardown, alone + capped-parallel); `tsc` clean; new specs green; `test:parallel` stays green; **no**
production/schema/migration/global-setup change; `_test`-only; SD-1…SD-3 documented, not encoded.
Pathspec-stage only the new spec file(s) → review → commit on approval.

## 13. Governance

- **Design only.** This audit was **read-only**: nothing created besides this document, nothing staged,
  nothing committed, no production/schema/migration/tenancy/Program-2 changes.
- No hard STOP condition triggered; the §0 grounding-truth items are documented, not blocking.
- Grants no implementation authorization; C9 implementation requires a separate authorization after this
  artifact is reviewed and committed. One module per checkpoint; pathspec-scoped commits only.
- C9 is the **final planned Program-3 checkpoint** under the frozen Phase-0 strategy.

## 14. Architectural Review — Rulings (FROZEN 2026-07-21)

**Decision: APPROVED WITH RULINGS.** The audit is consistent with the implemented Taxes context and
within the authorized read-only scope. The following are now frozen (they resolve the §10 requests):

1. **Module scope.** C9 = the Taxes module ONLY (`TaxesService`, `TaxesController`, Tax DTOs, `Tax`).
   OUT: `services-catalog/services-taxes.integration.spec.ts` (Service↔Tax linkage), audit-taxonomy
   specs, and C1 billing-calculation coverage. Boundary frozen.
2. **Billing/Taxes boundary.** Dependency is **Billing → Tax persistence data**; NO service-level
   coupling either direction. Taxes owns administration + persistence; Billing owns consumption,
   calculation, and bill-time snapshots. C9 must NOT duplicate C1.
3. **Transactions.** None. Each service op = one Prisma statement. `BillTax.taxId` `SET NULL` is a
   DB referential-integrity action, not an app transaction → no transaction suite, no rollback tests,
   no artificial transaction fixtures.
4. **Delete-preservation.** The optional `BillTax` snapshot-preservation test is **EXCLUDED** — it
   would seed/assert Billing-owned state, crossing the frozen boundary. C9 verifies only the
   Taxes-owned deletion contract: lab-scoped `Tax` located; missing/cross-lab → not-found; row deleted.
   Issued-bill snapshot preservation stays Billing/schema-integration territory.
5. **Scheduler.** None exists → no scheduler suite/fixtures/mocks authorized.
6. **Audit.** No Taxes audit integration → do not invent or infer audit events; audit-taxonomy specs
   remain unrelated/out of scope.
7. **Pure-unit.** Taxes owns no exported deterministic helper → no pure-unit suite, no helper
   extraction, no isolated calculation tests. Testing begins at the service-integration layer.
8. **Tenancy & authorization (frozen truth).** `Tax` scoped by `labId`; uniqueness via
   `@@unique([labId, name])`; cross-lab update/remove → not-found; missing tenant context fails via the
   existing guard; the four controller routes carry their distinct `tax:*` permissions. No broader
   authorization model.
9. **SD dispositions — documented, UNRESOLVED.** SD-1 (multiple defaults), SD-2 (no rate ceiling),
   SD-3 (hard deletion) remain recorded only. Do NOT add a single-default invariant, an upper rate
   limit, or soft-deletion/activation/replacement-default. SD-2 tests may verify existing lower-bound
   (`@Min(0)`) + persistence only.
10. **Approved future test architecture.** Service integration (create; duplicate-name conflict; list;
    update; remove; not-found; current `isDefault`; current `rateBasisPoints`); controller (all four
    route mappings; permission metadata; delegation — DTO/param forwarding); tenancy (per-lab
    uniqueness; cross-lab isolation; missing-context failure). **Explicitly excluded:** Billing tax
    calculations, Service↔Tax linkage, `BillTax` snapshot preservation, transactions, scheduler, audit,
    pure-unit tests, and normalization of SD-1…SD-3.

**Outcome.** No blocking ambiguity remains; the boundaries above are frozen. **C9 implementation
remains BLOCKED pending separate authorization** (one module per checkpoint; pathspec-scoped commits).
