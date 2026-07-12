# PathOS — Quality & Governance Workspace (Phase 2C) composition feasibility audit

| Field | Value |
|---|---|
| Status | Audit complete — composition is feasible and truthful for the Existing/Partial set, with named schema-gated deferrals |
| Current Phase | PathOS Phase 2C (Quality & Governance Workspace) |
| Owner | Founder |
| Dependencies | [PATHOS_QUALITY_WORKSPACE.md](PATHOS_QUALITY_WORKSPACE.md) (approved architecture), [PATHOS_SIGNOUT_FEASIBILITY_AUDIT.md](PATHOS_SIGNOUT_FEASIBILITY_AUDIT.md) (method), Helix v1.0 (frozen) |
| Last Updated | 2026-07-11 |
| Priority | P1 |
| Expected Next Milestone | Architectural review of this audit → (separately) an implementation plan; nothing built until then |

Read-only implementation-readiness audit for the Quality & Governance Workspace defined in
[PATHOS_QUALITY_WORKSPACE.md](PATHOS_QUALITY_WORKSPACE.md). It determines, capability by capability,
whether the surface can be **truthfully composed from the existing production system** — no code, no
schema, no Helix change, no wireframes, no implementation plan, no commit. Every claim traces to a
verified route, service, model, permission, and recorded field (§9).

## Governing rule (binding for this workspace)

> **Quality surfaces recorded evidence. It never computes, infers, ranks, or invents quality conclusions that are not explicitly recorded.**

This extends the Sign-Out discipline (*evidence before confidence; orchestrate, never own*). Where an
owner has already computed a value (a stored benchmark status, a stored discordance result), the
workspace may display it; it may **not** derive a new quality verdict, a new ranking, or a new
inference of its own.

---

## The one question, answered

**Can PathOS build a truthful Quality & Governance Workspace today by composition alone?**

**Yes — for the Quality, Compliance, Medical-Director-oversight, and read-only Governance capabilities,
which are all backed by real owners, routes, models, and recorded evidence.** It would be a genuine
composition, not a shell hiding disconnected systems — *provided* two hard boundaries hold:

1. **Corrective Action is displayed only as the recorded free-text/resolution fields that exist** — it
   must not be presented as a CAPA system, because no CAPA/nonconformance/root-cause/preventive model
   exists (§3).
2. **CAPA, document control, complaints, accreditation register, and the Concordance Ledger remain
   deferred** until an approved schema decision (§6). The workspace must name these as gaps, not fake
   them.

---

## 1. Classification taxonomy

- **Directly reusable** — an owner service read returns the evidence as-is; compose and display.
- **Reusable with composition work** — real evidence exists but must be assembled/filtered/linked
  across owners (no new domain logic).
- **Partially supported** — some evidence exists; the full governance need is not recorded.
- **Requires schema evolution** — no owner/model records it; out of scope until schema is approved.
- **Prohibited to simulate** — must never be computed, inferred, or fabricated by the workspace.

---

## 2. Capability audit

Each row is verified against the codebase (§9). "Route" is the owner endpoint; the workspace mirrors
its permission **descriptively** and the owner endpoint remains the enforcement authority.

### 2A. QUALITY

