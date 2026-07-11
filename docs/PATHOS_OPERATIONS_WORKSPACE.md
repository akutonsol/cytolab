# PathOS — Laboratory Operations Workspace

| Field | Value |
|---|---|
| Status | Draft — implementation contract for Phase 2A |
| Current Phase | PathOS Phase 2A (Foundation and adoption) |
| Owner | Founder |
| Dependencies | [docs/PATHOS_v2.md](PATHOS_v2.md) (Workspace 2), Helix v1.0 (frozen), realtime gateway, LIS interfaces |
| Last Updated | 2026-07-10 |
| Priority | P0 |
| Expected Next Milestone | Contract approval → Operations implementation begins |

This is the operational architecture for the Laboratory Operations Workspace — Workspace 2 of
the approved blueprint ([docs/PATHOS_v2.md](PATHOS_v2.md) §4) and the first surface built in the
resequenced roadmap ([docs/PATHOS_v2.md](PATHOS_v2.md) §11, Phase 2A). It is a design document:
no code, no components, no implementation. Everything here consumes Helix v1.0 exactly as frozen
([../HELIX_v1.0.md](../HELIX_v1.0.md)) and traces to the blueprint; nothing invents a conflicting
workflow or a new design-system abstraction.

---

## 1. Objective and scope

The Operations Workspace is the **laboratory command center** — the surface where the lab is run
in real time. It is not an analytics dashboard. Analytics look backward and describe; the command
center looks at *now* and enables action. Every element exists to support **operational awareness**
(seeing the true state of the lab) and **operational action** (changing it).

Primary users: the **Lab Operations Manager** and the **Lab Technician**
([docs/PATHOS_v2.md](PATHOS_v2.md) §3). The Medical Director and pathologist are secondary
consumers (quality alerts, worklist feed).

Scope for Phase 2A: this workspace and the integration workstream (HL7 v2 / FHIR / DICOM) that
feeds it. It carries no diagnostic AI (that is Phase 2B/2C); its AI is **operational** (§8).

The design honors the blueprint's non-negotiables: SLA risk is surfaced **before** breach; the
IHC re-review loop is **visible**; there is **no false empty state while loading**; navigation and
content share one scroll container; every action is acknowledged once within the experience
budgets ([docs/PATHOS_v2.md](PATHOS_v2.md) §4, §10).

---

## 2. The five operational questions (the spine)

The workspace is organized so that a manager glancing at it answers five questions in order,
without hunting. Every module below exists to answer one of them.

| # | Question | Answered by | Layer |
|---|---|---|---|
| 1 | What requires attention right now? | Attention Rail, Frozen Sections, Quality Alerts, failing interfaces | Attention (always visible) |
| 2 | What is waiting? | Active Worklist / Pipeline, Specimens Awaiting Action, IHC Return, Cytology Batch | Board |
| 3 | What is falling behind? | Turnaround Time, SLA Risk | Board |
| 4 | Where are bottlenecks developing? | Workload, Capacity, Staffing, Instruments, AI Utilization, Integration Health | Board / Constraints |
| 5 | What should happen next? | Operational AI recommendations, and the next-action affordance on every case | Woven through |

The questions are ordered by urgency: attention before waiting, waiting before lateness, lateness
before bottlenecks, and every answer ends in an action.

---

## 3. Information hierarchy

Four layers, from most to least immediate. What is urgent is always visible; depth is revealed on
demand (progressive disclosure, [docs/PATHOS_v2.md](PATHOS_v2.md) §2).

- **Attention layer (always visible, real-time).** The standing answer to Question 1. A persistent
  rail that surfaces only what needs a human now: frozen sections in progress, imminent SLA
  breaches, QC/quality alerts, and failing interfaces. When nothing is urgent it shows a calm,
  **true** steady state ("N cases in flight, all within SLA") — never a false zero, never a lie
  while data loads (it uses a skeleton until real counts arrive).
- **Operational board (the working surface, real-time).** Answers Questions 2–4. The pipeline of
  queues by stage, the timeliness strip (TAT, SLA risk), and the constraints strip (capacity,
  staffing, instruments, AI, integrations). This is the lab's live state on one surface.
- **Drill-downs (progressive disclosure, real-time).** A queue expands to its case list; a case
  expands to its **workflow timeline** ([docs/PATHOS_v2.md](PATHOS_v2.md) §9). Detail is one
  gesture away and carries full context.
