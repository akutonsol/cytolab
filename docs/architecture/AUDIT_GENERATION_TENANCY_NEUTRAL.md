# ADR — Tenancy-Neutral Audit Generation Architecture

**Status:** Accepted — Design Only
**Owner:** audit domain
**Coordinating owner:** platform / tenancy
**Depends on:** A1.5 (generation architecture), B1 (fail-closed writer guard), Hybrid Multi-Tenancy
architecture (`docs/architecture/HYBRID_TENANCY_AND_CUSTOM_DOMAINS.md`)
**Blocks:** P2-R016B-B2 implementation until authorization Condition 4 (migration ownership operationally
stable) = PASS
**Grants:** no implementation authorization. This ADR is design only. No code, schema, or migration
change is authorized by it.
**Program:** Program 2 · P2-R016C

---

## 1. Context

PathOS/Osieri is row-level multi-tenant (one DB, one schema, every tenant-owned row carries `labId`,
governed fail-closed by `LabContext` + the Prisma tenancy extension). The hybrid-tenancy architecture
adds an opt-in **pool + silo** model implemented by connection routing, splitting:

- the **control plane** — the always-shared directory (`Lab`, `LabDomain`, `tenancyMode`, secret
  references) that resolves *who a lab is and where its data lives*, resolvable **before** any clinical
  database is opened; and
- the **data plane** — a lab's operational data: in the shared **pool** DB for `POOL` labs, in the lab's
  **own dedicated database** for `SILO` labs.

Migrations become **N-way** (applied to the pool and every silo). B2 will introduce the persistent
`AuditChainGeneration` model, the `GenerationStatus` enum, and the one-ACTIVE-generation-per-partition
constraint. This ADR fixes B2's architecture so it is **tenancy-neutral** — correct under `POOL` and
`SILO` with no design change when a lab siloes — and so it is not invalidated by hybrid-tenancy Phases
1–2.

Present state (informative): `AuditEvent` carries `scopeLabId` (not `labId`) and is **not** auto-scoped
by the tenancy extension; `AuditChainHead` is keyed by `chainId`. Audit placement is therefore a
**deliberate architectural decision**, made here, not an automatic consequence of the extension.

---

## 2. Principal decision (accepted, normative)

> **`AuditChainGeneration` is co-located with the `AuditEvent` and `AuditChainHead` for the partition it
> governs, and all registry operations execute through the already-resolved client/transaction for that
> database.**

Generations are identified by **UUID**. The generation registry is accessed **only** through a
client-parameterized provider. Every constraint is a **local (per-database)** invariant. Every
platform-wide operation is an **explicit fan-out** coordinated by the platform layer. The
`AuditChainGeneration` table ships as part of the N-way migration set.

**Why co-location is forced, not chosen.** A `CRITICAL_TRANSACTIONAL` audit event appends *inside the
business mutation's transaction* (B1), and B1's writer path is one atomic unit — resolve active
generation → allocate sequence → insert event → advance head. If a lab's clinical mutation executes in
its data-plane database (pool or silo), the audit event (same transaction) executes there too, so the
head **and** the generation row it reads/writes must reside in that same database. A cross-database
transaction does not exist in this stack; splitting the registry away from the chain would break B1's
atomicity guarantee. The registry is *logically* control-plane-like metadata but must be *physically*
data-plane-co-located for transactional integrity.

---

## 3. Partition location invariant (normative)

- An audit **partition** (`system`, `cross-lab`, or `lab:<labId>`) has **exactly one authoritative
  database location at any given time**.
- The **local one-ACTIVE-generation constraint is valid precisely because** a partition **cannot be
  concurrently authoritative in both the pool and a silo database**. The partial-unique index
  (`UNIQUE(partition) WHERE status = 'ACTIVE'`) is therefore enforceable **locally** in the single
  database that is authoritative for that partition — no distributed constraint is required.
- A **POOL → SILO transition** of a lab must migrate that lab's `AuditEvent`, `AuditChainHead`,
  `AuditChainGeneration`, and its relevant recovery/audit evidence **as one coordinated audit-partition
  transfer**. The audit partition moves as an atomic unit, not piecemeal.
