# Osieri v2 — Product Design Blueprint

| Field | Value |
|---|---|
| Status | Revised (post architecture review) — pending approval |
| Current Phase | Osieri Phase 2 (product) |
| Owner | Founder |
| Dependencies | Helix v1.0 (frozen), custom auth, GCS storage, Claude AI reporting path, LIS interfaces (HL7 v2 / FHIR / DICOM) |
| Last Updated | 2026-07-10 |
| Priority | P0 |
| Expected Next Milestone | Blueprint approval → Phase 2A implementation begins |

This is the master design document for Osieri from Phase 2 forward. Once approved, it is the
implementation contract: every feature traces back to a section here. It is a product
architecture document — no code, no components, no implementation.

This revision incorporates the accepted outcomes of the Product Architecture Review
([../PRODUCT_ARCHITECTURE_REVIEW.md](../PRODUCT_ARCHITECTURE_REVIEW.md)): intelligence-layer
positioning, pathology-native personas, the merged Sign-Out workspace, a day-shaped clinical
workflow, Read → Reveal as the signature interaction, Prior-Aware AI and the Concordance Ledger,
quantification as the first AI capability, a dedicated Quality & Governance capability, and a
resequenced roadmap.

Relationship to existing documentation (referenced, not duplicated):

- Product roadmap and phases: [../Roadmap/02_OSIERI.md](../Roadmap/02_OSIERI.md)
- Architecture review that shaped this revision: [../PRODUCT_ARCHITECTURE_REVIEW.md](../PRODUCT_ARCHITECTURE_REVIEW.md)
- The design system this product consumes, frozen: [../HELIX_v1.0.md](../HELIX_v1.0.md)
- AI reporting design already in place: [F4_AI_REPORTING_DESIGN.md](F4_AI_REPORTING_DESIGN.md)
- Requirements baseline and feature surface: [REQUIREMENTS_BASELINE.md](REQUIREMENTS_BASELINE.md), [NEW_FEATURES.md](NEW_FEATURES.md)
- Architecture, security, storage: [../ARCHITECTURE.md](../ARCHITECTURE.md), [DATABASE_SECURITY.md](DATABASE_SECURITY.md), [GCS_FILE_STORAGE.md](GCS_FILE_STORAGE.md)
- Decisions and debt: [../Roadmap/06_DECISIONS.md](../Roadmap/06_DECISIONS.md), [../Roadmap/07_TECHNICAL_DEBT.md](../Roadmap/07_TECHNICAL_DEBT.md)

Governing engineering constraint: **everything below must be implementable using Helix v1.0
exactly as released.** No new visual language, no new design-system abstractions. Every named
surface is built from Helix primitives consuming Helix semantic, domain, and motion tokens.

---

## 1. Product vision

### What Osieri is

Osieri is a **cytology-first diagnostic intelligence layer** for the pathology lab. It sits
alongside the laboratory's system of record, makes the lab's day observable, and gives the
pathologist a calibrated second reader that quantifies what it claims and remembers every case.

### Positioning: intelligence layer first, with the option to evolve

This is the load-bearing strategic decision, and it is now explicit.

- **Osieri enters as an intelligence and workflow layer, not a rip-and-replace of the LIS of
  record.** Labs run Epic Beaker, Cerner, or PowerPath as their system of record. Osieri
  coexists with them: it ingests orders and specimens, runs the review, reporting, and AI
  workflow, and returns results to the LIS of record over standard interfaces (HL7 v2 ORU today,
  FHIR and DICOM WSI as adopted). This lowers the barrier to entry from a multi-year platform
  migration to an additive deployment.
- **The option to evolve is deliberate.** For labs that want it, Osieri can progressively assume
  more of the record — accessioning, catalogs, operations — until it is the primary system.
  Coexistence is the default; replacement is a path, not a precondition.

### Regulatory posture

