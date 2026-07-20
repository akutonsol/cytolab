# Osieri — IHC Return Queue: data-model audit (no module built)

| Field | Value |
|---|---|
| Status | Audit complete — module NOT built (data model insufficient) |
| Current Phase | Osieri Phase 2A (Operations) |
| Owner | Founder |
| Dependencies | [docs/OSIERI_OPERATIONS_WORKSPACE.md](OSIERI_OPERATIONS_WORKSPACE.md) §4 B3 |
| Last Updated | 2026-07-10 |
| Priority | P1 |
| Expected Next Milestone | Decision on the proposed minimal data-model addition |

The IHC Return Queue increment began, per instruction, with a **read-only audit** of the data
model. The audit's conclusion is that Osieri **cannot today represent a truthful IHC Return
Queue**, so — following "prefer no module over a misleading module" — **no module was built**.
This document records what the codebase can and cannot observe, the classification of the
evidence, and the smallest future data-model addition that would make a truthful queue possible.
No schema change is made here; the addition is a proposal for separate approval.

---

## 1. What the queue must answer, vs. what the data can prove

The module was required to answer eight questions. Here is what the data model can genuinely
observe for each:

| # | Question | Can the data prove it? |
|---|---|---|
| 1 | Which cases are waiting on IHC-related work? | **No.** No entity records an IHC/ancillary order or an "awaiting stain" state. |
| 2 | What exact dependency is outstanding? | **No.** No stain/marker/order field exists as a dependency. |
| 3 | When was it ordered or last changed? | **No.** No order/dependency timestamp (only generic record/status timestamps). |
| 4 | How long has the case been waiting? | Partially — record age and status-event timestamps exist, but not tied to any IHC dependency. |
| 5 | Who owns the case now? | **Yes** — `Record.assignedTo` / `assignedAt` (reusable). |
| 6 | Is sign-out blocked? | **No** IHC-specific blocker. The only recorded blocking fact is *unassigned → cannot advance* (already surfaced by SLA Risk). |
| 7 | What real action clears or advances the case? | Only generic actions (assign, review) — nothing that clears an IHC dependency, because none is modeled. |
| 8 | Where does the case return after the dependency resolves? | **No** re-review / returned-to-review state exists in the lifecycle. |

Owner and elapsed time are observable, but with **no IHC dependency to attach them to**, they
cannot power an IHC queue. Five of the eight questions cannot be answered at all.

## 2. Everything audited (read-only)

- **`RecordStatus` lifecycle:** `Pending → Submitted → Processing → Partial → Completed →
  Resulted → Approved → Billed → Paid`, plus `OnHold · Disabled · Failed · Viewed`. There is
  **no** state for IHC-ordered, stain-pending, awaiting-re-review, or returned-to-review.
  `OnHold` and `Processing` are generic and are explicitly out of bounds for inference.
- **`Record` model:** no IHC/ancillary/stain-order/hold-reason field. Assignment is recorded
  (`assignedToId`, `assignedAt`). Relations include specimens, statusHistory, resultSheets,
  bethesdaResult, reagentUsages, digitalSlides, aiScreening, consultRequests — none of which is
  an IHC/ancillary order.
- **`ResultSheet` / `ResultEntry` / `ResultLine`:** narrative + free-text findings
  (`abbreviation`, `result`, `findings`, `abnormalFinding`). No structured ancillary/IHC test.
- **`RequisitionLine`:** `formType` (Gynecology/Non-gyn), `isUrgent`, `isCompleted`, free-text
  `notes`. This is the initial requisition category, not a mid-review ancillary order.
- **`ReagentLot` / `ReagentUsage`:** reagents are free-text names; the seeded set is **routine
  cytology only** — Papanicolaou, Hematoxylin, Eosin, Fixative, Mounting Medium — with **no IHC
  antibodies**. `ReagentUsage` records *consumption that happened*, not a *pending* order, so it
  is the opposite of a waiting dependency.
- **`DigitalSlide.stain`:** a free-text slide **descriptor** (e.g. "Papanicolaou"), not an
  order or a status.
- **`BethesdaResult.recommendation = HPVReflexTesting`:** a clinical **recommendation to
  consider** HPV reflex — not an order, and with no status proving one was placed, is pending,
  or is complete.
- **`RecordStatusEvent.notes`:** free text. Unstructured; cannot support a deterministic queue,
  and there is no evidence IHC is recorded there.
