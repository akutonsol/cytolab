# Osieri — Diagnostic Case Workspace: Composition Feasibility Audit (Phase 3A · D2)

| Field | Value |
|---|---|
| Status | Draft — feasibility audit only; no implementation, no schema, no Helix change, no permission/seed change, no roadmap edit, no commit |
| Current Phase | Osieri Phase 3A (Diagnostic Case Workspace) — D2 composition feasibility audit |
| Owner | Founder |
| Dependencies | [OSIERI_DIAGNOSTIC_CASE_WORKSPACE.md](OSIERI_DIAGNOSTIC_CASE_WORKSPACE.md) (D1, approved), [OSIERI_SIGNOUT_WORKSPACE.md](OSIERI_SIGNOUT_WORKSPACE.md) + [OSIERI_SIGNOUT_FEASIBILITY_AUDIT.md](OSIERI_SIGNOUT_FEASIBILITY_AUDIT.md) (Phase 2B, closed — the reuse target), [OSIERI_ENTERPRISE_ADMINISTRATION_FEASIBILITY_AUDIT.md](OSIERI_ENTERPRISE_ADMINISTRATION_FEASIBILITY_AUDIT.md) (contract precedent), [F4_AI_REPORTING_DESIGN.md](F4_AI_REPORTING_DESIGN.md), Helix v1.0 (frozen) |
| Last Updated | 2026-07-12 |
| Priority | P1 (gates D3 implementation plan) |
| Expected Next Milestone | Feasibility approval → binding implementation plan (D3) → checkpointed compose-only build (A1–A14) |

This audit answers one question: **can the Diagnostic Case Workspace be built truthfully today through
composition alone — without duplicating Sign-Out, owner logic, diagnostic truth, image delivery, AI
behaviour, lifecycle logic, or permission enforcement?** It is an architectural feasibility audit only:
**no code, no schema, no Helix, no permission/seed, no roadmap change, no commit.** Every claim traces to
the verified reads below; current reality is kept strictly separate from future recommendation.

---

## 1. Executive verdict

**Yes — Phase 3A is buildable today, compose-only, with zero schema/permission change.** Every clinical
band in D1 maps to an existing, verified, **mutation-free** owner read; the frozen five-state section
contract and the `EffectivePermissions` map already ship in Sign-Out and transfer directly; and every
diagnostic-truth, image-delivery, AI-generation, authorization, and lifecycle responsibility stays with its
owner.

Three findings shape the build and are non-negotiable:
1. **Reuse Sign-Out's owner loaders and type contract; do not fork, extend, or absorb the Sign-Out
   aggregate** (§3). The Diagnostic Case Workspace is a **separate aggregate endpoint that calls the same
   owner service methods** and reuses the same `Section<T>`/`SectionStatus`/`EffectivePermissions` types.
2. **A small blacklist of side-effecting "reads" must never be called by the aggregate** — KB
   `getArticleBySlug` (increments `viewCount`), teleconsult `publicCase` (flips `Pending→Viewed`),
   form-config `getOrCreate` (persists defaults), result-templates `use()` (increments `usageCount`),
   ai-screening `triggerScreening` (writes) (§7).
3. **AI Screening may appear only as a labeled simulation, and never inside the primary diagnostic decision
   flow** — it is a random-number simulation, not inference (§11).

---

## 2. Governing rule

Diagnostic truth belongs to owner systems. The workspace may **compose, summarize, organize, reveal
recorded evidence, navigate, and invoke owner workflows.** It must **never** infer diagnosis, reinterpret
findings, synthesize clinical truth, or duplicate owner validation, persistence, authorization, image
delivery, AI generation, or lifecycle rules — and it must **never present simulated AI as genuine
inference.** This audit tests feasibility strictly against that rule.

---

## 3. Sign-Out relationship decision (the primary decision)

### 3a. Verified overlap (concrete, not stylistic)
The Sign-Out aggregate (`signout.service.ts`) already composes **8 owner services** into **13 sections**
using this exact frozen contract (`signout.service.ts:20-352`):
`type SectionStatus = 'ready' | 'deferred' | 'forbidden' | 'error' | 'empty'`; `interface Section<T> {
status; data: T|null; reason? }`; `interface EffectivePermissions { … amend }`.

Verified owner calls it already makes (all mutation-free):

| Sign-Out section | Owner method called | File:line |
|---|---|---|
| case / patient / clinicalContext | `records.findOne(recordId)` | `signout.service.ts:407` |
| slides | `wsi.listByRecordMeta(recordId)` | `:451` |
| ai (screening) | `aiScreening.getByRecord(recordId)` | `:474` |
| bethesda | `bethesda.getByRecord(recordId)` | `:511` |
| correlation | `correlation.byCytologyRecord(recordId)` | `:548` |
| attachments | `files.getRecordAttachments(recordId)` | `:580` |
| resultSheets | `resultSheets.metaByRecord(recordId)` | `:601` |
| timeline | `resultSheets.eventsByRecord(recordId)` | `:608`, `:702` |
| aiDraft | `aiReporting.draftsByRecord(recordId)` | `:646` |
| priors | `records.priorsByPatient(patientId, currentRecordId)` | `:774` |
| priors (correlation) | `correlation.byPatient(patientId)` | `:782` |
| permissions | `buildPermissions()` (`EffectivePermissions`) | `:863-887` |

