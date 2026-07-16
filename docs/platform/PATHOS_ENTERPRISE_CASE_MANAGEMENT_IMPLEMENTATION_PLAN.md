# PATHOS — Enterprise Case Management Platform (Phase 5)
### Architecture Audit → Owner-First Orchestration Design → Implementation Plan (E0, binding)

| Field | Value |
|---|---|
| Status | **IMPLEMENTED & CERTIFIED (E2A–E2E).** Release: **CERTIFIED WITH DOCUMENTED NON-BLOCKING DEBT** — production-ready behind existing RBAC. §1–§16 below are the **original E0 plan, retained as history**; the authoritative implemented state is **[Final Status — E2 Enterprise Aggregate Certification](#final-status--e2-enterprise-aggregate-certification)** at the end of this document. |
| Phase | Phase 5 (Enterprise operational layer above all owner workspaces) |
| Precursor | Approved Phase 5 architecture audit (this repository) |
| Dependencies | [DECISION_RECORDS.md](architecture/DECISION_RECORDS.md) (D-001…D-020), [ARCHITECTURE_LEDGER §19](architecture/ARCHITECTURE_LEDGER.md), Phase 3A Diagnostic Case (frozen), Phase 4.1A Ancillary (frozen), Phase 4.2 Screening Batch (frozen) |
| Governing precedent | Diagnostic Case (A1–A12) — owner-first composition, frozen Section contract, per-source failure isolation, allowlisted read-only projection |
| Last Updated | 2026-07-16 (E2F documentation closeout — records implemented + certified reality) |

> **Constitutional preservation.** Nothing in this plan modifies D-001…D-020, owner-first architecture, aggregate ownership, the truthfulness doctrine, the frozen Diagnostic Case / Ancillary / Screening / Sign-Out baselines, the permission model, or owner boundaries. Enterprise Case Management is a **read-only orchestration layer** that **projects** owner-recorded state; it owns no persistence, no lifecycle, no status, no assignment authority.

> **⚠️ Historical-plan notice (E2F, 2026-07-16).** Sections **§1–§16 below are the original E0 plan**, kept for provenance. Several plan-era queue labels were **corrected during implementation** — `Completed`→**Signed Out**, `Quality Hold`→**On Hold** + **Open QC Failures**, `Escalated`→**Open Escalations**, `Returned`→**retired**, `Team Work`→**deferred to E4**, and `Archived`→**deferred** (no owner-recorded archived state). For the authoritative **implemented + certified** reality — final 13-queue taxonomy, owner seams, commit ledger, six-case Overdue matrix, and release classification — read **[Final Status — E2 Enterprise Aggregate Certification](#final-status--e2-enterprise-aggregate-certification)** at the end. Where §1–§16 and Final Status disagree, **Final Status governs.**

---

## 1. Executive architecture

Enterprise Case Management is the **operational operating system** above every clinical owner. It answers "what needs attention, by whom, and where is it in the pipeline" — as a set of **named queues** that are **projections over owner-recorded `RecordStatus` + `Record.assignedToId` + narrow cross-owner "open-work" reads**. It orchestrates; it never re-implements owners.

The delivery vehicle is a new read-only aggregate — **`EnterpriseWorklistService`** — modelled directly on the Diagnostic Case pattern: owner-first composition, no direct Prisma, explicit allowlists, per-source failure isolation, deterministic bounded reads. It composes existing owner services (chiefly `RecordsService`) and a small set of narrow owner reads added in E1. **It explicitly does not extend the existing `operations` module** (a direct-Prisma analytics layer) — that anti-pattern is quarantined, not propagated.

**Core thesis:** every enterprise "queue" is a **filter or projection**, never a new lifecycle state. ~8 queues are pure `RecordsService` projections over a single read; the remainder require narrow cross-owner signals. No queue invents status, assignment, routing, or workflow.

## 2. Goals

- A unified **Enterprise Command Center**: queue rail with truthful counts + drill-down worklist + owner handoffs.
- **Owner-first**: compose `RecordsService` and other exported owners; zero direct Prisma in the aggregate.
- **Truthful projections**: queue membership derived only from owner-recorded state; no synthesized lifecycle/urgency.
- **Manager visibility + owner-delegated assignment** (calls `RecordsService.assign`, never duplicates it).
- **Reuse the substrate**: `records/my-queue`, `workload/unassigned`, `workload/summary`, per-owner queues, `operations`/`analytics`/`tat` dashboards — link, do not duplicate.
- **Isolated, reversible checkpoints** with no schema/permission/seed change.

## 3. Non-goals

- **Not** a clinical workspace, workflow engine, router, or scheduler (D-014).
- **Not** an owner of status, assignment, routing, or lifecycle — it reads owner-recorded values.
- **No** new persistence, materialized read model, cached queue table, or event stream.
- **No** direct Prisma; **no** extension of the `operations` direct-Prisma layer.
- **No** new permission codes; **no** role-name authorization; **no** Sign-Out modification.
- **No** duplication of owner assignment, lifecycle, permissions, or per-owner queues.
- **No** invented queue status, ownership, routing, or workflow.

## 4. Aggregate boundary

**`EnterpriseWorklistService`** (new module `enterprise-worklist`):
- **Composes** (read-only): `RecordsService` (status/assignment projection — the primary substrate), and narrow open-work reads from `EscalationService`, `AncillaryOrdersService`, `CorrelationService`, `QcService`, `ResultSheetsService`, `TatService` (post-E1), `WorkloadService` (post-E1 export), `RecallService`, `ChangeRequestsService`.
- **Produces**: queue **counts** (rail), paginated **projections** (drill-down), summary KPIs.
- **Never**: writes any table; touches Prisma; owns status/assignment/lifecycle; modifies an owner; invents a queue state.
- **Assignment**: exposed in the UI as an action that calls the **owner** routes (`records/:id/assign`, `records/bulk-assign`) — delegation, not duplication.

## 5. Owner inventory (orchestration-relevant)

| Owner | Service (exported?) | Mutation-free reads used | Authority | Perm |
|---|---|---|---|---|
| **Records** | `RecordsService` ✅ | `list`/projection (status+assignment), `myQueue(userId)`, `findOne` | **Record status + assignment owner** | `record:view/change` |
| **Workload** | `WorkloadService` ❌ (export in E1) | `summary`, `unassigned`, `targets` | reads Records | `record:view` |
| **Escalation** | `EscalationService` ✅ | open escalations (lab/record) | escalation lifecycle | `record:view` |
| **Ancillary** | `AncillaryOrdersService` ✅ | `hasBlockingOpenOrders(recordId)` (+ E1 lab-scoped read) | order lifecycle | `record:view` |
| **Correlation** | `CorrelationService` ✅ | `list` (+ E1 open-record signal) | correlation lifecycle | `record:view` |
| **QC** | `QcService` ✅ | `alerts`/`list` (+ E1 open-record signal) | QC lifecycle | `record:view` |
| **Result Sheets** | `ResultSheetsService` ✅ | `metaByRecord` (authorized state) | authorization (`resultsheet:authorize`) | `resultsheet:view` |
| **TAT** | `TatService` ❌ (export/overdue read in E1) | overdue predicate | TAT config owner | `record:view` |
| **Recall** | `RecallService` ✅ | `list`/`summary` | recall lifecycle | `record:view` |
| **Change Requests** | `ChangeRequestsService` ✅ | open list (+ E1 open-record signal) | change-request lifecycle | `record:view` |
| **Sign-Out** | (FROZEN) | — | authorization workspace | — (handoff target only) |
| **Users/Roles** | (identity) | assignee/team identity | RBAC | user/role perms |

## 6. Queue taxonomy

Every queue is a **projection/filter over owner-recorded state**. Three categories:

### 6a. Record projections (pure `RecordStatus` + `assignedToId`; one `RecordsService` read)
| Queue | Rule (owner-recorded) | Why here |
|---|---|---|
| **My Work** | `assignedToId = me` ∧ status ∈ OPEN_ASSIGNABLE | directly from Record assignment (owner); `RecordsService.myQueue` exists |
| **Team Work** | `assignedToId ∈ team` ∧ status ∈ OPEN | Record assignment + team membership; one filtered read |
| **Unassigned** | `assignedToId = null` ∧ status ∈ OPEN | Record assignment; `workload/unassigned` exists |
| **Pending Review** | `status ∈ {Completed, Resulted}` | pure `RecordStatus` value |
| **Awaiting Sign-Out** | `status = Resulted` (result sheet unauthorized) | `RecordStatus` value (owner-recorded) |
| **Completed** | `status = Approved` | `RecordStatus` value |
| **Archived** | `status ∈ {Billed, Paid, Disabled}` | `RecordStatus` value |
**Why this category:** all derivable from a single `RecordsService` projection over `Record.status`/`assignedToId`; no cross-owner dependency; cheapest and always available under `record:view`.

### 6b. Cross-owner projections (a per-owner open-work signal intersected with records)
| Queue | Signal owner | Rule |
|---|---|---|
| **Escalated** | Escalation | record has an **open** `EscalationRecord` |
| **Awaiting Ancillary** | Ancillary | record has an **open** `AncillaryOrder` (Ordered/InProcess) |
| **Awaiting Correlation** | Correlation / Recall | record/patient has a **pending** correlation or recall |
| **Quality Hold** | QC / Record | `status = OnHold` ∨ record has an **open** QC alert |
| **Returned** | Change Requests | record has an **open** change request |
**Why this category:** the membership predicate lives in **another owner's** data; the aggregate must **read that owner** (not Prisma). Several require **new narrow owner reads** (E1 gaps).

### 6c. Operational filters (computed overlays applied on top of 6a/6b, not base queues)
| Filter | Rule | Why here |
|---|---|---|
| **Overdue** | TAT breach = `specimenDate + labTargetTat < now` (lab-config-driven) | a **computed overlay** (from `TatService` config), applied as a modifier to any base queue; not an owner-recorded status |
| **Urgent** | `Record.urgent = true` | recorded flag overlay |
**Why this category:** these are **filters/overlays** (derived or flag-based), applied on top of a base queue; they are not standalone lifecycle states and must be **labeled as derived** (e.g., "Overdue per lab TAT config"), never as clinical urgency.

> **Truthfulness note:** queues are **overlapping filters** — a single record can appear in several (e.g., My Work ∧ Overdue ∧ Awaiting Ancillary). A record has exactly **one** owner `status`; queue membership is a view, not a state.

## 7. Aggregate API (exact contracts)

All read-only, `record:view`, lab-scoped by tenancy, deterministic, bounded.

### `GET /enterprise/summary`
Command-center header KPIs (counts only).
```jsonc
{
  "asOf": "ISO",
  "openTotal": 0,           // records in OPEN_ASSIGNABLE
  "myWork": 0,              // assigned to caller, open
  "unassigned": 0,
  "pendingReview": 0,
  "awaitingSignOut": 0,
  "escalated": 0,
  "overdue": 0,             // TAT-breach overlay (labeled derived)
  "qualityHold": 0
}
```

### `GET /enterprise/queues`
The queue rail — all queues with truthful counts + category.
```jsonc
{
  "asOf": "ISO",
  "queues": [
    { "key": "my-work", "label": "My Work", "category": "record-projection", "count": 0, "truncated": false },
    { "key": "unassigned", "label": "Unassigned", "category": "record-projection", "count": 0, "truncated": false },
    { "key": "awaiting-ancillary", "label": "Awaiting Ancillary", "category": "cross-owner", "count": 0, "truncated": false },
    { "key": "overdue", "label": "Overdue", "category": "operational-filter", "count": 0, "truncated": false }
    // …one entry per defined queue; forbidden cross-owner signals reported via `unavailable`
  ],
  "unavailable": [ { "key": "quality-hold", "reason": "…" } ]  // sources that were forbidden/errored
}
```

### `GET /enterprise/queues/:queue?page&pageSize&assignedToId&formType&urgent`
Paginated drill-down for one queue (allowlisted record metadata + owner handoff).
```jsonc
{
  "queue": "my-work",
  "items": [
    {
      "id": "…", "identifier": "…", "labNumber": "…", "formType": "…",
      "status": "Resulted",                 // owner-recorded value, verbatim
      "urgent": false,
      "specimenDate": "ISO|null", "createdAt": "ISO", "statusChangedAt": "ISO|null",
      "assignedToId": "…|null", "assignedTo": "Name|null",  // owner-returned display only
      "overdue": false,                     // derived overlay flag (labeled)
      "signals": { "openEscalation": false, "openAncillary": false, "qcHold": false },  // presence booleans only
      "ownerPath": "/diagnostic-case/…"     // handoff (Diagnostic Case / Sign-Out)
    }
  ],
  "total": 0, "cap": 100, "truncated": false, "page": 1, "pageSize": 50
}
```
**Excluded from every projection:** clinical/report/result content, diagnosis, Bethesda categories, patient PHI beyond the record identifiers the record list already exposes, notes/free text, tokens, signatures. **No owner-DTO spread** — explicit mappers only.

## 8. Owner read inventory (per queue)

| Queue | Owner | Read | Perm | Failure isolation | Ordering | Cap | Allowlist |
|---|---|---|---|---|---|---|---|
| My Work | Records | `myQueue(userId)` / projection | `record:view` | own boundary | TAT-priority (owner) then createdAt | 100 | record metadata |
| Team Work | Records (+Workload) | projection `assignedToId∈team` | `record:view` | own | statusChangedAt desc | 100 | record metadata |
| Unassigned | Records/Workload | `unassigned` projection | `record:view` | own | oldest first | 100 | record metadata |
| Pending Review | Records | projection `status∈{Completed,Resulted}` | `record:view` | own | statusChangedAt desc | 100 | record metadata |
| Awaiting Sign-Out | Records (+ResultSheets) | projection `status=Resulted` | `record:view`/`resultsheet:view` | own; RS-signal isolated | statusChangedAt desc | 100 | record metadata |
| Completed / Archived | Records | projection by status | `record:view` | own | statusChangedAt desc | 100 | record metadata |
| Escalated | Escalation | open-record signal (E1) | `record:view` | isolated | createdAt desc | 100 | record + `openEscalation` bool |
| Awaiting Ancillary | Ancillary | lab-scoped open-order record set (E1) | `record:view` | isolated | createdAt desc | 100 | record + `openAncillary` bool |
| Awaiting Correlation | Correlation/Recall | open-record signal (E1) | `record:view` | isolated | createdAt desc | 100 | record + bool |
| Quality Hold | QC/Records | open QC alert / `status=OnHold` (E1) | `record:view` | isolated | statusChangedAt desc | 100 | record + `qcHold` bool |
| Returned | Change Requests | open-record signal (E1) | `record:view` | isolated | createdAt desc | 100 | record + bool |
| Overdue (overlay) | TAT + Records | breach predicate (E1) | `record:view` | isolated | breach age desc | 100 | record + `overdue` bool |

## 9. Owner-read gaps (each an isolated E1 sub-checkpoint)

Owner-side, additive, mutation-free, no schema/permission change; each its own commit:

- **E1a — Export `WorkloadService`** (leaf → exported) so `summary`/`unassigned`/`targets` are composable owner-first.
- **E1b — `RecordsService` orchestration projection**: a public, allowlisted, lab-scoped read returning record metadata filtered by `status ∈ set` + `assignedToId` (+ team) with counts (the private `list` exists; expose a narrow public method or confirm a reusable public one). *No behavior change to existing record endpoints.*
- **E1c — Ancillary lab-scoped open-work read**: `AncillaryOrdersService.recordIdsWithOpenOrders()` (or a count) — only `hasBlockingOpenOrders(recordId)` exists today. (Awaiting Ancillary)
- **E1d — TAT overdue read**: `TatService` overdue predicate / lab-scoped breach record-id set (+ export). (Overdue overlay)
- **E1e — QC open-alert signal**: `QcService` record-ids with open alerts. (Quality Hold)
- **E1f — Correlation/Recall pending signal**: open-record ids. (Awaiting Correlation)
- **E1g — Change-request open signal**: open-record ids. (Returned)
- **E1h — Escalation open signal**: confirm `EscalationService.list` covers lab-scoped open-record ids; add a narrow read only if the existing list would be misused.

Each gap read must be: record-scoped or lab-scoped, mutation-free, deterministic, narrowly allowlisted (record-ids/booleans/counts only), and free of cross-owner writes.

## 10. UI architecture

- **Enterprise Command Center** (`/command-center` or `/worklist`): a **queue rail** (left) with the 13 queue chips + counts (from `GET /enterprise/queues`), a **summary header** (KPIs from `GET /enterprise/summary`), and a **worklist table** (drill-down from `GET /enterprise/queues/:queue`) with filters (formType, urgent, assignee). Rows drill through to **Diagnostic Case** / **Sign-Out** via `ownerPath`. Helix primitives, five-state, zero-orange, responsive.
- **Manager / Team view**: team load (`workload/summary`), unassigned, capacity/targets, and **assignment** (single + bulk) that **calls the owner** routes (`records/:id/assign`, `records/bulk-assign`) — owner-authoritative, no duplicate assignment logic.
- **Assignment delegation**: the UI never assigns locally; it invokes the RecordsService owner endpoints and re-reads the projection.
- **Dashboard links**: link out to existing `operations`, `analytics`, `tat` dashboards for capacity/SLA — no duplication.

## 11. Permissions

- **Reuse only existing codes**: `record:view` (all reads), `record:change` (owner-delegated assignment), `resultsheet:view` (Awaiting-Sign-Out enrichment, independent isolation).
- **No new permission codes** (`worklist:*`/`enterprise:*` are not created; a dedicated gate would be a separate seed checkpoint, out of Phase 5 MVP scope).
- **No role-name authorization.** Team membership is derived from existing user/role data, not hard-coded roles.
- Cross-owner signals stay behind their **own** gates; a forbidden signal degrades only that queue (reported in `unavailable`), never the whole worklist.

## 12. Truthfulness rules

- **Queues are projections, never lifecycle.** Membership is a *view* over owner-recorded `Record.status`/`assignedToId` + owner open-work reads. The aggregate **never** writes or invents a status.
- **Never owner replacement.** Status transitions, assignment, authorization, escalation, ordering, QC — all remain their owners'. The worklist reads and hands off.
- **Overdue is derived, labeled.** "Overdue per lab TAT configuration," never a clinical-urgency or safety claim.
- **Counts are truthful and bounded** (`total`/`cap`/`truncated`); never imply completeness.
- **Overlapping membership is honest**: a record may appear in multiple queues; it has exactly one owner status.
- **No inference** of readiness, quality, priority, risk, accountability, or sign-out-safety beyond recorded values.

## 13. Failure semantics

Per-queue / per-source independent boundaries, following the frozen Section precedence:
`recorded evidence → ready` · `else technical failure → error` · `else access restriction → forbidden` · `else accessible + empty → empty`.
- The **record-projection** substrate (RecordsService) failing degrades the base queues to `error`; cross-owner **signal** failures degrade **only** their queue and are reported in `unavailable[]` — they never suppress the record projections or sibling queues.
- Retry offered on **technical error** only, per queue.
- A forbidden cross-owner signal (e.g., no `resultsheet:view`) yields that queue `forbidden`/omitted-with-reason, never silently `empty`.

## 14. Performance strategy

- **One primary read** (`RecordsService` projection) serves the 7 record-projection queues; counts derived in-memory by status/assignment.
- **Cross-owner signals** loaded in **parallel** (independent owner reads), each capped; joined to records by id set.
- **Counts vs items** separated: `GET /enterprise/queues` computes bounded counts; `:queue` paginates items on demand (no eager full-list loads).
- **No N+1**: signals are set-based (record-id sets/counts), not per-record owner calls.
- **Caps**: per-queue `cap` (default 100) with truthful `truncated`; summary counts bounded and disclosed.
- **No caching/materialization** in MVP (owner-first, live reads); a future read-model is a separate, explicitly-approved optimization.

## 15. Rollback strategy

Per-checkpoint, additive, forward-independent:
- **E1** owner reads/exports: each isolated commit; additive (no change to existing endpoint behavior); revert individually.
- **E2** aggregate: remove the `enterprise-worklist` module + `app.module` registration.
- **E3/E4** UI: revert routes/components + nav.
- **No schema/permission/seed/DB change** anywhere in Phase 5; the aggregate owns no persistence, so reverting leaves every owner untouched. Reverse-order revert (E5→E1) removes Phase 5 cleanly.

## 16. Checkpoint roadmap

MVP = **E1 + E2 + E3**.

| CP | Title | Scope | Artifact | Isolation | Rollback |
|---|---|---|---|---|---|
| **E0** | This plan | audit + binding plan | this doc | doc-only (D-020) | delete doc |
| **E1** | Owner-read gap closure | export `WorkloadService`; add narrow lab/record-scoped open-work reads (records projection, ancillary, TAT overdue, QC, correlation/recall, change-request, escalation) — **one isolated commit per owner** | per-owner service edits | additive, mutation-free, no schema/permission change | revert each owner read/export |
| **E2** | Enterprise Case Management aggregate | `enterprise-worklist` module/controller/service/DTOs: `GET /enterprise/{summary,queues,queues/:queue}`; owner-composed; **no Prisma**; allowlisted; per-source failure isolation; `record:view` | new module | orchestration only (D-002/D-003/D-004/D-019) | remove module + `app.module` reg |
| **E3** | Enterprise Command Center UI | `/command-center` route: queue rail + summary + worklist drill-down + owner handoffs; Helix, five-state, zero-orange, responsive; behind existing nav gate | `apps/web` | feature-only; primitives from `@/components/ui` | revert routes/components + nav |
| **E4** | Manager / Assignment | team load + single/bulk assignment **delegating to `RecordsService.assign`** (owner routes) | `apps/web` (+ reuse owner endpoints) | no duplicate assignment authority (D-002) | revert view |
| **E5** | Final Certification | read-only certification (Phase-3A/4.2 pattern) | report | read-only | n/a |

### Per-checkpoint verification checklist
- `cd apps/api && npx tsc --noEmit` clean; `nest build` clean; `node dist/main.js` boots; DI resolves; routes map.
- **Owner-integrity**: `EnterpriseWorklistService` performs **no** `prisma.*`; composes owner services only; no owner mutation; no status/assignment write.
- **Truthfulness**: every queue maps to an owner-recorded value or owner open-work read; overdue labeled derived; counts bounded/`truncated`.
- **Failure isolation**: cross-owner signal failure → that queue only (`unavailable[]`); base projections unaffected.
- **Allowlist leak-proof**: no clinical/report/result/PHI/notes/token content in any projection.
- **Permissions**: `record:view`/`record:change`/`resultsheet:view` only; no new codes; forbidden ≠ empty.
- **Assignment**: E4 calls owner routes; `Record.assignedToId` mutated only by `RecordsService`.
- Web: `tsc`/`next build` clean; one h1; labeled controls; zero-orange; responsive at 390/768/1024/1440/1920; owner handoffs (no inline lifecycle).
- Hygiene: no test rows left; temporary harnesses removed; unrelated dirty files untouched; staging surgical.

### Risks & mitigations
| Risk | Mitigation |
|---|---|
| Copying `operations` direct-Prisma | E2 composes owners only; `operations` left as-is, not extended |
| Owner-read gaps | E1 closes them as isolated, additive owner commits before E2 |
| Double-counting across overlapping queues | queues are overlapping filters by design; one owner status per record; documented |
| Inventing lifecycle/urgency | queues are projections; overdue labeled derived; no status writes |
| Assignment duplication | E4 delegates to `RecordsService.assign` |
| Performance fan-out | one primary record read + parallel capped set-based signals |

---

## Historical E0 closeout

> *(Original E0 sign-off, retained verbatim for provenance.)* No code, schema, migration, API, service, controller, DTO, permission, event, UI, or test was created **at E0**. That document was the only E0 artifact and was left uncommitted pending approval. **This condition no longer holds** — E1–E2 were subsequently approved, implemented, and certified; see Final Status below.

---

## Final Status — E2 Enterprise Aggregate Certification

> **Authoritative current-state record (E2F, 2026-07-16).** Supersedes the plan-era taxonomy/status in §1–§16 wherever they differ. Records the implemented + certified E2 Enterprise Case Management aggregate. No application code, schema, migration, permission, seed, UI, or test was changed by this documentation checkpoint.

### Status
| Field | Value |
|---|---|
| Phase 5 E2 — Enterprise Case Management Aggregate | **CERTIFIED WITH DOCUMENTED NON-BLOCKING DEBT** |
| Release blockers | **None** |
| Release posture | **Production-ready behind existing RBAC** |
| Permission | `record:view` for all aggregate reads |
| Architecture | owner-first · read-only · tenant-scoped · failure-isolated · exact-count-safe · pagination-safe · **no direct Prisma** · **no owner mutation** |
| E3 (Command Center UI) | **Implemented & certified (E3A–E3C)** — see [E3 — Enterprise Command Center](#e3--enterprise-command-center-implementation--certification) |
| E4 (Manager / Assignment) | **Not started** |

Certification (E2E) result: **PASS WITH DOCUMENTED NON-BLOCKING DEBT** — certification only, **no implementation commit, no files changed**.

### Final queue taxonomy (frozen — 13 queues, exact order)
| # | Key | Category | Membership (owner-recorded) |
|---|---|---|---|
| 1 | `my-work` | record-projection | `assignedToId = authenticated caller userId` ∧ `status ∈ RecordsService.OPEN_ASSIGNABLE` |
| 2 | `unassigned` | record-projection | `assignedToId = null` ∧ `status ∈ OPEN_ASSIGNABLE` |
| 3 | `pending-review` | record-projection | `RecordStatus.Completed` |
| 4 | `awaiting-sign-out` | record-projection | `RecordStatus.Resulted` |
| 5 | `signed-out` | record-projection | `RecordStatus.Approved` |
| 6 | `archived` | record-projection | **deferred** — no owner-recorded archived state exists |
| 7 | `on-hold` | record-projection | `RecordStatus.OnHold` |
| 8 | `awaiting-ancillary` | cross-owner | `AncillaryOrdersService.recordIdsWithOpenWork()` |
| 9 | `awaiting-correlation` | cross-owner | `CorrelationService.recordIdsAwaitingCorrelation()` |
| 10 | `open-qc-failures` | cross-owner | `QcService.recordIdsWithOpenFailure()` |
| 11 | `open-recalls` | cross-owner | `RecallService.recordIdsWithOpenRecall()` |
| 12 | `open-escalations` | cross-owner | `EscalationService.recordIdsWithOpenEscalation()` |
| 13 | `overdue` | operational-overlay | `TatService.getOverdueSignal()` (recorded Open/Breached `TATAlert`) ∩ Records |

**Queues are projections, not Record statuses; a Record may belong to multiple queues simultaneously.** Composition never mutates any owner lifecycle. `archived` remains deferred (count `null`, data `null`, no owner call) — **never mapped from Billed / Paid / Disabled / Viewed / Failed or any substitute status**.

### Superseded taxonomy corrections (plan-era → final)
| Plan-era (§6/§8) | Final | Reason |
|---|---|---|
| `Completed` (queue label) | **`signed-out`** (`RecordStatus.Approved`) | plan label collided with `RecordStatus.Completed` (which maps to `pending-review`) |
| `Quality Hold` | **`on-hold`** (`RecordStatus.OnHold`) **+** **`open-qc-failures`** (QC signal) | two independent facts, wrongly merged in the plan |
| `Escalated` | **`open-escalations`** | resolved/dismissed escalation history may remain attached; "open" is the truthful state |
| `Returned` | **retired** | it was a client-communication change-request concept, not a Record projection |
| (Change Requests) | **excluded from E2 MVP** | distinct `changerequest:view` authority, unseeded for standard roles |
| (Correlation + Recall merged) | **two separate queues** (`awaiting-correlation`, `open-recalls`) | distinct owners and predicates |
| `Team Work` | **deferred to E4** | needs team resolution + a multi-assignee owner capability |
| `Archived` | **deferred** | no owner-recorded archived state |

### Final owner seams
| Seam | Owns |
|---|---|
| `RecordsService.listForOrchestration({ ids?, statuses?, assignedToId?, unassigned?, page?, pageSize? })` | visible Record metadata, tenant intersection, **exact totals**, pagination, deterministic ordering, allowlist |
| `AncillaryOrdersService.recordIdsWithOpenWork()` | awaiting-ancillary membership |
| `CorrelationService.recordIdsAwaitingCorrelation()` | awaiting-correlation membership |
| `QcService.recordIdsWithOpenFailure()` | open-qc-failures membership |
| `RecallService.recordIdsWithOpenRecall()` | open-recalls membership |
| `EscalationService.recordIdsWithOpenEscalation()` | open-escalations membership |
| `TatService.getOverdueSignal()` → `{ recordIds, activeConfigCount }` | recorded breach conclusions + active-configuration state |

Enterprise Case Management **owns composition only**. Signal owners define cross-owner membership; Records owns everything visible + counted. **Excluded / not reused:** `ChangeRequestsService` (E2 MVP), `WorkloadService` (deferred to E4), Operations direct-Prisma reads, Diagnostic Case / Sign-Out presentation seams. **No `TatService.scan()`, no `Lab.targetTatDays`, no direct Prisma.**

### E1 owner-read checkpoint ledger
| CP | Commit | Deliverable |
|---|---|---|
| E1A | `ed1d7f7d1ab5b4689c6f117899503d94e59c01c3` | Records orchestration projection read |
| E1B | *audit only — no commit* | WorkloadService export **deferred to E4** |
| E1C | `bdbec020d65d12baadf8d1af4d5383d27faf5206` | Ancillary open-work Record signal |
| E1D | `85117ff98a42ef3b95c8ae2c7c4b4607d523fe45` | Recorded TAT overdue signal |
| E1E | `daec2120c84fa33b4ad21034715be7619b511392` | Record-anchored open QC failure signal |
| E1F1 | `27c62866276bc5d02473ee3cd2cea071fe3a0863` | Awaiting-correlation Record signal |
| E1F2 | `6552ca03d5a3e348fab05239967ad1d3710c663e` | Open-recall Record signal |
| E1G | *audit only — no commit* | Change-request signal **deferred / excluded from E2 MVP** |
| E1H | `699d7fcc61187079aa0c5ed9610911893361645d` | Open-escalation Record signal |
| E1I | `d30d60a419ca8d4511589a03a0b7d1378e77a788` | Records candidate-ID (`ids`) filter |

### E2 aggregate checkpoint ledger
| CP | Commit | Deliverable |
|---|---|---|
| E2A | `a7c26b3` | Aggregate contract, module, controller, deferred shell |
| E2B | `f8671fe0f484b37675eb71691d088ddaa453006e` | Six record-projection queues |
| E2C | `381993db98d2e2ccd5474ded12a77c7b47ac1e95` | Five cross-owner queues |
| E2D | `817562f057dd8b5a285838680e63bc2e106d0833` | Recorded Overdue queue + aggregate finalization |
| E2E | *certification only — no commit* | **PASS WITH DOCUMENTED NON-BLOCKING DEBT** |

### Overdue — six-case state matrix
Overdue is based on **persisted Open/Breached `TATAlert` rows** — it is **not a live recalculation**. No last-scan / evaluation timestamp is persisted or claimed; the response-level `asOf` is **request time only**. No page-local Overdue metadata was added (the Record row contract stays narrow).

| Case | Condition | State | Count / detail |
|---|---|---|---|
| A | `getOverdueSignal()` throws | **error** | count `null`, detail data `null`; sibling queues unaffected; listed once in `unavailable[]` |
| B | configured, ids, `listForOrchestration` throws | **error** | count `null`, detail data `null`; **no raw `recordIds.length` fallback** |
| C | `activeConfigCount === 0` | **deferred** | count `null`, detail data `null`; **no Records call**; reason "TAT not configured for this lab"; never empty/zero; not in `unavailable[]` |
| D | configured, `recordIds = []` | **empty** | count `0`; truthful empty page; `ids: []` passed — **never an unfiltered Records query** |
| E | configured, visible ids | **ready** | count = **exact Records owner total**; owner pagination + ordering |
| F | configured, stale/inaccessible ids only | **empty** | count `0`; **not** an error; **no raw signal length exposed** |

### State & count semantics (frozen)
States: **`ready` · `empty` · `forbidden` · `error` · `deferred`**.
- `ready` = exact visible total > 0 · `empty` = successful evaluation, exact visible total 0 · `forbidden` = access denied (never rendered as empty) · `error` = owner/intersection failure, count `null`, detail data `null` · `deferred` = intentionally unavailable, count `null`.
- A `null` count is **not** zero. Errors are **never** hidden as empty; deferred is **never** hidden as empty. **Counts come from Records owner totals** — raw signal lengths and page lengths are **never** presented as queue totals. `unavailable[]` names only `error`/`forbidden` sources (each once); `empty` and `deferred` are **not** listed there.

### Permissions & tenancy
Routes (all **GET-only**, read-only): `GET /enterprise/summary` · `GET /enterprise/queues` · `GET /enterprise/queues/:queue`. Permission: **`record:view`** for all three. No new permission codes; no role-name authorization; no caller-supplied `labId`; active-lab scoping enforced through owner reads (tenancy extension). Invalid/retired queue keys → **404**. Assignment mutations remain **Records-owner** behavior under `record:change` elsewhere; the Enterprise aggregate exposes **no mutation route**.

### Privacy & allowlist
Enterprise Record row (exact): `id`, `identifier`, `labNumber`, `formType`, `status`, `urgent`, `specimenDate`, `createdAt`, `statusChangedAt`, `assignedToId`, `assignedToName`, `patientDisplayName`, `ownerPath`. `ownerPath = /records/:id`. **Excluded:** `labId`, diagnosis, medical entry, reports, result-sheet content, narratives, AI content, attachments, WSI, storage URLs, credentials, internal notes, owner entity IDs, and QC / Recall / Correlation / Escalation / TAT details.

### Documented non-blocking debt (intentional deferrals — not defects, not release blockers)
1. **Archived deferred** — no owner-recorded archived state exists.
2. **Team Work deferred to E4** — requires team resolution + a multi-assignee owner capability.
3. **Change Requests excluded** — distinct `changerequest:view` authority (unseeded for standard roles); client-communication workflow, not internal Record lifecycle.
4. **No cache/polling optimization** — aggregate uses live owner reads; not required for correctness.
5. **No page-local signal metadata** — signals remain standalone queues; the Record row contract stays narrow.
6. **Cosmetic:** `ENTERPRISE_DEFERRED_REASON` is an unreachable fallback constant (harmless dead constant; no release impact; not removed here).

### Release classification
- Certification result: **PASS WITH DOCUMENTED NON-BLOCKING DEBT**
- Release blockers: **None**
- Classification: **Production-ready behind existing RBAC**
- E2: implementation complete · certification complete · documentation recorded · **E3 (Command Center UI) complete & certified (E3A–E3C)** · **E4 (Manager / Assignment) not started**

### Rollback map (additive, reverse-order; no schema/permission/seed/DB rollback required)
| CP | Revert | Effect |
|---|---|---|
| E2D | `git revert 817562f057dd8b5a285838680e63bc2e106d0833` | returns Overdue to deferred; preserves E2A–E2C |
| E2C | `git revert 381993db98d2e2ccd5474ded12a77c7b47ac1e95` | returns five cross-owner queues to deferred; preserves E2A/E2B |
| E2B | `git revert f8671fe0f484b37675eb71691d088ddaa453006e` | returns six Record queues to deferred; preserves E2A shell |
| E2A | `git revert a7c26b3` | removes aggregate shell + root registration per the committed diff |

Reverse-order rollback **E2D → E2A** removes E2 cleanly. The aggregate owns no persistence — **no schema, migration, permission, seed, or database rollback is required**.

---

## E3 — Enterprise Command Center: Implementation & Certification

> **Authoritative E3 record (E3D, 2026-07-16).** The Enterprise Command Center UI over the certified E2 aggregate. Frontend-only; it changes no backend, aggregate, API contract, permission, schema, or owner. Supersedes the plan-era §10 UI sketch wherever they differ (e.g. the route is exactly **`/command-center`** — never `/worklist`; `formType`/`urgent` detail filters are **deferred**, not shipped; the row contract is the narrow allowlist below).

### Status
| Field | Value |
|---|---|
| Phase 5 E3 — Enterprise Command Center UI | **CERTIFIED** |
| Route | **`/command-center`** (single route; no alias) |
| Permission | **`record:view`** (the only gate — same code the backend enforces) |
| Feature gate | **Option B — navigation + existing permission only** (no feature key) |
| Backend / aggregate / API / permissions / schema | **unchanged** (frontend-only) |
| E4 (Manager / Assignment) | **Not started** |

### Checkpoint ledger
| CP | Commit | Deliverable |
|---|---|---|
| E3A | `eb7bb104e47c28173f7fe7095e8630cbe6395ef2` | Command Center shell (9 files): page/loading/types/api + Header/Summary/Rail/Detail/StateTag — pure presentation over the three E2 endpoints |
| E3B | `ec3fa69c75b3dfeb17321b07d17db9995bc0b62c` | Visual/responsive/accessibility refinement (7 files); shared PageHeader; five-state text presentation; responsive table→cards |
| E3C | `203118bbfd266fe0c03cf8d5b4204f8281c9de5e` | Navigation integration (`src/lib/nav.ts`, +2): one Lab-group entry **"Enterprise Case Management" → `/command-center`** |

### Navigation architecture (as shipped)
One nav entry in the **`lab` group** (`src/lib/nav.ts`), after *Enterprise Administration*: `{ label: 'Enterprise Case Management', path: '/command-center', permission: 'record:view', icon: LayoutGrid }`. Rendered by the top-bar pill + antd dropdown (`nav-pills.tsx`) and the mobile drawer; both derive from `NAV_GROUPS`. Active-route state is the established P3 convention: the **Lab group pill** activates when a child path matches (`groupActive`); group triggers expose `aria-haspopup`/`aria-expanded` (not `aria-current`). `/command-center` is **not** return-aware (plain push). **No badge** (the Command Center has 13 independent queue counts and no certified single navigation value).

### Feature-gate decision — **Option B**
No enterprise/worklist/command-center/case-management feature key exists in `features.ts`; the closest siblings (Operations, Quality & Governance, Enterprise Administration) use `record:view` with **no** flag. A fabricated flag would falsely imply a backend enforcement boundary that does not exist. Decision: **reuse `record:view`, add no feature key, add no permission code, use no role names.**

### Certified invariants (frozen)
- **One `<h1>`** ("Enterprise Case Management", via shared PageHeader) — no raw h1 in the module.
- **Only three endpoints:** `/enterprise/summary`, `/enterprise/queues`, `/enterprise/queues/:queue`. **No owner endpoint**, no direct Prisma, no owner-service import.
- **No frontend business logic:** no derived queue membership, counts, status, overdue, urgency, or assignment; queue order rendered as received; owner pagination/ordering verbatim (no local sort/filter/paginate/recount); unavailable counts render an em-dash (never a fabricated zero).
- **No page-local overdue/signal metadata**; the row allowlist is exactly: `id, identifier, labNumber, formType, status, urgent, specimenDate, createdAt, statusChangedAt, assignedToId, assignedToName, patientDisplayName, ownerPath`.
- **`ownerPath` navigation only** → `/records/:id`.
- Query keys: `['enterprise-summary']`, `['enterprise-queues']`, `['enterprise-queue', queue, page]`; Refresh invalidates all three.

### Verification (measured)
- **E3B-V (live, Playwright):** responsive **0 page overflow** at 320/360/390/430/768/1024/1440/1920 (`documentElement.scrollWidth === clientWidth`); **zero-orange = 0 pixels** across full-content scans at 390/768/1440/1920; five states render distinctly with text; **one h1**, `axe-core` **0 violations**, keyboard `ownerPath` navigation (Enter), visible focus, truthful disabled pagination; reduced-motion clean; **0 page/console errors from the page**; data-flow (3 endpoints, Refresh-invalidates-3, server pagination) confirmed.
- **E3C (live, real backend — no interception):** nav item present exactly once → `/command-center` loads; real `/enterprise/summary|queues|queues/:queue` → **200**; **no owner endpoints** called by the page; record → `ownerPath` → Back restores the Command Center with the Lab pill active; Refresh re-fetched all three; mobile drawer contains the item; **0 orange**, **no overflow**, **0 page errors**.

### E3 rollback map (additive; reverse-order; documentation-only for this checkpoint)
| CP | Revert | Effect |
|---|---|---|
| E3C | `git revert 203118bbfd266fe0c03cf8d5b4204f8281c9de5e` | removes the nav entry; page still reachable by URL; preserves E3A/E3B |
| E3B | `git revert ec3fa69c75b3dfeb17321b07d17db9995bc0b62c` | returns the seven files to the E3A shell |
| E3A | `git revert eb7bb104e47c28173f7fe7095e8630cbe6395ef2` | removes the Command Center route entirely |

No schema/permission/seed/backend rollback anywhere in E3 (frontend-only). **E4 (Manager / Assignment) — not started.**

### Documentation-only environment note
During E3C's real-backend verification, the stale `:4000` API process (a build predating E2) was replaced with the **current committed API build** so the three `/enterprise` routes were served live; no application code, data, or owner state was modified.
