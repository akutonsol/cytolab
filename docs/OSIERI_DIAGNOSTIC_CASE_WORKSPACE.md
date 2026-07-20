# Osieri — Diagnostic Case Workspace (Phase 3A architecture)

| Field | Value |
|---|---|
| Status | Draft — architecture only; no implementation, no schema, no Helix change, no permission/seed change, no roadmap edit, no commit |
| Current Phase | Osieri Phase 3A (Diagnostic Case Workspace) — D1 architecture |
| Owner | Founder |
| Dependencies | [OSIERI_SIGNOUT_WORKSPACE.md](OSIERI_SIGNOUT_WORKSPACE.md) (the record-centric read-prototype this extends), [OSIERI_ENTERPRISE_ADMINISTRATION_WORKSPACE.md](OSIERI_ENTERPRISE_ADMINISTRATION_WORKSPACE.md) (composition contract, closed), [F4_AI_REPORTING_DESIGN.md](F4_AI_REPORTING_DESIGN.md), Helix v1.0 (frozen), existing clinical modules (audit §4) |
| Last Updated | 2026-07-12 |
| Priority | P1 (the primary clinical workspace; follows the Phase 2 workspace suite, all closed) |
| Expected Next Milestone | Architecture approval → composition feasibility audit (D2) → binding implementation plan (D3) → checkpointed compose-only build (read/reveal/invoke first; authoring/synoptic/amendment/collaboration gated on data-model decisions) |

This is the architecture for the **Diagnostic Case Workspace** — the single record-centric surface a
pathologist opens to work one case end to end: review the evidence, interpret the case, see the findings
their owners record, collaborate, and invoke the reporting/authorization owners — **without the workspace
becoming a second diagnostic system.** It is architecture only: **no code, no wireframes, no layout
dimensions, no schema changes, no Helix changes, no permission/seed changes, no roadmap edits.** Every
claim traces to the read-only audit in §4; where a capability is missing it is stated honestly and
identified as a future decision requiring schema evolution — never silently assumed. Throughout, **current
reality and future recommendation are kept strictly separate.**

**Primary architectural question.** *What must exist in one record-centric diagnostic workspace so a
pathologist can review evidence, interpret the case, author findings, collaborate, and invoke reporting
owners — without the workspace becoming a second diagnostic system?*

**Primary governing rule.** *Diagnostic truth always belongs to diagnostic owners.* The workspace may
**compose, summarize, organize, reveal recorded evidence, navigate, and invoke owner workflows.** It may
**never** infer a diagnosis, reinterpret findings, manufacture clinical conclusions, rewrite owner data,
or duplicate diagnostic validation, persistence, authorization, image delivery, AI generation, or
lifecycle logic — and it may **never present simulated output as real inference.**

---

## 1. Purpose

Osieri already contains a complete diagnostic surface — but it is **scattered.** To work one case today a
pathologist touches `/records/[id]` (which itself fans out to ~6 owner endpoints), `/sign-out/[recordId]`,
`/wsi`, `/coding`, `/correlation`, `/bethesda-analytics`, `/escalations`, `/qc`, `/tat`, `/recalls`,
`/teleconsult`, `/ai-screening`, `/result-sheets`, `/authorizer`, `/reports`, and `/files`. There is **no
single place** that answers, for the case in front of them: *this case — every piece of recorded evidence,
every finding its owner holds, and every action I can take — organized the way I actually reason through
it.*

The Diagnostic Case Workspace is a **composition and orchestration layer** over the clinical owners, keyed
to one `Record`. It is the pathologist's cockpit; it owns no diagnosis. It is **not** another Record page,
Patient page, Result page, or Sign-Out page — it is the unified orchestration layer above all of them.

---

## 2. Governing principles

1. **Compose, never duplicate.** Every panel reads from an existing owner and links to the owner's real screen for any change. The workspace writes nothing.
2. **Owner modules remain authoritative** for validation, persistence, lifecycle, authorization, image delivery, AI generation, and audit.
3. **Diagnosis is never synthesized.** Osieri has **no first-class `Diagnosis` model** (§4a); diagnostic meaning is split across `BethesdaResult`, `ResultSheet.narrative`/`ResultLine`, `Report.content`, and `RecordCoding`. The workspace surfaces each owner's representation **verbatim** and never computes, merges, or infers "the diagnosis."
4. **Findings are never reinterpreted.** Free text is shown as recorded; only deterministic derivations already owned by a module (e.g. Bethesda `shortCode`) are surfaced.
5. **Assistive ≠ diagnostic; real ≠ simulated.** `ai` (AiDraft) is real, redacted, provenance-tracked, assistive. `ai-screening` (AIScreeningResult) is a **random-number simulation** in the current code (`ai-screening.service.ts:78-99`). Neither is ever presented as a diagnosis; the simulation is labeled experimental wherever surfaced (§12).
6. **Recorded, not inferred; absence is not a claim.** No QC note ≠ QC passed; no TAT alert ≠ on-time; no notification ≠ no event; null Bethesda HPV ≠ negative (§11).
7. **Never silently broaden access.** The caller sees only what their permissions already allow; unreachable capability is `forbidden`, never quietly exposed (§17).
8. **Authorization, release, amendment, and status transitions occur only through owner workflows** (`result-sheets.authorize`, `reports.create` "the gate", the constrained `records` `transition()`), with their guards and audit (§18).
9. **Metadata, not content.** Result entries/lines/narrative bodies, AI output/finalText, image bytes, and PDF bytes stay with their owner; the workspace surfaces status/counts/events and links out (§20).
10. **No schema, Helix, permission, or seed changes.** The read-prototype (`signout`) is **reused, not re-invented** (§5, §26).

---

## 3. Clinical workflow philosophy

This document deliberately does **not** read as a module inventory. It is organized the way a pathologist
works a case:

> **Open the case → understand who and why → look at the material → see what the owners already record as
> findings → weigh decision support → check the patient's past → collaborate if needed → invoke the
> reporting/authorization owners → and trust a truthful timeline of everything that happened.**

The workspace's job is to make that arc **fast, complete, and honest** — to remove the hunt across a dozen
screens — while keeping every act of diagnosis, authoring, and authorization exactly where it lives today:
in the owner. The workspace reduces cognitive load; it does not add clinical authority. Nine workflow bands
(§8) map onto that arc, each a partial-failure-isolated section over one owner read.

---

## 4. Current-system inventory (read-only audit — ground truth)

Verified in `apps/api/src/modules/*`, `apps/api/prisma/schema.prisma`, `apps/api/prisma/seed.ts`,
`apps/web/src/app/(app)/*`, `apps/web/src/lib/nav.ts`.

**The case is a `Record`** (`schema.prisma:615-684`), the hub whose relations are the composition surface:
`patient`, `client`, `workspace`, `specimens` (→ `images`), `statusHistory` (`RecordStatusEvent`),
`requisitionLines`, `therapy`, `gynFeatures`/`nonGynFeatures`, `resultSheets` (→ entries/lines, reports,
aiDrafts, events), `bethesdaResult`, `tatAlerts`, `escalations`, `qcChecks`, `cytologyCorrelations`,
`recalls`, `digitalSlides`, `aiScreening`, `consultRequests`, `codings`, `fhirTransmissions`, `assignedTo`,
`bills`, `changeRequests`, `attachments`, `cabinet` (`schema.prisma:638-673`).