| Capability | Class | Owner module · service | Route(s) | Model | Recorded evidence | Permission | Composition strategy | Risk |
|---|---|---|---|---|---|---|---|---|
| Correlation | Directly reusable | `correlation` · `CorrelationService` | `GET /correlation`, `/correlation/:id` | `CorrelationCase` | cytology/histology dx, dates, reviewer | `record:view` | Read + link to `/correlation/:id` | Low |
| Discordance | Directly reusable | `correlation` · `CorrelationService` | `GET /correlation` (filter `reviewRequired`/result), `/correlation/analytics` | `CorrelationCase` | `correlationResult`, `discordanceReason`, `reviewRequired` | `record:view` | Read stored result only; never infer discordance | Low |
| Bethesda quality metrics | Directly reusable | `bethesda` · `BethesdaAnalyticsService`; `report-center` · `ReportCenterService` | `GET /bethesda/analytics/*`, `/report-center/bethesda-trends` | `BethesdaResult` | ASC/SIL ratio, unsat rate, **stored benchmark status** | `resultentry:view` / `report:view` | Display owner-computed benchmark status | Low |
| QC failures | Directly reusable | `qc` · `QcService` | `GET /qc`, `/qc/stats`, `/report-center/qc-failures` | `QCCheck` | `checkType`, `result`, `failureReason`, `correctiveAction`, `performedBy` | `record:view` / `report:view` | Read + link to `/qc` | Low |
| QC alerts | Directly reusable | `qc` · `QcService` | `GET /qc/alerts`, `PATCH /qc/alerts/:id/resolve` | `QCFailureAlert` | `status`, `assignedTo`, `resolvedBy/At` | `record:view` / `record:change` | Read open alerts; invoke owner to resolve | Low |
| Proficiency testing | Reusable with composition work | `proficiency` · `ProficiencyService` | `GET /proficiency`, `/proficiency/analytics` | `ProficiencyTest`, `ProficiencyCase`, `ProficiencyResponse` | `testType`, `passingScore`, `status`, grading | `record:view` (read) | Read analytics; invoke owner to administer/grade | Low |
| Escalations | Directly reusable | `escalation` · `EscalationService` | `GET /escalations`, `/summary` | `EscalationRecord` | `severity`, `trigger`, `status`, `reviewedBy/At`, `resolvedReason` | `record:view` | Read open/awaiting-review; invoke owner | Low |
| Recall tracking | Directly reusable | `recall` · `RecallService` | `GET /recalls`, `/summary`, `/generate-list` | `RecallRecord` | `dueDate`, `status`, `reminderSentAt`, `completedAt` | `record:view` | Read status/compliance | Low |
| Operational quality alerts | Reusable with composition work | `operations` · `OperationsService` | `GET /operations/quality-alerts` | composed (no model) | ranked attention signals (owner-computed) | `record:view` | Display owner output; do not re-rank | Med (do not recompute ranking) |
| Report quality analytics | Directly reusable | `report-center` · `ReportCenterService` | `GET /report-center/{abnormal-rate,cytotechnologist-performance,tat-analysis}` | aggregates | abnormal rate, cytotech performance | `report:view` | Read-only display | Low |

### 2B. GOVERNANCE

| Capability | Class | Owner module · service | Route(s) | Model | Recorded evidence | Permission | Composition strategy | Risk |
|---|---|---|---|---|---|---|---|---|
| ResultSheet events | Directly reusable | `result-sheets` · `ResultSheetsService` | `eventsByRecord` (service; used by Sign-Out) | `ResultSheetEvent` | `type` (Authorized/Deauthorized/Reauthorized/AiDrafted/AiAccepted), actor, `createdAt` | `resultsheet:view` | Assemble read-only trail (Sign-Out pattern) | Low |
| Record status events | Directly reusable | `records` · `RecordsService` | via `findOne` (`statusHistory`) | `RecordStatusEvent` | `status`, actor, `notes`, `createdAt` | `record:view` | Assemble read-only trail | Low |
| Login history | Directly reusable | `security` · `SecurityService` | `GET /auth/login-attempts`, `/auth/sessions` | `LoginAttempt`, sessions | attempts, IP, outcome | `system:security` | Read-only; access-governance only | Med (sensitive; gate strictly) |
| Security audit | Directly reusable | `security` · `SecurityService` | `GET /security/dashboard`, `/auth/{locked-users,blocked-ips}` | `LoginAttempt` + session state | locked users, blocked IPs, MFA | `system:security` | Read-only display | Med |
| Maintenance logs | Partially supported | `system` · `SystemLogService` | (system endpoints) | `MaintenanceLog` | `ranAt`, `ranBy`, `duration`, `results`, `notes` — **system/job maintenance, not equipment QC** | (system) | Show as system-maintenance evidence only; do **not** label it lab-equipment QC | Med (mislabel risk) |
| Change requests | Directly reusable (permission caveat) | `change-requests` · `ChangeRequestsService` | `GET /change-requests`, `/:id`, `POST /:id/messages` | `ChangeRequest`, `ChangeRequestMessage`, `ChangeRequestEvent` | request, status, messages, events | `changerequest:view` / `changerequest:change` — **declared but not seeded** (see §3) | Read + link to `/change-requests` | Med — currently superuser-only until the permission is seeded/granted |
| Notification history | Directly reusable | `notifications` · `NotificationsService` | `GET /notifications` | `Notification` | recorded notifications, read state | `notification:view` | Read-only; scope to the actor | Low |

