# Osieri — Sign-Out Workspace (Phase 2B architecture)

| Field | Value |
|---|---|
| Status | Draft — architecture only; implementation contract pending approval |
| Current Phase | Osieri Phase 2B (Sign-Out Workspace) |
| Owner | Founder |
| Dependencies | [OSIERI_v2.md](OSIERI_v2.md) §4 W1 / §6 / §9, Helix v1.0 (frozen), existing diagnosis modules (audit below) |
| Last Updated | 2026-07-11 |
| Priority | P0 |
| Expected Next Milestone | Contract approval → build sequencing (existing capabilities first; Read→Reveal + Concordance gated on a data-model decision) |

This is the implementation contract for the Sign-Out Workspace — Workspace 1 of the approved
blueprint ([OSIERI_v2.md](OSIERI_v2.md) §4), the flagship where a pathologist performs diagnosis,
review, reporting, and sign-out, and where they spend the majority of the day. It is architecture
only: no code, no wireframes, no layout dimensions, no Helix changes. Everything traces to the
approved architecture ([OSIERI_v2.md](OSIERI_v2.md), [../HELIX_v1.0.md](../HELIX_v1.0.md),
[../Roadmap/02_OSIERI.md](../Roadmap/02_OSIERI.md)) and to the read-only audit below. Where a
capability is missing, it is stated honestly and identified as a future product decision, never
silently assumed.

Governing principle (from the blueprint): **the human remains the decision of record; AI assists;
evidence comes before confidence.**

---

## 1. Read-only audit (first requirement)

Every diagnosis-related capability was mapped to its real backing (module · route · model ·
service). Classification: **existing** · **partial** (real but incomplete for sign-out) ·
**placeholder** · **missing** · **outside scope**.

| Capability | Class | Backing (real) |
|---|---|---|
| Whole Slide Imaging | **existing** | `wsi` module · `/wsi` · `DigitalSlide` (slideUrl, format, magnification, stain, scanner) |
| Digital slides | **existing** | `DigitalSlide` (per record), `wsi.service` |
| Slide annotations | **partial** | `SlideAnnotation` (point `x`,`y` + `label` + `color` only — no regions, polygons, or measurements) |
| AI screening | **existing** | `ai-screening` module · `/ai-screening` · `AIScreeningResult` (status, confidence, confidenceLevel, reviewedBy) |
| AI findings | **existing** | `AIScreeningResult.findings` (JSON `[{region, finding, confidence}]`), `primaryFinding`, `flaggedAreas` |
| Bethesda | **existing** | `bethesda` module · `BethesdaResult` (adequacy, categories, subtypes, recommendation) |
| Correlation | **existing** | `correlation` module · `/correlation` · `CorrelationCase` (cytology dx + histology dx + `correlationResult`) |
| Authorizer / sign-out | **existing** | `/authorizer`, `AuthorizationModal`; `ResultSheet.authorized`/`authorizedAt`/`authorizedBy`; AI code-suggest + consistency check |
| Result editor | **existing** | `result-sheets` module · `ResultSheet` → `ResultEntry` → `ResultLine` (abbreviation, result, findings, abnormalFinding) |
| Report generation | **existing** | `reports` / `report-center` modules · `Report` (content, medicalEntry, writtenBy, releasedAt) |
| Report approval | **existing** | `ResultSheet.authorized` + `ResultSheetEvent` (Authorized / Deauthorized / Reauthorized) |
| Prior cases / previous reports / patient history | **partial** | data exists (records/reports by `patientId`, `patients` module) but there is no prior-aware surface integrated into the diagnostic flow |
| Images | **existing** | `SpecimenImage`, `DigitalSlide` |
| Findings (human) | **existing** | `ResultLine.findings`, `ResultEntry` |
| Case timeline | **partial** | `RecordStatusEvent` + `ResultSheetEvent` exist; no unified case-timeline surface is assembled |
| Audit history | **existing** | status/result events + `AiDraft` (model id, `promptVersion`, `redactionPolicy`, `inputDigest`, `editedDiff`) + `RecordCoding` |
| Amendments | **existing** | `ResultSheetEvent` Deauthorized → Reauthorized; `Report` re-issue; `editReason` |
| Electronic signature | **partial** | `Report.signature` + `Report.digitalSignature`, `ResultSheet.authorizedBy`/`At`, `Lab.signatureUrl` — a signature exists, but not a 21 CFR Part 11-grade signature manifestation |
| Attachments / supporting documents | **existing** | `files` module · `RecordAttachment` |
| AI-assisted report drafting | **existing** | `AiDraft` (F4): AI output → `finalText` with structured `editedDiff`, accept audit, redaction-policy snapshot |
| **Read → Reveal (committed pre-reveal interpretation + gated AI)** | **missing** | no stored committed initial interpretation, no reveal gating; only a post-hoc `AIScreeningResult.agreedWithAI` boolean |
| **Concordance Ledger (longitudinal, per-reader, by case-type)** | **missing / partial** | per-case `agreedWithAI` + `reviewedBy` exist; no committed interpretation, override reason, outcome, or aggregation entity |
| AI quantification (counts, indices, scoring) | **missing** | `AIScreeningResult` has confidence + findings + `flaggedAreas`, but no measured counts/indices |
| AI supporting literature / citations | **missing** | not modeled |
| Molecular / genomic integration | **outside scope** | not modeled (cytology domain; Phase 3 persona) |

