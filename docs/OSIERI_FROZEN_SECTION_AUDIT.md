# Osieri — Frozen Section operations: data-model audit (no module built)

| Field | Value |
|---|---|
| Status | Audit complete — module NOT built (out of current domain; data model insufficient) |
| Current Phase | Osieri Phase 2A (Operations) |
| Owner | Founder |
| Dependencies | [docs/OSIERI_OPERATIONS_WORKSPACE.md](OSIERI_OPERATIONS_WORKSPACE.md) §4 A2; [docs/OSIERI_v2.md](OSIERI_v2.md) §7 |
| Last Updated | 2026-07-10 |
| Priority | P2 |
| Expected Next Milestone | Product decision on whether intraoperative frozen-section support is in Osieri scope |

Following the same read-only methodology as the [IHC Return Queue audit](OSIERI_IHC_RETURN_QUEUE_AUDIT.md),
the Frozen Section increment began with an audit of the data model. The conclusion is that
Osieri **cannot today represent truthful Frozen Section operations** — and, more fundamentally,
frozen sections are a **surgical-pathology intraoperative** workflow that lies outside this
product's current **cytology** domain. Per "prefer no feature over a misleading feature," **no
module was built**. No code or schema was changed.

---

## 1. What the module must show, vs. what the data can prove

| Requirement | Can the data prove it? |
|---|---|
| Which cases are active frozen sections? | **No.** Nothing designates a case as a frozen section / intraoperative consult. |
| Elapsed time | Record age exists, but not a frozen-section start; timing a generic case as a frozen would be misleading. |
| Responsible pathologist | **Yes** — `Record.assignedTo` — but not tied to any frozen case. |
| Turnaround timer (~20 min target) | **No.** TAT is modeled in **days/hours**, not minutes; there is no per-case intraoperative timer and no recorded "frozen received" start event. "No simulated timers" therefore rules the timer out entirely. |
| Operating-room visibility | **No.** No operating-room / theatre / location field exists on a case. |
| Real next action | Only generic actions (assign, review); nothing frozen-specific. |

Five of six requirements cannot be met, and the two partial ones (owner, age) have no frozen
case to attach to.

## 2. Everything audited (read-only)

- **Domain:** `RequisitionFormType` is only `Gynecology | NonGynecology`, and `SpecimenType` is
  entirely cytology — `CERV_SCRAP`, `ENDOCERV_ASP`, `VAG_POOL`, `URINE`, `CSF`, `PLEURAL_FLD`,
  `BREAST_ASP`, `THYROID_FNA`, `BONE_MARROW`, etc. These are Pap smears, aspirates, and fluids.
  A frozen section is a **tissue block**, prepared and read intraoperatively in surgical
  pathology / histology — a discipline this product does not currently model.
- **Designation:** there is **no** frozen / intraoperative form type, specimen type, status, or
  flag. The only urgency signal is the generic `Record.urgent` boolean, which means *urgent*, not
  *frozen*. Treating urgent cytology cases as frozen sections would be a fabrication.
- **Operating room:** no OR / theatre / surgical-location field anywhere. The `location` fields
  that exist are unrelated (e.g. file storage, "Cabinet A, Drawer 3").
- **Turnaround timer:** the TAT system is day/hour-grained — `Lab.targetTatDays` (default 3),
  `TATConfig.thresholdHours` / `warningHours` (24h). A frozen section's clinical target is
  ~20 **minutes**. There is no minute-level per-case timer and no recorded frozen start event to
  time against; any countdown would be simulated, which the increment prohibits.
- **Text sweep:** no `frozen`, `intraoperative`, `operating room`, `theatre`, or `rush` reference
  exists anywhere in the schema or services (only `Stat` TAT priority and SQL `OR` clauses).

## 3. Classification of the evidence

- **Confirmed frozen dependency:** none.
- **Possible signal:** none. Unlike IHC (which had adjacent-but-forbidden signals), frozen
  sections have no representation at all and sit outside the modeled domain.
- **Insufficient evidence:** correct — nothing distinguishes, times, or locates a frozen section.

## 4. Decision

**Do not build Frozen Section operations.** A module would have to invent the designation, the
operating room, and a ~20-minute timer with no real start event — every core element fabricated.
That is the misleading feature the directive forbids. Osieri remains an intelligence layer during
Phase 2A.

This is not merely a missing-fields gap (as with IHC); it is a **scope** question. Frozen
sections belong to surgical pathology / histology. The product **vision** names them as a
signature intraoperative experience ([docs/OSIERI_v2.md](OSIERI_v2.md) §7), but the **current
data model is cytology-only**, so frozen-section support is a future capability contingent first
on a product decision about whether Osieri supports intraoperative surgical workflows at all.

## 5. What a truthful frozen-section capability would require (future, not implemented)

If frozen sections are confirmed in scope, the minimum is materially larger than a single field:

- a **frozen-section case type** (a `RequisitionFormType`/case designation, or a dedicated
  intraoperative case entity);
- a recorded **frozen-received / intraoperative-start event** (the real timer origin) and a
  **report-communicated event** (the timer end) — minute-grained, not day-grained;
- an **operating-room / location** reference for OR visibility;
- an intraoperative **status lifecycle** (received → grossing → reading → communicated);
- and the UI to capture these in real time so the data is genuine, not seeded.

Because this crosses from cytology into surgical-pathology workflow, it should be scoped and
**approved as its own capability with an explicit product decision and schema evolution** — not
added inside Phase 2A.

## 6. Verification note

Nothing to typecheck, build, or pixel-verify: **no code was written**. That is the correct,
honest outcome. Unknown is better than fabricated; prefer no feature over a misleading feature.
