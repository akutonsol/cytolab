# Osieri — Operational AI: feasibility audit (no new module built)

| Field | Value |
|---|---|
| Status | Audit complete — no new module built (deterministic insight is real but already surfaced; AI-grade prediction is not trustworthy) |
| Current Phase | Osieri Phase 2A (Operations) |
| Owner | Founder |
| Dependencies | [docs/OSIERI_OPERATIONS_WORKSPACE.md](OSIERI_OPERATIONS_WORKSPACE.md) §8; existing operations endpoints |
| Last Updated | 2026-07-11 |
| Priority | P1 |
| Expected Next Milestone | Product decision on capacity / qualification / history data that would unlock genuine forecasting |

Read-only feasibility audit for "Operational AI", using the same methodology as the prior
Operations audits. The decisive finding: the recommendations Osieri can produce truthfully are
**deterministic operational insight (rules over recorded state), not AI** — and **every one of
them is already surfaced** by an existing surface. The genuinely predictive candidates (queue
forecast, throughput-decline confidence) are not trustworthy from the current single-lab, coarse
history, and two candidates (staffing pressure, specific reassignment) lack the required data
entirely. Per "do not call deterministic thresholds AI" and "prefer no recommendation over a weak
or misleading one", **no new module was built**. No code or schema was changed.

---

## 1. Classification of all twelve candidates

| # | Candidate | Classification | Kind (per the required separation) | Explanatory / Predictive | Already surfaced? |
|---|---|---|---|---|---|
| 1 | SLA breach "prediction" | deterministically derivable | rules-based insight | explanatory (a deterministic countdown, not a forecast) | Yes — `/operations` SLA risk |
| 2 | Workload imbalance | deterministically derivable | rules-based insight | explanatory | Yes — `/workload` (per-user `assignedTotal`) |
| 3 | Unassigned high-priority work | directly observable | rules-based insight | explanatory | Yes — `/operations` attention rail / SLA risk |
| 4 | Queue pressure | deterministically derivable | rules-based insight | explanatory | Yes — `/operations` pipeline stages |
| 5 | Throughput decline | statistically inferable (weak) | forecast / trend | predictive | Partially — dashboard Flow foresight |
| 6 | Turnaround deterioration | deterministically derivable (coarse) | rules-based insight | explanatory | Partially — dashboard Timeliness foresight |
| 7 | Integration degradation | directly observable | rules-based insight | explanatory | Yes — `/operations/integration-health` |
| 8 | Open quality alerts | directly observable | rules-based insight | explanatory | Yes — `/operations/quality-alerts` |
| 9 | Staffing pressure | **insufficient evidence** | — | — | No — unbuildable (see below) |
| 10 | Bottleneck detection | deterministically derivable (backlog, not causal) | rules-based insight | explanatory | Partially — `/operations` pipeline |
| 11 | Queue forecast | statistically inferable but **insufficient history** | forecast | predictive | No — untrustworthy |
| 12 | Suggested reassignment | **prohibited inference** | recommendation | — | No — risky (see below) |

## 2. Evidence per candidate (source · window · calculation · confidence · false-positive risk)

- **1 SLA breach** — `Record` age + `status` vs `Lab.targetTatDays` (hours). Time-to-breach =
  threshold − age. Deterministic; high confidence; low FP. This is a countdown, not a prediction;
  it is exactly what `operations.slaRisk()` already computes.
- **2 Workload imbalance** — `Record.assignedToId` open-case counts per user (30d/open window;
  `workload.service` already computes `assignedTotal`). Deterministic; medium confidence (case
  count ≠ effort — no complexity weighting); medium FP.
- **3 Unassigned high-priority** — `Record` where `urgent = true AND assignedToId = null` and open.
  Directly observable; high confidence; low FP.
- **4 Queue pressure** — in-flight `Record` counts per stage (`operations.overview()` pipeline).
  Deterministic; high confidence; low FP.
- **5 Throughput decline** — `analytics.home` `throughput.series` (42 daily buckets, single lab).
  Recent-vs-baseline is computable but daily counts are noisy with no seasonality model → low
  confidence, **high FP**. Predictive, and weak. Prefer not to assert "decline".
- **6 Turnaround deterioration** — `analytics` `cur` (30d) vs `prev` (30–60d) `avgTat`/`onTime`
  (two periods only; no daily TAT series). Deterministic period-over-period but coarse → low–medium
  confidence, medium FP.
