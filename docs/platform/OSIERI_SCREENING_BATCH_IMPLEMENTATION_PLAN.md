# OSIERI — Screening Batch Management Platform (Phase 4.2)
### Architecture Audit → Owner-First Design → Implementation Plan

| Field | Value |
|---|---|
| Status | **CERTIFIED WITH DOCUMENTED NON-BLOCKING DEBT.** Phase 4.2 implemented (C1–C8; C2 skipped under Option A; C5 satisfied within C3) and certified in C9 after the C8 commit `54f6ab49c9afa9b00a95a4a612b6083e21abf7fe` (C9 is read-only — no implementation commit). See [Final Status — Phase 4.2 Certification & Closeout (C9)](#final-status--phase-42-certification--closeout-c9) below. The STEP 0–10 sections below are the original pre-implementation plan, retained as history. |
| Phase | Phase 4.2 (first capability) |
| Precursor audit | [OSIERI_CYTOLOGY_BATCH_AUDIT.md](../OSIERI_CYTOLOGY_BATCH_AUDIT.md) (2026-07-10) — proved no screening batch is modeled; deferred pending a product decision. **This plan is that decision.** |
| Dependencies | [ARCHITECTURE_LEDGER §19](../architecture/ARCHITECTURE_LEDGER.md) (frozen-aggregate extension rules), [DECISION_RECORDS.md](../architecture/DECISION_RECORDS.md) (D-001…D-020), [PERMISSION_CAPABILITY_CATALOG.md](PERMISSION_CAPABILITY_CATALOG.md), [ENTERPRISE_DOMAIN_ENTITY_MODEL.md](ENTERPRISE_DOMAIN_ENTITY_MODEL.md), [OSIERI_OPERATIONS_WORKSPACE.md](../OSIERI_OPERATIONS_WORKSPACE.md), Phase 3A + Phase 4.1A frozen baselines |
| Governing precedent | Phase 4.1A (Ancillary Ordering) — same owner-first, checkpointed, isolated-schema/permission methodology |
| Last Updated | 2026-07-15 |

> **Constitutional preservation.** Nothing in this plan modifies D-001…D-020, owner-first architecture, aggregate ownership, the truthfulness doctrine, the Diagnostic Case aggregate (Phase 3A frozen + the 4.1A tenth band), Sign-Out ownership (D-015), event ownership (D-011), the permission model, or the Phase 4.1A frozen baseline. Screening Batch is introduced as a **new bounded context** that composes existing owners and mutates only its own aggregate.

---

## STEP 1 — Audit of the existing platform (everything proven from source)

Every claim below was verified by direct inspection of `apps/api/prisma/schema.prisma`, `apps/api/src/modules/*`, `apps/api/prisma/seed.ts`, `apps/web/src/lib/nav.ts`, and `docs/`. Nothing is assumed.

### 1.1 Models — is a screening batch modeled? **No.**

| Concept searched | Found in schema? | What actually exists |
|---|---|---|
| `ScreeningBatch` / `ScreeningWorklist` / `ScreeningAssignment` / `ScreeningSession` | **None** | No such model or field. Confirmed by full-schema sweep and by [OSIERI_CYTOLOGY_BATCH_AUDIT.md](../OSIERI_CYTOLOGY_BATCH_AUDIT.md). |
| `RequisitionBatch` (schema:3708) | Yes | **Client-owned intake/billing batch** — `batchNumber` (`BATCH-2026-XXXX`), `clientId`, `submittedById`, `BatchStatus (DRAFT→PENDING_PAYMENT→PAID→SUBMITTED→PROCESSING→COMPLETED→REJECTED)`, `totalForms`, `forms DigitalRequisitionForm[]`. Groups *submission forms* under a **referring clinician**, not screening *cases* under a cytotechnologist. |
| `WorkloadTarget` (schema:2161) | Yes | Per-pathologist daily/weekly throughput targets (Case Assignment tier). Not a batch. |
| `AIScreeningResult` (schema:2689) | Yes | AI pre-screening flags, **per record** (`recordId @unique`), `AIScreenStatus (Pending/…/Failed)`, reviewer relation. Per-case, never per-batch. |
| Record case-assignment fields (schema:665) | Yes | `assignedToId` / `assignedAt` / `assignedById` (`RecordAssignee`) — a **case→reviewer** assignment (workload tier). Not a batch, not a screener grouping. |
| `QCCheck`, `RecordStatusEvent`, `DigitalSlide`, `CorrelationCase` | Yes | QC, status history, whole-slide images, cyto-histo correlation — all per-record owners, none a screening batch. |

**Conclusion:** No persistent screening-batch membership, screener ownership, batch lifecycle, batch SLA, or batch statistics exists. This matches the 2026-07-10 audit verbatim.

### 1.2 Services / modules (proven by `ls apps/api/src/modules` + controller inspection)

| Module | Owns | Relevance to screening batch |
|---|---|---|
| `batch` | `/batch-preview`, `/batch-authorize` — **transient bulk sign-out** (gated `resultsheet:authorize`, capped 50). Persists **no** batch entity. | A misleading base for screening batches (records nothing). **Do not extend.** |
| `workload` | Case→reviewer assignment intelligence: `/summary`, `/unassigned`, `/history`, `/targets`. Writes `Record.assignedTo*` and `WorkloadTarget`. Feature `CASE_ASSIGNMENT`. | **Assignment owner at the case→pathologist granularity.** Screening batch is a *different* granularity (grouped cases → cytotechnologist, earlier stage). Must not duplicate. |
| `ai-screening` | `AIScreeningResult` per record: `/analytics`, `/queue`, `/record/:id`, `/:id/review`. Feature `AI_SCREENING`. | AI pre-screening is per-case and advisory (D-008). Screening batch **references** it; never owns it. |
| `operations` | Read-only operational intelligence: `/overview`, `/sla-risk`, `/integration-health`, `/quality-alerts` (`record:view`). | The natural host for the screening **queue/statistics** read compositions (Option-3, D-003). |
| `qc` | `QCCheck`, alerts, stats. Feature `QC_MODULE`. | QC rescreen/rapid-review is qc's domain. Screening batch **flags** cases for QC; qc owns the QC review. |
| `signout` / `result-sheets` | Sole authorization owner (`resultsheet:authorize`, D-015). | Screening precedes sign-out; batch never authorizes or alters sign-out. |
| `diagnostic-case` | Frozen composition aggregate (10 read-only bands). | Optional future: an additive read-only "Screening" band under §19. |
| `tat`, `recall`, `escalation`, `report-center` | Turnaround, recall, escalation, reporting. | Downstream/adjacent; read-only relationships only. |

### 1.3 Permissions (authoritative catalog = `apps/api/prisma/seed.ts`)

The catalog is generated from `STANDARD_OBJECTS × {view,create,change,delete}` + `STANDARD_EXTRA` + `SPECIAL_OBJECTS`. **No `screening*` / `batch*` / `worklist*` / `assign*` permission object exists.** The only batch-adjacent code is `resultsheet:authorize` (used by `/batch-authorize`). Every operational surface today (workload, ai-screening, qc, operations) reuses **`record:view` / `record:change`**.

### 1.4 Events (`grep RealtimeGateway emits`)

Only `batch:submitted` exists (RequisitionBatch portal submission). **No screening/worklist/assignment realtime events.** Event ownership (D-011): any new event is emitted by its owner at the real mutation site.

### 1.5 UI (`apps/web/src/app/(app)` + `nav.ts`)

Existing pages: `operations`, `workload`, `qc`, `ai-screening`, `batch-authorize`, `dashboard`. **No screening-batch / worklist / screening-dashboard page.** Nav groups gate on `record:view` + feature flags (`CASE_ASSIGNMENT`, `QC_MODULE`, `AI_SCREENING`, `BATCH_AUTHORIZATION`).

### 1.6 Documentation

`OSIERI_CYTOLOGY_BATCH_AUDIT.md` (P1, 2026-07-10) is the governing precursor: *"prefer no module over a misleading module — no module was built."* Its recommendation was a **product decision on a persistent `ScreeningBatch` model** — supplied here.

**Audit verdict:** the screening-batch capability is **entirely unbuilt and entirely unmodeled**. There is no code to refactor, only a new owner to add.

---

## STEP 2 — Architectural ownership

Screening Batch is a **new domain owner** (D-002). The aggregate:

- **Aggregate root:** `ScreeningBatch` — a persisted, screener-owned grouping of cases for primary cytology screening.
- **Membership entity:** `ScreeningBatchCase` — the join between a batch and a `Record`, carrying per-case *screening-workflow* facts only (screened / flagged-for-review / QC-selected), never a diagnosis.

| Responsibility | Owner | Rationale |
|---|---|---|
| Batch lifecycle & legal transitions | **`ScreeningBatchService`** (new) | D-002 / D-014 — lifecycle lives in its owner, never a central engine. |
| Batch↔case membership | **`ScreeningBatchService`** | New relation; no existing owner models it. |
| Batch→screener assignment | **`ScreeningBatchService`** | Distinct granularity from workload's case→pathologist assignment. |
| Per-case screening disposition (screened/flagged/QC-selected) | **`ScreeningBatchService`** | A screening-workflow fact, not a clinical finding. |
| Batch statistics (turnaround, throughput) | **`operations` read composition** over the owner (D-003/D-013) | Statistics are derived reads; no second persistence. |
| Record identity & status | **`RecordsService`** (D-001) — unchanged | Batch references `recordId`; never writes `Record.status`. |
| Case→pathologist assignment (`Record.assignedTo*`) | **`workload`** — unchanged | Batch does not touch it; different act, different stage. |
| AI pre-screening | **`ai-screening`** — unchanged | Batch reads `AIScreeningResult` metadata; never owns it. |
| QC review | **`qc`** — unchanged | Batch flags a case for QC; qc owns the QC act. |
| Authorization / sign-out | **`result-sheets` / `signout`** (D-015) — unchanged | Screening never authorizes. |
| The diagnostic finding (Bethesda, result sheet) | **their owners** — unchanged | Screening records disposition, not diagnosis (truthfulness, D-005/D-007). |

**No ownership drift:** every responsibility above is owned exactly once. The new owner adds authority; it removes none.

---

## STEP 3 — Relationship to the existing platform (no duplicate ownership)

| Existing system | Relationship | Direction | Guardrail |
|---|---|---|---|
| **Record** | Batch membership references `recordId` (FK, `onDelete: Cascade`). | Batch **reads** identity; **never writes** `Record.status`. | D-001, D-004, D-019 |
| **Result Sheet / Sign-Out** | Screening is an upstream stage; sign-out remains sole authority. | Batch **reads** sheet existence at most; no write, no gating of authorization. | D-015 |
| **Diagnostic Case** | Optional additive read-only "Screening" band (C8). | Diagnostic Case **composes** the owner read; owner unchanged. | §19, frozen baseline |
| **Slide / DigitalSlide** | A batch case may reference slide metadata for the screener. | **Read** only (mutation-free seam); WSI owns slides. | D-003 |
| **Specimen** | Read for material context. | Read only. | D-004 |
| **QC** | Batch may mark a case "QC-selected"; the QC review is qc's. | Batch **flags**; qc **owns** the QC act. | D-002 |
| **Escalation / Recall** | Downstream, record-scoped; unaffected. | Read only. | D-003 |
| **Ancillary Orders (4.1A)** | Independent record-anchored orders; may co-exist on a batched case. | No coupling; both compose the record. | 4.1A frozen |
| **Operational Intelligence / Performance** | Hosts the queue + statistics read compositions. | **Composes** the owner read (D-013). | D-003 |
| **Timeline / Audit Trail** | Batch lifecycle events are history (append-only). | Owner **emits**; never fabricates. | D-011 |
| **Notifications** | "Batch assigned to you" etc. via `RealtimeGateway`. | Owner emits at real mutation sites. | D-011 |
| **Workload (case assignment)** | Sibling assignment owner at a different granularity. | Batch surface **reads** workload; neither writes the other's assignment fields. | D-002 |

---

## STEP 4 — Lifecycle design

A single lifecycle, owned solely by `ScreeningBatchService` (D-014 — no external engine).

```
Draft ──▶ Ready ──▶ Assigned ──▶ InScreening ──▶ Completed ──▶ Closed
  │          │          │             │
  └──────────┴──────────┴─────────────┴────────────────────▶ Cancelled
```

**Legal transitions (the authoritative map, owner-held):**

| From | Allowed → |
|---|---|
| `Draft` (building membership) | `Ready`, `Cancelled` |
| `Ready` (membership frozen, awaiting a screener) | `Assigned`, `Draft` (reopen to edit membership), `Cancelled` |
| `Assigned` (screener set, not started) | `InScreening`, `Ready` (unassign), `Cancelled` |
| `InScreening` (screener working) | `Completed`, `Cancelled` |
| `Completed` (all member cases dispositioned by the screener) | `Closed` |
| `Closed` | **terminal** |
| `Cancelled` | **terminal** |

**Terminal states:** `Closed`, `Cancelled`. **Events** (owner-emitted, D-011): `screeningbatch:created`, `:assigned`, `:started`, `:completed`, `:closed`, `:cancelled`, `:case-added`, `:case-screened`. **Scheduler involvement:** none required for MVP; an optional future age/SLA read is a composition, not a lifecycle actor. **Truthfulness (D-005):** `Completed` means *the screener recorded screening disposition for every member case* — **not** that any case is diagnosed, QC-passed, authorized, or released. `Closed` is an administrative archive, not a clinical conclusion.

**Membership rule:** a `Record` may belong to **at most one non-terminal** screening batch (enforced by a partial-unique or application guard in the owner) — a case is screened in one place at a time.

---

## STEP 5 — Enterprise workflow (mapped to current architecture)

```
Cases (records, post-accession)                → RecordsService (owner, unchanged)
        │  building: added to a Draft batch     → ScreeningBatchService.addCase
        ▼
   Draft → Ready (membership frozen)             → ScreeningBatchService.setReady
        │  assign batch to a cytotechnologist    → ScreeningBatchService.assign  (batch→screener)
        ▼
   Assigned → InScreening (screener starts)      → ScreeningBatchService.start
        │  per case: screened / flagged / QC-sel → ScreeningBatchService.recordDisposition
        ▼
   Completed (all cases dispositioned)           → ScreeningBatchService.complete
        │  QC selection handoff                   → qc owner (flag only; qc owns the review)
        │  pathologist review / result / sign-out → workload + result-sheets + signout (unchanged)
        ▼
   Closed (archive)  ──▶ statistics / metrics     → operations read composition (D-013)
```

Every arrow lands on an existing owner or the new owner. **No step introduces a second writer of an existing domain.** The diagnostic path (review → result → sign-out) is untouched and remains authoritative; the batch is a screening-workflow envelope that ends before diagnosis.

---

## STEP 6 — UI architecture (design only)

All surfaces are Helix primitives (`@/components/ui`), motion-grammar-compliant, **zero-orange**, read-truthful (five-state, D-006). New feature flag: `SCREENING_BATCH`.

| Surface | Purpose | Data source | Authority |
|---|---|---|---|
| **Screening Dashboard** | Open batches, cases waiting, backlog, throughput at a glance. | `operations` read composition | Read-only |
| **Batch Console (queue)** | List batches by state (Draft…Closed); filter by screener/date/status. | Owner `queue()` | Read-only list; actions call the owner |
| **Batch Detail workspace** | Membership, per-case disposition, lifecycle actions (assign/start/complete). | Owner `detail()` + transition endpoints | API-authoritative (no client lifecycle) |
| **Assignment workspace** | Manager assigns a batch to a screener; reassign before InScreening. | Owner `assign()` | Owner-backed |
| **Manager View** | Cross-screener load, batch turnaround, QC-selection rate. | `operations` composition | Read-only |
| **Technologist View** | "My batches" + my case-disposition worklist. | Owner `queue({screenerId:me})` | Owner-backed disposition |
| **Status indicators / KPIs** | Batch state badges; productivity/quality tiles. | Composition reads | Read-only, truthful |

The browser holds **no** lifecycle, transition, or persistence authority (Phase 4.1A precedent): every mutation is an API call to the owner.

---

## STEP 7 — Operational intelligence (future metrics; not implemented here)

Derived reads over the owner (D-013) — **defined, not built**: average screening time (per batch/screener), cases/hour, slides/hour, batch turnaround (created→completed), open-batch count, cases-waiting (unbatched screenable), screener productivity, QC-selection rate & concordance (joined with qc), backlog depth, and trend analysis. All are compositions in `operations`/`performance`; none introduces new persistence. Truthfulness: every metric is labeled with its provenance and window; no metric implies a clinical outcome.

---

## STEP 8 — Integration analysis (future; not implemented here)

| Integration | Future relationship | Boundary |
|---|---|---|
| **Digital Pathology / Scanner roadmap** | `DigitalSlide` metadata surfaced per batched case; scanner status as read context. | Read-only; WSI owns slides. |
| **AI (Read → Reveal, Concordance Ledger)** | AI pre-screen (`AIScreeningResult`) shown as advisory metadata on batch cases; concordance between AI flag, screener disposition, and pathologist finding as a future ledger read. | D-008 advisory only; AI never decides batch state. |
| **Performance** | Screening throughput feeds the performance workstream. | Composition read. |
| **Customer Portal** | Not exposed — screening is internal lab workflow. | No portal surface in MVP. |
| **FHIR** | Out of scope (same deferral posture as Phase 4.1A B8; no ServiceRequest/Task inbound today). | Deferred to a future Integration Architecture workstream. |

---

## STEP 9 — Checkpoint roadmap

MVP = **C1 + C3 + C5 + C6 + C7**. C2 only if Option B permissions are chosen. C8/C9 are extension + closeout.

| CP | Title | Scope | Artifact | Isolation rule | Rollback |
|---|---|---|---|---|---|
| **C0** | This plan | Audit + design + roadmap. | this doc | Doc-only, no code (D-020) | delete doc |
| **C1** | Schema & persistence | `ScreeningBatch` + `ScreeningBatchCase` + enums (`ScreeningBatchStatus`, `ScreeningDisposition`) + additive inverse relations on `Record`/`User`/`Lab`, via **timestamped migration** (`migrate diff --from-schema-datasource … --script` → SQL → `migrate deploy`). No app logic. | schema + migration | Schema-only commit (D-020); purely additive | revert migration + schema |
| **C2** | Permissions *(only if Option B)* | Seed `screeningbatch:{view,assign,screen,manage}`; assign to roles. | `seed.ts` | Seed-only commit (D-016), before the module | revert seed |
| **C3** | Owner module | `screening-batches` module/controller/service/DTOs: create, add/remove case, setReady, assign, start, recordDisposition, complete, close, cancel, queue, detail; `LabContext` tenancy; owner-held transition map; realtime emits. | new module | One owner, no cross-domain writes (D-002/D-019) | remove module + `app.module` registration |
| **C4** | Workload/assignment read bridge | Surface batches in the workload/operations views as a **read** of the owner; no duplicate assignment authority. | operations/workload read | Reuse-only; zero write to workload fields (D-002) | revert the read/panel |
| **C5** | Screening disposition recording | Screener marks each member case screened / flagged-for-review / QC-selected; batch auto-eligibility for `Completed`. | owner methods | Owner-owned; truthful dispositions only (D-005) | revert methods |
| **C6** | Operational queue + statistics | Read composition: open batches, cases waiting, turnaround, throughput. | operations composition | Read-only; no duplicate persistence (D-003/D-013) | revert composition |
| **C7** | Web UI | Screening Dashboard, Batch Console, Batch Detail, Assignment, Manager/Technologist views. Helix primitives, motion grammar, zero-orange, responsive matrix; behind `SCREENING_BATCH`. | `apps/web` | Feature-only; primitives from `@/components/ui` | revert routes/components + nav |
| **C8** | Diagnostic Case band *(optional, deferred)* | Additive read-only "Screening" band (per-record screening provenance) under §19 as its own reviewed change. **Touches the frozen aggregate.** | diagnostic-case (read) | Additive band only; frozen contract unchanged (§19) | revert band |
| **C9** | Final certification & closeout | Read-only certification (the Phase 4.1A B9 pattern). | report | Read-only | n/a |

---

## Rollback strategy

Every checkpoint is **independently reversible and forward-independent** (Phase 4.1A precedent): C1 is purely additive (no existing object altered/dropped); C3–C7 depend only on earlier landed work (C1 model, C3 owner), never on future checkpoints; C8 is an additive band that leaves the frozen aggregate intact when reverted. The rollback boundary is the set of C1→C8 commits; reverting them in reverse order removes Phase 4.2 with no residue in Record, Workload, QC, Sign-Out, Diagnostic Case, or the permission catalog beyond the additive objects dropped by the C1 revert.

## Risk analysis

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Mislabeling** an intake/billing batch (`RequisitionBatch`) or a transient bulk action (`batch-authorize`) as a screening batch — the exact trap the 2026-07-10 audit flagged. | New `ScreeningBatch` aggregate; never reuse `RequisitionBatch`/`batch`. Screening membership is persisted and screener-owned. |
| 2 | **Duplicate assignment authority** vs. workload (`Record.assignedTo*`). | Batch→screener assignment is a distinct field on `ScreeningBatch`; the batch never writes `Record.assignedTo*`. |
| 3 | **Truthfulness** — implying screening = diagnosis/QC-pass/release. | Dispositions are workflow facts only; `Completed`/`Closed` explicitly exclude clinical meaning; the diagnosis stays with its owners (D-005/D-007). |
| 4 | **Frozen-aggregate breach** (Diagnostic Case). | C8 is optional, additive, §19-governed, separately reviewed; nine 3A bands + the 4.1A band untouched. |
| 5 | **Permission blast radius**. | Option A reuses `record:view/change` (no seed change). Option B is an isolated C2 seed commit (D-016) only if a manager/screener split is required. |
| 6 | **Central workflow engine** creep. | Lifecycle lives solely in `ScreeningBatchService` (D-014). |
| 7 | **Bundling** schema/permission into feature work. | C1/C2 are isolated commits (D-020/D-016). |
| 8 | **Dirty theme tree** on `feat/theme-system`. | Same discipline as 4.1A — never stage unrelated files; build UI additively. |

## Permission decision (to be confirmed at approval)

- **Option A (recommended) — reuse `record:view` / `record:change`.** Consistent with every operational surface today (workload, ai-screening, qc, operations). No seed change, no role re-assignment, immediate. Manager vs. technologist distinction handled by UI + `SCREENING_BATCH` feature flag.
- **Option B — new seeded `screeningbatch:{view,assign,screen,manage}`.** Choose only if screening must be grantable independently of general record editing, or if a **cytotechnologist role** must screen without broad `record:change`. Requires isolated C2 seed commit (D-016) + role mapping. *This is the one genuine argument for B: a screener role that should not hold general record-edit rights.*

## Verification checklist (applies at each implementation checkpoint, later)

- `cd apps/api && npx tsc --noEmit` clean; `nest build` clean; `node dist/main.js` boots.
- Migration additive only (no DROP / destructive ALTER); `migrate deploy` applies; rollback verified.
- Owner-only persistence: `prisma.screeningBatch*` appears **only** in the owner service.
- Single transition map in the owner; illegal edges rejected; terminal states empty.
- Tenancy: `tenantCreate` stamps `labId` from `LabContext`; no `labId` from request body.
- Response allowlist (no owner-DTO spread; no `labId`/actor-id leakage).
- Truthfulness sweep: no "diagnosed / reviewed / QC-passed / released" claims from screening state.
- Zero-orange pixel scan = 0; Helix primitives only; motion grammar passes.
- No writes to `Record.status`, `Record.assignedTo*`, QC, or sign-out from the batch owner.
- Diagnostic Case (if C8): 10→11 bands, prior bands byte-identical in identity; §19 statement recorded.
- `tsc`/build/boot/browser-drive verification; unrelated dirty files never staged.

## Implementation sequence (once approved)

C1 (schema, isolated) → **[decide A/B]** → C2 (only if B) → C3 (owner) → C4 (read bridge) → C5 (disposition) → C6 (queue/stats) → C7 (UI) → C8 (optional band) → C9 (certification). Each checkpoint: build uncommitted → verify → surgical `git add` of exactly the approved paths → commit with the `Co-Authored-By: Claude Opus 4.8` trailer → STOP.

---

## STEP 10 — STOP

No schema, Prisma model, migration, API, service, controller, DTO, permission, event, UI, or test was created. **This document is the only artifact.** It is left **uncommitted**. Phase 4.2 implementation does **not** begin until this plan is reviewed and explicitly approved.

*(Historical note: the plan was subsequently approved and implemented. See the Final Status section below for committed reality.)*

---

## Final Status — Phase 4.2 Certification & Closeout (C9)

**Certification decision:** **Certified with documented non-blocking debt.**
**Certification baseline:** C9 certified (read-only) after the C8 commit `54f6ab49c9afa9b00a95a4a612b6083e21abf7fe`. **C9 has no implementation commit.**

This section records committed reality only. Where the STEP 9 plan and the delivered work differ, the delivered work below is authoritative: C2 was skipped (Option A), C5 was satisfied within C3, C4 was delivered as a Workload-only read bridge, and C6 was delivered as the **C6-STATS** owner operational summary (the queue portion was already delivered by C3).

### Checkpoint ledger (as committed)

| CP | Status | Commit | Responsibility |
|---|---|---|---|
| **C1** | Done | `fcdb87f` | Schema and persistence (`ScreeningBatch`, `ScreeningBatchCase`, `ScreeningBatchStatus`, `ScreeningDisposition`; additive migration) |
| **C2** | Skipped | — | Option A reused `record:view` / `record:change`; **no new permission codes**. Intentionally skipped, not incomplete. |
| **C3** | Done | `680c0a4` | Owner module — lifecycle, membership, assignment, disposition, completion eligibility, queue |
| **C4** | Done | `1e3b7c7` | Workload read bridge (`GET /workload/screening-assignments`, composes owner `queue`) |
| **C5** | Satisfied via C3 | — | Disposition recording — delivered within the C3 owner module |
| **C6-STATS** | Done | `489e45d` | Operational summary (`GET /screening-batches/summary`, count-only) |
| **C7** | Done | `090c2f6` | Screening Batch owner workspace (`/screening-batches`) + drawers + nav |
| **C8** | Done | `54f6ab49c9afa9b00a95a4a612b6083e21abf7fe` | Diagnostic Case Screening Batch composition (additive read-only band, position 4) |
| **C9** | Certified | — (no commit) | Final certification and closeout (read-only) |

### Release classification

- **Classification:** Certified with documented non-blocking debt.
- **Release blockers:** None.
- **Approved release posture:** Safe behind existing RBAC under Option A (`record:view` for reads, `record:change` for mutations).

### Documented non-blocking debt

- **`SCREENING_BATCH` feature flag — deferred (not implemented).** The nav entry and the Diagnostic Case band currently ship un-flagged on `record:view` (consistent with the Ancillary Orders / Operations precedent). Classification: **recommended operational safeguard** when per-lab packaging or tiering is required. A **UI-only flag is insufficient** — it would not gate the API. A future flag requires **backend enforcement** (a `FeatureKey` enum member + migration + feature-catalog entry + nav/guard) as a **separately reviewed checkpoint**. It is **not** a current authorization or release blocker.
- **Assignee validation — limited (not implemented).** `assignedToId` is recorded as a **scalar** and is **not** validated through a cross-owner lab-user read; the C7 UI uses a labeled identifier field. Documented debt, not a release blocker.
- **One-active-batch — documented residual concurrency risk.** The owner enforces "a record belongs to at most one non-terminal batch" via a **check-then-act** guard plus the `@@unique([batchId, recordId])` within-batch constraint. This is **not** proven fully atomic across batches (no cross-batch partial-unique constraint or wrapping transaction). The current owner validation and behavior are preserved as documented; **no claim of fully atomic enforcement is made.**

### Architectural closeout (frozen truths)

- **`ScreeningBatchesService` remains the sole mutation and lifecycle owner** — the only module that writes `ScreeningBatch` / `ScreeningBatchCase`.
- **Workload** consumes the approved read bridge only (owner `queue`); it never writes screening state or duplicates assignment authority.
- **Diagnostic Case** consumes **`listByRecord(recordId)` only** — descriptive, read-only, allowlisted, one additive band at position 4; the ten prior bands are unchanged.
- **No downstream surface** may infer diagnosis, QC completion, release readiness, authorization readiness, or productivity from Screening Batch state. Batch status and disposition are presented verbatim.
- **Option A permissions** stand: `record:view` for reads, `record:change` for mutations. **No dedicated Screening Batch permissions were introduced.**

### Rollback map (per checkpoint)

- **C8** → `git revert 54f6ab4` (removes `listByRecord` + the band; restores the 10-band aggregate)
- **C7** → `git revert 090c2f6` (removes route/components + nav)
- **C6-STATS** → `git revert 489e45d` (removes the operational summary)
- **C4** → `git revert 1e3b7c7` (removes the workload read bridge)
- **C3** → `git revert 680c0a4` (removes the owner module + `app.module` registration)
- **C1** → `git revert fcdb87f` reverts the schema + migration **files only**. This is **not** a simple automatic database rollback: the already-applied `ScreeningBatch` / `ScreeningBatchCase` tables and the two enum types require **separately reviewed database-object cleanup and `_prisma_migrations` history reconciliation**.

Reverting C8 → C1 in reverse order removes Phase 4.2 with no residue beyond the C1 database objects noted above.