- During and until completion of such a transfer, the **destination must not become writable** until the
  transfer **and its verification** are complete. There is never a window in which two databases both
  consider themselves authoritative for the same partition.

The **full transfer protocol is intentionally not designed in this ADR** (see §9, Deferred cutover
design).

---

## 4. Where each partition resides — pool role distinction (normative)

The pool database plays **two distinct roles**; they must not be conflated:

1. The pool is the **control plane** for tenancy routing and platform metadata (`Lab`, `LabDomain`,
   `tenancyMode`, secret references) — always shared, resolvable before any data-plane DB is opened.
2. The pool is **also the data plane for `POOL` labs.**

Consequently:

- **`system` and `cross-lab` audit partitions reside in the pool by architectural classification** —
  they are platform-level chains (e.g. lab-genesis SYSTEM events append in the pool before any silo
  exists). They are control-plane-classified audit partitions.
- **`POOL` lab audit partitions reside in the pool because the pool is that lab's selected data plane** —
  **not** because they are control-plane metadata.
- **`SILO` lab audit partitions reside in the lab's dedicated data-plane database.**

**Do not describe all pool-resident audit data as control-plane metadata.** A `POOL` lab's audit
partition is *data-plane data that currently happens to live in the pool*; it becomes silo-resident if
and when the lab transitions to `SILO` (via the §3 coordinated transfer).

---

## 5. Identity and uniqueness (normative)

- **`generationId` (UUID) — globally unique identity, requiring no coordination.** This is the reason
  A1.5 chose a UUID over an ordinal: UUIDs are collision-free across N independent databases **without a
  global sequence or coordinator**. This is the linchpin of tenancy-neutrality.
- **`chainId` — unique within its own database** (`partition` + generation identity). Distinct labs'
  `lab:<labId>` chainIds never collide; `system`/`cross-lab` exist only in the pool. No cross-database
  uniqueness is needed.
- **`generationNumber`, `previousGenerationId`, and lifecycle status — per-partition, within the
  partition's authoritative database.**
- **Only `generationId` needs cross-database uniqueness, and UUIDs provide it intrinsically.** No global
  sequence, no coordinator, no cross-DB constraint.

---

## 6. Routing responsibility (normative)

- The **platform / application layer** resolves the correct Prisma client through the
  `ConnectionManager` (from `LabContext.labId` / partition).
- The **audit generation provider receives an already-resolved `Prisma.TransactionClient`.**
- The provider **does not** resolve tenancy, inspect secrets, choose databases, or call
  `ConnectionManager`. It has no knowledge of pool vs silo.
- The **application service owns the transaction boundary** (it opens the transaction on the resolved
  client and threads it through allocate → append → advance, so the whole writer unit stays atomic in
  one database).

Design sketch (illustrative only — **must not be implemented**):

```ts
// APPLICATION / PLATFORM LAYER owns client resolution + the transaction boundary.
const client = await connectionManager.forLab(labId);

await client.$transaction(async (tx) => {
  const chainId =
    await generationRegistry.resolveActiveChainId(tx, partition);

  // allocate -> append -> advance  (B1 writer path, all on the same `tx`)
});
```

`deriveChainPartition(scope, labId)` remains **pure** (A1.5). `resolveActiveGeneration` remains the only
stateful step (A1.5) and runs on whatever `tx` the writer already holds — so the writer's
resolve → allocate → append → advance sequence is one atomic transaction in one database.

---

## 7. Domain-controlled lifecycle (normative)

- **Generation status is not freely mutable.** Arbitrary caller-selected status transitions are
  **prohibited**.
- `COMPROMISED` and `CLOSED` transitions must be performed **only through intent-specific, authorized
  domain operations** that carry and seal the required evidence.
- **Every terminal transition is evidence-bearing and terminal-immutable**, consistent with A1.5: once a
  generation is `COMPROMISED` or `CLOSED` it never transitions again, and its events/head are frozen.

The provider surface therefore exposes **intent-specific conceptual operations**, not a generic
`setStatus`. Conceptual (illustrative, **not** frozen method names, and **not** to be implemented):