| Clinical domain | Owner module | Key model(s) | API base + gate | Web surface |
|---|---|---|---|---|
| Case (hub) | `records` | `Record`, `RecordStatusEvent`, `Specimen`, `Therapy`, `Gyn/NonGynClinicalFeatures` | `/specimens*`, `/records*` · `record:view`/`:change`/`:submit`, `recordstatus:change` | `/records`, `/records/[id]` |
| Patient & history | `patients` | `Patient`, `PatientAddress` | `/patient*` · `patient:view`; history gated `resultentry:view` | `/patients`, `/patients/[id]` |
| Prior results (seam) | `records` | `Record` projection | `records.priorsByPatient` (`records.service.ts:170`) | (sign-out) |
| Requisition / order | `requisitions` | `Requisition`, `RequisitionLine` | `/requisition*` · `requisition:view`/`:create` | `/requisitions` |
| Specimen custody | `req-tracking` | `RequisitionTracking`, `TrackingEvent` | `/req-tracking` · `requisition:view`/`:change` | `/req-tracking` |
| Filing | `cabinets` | `Cabinet` (derived by client) | `/cabinet*` · `cabinet:view`/`:change` | `/cabinets` |
| Result sheets / findings | `result-sheets` | `ResultSheet`, `ResultEntry`, `ResultLine`, `ResultSheetEvent` | `/resultsheet*` · `resultsheet:view`/`:create`/`:authorize`, `resultentry:change` | `/records/[id]`, `/authorizer` |
| Result templates | `result-templates` | `ResultTemplate` | `/result-templates` · `resultentry:view`/`:change` | `/result-templates` |
| Structured findings (Bethesda) | `bethesda` | `BethesdaResult` | `/bethesda/record/:id` · `resultentry:view`/`:change` | `/bethesda-analytics`, record modal |
| Coding | `coding` | `MedicalCode`, `RecordCoding` | `/coding*` · `record:view`/`:change` | `/coding`, `/records/[id]` |
| Cyto-histo correlation | `correlation` | `CorrelationCase` | `/correlation*` · `record:view`/`:change` | `/correlation`, `/correlation/[id]` |
| Released report | `reports` | `Report` | `/reports*`, `/report/pdf/:id` · `report:view`/`:create` | `/reports` |
| Sign-out (read aggregate) | `signout` | — (composes 8 owners) | `/signout/case/:recordId` · `record:view` | `/sign-out/[recordId]` |
| Batch authorization | `batch` | — (acts on `ResultSheet`) | `/records/batch-*` · `resultsheet:authorize` | `/batch-authorize` |
| Slides / imaging (WSI) | `wsi` | `DigitalSlide`, `SlideAnnotation` | `/wsi*` · `record:view`/`:change` | `/wsi`, `/wsi/[slideId]` |
| Attachments / files (GCS) | `files` | `RecordAttachment` | `/files*` · `record:view`/`:change` | `/files` |
| AI-assisted reporting (real) | `ai` | `AiDraft`, `LabAiSettings` | `/resultsheet/:id/ai/*` · `aidraft:create`; settings `applicationprefs:*` | `AuthorizationModal` |
| AI screening (simulated) | `ai-screening` | `AIScreeningResult` | `/ai-screening*` · `record:view`/`:change` | `/ai-screening`, record card |
| Teleconsult (external) | `teleconsult` | `ConsultRequest` | `/teleconsult*` · `record:view`/`:change` (+ token-public) | `/teleconsult`, `/teleconsult/[id]` |
| Quality control | `qc` | `QCCheck`, `QCFailureAlert`, `Equipment` | `/qc*` · `record:view`/`:change` | `/qc` |
| Abnormal escalation | `escalation` | `EscalationRecord` | `/escalations*` · `record:view`/`:change` | `/escalations` |
| Turnaround (TAT) | `tat` | `TATConfig`, `TATAlert` | `/tat*` · `record:view`/`:change` | `/tat` |
| Recall / follow-up | `recall` | `RecallRecord` | `/recalls*` · `record:view`/`:change` | `/recalls` |
| Client change requests | `change-requests` | `ChangeRequest`, `ChangeRequestMessage`, `ChangeRequestEvent` | `/change-requests` · **`changerequest:*` (unseeded → superuser-only)** | `/change-requests` |
| Reference (KB) | `knowledge-base` | `KbArticle`, `KbCategory`, `KbFeedback` | `/knowledge-base*` · read open; `kb:manage` **superuser-only** | `/knowledge-base` |
| Notifications | `notifications` | `Notification`, `UserNotificationPreference` | `/notifications*` · `notification:view`/`:change` | `/notifications` |
| Messaging | `messaging` | `Thread`, `Message` (**no `recordId`**) | `/messaging/*` · `message:view`/`:send` | `/messaging` |
| Proficiency (training) | `proficiency` | `ProficiencyTest/Case/Response` (no `recordId`) | `/proficiency*` · `record:view`, `resultsheet:authorize` | `/proficiency` |

There is **no existing unified diagnostic case workspace.** The closest is the `signout` case aggregate
(read-only, focused on the sign-out moment). This workspace composes the owners above; it replaces none.

---

## 5. Composition root

**The composition root is `Record`.** The audits confirm most diagnostic evidence is Record-anchored, and
this is the current reality the workspace is built on — **not a redesign.**

**Current truth (verified):**
- `DigitalSlide` → `Record` (`schema.prisma:2624`).
- `RecordAttachment` → `Record` (`schema.prisma:1372`).
- `AIScreeningResult` → `Record` (`recordId @unique`, `schema.prisma:2691`).
- `ConsultRequest` → `Record` (`schema.prisma:2749`).
- `BethesdaResult` → `Record` (`recordId @unique`, `schema.prisma:1939`).
- `AiDraft` → `ResultSheet` → `Record` (`schema.prisma:948`; reached per-record via `resultSheet.recordId`).
- `Specimen` → `Record` (`schema.prisma:715`); `SpecimenImage` → `Specimen` (a **stub**, §10).
- Imaging/AI collaboration is **Record-centric, not specimen-centric.** There is **no reliable
  slide-to-specimen relation** (`DigitalSlide` has no `specimenId`) and **no AI-to-slide relation**
  (`AIScreeningResult.findings` is untyped JSON with no slide coordinates; `AiDraft` targets a
  `ResultSheet`, not an image).

**Consequence for composition.** The workspace joins **only** through the verified `Record` relations and
record-filtered owner reads. It must **not** imply a slide belongs to a specimen, that an AI finding maps
to a slide region, or that any nullable-string field (`Appointment.resultRecordId`,
`DigitalRequisitionForm.requisitionId`, `Notification.entityId`, `Recall.completedRecordId`) is a
guaranteed link — none is an FK.

**Future recommendation (recommendation only — not this build):** first-class slide↔specimen and
AI↔slide↔ROI relations would enable specimen-centric review and image AI; both are **schema-gated** (§23).

