# Program 3 · C3 — Payroll Test Design

**Status:** Accepted (design) — frozen C3 baseline; scope **Option A** (Payroll module only)
**Owner:** engineering (quality)
**Governs:** the Payroll test-hardening checkpoint (C3)
**Grants:** no test-implementation authorization. This is a read-only design artifact. No production,
schema, migration, tenancy, or Program-2 changes are authorized.
**Parent strategy:** `docs/PROGRAM_3_TEST_STRATEGY.md` (Phase 0, frozen `9fb04f5`)
**Sibling baselines:** C1 Billing (`4b4c731`/`57fecd6`), C2 Payments (`0e73595`/`df3a678`) — C3 reuses the
same production-parity `_test` harness.

---

## 0. SCOPE — RULED: Option A (read first)

> **Architectural ruling (recorded):** **Option A approved** — C3 is scoped exclusively to the `payroll`
> module (`PayrollService` / `PayrollRun` / `PayAdvice`). The `workforce/payroll-engine` (engine 2)
> becomes its own future checkpoint once the workforce churn settles. **SD-1 (reimbursement sign) remains
> an unresolved suspected defect and is intentionally excluded from the C3 behavioral baseline.** The
> analysis below records how that decision was reached.

Grounding reveals **two distinct payroll engines** in the repository:

1. **`src/modules/payroll` — `PayrollService` (`PayrollRun` + `PayAdvice`).** Stable, **clean** (no
   ambient churn), untested, injects **only Prisma**. This is the natural C3 target and what this design
   covers.
2. **`src/modules/workforce/payroll-engine.service.ts` — `PayrollEngineService` (`PayrollPeriod` +
   `PayrollEntry`, `processPeriod`, `createPeriod`, period lifecycle incl. `CANCELLED`).** A **separate
   module** that is **actively churned by the concurrent agent** (the `workforce` module has modified
   files in the current working tree).

The C3 authorization named `processPeriod()`, "payroll period lifecycle", "cancellation", "reopening",
and "export". Grounded against the code:

- `processPeriod()`, period lifecycle, and `CANCELLED` belong to **engine 2 (workforce)** — a different
  module, actively churned.
- The `payroll` module (**engine 1**) has **runs, not periods**; it has **no** period lifecycle, **no**
  cancellation, **no** reopening (approval is one-way), **no** export, and **no** separate "preview" step
  (`processRun` computes and persists in one call).

**Recommendation — Option A (scope C3 to engine 1, the `payroll` module only).** Rationale: it matches
the Program 3 selection criteria (stable, untested, low concurrent-conflict, one module per checkpoint);
engine 2 is in a churned module and would conflict with concurrent work and violate the one-module rule.
**Option B** (cover both engines) is **not recommended** for those reasons. Engine 2 should be its own
future checkpoint once the `workforce` churn settles.

**The remainder of this document is written for Option A** — the ruled scope. Engine 2 is out of C3 and
becomes its own future checkpoint after the `workforce` churn settles.

---

## 1. Public surface inventory (engine 1: `PayrollService`)

**Exported pure function (unit-testable, no DB):**
- `computeAdvice(input: AdviceInput): AdviceComputed` — the statutory-deduction calculator, explicitly
  "exported for unit testing". Interfaces `AdviceInput` / `AdviceComputed` are exported.

**Public service methods (15):**

| Area | Method |
|---|---|
| Runs | `listRuns`, `getRun`, `processRun`, `approveRun`, `removeRun` |
| Advices | `listAdvices`, `getAdvice`, `getSlip`, `updateAdvice`, `payAdvice` |
| Dashboards | `getStats`, `getAnalytics` |

`recomputeRunTotals` is **private** (exercised only through `updateAdvice`).

**Controller routes (12) — all permissioned (`PayrollController`, base path `payroll`):**

| Handler | Route | Permission |
|---|---|---|
| `getStats` | `GET payroll/stats` | `payroll:view` |
| `getAnalytics` | `GET payroll/analytics` | `payroll:view` |
| `listRuns` | `GET payroll/runs` | `payroll:view` |
| `processRun` | `POST payroll/runs/process` | `payroll:create` |
| `approveRun` | `PUT payroll/runs/approve/:id` | `payroll:change` |
| `getRun` | `GET payroll/runs/:id` | `payroll:view` |
| `removeRun` | `DELETE payroll/runs/delete/:id` | `payroll:delete` |
| `listAdvices` | `GET payroll/advices` | `payadvice:view` |
| `getSlip` | `GET payroll/advices/:id/slip` | `payadvice:view` |
| `getAdvice` | `GET payroll/advices/:id` | `payadvice:view` |
| `updateAdvice` | `PUT payroll/advices/update/:id` | `payadvice:change` |
| `payAdvice` | `PUT payroll/advices/pay/:id` | `payadvice:change` |