- Osieri AI is **assistive** (computer-aided detection and quantification), never autonomous. A
  human is always the decision of record. This is an architectural stance, not only a design
  principle (see [../Roadmap/06_DECISIONS.md](../Roadmap/06_DECISIONS.md) ADR-008).
- **Quantification first.** The first AI capability shipped is measurement (counts, indices,
  scoring), which carries a lower regulatory bar and delivers immediate daily value, before
  diagnostic AI. Diagnostic assistance follows once validated.
- Osieri ships **validation and verification tooling** so a lab can validate the AI and document
  it for CAP inspection — turning a customer burden into a product capability.

### The problem it solves

- **Fragmentation.** Context is lost at every tool boundary. Osieri holds the whole case in one
  place, from accession to signed report, without replacing the LIS.
- **Cognitive load.** The pathologist reconstructs the picture on every case. Osieri assembles
  evidence, prior specimens, and measurements in the order a diagnosis is actually made.
- **Opaque, un-calibrated AI.** Competitors output a score with no track record. Osieri shows
  evidence first, its concordance with the individual pathologist, and honest uncertainty.
- **Operational blindness.** Labs cannot see turnaround, workload, and SLA risk until too late.
  Osieri makes the operational state continuously visible.

### What makes it fundamentally different

1. **A calibrated, prior-aware second reader.** Positioned as the best resident who remembers
   every case you have signed and every prior on this patient — not an autopilot.
2. **Read before reveal.** The pathologist commits an impression before seeing the AI, which
   de-biases the read and builds trust from a real concordance record.
3. **Evidence and quantification before confidence.** The AI shows what it saw and measured
   before it says what it thinks.
4. **The pathologist signs.** AI is assistive by architecture; every AI contribution is
   traceable to the pixel.

---

## 2. Design principles

1. **AI assists the pathologist.** AI proposes; the pathologist disposes. No AI output is ever
   the decision of record.
2. **Read before reveal.** Where clinically appropriate, the pathologist forms and commits an
   impression before the AI is shown. De-biasing is a designed behavior, not a hope.
3. **Evidence and measurement before confidence.** No conclusion without its supporting evidence
   and quantification in the same view. Confidence is earned, and it is calibrated to the
   individual reader.
4. **Progressive disclosure.** Show the minimum needed to act; reveal depth on demand. The
   default view is calm; the detail is one interaction away.
5. **Clinical workflow first, shaped by the day.** Every surface serves a step in a real
   diagnostic or operational workflow, and the workflow is modeled on the pathologist's
   interrupt-driven day, not a linear pipeline.
6. **Quality is a product, not a report.** Discrepancy, concordance, proficiency, and amendments
   are first-class, continuous surfaces — not an after-the-fact export.
7. **Enterprise reliability.** Graceful degradation everywhere; the AI never throws; no false
   empty states; tenancy enforced structurally; coexistence with the LIS of record.
8. **Every interaction reduces cognitive load,** and every consequential action — human and AI —
   is traceable and recoverable.

---

## 3. Primary personas

Pathology-native roles, in place of generic software roles. Order reflects centrality to the
core workflow.

### Cytotechnologist (primary screener — first-class)

- **Goals:** Screen high volumes accurately; confirm the normal quickly; flag the abnormal for
  pathologist review; not miss anything.
- **Pain points:** Fatigue on volume; unclear prioritization; disconnected screening and review;
  no assist on counting or triage.
- **Daily workflow:** Pull the screening queue → rapid-triage normal cases → mark and annotate
  abnormals → route flagged cases to the pathologist with context.
- **Critical tasks:** Batch screening, flagging, annotation, quantitative assist, hand-off.

### Pathologist (diagnostic authority)

- **Goals:** Reach a correct diagnosis quickly and confidently; sign out defensibly; spend
  attention on hard cases.
- **Pain points:** Tool switching; reconstructing context and priors; opaque AI; slow slides;
  reporting friction; interruptions.
- **Daily workflow:** Worklist → open case → read → reveal AI → weigh evidence and priors →
  accept/adjust/override → report → sign out.