**Headline:** the diagnostic substrate is largely real (imaging, AI findings, Bethesda,
correlation, result editing, reporting, approval, audit, amendments, attachments, AI-assisted
drafting). The flagship **Read → Reveal** and a true **Concordance Ledger** are **not** supported by
the current data model, and AI **quantification** and **literature** are absent. These are called
out honestly throughout and consolidated in §14 as future product decisions.

---

## 2. Workspace vision

The Sign-Out Workspace is one continuous diagnostic surface — not a set of pages a pathologist
travels between, but a single place that carries a case from *ready to read* to *signed and
archived*. The reading surface (slides), the evidence (AI findings and quantification), the prior
context, the report draft, the timeline, and the sign-out action all live in one workspace so the
pathologist never reconstructs context across tools. It is the flagship because it is where the
diagnosis is actually made, and it is designed so the pathologist can stay in it all day.

It consumes Helix v1.0 exactly as frozen ([../HELIX_v1.0.md](../HELIX_v1.0.md)); it introduces no
new visual language. It is the concrete expression of blueprint Workspace 1
([OSIERI_v2.md](OSIERI_v2.md) §4) and the AI interaction model ([OSIERI_v2.md](OSIERI_v2.md) §6).

## 3. Primary users

- **Pathologist (diagnostic authority).** Reads, interprets, weighs evidence and priors, quantifies,
  drafts, and signs. Lives here most of the day. The decision of record.
- **Resident / fellow (trainee).** Previews cases and drafts an interpretation for attending
  sign-out; the workspace is also where they learn from where they diverged. Read→Reveal is
  mandatory here (teaching). *(Read→Reveal is a future capability — §5.)*
- **Cytotechnologist (primary screener).** Screens and flags; routes flagged cases into the
  pathologist's worklist with context. In cytology the cytotech's screen precedes the pathologist's
  read. *(Backed by `ai-screening` / `bethesda`; batch screening was declined in Phase 2A —
  [OSIERI_CYTOLOGY_BATCH_AUDIT.md](OSIERI_CYTOLOGY_BATCH_AUDIT.md).)*
- **Medical Director / QA.** Consumes concordance and discrepancy signals produced here; oversees
  amendments. *(Concordance Ledger is a future capability — §9.)*

Persona basis: [OSIERI_v2.md](OSIERI_v2.md) §3.

## 4. Diagnostic workflow (one continuous flow)

`Read → Initial interpretation → Reveal AI → Compare → Report → Sign → Archive.` Each transition:

1. **Read.** The pathologist opens the case and reads the slides (WSI), with specimen context and
   priors available. *Backing: `DigitalSlide`/`wsi` (existing), priors (partial).* Transition to
   next: the read is deliberate; the AI is not yet shown.
2. **Initial interpretation.** The pathologist records their own impression before the AI is
   visible. *Backing: **missing** — no committed-interpretation model today (§5).* Transition:
   committing the interpretation unlocks the reveal.
