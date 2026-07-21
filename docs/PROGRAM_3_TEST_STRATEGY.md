# Program 3 — Test Hardening · Phase 0 Test Strategy

**Status:** Accepted — Design Only
**Owner:** engineering (quality)
**Depends on:** the Program-2 isolated-`_test` DB harness (`createTestPrisma`, jest `globalSetup`, the
capped-parallel / serialized-9 split)
**Grants:** no test-implementation authorization. C1 (Billing) requires a **separate** implementation
authorization. No production, schema, migration, tenancy, or Program-2 changes are authorized.
**Program:** Program 3 — Test Hardening

---

## 0. Purpose & independence

Add behavioral test coverage to stable, currently-untested backend modules, strengthening correctness
and enterprise/compliance posture **without** creating new architectural dependencies. This workstream
is fully independent of Program 2 and of the hybrid-tenancy Condition-4 hold: tests are behavior-level
and run against the isolated `_test` database, invariant to POOL/SILO placement.

---

## 1. Approach

The nine target modules are **DB-backed service modules** (direct Prisma; almost no external services —
only `bethesda-analytics` touches an AI path). Therefore:

- **Integration tests on the isolated `_test` database are primary**, reusing the Program-2 harness —
  no new infrastructure.
- **Pure unit tests** are used only for genuinely extractable pure logic (money math, `recall-interval`,
  derivations), which run without a DB.

---

## 2. Contract-evidence hierarchy (NORMATIVE)

Expected behavior is derived in this strict order of authority:

1. A **frozen ADR** or architectural decision.
2. An explicit **domain or product specification**.
3. The **public API/DTO contract** and documented state model.
4. **Existing validated tests** in the same domain.
5. The **current production implementation** — only where no higher contract exists.

**When sources conflict, STOP and report the conflict.** Never silently treat the implementation as the
source of truth. A test may only encode implementation behavior as "expected" when no higher-tier
contract speaks to that behavior.

---

## 3. Suspected defects (NORMATIVE)

Do **not** commit a passing test that normalizes behavior believed to violate an authoritative contract
or business invariant. When implementation behavior conflicts with the expected contract (§2):

1. **Stop the checkpoint.**
2. Produce a **suspected-defect report**: the tested behavior; the evidence establishing expected
   behavior (cite the §2 tier); the **smallest reproducible scenario**; and the impact.
3. **Request a separate defect-fix authorization.** No fix is made in this checkpoint.

Local characterization tests may be used **during investigation** but **must not enter the checkpoint
commit** unless separately approved.

---

## 4. Monetary representation (NORMATIVE)

Do **not** assume money is already integer minor units. **Each financial checkpoint must first identify
the actual representation** used by that module: integer minor units, Prisma `Decimal`, database
`numeric/decimal`, floating point, or a mixed representation — and record it in the checkpoint.

- **Never use floating-point equality** for monetary assertions. Use exact decimal comparison, integer
  comparison, or an explicit domain-approved rounding rule.
- A **potentially unsafe production representation** (e.g., float money, mixed units) is a **suspected
  defect** (§3). It does **not** authorize a production change; it is reported.

> Note: billing's `decorate()` comments money as "minor units (cents)" — that is an **indication to
> verify**, not a licence to assume it holds across billing, payments, payroll, and taxes.

---

## 5. Tenancy vs authorization (NORMATIVE)

These are distinct concerns and are tested **separately** where applicable:

- **Cross-lab tenancy isolation** — a lab cannot read/mutate another lab's rows.
- **Same-lab permission/role authorization** — the required permission gates the action.
- **Missing/unauthenticated context** — fail-closed behavior.

Do **not** claim authorization coverage solely from `LabContext` isolation — tenancy isolation is not
permission enforcement. Test permission enforcement **at its actual enforcement layer** (service,
controller, guard, or policy), whichever enforces it.

---

## 6. Test boundaries

- **`PrismaService` → REAL, isolated `_test` DB** (`createTestPrisma`). We do **not** mock Prisma —
  mocking the ORM yields false confidence; Program 2 established the real-`_test`-DB pattern. Run inside
  `labContext.run({ labId })` so tenancy scoping is exercised.
- **Side-effect emitters → STUB** (no-op spies), asserting they are **called with the right arguments**
  without standing up the real infra: `RealtimeGateway`, `AuditRecorder`, `NotificationsService`,
  `MailService`.