### 2C. COMPLIANCE

| Capability | Class | Owner module · service | Route(s) | Model | Recorded evidence | Permission | Composition strategy | Risk |
|---|---|---|---|---|---|---|---|---|
| CAP metrics | Directly reusable | `report-center` · `ReportCenterService` | `GET /report-center/cap-benchmarks` | aggregates over `BethesdaResult`/`CorrelationCase`/`QCCheck` | **stored benchmark status** (within/above) | `report:view` | Display owner-computed status; never re-judge | Low |
| Turnaround metrics | Directly reusable | `report-center` / `tat` · `TatService` | `GET /report-center/tat-analysis` | Record timestamps | TAT vs threshold | `report:view` | Read-only | Low |
| Recall compliance | Directly reusable | `report-center` · `ReportCenterService` | `GET /report-center/recall-compliance` | `RecallRecord` | on-time / overdue compliance | `report:view` | Read-only | Low |
| Laboratory quality reporting | Directly reusable | `report-center` · `ReportCenterService` | `GET /report-center/summary` + the above | aggregates | assembled quality report set | `report:view` | Read-only composition | Low |

### 2D. MEDICAL DIRECTOR OVERSIGHT

All oversight *actions* already exist and are gated by `resultsheet:authorize` where clinical; the
workspace composes a **read-only attention queue** and invokes each owner for the action.

| Capability | Class | Owner · action route | Model | Recorded evidence | Permission (action) | Composition strategy | Risk |
|---|---|---|---|---|---|---|---|
| Quality review | Reusable with composition work | assembled across `correlation`/`escalation`/`qc` | multiple | review-required flags/status | (per owner) | Compose "awaiting MD attention"; link to owner | Med |
| Discordance review | Directly reusable | `correlation` · `POST /correlation/:id/review` | `CorrelationCase` | `reviewedBy/At`, `reviewNotes` | `record:change` | Read queue; invoke owner review | Low |
| Proficiency review | Directly reusable | `proficiency` · `POST /:id/grade` | `ProficiencyTest` | grading, `passingScore` | `resultsheet:authorize` | Read queue; invoke owner grade | Low |
| Escalation review | Directly reusable | `escalation` · `PATCH /:id/review` | `EscalationRecord` | `reviewedBy/At`, `reviewNotes` | `record:change` | Read queue; invoke owner | Low |
| Authorization oversight | Directly reusable | `result-sheets` events | `ResultSheetEvent` | Authorized/Reauthorized/Deauthorized + actor | `resultsheet:view` | Read-only trail (Sign-Out already derives this) | Low |

### 2E. CORRECTIVE ACTION — definitive finding (do not infer)

Verified against the **entire** schema (§9). The result is unambiguous:

| Concept | Exists? | Evidence |
|---|---|---|
| **CAPA** (corrective + preventive action lifecycle) | **No** | no CAPA model or fields anywhere |
| **Nonconformance** | **No** | no `nonconformance`/`deviation` model or field |
| **Root cause** | **No** | no `rootCause` field anywhere |
| **Corrective-action workflow** (status machine, owner, due, effectiveness) | **No** | no such lifecycle |
| **Preventive-action workflow** | **No** | no field or model |

**What is recorded instead (the only corrective-adjacent evidence that exists):**

- `QCCheck.correctiveAction` — a nullable free-text field ("what was done to fix it").
- `QCCheck.failureReason` — a nullable free-text field (required when `result = Fail`).
- `QCFailureAlert` — `status`, `assignedToId`, `resolvedById`, `resolvedAt` (a resolution record, not a CAPA).
- `EscalationRecord.resolvedReason` — a nullable free-text field on escalation closure.