- **Historical (behind a deliberate toggle, not real-time).** Trends and distributions for
  planning — TAT over weeks, workload over shifts. Clearly marked as historical so it is never
  confused with the live board. Deep analytics belong to Enterprise reporting (§10), not here.

**Real-time vs historical, explicitly.** Real-time: attention rail, queue counts and ages, SLA
countdowns, instrument and interface status, staffing presence, AI throughput. Historical:
TAT/workload/throughput trends, capacity planning. Real-time surfaces update via the lab-scoped
realtime gateway; historical surfaces load on demand and state their as-of time.

---

## 4. Operational modules

Modules emerge from laboratory work, not from a widget catalog. Each is defined by Purpose,
Primary user, Inputs, Outputs, Actions, Relationships, and Success metrics. Each names the
existing surface it recomposes (blueprint §4 backing) and consumes Helix primitives only (§11).

### Group A — Attention (Question 1)

#### A1. Attention Rail (command layer)

- **Purpose:** Surface only what needs a human now, ranked by urgency; the standing answer to
  "what requires attention right now?"
- **Primary user:** Lab Operations Manager.
- **Inputs:** Imminent SLA breaches (from SLA Risk), frozen-section starts, QC/quality alerts,
  interface failures, escalations.
- **Outputs:** A ranked, de-duplicated set of attention items, each with a one-line reason and a
  single next action. A true steady state when empty.
- **Actions:** Acknowledge, act (opens the relevant drill-down or performs the one action),
  escalate, dismiss with reason.
- **Relationships:** Aggregates signals from SLA Risk, Frozen Sections, Quality Alerts, Integration
  Health. Never invents a signal; it ranks and routes.
- **Success metrics:** Time-to-acknowledge an attention item; share of breaches caught before they
  occur; false-alert rate.
- **Backed by:** `escalations`, `tat`, `qc`, `recalls`, `fhir`, `system`.

#### A2. Frozen Sections (intraoperative)

- **Purpose:** Track the highest-stakes, most time-critical work — a surgeon is waiting, ~20 minute
  turnaround — and pre-empt everything else.
- **Primary user:** Lab Operations Manager and pathologist on service.
- **Inputs:** Frozen-section orders (STAT flag), start time, assigned pathologist, OR context.
- **Outputs:** A live countdown per frozen case, assignment, and status against the 20-minute
  target.
- **Actions:** Assign/claim, mark received/reported, escalate if unclaimed, open the case in
  Sign-Out.
- **Relationships:** Feeds the Attention Rail at top priority; opens directly into Sign-Out's
  frozen-section mode ([docs/PATHOS_v2.md](PATHOS_v2.md) §7).
- **Success metrics:** Frozen turnaround (target ≤ 20 min); unclaimed time; on-target rate.
- **Backed by:** `records` (frozen/STAT), `tat`.

#### A3. Quality Alerts

- **Purpose:** Surface operational quality signals that need action — QC failures, discordances
  routed from Quality & Governance, recalls, amendment tasks.
- **Primary user:** Lab Operations Manager; Medical Director/QA as consumer.
- **Inputs:** QC failures, discordance events (from Quality & Governance), recall notices,
  amendment-triggered operational tasks.
- **Outputs:** Ranked quality attention items with the case and the required action.
- **Actions:** Assign, resolve/route to Quality, hold a case, open the case.
- **Relationships:** Bidirectional with Quality & Governance (§10): receives discordance/QC, sends
  operational resolution status.
- **Success metrics:** Time-to-resolution of quality alerts; open quality-alert age.
- **Backed by:** `qc`, `correlation`, `recalls`, `change-requests`.

### Group B — Queues and flow (Question 2)

#### B1. Active Worklist / Pipeline Board

- **Purpose:** Show the whole lab as a pipeline of stages — Accession → Prep/Scan → QC → AI →
  Awaiting Review → In Sign-Out → Reporting → Released — with count, oldest age, and SLA risk per
  stage. This is the lab-level workflow timeline.
- **Primary user:** Lab Operations Manager.
- **Inputs:** Every in-flight case and its current stage, age, priority, assignment, dependencies.
- **Outputs:** Per-stage totals, oldest-case age, SLA-risk indicator; the master view of "what is
  waiting."
- **Actions:** Filter (subspecialty, priority, assignee, site), drill into a stage's cases,
  prioritize, reassign in place.