```ts
// Conceptual, intent-specific lifecycle operations (names illustrative):
markCompromised(tx, generationId, evidence /* verification digest + failure metadata */): Promise<void>;
closeGeneration(tx, generationId, evidence /* reason + authorization ref */): Promise<void>;
// There is deliberately NO generic status setter.
```

Frozen names from A1.5 (`deriveChainPartition`, `resolveActiveGeneration`) are retained as-is;
provider-level operation names introduced here are conceptual until B2 freezes them under authorization.

---

## 8. Query semantics and fan-out authority (normative)

**Single-database query semantics:**

- Registry reads operate against **one supplied database client**.
- `listGenerations` (or any equivalent enumeration) is **never platform-global by itself** — it returns
  only the generations of the single database it is given.
- A **platform-wide view requires an explicit fan-out coordinator.**

**Fan-out authority:**

- The **pool / control-plane tenancy metadata is the authoritative source** for enumerating the set of
  active database targets (the pool plus every registered active silo).
- The **platform layer owns** target enumeration, connection resolution, credentials, retries, and
  partial-failure handling for any fan-out.
- The **audit domain verifies or operates against supplied clients/targets only**; it does **not**
  independently discover databases, resolve secrets, or manage cross-DB failure. Cross-database
  operations (the C monitoring sweep; any future cross-lab recovery coordination) are driven by the
  platform layer supplying each target client; the audit domain assesses each one locally.

---

## 9. Deferred cutover design (owned by platform hybrid-tenancy migration/cutover architecture)

This ADR **does not define**, and explicitly defers to the platform hybrid-tenancy migration/cutover
architecture, all of the following concerns for a `POOL → SILO` audit-partition transfer:

- write quiescence / write fencing;
- audit-partition copy mechanics;
- destination-chain verification (post-copy);
- routing cutover (making the destination authoritative);
- rollback of an incomplete transfer;
- split-brain prevention (never two authoritative databases for one partition);
- failure recovery during a `POOL → SILO` migration.

The audit domain's contribution to that protocol is bounded: it provides read-only verification of a
destination chain (via the existing verifier/monitor against a supplied destination client) and the
invariant that the destination is not writable until transfer and verification complete (§3). The
sequencing, fencing, and failure handling are platform concerns.

---

## 10. Consequences

**Positive**

- B2 is correct under `POOL` and `SILO` with **zero design change** when a lab siloes; B1 atomicity is
  preserved; no distributed transactions or global coordinator; A1.5's UUID identity choice is what makes
  this possible.
- The generation registry follows the chain automatically; a new silo is born with the registry table
  present (N-way migration).

**Cost (inherited from hybrid-tenancy, not introduced here)**

- The C monitor and any cross-lab recovery must **fan out** over pool + active silos, driven by the
  platform layer.
- `AuditChainGeneration` is one more table the N-way migration runner must apply to every database.
- A silo's audit backup is part of that silo's per-silo backup schedule.

**New coordination point**

- The platform N-way migration runner (hybrid-tenancy doc §6, not yet built) must include
  `AuditChainGeneration`. **B2's migration cannot be authored until that runner/model exists — which is
  exactly why authorization Condition 4 must be PASS before B2.**

---

## 11. How this de-risks B2

When Condition 4 flips to PASS (hybrid-tenancy migration model settled, N-way runner defined), B2
implements a **known, tenancy-neutral design**: co-located registry, UUID identity, client-parameterized
provider, domain-controlled lifecycle, local invariants, platform-driven fan-out for platform-wide
operations, and audit-partition transfer treated as one coordinated unit (protocol owned by platform).
No rework results from a later silo transition. The remaining B2 work is mechanical (schema + index +
provider wiring), not architectural.

---

## 12. Governance

- **Status:** Accepted — Design Only.
- **No implementation authorization** is granted by this ADR.
- B2, registration, backfill, controlled rollover, and recovery execution remain blocked until
  authorization Condition 4 = PASS under the canonical REB Evidence Standard.
- Forensic baseline preserved: the dev `system` chain remains COMPROMISED at fingerprint
  `MISSING / 3 / 3` (immutable evidence); writable chains verify with head↔terminal correspondence.