- **Model-name sweep:** no `AncillaryOrder`, `IHCOrder`, `TestOrder`, `StainOrder`, `Panel`, or
  `Reflex*` model exists. The only `*Test` model is `ProficiencyTest` (QA), unrelated.
- **Existing operations code** already states the conclusion in `operations.service.ts`:
  *"No other dependency (IHC/molecular/instrument) is stored, so we state that plainly rather
  than infer one."*

## 3. Classification of the evidence

Using the directive's scheme:

- **Confirmed IHC dependency:** none.
- **Possible ancillary dependency:** none that is structured. The nearest candidates —
  `OnHold` status, a routine-stain `ReagentUsage`, `DigitalSlide.stain`, and the Bethesda
  HPV-reflex *recommendation* — each describe something other than a pending, blocking IHC
  dependency, and using any of them would be inference the directive forbids.
- **Insufficient evidence:** this is the correct classification for the IHC Return Queue as a
  whole. No recorded field distinguishes an IHC/ancillary dependency as a pending, blocking,
  awaiting-re-review state.

## 4. Decision

**Do not build the IHC Return Queue.** Building it would require inferring IHC from a generic
`OnHold`/`Processing` status or from routine reagent/stain descriptors — exactly the fabrication
the increment prohibits. A queue that presented such inferences as "IHC waiting" would be
misleading. Per "prefer no module over a misleading module," the honest outcome is no module.

Note: the operational need this queue would serve — cases stalled before sign-out — is already
**partially and truthfully** served by the existing **SLA Risk** surface, which states the one
real blocker it can prove (*awaiting reviewer assignment*) without claiming an IHC cause.

## 5. Exact missing fields / events

To represent an IHC (or general ancillary) return dependency truthfully, the model needs a
first-class **ancillary-order** concept that records, per order:

- the **case** it belongs to (`recordId`, lab-scoped `labId`);
- the **kind** of ancillary work (IHC / special stain / molecular / …);
- the **specific target** (e.g. marker/antibody or stain name);
- a **status** with real transitions (ordered → in process → completed / cancelled);
- **timestamps** for ordered-at and each status change (→ waiting duration, last-changed);
- whether it **blocks sign-out** (an explicit recorded flag, not inferred);
- **who ordered it**;
- and a lifecycle signal for **return to review** once resolved (either an order status the
  worklist reads, or a dedicated record state).

## 6. Smallest proposed data-model addition (proposal only — not implemented)

A single new model is enough to make a truthful queue possible; no change to the existing
`RecordStatus` lifecycle is strictly required if the worklist reads open ancillary orders.

```
model AncillaryOrder {          // proposed — NOT created here
  id           String   @id @default(uuid())
  labId        String                     // tenancy (lab-scoped like every model)
  recordId     String                     // the case
  kind         AncillaryKind              // IHC | SpecialStain | Molecular | Other
  target       String                     // marker/antibody or stain name (real, entered)
  status       AncillaryStatus @default(Ordered)  // Ordered | InProcess | Completed | Cancelled
  blocksSignOut Boolean @default(true)     // recorded, never inferred
  orderedById  String
  orderedAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  completedAt  DateTime?
  notes        String?
}
```

With this, the queue answers all eight questions from recorded data: waiting cases = records
with an open (`Ordered`/`InProcess`) order; dependency = `kind` + `target`; ordered/last-changed
= `orderedAt`/`updatedAt`; waiting duration = now − `orderedAt`; owner = `Record.assignedTo`;
blocks sign-out = `blocksSignOut`; action = open the order in the FHIR/record console; return =
the record re-enters the worklist when the order reaches `Completed`.

**This is a proposal, not a change.** Implementing it requires product approval and a migration
authored per the project rule (`prisma migrate diff --from-schema-datasource … --script` →
timestamped SQL → `prisma migrate deploy`), plus the UI to place and resolve orders so the data
is real rather than seeded. It should be scoped and approved as its own increment.

**`AncillaryOrder` is recorded here as a deferred future capability**, requiring explicit
product approval and a future schema evolution. It is **not** implemented. Osieri remains an
intelligence layer during Phase 2A and does not add this model now; the IHC Return Queue is
skipped until the capability is approved and built.

## 7. Verification note

There is nothing to typecheck, build, or pixel-verify: **no code was written**. That is the
correct, honest result of this increment — the deliverable is the audit and the proposal above.
Unknown is better than fabricated; configured is not healthy; evidence before confidence.