- **Relationships:** The parent of every queue drill-down; feeds SLA Risk and Capacity; opens cases
  into Sign-Out.
- **Success metrics:** Cases-in-flight vs capacity; stage dwell time; queue age distribution.
- **Backed by:** `records`, `requisitions`, `req-tracking`.

#### B2. Specimens Awaiting Action

- **Purpose:** The technician's answer to "what is waiting on the bench" — accessioning, prep,
  scanning, and QC gaps.
- **Primary user:** Lab Technician.
- **Inputs:** Specimens by pre-analytic stage; QC pass/fail; scanning status.
- **Outputs:** A prioritized bench worklist with what each specimen needs next.
- **Actions:** Accession, mark processed/scanned, log QC, release to the review queue, flag a
  problem.
- **Relationships:** Upstream of the Pipeline Board (releases feed Awaiting Review); the source of
  the IHC Return Queue when stains are ordered.
- **Success metrics:** Pre-analytic dwell time; scan throughput; QC first-pass rate.
- **Backed by:** `requisitions`, `records`, `qc`.

#### B3. IHC / Special-Stains Return Queue

- **Purpose:** Make the re-review loop visible — cases a pathologist sent back for IHC that must
  return for re-review ([docs/PATHOS_v2.md](PATHOS_v2.md) §7). The loop the linear pipeline hides.
- **Primary user:** Lab Technician (fulfillment) and Lab Operations Manager (flow).
- **Inputs:** IHC/special-stain orders placed in Sign-Out, fulfillment status, expected-back time.
- **Outputs:** Ordered stains with status (ordered → in process → ready) and the case they return
  to; the case re-enters the worklist as *ready* when stains complete.
- **Actions:** Mark in-process/complete, expedite, notify the ordering pathologist, re-queue for
  re-review.
- **Relationships:** Closes the loop from Sign-Out (order placed) back to the Pipeline Board (case
  ready). Draws reagent availability from Instrument/Reagent status.
- **Success metrics:** IHC turnaround (order → ready); re-review latency; expedite rate.
- **Backed by:** `records`, `result-sheets` (orders), `reagents`.

#### B4. Cytology Batch Review

- **Purpose:** The high-volume screening triage surface for the **cytotechnologist**
  ([docs/PATHOS_v2.md](PATHOS_v2.md) §3) — confirm the normal en masse, flag the abnormal.
- **Primary user:** Cytotechnologist; pathologist for flagged cases.
- **Inputs:** Screening queue (Pap/cytology), AI screening pre-triage, Bethesda categorization.
- **Outputs:** A batch triage view; normal cases confirmed rapidly, abnormals routed to the
  pathologist with context.
- **Actions:** Rapid-confirm normal, flag abnormal, annotate, route to pathologist, batch-release.
- **Relationships:** Feeds the pathologist worklist in Sign-Out with flagged cases and context;
  draws AI pre-triage from AI Utilization.
- **Success metrics:** Screening throughput; flag rate; screen-to-review latency for abnormals.
- **Backed by:** `bethesda`, `ai-screening`, `records`.

### Group C — Timeliness (Question 3)

#### C1. Turnaround Time (TAT)

- **Purpose:** Show how the lab is performing against turnaround targets, live and historical.
- **Primary user:** Lab Operations Manager; Medical Director as consumer.
- **Inputs:** Case timestamps at each stage; TAT targets by case type/subspecialty.
- **Outputs:** Live TAT per stage and end-to-end; historical trend (behind the historical toggle).
- **Actions:** Filter by type/site/assignee; drill to the cases behind a slow stage.
- **Relationships:** Feeds SLA Risk and the Pipeline Board; emits history to Enterprise reporting.
- **Success metrics:** Median and 90th-percentile TAT; TAT trend direction.
- **Backed by:** `tat`.

#### C2. SLA Risk

- **Purpose:** Surface cases that will breach SLA **before** they do — the blueprint's signature
  operational behavior ([docs/PATHOS_v2.md](PATHOS_v2.md) §4, §9).
- **Primary user:** Lab Operations Manager.
- **Inputs:** Case age, remaining SLA budget, current stage, dependency state, predicted stage
  durations (from Operational AI).
- **Outputs:** A ranked list of at-risk cases with lead time to breach and the action that would
  clear the risk; the strongest feed into the Attention Rail.
