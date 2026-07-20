# Osieri — Quality & Governance Workspace (Phase 2C architecture)

| Field | Value |
|---|---|
| Status | Draft — architecture only; no implementation, no schema, no Helix change |
| Current Phase | Osieri Phase 2C (Quality & Governance Workspace) |
| Owner | Founder |
| Dependencies | [OSIERI_v2.md](OSIERI_v2.md) §4 W3 / persona §"Medical Director / QA lead", Helix v1.0 (frozen), existing quality modules (audit below) |
| Last Updated | 2026-07-11 |
| Priority | P1 (follows Phase 2B Sign-Out, now closed) |
| Expected Next Milestone | Architecture approval → feasibility audit → build sequencing (existing evidence first; CAPA / document control / Concordance Ledger gated on data-model decisions) |

This is the architecture for the **Quality & Governance Workspace** — Workspace 3 of the approved
blueprint ([OSIERI_v2.md](OSIERI_v2.md) §4), where the Medical Director and QA lead ensure
diagnostic quality and inspection readiness. It is architecture only: **no code, no wireframes, no
layout dimensions, no schema changes, no Helix changes, no roadmap edits.** Everything traces to the
approved architecture ([OSIERI_v2.md](OSIERI_v2.md), [../HELIX_v1.0.md](../HELIX_v1.0.md),
[../Roadmap/02_OSIERI.md](../Roadmap/02_OSIERI.md)) and to the read-only audit below. Where a
capability is missing, it is stated honestly and identified as a future product decision requiring a
schema evolution — never silently assumed.

Governing principle (from the blueprint and consistent with Sign-Out):
**quality is composed from recorded evidence; the workspace orchestrates existing owners and owns no
domain behaviour; nothing is inferred that the data does not record.**

---

## 1. Read-only audit (first requirement)

The Quality & Governance Workspace, like the Sign-Out Workspace before it
([OSIERI_SIGNOUT_WORKSPACE.md](OSIERI_SIGNOUT_WORKSPACE.md)), is a **composition surface**, not a new
system. Every capability below already has an owner module, routes, a service, a model, and recorded
evidence. This audit is the ground truth for the classification in §5; nothing here is aspirational.

**Existing quality/governance owners (verified in the codebase):**

| Domain | Owner module | Key model(s) | Web surface |
|---|---|---|---|
| Cytology–histology correlation & discordance | `correlation` | `CorrelationCase` | `/correlation`, `/correlation/:id` |
| Abnormal-result escalation | `escalation` | `EscalationRecord` | `/escalations` |
| Analytical QC (equipment / batch) | `qc` | `QCCheck`, `QCFailureAlert` | `/qc`, `/qc/equipment` |
| Proficiency testing / competency | `proficiency` | `ProficiencyTest`, `ProficiencyCase`, `ProficiencyResponse` | `/proficiency`, `/proficiency/:id` |
| Patient recall / follow-up compliance | `recall` | `RecallRecord` | `/recalls` |
| Quality analytics & benchmarks | `report-center` | (aggregates; no new model) | `/report-center` |
| Bethesda distribution / benchmarks | `bethesda` | `BethesdaResult` | `/bethesda-analytics` |
| Quality alerts (operational) | `operations` | (composed) | `/operations/quality-alerts` |
| Amendment / change requests | `change-requests`, `result-sheets` | `ResultSheetEvent` (`Deauthorized`/`Reauthorized`) | `/change-requests` |
| Turnaround / timeliness | `tat` | (Record timestamps) | (report-center TAT) |
| Staff performance (HR oversight) | `workforce` | `PerformanceReview` | `/workforce/reports` |
| Access governance / security audit | `security`, `system` | `LoginAttempt`, sessions | `/security/*` |

The blueprint names the intended backing set for Workspace 3 as `proficiency`, `correlation`,
`escalations`, `change-requests`, audit (`security`, `system`), `bethesda-analytics`, `analytics`
([OSIERI_v2.md](OSIERI_v2.md) §4 W3). The audit confirms all of these exist.

---

## 2. Purpose of the workspace

The Quality & Governance Workspace makes **quality continuous** rather than an annual scramble. Today
the evidence a Medical Director needs — discordances, proficiency results, QC failures, escalations,
amendments, recall compliance, benchmark drift — lives in **eight separate modules**. Assembling an
inspection package, or answering "are we drifting?", means visiting each surface by hand.

The workspace answers five standing questions, each backed only by recorded evidence:

1. **Are we diagnostically accurate?** — discordance and concordance across cyto/histo and AI/human.
2. **Are our people competent?** — proficiency testing and grading.
3. **Are our instruments and processes in control?** — QC checks, failures, corrective notes.
4. **Did safety-critical results reach the right person?** — abnormal-result escalation and recall.
5. **Are we inspection-ready?** — benchmark status, amendment trail, evidence assembled continuously.

Like Sign-Out, it **orchestrates existing owners**: it reads and links, it never re-implements
correlation logic, proficiency grading, QC rules, escalation transitions, or amendment workflow.

---

## 3. Primary users

- **Medical Director / QA lead (first-class persona,
  [OSIERI_v2.md](OSIERI_v2.md)):** owns diagnostic quality and inspection readiness; runs
  discrepancy and concordance review; oversees proficiency and amendments. The workspace's primary
  audience.
- **Cytotechnologist / QA technologist:** administers QC, logs corrective notes, prepares proficiency
  cases, tracks recall compliance.
- **Pathologist / Authorizer:** participates in correlation review and proficiency grading (already
  gated by `resultsheet:authorize`); consumes discordance signals.
- **Lab administrator:** consumes access-governance and audit evidence (gated by `system:security`).

Enforcement remains at the owner endpoints; the workspace's permission map is descriptive only, as in
Sign-Out.

---

## 4. The five governance concerns — kept distinct

The brief requires that these be **explicitly distinguished**, because they have different owners,
evidence, and audiences and must not be conflated in one undifferentiated "quality" bucket.

| Concern | Definition | Primary evidence today | Owner(s) |
|---|---|---|---|
| **Quality** | Is the diagnostic output accurate and consistent? | `CorrelationCase`, `BethesdaResult` benchmarks, `report-center` abnormal/CAP analytics | `correlation`, `bethesda`, `report-center` |
| **Governance** | Who did what, when, under what authority; is the trail intact? | `ResultSheetEvent`, `RecordStatusEvent`, `LoginAttempt`, `MaintenanceLog` (fragmented) | `result-sheets`, `records`, `security`, `system` |
| **Compliance** | Are we meeting external standards (CAP/CLIA) and follow-up obligations? | `report-center` CAP benchmarks, `RecallRecord` compliance, unsat/ASC-SIL benchmark status | `report-center`, `recall` |
| **Corrective Action** | When something fails, what was done and did it work? | `QCCheck.correctiveAction` (free text), `QCFailureAlert` resolution, `EscalationRecord.resolvedReason` | `qc`, `escalation` |
| **Medical Director oversight** | The human-in-authority reviews, grades, signs off | `CorrelationCase.reviewedBy`, `ProficiencyTest` grading, `EscalationRecord.reviewedBy` (all `resultsheet:authorize`-gated where clinical) | `correlation`, `proficiency`, `escalation` |

**Key finding:** *Quality*, *Compliance* (partial), and *Medical Director oversight* are well
supported by recorded evidence. *Governance* exists but is **fragmented** (no unified audit ledger),
and *Corrective Action* exists only as **free-text fields**, not a first-class CAPA lifecycle. These
two are the workspace's real gaps (§5, §6).

---

## 5. Capability inventory & classification

Classification: **Existing** (owner + route + service + model + evidence, usable today) ·
**Partial** (evidence exists but incomplete for the governance need) · **Missing** (no owner/model;
requires schema evolution) · **Future** (deliberately gated pending a data-model decision).

### 5a. Existing