---

## 6. Capability classification

`Existing` = full owner + UI. `Reusable-via-composition` = owner read + link, buildable now. `Partial` =
owner exists but the capability is thin/embedded. `Requires schema evolution` = no owner model. `Future` =
deliberately gated beyond schema. `Prohibited to simulate` = must never be faked in a composition layer.

| Capability | Classification | Basis |
|---|---|---|
| Slide metadata | Reusable-via-composition | `wsi.listByRecordMeta` (metadata, no URL) `wsi.service.ts:65` |
| Image (binary) delivery | Requires schema/infra evolution — **Prohibited to proxy** | `wsi` records metadata only; "viewer is sole owner of image delivery" `wsi.service.ts:62` |
| Slide point annotations | Existing (owner) / Reusable read | `SlideAnnotation` (points only, no ROI) `schema.prisma:2649` |
| Attachments | Reusable-via-composition | `files.getRecordAttachments`; GCS/base64 store |
| Bethesda / structured findings | Reusable-via-composition | `bethesda.getByRecord` (+ `shortCode`); cervical-only, 1/record |
| AI reporting drafts | Reusable-via-composition (metadata only) | `ai-reporting.draftsByRecord` (no output/finalText) `ai-reporting.service.ts:82` |
| AI screening | Reusable-via-composition **as labeled simulation** — **Prohibited to present as real inference** | `ai-screening.service.ts:78-99` random-number sim |
| Teleconsult | Reusable-via-composition (external, provenance-honest) | `ConsultRequest`; token-authed external response |
| Knowledge base | Reusable-via-composition **as generic CMS** — **Prohibited to present as validated clinical reference** | free Markdown CMS; no clinical taxonomy |
| Internal collaboration (case notes/comments) | Requires schema evolution | no `Note`/`Comment`/`CaseNote`; messaging has no `recordId` |
| Structured consult adjudication | Requires schema evolution | consult response is external free text; no lab-side structured adjudication |
| Slide-to-specimen linkage | Requires schema evolution | `DigitalSlide` has no `specimenId` |
| Image AI | Requires schema/infra evolution | `ai-screening` reads no pixels; no AI↔slide relation |
| Read→reveal boundary (content on owner) | Existing (discipline) | sign-out metadata-only seams |
| Concordance ledger (cyto-histo) | Partial | `CorrelationCase` exists; concordance human-entered, not computed |
| Quantification (measurements/counts) | Requires schema evolution | no measurement model; annotations are points |
| Synoptic authoring | Partial / Requires schema evolution | `BethesdaResult` cervical-only; no generic synoptic worksheet |
| Prior-result linking | Reusable-via-composition | `records.priorsByPatient` (`records.service.ts:170`) |
| Report assembly | Existing (owner) — **Prohibited to duplicate** | `reports.create` "the gate"; stateless PDF render |
| Authorization / amendment | Existing (owner) — **Prohibited to duplicate** | `result-sheets.authorize`; de-auth on edit; no addendum model |

---

## 7. Owner / evidence map (the composition seams)

The `signout` aggregate is the proven pattern and is reused. Contract (verified `signout.service.ts:20-352`):
`type SectionStatus = 'ready' | 'deferred' | 'forbidden' | 'error' | 'empty'`; `interface Section<T> {
status; data: T|null; reason? }`; an `EffectivePermissions` map (`amend = resultentry:change &&
resultsheet:authorize`, `viewBethesda`/`viewPriors = resultentry:view`, `viewResultSheet =
resultsheet:view`, `viewSlide`/`viewAI`/`viewCorrelation`/`viewAttachments`/`viewAudit = record:view`);
13 sections composed with per-section partial-failure isolation.

Each workspace section names one owner read, the evidence it shows, the evidence it deliberately excludes,
and the owner surface it invokes. The full per-section owner maps (with permission, model, truthful states,
failure behavior, limitations, and risk) are given inline in the workflow-band architectures §9–§16.

---

## 8. Workspace section hierarchy (clinical bands)

Nine bands, ordered by the §3 workflow arc. **Context before findings, findings before authorization,
authorization before release.** Each band contains one or more `Section<T>` panels over a single owner read.

1. **Case Identity** — record identity, patient, accession/lab number, lifecycle state, clinical indication/history, assignment. *(§9)*
2. **Diagnostic Material** — specimens, WSI slide metadata, attachments/supporting documents. *(§10)*
3. **Diagnostic Interpretation** — Bethesda/classification, result entries/lines, narrative status, template usage, coding. *(§11)*
4. **Decision Support** — AI reporting drafts, consistency checks, code suggestions, simulated AI screening (labeled), KB references. *(§12)*
5. **Prior Evidence** — previous records, previous diagnoses, correlation, historical reports. *(§13)*
6. **Collaboration** — teleconsult, escalations, reviewer involvement, external-response provenance (internal notes = deferred). *(§14)*
7. **Reporting & Sign-Out** — result sheets, authorization state, amendment history, report + PDF — **owner invocation only**. *(§15)*
8. **Timeline & Provenance** — record-status history, result-sheet events, AI provenance, consult events, actor/timestamp limitations. *(§16)*
9. **Permissions & Actions** — what this caller may view and which owner actions are available — **descriptive only**. *(§17)*

Per-section owner-map field key (used in §9–§16): **owner module · owner service · owner read · owner route
· model · permission · evidence shown · evidence excluded · invocation · truthful states · failure
isolation · limitations · risk.**

---

## 9. Case Identity architecture (Band 1)

**Case identity is the workspace's spine and must never collapse.** Even if every other section errors, the
case header renders (or the whole workspace is honestly `error` — never a blank with fabricated identity).

- **Case header** — records · `RecordsService.findOne` (`records.service.ts:217`) · `GET /specimens/:id`
  · `Record` + `statusHistory` · `record:view` · **shows:** `labNumber`/`identifier`, `status`, `urgent`,
  `formType`, referring `doctor`, `assignedTo`/`assignedAt` · **excludes:** result-sheet content, billing
  detail · **invokes:** `/records/[id]` · **states:** `ready`/`error`/`forbidden` · **failure:** if this
  read throws the workspace surfaces a single top-level `error` (identity is the root, §19) · **limits:**
  `Record` has **no `createdBy`** — creator only inferable from the earliest `RecordStatusEvent.userId`
  (may be null); `dateStatus` is last-transition time only · **risk:** presenting inferred creator as fact
  (mitigation: label "first recorded action by", or omit).
- **Patient** — records (record-embedded via `recordSelect`) / patients · `patient:view` · **shows:**
  patient identity, gender, DOB · **excludes:** full demographics/address unless separately gated ·
  **invokes:** `/patients/[id]` · **states:** `ready`/`empty` ("No patient linked")/`error` · **limits:**
  age is derived, `avatarUrl` is a stub.