- **Cross-module deps → prefer real, thin-stub when heavy** (e.g., billing's `RecordsService`): a
  minimal real instance if cheap, else a stub returning only the reads the module under test needs.
- **External services → always STUB, never network** (`bethesda-analytics` AI path returns fixed data).
- **Missing test seams (NORMATIVE):** do **not** use private-method access, unsafe casts,
  monkey-patching of internals, or duplicated production logic to substitute for a missing seam. If the
  supported public surface is insufficient to test an invariant, **STOP and propose a separate, minimal
  production-seam checkpoint** — do not force the test.
- **Unit vs integration split:** pure functions (money math, interval logic, derivations) = fast **unit**
  tests, no DB; persistence, state transitions, authorization, tenancy = **integration** on `_test`.

---

## 7. Scheduler testing (NORMATIVE)

Call scheduler **business methods directly**; never run cron infrastructure. Using controlled time,
verify:

- **eligible** record selection;
- **exclusion** of ineligible records;
- **idempotency** where the contract requires it;
- **retry / duplicate-side-effect** behavior where the contract requires it.

(Applies to `recall.scheduler` and `reagent.scheduler`.)

---

## 8. Concurrency tests (NORMATIVE)

Add concurrency tests **only** for genuine concurrency-sensitive invariants. They must use **separate
operations or transaction boundaries capable of actually overlapping**. Sequential operations wrapped in
`Promise.all` do **not** constitute concurrency coverage and must not be presented as such.

---

## 9. Parallel safety & test-data ownership (NORMATIVE)

Every integration checkpoint must guarantee:

- **no global unscoped cleanup** (never `deleteMany` without a lab/prefix scope);
- **no reliance on test order**;
- **no shared static identifiers**; globally-unique fields (slugs, hostnames, reference numbers, emails)
  use **run-specific or worker-safe** values;
- **no global configuration/env mutation**;
- **teardown cannot delete another worker's data** — scoped strictly to this spec's lab/prefix;
- the spec **passes alone AND in the capped-parallel suite**.

**Test-data ownership:** every created row is traceable to a **unique test lab + UUID/prefix + explicit
setup path**. Do **not** depend on seed data unless the checkpoint explicitly documents that seed as a
required module invariant. Use **only scoped teardown**.

Placement: co-located `*.spec.ts` (repo convention), run in the **capped-parallel pool** (50%), **not**
the serialized-9 audit group.

---

## 10. Coverage goals (behavioral, not line %)

Per module, cover **business invariants** — not framework internals or generated code:

- **Monetary calculations** — exact arithmetic in the module's verified representation (§4); tax
  (basis-points); subtotal/tax/total/outstanding; over-/under-/zero-/negative-amount edges.
- **State transitions** — every legal transition, and rejection of illegal ones.
- **Authorization & tenancy** — the three distinct concerns of §5.
- **Invariants** — e.g., billing's price-snapshot immutability at bill time.
- **Failure paths** — missing refs, not-found, invalid DTO, duplicate, and genuine concurrency (§8).

Explicitly **out of scope:** line-coverage targets, testing the Prisma client, class-validator
internals, or NestJS wiring.

---

## 11. Execution rules (NORMATIVE)

- **No production code changes.** Tests **characterize existing behavior** subject to the §2 hierarchy —
  they expose what the code does where no higher contract exists, and they must not redefine it.
- **Suspected defect → §3** (stop, report, separate authorization).
- **Missing seam → §6** (stop, propose a separate minimal seam checkpoint).
- No `schema.prisma`, migration, tenancy-routing, public-API, or style-refactor changes; no reopening
  Program-2 artifacts.

---

## 12. Checkpoint order

| Checkpoint | Module | Note |
|---|---|---|
| C1 | **Billing** | Highest monetary+state surface; verifies observable tax calc with **controlled** inputs only (§13) |
| C2 | **Payments** | Money + verification + one `$transaction`; couples to billing balance |
| C3 | **Payroll** | Largest monetary surface; run/period state |
| C4 | **Recall** | Patient-safety scheduling; pure-unit interval logic; scheduler (§7) |
| C5 | **Reagent** | Inventory state + expiry; scheduler (§7) |
| C6 | **Request Tracking** | Status/timeline transitions |
| C7 | **Bethesda** | Classification + the one external/AI path (**stub**) |
| C8 | **Coding** | Classification + 2 `$transaction`; **extends** existing `coding.phi-audit.spec.ts` |
| C9 | **Taxes** | Module-level CRUD + rate lifecycle + validation (owner of all Taxes coverage) |

**This order may change only through architect review**, and only when repository profiling identifies a
material dependency or ownership conflict.

---

## 13. Billing / Taxes boundary (NORMATIVE)

- **C1 (Billing)** may verify Billing's **observable tax calculations using controlled tax inputs**.
- **C1 must NOT** expand into full Taxes-module CRUD, rate lifecycle, or administrative validation.
- **C9 remains the sole owner** of Taxes-module coverage.
- If Billing **cannot be isolated** from unverified Taxes behavior, **STOP and report the dependency**
  before expanding scope.

---

## 14. Per-checkpoint definition of done

- Critical business rules covered; **happy-path and failure-path** verified.
- Authorization/boundary conditions exercised where applicable (§5).
- Deterministic and isolated (§9): unique lab/data, scoped teardown, passes alone and capped-parallel.
- Coverage **meaningfully raises confidence** in correctness — not a percentage.
- Verification: new specs green; `test:parallel` stays green (`+N`); **no** schema/migration/production
  change; dev DB untouched (tests hit `_test`); dev audit fingerprint unaffected.
- **Pathspec-stage exactly the new spec file(s)** → review → commit on explicit approval.

---

## 15. Governance

- **Status:** Accepted — Design Only.
- This strategy **grants no test-implementation authorization**.
- **C1 (Billing) requires a separate implementation authorization.**
- No production code, schema, migration, tenancy, or Program-2 changes are authorized.
- Any **suspected defect (§3)** or **missing seam (§6/§10)** pauses its checkpoint.
- **One module per checkpoint**; **pathspec-scoped commits only** (excluding all ambient concurrent-agent
  changes).