- **Critical tasks:** Read, evidence assessment, quantification review, authorization, sign-out,
  amendments, consultation.

### Resident / fellow (trainee — first-class in academic labs)

- **Goals:** Learn by previewing cases; prepare drafts for attending sign-out; build judgment.
- **Pain points:** Unclear hand-off; feedback lost; no visibility into where they diverged from
  the attending.
- **Daily workflow:** Preview assigned cases → draft impression and report → hand off to
  attending → receive and review corrections.
- **Critical tasks:** Preview, draft, hand-off, discrepancy learning.

### Medical Director / QA lead (clinical quality governance — first-class)

- **Goals:** Ensure diagnostic quality; run discrepancy and concordance review; maintain
  proficiency and CAP readiness.
- **Pain points:** Assembling quality evidence by hand; discrepancies found late; proficiency and
  amendments tracked in spreadsheets.
- **Daily workflow:** Review discrepancy and concordance signals → run QA case review →
  administer proficiency → prepare inspection evidence.
- **Critical tasks:** Discrepancy review, concordance monitoring, proficiency, amendment
  oversight, CAP evidence.

### Lab operations manager (throughput and SLA)

- **Goals:** Meet turnaround and SLA; balance workload; catch bottlenecks before breach.
- **Daily workflow:** Operations board → rebalance assignments → clear escalations → review
  turnaround and workload → staff the next shift.
- **Critical tasks:** Queue management, SLA monitoring, staffing, workload balancing, escalation.

### Lab technician (specimen and slide preparation)

- **Goals:** Move specimens through preparation, scanning, and QC accurately and on time.
- **Daily workflow:** Accession → process and stain → scan → QC → release to the queue; handle
  IHC / special-stain orders returning from pathologists.
- **Critical tasks:** Accessioning, scanning, QC, batch handling, reagent/inventory, special-stain
  fulfillment.

### Referring clinician (portal — first-class, already shipped)

- **Goals:** Submit requisitions; track status; receive results and reports; ask questions.
- **Daily workflow:** Submit requisition → track turnaround → receive report → raise a change
  request or message.
- **Critical tasks:** Requisition, status tracking, report retrieval, messaging.

### Administrator / IT (configuration, integration, scale)

- **Goals:** Configure the lab; manage users, roles, and catalogs; integrate with hospital
  systems; run multi-site at scale.
- **Critical tasks:** User/role management, catalog maintenance, integration (HL7 v2 / FHIR /
  DICOM), API, multi-site administration, monitoring.

### Phase 3 personas (planned, not first-class yet)

Molecular / genomic pathologist; tumor-board (MDT) participants; external consultant / referring
pathologist. Designed for when the product reaches molecular integration and cross-institution
consults.

---

## 4. Core workspaces

Four workspaces, recut from the review. A workspace is a durable context a person works within;
navigation inside it does not feel like leaving. Each is composed entirely from Helix primitives.

### Workspace 1 — Sign-Out Workspace (the signature; review and report merged)

Review and reporting are one continuous act, not two places. This is the defining Osieri
experience and the home the pathologist lives in.

- **Purpose:** Take a case from "ready" to "signed out" — read, reveal AI, weigh evidence and
  priors, quantify, draft the report, and sign — without leaving the workspace.
- **Composition:** The case at the center: slides (WSI), specimen and prior-case context, AI
  evidence and quantification revealed after the pathologist's read, and the report drafting
  *inside* the review, traceable to the evidence. Report drafting is not a destination; it is a
  panel of the same surface.