3. **Reveal AI.** Only after the interpretation is committed is the AI shown — findings first, then
   confidence. *Backing: `AIScreeningResult` findings/confidence (existing); the **gating** is
   missing (§5).* Transition: the human now has both their impression and the AI's.
4. **Compare.** The human weighs their interpretation against the AI's evidence and quantification,
   and against priors. *Backing: AI findings (existing), quantification (missing), priors (partial).*
   Transition: the human accepts, modifies, or rejects the AI — the human decides.
5. **Report.** The findings become a structured report, drafted inside the workspace, AI-assisted
   where chosen. *Backing: `ResultSheet`/`ResultEntry`/`ResultLine` + `AiDraft` + `Report`
   (existing).* Transition: the draft is reviewed and finalized.
6. **Sign.** The pathologist authorizes and signs; the human decision becomes the record. *Backing:
   `ResultSheet.authorized`/`authorizedBy`/`authorizedAt`, `Report.signature`, `ResultSheetEvent`
   Authorized (existing; e-signature partial).* Transition: the case is released.
7. **Archive.** The signed case, its evidence, report, and full history are retained and
   retrievable; amendments remain possible with audit. *Backing: records + `RecordAttachment` +
   status/result events (existing); amendments via Deauthorize→Reauthorize (existing).*

The specimen-pipeline substrate (accession → scan → QC → ready) is owned by Operations
([OSIERI_OPERATIONS_WORKSPACE.md](OSIERI_OPERATIONS_WORKSPACE.md)); Sign-Out begins at *ready to
read* and hands finished cases back for archive/interoperability.

## 5. Read → Reveal (the flagship interaction)

The defining Osieri interaction, and the clearest expression of *evidence before confidence*.

**The interaction.** (1) The pathologist reads the case. (2) They record an initial interpretation.
(3) The AI remains hidden until that interpretation is committed. (4) The AI is revealed —
evidence first. (5) The human compares. (6) The human accepts, modifies, or rejects. (7)
Concordance (their interpretation vs the AI) is recorded.

**Rationale.** Reading blind, then revealing, does three things at once:

- **Cognitive-bias reduction.** Committing first prevents *automation bias* — anchoring on an AI
  verdict. The human forms an independent judgment, then sees whether the AI agrees.
- **Trust building.** The pathologist watches the AI earn its agreement over time, rather than being
  told to trust it. Trust becomes calibrated to their own experience.
- **Evidence trail.** The committed interpretation, the reveal, and the comparison form a recorded,
  ordered sequence — the raw material of the Concordance Ledger (§9) and of traceability (§10).

**Audit implications.** Read→Reveal must record: the committed interpretation with its timestamp
*before* the reveal timestamp; the reveal event; and the human's accept/modify/reject decision with
rationale. This ordering is the evidence that the read was independent.

**Honest capability gap.** The current data model has **no** committed-interpretation record and
**no** reveal gating; it has only a post-hoc `AIScreeningResult.agreedWithAI` boolean, which cannot
prove the interpretation preceded the AI. **Read→Reveal therefore requires a future data-model
decision** (a committed-interpretation entity with ordered timestamps and a reveal/decision event).
It is designed here as the flagship, and explicitly flagged as not-yet-supported — it must not be
faked with the existing agreement flag. See §14.

Read→Reveal is configurable per workflow and user (mandatory for teaching/QA, optional for
high-volume routine screening), consistent with [OSIERI_v2.md](OSIERI_v2.md) §6.

## 6. AI model — how AI participates

AI assists; it never decides. Its contributions are separated so evidence always leads and
confidence never does ([OSIERI_v2.md](OSIERI_v2.md) §6):

- **Evidence (existing).** What the AI observed and where — `AIScreeningResult.findings`
  (`[{region, finding, confidence}]`), `flaggedAreas`, linked to slide regions. Shown first.
- **Quantification (missing).** Counts, indices, and scoring (e.g. mitotic count, Ki-67) — AI's
  safest, most defensible contribution. Not modeled today; a future capability (§14) and the
  blueprint's stated quantification-first direction ([OSIERI_v2.md](OSIERI_v2.md) §6).