- **Actions:** Prioritize, reassign, expedite a dependency, escalate.
- **Relationships:** Consumes TAT and Operational AI prediction; the top items rise into the
  Attention Rail; overdue outcomes flow to Quality & Governance.
- **Success metrics:** Breaches prevented (acted-on before breach); lead time on warnings; false
  positive rate.
- **Backed by:** `tat`, `req-tracking`.

### Group D — Capacity and constraints (Question 4)

#### D1. Workload Distribution

- **Purpose:** Show how work is distributed across pathologists and technicians, and where it is
  unbalanced.
- **Primary user:** Lab Operations Manager.
- **Inputs:** Assigned and unassigned cases per person, subspecialty match, current load vs typical.
- **Outputs:** Per-person load, imbalance indicators, unassigned backlog.
- **Actions:** Reassign cases, balance load (accept an AI redistribution suggestion), assign
  unassigned work.
- **Relationships:** Consumes Staffing; source for Operational AI redistribution; assignment
  changes flow to Sign-Out worklists.
- **Success metrics:** Load-balance variance across staff; unassigned-case age.
- **Backed by:** `workload`, `workforce`.

#### D2. Laboratory Capacity

- **Purpose:** Show aggregate throughput capacity against demand — is the lab keeping up?
- **Primary user:** Lab Operations Manager.
- **Inputs:** Inflow rate, throughput rate, staffing, instrument availability.
- **Outputs:** Capacity headroom or deficit, projected against predicted inflow (Operational AI).
- **Actions:** Adjust staffing plan, reprioritize, flag a capacity shortfall.
- **Relationships:** Consumes Staffing, Instruments, TAT; informed by Operational AI queue
  forecast.
- **Success metrics:** Throughput vs inflow; capacity utilization; backlog trend.
- **Backed by:** `workload`, `workforce`, `tat`.

#### D3. Staffing

- **Purpose:** Show who is on, coverage by role and subspecialty, and gaps.
- **Primary user:** Lab Operations Manager.
- **Inputs:** Shift schedule, clock/attendance, roles, coverage requirements (from Administration).
- **Outputs:** Live coverage view; understaffed roles/subspecialties surfaced.
- **Actions:** Adjust assignments within the current shift; flag a coverage gap; hand off.
- **Relationships:** Consumes schedule/roles owned by Administration (§10); feeds Workload and
  Capacity; overload feeds Operational AI.
- **Success metrics:** Coverage adherence; overload incidents; unfilled-role time.
- **Backed by:** `workforce`.

#### D4. Instrument Status

- **Purpose:** Show the operational state of scanners, stainers, and processors — the physical
  bottlenecks.
- **Primary user:** Lab Technician; Lab Operations Manager.
- **Inputs:** Instrument up/down/maintenance state, queue depth, reagent levels (from Reagents).
- **Outputs:** Per-instrument status and throughput; a down instrument raises an attention signal.
- **Actions:** Mark maintenance, reroute work, order reagents, escalate a fault.
- **Relationships:** A down scanner throttles the Scan stage (Pipeline Board) and IHC Return; feeds
  Capacity and Operational AI bottleneck detection.
- **Success metrics:** Instrument uptime; queue depth behind an instrument; reagent stockouts.
- **Backed by:** `qc`, `reagents`, `system` (device/telemetry signals; consumes existing signals,
  invents no clinical domain).

#### D5. AI Utilization (operational)

- **Purpose:** Show AI throughput and health as an operational resource — how much AI processing is
  flowing, and whether it is degraded.
- **Primary user:** Lab Operations Manager.
- **Inputs:** AI job throughput, backlog, degradation/unavailable events, per-stage AI coverage.
- **Outputs:** AI throughput and a clear degraded/unavailable state (the AI never throws; its
  absence is legible, [docs/PATHOS_v2.md](PATHOS_v2.md) §6).
- **Actions:** Reprioritize AI queue, acknowledge degradation, route around AI when unavailable.
- **Relationships:** Cytology Batch and Sign-Out consume AI output; degradation here explains
  downstream delay; feeds Capacity.
- **Success metrics:** AI throughput; AI backlog age; degradation frequency and duration.
- **Backed by:** `ai-screening`, `ai`, `system`.

#### D6. Integration Health / External Interfaces