- **Backed by (today's surface, recomposed):** `wsi`, `ai-screening`, `bethesda`, `result-sheets`,
  `result-templates`, `reports`, `report-center`, `coding`, `authorizer`, `batch-authorize`,
  `correlation`.
- **Signature behaviors:** Read → Reveal; prior-aware reading; trustworthy quantification; report
  traceable to the pixel; concordance recorded on every sign-out.

### Workspace 2 — Laboratory Operations

The command surface for keeping the lab flowing and on time.

- **Purpose:** Make the live state of the lab continuously visible and directly actionable.
- **Composition:** Worklist intelligence, queues, turnaround, workload, staffing, SLA, and the
  special-stain / IHC return loop on one board; drill from a metric to the cases behind it; act
  in place.
- **Backed by:** `dashboard`, `records`, `requisitions`, `req-tracking`, `tat`, `workload`, `qc`,
  `reagents`, `workforce`, `escalations`, `recalls`.
- **Signature behaviors:** the workflow timeline; SLA risk surfaced before breach; the IHC
  re-review loop made visible; no false empty states while operational data loads.

### Workspace 3 — Quality & Governance (elevated to first-class)

Where the Medical Director and QA ensure diagnostic quality and inspection readiness.

- **Purpose:** Make quality continuous — discrepancy, concordance, proficiency, and amendments as
  living surfaces, not an annual scramble.
- **Composition:** Discordance queue (AI/human and human/human disagreements routed here);
  concordance analytics; proficiency administration; amendment oversight; CAP inspection evidence
  and clinical audit.
- **Backed by:** `proficiency`, `correlation`, `escalations`, `change-requests`, audit
  (`security`, `system`), `bethesda-analytics`, `analytics`.
- **Signature behaviors:** discordance as a two-way safety signal; concordance monitoring across
  the lab; inspection evidence assembled continuously.

### Workspace 4 — Enterprise Administration

Where the lab is configured, governed operationally, and integrated.

- **Purpose:** Administer organizations, people, permissions, integrations, and API at scale.
- **Composition:** Organizations and sites; users, roles, and permissions; integrations (HL7 v2,
  FHIR, DICOM, endpoints) and API; catalogs; system health and feature configuration.
- **Backed by:** `users`, `roles`, `departments`, `employees`, `security`, `system`, `superuser`,
  `fhir`, `settings`, `lab-codes`, `services`, `taxes`.
- **Signature behaviors:** permission changes that are legible and reversible; integration state
  that is observable; audit export for compliance.

---

## 5. Information architecture

### Asymmetric by design

Global navigation selects a workspace; work happens inside it. But the workspaces are not
co-equal in time: the pathologist lives in **Sign-Out** most of the day; Operations, Quality, and
Administration are episodic destinations. The IA reflects this — Sign-Out (or its worklist) is
home; the others are entered deliberately.

### Global navigation (always present, role-filtered)

- The four workspaces — Sign-Out, Laboratory Operations, Quality & Governance, Enterprise
  Administration — filtered by role (a technician does not see Quality or Administration; a
  referring clinician sees the portal only).
- Global search with pathology pivots: by accession, patient, specimen, report, and case type /
  subspecialty.
- Notifications (scoped by lab; realtime).
- Current user, lab context, and profile.

Global navigation and content share one scroll container (locked constraint from
[../CLAUDE.md](../CLAUDE.md)).

### Inside a workspace

- Each workspace owns its local structure: worklist and case in Sign-Out; board and drill-downs
  in Operations; discordance and concordance in Quality; registers in Administration.
- **The prior-case pivot is a standing element of case context,** not a search result. The
  patient's prior specimens are always one gesture away inside Sign-Out.
- Progressive disclosure governs depth. Cross-workspace jumps carry full state: a queue in
  Operations opens the case in Sign-Out; a discordance in Quality opens the case and its evidence.

### How navigation should feel

Calm, oriented, continuous. The user always knows which workspace they are in and which step of
the workflow they are on. Motion communicates continuity, never decoration (Helix motion
grammar). Route loading shows a cue within budget and never a false empty state.

---

## 6. AI interaction model

The AI layer is the product's differentiating surface. It is governed by *read before reveal*,
*evidence and measurement before confidence*, and *AI assists the pathologist*.

### Read → Reveal (the core interaction)

- Where clinically appropriate, the pathologist reads the case and **commits a preliminary
  impression before the AI is revealed.** The AI is then shown as agreement or disagreement
  against that impression.
- This does three things at once: it **de-biases** the read (no anchoring on an AI verdict), it
  **builds calibrated trust** (the pathologist sees the AI earn its agreement), and it **generates
  the concordance record** (see Ledger below).
- Read → Reveal is configurable per workflow and per user: mandatory for teaching and QA contexts,
  optional for high-volume routine screening where speed dominates.

### Quantification first (the first AI capability)

- The AI's first and safest contribution is **measurement**: counts and indices (mitotic count,
  Ki-67, cellularity, HER2 scoring, and cytology-relevant quantities).
