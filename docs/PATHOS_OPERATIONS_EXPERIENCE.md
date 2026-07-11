# PathOS — Laboratory Operations Experience Layer

| Field | Value |
|---|---|
| Status | Draft — experience refinement of the approved Operations architecture |
| Current Phase | PathOS Phase 2A (Foundation and adoption) |
| Owner | Founder |
| Dependencies | [docs/PATHOS_OPERATIONS_WORKSPACE.md](PATHOS_OPERATIONS_WORKSPACE.md), [docs/PATHOS_v2.md](PATHOS_v2.md), Helix v1.0 (frozen) |
| Last Updated | 2026-07-10 |
| Priority | P0 |
| Expected Next Milestone | Experience approval → implementation of the Operations Workspace |

The operational architecture is approved. This document refines its **experience**. It does not
change the modules, their contracts, or their relationships
([docs/PATHOS_OPERATIONS_WORKSPACE.md](PATHOS_OPERATIONS_WORKSPACE.md) stands in full). It refines
five things: **hierarchy, naming, prioritization, prediction, and emotional feel** — so the
workspace stops reading as a collection of operational modules and starts reading as a **living
representation of laboratory health**.

No code, no components. Everything consumes Helix v1.0 exactly as frozen
([../HELIX_v1.0.md](../HELIX_v1.0.md)); the aliveness is built from truth and the existing motion
grammar, never from a new visual language.

---

## 1. The shift

A control panel shows you sixteen instruments and asks you to assemble the picture. A living
system *is* the picture, and shows you where it hurts. The approved architecture is correct and
complete as a control panel. This layer turns it into a body.

The reframe, in one sentence: **the laboratory is an organism, the workspace is its vital-signs
monitor, and the sixteen modules are its organs.** A manager should be able to glance at it and
feel, before reading a single number, whether the lab is calm, working hard, straining, or in
distress — the way a clinician reads a patient across the room before looking at the chart.

The discipline that keeps this honest: **the workspace feels alive because it is a continuous,
truthful, forward-leaning reflection of a living system — not because anything is animated to seem
alive.** Every "living" behavior below is real data moving in real time. We do not fake a
heartbeat.

---

## 2. Refined hierarchy — state, vitals, organs

The flat four-layer hierarchy (attention / board / drill / historical) is re-registered into three
health-first registers. Each is a genuine narrowing of attention, from feeling to fact to detail.

### Register 1 — State (the single dominant read)

One thing dominates the top of the workspace: **Lab State** — a single synthesized read of overall
health that sets the emotional register of the entire surface before any number is read.

- **Calm** — all vitals nominal; the lab is humming.
- **Watch** — a vital is drifting; nothing is wrong yet, but something is worth an eye.
- **Strained** — a vital is out of range; pressure is building; action would help.
- **Critical** — a breach is happening or a lifeline is down (a frozen section unclaimed, an
  interface dropped, imminent SLA breaches).

Lab State is not a fifth widget; it is the mood of the room. It is derived from the vitals below,
never entered by hand, and it changes the feel of everything (§7). A manager arriving at their desk
reads it in under a second.

### Register 2 — Vitals (five vital signs of laboratory health)

Beneath State, five vital signs summarize health at a glance. They are the summary layer that the
sixteen modules feed. Each vital is one honest reading with a direction (§6, prediction).

| Vital | What it senses | Fed by (approved modules) |
|---|---|---|
| **Flow** | The rate of work moving through the lab — the heartbeat. When flow slows, something is stuck. | Pipeline / Active Worklist, Specimens Awaiting Action, IHC Return, Cytology Batch |
| **Pressure** | Accumulated load against capacity — backlog building. High pressure is strain. | Workload, Capacity, Staffing |
| **Timeliness** | How much work is within its time budget — running on time, or running hot. | Turnaround Time, SLA Risk |
| **Integrity** | Whether the systems the lab depends on are intact — its perfusion. A dropped interface starves the lab. | Instruments, Integration Health / External Interfaces, AI Utilization |
| **Attention** | What is calling for a human right now, and how loudly. | Attention Rail, Frozen Sections, Quality Alerts |

Five vitals, not sixteen tiles. This is the at-a-glance health read, and it is what most managers
look at most of the time.

### Register 3 — Organs (the modules, on demand)

The sixteen modules are unchanged; they now live *beneath* the vital they serve. A manager who
feels Pressure rising opens Pressure and finds Workload, Capacity, and Staffing — the organs — with
their full approved contracts. Detail is reached by following a vital, not by scanning a grid.
Historical trends remain a deliberate, clearly-marked destination, never mixed with the live body.