- **Pattern detection (existing).** `primaryFinding` and flagged regions — the AI's pattern read,
  presented as evidence, not verdict.
- **Suggested findings / coding (existing).** AI code suggestions and consistency checks in the
  authorization flow (`AuthorizationModal`), and AI-assisted narrative via `AiDraft`.
- **Supporting literature (missing).** Citations behind a finding — not modeled; a future capability.
- **Prior correlation (partial).** Relating the current case to priors — data exists (§7); the
  integrated surface does not.
- **Confidence (existing, subordinate).** `confidence` / `confidenceLevel` — always a supporting
  attribute paired with its evidence, expressed through the domain token layer, never a leading
  headline, and (once Read→Reveal exists) calibrated to the individual reader via the Ledger.

The AI never throws; every AI surface has a defined unavailable state; redaction stays in place
(`AiDraft.redactionPolicy` / `inputDigest`) — [../Roadmap/06_DECISIONS.md](../Roadmap/06_DECISIONS.md)
ADR-008.

## 7. Prior-aware review

Pathology is longitudinal; the current case is read against the patient's history. Priors provide
**context, never an override** of the current interpretation.

- **Previous cytology / histology.** Prior records for the patient (`Record` by `patientId`), with
  their result sheets and Bethesda results. *Existing data; integrated surface partial.*
- **Prior diagnosis.** From prior `ResultSheet`/`Report`. *Existing data.*
- **Previous amendments.** Prior deauthorize→reauthorize history (`ResultSheetEvent`). *Existing.*
- **Trend over time.** The sequence of prior diagnoses and, where present, correlation outcomes
  (`CorrelationCase`). *Existing data; no trend surface assembled.*
- **Patient history.** `patients` module + `PatientAddress`/demographics.