The Diagnostic Case Workspace (D1, 9 bands) needs **all of these** plus: **coding**
(`coding.getRecordCodings`), **quality** (`qc`/`escalation`/`tat` record-filtered reads), **recall**
(`recall.byPatient`), **teleconsult** (`teleconsult.list`), **released report** (`reports.findAll`),
**KB reference** (owner-invoked, not aggregate-read), and a **fuller timeline**.

### 3b. Options evaluated
1. **Extend the Sign-Out aggregate** (add the new sections into `signout.service.overview`).
2. **Wrap/reuse a shared record-centric composition service** (refactor Sign-Out's loaders into a shared service both aggregates call).
3. **Reuse selected owner loaders + the type contract while remaining a separate aggregate** (new endpoint `GET /diagnostic-case/:recordId/overview`, same owner methods, same `Section<T>` types, Sign-Out untouched).
4. **Replace/absorb Sign-Out as a mode of one workspace.**

### 3c. Decision — **Option 3 (reuse loaders + shared type contract; separate aggregate; Sign-Out untouched)**

| Criterion | Opt 1 extend | Opt 2 refactor-to-shared | **Opt 3 reuse-separate** | Opt 4 absorb |
|---|---|---|---|---|
| Breaks completed Phase 2B Sign-Out? | Risk (payload/contract change on a shipped endpoint) | Risk (rewrites Sign-Out into a shared service) | **No — zero change to Sign-Out** | High risk (route/entry/continuity rewrite) |
| Forks diagnostic truth? | No | No | **No — same owner reads** | No |
| Duplicate owner reads? | None, but couples superset into sign-out | Minimized | **Same methods reused; per-request only, both read-only** | None |
| Backward-compat / migration risk | Medium | **High** (frozen workspace refactor) | **Low (additive)** | **Highest** |
| Contract reuse | Full | Full | **Full (import/promote the pure types)** | Full |
| Honors CLAUDE.md "don't rewrite what works; evolve incrementally, additive-first" | Partial | No | **Yes** | No |

**Recommended: Option 3.** The Diagnostic Case Workspace ships as its **own** aggregate endpoint that
**calls the identical owner service methods** Sign-Out already calls (so there is one source of diagnostic
truth) and **reuses the identical `SectionStatus`/`Section<T>`/`EffectivePermissions` type contract**. The
only additive move is to **share the pure type contract** — promote the frozen `SectionStatus`/`Section<T>`/
`EffectivePermissions` types to a shared location (or import them from `signout` without modifying it). No
Sign-Out behaviour, payload, route, or type changes.

**Why the alternatives are inferior:**
- **Opt 1** overloads Sign-Out's focused, shipped payload for every existing Sign-Out consumer and couples
  the diagnostic superset into the sign-out endpoint — a regression surface on a completed workspace for no
  reuse benefit Option 3 doesn't already provide.
- **Opt 2** is the best *long-term* shape but requires **refactoring the frozen, completed Phase 2B
  Sign-Out** into a shared service now — migration/backward-compat risk against a shipped workspace,
  violating "don't rewrite what works." It is recorded as the **future consolidation path** once a second
  consumer has proven the shared loaders (consistent with the global "extract on the second product, not the
  first" instinct), **not** a Phase 3A prerequisite.
- **Opt 4** carries the highest breakage risk — it rewrites entry points, routes, and `returnTo`/continuity
  wiring of a completed workspace, and conflates two distinct workflows (the focused sign-out moment vs. the
  full diagnostic cockpit).

**Duplicate-read reality (accepted, mitigated):** if a user opens both Sign-Out and the Diagnostic Case
Workspace for the same record, the same owner reads run once **per request** (never concurrently within one
request). Both are read-only and cheap; client-side TanStack Query keyed by `recordId` can dedupe across
surfaces. Not a blocker; Option 2 is the eventual dedupe at the service layer.

**Sign-Out is not redesigned or removed in D2.** Whether Sign-Out later becomes a *mode/tab* of the
Diagnostic Case Workspace is deferred to a post-3A decision; this audit only commits to **reuse without
modification.**

---

## 4. Capability classification

Each capability is exactly one class. `DR` = Directly reusable from Sign-Out (method already called). `RC` =
Reusable through composition (existing mutation-free owner read, not yet in Sign-Out). `ROA` = Reusable with
owner-read addition (needs a small additive mutation-free read). `PS` = Partially supported. `SCHEMA` =
Requires schema evolution. `FUT` = Future. `PROHIB` = Prohibited to simulate/surface-as-real.

| Capability | Class | Owner · method · route · model · permission · truthfulness limit |
|---|---|---|
| Case identity + clinical context | DR | `records` · `findOne` · `GET /specimens/:id` · `Record`+`RecordStatusEvent` · `record:view` · no `createdBy` (inferred) |
| Patient summary | DR | `records` (record-embedded) · `record:view`/`patient:view` · age derived |
| Specimen list | DR | `records` · `findOne.specimens` · `record:view` · no sub-specimen structure |
| WSI slide metadata | DR | `wsi` · `listByRecordMeta` · `GET /wsi/record/:id` · `DigitalSlide` · `record:view` · no `slideUrl`; scan meta caller-asserted |
| Image (binary) delivery | PROHIB (proxy) / SCHEMA (infra) | viewer owns delivery (`wsi.service.ts:62`) |
| Attachments | DR | `files` · `getRecordAttachments` · `GET /files/record/:id` · `RecordAttachment` · `record:view` · no typing/version/checksum |
| Bethesda structured findings | DR | `bethesda` · `getByRecord` · `GET /bethesda/record/:id` · `BethesdaResult` · `resultentry:view` · cervical-only, 1/record |
| Result-sheet metadata + events | DR | `result-sheets` · `metaByRecord`/`eventsByRecord` · `resultsheet:view` · `ResultSheet`/`ResultSheetEvent` · metadata only |
| Coding | RC | `coding` · `getRecordCodings` · `GET /coding/record/:id` · `RecordCoding` · `record:view` · no "primary" flag |
| Result templates (reference) | RC (read-only `findAll`) | `result-templates` · `findAll` · `resultentry:view` · **`use()` is side-effecting — excluded** |
| AI reporting drafts | DR | `ai` · `draftsByRecord` · `AiDraft` · `aidraft:create` (Authorizers/Pathologist) · metadata only (no output/finalText) |
| AI screening | RC **as labeled sim** / PROHIB (as real) | `ai-screening` · `getByRecord` · `AIScreeningResult` · `record:view` · random-number sim |
| Correlation | DR | `correlation` · `byCytologyRecord`/`byPatient` · `CorrelationCase` · `record:view` · concordance human-entered |
| Priors | DR | `records` · `priorsByPatient` · `Record` projection · `resultentry:view` · bounded `take:50` |
| Historical reports | RC | `reports` · `findAll` (record/patient-filtered) · `Report` · `report:view` |
| Released report + PDF link | RC (invoke) | `reports` · `findAll`/`renderForRecord` · `report:view`/`:create` · stateless PDF; content vs PDF can diverge |
| Teleconsult (external) | RC | `teleconsult` · `list`/`detail` · `ConsultRequest` · `record:view` · **`publicCase` side-effecting — excluded**; external provenance |
| Escalations | RC | `escalation` · `list`/`summary` (record-filtered) · `EscalationRecord` · `record:view` · notify ts ≠ delivery |
| QC | RC | `qc` · `list` (record-filtered) · `QCCheck`/`QCFailureAlert` · `record:view` · pass writes nothing |
| TAT | RC | `tat` · `listAlerts` (record-filtered) · `TATAlert` · `record:view` · no-alert ≠ on-time |
| Recall | RC | `recall` · `byPatient` (record-filtered) · `RecallRecord` · `record:view` · notify ts ≠ delivery |
| KB reference | RC (owner-invoked only) | `knowledge-base` · **`getArticleBySlug` side-effecting — invoke, never aggregate-read** · generic CMS |
| Internal case notes/comments | SCHEMA | no `Note`/`Comment` model; `messaging` has no `recordId` |
| Structured consult adjudication | SCHEMA | consult response is external free text |
| Slide↔specimen / AI↔slide / ROI / image AI | SCHEMA (+infra) | no relations; annotations point-only |
| Synoptic authoring (non-cervical) | SCHEMA | `BethesdaResult` cervical-only |
| Report amendment/versioning/delivery, persisted PDF | SCHEMA | no addendum/version/delivery model |
| Canonical activity ledger | SCHEMA | only entity-specific event tables; no type discriminator |
| Case claim/lock, per-case quality flag | SCHEMA | only `Record.urgent`; quality derived |
| `Released`/`Archived` statuses, concordance ledger, quantification | SCHEMA/FUT | not modeled |
| Authoring/authorizing/releasing in-workspace | PROHIB | owner-only (`reports.create` gate; `result-sheets.authorize`) |

---

## 5. Clinical-band feasibility

For each band: **compose-now**, **already in Sign-Out**, **would duplicate Sign-Out**, **needs new safe
read**, **needs schema**, **owner-invoke only**, **deferred**, **never simulate**.

| Band | Compose now | Already in Sign-Out | New safe read needed | Schema | Owner-invoke only | Deferred | Never simulate |
|---|---|---|---|---|---|---|---|
| 1 Case Identity | Yes | Yes (`findOne`) | — | createdBy | edits → `/records/[id]` | — | inferred creator |
| 2 Diagnostic Material | Yes | Slides+attachments yes | — | sub-specimen, slide↔specimen | WSI viewer, file open | image bytes | verified scan meta |
| 3 Diagnostic Interpretation | Yes (metadata) | Bethesda+sheets yes | `coding.getRecordCodings` | Diagnosis, synoptic | editor, Bethesda modal | — | "the diagnosis" |
| 4 Decision Support | Yes | AI drafts yes; screening yes | KB owner-invoke | image AI | AI flow, KB article | internal notes | **screening as real** |
| 5 Prior Evidence | Yes | Priors+correlation yes | `reports.findAll` | — | prior record | — | longitudinal conclusions, concordance compute |
| 6 Collaboration | Yes (teleconsult, escalation) | — | `teleconsult.list`, `escalation.list` | internal notes, adjudication | teleconsult, escalations | internal notes | consultant as platform clinician |
| 7 Reporting & Sign-Out | Yes (state/events) | Sheets+events yes | `reports.findAll` | amendment/version | authorize, release, edit | — | authorize/release in-workspace |
| 8 Timeline & Provenance | Yes | Status+sheet events yes | — | canonical ledger | — | — | typed events not recorded |
| 9 Permissions & Actions | Yes | `EffectivePermissions` yes | extend map | — | — | — | role-name gating |

---

## 6. Owner/read matrix (safe composition reads — all verified mutation-free)

| Band | Owner service | Read method | Route | Model | Permission | Mutation-free? |
|---|---|---|---|---|---|---|
| 1 | `RecordsService` | `findOne` | `GET /specimens/:id` | `Record` | `record:view` | ✓ |
| 2 | `WsiService` | `listByRecordMeta` | `GET /wsi/record/:id` | `DigitalSlide` | `record:view` | ✓ (no URL) |
| 2 | `FilesService` | `getRecordAttachments` | `GET /files/record/:id` | `RecordAttachment` | `record:view` | ✓ (no bytes) |
| 3 | `BethesdaService` | `getByRecord` | `GET /bethesda/record/:id` | `BethesdaResult` | `resultentry:view` | ✓ |
| 3 | `ResultSheetsService` | `metaByRecord` / `eventsByRecord` | (internal seam) | `ResultSheet`/`ResultSheetEvent` | `resultsheet:view` | ✓ (metadata) |
| 3 | `CodingService` | `getRecordCodings` | `GET /coding/record/:id` | `RecordCoding` | `record:view` | ✓ |
| 4 | `AiReportingService` | `draftsByRecord` | (internal seam) | `AiDraft` | `aidraft:create` | ✓ (metadata) |
| 4 | `AIScreeningService` | `getByRecord` | `GET /ai-screening/record/:id` | `AIScreeningResult` | `record:view` | ✓ |
| 5 | `RecordsService` | `priorsByPatient` | (internal seam) | `Record` projection | `resultentry:view` | ✓ (`take:50`) |
| 5 | `CorrelationService` | `byCytologyRecord` / `byPatient` | `GET /correlation/patient/:id` | `CorrelationCase` | `record:view` | ✓ |
| 5/7 | `ReportsService` | `findAll` | `GET /reports` | `Report` | `report:view` | ✓ |
| 6 | `TeleconsultService` | `list` / `detail` | `GET /teleconsult` | `ConsultRequest` | `record:view` | ✓ |
| 6 | `EscalationService` | `list` / `summary` | `GET /escalations` | `EscalationRecord` | `record:view` | ✓ |
| 6 | `QcService` | `list` | `GET /qc` | `QCCheck`/`QCFailureAlert` | `record:view` | ✓ |
| 6 | `TatService` | `listAlerts` | `GET /tat/alerts` | `TATAlert` | `record:view` | ✓ |
| 6 | `RecallService` | `byPatient` | `GET /recalls/patient/:id` | `RecallRecord` | `record:view` | ✓ |
| 8 | `RecordsService` | `findOne.statusHistory` | (in `findOne`) | `RecordStatusEvent` | `record:view` | ✓ |

**Composition strategy:** each band loader mirrors Sign-Out's shape — call the owner read, map to a section
type, return a `Section<T>`; never touch Prisma directly (§25). **Owner-invocation strategy:** every "act"
is `router.push` to the owner surface (§14, §20 of D1).

---

## 7. Read/mutation safety audit (the blacklist)

Every read the aggregate calls **must be mutation-free.** Verified side-effecting "reads" that the aggregate
**must never call** (use the read-only sibling or owner-invoke instead):

| Owner "read" | Side effect (verified) | Verdict |
|---|---|---|
| `knowledge-base.getArticleBySlug` | `viewCount: { increment: 1 }` (`knowledge-base.service.ts:165`) | **Excluded — KB is owner-invoked only; the aggregate never reads an article** |
| `teleconsult.publicCase` | `Pending → Viewed` on first view (`teleconsult.service.ts:175`) | **Excluded — aggregate uses `teleconsult.list`/`detail` (read-only `consultSelect`)** |
| `form-config.getOrCreate`/`getConfig`/`getFormSchema` | `formConfig.create` persists defaults (`form-config.service.ts:25`) | **Excluded — form-config is intake-only and not in the diagnostic workspace** |
| `result-templates.use()` | `usageCount: { increment: 1 }` (`result-templates.service.ts:103`) | **Excluded — aggregate uses read-only `findAll`; `use()` fires only from the editor** |
| `ai-screening.triggerScreening` / `review` | `create`/`update` `AIScreeningResult` | **Excluded — aggregate uses read-only `getByRecord`** |
| `ai (reporting) generateNarrative/suggestCodes/checkConsistency` | persists `AiDraft` | **Excluded — aggregate uses read-only `draftsByRecord` (metadata)** |

**Confirmed safe (no side effects, no secret/PHI/binary/owner-content leakage):** all reads in §6 —
`findOne`, `listByRecordMeta` (no `slideUrl`), `getRecordAttachments` (no bytes), `getByRecord`
(bethesda/screening), `metaByRecord`/`eventsByRecord` (metadata), `draftsByRecord` (no output/finalText),
`priorsByPatient`, `byCytologyRecord`/`byPatient`, `getRecordCodings`, `list`/`summary`/`listAlerts`/
`byPatient` (qc/escalation/tat/recall/teleconsult), `reports.findAll`.

---

## 8. Imaging / WSI feasibility

Verified: `WsiService.listByRecordMeta` (`wsi.service.ts:65`) returns slide **metadata with no `slideUrl`**
— safe for composition and already used by Sign-Out. **Image URLs/bytes remain excluded from the
aggregate; the viewer remains the sole image-delivery owner** (`wsi.service.ts:62`). `DigitalSlide` is
Record-anchored (`schema.prisma:2624`); **no slide-to-specimen relation** (`DigitalSlide` has no
`specimenId`) and **no image-AI relation** exist; **annotations are point-only** (`SlideAnnotation.x/y`, no
ROI geometry); **scan metadata (`magnification`/`stain`/`scanner`/`format`) is nullable/caller-asserted** and
must be labeled as such. **The workspace may show:** slide count, per-slide metadata, annotation count.
**Must remain owner-invoked:** opening a slide (viewer). **No image delivery is proposed inside the
aggregate.**

---

## 9. Attachments feasibility

Verified: `FilesService` is the **only** binary-storage owner (GCS when `STORAGE_BUCKET` set, else base64;
`files.service.ts:16-48`); `RecordAttachment` is Record-anchored (`schema.prisma:1372`). `storageUrl`/bytes
remain **excluded** from aggregate summaries (the aggregate shows `filename`, `kind`/MIME, `createdAt`). No
semantic document type; no `uploadedBy`/`size`/`checksum`/versioning; no specimen/result-sheet/slide
linkage. **`files.getRecordAttachments` is directly reusable from Sign-Out** (already called at
`signout.service.ts:580`) — no shared loader needed beyond reusing that method.

---

## 10. Diagnostic interpretation feasibility

Verified: **no first-class `Diagnosis` model** (`grep "model .*[Dd]iagnos"` → none). Diagnostic meaning is
split across `BethesdaResult` (structured, **cervical-only, one-per-record**, `recordId @unique`),
`ResultLine`/`ResultSheet.narrative` (free text), `Report.content` (released snapshot), and `RecordCoding`
(SNOMED/ICD). **Diagnosis must not be synthesized;** **cervical Bethesda cannot be generalized into a
universal diagnosis owner;** result narrative/lines, report content, and coding remain **separate owner
evidence.** There are **no first-class gross/microscopic structured-finding models** — "findings" live as
`ResultLine.result`/`.findings` free text.

**Showable today as recorded interpretation metadata:** Bethesda enums + deterministic `shortCode` +
owner-`generatedNarrative`; result-sheet **metadata** (authorized flag, authorizer, events) — **not** entry/
line/narrative bodies; assigned codes via `getRecordCodings`; released-report presence + PDF link. **Requires
schema/owner work:** first-class diagnosis, generic synoptic authoring, structured gross/microscopic
findings.

---

## 11. AI feasibility (Reporting and Screening treated separately)

**AI Reporting (`ai`) — safe to compose (metadata only).** Verified: real model-backed
(`ai.service.ts`), **redacted** input (`caseRef` opaque, "NEVER the labNumber", `ai-reporting.service.ts:199`),
**provenance-tracked** (`model`/`promptVersion`/`redactionPolicy`/`inputDigest`), **persisted** `AiDraft`,
**human acceptance/rejection** (`finalText` becomes report content, not raw output), **graceful degradation**
(`ai.service.ts:18-49` never throws), **non-blocking to authorization.** Composition seam
`draftsByRecord` returns **metadata only** — `output`/`finalText` **deliberately excluded**. Gate:
`aidraft:create` (Authorizers/Pathologist).

**AI Screening (`ai-screening`) — decision: may appear ONLY as a labeled simulation, and NOT in the
primary diagnostic decision flow.** Verified: `completeScreening` fabricates findings/confidence with
**random numbers** seeded off the existing Bethesda shortcode (`ai-screening.service.ts:78-99`,
`SIMULATE_MS = 2000`); **no image inference, no model/version provenance, no slide linkage, untyped
`findings` JSON**, not clinically authoritative. **Verdict:** it **may** be surfaced (Sign-Out already reads
`getByRecord`), but **only** with **mandatory disclosure and hard visual separation** from AI Reporting and
from the interpretation band:
- a persistent **"Simulated / experimental — not diagnostic"** label wherever any screening field appears;
- rendered in a **distinct, non-diagnostic treatment**, never adjacent to Bethesda/result findings;
- `confidence`/`primaryFinding`/`flaggedAreas` **never** presented as a real algorithmic result, and
  **never** aggregated into any "AI agreement/accuracy" figure shown as real;
- **classified `PROHIB` for the primary diagnostic decision flow** — it must not influence, annotate, or sit
  inside the interpretation/decision surface a pathologist uses to reach the diagnosis.

If a future reviewer judges the disclosure insufficient to prevent misreading, the safe fallback is to
**omit AI Screening from the Diagnostic Case Workspace entirely** and leave it on its standalone
`/ai-screening` surface. This audit permits it **only** under the disclosure above.

---

## 12. Prior evidence / correlation feasibility

Verified: `RecordsService.priorsByPatient(patientId, excludeRecordId)` (`records.service.ts:170`) —
**deterministic** `orderBy createdAt desc`, **bounded** `take:50`, **current-record excluded**
(`id:{not:excludeRecordId}`), **patient-scoped** and tenant-scoped via `LabContext`. Correlation reads
(`byCytologyRecord`/`byPatient`) expose `CorrelationCase` where **concordance is human-entered, never
computed** (`correlationResult`), and `cytologyDiagnosis` is a **re-typed snapshot** that may drift.
Historical reports via `reports.findAll` (record/patient-filtered). Prior slides/attachments are **not**
surfaced in aggregate (owner-invoked on the prior record). **The workspace must not infer longitudinal
conclusions or compute concordance** — it shows recorded priors and recorded correlation, each labeled with
its own date and case link (historical ≠ current, §22).

---

## 13. Collaboration feasibility

Verified: **Teleconsult is external consultation** — token-based external access, de-identified sharing,
external free-text response; **not internal collaboration**, **not an authenticated platform-clinician
identity** (provenance is the single-use `accessToken`), **no structured adjudication.** `sharedImages` is
an **intent boolean that does not actually deliver slides** (`publicCase` returns narrative/Bethesda text
only). Safe composition: `teleconsult.list`/`detail` (read-only `consultSelect`) — **`publicCase` is
excluded** (side-effecting, §7). Escalations via `escalation.list`/`summary` (record-filtered);
`physicianNotifiedAt` marks app action, **not delivery proof**. **Internal case notes/comments are
`SCHEMA`-gated** (no native model; `messaging` has no `recordId`) → the collaboration band renders that
panel `deferred`. **Composable as metadata:** consult status/urgency/consultant/agreement, escalation
status/severity/reviewer. **Owner-invoked:** opening a consult or escalation.

---

## 14. Reporting / sign-out feasibility

Verified: result-sheet **state/events** compose from `metaByRecord`/`eventsByRecord` (metadata; the `amend`
capability = `resultentry:change && resultsheet:authorize`, per `buildPermissions`). Released report composes
from `reports.findAll`; the PDF is **owner-invoked** (`renderForRecord`, stateless, auth re-checked; **no
persisted PDF**; `Report.content` vs live PDF can diverge). **Authorization, de-authorization, amendment,
and release stay entirely on the owner** (`result-sheets.authorize`; `reports.create` "the gate",
`reports.service.ts:57-79`). **The workspace never authorizes, releases, or amends** — it shows state and
invokes `/authorizer`/`AuthorizationModal`/`/reports`.

---

## 15. Timeline / provenance feasibility

Verified event sources: `RecordStatusEvent` (status/actor/note/ts, append-only) and `ResultSheetEvent`
(authorize/deauthorize/reauthorize) — both already composed by Sign-Out; plus `AiDraft` provenance fields,
`ConsultRequest` status transitions, `RecordAttachment.createdAt`, `DigitalSlide`/`SlideAnnotation`
timestamps. **There is no canonical activity ledger** — sources are entity-specific and `RecordStatusEvent`
has **no event-type discriminator** (QC failures pin a note at the record's *current* status,
`qc.service.ts:70-77`). **Verdict:** the timeline can be assembled truthfully **only as a source-labeled,
non-canonical merge** — each event tagged with its source, actor shown where recorded (`userId` nullable),
partial-source failure represented via `unavailable[]` (§17). **`updatedAt` must never be used as an event.**
Unresolvable actors/timestamps are shown as "—", never inferred.

---

## 16. Permission feasibility

Verified against `seed.ts:16-52` and `permissions.guard.ts:22-28` (no `@RequirePermissions` → any authed
user; `isSuperRole` bypasses; else must hold every code; uncatalogued → superuser-only).

- **Base-entry permission:** `record:view` (mirrors Sign-Out's `/signout/case/:recordId`).
- **Per-section descriptive permissions (verified seeded + held by ordinary staff unless noted):**
  `record:view`/`:change`; `patient:view`; `resultentry:view`/`:change`; `resultsheet:view`/`:create`/
  `:authorize`; `aidraft:view`/`:create` (**Authorizers/Pathologist only**); `report:view`/`:create`.
- **Generic `record:*` gates the entire WSI / files / AI-screening / teleconsult / QC / escalation / TAT /
  recall surface** — **no dedicated `wsi:*`/`consult:*`/`correlation:*`/`screening:*` permission exists**
  (grep-confirmed). The workspace mirrors the actual `record:*` gate.
- **Superuser-only / unseeded gaps:** `kb:manage` (seeded, assigned to no role); `applicationprefs:*`
  (superuser-only); **`changerequest:*` unseeded → superuser-only** (its panel renders `forbidden`, not
  `empty`, for staff).
- **`EffectivePermissions` contract:** **extend the Sign-Out map** (reuse `viewCase/viewSlide/viewAI/
  viewBethesda/viewCorrelation/viewPriors/viewResultSheet/createResultSheet/amend` verbatim; add
  `viewCoding=record:view`, `viewQuality=record:view`, `viewConsult=record:view`, `viewRecall=record:view`,
  `viewReport=report:view`, `viewChangeRequests=changerequest:view` (surfaced honestly as superuser-only)).
  **Descriptive only; owner endpoints remain the enforcement authority.** No role-name assumptions, no
  aliasing, no new permission.

---

## 17. Section / failure contract

The frozen five-state contract **remains viable and is reused verbatim** (`ready`/`empty`/`forbidden`/
`error`/`deferred`, `signout.service.ts:20`). For multi-source bands (Diagnostic Material = slides+
attachments; Decision Support = AI+screening+KB; Prior = priors+correlation+reports; Collaboration =
teleconsult+escalation; Quality = qc+escalation+tat):
- each source resolves independently to its own sub-`Section<T>`; the band exposes a **`unavailable[]`** of
  failed/forbidden sources and **renders partially**;
- **case identity is preserved** even if every other source fails (band-1 failure = single top-level
  `error`, never a blank with fabricated identity);
- **no false `empty`** when a source errors; **no inferred substitute data**; **no whole-workspace
  collapse.** This is exactly the Sign-Out partial-failure behaviour.

---

## 18. Payload / performance findings

- **Owner-read count:** ~16–18 mutation-free reads per case load (12 already in Sign-Out + coding + reports
  + teleconsult + qc + escalation + tat + recall). Composed in parallel (`Promise.all`), each isolated.
- **Payload:** metadata-only (no image bytes, no attachment bytes, no AI output/finalText, no PDF, no result
  content) — comparable to the Sign-Out aggregate plus ~6 small record-filtered lists.
- **Likely duplicate reads with Sign-Out:** the 12 shared methods, if both surfaces are open for one record
  — **not concurrent within a request**; mitigated by reusing the same methods (uniform caching) and
  client-side query-key dedupe; the eventual service-layer dedupe is Option 2 (§3).
- **Shared-loader opportunity:** the 12 Sign-Out methods are the natural shared loaders (Option 2 future).
- **Bounded lists (required):** priors already `take:50`; slides/attachments/coding/qc/escalation/tat/recall/
  teleconsult reads must be **bounded per record** (cap + count) to prevent timeline/prior/list growth.
- **Bottlenecks + mitigations:** (a) per-status prior/lifecycle reads → reuse the single `priorsByPatient`
  projection, don't fan out per status; (b) timeline growth → cap + source-label, newest-first; (c) many
  small record-filtered list calls → parallelize and isolate; consider a future single record-scoped read
  per owner (owner-read addition, §20) if latency warrants. **No invented budgets** — the Phase 2
  `measure:experience` harness governs at build time.

---

## 19. Buildable-now scope

**Directly reusable from Sign-Out (methods already called):** case identity, patient, clinical context,
WSI slide metadata, attachments, Bethesda, result-sheet metadata + events, AI drafts (metadata), AI
screening (as labeled sim), correlation, priors — **and the `SectionStatus`/`Section<T>`/
`EffectivePermissions` contract.**

**Reusable from existing owner reads (mutation-free, not yet in Sign-Out):** coding (`getRecordCodings`),
released/historical reports (`reports.findAll`), teleconsult (`list`/`detail`), escalations (`list`/
`summary`), QC (`list`), TAT (`listAlerts`), recall (`byPatient`).

**Requires a small additive mutation-free owner read (§20):** optional per-owner record-scoped convenience
reads (e.g. `escalation.byRecord`, `qc.byRecord`) if the record-filtered `list` proves awkward or unbounded
— additive, read-only, no schema.

**Owner-invocation only:** WSI viewer, attachment open, result editor, `AuthorizationModal`, teleconsult,
Bethesda modal, AI reporting flow, correlation review, prior record, KB article, report PDF.

**Schema-gated (§21)** and **prohibited to simulate (§22)** as listed below.

---

## 20. Owner-read additions required

**None are strictly required for the compose-only build** — every band has a verified mutation-free read
(§6). Two *optional, additive, read-only* conveniences would tighten payload/latency and are the only owner
touches the build might warrant (each additive, no schema, no permission change, reviewed on its own):
1. **Record-scoped list variants** where today only a filtered global `list` exists (`escalation.byRecord`,
   `qc.byRecord`, `tat.byRecord`, `recall.byRecord`, `teleconsult.byRecord`) — bounded, mutation-free,
   mirroring `wsi.listByRecordMeta`.
2. **A metadata-only `reports.metaByRecord`** (presence + `releasedAt` + id, no `content`) to avoid pulling
   report bodies.

If D3 prefers zero owner-code additions, the filtered global reads (§6) suffice; the additions are a
payload/clarity optimization, not a feasibility gate.

---

## 21. Schema-gated / deferred capabilities (verified — not softened)

First-class `Diagnosis`; generic synoptic authoring; structured gross/microscopic findings; slide↔specimen
relation; AI↔slide relation; image AI; ROI geometry/measurements/quantification; internal case-note thread;
internal-consult model; structured external-consult adjudication; report amendment/versioning; persisted
PDF/delivery tracking; canonical activity ledger; case claim/lock; per-case quality flag; Read→Reveal (as a
first-class model); concordance ledger; `Released`/`Archived` lifecycle states. Each has **no owner model
today** and is a future schema decision — **none is built or simulated in Phase 3A.**

---

## 22. Prohibited-to-simulate capabilities

Authoring/editing diagnosis, findings, or synoptic data; authorizing/de-authorizing/releasing; computing
"the diagnosis"; **presenting AI Screening as real inference or placing it in the primary diagnostic
decision flow**; presenting KB as validated clinical reference; proxying image bytes through the aggregate;
inventing a per-case quality flag/score; computing concordance; inferring longitudinal conclusions;
rendering `forbidden` as `empty`; using `updatedAt` as an event.

---

## 23. Risk register

| # | Risk | Mitigation |
|---|---|---|
| 1 | Duplicating Sign-Out | Option 3: separate aggregate, **reuse** owner methods + type contract; no fork (§3). |
| 2 | Breaking the completed Phase 2B Sign-Out | **Zero change to Sign-Out**; additive type-sharing only (§3). |
| 3 | Second-record-page drift | Compose/invoke only; zero mutation; record page stays an owner surface (§14, §20). |
| 4 | Duplicate owner reads | Same methods reused (uniform caching); client query-key dedupe; Option 2 future dedupe (§18). |
| 5 | Clinical cognitive overload | Collapsible bands, workflow order, progressive disclosure (D1 §21). |
| 6 | Simulated AI misrepresentation | Mandatory disclosure + hard visual separation; excluded from primary decision flow; fallback = omit (§11). |
| 7 | Image bytes leaking into orchestration | Metadata-only seam (no `slideUrl`/bytes); viewer owns delivery (§8). |
| 8 | PHI leakage | Owner redaction retained; aggregate reads metadata only, no `output`/`finalText`/tokens/bytes (§7, §11). |
| 9 | Teleconsult provenance ambiguity | Label "external consultant (token-verified)"; agreement shown as consultant-asserted; token never read (§13). |
| 10 | Historical evidence shown as current | Distinct "Prior" treatment, per-prior date + case link; current never co-mingled (§12). |
| 11 | Record-centric mistaken for specimen-centric | State the Record anchor; never imply slide↔specimen/AI↔slide links (§8, §10). |
| 12 | Generic KB shown as validated reference | KB owner-invoked only, labeled "lab reference"; no diagnosis auto-binding (§11). |
| 13 | Permission widening | Descriptive map mirroring owner gates; `changerequest` forbidden-honest; no aliasing (§16). |
| 14 | Side-effecting reads in an aggregate | Blacklist enforced: KB/publicCase/getOrCreate/use/trigger excluded (§7). |
| 15 | Payload growth | Metadata-only; bounded lists; parallel isolated reads (§18). |
| 16 | Timeline growth | Cap + source-label + newest-first; no `updatedAt`-as-event (§15). |
| 17 | Responsive overload | Single-column reflow; internal `overflow-x`; body never scrolls horizontally (D1 §21). |
| 18 | Schema creep | Compose-only; every gap deferred and named (§21); no model/migration. |
| 19 | Helix scope creep | Helix tokens/components only; v1.0 frozen. |

---

## 24. Definitive recommendation

1. **Is Phase 3A buildable today?** **Yes** — compose-only, no schema/permission change.
2. **Architecture relative to Sign-Out?** **Option 3** — a **separate aggregate** (`GET
   /diagnostic-case/:recordId/overview`) that **reuses Sign-Out's owner loader methods and the frozen
   `Section<T>`/`EffectivePermissions` type contract**, leaving Sign-Out untouched. Option 2 (shared
   composition service) is the recorded future consolidation once a second consumer proves the loaders.
3. **Safe to compose now?** All 9 bands via §6 reads; DR + RC in §19.
4. **Need owner-read additions?** **None required;** optional additive record-scoped reads + a
   `reports.metaByRecord` are payload optimizations only (§20).
5. **Require schema?** §21 list — none built in 3A.
6. **Must remain deferred?** §21 (schema) + internal notes/adjudication.
7. **Prohibited to simulate?** §22 — chiefly AI Screening as real, and any authoring/authorization/release.
8. **Recommended sequence:** proceed to **D3** (binding plan), then **A1–A14** as in D1 §25, with the AI
   band (A8) carrying the mandatory-disclosure gate and A11 recording the Sign-Out reuse boundary.

---

## 25. Verification summary

Verified before stopping:
- **Every referenced module, service, owner method, route, and model exists** (§6 matrix; audited in
  `apps/api/src/modules/*`, `schema.prisma`).
- **Sign-Out overlap analyzed concretely** (§3a table with `signout.service.ts` line cites); **one
  relationship recommended** (Option 3).
- **Metadata-only seams verified:** `listByRecordMeta` (no URL), `draftsByRecord` (no output/finalText),
  `metaByRecord`/`eventsByRecord`, `priorsByPatient`.
- **Side-effecting reads identified and blacklisted** (§7): KB `getArticleBySlug` (viewCount),
  `teleconsult.publicCase` (Pending→Viewed), `form-config.getOrCreate` (persists defaults),
  `result-templates.use()` (usageCount), `ai-screening.triggerScreening` (writes).
- **AI Screening explicitly simulated** (random-number, no inference); **AI Reporting explicitly
  distinguished** (real/redacted/provenance/graceful/non-blocking).
- **WSI image-delivery boundary preserved** (viewer owns delivery); **Files/GCS ownership accurate**;
  **Teleconsult identified as external**; **KB limitations explicit**; **record-centric anchoring explicit.**
- **Current reality separated from future recommendation** throughout; **no direct Prisma proposed for the
  aggregate** (owner services only, §6).
- **No schema, code, Helix, permission, seed, or roadmap change.** **Internal links resolve.** **No conflict
  with completed Phase 2 workspaces** (§3, §23).

---

## 26. Status

Feasibility audit only — no code, no schema, no Helix, no permission/seed, no roadmap change, no commit
until reviewed. **Verdict: Phase 3A is buildable today, compose-only, via a separate aggregate that reuses
Sign-Out's owner loaders and type contract (Option 3), with a strict side-effecting-read blacklist and a
mandatory AI-Screening disclosure.** This document **does not begin D3** and makes no change to Sign-Out. On
approval, the next step is the **binding implementation plan (D3)**.