- **Clinical context** — records · **shows:** referring impression (`Record.clinicalDiagnosis`, which is
  the **clinician's intake impression, not the pathologist's diagnosis**), `specimenDate`, `therapy`,
  gyn/non-gyn clinical features (exactly one applies, keyed by `formType`) · **invokes:** `/records/[id]` ·
  **risk:** presenting `clinicalDiagnosis` as a diagnosis (mitigation: label "referring clinical
  indication").

---

## 10. Diagnostic Material architecture (Band 2)

**Record-anchored, not specimen-anchored** (§5). The workspace shows what material exists and links to the
owner that delivers it; it never delivers bytes itself.

- **Specimens & material** — records · `RecordsService.findOne` (`specimens` + `images`) · `record:view`
  · `Specimen` (+ `SpecimenImage` **stub**) · **shows:** specimen `label`/`type`/`vialColour`/`dateReceived`
  · **excludes:** result content · **invokes:** `/records/[id]` · **limits:** **no `Block`/`Cassette`/glass-
  `Slide`/`Accession` sub-structure** below `Specimen`; `SpecimenImage` upload/serving is deferred to Phase 6.
- **WSI slides** — wsi · **`WsiService.listByRecordMeta`** (`wsi.service.ts:65`) · `GET /wsi/record/:id`
  · `DigitalSlide` (+ `SlideAnnotation`) · `record:view` (act: `record:change`) · **shows:** slide
  **metadata** (`format`, `magnification`, `stain`, `scanner`, `fileSizeBytes`, annotation count) ·
  **excludes:** `slideUrl` and any image bytes — **the metadata seam deliberately omits the URL** ·
  **invokes:** `/wsi/[slideId]` (the viewer owns delivery) · **states:** `ready`/`empty`/`error`/`forbidden`
  · **WSI boundary (verified):** WSI owns **slide metadata + point annotations only**; it does **not** own
  binary image delivery, upload storage, tile serving, scan verification, slide-to-specimen linkage, or ROI
  geometry (`wsi.service.ts:62`). **Truthfulness:** `magnification`/`stain`/`scanner`/`format` are
  caller-asserted, never derived from the asset — must not be presented as verified scan metadata · **risk:**
  metadata-as-verified-image-truth, or proxying image bytes into the aggregate (mitigation: metadata only;
  deep-link to viewer; label caller-asserted fields).
- **Attachments** — files · `FilesService.getRecordAttachments` · `GET /files/record/:recordId` ·
  `RecordAttachment` · `record:view` (act: `record:change`) · **shows:** `filename`, `kind` (MIME),
  `createdAt` · **invokes:** `/files` · **Files boundary (verified):** `files` owns record attachments +
  GCS/base64 storage and delivery; it does **not** own semantic document typing, specimen/result-sheet/slide
  linkage, versioning, author identity, checksum, or soft delete · **risk:** implying an attachment is
  bound to a specimen/slide (it is Record-level only).

---

## 11. Diagnostic Interpretation architecture (Band 3)

**This is where the workspace is most tempted to become a second diagnostic system — and must not.** It
surfaces what each interpretation owner records, in that owner's terms, with authorization state; it never
authors, edits, merges, or infers.

- **Structured findings (Bethesda)** — bethesda · `BethesdaService.getByRecord` (`bethesda.service.ts:128`)
  · `GET /bethesda/record/:recordId` · `BethesdaResult` · `resultentry:view` (act: `resultentry:change`) ·
  **shows:** stored enums (adequacy, general/squamous/glandular categories, HPV) + deterministic `shortCode`
  + owner-generated `generatedNarrative` · **excludes:** nothing beyond what the owner exposes · **invokes:**
  Bethesda record modal · **limits:** **cervical cytology only (TBS 2014), one per record** — no non-gyn
  synoptic; nullable fields (HPV/recommendation) are often unset · **risk:** inferring negative from null
  (mitigation: render null as "—", never "negative").
- **Result sheets & entries** — result-sheets · `ResultSheetsService.metaByRecord` /
  `eventsByRecord` (`result-sheets.service.ts:171,154`) · `resultsheet:view` · `ResultSheet` /
  `ResultEntry` / `ResultLine` / `ResultSheetEvent` · **shows:** sheet **metadata** (authorized flag,
  authorizedAt/By, created), event history (Authorized/Deauthorized/Reauthorized) · **excludes:** entries,
  lines, and `narrative` **body** — content stays with the owner · **invokes:** `/records/[id]`,
  `/authorizer` (edit/author) · **limits:** no draft/final enum (state = `authorized` + events); no per-line
  coded diagnosis · **risk:** exposing findings content in the aggregate (mitigation: metadata-only seam).
- **Coding** — coding · `CodingService.getRecordCodings` · `GET /coding/record/:recordId` · `RecordCoding`
  → `MedicalCode` · `record:view` (act: `record:change`) · **shows:** assigned SNOMED/ICD/LOINC codes and
  `codeType` · **invokes:** `/coding` · **limits:** no "primary code" flag; suggestions are advisory
  (derived from Bethesda only, confidence hardcoded) — surfaced as suggestions in Band 4, never as recorded
  coding · **risk:** presenting suggestions as recorded diagnosis.
- **Diagnosis (composite view, read-only).** There is **no `Diagnosis` model** (§4a). The workspace may show,
  side by side, the four recorded representations (Bethesda structured, result narrative *status*, coded
  diagnosis, released report *link*), each labeled with its owner — but it **must never merge them into a
  single "diagnosis" field.**

### 4a. Diagnostic ownership (verified — the anchor for this band)
- No first-class `Diagnosis` model (`grep "model .*[Dd]iagnos"` → none).
- Structured: `BethesdaResult` (cervical-only). Free-text: `ResultLine`, `ResultSheet.narrative`. Released:
  `Report.content`. Coded: `RecordCoding`. Intake impression (not the dx): `Record.clinicalDiagnosis`.
- `CorrelationCase.cytologyDiagnosis` is a re-typed snapshot, not a link.

---

## 12. Decision-support architecture (Band 4)

**The critical truthfulness band.** Real assistance and a simulation live here and must be visibly
distinct.

- **AI reporting (real, assistive)** — ai · `AiReportingService.draftsByRecord` (`ai-reporting.service.ts:82`)
  · `aidraft:create` (seeded; held by **Authorizers + Pathologist only**, not LabTech) · `AiDraft` ·
  **shows:** draft **metadata** — `kind` (Narrative/CodeSuggestion/ConsistencyCheck), `status`
  (Generated/Accepted/Rejected/Superseded), `model`, `promptVersion`, `redactionPolicy`, timestamps ·
  **excludes:** `output` and `finalText` (the generated/edited **text** stays with the owner) · **invokes:**
  the owner AI flow in `AuthorizationModal` · **verified properties:** real LLM-backed; **redacted input**
  (`caseRef` opaque, "NEVER the labNumber", `ai-reporting.service.ts:199`); **persisted provenance**
  (`inputDigest` sha256); **human review** (`finalText` becomes report content, not raw output); **graceful
  degradation** (`ai.service.ts:18-49` never throws → `{available:false}`); **never blocks authorization**.
- **AI screening (simulated)** — ai-screening · `AIScreeningService.getByRecord` · `GET /ai-screening/record/:id`
  · `AIScreeningResult` · `record:view` (act: `record:change`) · **shows:** `status`, `primaryFinding`,
  `confidence`, `flaggedAreas`, `agreedWithAI` (real human input) — **each labeled experimental/simulated**
  · **invokes:** `/ai-screening` · **verified property (critical):** `completeScreening` fabricates
  findings/confidence with **random numbers** seeded off the existing Bethesda shortcode
  (`ai-screening.service.ts:78-99`, `SIMULATE_MS = 2000`); it **performs no inference and reads no pixels**
  · **risk:** the highest-severity truthfulness risk in the workspace — presenting a random number as an
  algorithmic diagnosis (mitigation: persistent "Simulated / experimental — not diagnostic" labeling;
  never show `confidence`/`primaryFinding` as clinical truth; no aggregation into any "AI agreement"
  metric presented as real).
- **AI reporting vs AI screening are NOT equivalent** — the workspace must render them in visibly different
  treatments and never let the simulation borrow the real path's credibility.
- **Knowledge base (generic CMS)** — knowledge-base · read endpoints (open to any authed user); `kb:manage`
  is **superuser-only** (seeded, assigned to no role) · `KbArticle` · **shows:** published reference
  articles a user chooses to open · **KB boundary (verified):** it is a generic lab-authored Markdown CMS
  with draft/published/archived workflow; it is **not** curated clinical decision support, a validated
  clinical reference, contextual diagnosis-linked knowledge, or a structured Bethesda/code reference ·
  **risk:** presenting lab-authored content as validated clinical guidance (mitigation: surface only as
  "lab reference," never as decision support; no auto-binding of an article to a diagnosis).

---

## 13. Prior-evidence architecture (Band 5)

**Historical evidence must never be presented as current.**

- **Prior results** — records · **`RecordsService.priorsByPatient(patientId, excludeRecordId)`**
  (`records.service.ts:170`, `take:50`) · `resultentry:view` (per sign-out `viewPriors`) · prior `Record`
  projection · **shows:** prior cases' lifecycle status, dates, Bethesda selections, result-sheet
  authorization/report/event summary · **excludes:** prior result content bodies · **invokes:** the prior
  `/records/[id]` (or its own workspace) · **states:** `ready`/`empty` ("No prior cases")/`forbidden`
  (`resultentry:view` absent) · **risk:** a prior diagnosis read as the current case's (mitigation: a
  distinct "Prior" treatment with each prior's date and its own case link; the current case is never
  co-mingled).