- Quantification is **shown, editable, and defensible**: the counted or measured objects are
  visible on the slide, the pathologist can adjust them, and the final number carries into the
  report with its provenance.
- Quantification ships before diagnostic AI because it is lower regulatory risk and higher daily
  value.

### Prior-aware AI

- The AI automatically surfaces the patient's **prior specimens** and states the delta ("compared
  to the 2023 biopsy, this shows progression"), turning a manual hunt into an automatic one.
- Prior context is part of the case, always available, and cited in evidence.

### How confidence and evidence are presented

- Evidence and quantification come first; a conclusion is never shown without them in the same
  view.
- Confidence is a supporting attribute expressed through the domain status/priority token layer —
  never an invented colour or a bare floating number — and is always **calibrated to the
  individual reader** via the Ledger.
- Every AI finding links to the specific slide regions and data it derived from; those links
  persist into the report.

### The Concordance Ledger (the trust mechanism)

- The AI shows its **track record with the individual pathologist**: agreement rate over time, by
  case type, and the pattern in the cases where they diverged.
- Trust becomes data the pathologist can inspect, not a claim. New models and new case types start
  with visibly lower calibration and earn it.

### How uncertainty is handled, and how override works

- Uncertainty is stated, not hidden: low-confidence or ambiguous findings are surfaced as such,
  with what the AI is unsure about and why. Degraded and unavailable AI states are explicit; the
  pathologist can always proceed without the AI.
- Accept, adjust, or override is a first-class single gesture on every finding. An override is
  recorded with rationale where clinically appropriate and fully audited.
- **Discordance is a two-way signal.** Every AI/human disagreement is both audited and routed to
  Quality & Governance (Workspace 3), where it either catches a human miss or exposes an AI
  weakness. Override is never a dead end.

---

## 7. Clinical workflow — the pathologist's day

The workflow is modeled on the pathologist's interrupt-driven day, not the specimen's linear
journey. The specimen pipeline (accession → scan → QC → queue → sign-out → report → archive) is
the operational substrate beneath it, owned by Laboratory Operations; the day below is what the
pathologist actually experiences.

### The worklist is the starting point

The day opens on a worklist, and its **intelligence is the first thing designed**: prioritized by
urgency (STAT, frozen pending), age against SLA, subspecialty routing, and — critically —
**readiness** (cases whose IHC and molecular have returned versus those still waiting). The
pathologist should never hunt for "what can I actually sign right now."

### The core loop: read → reveal → weigh → quantify → report → sign

Inside Sign-Out, for each case: read and commit an impression, reveal the AI, weigh evidence and
priors, review and adjust quantification, draft the report inside the review, and sign. One
continuous surface; the report is not a separate trip.

### Interrupts and non-linear paths (designed, not incidental)

- **Frozen section (intraoperative consult).** The highest-stakes minutes in the building: a
  surgeon is waiting, turnaround is ~20 minutes, and the answer changes the operation in progress.
  It has a dedicated, stripped, time-boxed mode that pre-empts the worklist and shows only what is
  needed to answer fast.
- **The IHC / special-stains loop.** After reading H&E, the pathologist orders IHC; the case
  returns to the lab and comes back hours later. The workflow models "review → order → wait →
  re-review," and the case re-enters the worklist as *ready* when stains return (visible in
  Operations).