**The hierarchy now reads:** feel the State, scan the Vitals, follow a vital to its Organs, drill an
organ to its cases, and a case to its timeline. Each step is a narrowing, and the manager never
loses the body above them.

---

## 3. Naming — a living vocabulary

The names shift from instrument labels to the language of a living system. The rule is not
theatrics; it is truth said in human terms. Each living name keeps a plain functional subtitle so
nothing is lost to a newcomer or an inspector.

Naming principles:

- **Name the feeling, keep the fact.** "Pressure" over "Workload Utilization" — but the subtitle
  still says workload and capacity.
- **Human, not cute.** This is a clinical operations tool. "Flow," "Pressure," "Timeliness,"
  "Integrity," "Attention" are alive and serious. No mascots, no gamified streaks, no exclamation.
- **True, never flattering.** A name must not oversell. "Watch" is watch, not "All good." The lab is
  allowed to look strained, because sometimes it is.
- **Stable and few.** Five vitals and four states — a small, memorable vocabulary a manager
  internalizes in a day.

| Register | Living name | Plain subtitle (kept) |
|---|---|---|
| State | Lab State: Calm / Watch / Strained / Critical | Overall operational health |
| Vital | Flow | Throughput and case movement |
| Vital | Pressure | Workload, capacity, staffing |
| Vital | Timeliness | Turnaround and SLA |
| Vital | Integrity | Instruments, interfaces, AI |
| Vital | Attention | What needs a human now |
| Behavior | Foresight | Predicted state and lead time (§6) |

Module-level names inside a vital stay as approved where managers already know them (SLA Risk, IHC
Return, Frozen Sections). We rename the tops, not every leaf — familiarity is part of trust.

---

## 4. Prioritization — the workspace reorganizes around what matters

A living system does not present all of itself equally at all times; it directs attention to where
it hurts. The workspace's prioritization is therefore **dynamic**, driven by Lab State, within
strict limits so it never thrashes.

- **When Calm,** the biggest thing is Flow — the lab quietly humming, work moving through. Vitals sit
  in a settled, low-contrast arrangement. Nothing shouts. The default resting state is *quiet*, not a
  wall of green; confidence is shown by calm, not by celebration.
- **When Watch,** the drifting vital gains gentle prominence and its Foresight (where it is heading)
  becomes visible. Everything else stays put.
- **When Strained,** the out-of-range vital and its cause rise to the top, with the single action
  that would relieve it (queue intelligence, §5 of the architecture). The rest of the body recedes
  in contrast, not in availability.
- **When Critical,** the critical item — an unclaimed frozen section, a downed interface, imminent
  breaches — dominates, and the workspace quiets everything around it so the one thing that matters is
  unmissable.

**Guardrails on the reflow (so "living" never becomes "restless"):** re-prioritization is gentle and
bounded. Items change prominence through the Helix entrance/exit motion tokens, never by jumping.
The set of vitals and their order are stable; only emphasis and the promoted detail change. A change
in State is a deliberate, legible transition, not a flicker. And it never hijacks the manager's
current task — a rising priority arrives calmly and waits to be chosen (blueprint interruption
handling).

Priority is expressed through the **status and priority domain tokens** — never an invented colour,
never a raw hue. Calm reads as quiet neutral with a confident accent; Watch and Strained read as the
safe warning family; Critical reads as danger, used sparingly so it still means something.

---

## 5. Prediction as anticipation — the lab leans forward

Prediction stops being a module and becomes a *posture*. A living system anticipates; a healthy lab
knows what is coming. **Foresight** is woven through every vital rather than parked in an AI widget.

- **Every vital carries a direction, not just a value.** Flow is not "42 cases/hr"; it is "42 and
  easing." Pressure is "building toward the afternoon." Timeliness is "three cases will breach in the
  next hour unless acted on." The reading and its trajectory are one thing.
- **Lab State is forward-aware.** The lab can be Calm-but-heading-toward-Strained, and it says so.
  This is the difference between a monitor and an early-warning system, and it is the blueprint's
  signature operational behavior — *SLA risk surfaced before breach* ([docs/PATHOS_v2.md](PATHOS_v2.md)
  §4, §9) — generalized to the whole body.