**Honest gap:** the *data* for prior-aware review exists; a **prior-aware surface inside Sign-Out**
(one gesture to the patient's priors and their delta) is **not built** — it is design work over
existing data, not a new model. The prior-case pivot is a first-order need
([OSIERI_v2.md](OSIERI_v2.md) §5), so it is a standing element of case context here.

## 8. Reporting (inside Sign-Out — not a separate workspace)

Report drafting lives *inside* Sign-Out; there is no separate reporting workspace
([OSIERI_v2.md](OSIERI_v2.md) §4, the merge of review and report):

- **Draft.** The report is drafted from the result sheet (`ResultEntry`/`ResultLine`), AI-assisted
  where chosen (`AiDraft`: AI output → editable `finalText`, structured `editedDiff`). *Existing.*
- **Review.** The draft is reviewed against its evidence in the same surface. *Existing.*
- **Editing.** `ResultSheet.narrative` / result lines; `AiDraft.finalText`. *Existing.*
- **Approval.** Authorization (`ResultSheet.authorized`, `AuthorizationModal`), with AI consistency
  check as assist. *Existing.*
- **Signature.** `Report.signature` / `digitalSignature`; `ResultSheet.authorizedBy`/`At`. *Existing;
  21 CFR Part 11-grade manifestation is a hardening item (partial, §14).*
- **Version history.** `ResultSheetEvent` (Authorized/Deauthorized/Reauthorized) + `Report` re-issue.
  *Existing.*
- **Traceability.** Every statement traceable to its evidence (§10). The report-to-pixel link is a
  signature experience ([OSIERI_v2.md](OSIERI_v2.md) §9); the *linkage entity* between report
  statements and slide regions is not yet modeled (partial, §14).

## 9. Concordance

The **Concordance Ledger** captures, per case and longitudinally: the **human interpretation**, the
**AI interpretation**, **agreement / disagreement**, the **reason**, any **override**, and the
**outcome** — becoming the lab's longitudinal learning and the trust mechanism
([OSIERI_v2.md](OSIERI_v2.md) §6, §9).

**What exists:** a per-case `AIScreeningResult.agreedWithAI` (boolean), `pathologistNote`,
`reviewedBy`, `reviewedAt`. This is a single agreement flag after review.

**What is missing:** the *committed* human interpretation that precedes the AI (§5), the structured
**override reason** and **outcome**, and any **aggregation** (per-reader, by case-type, over time).
A true Ledger therefore **requires a future data-model decision** — it must not be faked by counting
the existing boolean. Until then, the workspace can honestly show only per-case agreement, and the
Medical Director's concordance view is deferred. See §14.

## 10. Traceability

Everything is explainable; the case answers "on what basis?" at every step.

- **Timeline (partial).** The case's ordered history — `RecordStatusEvent` + `ResultSheetEvent` +
  `AiDraft` events; a unified timeline surface is design work over existing events.
- **Audit trail (existing).** Who did what, when — status/result events, `AiDraft` (`model`,
  `promptVersion`, `redactionPolicy`, `inputDigest`, `editedDiff`, accept audit), `RecordCoding`.
- **Reason for change (existing).** `editReason`, amendment (Deauthorize→Reauthorize) rationale.
- **AI evidence (existing).** `AIScreeningResult.findings` linked to regions; `AiDraft` provenance.
- **Human rationale (existing/partial).** `pathologistNote`; the Read→Reveal accept/reject rationale
  is missing (§5).
- **Report revisions (existing).** `ResultSheetEvent` version chain; `Report` re-issue.
- **Final signature (existing/partial).** `Report.signature`/`digitalSignature`,
  `ResultSheet.authorizedBy`/`At`.

## 11. Information architecture (responsibilities, not layout)

The workspace is composed of surfaces defined by *responsibility* (no dimensions specified; Helix
primitives only):

- **Primary reading surface.** The slides (WSI) — the center of the read.
- **Context panel.** Specimen, requisition, patient, and case status.
- **Evidence panel.** AI findings/quantification and (future) literature — revealed per Read→Reveal.
- **Prior history.** The patient's prior cases and their delta (§7).
- **Report panel.** The report draft, edited in place (§8).
- **Timeline.** The case's ordered history and audit (§10).
- **Actions.** The workflow verbs (§12), including sign-out.

Progressive disclosure governs depth; the default is the read, detail is one gesture away
([OSIERI_v2.md](OSIERI_v2.md) §2). Navigation and content share one scroll container
([../CLAUDE.md](../CLAUDE.md)).

## 12. Interactions

Only interactions (no implementation): **Read** · **Reveal** (gated — future) · **Compare** ·
**Accept** · **Modify** · **Reject** · **Annotate** (point today; regions/measurements future) ·
**Quantify** (future) · **Open prior** · **Request review** (resident→attending; senior review) ·
**Sign** · **Amend** · **Escalate**. Each is acknowledged once within the experience budgets and
uses the one feedback language ([OSIERI_v2.md](OSIERI_v2.md) §10); each consequential action is
audited (§10).

## 13. Success metrics

Measurable outcomes for the flagship:

| Metric | Definition | Direction |
|---|---|---|
| Review time | Opening a case to sign-out | Decrease |
| Time to sign-out | Ready-to-read to signed | Decrease |
| AI–reader agreement rate | Concordance per reader / case type *(requires §9 Ledger)* | Increase, calibrated |
| AI override rate | Share of AI findings overridden, trending toward genuine disagreement not distrust | Calibrated |
| Diagnostic consistency | Variation across readers on comparable cases | Increase consistency |
| Amendment reduction | Post-sign-out corrections | Decrease |
| Traceability completeness | Share of signed cases with a full evidence→report→signature trail | Toward 100% |
| Read-before-reveal adoption | Independent interpretation committed before reveal *(requires §5)* | Increase |

Foundational bars inherited from Helix and the experience budgets remain non-negotiable
([OSIERI_v2.md](OSIERI_v2.md) §10).

## 14. Missing capabilities & future data-model decisions (consolidated)

Stated honestly; each is a **future product decision requiring schema evolution**, not assumed:

1. **Read → Reveal model.** A committed initial-interpretation entity with ordered timestamps
   (before reveal), a reveal event, and an accept/modify/reject decision + rationale. Prerequisite
   for the flagship and for the Ledger.
2. **Concordance Ledger.** The committed-interpretation-vs-AI record (agreement, reason, override,
   outcome) plus per-reader/case-type aggregation. Depends on (1).
3. **AI quantification.** Recorded counts/indices/scoring on the AI result (mitotic count, Ki-67,
   etc.), editable and defensible in the report. The blueprint's quantification-first direction.
4. **Report-to-evidence linkage.** An entity linking report statements to the slide regions and
   decisions behind them (for report-to-pixel traceability).
5. **Rich annotations.** Regions/polygons/measurements on `SlideAnnotation` (today: points only).
6. **21 CFR Part 11 e-signature manifestation.** Hardening of the existing signature into a
   compliant manifestation with full audit.
7. **Prior-aware surface & unified timeline.** Design work over *existing* data (no new model) — the
   prior-case pivot and the assembled case timeline.

Items 1–6 need schema evolution and product approval; item 7 is buildable on existing data.

## 15. Implementation risks

- **Faking the flagship.** The greatest risk is simulating Read→Reveal or the Concordance Ledger on
  the existing `agreedWithAI` boolean — which cannot prove the interpretation preceded the AI. That
  would be a misleading feature; it must not ship. Build the model first, or do not claim it.
- **AI as authority.** Any drift toward the AI deciding (auto-accept, confidence-led UI) violates
  the governing principle. Evidence leads; the human signs.
- **WSI at scale.** Gigapixel slide streaming/storage is a real load concern (blueprint §8); the
  reading surface must degrade gracefully.
- **Regulatory posture.** Diagnostic AI assistance is regulated; quantification-first is the lower-
  risk entry ([OSIERI_v2.md](OSIERI_v2.md) §1). Do not ship diagnostic AI as authoritative.
- **Scope creep into a separate report workspace.** Reporting must stay inside Sign-Out.

## 16. Architectural recommendations

- **Build existing-capability depth first** (no schema change): the unified reading + evidence +
  report + timeline surface over WSI, `AIScreeningResult`, `ResultSheet`/`AiDraft`/`Report`, and the
  prior-aware surface + case timeline over existing events. This delivers most of the flagship's
  daily value on proven data.
- **Sequence the flagship behind its model.** Treat the Read→Reveal + Concordance data-model
  decision (§14 items 1–2) as its own approved capability, audited and migrated per the project rule
  ([../Roadmap/06_DECISIONS.md](../Roadmap/06_DECISIONS.md) ADR-007), before building the interaction.
- **Quantification before diagnosis** for new AI work (§14 item 3) — lower regulatory risk, higher
  daily value.
- **Everything on Helix v1.0 as frozen;** anything that appears to need a new primitive is recorded
  in [../Roadmap/05_HELIX_v1_1.md](../Roadmap/05_HELIX_v1_1.md) with evidence, not built by bending
  Helix.

## 17. Traceability

| This document | Traces to |
|---|---|
| Vision, one-continuous-flow, merge of review+report | [OSIERI_v2.md](OSIERI_v2.md) §4 W1 |
| Read → Reveal, evidence-before-confidence, AI model | [OSIERI_v2.md](OSIERI_v2.md) §6; §9 |
| Prior-aware review, prior-case pivot | [OSIERI_v2.md](OSIERI_v2.md) §5, §6 |
| Personas | [OSIERI_v2.md](OSIERI_v2.md) §3 |
| Helix-only, no new primitives/tokens | [../HELIX_v1.0.md](../HELIX_v1.0.md) |
| Phase placement, delivered/declined discipline | [../Roadmap/02_OSIERI.md](../Roadmap/02_OSIERI.md) |
| AI-assists / migration / decision rules | [../Roadmap/06_DECISIONS.md](../Roadmap/06_DECISIONS.md) ADR-007, ADR-008 |
| Every capability class | the audit (§1), real modules/models cited inline |

Nothing in this document exists that cannot be traced to the approved architecture or to the audit;
where a capability is missing, it is named as such and deferred to a product decision.

## Status of this document

Architecture only; no implementation, wireframes, code, UI redesign, Helix change, or new
primitive. On approval it is the Phase 2B implementation contract: build existing-capability depth
first, and gate Read→Reveal + the Concordance Ledger behind an explicit data-model decision. Each
increment traces to a section here, is verified against the foundational quality bars, and is
recorded in [../Roadmap/08_RELEASES.md](../Roadmap/08_RELEASES.md).