**Classification: Corrective Action = Partially supported (display-only) + CAPA = Requires schema
evolution.** The workspace may **list** the recorded corrective notes and resolution states above; it
must **not** present them as a CAPA/nonconformance system, must not add root-cause or
preventive-action fields, and must not compute an effectiveness verdict (**Prohibited to simulate**).

---

## 3. Cross-cutting findings

- **The Quality spine is real and directly reusable.** Correlation, discordance, Bethesda benchmarks,
  QC, escalations, recall, CAP/TAT/abnormal analytics all return recorded evidence from owner
  services with clear permissions.
- **Owner-computed values must be displayed, not recomputed.** Benchmark status, discordance result,
  abnormal rate, and operational-alert rankings are already computed by their owners. Per the
  governing rule the workspace **displays** them and must not re-derive or re-rank (Prohibited to
  simulate).
- **Governance is composable read-only but not canonical.** ResultSheet/Record-status events, login
  history, change requests, and notifications each record their slice; assembling them (Sign-Out
  timeline pattern) is truthful **only if each source is named and partial-source unavailability is
  shown honestly**. There is no single append-only governance ledger.
- **`MaintenanceLog` is a mislabel trap.** It records *system/job* maintenance (`ranAt`, `ranBy`,
  `duration`, `results`), not lab-equipment QC. It may appear as system-maintenance governance
  evidence but must never be presented as instrument/equipment quality.
- **Corrective Action is the workspace's honesty test** (§2E): free-text fields exist; a CAPA system
  does not.
- **Change-requests permission is declared but not seeded.** The `change-requests` controller enforces
  `changerequest:view` / `changerequest:change`, but `changerequest` is **not** a seeded permission
  object (verified: absent from the live permission catalog; held by no role). So the capability is
  currently reachable **only by superusers** (guard bypass), unlike `aidraft:view` which *is* seeded.
  This is a pre-existing platform gap, not introduced here; the Quality Workspace must mirror the
  real permission (and surface `forbidden` truthfully for non-superusers) and must **not** invent an
  alias to `record:view` to widen access. Seeding `changerequest:*` is a separate, out-of-scope
  platform decision.

---

## 4. Duplication, ownership, and fake-composition risks

- **Duplicated logic risk:** re-deriving discordance, benchmark status, or alert rankings inside the
  workspace. **Mitigation:** read owner outputs only; never recompute (governing rule).
- **Ownership violation risk:** performing review/grade/resolve inside the workspace. **Mitigation:**
  invoke the owner endpoint (`/correlation/:id/review`, `/proficiency/:id/grade`,
  `/escalations/:id/review`, `/qc/alerts/:id/resolve`); the workspace never mutates quality state.
- **Fake-composition risk:** assembling a governance "audit ledger" that implies completeness it does
  not have, or presenting free-text corrective notes as CAPA. **Mitigation:** name every source,
  label Partial/Missing, show truthful empty/unavailable states.
- **Permission conflation risk:** quality spans `record:*`, `resultsheet:authorize`, `report:view`,
  `resultentry:view`, `changerequest:view`, `notification:view`, `system:security`. **Mitigation:**
  mirror each descriptively; enforce at the owner; alias none to another.
- **No direct Prisma / no duplicated persistence:** every read goes through an owner service (as in
  Sign-Out); the workspace holds no domain query, no validation, no persistence.

---

## 5. Capabilities that must remain deferred (Requires schema evolution)

Out of scope for a compose-only build; **stop before any schema change**:

- **CAPA / nonconformance / root cause / preventive action** (§2E) — no model or fields.
- **Concordance Ledger** — no append-only concordance record; `AIScreeningResult.agreedWithAI` is a
  single boolean without sequence and is **Prohibited to simulate** as proof of interpretation order.
- **Document control** — no controlled-document register / acknowledgement.
- **Complaint management** — no complaint model.
- **Accreditation register** — only computed benchmark *reports* exist, not a tracked requirement set.
- **Competency assessment beyond proficiency** — no direct-observation / blind-rescreen sign-off model.

Read → Reveal and quantification remain blocked, consistent with the Sign-Out freeze.

---

## 6. Composability verdict per surface