| Capability | Owner service | Route(s) | Model(s) | Recorded evidence | Permission |
|---|---|---|---|---|---|
| Cyto–histo correlation & discordance review | `CorrelationService` | `GET /correlation`, `/correlation/analytics`, `/correlation/:id`, `POST /:id/review` | `CorrelationCase` | `correlationResult`, `discordanceReason`, `reviewRequired`, `reviewedBy/At`, `reviewNotes` | `record:view` / `record:change` |
| Abnormal-result escalation lifecycle | `EscalationService` | `GET /escalations`, `/summary`, `PATCH /:id/{acknowledge,review,resolve,dismiss}` | `EscalationRecord` | `severity`, `trigger`, `status`, `physicianNotifiedAt/Via`, `reviewedBy/At`, `reviewNotes`, `resolvedReason` | `record:view` / `record:change` |
| Analytical QC + failure alerts | `QcService` | `GET /qc`, `/qc/stats`, `/qc/alerts`, `PATCH /qc/alerts/:id/resolve` | `QCCheck`, `QCFailureAlert` | `checkType`, `result`, `failureReason`, `correctiveAction`, `performedBy`, `equipment`, alert `status`/`assignee`/`resolvedBy/At` | `record:view` / `record:change` |
| Proficiency testing & grading | `ProficiencyService` | `GET /proficiency`, `/analytics`, `POST /:id/{cases,grade,activate,close}` | `ProficiencyTest`, `ProficiencyCase`, `ProficiencyResponse` | `testType`, `passingScore`, `status`, responses, grading | `record:view` (read) / `resultsheet:authorize` (administer/grade) |
| Patient recall / follow-up compliance | `RecallService` | `GET /recalls`, `/summary`, `/generate-list`, `POST /:id/{complete,cancel,decline,notify-client}` | `RecallRecord` | `triggerDiagnosis`, `recallIntervalMonths`, `dueDate`, `status`, `reminderSentAt`, `completedAt`, `clientNotifiedAt` | `record:view` / `record:change` |
| Quality analytics & CAP benchmarks | `ReportCenterService` | `GET /report-center/{bethesda-trends,abnormal-rate,qc-failures,recall-compliance,cap-benchmarks,cytotechnologist-performance,tat-analysis}` | aggregates over `BethesdaResult`, `CorrelationCase`, `QCCheck`, `RecallRecord`, `Record` | ASC/SIL ratio, unsat rate, CAP benchmark status, abnormal rate | `report:view` |
| Bethesda distribution / benchmark trends | `BethesdaAnalyticsService` | `GET /bethesda/analytics/*` | `BethesdaResult` | category distribution, trend, benchmark comparison | `resultentry:view` |
| Operational quality alerts | `OperationsService` | `GET /operations/quality-alerts` | composed (no new model) | ranked quality attention signals | `record:view` |
| Access governance / security audit | `SecurityService` | `GET /security/dashboard`, `/auth/{sessions,login-attempts,locked-users,blocked-ips}` | `LoginAttempt`, session records | login attempts, blocked IPs, MFA, locked users | `system:security` |
| Staff performance (HR oversight) | `workforce` | `/workforce/reports` | `PerformanceReview` | `qualityScore`, `productivityScore`, `reviewer`, `period` | workforce permission |

### 5b. Partial

| Capability | What exists | What is missing | Consequence |
|---|---|---|---|
| **Amendment oversight** | `ResultSheetEvent` (`Deauthorized`/`Reauthorized`) records every amend cycle; `change-requests` module exists | No amendment-oversight *surface* aggregating amendments across cases with reason codes | Can be **composed read-only** from existing events (as Sign-Out already derives `amended`); a QA-facing amendment queue is composable without schema |
| **Corrective Action** | `QCCheck.correctiveAction` and `QCCheck.failureReason` free text; `EscalationRecord.resolvedReason`; `QCFailureAlert` resolution | No first-class CAPA lifecycle: no root-cause, no preventive action, no effectiveness check, no CAPA status machine | Corrective actions can be **listed** from existing fields, but a true CAPA workflow needs schema (§6) |
| **Medical Director oversight surface** | Review/grade actions exist and are `resultsheet:authorize`-gated (`correlation` review, `proficiency` grading, `escalation` review) | No single oversight surface that assembles "everything awaiting the MD's attention" across owners | Composable read-only queue is buildable today; no new model required |
| **Governance audit trail** | `ResultSheetEvent`, `RecordStatusEvent`, `LoginAttempt`, `MaintenanceLog` each record their own slice | No unified, cross-cutting, append-only governance ledger | A **read-only assembled** governance timeline is buildable (like the Sign-Out timeline); a canonical audit ledger would need schema |

### 5c. Missing (require schema evolution — see §6)

- First-class **CAPA / nonconformance / deviation** workflow (root cause, preventive action,
  effectiveness verification, status machine).
- **Document control** (SOP versioning, controlled-document register, read-acknowledgement).
- **Complaint management** (external complaint intake → investigation → closure).
- **Accreditation checklist / inspection-readiness register** (beyond the CAP-benchmark *report*):
  a tracked set of CAP/CLIA requirements with evidence links and status.
- **Competency assessment** beyond proficiency (direct-observation, blind rescreen sign-off records).

### 5d. Future (deliberately gated — consistent with the Sign-Out freeze)

- **Concordance Ledger** — the flagship two-way AI/human + human/human concordance record.
  Blocked in Phase 2B pending a data-model decision; it belongs to this workspace and remains
  **deferred** here for the same reason ([OSIERI_SIGNOUT_WORKSPACE.md](OSIERI_SIGNOUT_WORKSPACE.md) §9).