- **7 Integration degradation** — `operations.integrationHealth()` `overall = degraded`, from real
  `FHIRTransmission` / connection-test signals. Directly observable; high confidence; low FP.
- **8 Open quality alerts** — `operations.qualityAlerts()` open count (QCFailureAlert +
  discordance). Directly observable; high confidence; low FP.
- **9 Staffing pressure** — presence is observable (`ClockEvent`, `ShiftAssignment`), but "pressure"
  needs demand-vs-**capacity**, and **no capacity model exists** (no `maxCases`/`caseload`/
  `throughputTarget`). Computing it would invent capacity — forbidden. **Insufficient evidence.**
- **10 Bottleneck detection** — the pipeline stage with the largest / oldest backlog (`overview()`
  counts + `oldestAgeHours`). Deterministic as *where* the backlog is; it is not proof of *cause*
  (backlog ≠ bottleneck). Medium confidence, medium FP. Explanatory only.
- **11 Queue forecast** — would forecast future inflow from `throughput.series`. Single noisy daily
  series, no seasonality, one lab → **insufficient history** for a trustworthy forecast; high FP.
  Predictive. Prefer none.
- **12 Suggested reassignment** — the imbalance (2) is derivable, but a *specific* reassignment
  needs subspecialty / qualification matching, and **no such model exists** (no `subspecialty` /
  `qualification` / `canReview`). Suggesting a target could route a case to an unqualified reader →
  **prohibited inference**. Surface imbalance as insight, never a specific reassignment action.

## 3. The required separation, applied

- **Rules-based operational insight (deterministic — NOT "AI"):** 1, 2, 3, 4, 6, 7, 8, 10. All are
  explanatory statements over recorded state.
- **Forecast (statistical, predictive):** 5, 11 — both weak on the current data; not trustworthy.
- **Recommendation (suggested action, human-approved):** 12 — unsupported without qualification data.
- **Automated decision:** none. None proposed; none permitted.

## 4. Decision

**Do not build a new Operational AI / Operational Insights module.** Two reasons, both grounded in
the audit:

1. **What is supported is deterministic, not AI, and is already surfaced.** Every buildable insight
   (SLA risk, workload imbalance, unassigned urgent, queue pressure, integration degradation, open
   quality alerts, backlog bottleneck) is already visible on `/operations`, `/operations/
   integration-health`, `/operations/quality-alerts`, `/workload`, and the dashboard Lab State /
   Vitals. A new module would re-aggregate already-surfaced signals — and labelling that
   aggregation "Operational AI" would mislabel deterministic rules as AI, which the directive
   forbids.
2. **What would justify an "AI" module is not trustworthy.** The only genuinely predictive
   candidates (throughput decline, queue forecast) rest on a single noisy daily series with no
   seasonality; staffing pressure needs capacity data that does not exist; specific reassignment
   needs qualification data that does not exist. Prefer no recommendation over a weak or misleading
   one.

So there is no truthful, non-redundant minimum version to build today. The honest deliverable is
this audit.

## 5. Exact data required to unlock each unsupported capability (future, not implemented)

- **Trustworthy forecasting (5, 11):** longer, seasonality-aware history at daily (or finer)
  granularity for both throughput and TAT — not the current 42-day single-series / two-period TAT.
  Until then, only deterministic recent-vs-baseline trend is honest, and it is already shown.
- **Staffing pressure (9):** a recorded **capacity** signal per role/person (e.g. a target caseload
  or throughput), joined to live presence (`ClockEvent`) and demand (in-flight/urgent counts).
  Without capacity, only presence is observable, not pressure.
- **Suggested reassignment (12):** a recorded **subspecialty / qualification** on users and cases,
  so a suggested target can be proven competent. Without it, only the imbalance is honest.
- **Bottleneck causation (10):** a structured "why blocked" dependency per case (the
  [AncillaryOrder](OSIERI_IHC_RETURN_QUEUE_AUDIT.md) proposal), to move from "where the backlog is"
  to "why it is stuck".

Each is a separately-approved data-model evolution, not a Phase 2A addition. Osieri remains an
intelligence layer.

## 6. Verification note

Nothing to typecheck, build, or pixel-verify: **no code was written**. That is the correct outcome.
Do not call deterministic thresholds AI; prefer no recommendation over a weak or misleading one;
unknown and insufficient-history are acceptable answers.