**DTOs:** `ProcessPayrollDto` (`period` `YYYY-MM`, optional ISO `payrollDate`, optional per-employee
`lines`), `PayrollLineDto` (all `@Min(0)` integer earnings/deductions), `ApproveRunDto` (`notes?`),
`UpdatePayAdviceDto` (`@Min(0)` overrides), `PayrollQueryDto`, `PayAdviceQueryDto` (`period?`,
`employeeId?`).

**Module:** `PayrollModule` imports only `PrismaModule`. **No providers to stub.** **No scheduler.**

## 2. Payroll domain model (engine 1)

- **`PayrollRunStatus` = { Draft, Processing, Completed }**, but `processRun` **creates a run directly as
  `Completed`** — `Draft`/`Processing` are **dead states** (never written by this engine).
- **`PayAdviceStatus` = { Draft, Issued, Paid }.** `processRun` creates advices as **`Issued`**;
  `payAdvice` sets **`Paid`**; `Draft` is the schema default but not produced by `processRun`.
- **Run identity/ownership:** `@@unique([labId, period])` — one run per period per lab; `runNumber` is
  **sequential per lab** (`max(runNumber)+1`, assigned at process time); `processedById` set to the actor.
- **Approval flow:** `approveRun` requires `status === Completed` and `approvedAt` unset → sets
  `approvedAt`/`approvedById`/`approvalNotes`. Approval is **one-way** (no reopen path).
- **Employee participation:** `processRun` includes **every `isActive` employee**, one `PayAdvice` each,
  applying optional per-employee `lines` overrides (else zeros).
- **Locking / integrity:** `integrityHash` = SHA-256 over `{runNumber, period, payrollDate, totalGross,
  totalNet, advices:[{employeeId, netPay}] sorted}`, computed **once at creation**.
- **Rerun behavior:** `processRun` throws `BadRequest` if a run for the period already exists; to rerun,
  `removeRun` first (which cascade-deletes advices).
- **Cancellation / reopening / export / preview:** **not present** in engine 1 (see §0).

## 3. Monetary model (engine 1) — all integer cents

`Employee.salary`, and every `PayAdvice` money field, are Prisma **`Int` = cents**. `computeAdvice`
(pure):

- `grossPay = basicPay + overtime + allowances + commission + bonus` (**reimbursement is NOT added** —
  see SD-1).
- `nis = round(min(grossPay, NIS_CEILING 41_666_667) × 0.03)`.
- `nht = round(grossPay × 0.02)`.
- `statutory = grossPay − nis` (NIS deductible before edTax/PAYE).
- `edTax = round(statutory × 0.0225)`.
- `paye`: `0` if `statutory ≤ 14_167_400`; else `band1 = min(statutory, 50_000_000) − 14_167_400`,
  `paye = band1 × 0.25 (+ (statutory − 50_000_000) × 0.30 if above)`, then `round`.
- `totalDeductions = nis + nht + edTax + paye + pension + reimbursement + otherDeductions`.
- `netPay = grossPay − totalDeductions`.

**Run-level aggregates:** `totalGross = Σ grossPay`, `totalNet = Σ netPay`,
`totalDeductions = totalGross − totalNet`, `employeeCount = #advices`. **YTD:** `ytdX = Σ(prior same-year
earlier periods) + current` (rolled up at `processRun`).

**Monetary invariants (to verify):** gross sum; NIS ceiling cap; edTax on post-NIS statutory; PAYE band
boundaries (below-threshold = 0, band-1, band-2); `netPay = gross − Σdeductions`; run totals equal the
sum of advices; YTD = prior + current. **Float rates are used internally with `Math.round`** → outputs
are integers; assertions use **hand-computed integer literals** (design §4/§8 of the strategy), never the
production expression.

## 4. Core workflows & transaction boundaries (engine 1)

- **`processRun`** — reads (existing-period check, active employees, prior-period advices for YTD,
  `max(runNumber)`) then a **single nested `payrollRun.create({ …, payAdvices: { create: advices } })`**
  → the run + all advices are one atomic statement. The pre-reads are outside. Failure modes: duplicate
  period → `BadRequest`; no active employees → `BadRequest`. **Not** idempotent (guarded by the
  duplicate-period check). No `$transaction` wrapper is needed (nested create is atomic).
- **`approveRun`** — single `update`; guards `Completed` + not-already-approved.
- **`updateAdvice`** — `payAdvice.update` (recomputes gross/nis/nht/edTax/paye/net via `computeAdvice`)
  **then** `recomputeRunTotals` (a **separate** `payrollRun.update`). Two writes, **not** in one tx (see
  SD-2/SD-3). Guarded: a `Paid` advice cannot be edited.