- **Batch cytology screening.** For the cytotechnologist and for the pathologist reviewing
  flagged cases: rapid triage of many normal cases with the abnormal surfaced. A designed batch
  experience, not batch authorization alone.
- **Consults and second opinions.** The informal curbside ("come look at this") and the formal
  intradepartmental consult, both sync and async, with context carried.
- **Late amendments / addenda.** A signed report that must change when molecular returns days
  later: a first-class, audited, notification-driven loop that reaches the referring clinician and
  routes the change through Quality & Governance.

---

## 8. Enterprise capabilities

Cross-cutting capabilities every workspace inherits, answered explicitly for institutional buyers.

- **LIS coexistence (system-of-record posture).** Osieri returns results to the LIS of record over
  **HL7 v2 (ORU)** today, with **FHIR** and **DICOM WSI** as adopted. Coexistence is the default;
  evolution to primary system is optional. *Backed by:* `fhir` plus interface work sequenced in
  Phase 2A.
- **Role-based access.** Roles and permissions gate every workspace and action; navigation is
  role-filtered. *Backed by:* `roles`, `users`, `security`.
- **Audit trail and e-signatures.** Every consequential action — human and AI — is recorded and
  recoverable; sign-out meets **21 CFR Part 11** e-signature expectations. Audit is a first-class
  surface in Quality & Governance, not a hidden log.
- **Compliance.** HIPAA, SOC 2, CAP, CLIA posture evidenced in-product; redaction stays on the AI
  path. *Referenced:* [DATABASE_SECURITY.md](DATABASE_SECURITY.md), [SECURITY.md](SECURITY.md).
- **Validation and verification tooling.** Osieri helps a lab validate the AI and document it for
  CAP inspection — a customer burden turned into a capability.
- **Multi-site labs.** Tenancy enforced structurally via `labId` + AsyncLocalStorage + a Prisma
  extension; never trusted from the request body. Multi-site administration and load balancing for
  reference-lab scale.
- **Gigapixel imaging at scale.** Whole-slide images are 1–4 GB, gigapixel; storage, streaming,
  and retention are treated as an explicit architectural concern (GCS today; scale and DICOM
  interop planned). *Referenced:* [GCS_FILE_STORAGE.md](GCS_FILE_STORAGE.md).
- **Batch processing.** High-volume operations (batch authorization, batch screening, batch
  handling) are first-class.
- **Enterprise quality analytics.** Turnaround by subspecialty, discrepancy and amendment rates,
  concordance, and proficiency — the Medical Director's dashboard and the CAP inspector's evidence.
  *Backed by:* `analytics`, `bethesda-analytics`, `tat`, `workload`, Quality & Governance.
- **Scalability.** In-process jobs (no queue) are recorded as debt (TD-004) and addressed before
  enterprise load; see [../Roadmap/07_TECHNICAL_DEBT.md](../Roadmap/07_TECHNICAL_DEBT.md).

---

## 9. Signature experiences

Product behaviors, not animations — the interactions Osieri is remembered for. All implementable
with Helix v1.0 primitives and motion tokens. Ranked by memorability and defensibility.

1. **Read → Reveal.** Commit your impression, then see whether the AI agrees. De-biases the read,
   builds calibrated trust, and writes your concordance record. The signature.
2. **Report traceable to the pixel.** Every statement in the finished report links back to the
   evidence and the decision that produced it. A reader can always ask "on what basis?"
3. **Prior-aware reading.** The system automatically surfaces the patient's prior specimens and
   states the delta — turning a painful manual hunt into an automatic one.
4. **Trustworthy quantification.** One gesture to count or measure, with the counted objects shown,
   editable, and defensible in the report.
5. **The Concordance Ledger.** The AI's track record with you, by case type. Trust as data.
6. **Frozen-section mode.** A calm, time-boxed, single-purpose intraoperative surface for the
   highest-stakes minutes in the lab.

---

## 10. Success metrics

Measurable outcomes that define whether Phase 2 improved the practice of pathology.