- **Read → Reveal provenance** and **quantification** — remain blocked; the workspace must not claim
  either, and must not treat `AIScreeningResult.agreedWithAI` as proof of interpretation sequence.

---

## 6. Capabilities requiring schema evolution

Everything in this section is **out of scope for a compose-only build** and must not be started
without a separate, approved schema decision (the Phase 2B discipline: stop before changing schema).

| Missing capability | Why schema is required | Minimum new model(s) (indicative only, not a design) |
|---|---|---|
| CAPA / nonconformance | No lifecycle, root-cause, or effectiveness fields exist | e.g. `CorrectiveAction` (source ref, rootCause, action, owner, dueDate, effectivenessCheck, status) |
| Concordance Ledger | No append-only concordance record; `agreedWithAI` is a single boolean without sequence | e.g. `ConcordanceEntry` (case, comparators, agreement, basis, timestamp) |
| Document control | No controlled-document register | e.g. `ControlledDocument` + `DocumentAcknowledgement` |
| Complaint management | No complaint model | e.g. `Complaint` + investigation fields |
| Accreditation register | Only computed benchmark reports, no tracked requirement set | e.g. `AccreditationRequirement` + `RequirementEvidence` |

**No schema is proposed or modified in this document.** These rows exist so the Existing/Partial
capabilities are not mistaken for a complete quality system.

---

## 7. What can be built today vs. deferred

**Buildable now (compose-only, zero schema), in the Sign-Out orchestration pattern:**

1. A **Quality & Governance shell** that composes the existing owners into one workspace with
   per-section status (`ready`/`empty`/`forbidden`/`error`) and descriptive permissions — exactly the
   contract proven in [OSIERI_SIGNOUT_WORKSPACE.md](OSIERI_SIGNOUT_WORKSPACE.md).
2. A **discordance queue** read from `CorrelationCase` (review-required, discordant results) — invoke
   the existing `/correlation/:id` owner surface, never re-implement review.
3. A **proficiency overview** read from `ProficiencyService` analytics — invoke the existing
   proficiency owner surfaces to administer/grade.
4. A **QC & failure panel** read from `QcService` (checks, open failure alerts, recorded corrective
   notes) — invoke `/qc` to resolve.
5. An **escalation oversight panel** read from `EscalationService` (open, awaiting review).
6. A **recall / follow-up compliance panel** read from `RecallService`.
7. A **benchmark & inspection-evidence panel** read from `ReportCenterService`
   (Bethesda/ASC-SIL/CAP/abnormal/recall-compliance) — read-only, no recomputation.
8. An **amendment oversight** read from `ResultSheetEvent` (assembled, like the Sign-Out timeline).
9. A **Medical-Director attention queue** composed from the above (review-required across owners),
   each item linking to its owner surface.

**Deferred (needs the §6 schema decision):** CAPA lifecycle, Concordance Ledger, document control,
complaint management, accreditation register, competency records beyond proficiency, Read→Reveal,
quantification.

---

## 8. Architectural risks

- **Quality-theatre risk.** Assembling eight modules behind one shell could *look* like a quality
  system while the real gaps (CAPA, audit ledger) stay hidden. Mitigate: classify honestly (§5),
  label Partial/Missing in the UI, never present a free-text corrective note as a CAPA record.
- **Ownership erosion.** The workspace must not become a second correlation/QC/proficiency engine.
  Mitigate: read-only composition + invoke-the-owner, enforced exactly as Sign-Out (no domain logic
  in the workspace service; no direct Prisma where an owner service exists).
- **Permission conflation.** Quality spans `record:*`, `resultsheet:authorize`, `report:view`,
  `resultentry:view`, and `system:security`. Mitigate: mirror each owner's real permission
  descriptively; enforce at the owner endpoint; never alias one to another.
- **Fragmented governance trail.** Assembling an audit timeline from four event sources risks implying
  a completeness the data does not have. Mitigate: name each source, show partial-source
  unavailability truthfully (the Sign-Out timeline pattern), and do not present it as a canonical
  ledger.
- **Inference creep.** Benchmarks and discordance invite editorializing ("we are drifting"). Mitigate:
  show recorded values and stored benchmark status only; no inferred trend or verdict.
- **Scope gravity toward schema.** The most visible gaps (CAPA, Concordance) are exactly the ones that
  need schema. Mitigate: hold the freeze; deliver the compose-only workspace first; treat schema work
  as a separate, later, approved decision.