- **`payAdvice`** — single `update` to `Paid`; **no prior-state guard** (SD-5).
- **`removeRun`** — single `delete` (cascade advices); **no status guard** (SD-4).
- **`getStats` / `getAnalytics`** — read-only aggregations (counts, `groupBy`, per-period roll-ups).

**Collaborator interactions:** none — `PayrollService` depends only on `PrismaService`. There is **no**
RecordsService/Payments/Notifications/Audit/Reporting/Scheduler coupling and **no external payroll
provider** in engine 1.

## 5. Authorization & tenancy (engine 1)

- **Permission model:** per-route metadata (§1). `payroll:*` for runs/dashboards, `payadvice:*` for
  advices. C3 asserts route→permission **metadata** only (as C1/C2), not runtime guard/JWT/403s.
- **Tenancy:** `PayrollRun`, `PayAdvice`, `Employee` all carry `labId` → auto-scoped by the tenancy
  guard. Unscoped reads (`listRuns`, `getStats`, `max(runNumber)`, prior-YTD lookups) are lab-scoped at
  query time. `getSlip` reads the `Lab` via the **explicit** `user.labId` (Lab is the tenant root, not a
  `labId`-columned model).
- **Cross-lab (frozen outcomes):** `getRun`/`getAdvice`/`updateAdvice`/`approveRun`/`removeRun`/`getSlip`
  on a foreign id → scoped read returns null → `NotFoundException`. `listRuns`/`listAdvices`/`getStats`/
  `getAnalytics` → scoped to the acting lab; foreign rows absent/zero. `processRun` includes only the
  acting lab's active employees, and `runNumber` sequences per lab. **Missing lab context** → the guard
  fails closed and throws.

## 6. Integration map (engine 1)

| Collaborator | Dependency |
|---|---|
| **Prisma** | the only injected dependency; direct model access. |
| **Employee → User (`userId @unique`) → Department?** | data dependency: advices reference employees; `adviceSelect` reads `employee.user.{firstName,lastName}` and `employee.department.name`. Fixtures must seed `User` + `Employee` (+ optional `Department`). |
| **Lab** | `getSlip` reads the acting lab. |
| Billing / Payments / Records / Notifications / Audit / Reporting / Scheduling / external payroll | **none** — engine 1 has no such coupling. |

## 7. Test architecture proposal (engine 1) — design only

**A. `computeAdvice` — pure unit tests (no DB):** gross = Σ earnings; NIS ceiling cap (below vs above
`41_666_667`); edTax on post-NIS statutory; PAYE bands (`statutory ≤ threshold` → 0; band-1; band-2 above
`50_000_000`); `net = gross − Σdeductions` with `pension`/`otherDeductions` (unambiguous deductions).
**Reimbursement is deliberately excluded from any green net assertion pending the SD-1 ruling** (§8) —
tests will not encode reimbursement-as-a-deduction as blessed behavior.

**B. Service integration tests (`_test` DB, production-parity extended client, `labContext.run`):**
- `processRun`: N active employees → N `Issued` advices; run `Completed`; `totalGross/Net/Deductions`
  and `employeeCount` correct; `runNumber` sequences (`+1` over the prior max); `integrityHash` present;
  per-employee `lines` overrides applied; **YTD roll-up** from prior same-year periods; duplicate period
  → `BadRequest`; no active employees → `BadRequest`.
- `approveRun`: `Completed` → approved (fields set); non-`Completed` → `BadRequest`; already-approved →
  `BadRequest`; not-found → `NotFound`.
- `updateAdvice`: recomputes deductions + run totals; `Paid` advice → `BadRequest`; not-found → `NotFound`.
- `payAdvice`: → `Paid`; not-found → `NotFound`.
- `removeRun`: deletes an **unapproved** run + cascades advices; not-found → `NotFound`.
- `listRuns`/`getRun`/`listAdvices` (filter by `period`/`employeeId`)/`getAdvice`/`getSlip`: pagination,
  filters, decorated payloads, not-found.
- `getStats`/`getAnalytics`: run count + latest; 12-month `byPeriod`, tax breakdowns, empty-year zeros.

**C. Tenancy coverage:** cross-lab `NotFound` on the id-addressed methods; list/stats scoped;
`processRun` processes only the acting lab's employees and sequences `runNumber` per lab; missing-context
→ guard throws.

**D. Controller coverage:** the 12 route→permission metadata mappings via the exported `PERMISSIONS_KEY`
(+ completeness). **No delegation stubs** (no collaborators).