- **Purpose:** Show the health of the interfaces that connect PathOS to the LIS of record and
  external systems — HL7 v2 (ORU), FHIR, DICOM WSI ([docs/PATHOS_v2.md](PATHOS_v2.md) §8).
- **Primary user:** Lab Operations Manager; Administration/IT for configuration.
- **Inputs:** Interface up/down, message throughput, error/retry counts, last-successful timestamps.
- **Outputs:** Per-interface health; a failing interface raises a high-priority attention signal
  (results not returning to the LIS is a deployment-critical failure).
- **Actions:** Acknowledge, retry, escalate to IT, open the interface config (Administration).
- **Relationships:** Failures rise into the Attention Rail; interface config is owned by
  Administration (§10); results-return depends on this being healthy.
- **Success metrics:** Interface uptime; message success rate; unacknowledged-failure time.
- **Backed by:** `fhir`, `system`.

### Group E — Next action (Question 5)

Operational AI (§8) and the next-action affordance carried on every case and attention item are
the answer to "what should happen next." They are not a separate module box; they are woven
through the board so that every answer ends in an action.

---

## 5. Queue intelligence

Queues here do not merely sort — they **explain**. Every case in any queue answers five questions
without the manager opening it. This is the operational expression of *reduce cognitive load*
([docs/PATHOS_v2.md](PATHOS_v2.md) §2).

For every case row:

1. **Why is this case here?** Its current stage and how it arrived (new accession, returned from
   IHC, flagged in batch, reassigned).
2. **Why is it delayed?** The specific cause, stated — awaiting IHC, awaiting molecular, no assigned
   pathologist, instrument down, AI backlog, dependency on a prior — not merely "old."
3. **Who owns it?** The assigned person (or "unassigned," itself a cause).
4. **What dependency blocks it?** The concrete blocker and its expected clear time (stains ready in
   ~2h, scanner in maintenance, awaiting molecular result).
5. **What action clears it?** A single next action per case — reassign, expedite the dependency,
   prioritize, escalate — presented inline so the manager acts without leaving the queue.

Each case therefore carries a **reason** (why it is here / delayed), an **owner**, a **blocker**,
and a **next action**. Sorting is by urgency and SLA risk by default, but the explanation is
always present. A queue that cannot explain a case's presence is a defect.

---

## 6. Interaction model

How the manager and technician work the board. Every interaction is acknowledged once within the
experience budgets (interaction ≤ 100ms visible acknowledgement; [docs/PATHOS_v2.md](PATHOS_v2.md)
§10), and mutations use the one feedback language.

- **Prioritize work.** Raise a case's priority inline from any queue; the change is reflected on the
  board and the affected worklist immediately, acknowledged at once. Priority is a domain concept
  (priority tokens), never an ad-hoc colour.
- **Escalate work.** Send a case or attention item up (to a senior, to the Medical Director, to IT)
  with a reason; it appears in the recipient's attention surface and is recorded.
- **Reassign work.** Move a case (or a batch) from one person to another from the Workload view or a
  queue; the case leaves one Sign-Out worklist and enters another, with state carried.
- **Investigate delays.** From SLA Risk or a slow stage, drill to the cases and read each case's
  stated blocker (queue intelligence) — never guess why something is late.
- **Drill into cases.** Expand a queue to its case list, and a case to its **workflow timeline**
  (the full journey with owner, timing, and dependency at each stage). Progressive disclosure; the
  board stays put beneath.
- **Return to queues.** Leaving a drill-down returns to the exact board state (filters, scroll,
  selection preserved) — investigating a case never costs the manager their place.
- **Handle interruptions.** A frozen section or a critical interface failure pre-empts calmly: it
  rises in the Attention Rail without tearing the manager away from their current task; they choose
  when to act. Motion communicates the arrival; it does not hijack focus.

All of this shares one scroll container with global navigation (locked constraint). Loading uses
skeletons, never false zeros; steady states are true states.

---

## 7. Real-time and historical data

- **Real-time (via the lab-scoped realtime gateway):** attention items, queue counts and case ages,
  SLA countdowns, frozen-section timers, instrument and interface status, staffing presence, AI
  throughput. These reflect the live lab and update continuously.
- **Historical (on-demand, marked as-of):** TAT/workload/throughput trends, capacity planning. Used
  for shift and staffing decisions, clearly separated from the live board so a trend is never
  mistaken for the present. Deep, cross-period analytics belong to Enterprise reporting (§10).