| Workspace surface | Verdict | Basis |
|---|---|---|
| Discordance & concordance queue | ✅ Buildable now | `CorrelationService` reads + `/correlation/:id` invoke |
| Proficiency overview | ✅ Buildable now | `ProficiencyService` analytics + owner invoke |
| QC & failure panel (with recorded corrective notes) | ✅ Buildable now | `QcService` reads; corrective notes shown as recorded text only |
| Escalation oversight | ✅ Buildable now | `EscalationService` reads + owner invoke |
| Recall / follow-up compliance | ✅ Buildable now | `RecallService` reads |
| Benchmarks & inspection evidence (CAP/Bethesda/TAT/abnormal/recall) | ✅ Buildable now | `ReportCenterService` read-only; display stored status |
| Governance trail (assembled) | ✅ Buildable now (read-only, named sources) | ResultSheet/RecordStatus events + change-requests + notifications; not a canonical ledger |
| Access-governance / security audit | ✅ Buildable now (strictly gated) | `SecurityService` under `system:security` |
| Medical-Director attention queue | ✅ Buildable now (composition work) | assembled review-required signals; invoke owners |
| Corrective-action listing | ⚠️ Display-only | recorded free-text/resolution fields only (§2E) |
| CAPA workflow | ⛔ Deferred | requires schema (§5) |
| Concordance Ledger | ⛔ Deferred | requires schema (§5) |
| Document control / complaints / accreditation register | ⛔ Deferred | requires schema (§5) |

---

## 7. Recommendation

**A truthful Quality & Governance Workspace can be built today using composition only**, delivering
the Quality spine, Compliance analytics, Medical-Director oversight queue, and a read-only assembled
Governance trail — all from verified owners, with zero schema and zero Helix change, following the
Sign-Out contract (read-only aggregate, per-section status, invoke-the-owner, descriptive
permissions, failure isolation, truthful empty/forbidden/error states).

The build must hold two lines: **Corrective Action is display-only** (recorded fields, not CAPA), and
the **schema-gated set (§5) stays deferred and is named, not faked.** Subject to those, the surface is
a genuine composition, not theatre.

Next step (separate, on approval): an implementation plan sequencing the checkpoints in
[PATHOS_QUALITY_WORKSPACE.md](PATHOS_QUALITY_WORKSPACE.md) §9. **This audit does not authorise a
build.**

---

## 8. Verification note

Every capability above was verified read-only against the running codebase:

- **Modules (12):** `correlation`, `escalation`, `qc`, `proficiency`, `recall`, `report-center`,
  `bethesda`, `operations`, `change-requests`, `notifications`, `tat`, `security`/`system` — all
  present.
- **Models:** `CorrelationCase`, `EscalationRecord`, `QCCheck`, `QCFailureAlert`, `ProficiencyTest`,
  `ProficiencyCase`, `ProficiencyResponse`, `RecallRecord`, `BethesdaResult`, `ResultSheetEvent`,
  `RecordStatusEvent`, `LoginAttempt`, `MaintenanceLog`, `ChangeRequest`(+`Message`,`Event`),
  `Notification`, `PerformanceReview` — all present.
- **Routes:** correlation review, qc alert resolve, proficiency grade, recall complete, escalation
  review lifecycle, report-center `{cap-benchmarks,recall-compliance,qc-failures,abnormal-rate,
  bethesda-trends,tat-analysis,cytotechnologist-performance}`, change-requests, notifications,
  security (`system:security`) — all confirmed present.
- **Permissions:** each cited permission is the one declared on the owner controller; the workspace
  mirrors it descriptively and the owner endpoint remains the enforcement authority.
- **Corrective Action:** a full-schema search confirms the **only** corrective field is
  `QCCheck.correctiveAction`; no `rootCause`/`preventiveAction`/`nonconformance`/`capa`/`deviation`
  exists (§2E).
- **Architectural conflicts:** none — no schema, no Helix, no roadmap edit; composition/invoke-the-owner
  matches the Sign-Out and Operations precedents.

---

## Status of this document

Feasibility audit only — no code, no schema, no Helix change, no wireframes, no implementation plan,
no commit. Presented for architectural review. On approval, the next artefact is an implementation
plan; nothing is built until that plan is separately approved.