- **Correlation** — correlation · `CorrelationService.byCytologyRecord` · `record:view` (act: `record:change`)
  · `CorrelationCase` · **shows:** cytology/histology diagnosis snapshots, `histologySource`,
  `correlationResult`, `reviewRequired` · **invokes:** `/correlation/[id]` · **limits:** `cytologyDiagnosis`
  is a **re-typed free-text snapshot** (may drift); `correlationResult` is **human-entered, never computed**;
  concordance is asserted, not inferred · **risk:** presenting the snapshot as the case's live diagnosis.
- **Historical reports** — reports · `ReportsService.findAll` (patient/record-filtered) · `report:view` ·
  `Report` · **shows:** released report presence + `releasedAt` + PDF link · **invokes:** `/reports`.

---

## 14. Collaboration architecture (Band 6)

- **Teleconsult (external)** — teleconsult · `TeleconsultService.list`/`detail` (record-filtered) ·
  `record:view` (act: `record:change`) · `ConsultRequest` · **shows:** consult `status`, urgency,
  consultant name/institution, `agreementLevel`, `consultantDiagnosis`, response timestamps · **excludes:**
  the single-use `accessToken` and any shared image bytes · **invokes:** `/teleconsult/[id]` · **Teleconsult
  boundary (verified):** it is **external** consultation — token-based external access, de-identified
  sharing, external free-text response. It is **not** internal collaboration, **not** an authenticated
  clinician identity (provenance is the token), **not** structured adjudication, and **not** actual
  WSI/image delivery (`sharedImages` is an intent boolean; `publicCase` returns narrative/Bethesda text
  only) · **risk:** ambiguous provenance — presenting a token-authed external free-text response as an
  authenticated clinician's structured opinion (mitigation: label "external consultant (token-verified),"
  show `agreementLevel` as consultant-asserted).
- **Escalations & reviewer involvement** — escalation · `EscalationService.list`/`summary` (record-filtered)
  · `record:view` (act: `record:change`) · `EscalationRecord` · **shows:** severity, trigger, status,
  reviewer, `physicianNotifiedAt/Via`, resolution · **invokes:** `/escalations` · **limits:** single
  `reviewNotes` string (no thread); `physicianNotifiedAt` marks app action, **not delivery proof** · **risk:**
  presenting notification timestamps as receipts.
- **Internal comments / notes** — **DEFERRED (requires schema evolution).** There is **no first-class
  internal `Note`/`Comment`/`CaseNote` model**, and `messaging` **cannot bind to a `Record`** (`Thread`/
  `Message` have no `recordId`). The band renders this panel `deferred` with an honest reason; it does not
  repurpose `messaging` or `ChangeRequestMessage` (client-facing, record-optional, superuser-only) as a
  staff case thread.

---

## 15. Reporting & sign-out architecture (Band 7)

**Owner invocation only.** The workspace shows state and history and hands off; it never authors, authorizes,
amends, or assembles.

- **Result sheets & authorization state** — result-sheets · `metaByRecord`/`eventsByRecord` ·
  `resultsheet:view` · **shows:** sheet metadata, `authorized`, authorizer, event history · **amend flag:**
  derived from recorded events (any Deauthorized/Reauthorized) — `amend` capability requires
  `resultentry:change && resultsheet:authorize` (per sign-out `buildPermissions`) · **invokes:**
  `/authorizer`, `AuthorizationModal`.
- **Report & release** — reports · `ReportsService.findAll`/`renderForRecord` · `report:view`/`:create` ·
  `Report` · **shows:** release state, `releasedAt`, on-demand PDF link · **invokes:** `/reports` (the owner
  PDF/route) · **verified gate:** a `Report` is created **only** from an `authorized` `ResultSheet`
  (`reports.service.ts:57-79`); the PDF is **rendered stateless** (auth re-checked at render; **no PDF
  persisted**); `Report.content` snapshot and the live PDF **can diverge**.
- **What the workspace may never recreate:** the WSI viewer, the result editor, the authorization workflow,
  the AI prompt/generation flow, the teleconsult workflow, the attachment manager, the Bethesda editor, the
  correlation review, or the report builder (§20).

---

## 16. Timeline & provenance architecture (Band 8)

- **Timeline** — records (`statusHistory`) + result-sheets (`ResultSheetEvent`) · `record:view` ·
  `RecordStatusEvent`, `ResultSheetEvent` · **shows:** status transitions, authorization events, actor +
  timestamp + note, **verbatim** · **invokes:** `/records/[id]` · **verified limitations:**
  `RecordStatusEvent` has **no event-type discriminator** and mixes true status transitions with pinned
  notes-at-current-status (QC failures write a `QC FAILED …` note at the record's *current* status,
  `qc.service.ts:70-77`); `userId` is nullable; there is **no generic record activity log** (only
  entity-specific event tables) · **risk:** over-claiming a richer/typed history than recorded (mitigation:
  present events as recorded; do not synthesize event types or actors).