**E. Not in C3:** no scheduler tests (none exist); no concurrency tests (SD-7 documented, not encoded);
no collaborator/delegation stubs; engine 2 (workforce) entirely.

**Fixtures:** `Lab` ×2, `User` (unique), `Employee` (`isActive`, `salary`, `@@unique([labId,
employeeNo])`), optional `Department`, seeded via the bare client; runs/advices created via the service
or seeded. Teardown child-first, `labId`-scoped: `PayAdvice → PayrollRun → Employee → (Department) → User
→ Lab` (verify FK/`onDelete` against the schema at implementation time; `PayAdvice` cascades from both
`PayrollRun` and `Employee`). One fresh UUID lab per test; capped-parallel pool.

## 8. Suspected defects (record only — no fix, no green characterization test)

- **SD-1 (primary) — `reimbursement` reduces net pay.** `computeAdvice` adds reimbursement to
  `totalDeductions` (line 48) but does **not** add it to `grossPay` (line 36), so a reimbursement
  strictly **decreases** `netPay`. Reimbursements are ordinarily paid **to** the employee (should
  increase net). This inverts the sign. **Needs a §2 contract-evidence review** (payroll domain spec).
  Until ruled, C3 must **not** encode a green test blessing reimbursement-as-deduction.
- **SD-2 — `integrityHash` goes stale after `updateAdvice`.** The tamper-evidence hash is computed at
  `processRun` over totals + per-advice `netPay`, but `updateAdvice` changes advice amounts and run
  totals **without recomputing it** → the hash no longer matches content. Undermines the integrity
  guarantee.
- **SD-3 — YTD not recomputed on `updateAdvice`.** `updateAdvice` recomputes current-period figures but
  leaves `ytdGross/ytdNis/…` at their `processRun` values → YTD becomes inconsistent with the edited
  advice.
- **SD-4 — `removeRun` has no lifecycle guard.** An **approved** (or fully `Paid`) run can be deleted
  (cascading advices) with only `payroll:delete`. Financial-record deletion with no state guard.
- **SD-5 — `payAdvice` has no prior-state guard.** Sets `Paid` from any state (e.g. `Draft`/`Issued`
  directly), with no run-approval precondition.
- **SD-6 — `netPay` may be negative** when deductions exceed gross (no floor). May be legitimate for
  corrections; flagged as a boundary to confirm, not asserted as a defect.
- **SD-7 — `runNumber` race.** `runNumber = max+1` is read outside the create; concurrent `processRun`
  for different periods could assign a duplicate `runNumber` (only `[labId, period]` is uniquely
  constrained). Concurrency-class, like C2 SD-1 — documented, not encoded.

None of these require a production change **to test the accepted behavior**; they are recorded for
separate, explicitly-authorized review. Per the C3 STOP conditions, SD-1 in particular must not be
encoded as a passing characterization test until ruled.

## 9. Accepted vs deferred scope

**Accepted (C3, Option A):** `computeAdvice` statutory math (unit); `processRun` generation + totals +
`runNumber` + YTD + guards; `approveRun`; `updateAdvice` recompute + guards; `payAdvice`; `removeRun`
(unapproved); run/advice queries + `getSlip`; `getStats`/`getAnalytics`; tenancy isolation; controller
permission metadata.

**Deferred:** engine 2 (`workforce/payroll-engine`, `processPeriod`, period lifecycle, cancellation) →
its own future checkpoint after the workforce churn settles; SD-1…SD-7 remediation → separate
authorized reviews; DTO-layer `@Min(0)`/`YYYY-MM` validation → controller/pipe checkpoint; R1 test-infra.

## 10. Definition of done (inherits strategy §14, C1 §12)

One primary invariant per test; hand-computed monetary literals; all §9-accepted invariants (happy +
failure); cross-lab exact per §5; missing-context fails closed; deterministic + parallel-safe (unique
lab, scoped teardown, alone + capped-parallel); `tsc` clean; new specs green; `test:parallel` stays
green; **no** production/schema/migration/global-setup change; `_test`-only; SD-1…SD-7 documented, not
encoded. Pathspec-stage only the new spec file(s) → review → commit on approval.

## 11. Governance

- **Design only.** This audit was **read-only**: nothing created besides this document, nothing staged,
  nothing committed, no production/schema/migration/tenancy/Program-2 changes.
- **Rulings recorded:** (1) **Option A approved** — C3 == the `payroll` module only. (2) **SD-1 remains a
  suspected defect**, intentionally excluded from the C3 baseline; no `computeAdvice`
  net-with-reimbursement expectation is encoded until a dedicated decision/defect checkpoint rules it.
- Grants no implementation authorization; C3 implementation requires a separate authorization after this
  artifact is reviewed and committed. One module per checkpoint; pathspec-scoped commits only.