---

## 8. Operational Intelligence (future capability — not implemented)

**Naming correction (architectural).** What this section previously called "Operational AI" is
retired as a product concept. The feasibility audit
([PATHOS_OPERATIONAL_AI_AUDIT.md](PATHOS_OPERATIONAL_AI_AUDIT.md)) established that what PathOS can
produce truthfully today is **deterministic operational insight** (rules over recorded state), not
AI. Calling deterministic thresholds "AI" would mislabel them, so the concept is renamed.

**Operational Intelligence** is the future umbrella concept: *the collection of trustworthy
operational insight, forecasting, optimization, and recommendation capabilities built only from
recorded laboratory evidence.* It may eventually contain deterministic operational insights,
forecasting, workload optimization, recommendation systems, and machine learning — **but only when
the supporting recorded evidence exists.**

**Status: not implemented.** This capability requires additional recorded operational signals
before implementation. The deterministic operational insight PathOS can prove today is already
surfaced by the delivered modules (SLA Risk, Pipeline, Integration Health, Quality Alerts, and the
`/workload` view); no separate module is built, and no deterministic rule is labelled "AI". The
recommendation and forecasting behaviors described in earlier drafts (predicted breach beyond a
deterministic countdown, suggested redistribution, staff-overload, queue forecast) are **not
supported by the current data** and are deferred.

**Required future evidence** (each a separately-approved data-model evolution — no timelines, not
promoted to active development):

- longer, seasonality-aware operational history (throughput and TAT at daily/finer granularity);
- staffing **capacity** (a recorded per-role/person caseload or throughput target);
- **qualifications / subspecialties** on users and cases (to prove a reassignment target is competent);
- **ancillary dependency tracking** (the [AncillaryOrder](PATHOS_IHC_RETURN_QUEUE_AUDIT.md) proposal);
- richer operational events.

Human approval remains mandatory for any future suggested action; no automated decisions.

---

## 9. Collaboration with other workspaces

Operations is a hub; it hands work to and receives signal from the other three workspaces and
enterprise reporting. It owns operational state; it does not own clinical decisions, quality
adjudication, or configuration.

- **Sign-Out ([docs/PATHOS_v2.md](PATHOS_v2.md) §4 W1).** Operations feeds the pathologist's
  worklist and its priority/assignment. Opening a case from any queue lands in Sign-Out carrying
  full state. When a pathologist orders IHC in Sign-Out, the case returns to Operations' IHC Return
  Queue and re-enters the worklist as *ready* when stains complete. Frozen sections open directly
  into Sign-Out's frozen-section mode.
- **Quality & Governance ([docs/PATHOS_v2.md](PATHOS_v2.md) §4 W3).** QC failures, discordances,
  recalls, and amendment tasks surface in Operations as Quality Alerts; Operations returns their
  operational resolution status. TAT breaches and overdue outcomes flow to Quality as quality
  signals. Operations executes; Quality adjudicates.
- **Enterprise Administration ([docs/PATHOS_v2.md](PATHOS_v2.md) §4 W4).** Staffing schedules,
  roles/permissions, instrument configuration, and interface configuration are **owned by
  Administration and consumed by Operations**. A failing interface in Operations links to its config
  in Administration. Operations changes assignments and priorities; it does not change roles,
  schedules, or interface setup.
- **Enterprise reporting ([docs/PATHOS_v2.md](PATHOS_v2.md) §8).** Operations emits the operational
  history — TAT, SLA adherence, workload, throughput, instrument uptime, interface health — that
  feeds enterprise quality analytics and the Medical Director's dashboard. The command center shows
  *now*; enterprise reporting aggregates *over time*.

---

## 10. Helix v1.0 implementation mapping

Every surface composes from Helix primitives consuming semantic, domain, and motion tokens — no new
components, no raw hex, no raw duration or hue ([../HELIX_v1.0.md](../HELIX_v1.0.md) §6, §8).
Indicative mapping (not an exhaustive spec):

- **Attention Rail, Quality Alerts, Frozen Sections:** `Card` / `SectionContainer` for the rail;
  `Badge` / `StatusBadge` for priority and status via the priority/status domain tokens; `IconAction`
  and `Button` (with `loading`) for inline actions; `notify` for acknowledgement; motion tokens for
  a calm, non-hijacking arrival.