- **Provenance** — AI (`AiDraft` provenance fields), consult (`ConsultRequest` status transitions),
  result-sheet events — surfaced as recorded provenance, never inferred.

---

## 17. Permission model

Enforcement stays at each owner endpoint; the workspace's map is **descriptive** and mirrors the owner gate
— the Enterprise Administration discipline. Verified against `seed.ts:16-52` and
`auth/guards/permissions.guard.ts:22-28` (no `@RequirePermissions` → any authed user; `isSuperRole`
bypasses; else must hold every code; uncatalogued codes are holdable by **no** role → superuser-only).
**Access is permission-derived, never role-name-derived; no permission is invented or aliased.**

| Verified permission | Seeded? | Held by ordinary staff? | Gates (in this workspace) |
|---|---|---|---|
| `record:view` / `record:change` | Yes | **Yes** (Authorizers/Pathologist/LabTech) | case, specimens, slides, attachments, coding, correlation, screening, teleconsult, QC/escalation/TAT/recall, timeline |
| `patient:view` | Yes | **Yes** | patient (history sub-read gates `resultentry:view`) |
| `resultentry:view` / `resultentry:change` | Yes | **Yes** | Bethesda, priors, result templates |
| `resultsheet:view` / `:create` / `:authorize` | Yes | **Yes** (authorize = Authorizers/Pathologist) | result sheets, authorization, amend flag |
| `aidraft:view` / `aidraft:create` | Yes | **Authorizers/Pathologist only** (not LabTech) | AI reporting drafts |
| `report:view` / `report:create` | Yes | **Yes** | report / release |
| `changerequest:view` / `:change` | **No (unseeded)** | **No — superuser-only via `isSuperRole`** | client change requests |
| `kb:manage` | Yes (special) | **No — assigned to no role → superuser-only** | KB authoring (read is open) |
| `applicationprefs:reports` | Yes (special) | **No — superuser-only** | reports summary analytics (excluded from case surface) |

**Verified structural facts to surface honestly:**
- **Generic `record:*` gates the entire WSI / files / AI-screening / teleconsult surface** — there are **no
  dedicated `wsi:*`/`consult:*`/`correlation:*`/`screening:*` permissions** (grep-confirmed). The workspace
  mirrors the *actual* `record:*` gate, not a nominal per-domain one.
- **AI reporting uses a distinct `aidraft:create` model** (narrower than `record:*`; accept/reject reuse
  `aidraft:create`, there is no `aidraft:change`).
- **`kb:manage` and `applicationprefs:*` are superuser-only** (seeded, assigned to no role).
- **`changerequest:*` is unseeded → superuser-only.** Its panel must render `forbidden` (403), **not
  `empty`,** for ordinary staff (§19).
- **Permission drift (report, do not fix):** appointment writes gate on `record:change` (not the seeded
  `appointment:manage`); several deletes reuse `*:change`/`*:create`. Owner-side facts; the workspace mirrors
  the real gate.

---

## 18. Lifecycle model

**The workspace observes and participates in lifecycle; it is never the lifecycle owner.**

### 18a. Current reality (verified)
- **13 statuses** (`RecordStatus`): `Pending, Submitted, Processing, Partial, Completed, Resulted, Approved,
  Billed, Paid, OnHold, Disabled, Failed, Viewed`.
- **Transitions are constrained** by a central `ALLOWED_TRANSITIONS` map in `records.service.ts`; every
  transition writes a `RecordStatusEvent`. Status is **not** freely editable.
- **Owner actions drive lifecycle:** result sheet present → `Completed→Resulted`; **authorize →
  `Resulted→Approved`** (`result-sheets.authorize`, which sets `authorized`, writes a `ResultSheetEvent`,
  runs escalation eval, resolves TAT alerts — `batch.service.ts:138-143`); **editing an authorized sheet
  de-authorizes → back to `Resulted`**; report is created **only** from an authorized sheet
  (`reports.service.ts` "the gate").
- **Manual path:** `PATCH /specimen/status/:id` (`recordstatus:change`) flows through the same constrained
  `transition()`, so it is bounded, not arbitrary. **Locks:** core `Record` fields cannot be edited/deleted
  once status ≥ `Completed` (`assertNotLocked`).
- **What the workspace may show:** current status, recorded transitions, authorization/amendment events,
  released-report presence. **What it may never mutate directly:** status, authorization, or release —
  each routes to its owner.

### 18b. Gaps (verified missing — do not claim)
- `Started`, `Released` (delivery-driven), `Archived` are **not modeled** (`Pending` is initial; `Viewed`
  records client viewing; `Report.releasedAt` is the nearest "released"). No persisted authorization batch.
  No report amendment/addendum/version chain.

### 18c. Future recommendation (recommendation only)
- Keep lifecycle **event-driven** and transitions **owner-constrained**; the workspace routes any change to
  the owner. Modeling `Released`/`Archived`, a persisted batch, or a report amendment chain are
  **schema-gated future decisions** (§23), not this build. **Do not claim `Released`/`Archived` — they do
  not exist.**

---

## 19. Section-state / failure-isolation contract

Recommend the **frozen five-state contract** proven in Phase 2 (verified `signout.service.ts:20`):

- **`ready`** — owner read succeeded, data present.
- **`empty`** — owner read succeeded, no rows (e.g. no slides). A truthful "nothing here yet," never a
  positive clinical claim.
- **`forbidden`** — the caller lacks the owner's permission; the section says so (e.g. change-requests for
  ordinary staff). **Forbidden is never rendered as empty.**
- **`error`** — the owner read threw; the section shows a reason and isolates the failure.
- **`deferred`** — the capability is not built (e.g. internal case notes); an honest placeholder, never a
  fake panel.

**Applied to a record-centric diagnostic workspace:**
- **Case identity is the root** (§9): its failure is a single top-level `error`, never a blank with
  fabricated identity. Every **other** section fails independently.
- **Multi-source sections** (e.g. Quality = QC + escalation + TAT; Prior = records + correlation + reports)
  must support a **per-source `unavailable[]`**, render partially, and **never** show a false `empty` when
  one source errors, **never** collapse case identity, and **never** substitute inferred data for a failed
  source.
- The aggregate composes sections in parallel; each **always resolves to a `Section<T>`** and never rejects.
  This is the exact partial-failure isolation shipped in Sign-Out, Quality, and Enterprise Administration.

---

## 20. Owner-invocation contract

Every "act" affordance is a **navigation to the owner's real screen**, carrying record context — never an
in-workspace mutation. The workspace uses only `api.get` (read) + `router.push` (nav): the zero-mutation
shape shipped in the Phase 2 workspaces.

**Activities that stay on owner surfaces (verified destinations):** open the **WSI viewer**
(`/wsi/[slideId]`); open the **attachment owner** (`/files`); open the **result-sheet editor**
(`/records/[id]`, `/authorizer`); open **`AuthorizationModal`** (authorize + AI accept + report release);
open **teleconsult** (`/teleconsult/[id]`); open the **Bethesda owner** (record modal); open the **AI
reporting flow** (owner modal); open **correlation** (`/correlation/[id]`); open a **prior record**
(`/records/[id]`); open a **knowledge-base article** (`/knowledge-base/...`).