---

## 9. Recommended implementation sequence (existing evidence only)

Mirrors the Sign-Out checkpoint discipline (isolated, reviewed increments; audit → compose → verify).
**Sequence only — not an approval to build.**

1. **C-shell** — read-only aggregate + per-section status contract + descriptive permission map.
2. **Discordance & concordance** — compose `CorrelationService`; invoke `/correlation/:id`.
3. **Proficiency** — compose `ProficiencyService` analytics; invoke proficiency owner surfaces.
4. **QC & corrective notes** — compose `QcService` (checks, alerts, recorded corrective text).
5. **Escalation oversight** — compose `EscalationService`.
6. **Recall / follow-up compliance** — compose `RecallService`.
7. **Benchmarks & inspection evidence** — compose `ReportCenterService` (read-only).
8. **Amendment oversight** — assemble `ResultSheetEvent` (compose-only, like Sign-Out timeline).
9. **Medical-Director attention queue** — compose review-required signals across the above.
10. **Verification & closeout** — full contract (states, permissions, failure isolation, a11y,
    responsive, performance, architectural audit), then a documented boundary listing every §6/§5d
    capability that remains deferred.

Steps 1–9 require **no schema change**. Anything beyond step 9 (CAPA, Concordance Ledger, document
control, complaints, accreditation register) is gated on the §6 decision and is explicitly out of this
sequence.

---

## 10. Helix freeze preservation

This workspace introduces **no Helix change**. It consumes only existing semantic tokens and
primitives (Card, Badge, Button, EmptyState, Skeleton, SectionContainer), exactly as the Sign-Out
Workspace does, and adds no new token, primitive, utility, or theme. Any new visual need is expressed
with the frozen Helix v1.0 vocabulary or deferred. The three-tier token contract and the zero-orange
constraint are inherited unchanged ([../HELIX_v1.0.md](../HELIX_v1.0.md)).

---

## 11. Traceability

- **Blueprint:** [OSIERI_v2.md](OSIERI_v2.md) §4 Workspace 3 (Quality & Governance) and the
  Medical Director / QA-lead persona.
- **Sibling workspaces (pattern source):** [OSIERI_SIGNOUT_WORKSPACE.md](OSIERI_SIGNOUT_WORKSPACE.md)
  (composition contract, section-status model, invoke-the-owner discipline) and
  [OSIERI_OPERATIONS_WORKSPACE.md](OSIERI_OPERATIONS_WORKSPACE.md) (workspace question-spine and
  Helix mapping).
- **Roadmap:** [../Roadmap/02_OSIERI.md](../Roadmap/02_OSIERI.md); releases recorded in
  [../Roadmap/08_RELEASES.md](../Roadmap/08_RELEASES.md) (not modified by this document).
- **Freeze:** [../HELIX_v1.0.md](../HELIX_v1.0.md).

---

## Status of this document

Architecture only — no code, no wireframes, no schema, no Helix change, no roadmap edit, no commit
until reviewed. On approval, the next step is a **feasibility audit** (in the manner of
[OSIERI_SIGNOUT_FEASIBILITY_AUDIT.md](OSIERI_SIGNOUT_FEASIBILITY_AUDIT.md)) that confirms the
compose-only path in §7/§9 is truthful against the current data model, before any checkpoint build
begins. Every claim above traces to the read-only audit in §1 and §5; Missing/Future capabilities are
named, not assumed.

---

## Completion status (Phase 2C — delivered)

The workspace shipped **compose-only** exactly as classified here: every Existing/Partial capability
in §5a/§5b was built, and every Missing (§5c) / Future (§5d) capability remains deferred with no schema
or Helix change. The composed surfaces are Overview, Correlation, Discordance, Quality Control,
Proficiency, Escalations, Recall, Benchmarks, Medical Director, Governance trail, and the descriptive
Permissions map. Two §5b classifications were narrowed during the build for truthfulness: the
governance trail composes only result-sheet authorizations, security access, and change-request
creation (record-status events, maintenance, and notifications were excluded as non-composable or
misrepresenting); and Medical Director oversight surfaces recorded open/review-required states only,
with no result-sheet-authorization oversight queue (no owner-actionable state exists). Full completion
record, permission matrix, performance, and limitations:
[OSIERI_QUALITY_IMPLEMENTATION_PLAN.md](OSIERI_QUALITY_IMPLEMENTATION_PLAN.md) §14.