| Metric | Definition | Direction |
|---|---|---|
| Review time | Opening a case to sign-out | Decrease |
| Turnaround time | Specimen arrival to released report | Decrease |
| Diagnostic confidence | Pathologist-reported confidence at sign-out | Increase |
| AI–reader concordance | Agreement rate, tracked per reader and case type | Increase, calibrated |
| Discordance catch value | Share of discordances that caught a genuine issue (human or AI) | Increase |
| Automation-bias resistance | Rate of independent impression committed before reveal (Read → Reveal adoption) | Increase |
| Quantification adoption | Share of eligible cases using AI quantification | Increase |
| Workflow efficiency | Steps and tool-switches per case | Decrease |
| SLA adherence | Cases meeting turnaround targets | Increase |
| Report amendment rate | Post-sign-out corrections | Decrease |
| AI degradation frequency | Rate of AI-unavailable states during review | Decrease |

Foundational quality bars remain non-negotiable, inherited from Helix and the experience budgets:
cold start ≤ 2000ms, route content ≤ 400ms / cue ≤ 200ms, interaction ≤ 100ms; zero silent
actions; zero-orange 0px; no false empty state while loading.

---

## 11. Roadmap and sequencing

Resequenced to balance flagship product value with enterprise adoption. The signature Sign-Out
experience arrives early enough to differentiate, but the lab can adopt Osieri — and Osieri can
earn revenue — before diagnostic AI is validated. Integration is foundational, not an afterthought.

### Phase 2A — Foundation and adoption (no FDA gate)

- Laboratory Operations: worklist intelligence, queues, turnaround, workload, SLA, the IHC return
  loop.
- **Integration as a first-class workstream:** HL7 v2 (ORU) result return, FHIR, and the DICOM WSI
  path — the gate to any deployment.
- The enterprise adoption wedge: sellable value with no regulatory dependency.

### Phase 2B — Flagship Sign-Out (the differentiator)

- The merged Sign-Out workspace: Read → Reveal, report traceable to the pixel, prior-aware reading.
- **Quantification AI** as the first AI capability (lower regulatory bar, immediate value).
- The Concordance Ledger begins recording from the first sign-out.

### Phase 2C — Diagnostic intelligence and quality

- Diagnostic AI assistance, once validated; the Concordance Ledger matures into calibrated
  confidence.
- **Quality & Governance** workspace: discordance queue, concordance monitoring, proficiency,
  amendment oversight, CAP evidence — made possible by the data from 2A–2B.

### Phase 2D — Enterprise scale

- Multi-site administration and reference-lab scale; gigapixel storage/streaming hardening;
  validation tooling; enterprise quality analytics; queue/async infrastructure (TD-004).

Sequencing rationale: revenue and adoption before regulatory risk; the flagship experience early;
integration foundational; quality built on accumulated concordance data; scale last.

---

## Engineering constraints (binding)

- Do not modify or redesign Helix. Consume Helix v1.0 exactly as released.
- Do not invent a new visual language or new design-system abstractions.
- Every surface is composed from Helix primitives consuming Helix semantic, domain, and motion
  tokens — no raw hex, no raw duration or easing, no hue names in components.
- Preserve everything that works: routes, APIs, auth, GCS storage, the Claude AI reporting path,
  and business logic. Refactor over replace; no breaking changes. Coexist with the LIS of record.
- The product UI stays indigo; do not recolor it. Surface contradictions instead of guessing.
- Any limitation Helix cannot express is recorded in [../Roadmap/05_HELIX_v1_1.md](../Roadmap/05_HELIX_v1_1.md)
  with the evidence that exposed it — it is not solved by bending Helix.

## Status of this document

This revised blueprint incorporates the accepted architecture-review outcomes and becomes the
implementation contract for Osieri Phase 2 once approved. No implementation begins until then.
Features are built workspace-by-workspace and workflow-by-workflow, each tracing to a section
here, verified against the foundational quality bars, and recorded in
[../Roadmap/08_RELEASES.md](../Roadmap/08_RELEASES.md).