- **Pipeline Board, queues, drill-downs:** `Table` (`Th`/`Td`) and `DataTable` for case lists;
  `StatCard` for per-stage totals; `Badge`/`StatusBadge` for stage, priority, and blocker reason;
  `PillSelect` for filters; `Skeleton` while loading; `EmptyState` only for a *true* empty queue,
  never as a loading placeholder.
- **TAT, SLA Risk, Capacity, Workload, AI Utilization:** `StatCard` and `Gauge` for live figures;
  `BarChart` / `LineChart` / `MiniAreaChart` for the historical layer (behind the historical
  toggle); domain `chart`/`gauge` tokens.
- **Instrument and Integration Health:** `Card` + `StatusBadge` per instrument/interface; status via
  status domain tokens.
- **Case workflow timeline:** composed from `Card`/`SectionContainer`, `Badge`, and motion tokens —
  the recurring signature surface across the product.
- **Interaction feedback:** `GlobalProgress` for pending navigation/fetch; `Button loading` +
  `aria-busy` for in-flight actions; `notify` (dismiss-by-meaning) for outcomes; all within the
  experience budgets.
- **Realtime:** the lab-scoped realtime gateway (`emitToLab`) drives the real-time layer; no new
  transport.

If any surface here appears to need something Helix v1.0 cannot express, it is recorded in
[../Roadmap/05_HELIX_v1_1.md](../Roadmap/05_HELIX_v1_1.md) with evidence — it is not solved by
bending Helix.

---

## 11. Traceability to the blueprint

| This document | Traces to [docs/PATHOS_v2.md](PATHOS_v2.md) |
|---|---|
| The command center (not a dashboard) | §4 Workspace 2 (Laboratory Operations) |
| Five operational questions | §1 operational blindness; §4 W2 purpose |
| Attention Rail, SLA Risk before breach | §4 W2 signature behaviors; §9 |
| IHC Return Queue | §4 W2, §7 the IHC re-review loop |
| Cytology Batch Review | §3 Cytotechnologist; §7 batch cytology screening |
| Frozen Sections | §7 frozen section (intraoperative) |
| Queue intelligence (queues explain) | §2 reduce cognitive load; §4 W2 |
| Operational AI (assistive, degrades) | §2, §6 AI assists; ADR-008 (operational analogue) |
| No false empty state; experience budgets | §4, §10 |
| Integration Health (HL7 v2 / FHIR / DICOM) | §8 LIS coexistence; §11 Phase 2A |
| Collaboration with Sign-Out / Quality / Admin / reporting | §4 workspaces; §8 |
| Helix-only implementation | §Engineering constraints; [../HELIX_v1.0.md](../HELIX_v1.0.md) |

---

## 12. Success metrics (workspace level)

The Operations Workspace succeeds when the lab is more aware and more able to act.

| Metric | Definition | Direction |
|---|---|---|
| Breaches prevented | SLA breaches acted on before they occurred | Increase |
| Time-to-acknowledge | Attention item raised to acknowledged | Decrease |
| Frozen turnaround | Frozen-section order to reported (target ≤ 20 min) | Decrease |
| IHC turnaround | Order to ready-for-re-review | Decrease |
| Queue explanation coverage | Share of queued cases with a stated reason, owner, blocker, and next action | 100% |
| Load-balance variance | Spread of workload across staff | Decrease |
| Instrument/interface uptime | Availability of scanners, stainers, and interfaces | Increase |
| Operational-AI acceptance | Share of AI recommendations accepted, calibrated by outcome | Increase, calibrated |
| Return-to-context integrity | Drill-down returns preserve board state | 100% |

Foundational bars are inherited and non-negotiable: cold start ≤ 2000ms, route content ≤ 400ms /
cue ≤ 200ms, interaction ≤ 100ms; zero silent actions; zero-orange 0px; no false empty state while
loading ([docs/PATHOS_v2.md](PATHOS_v2.md) §10).

---

## Status of this document

This is the implementation contract for the Phase 2A Operations Workspace. On approval,
implementation proceeds module-by-module, each tracing to a section here and to
[docs/PATHOS_v2.md](PATHOS_v2.md), composed from Helix v1.0, verified against the foundational
quality bars, and recorded in [../Roadmap/08_RELEASES.md](../Roadmap/08_RELEASES.md). No feature is
built unless it supports this operational architecture and the approved product architecture.