**The workspace may invoke existing owners. It may NOT recreate:** the WSI viewer, the result editor, the
authorization workflow, the AI prompt/generation flow, the teleconsult workflow, the attachment manager, the
Bethesda editor, the correlation review, or the report builder.

---

## 21. Accessibility & responsive behavior

- **Accessibility:** reuse the shipped workspace pattern — keyboard shortcuts with input/dialog guards,
  focus-once on the case heading, a discoverable shortcut-help affordance, semantic per-section headings and
  landmarks. `forbidden`/`empty`/`error`/`deferred` states are announced, not silently blank.
- **Responsive:** the nine bands reflow to a single column on narrow viewports; wide content (timeline,
  prior-results table, specimen list, slide list) scrolls within its own `overflow-x` container so the page
  body never scrolls horizontally. Verified against the 390/768/1024/1440/1920 breakpoints used in prior
  phases.
- **Cognitive load:** the bands are collapsible and ordered by the workflow arc (§3); the default view leads
  with identity + material + interpretation and progressively discloses decision support, priors,
  collaboration, reporting, and provenance — so a dense case never overwhelms the primary read.
- **Zero-orange & motion grammar (project hard constraints):** status/severity map to the approved palette
  (warn → neutral, error → rose danger — **never amber**); all motion from tokens; the pixel detector must
  report 0 after any UI change. (No UI ships in D1.)

---

## 22. Risk register