- **Foresight is drawn from the approved Operational AI** ([docs/PATHOS_OPERATIONS_WORKSPACE.md](PATHOS_OPERATIONS_WORKSPACE.md)
  §8): predicted breach, redistribution, bottleneck detection, overload, queue forecast. It is
  assistive, states its basis and confidence, and degrades gracefully — under a degraded AI the vitals
  still read the present truth; only the forward-lean quiets. The lab never lies about the future to
  seem alive.

Anticipation is what makes the workspace feel like it is thinking, not just measuring.

---

## 6. Emotional feel — calm, attentive, urgent

The workspace has an emotional register, and it is set by Lab State. The goal is a surface a manager
trusts: calm enough to work beside all day, honest enough to be believed when it raises its voice.

- **Calm feels quiet and confident.** Low contrast, generous space, steady vitals, subtle real
  movement as work flows through. The lab humming, not performing. A manager should be able to leave
  it in peripheral vision and feel reassured.
- **Watch and Strained feel focused, not anxious.** Contrast tightens around the affected vital;
  Foresight and the clearing action appear; the rest recedes. Attention is directed, not scattered —
  the opposite of an alarm board where everything blinks and nothing is trusted.
- **Critical feels grave and singular.** One thing dominates; the surface goes quiet around it. Gravity
  is created by *stillness and focus*, not by flashing. A critical state that screams is a critical
  state that gets ignored by the third time.

How the feeling is built, honestly:

- **Real motion, from real work.** The heartbeat is genuine: a case entering the pipeline arrives via
  the Helix row-insert entrance; work advancing and releasing is visible movement. The lab looks alive
  because it *is* moving. There is no decorative pulse animation standing in for data.
- **State transitions use the motion grammar.** A shift from Calm to Strained is a legible transition
  on the Helix curves and durations — the room changing mood, not a jump cut. Under
  `prefers-reduced-motion` the transition collapses to the 1ms backstop and **the State, the vitals,
  and their direction remain fully legible** — motion never carries information that the numbers do
  not also carry ([../HELIX_v1.0.md](../HELIX_v1.0.md) §5).
- **Colour carries mood within hard limits.** Calm is quiet neutral with a confident positive accent;
  Watch/Strained use the safe warning family (`--color-warning` `#a16207`, `--status-warning-strong`
  `#854D0E`); Critical uses danger, sparingly. **Zero-orange is absolute** — a health monitor is
  exactly where warm amber tempts a violation; every warm state uses the detector-safe tokens and is
  verified by the pixel detector, not by eye ([docs/PATHOS_v2.md](PATHOS_v2.md) §10;
  [../CLAUDE.md](../CLAUDE.md) zero-orange rule).
- **Silence is a feature.** The lab is quiet when it is well. It does not celebrate normality or fill
  space with reassurance. Confidence is the absence of noise.

Anti-patterns this layer explicitly forbids: a fake heartbeat animation; a wall of green "all good"
tiles; alarm boards where everything is urgent so nothing is; decorative motion that conveys no
truth; warmth achieved with orange.

---

## 7. How aliveness is honestly built

For clarity to implementation, the sources of "living" feel, in priority order:

1. **Continuous truth.** The vitals are the live lab, updated through the lab-scoped realtime
   gateway. Aliveness is, first and last, that the surface is never stale.
2. **A synthesized state that reflects reality.** Lab State is a true function of the vitals; it is
   allowed to look bad. Honesty is what makes calm believable.
3. **Forward lean.** Every reading carries its direction; the lab anticipates.
4. **Real motion.** Movement on the surface is work actually moving, on the Helix grammar, reduced-
   motion-safe.
5. **Dynamic, bounded prioritization.** The body directs attention to where it hurts, gently.
6. **Restraint.** Quiet when well; grave when not; never theatrical.

Aliveness is never sourced from decoration. If a proposed "living" element carries no truth, it is
cut.

---

## 8. Helix consumption (unchanged and reaffirmed)

This layer changes hierarchy, naming, prioritization, prediction, and feel — none of which requires
anything beyond Helix v1.0.

- **State and Vitals** compose from `Card` / `SectionContainer`, `StatCard`, `Gauge`, `Badge` /
  `StatusBadge` (status/priority domain tokens for mood), with `MiniAreaChart` for a vital's direction.
- **Dynamic reflow** uses the Helix entrance/exit and standard motion tokens; no new motion.
- **Mood colour** uses the status/priority/warning/danger domain tokens only; zero-orange verified by
  the pixel detector.
- **Real-time** rides the existing gateway; **feedback** uses `notify` and `GlobalProgress` within the
  experience budgets.