| # | Risk | Mitigation |
|---|---|---|
| 1 | Workspace becomes a **second record page** | Compose/orchestrate only; each band links to its owner; zero mutation (§2, §20). The record page remains an owner surface. |
| 2 | **Duplicate diagnostic authoring** | No editor in the workspace; interpretation is metadata + owner invocation (§11, §15). |
| 3 | **Simulated AI presented as real** | `ai-screening` labeled experimental/simulated everywhere; `ai` labeled assistive-with-provenance; visibly distinct treatments (§12). |
| 4 | **Image metadata as verified image truth** | Slide `magnification`/`stain`/`scanner`/`format` are caller-asserted — labeled as such; no derived-scan claims (§10). |
| 5 | **Image delivery leaking into orchestration** | Metadata-only seam (`listByRecordMeta`, no URL); deep-link to the viewer; the aggregate never proxies bytes (§10, §20). |
| 6 | **PHI leakage via AI inputs/outputs** | AI redaction is the owner's (`caseRef` opaque, digest-only); the workspace surfaces draft **metadata**, never `output`/`finalText` (§12). |
| 7 | **Teleconsult provenance ambiguity** | Label "external consultant (token-verified)"; `agreementLevel`/`consultantDiagnosis` shown as consultant-asserted; token never exposed (§14). |
| 8 | **Historical evidence presented as current** | Distinct "Prior" treatment, per-prior date + own case link; current case never co-mingled (§13). |
| 9 | **Record-centric data mistaken for specimen-centric** | State the Record anchor explicitly; never imply slide↔specimen or AI↔slide links that don't exist (§5, §10). |
| 10 | **Generic KB content as validated reference** | Surface KB only as "lab reference"; no diagnosis-linked auto-binding; no decision-support framing (§12). |
| 11 | **Permission broadening / forbidden-as-empty** | Descriptive map mirroring owner gates; change-requests 403s honestly; `isSuperRole` surfaced (§17, §19). |
| 12 | **Partial-source failure collapsing case identity** | Case identity is the root and isolated; multi-source sections carry `unavailable[]` and render partially; no false empty (§19). |
| 13 | **Payload growth** | Prefer existing metadata seams; parallelize owner reads; observe (don't prematurely optimize) N+1 reads; cap prior/slide/list sizes as owners already do (`priorsByPatient take:50`). |
| 14 | **Responsive overload** | Single-column reflow; internal `overflow-x`; body never scrolls horizontally (§21). |
| 15 | **Clinical cognitive overload** | Collapsible bands ordered by the workflow arc; progressive disclosure (§21). |
| 16 | **Helix scope creep** | Consume Helix tokens/components only; v1.0 frozen (§2). |
| 17 | **Schema creep** | Compose-only; every schema-gated capability deferred and named (§23); no model/migration in this phase. |

---

## 23. Schema-gated / deferred capabilities (verified missing — require a data-model decision)

None are built here; each is a future product + schema decision, not silently assumed.
- **First-class `Diagnosis` entity** (today split across 5 representations — §4a).
- **Generic synoptic worksheet** — `BethesdaResult` is cervical-only, one-per-record; no thyroid/urine/effusion/respiratory structured reporting; **synoptic authoring** is not modeled.
- **Sub-specimen structure** — no `Block`/`Cassette`/glass-`Slide`/`Accession` below `Specimen`; slide labels are ephemeral.
- **Slide-to-specimen linkage** and **AI-to-slide/ROI linkage** (`DigitalSlide` has no `specimenId`; annotations are points, not ROIs; `ai-screening` reads no pixels).
- **Image (binary) delivery / tile serving / scan verification** in the platform (the viewer owns delivery; `SpecimenImage` is a stub) — **image AI** depends on this.
- **Quantification / measurements** (no measurement model).
- **Internal case-note / case-comment thread** (no native model; `messaging` has no `recordId`).
- **Structured consult adjudication** (consult response is external free text).
- **Report amendment / addendum / version chain**, **delivery tracking**, **persisted PDF**.
- **Persisted authorization batch**; **generic record activity log** (no event-type discriminator today).
- **Case claim / lock and cross-owner transaction** (each owner writes independently; no unified draft).
- **Per-case quality flag / priority** (only `Record.urgent`; quality is derived).
- **`Released` / `Archived` statuses.**
- **Concordance ledger** beyond the current human-entered `CorrelationCase`.
- **Result-entry / synoptic form configurator** (`form-config` covers intake only; TEXT/CHECKBOX).

**Prohibited to simulate (never fake in the composition layer):** authoring/editing diagnosis, findings, or
synoptic data; authorizing, de-authorizing, or releasing; computing "the diagnosis"; presenting
`ai-screening` as real inference; presenting KB as validated reference; proxying image bytes; inventing a
quality flag/score; rendering `forbidden` as `empty`.

---

## 24. Buildable-now scope (composition alone)

**Buildable today, no schema, by composition:** every §9–§16 band that reads an existing owner and links out
— case identity + clinical context; specimens + slide **metadata** + attachments; Bethesda + result-sheet
**metadata**/events + coding; AI-reporting **metadata** + labeled AI-screening + KB reference; priors +
correlation + historical-report links; teleconsult + escalations (internal notes = `deferred`); result-sheet
authorization state + report/PDF **owner invocation**; timeline + provenance; the descriptive
permissions/actions band. Each is permission-gated, source-labeled, partial-failure-isolated, with owner
invocation and metadata-only reads.

**Must remain deferred** because it requires schema, a new owner read, a safe read-only method, a new
permission, clinical validation, image infrastructure, a provenance model, or an internal-collaboration
model: everything in §23. **These gaps are not softened or hidden** — they are named and classified (§6).

---

## 25. Recommended implementation sequence

Same isolated-review discipline as Phase 2 (one aggregate endpoint; frozen five-state contract; per-section
partial-failure isolation; owner invocation; continuity last). Each checkpoint is **independently reviewable
and rollback-safe**; no schema, Helix, permission, or seed change ships under this contract. Order is a
recommendation; the D2 feasibility audit may reorder it.

- **D1** — Architecture (this document).
- **D2** — Composition feasibility audit (confirm every §24 read is truthful and safe against the data model).
- **D3** — Binding implementation plan (aggregate/secret/lifecycle/permission contracts; section field lists).
- **A1** — Diagnostic workspace **shell** (route, entry gate `record:view`, empty aggregate wired, no data).
- **A2** — **Aggregate contract** (`GET /diagnostic-case/:recordId/overview` extending the sign-out `Section<T>`/`EffectivePermissions` contract; descriptive permission map; all bands `deferred`).
- **A3** — **Case identity + clinical context** (Band 1).
- **A4** — **Specimens + diagnostic material** (Band 2: specimens + attachments).
- **A5** — **WSI metadata + owner-viewer invocation** (Band 2: `listByRecordMeta`, deep-link; no bytes).
- **A6** — **Attachments + supporting files** (consolidate Band 2 files; `files` seam).
- **A7** — **Bethesda + diagnostic-interpretation metadata** (Band 3: Bethesda + result-sheet meta + coding).
- **A8** — **AI reporting metadata + simulated-screening disclosure** (Band 4; the truthfulness checkpoint).
- **A9** — **Priors + correlation** (Band 5).
- **A10** — **Collaboration + teleconsult** (Band 6; internal notes render `deferred`).
- **A11** — **Result sheets + authorization/sign-out invocation** (Band 7; owner invocation only; reconcile with Sign-Out per §26).
- **A12** — **Timeline + provenance** (Band 8).
- **A13** — **Workflow continuity** (return-aware entry + validated `returnTo` + guarded shortcuts; nav placement).
- **A14** — **Final verification + closeout** (failure isolation, secret/content audit, zero-orange, responsive, permission honesty, performance; documentation).

---

## 26. Conflict analysis

- **Vs. Sign-Out (Phase 2B):** Sign-Out is the **focused sign-out moment** — a read aggregate over the same
  `Record` (13 sections). This workspace is the **superset clinical surface**. **The one real duplication
  risk is two aggregates for one case.** Resolution: the workspace **reuses/extends** the `signout`
  `Section<T>`/`EffectivePermissions` contract and adds the bands sign-out omits (coding, quality/escalation/
  TAT, consultation, recall, KB, change-requests, report); it does not fork a divergent aggregate. Whether
  Sign-Out becomes a **mode/tab** of this workspace or stays a distinct entry is a D2/D3 decision — flagged,
  not decided (A11).
- **Vs. `/records/[id]`:** the record page already fans out to ~6 owner endpoints; the workspace is the
  orchestrated evolution of that fan-out, not a competitor. The record page remains an owner surface the
  workspace links to for edits.
- **Vs. Operations / Quality / Enterprise Administration (Phase 2):** those compose *operational*,
  *governance*, and *configuration* owners at the **list/lab** level; this composes *clinical* owners at the
  **single-case** level. No owner overlap that mutates the same data; the orchestration contract is shared
  and unmodified.
- **Excluded by design:** `report-center`/`bethesda-analytics` (lab-level analytics, no per-case truth);
  `proficiency` (training artifacts, no `recordId`); `requisition-portal` DRP staging (denormalized,
  soft-linked, pre-case). None belong on a single-case diagnostic surface.
- **Navigation placement (recommendation):** clinical nav lives in the `lab`/`results` groups
  (`apps/web/src/lib/nav.ts`); a case-workspace entry belongs alongside the diagnostic surfaces and — like
  Sign-Out/Quality/Enterprise Administration — should be **return-aware** (validated `returnTo`). A D3/A13
  detail, not decided here.

---

## 27. Verification summary

Verified against the codebase before stopping:
- **Every referenced module, service, route, and model exists** (§4 table; audited in `apps/api/src/modules/*`, `schema.prisma`, `apps/web/src/app/(app)/*`).
- **Every permission claim is accurate** (`seed.ts:16-52`; `permissions.guard.ts:22-28`): `record:view`/`:change`, `resultentry:view`/`:change`, `resultsheet:view`/`:create`/`:authorize`, `aidraft:view`/`:create` (seeded, Authorizers/Pathologist), `report:view`/`:create`, `kb:manage` (superuser-only), **no dedicated consult/correlation/wsi/screening permission** (grep-confirmed), **`changerequest:*` unseeded → superuser-only**.
- **AI screening is explicitly identified as simulated** (random-number, no inference — `ai-screening.service.ts:78-99`), and **AI reporting is explicitly distinguished from screening** (real/redacted/provenance/graceful-degradation — `ai.service.ts`, `ai-reporting.service.ts`).
- **Metadata-only composition seams documented** (`wsi.listByRecordMeta` `wsi.service.ts:65`; `ai-reporting.draftsByRecord` `ai-reporting.service.ts:82`; `result-sheets.metaByRecord`/`eventsByRecord`; `records.priorsByPatient`).
- **WSI image-delivery boundary preserved** (metadata + annotations only; viewer owns delivery — `wsi.service.ts:62`).
- **Files/GCS ownership documented accurately** (attachments + GCS/base64 delivery; no typing/linkage/versioning/checksum/soft-delete).
- **Teleconsult identified as external** (token-authed, de-identified, external free-text; not internal/authenticated/structured).
- **Knowledge-base limitations explicit** (generic CMS; not validated/curated/diagnosis-linked reference).
- **Record-centric anchoring explicit** (§5); **current reality separated from future recommendation** throughout (§4a, §5, §9, §18, §23).
- **No schema, code, Helix, permission, seed, or roadmap change.** **Internal links resolve** (all referenced docs present). **No conflict with the Phase 2 workspaces** (§26).

---

## 28. Status

Architecture only — no code, no wireframes, no schema, no Helix change, no permission/seed change, no
roadmap edit, no commit until reviewed. Every claim traces to the read-only audit (§4–§18); Missing/Future/
schema-gated capabilities are named and classified (§6, §23), not assumed. The one real duplication risk
(the Sign-Out aggregate) is surfaced and resolved by reuse, not fork (§26).

**This document does not begin D2. No implementation, no schema, no permission change, no commit. It stops
here for architectural review.** On approval, the next step is the **composition feasibility audit (D2)** in
the manner of [OSIERI_SIGNOUT_FEASIBILITY_AUDIT.md](OSIERI_SIGNOUT_FEASIBILITY_AUDIT.md),
[OSIERI_QUALITY_FEASIBILITY_AUDIT.md](OSIERI_QUALITY_FEASIBILITY_AUDIT.md), and
[OSIERI_ENTERPRISE_ADMINISTRATION_FEASIBILITY_AUDIT.md](OSIERI_ENTERPRISE_ADMINISTRATION_FEASIBILITY_AUDIT.md).