- **No new component, token, duration, or curve is introduced.** Anything that appears to need one is
  recorded in [../Roadmap/05_HELIX_v1_1.md](../Roadmap/05_HELIX_v1_1.md) with evidence, not built by
  bending Helix.

---

## 9. Traceability

| This layer refines | Traces to |
|---|---|
| State + Vitals hierarchy over the module grid | [docs/PATHOS_OPERATIONS_WORKSPACE.md](PATHOS_OPERATIONS_WORKSPACE.md) §3 information hierarchy |
| Vitals fed by the sixteen modules | [docs/PATHOS_OPERATIONS_WORKSPACE.md](PATHOS_OPERATIONS_WORKSPACE.md) §4 (all modules unchanged) |
| Foresight woven through vitals | [docs/PATHOS_OPERATIONS_WORKSPACE.md](PATHOS_OPERATIONS_WORKSPACE.md) §8 Operational AI |
| SLA risk before breach, generalized to Lab State | [docs/PATHOS_v2.md](PATHOS_v2.md) §4, §9 |
| Reduce cognitive load; calm, honest feel | [docs/PATHOS_v2.md](PATHOS_v2.md) §2 design principles |
| Motion grammar, reduced motion, zero-orange, budgets | [../HELIX_v1.0.md](../HELIX_v1.0.md) §5, §8; [docs/PATHOS_v2.md](PATHOS_v2.md) §10 |

This layer conflicts with nothing in the approved architecture; it re-registers its presentation and
sets its emotional register.

---

## 10. Experience success metrics

Beyond the operational metrics ([docs/PATHOS_OPERATIONS_WORKSPACE.md](PATHOS_OPERATIONS_WORKSPACE.md)
§12), the experience succeeds when the workspace reads as a living, trustworthy body.

| Metric | Definition | Direction |
|---|---|---|
| Glance-to-state comprehension | Time to correctly read Lab State on arrival | Decrease (target < 1s) |
| Trust in calm | Share of Calm reads that were genuinely calm (no missed strain) | Increase toward 100% |
| Alarm-fatigue resistance | Share of Attention/Critical items that were genuinely actionable | Increase; low false-alert rate |
| Foresight lead time | Warning delivered before the event it predicts | Increase |
| Peripheral confidence | Manager can leave the workspace in peripheral vision and trust it | Qualitative, tracked |
| Reduced-motion parity | State, vitals, and direction fully legible with motion collapsed | 100% |
| Zero-orange | Pixels violating the detector, across all states | 0 |

Foundational bars are inherited and non-negotiable: cold start ≤ 2000ms, route content ≤ 400ms / cue
≤ 200ms, interaction ≤ 100ms; zero silent actions; no false empty state while loading.

---

## Architectural decision — movement is deferred (recorded after Phase 2A)

Phase 2A shipped three Operations increments to the dashboard — the Lab State → Vitals
hierarchy, truthful data-derived vitals and sparklines, and stable deterministic
prioritization — **without moving a single module**. They measurably improved the surface
while the user kept full spatial memory. That result sets a governing principle.

**Governing principle:** *movement should communicate change, not compensate for poor
hierarchy.* Users must be allowed to build spatial memory; the layout is a map they learn.

**Priority evolves in this fixed order**, and each stage must be exhausted before the next
is considered:

1. **State** — synthesize the truthful overall read (Lab State).
2. **Emphasis** — increase prominence where backed by real state, in place.
3. **Ordering within a module** — deterministic, stable ordering inside an existing list.
4. **Cross-section movement** — moving a module between sections. Only if proven necessary.

**Cross-section module reflow (stage 4) is deferred.** It will not be attempted until the
Operations Workspace is functionally complete and can be evaluated as a whole. Reflow is not
a goal; it is a last resort that must earn its place by evidence that stages 1–3 were
insufficient. Until then, dynamic prioritization stays at stages 1–3, and every major module
keeps its location.

This decision supersedes the earlier framing of §2's "dynamic, bounded prioritization" only
in sequencing: the reflow described there remains a possible future, gated behind functional
completeness and evidence, not a Phase 2 step.

## Status of this document

This experience layer refines the approved Operations architecture without altering its module
contracts. On approval, it governs the hierarchy, naming, prioritization, prediction, and feel of the
Operations Workspace as it is implemented — composed from Helix v1.0, verified against the
foundational quality bars and the zero-orange detector, and recorded in
[../Roadmap/08_RELEASES.md](../Roadmap/08_RELEASES.md).
