# Osieri — Diagnostic Case Workspace: Implementation Plan (Phase 3A · D3 — binding contract)

| Field | Value |
|---|---|
| Status | Draft — binding implementation contract; no implementation, no schema, no Helix change, no permission/seed change, no roadmap edit, no commit until reviewed |
| Current Phase | Osieri Phase 3A (Diagnostic Case Workspace) — D3 implementation plan |
| Owner | Founder |
| Dependencies | [OSIERI_DIAGNOSTIC_CASE_WORKSPACE.md](OSIERI_DIAGNOSTIC_CASE_WORKSPACE.md) (D1, approved), [OSIERI_DIAGNOSTIC_CASE_FEASIBILITY_AUDIT.md](OSIERI_DIAGNOSTIC_CASE_FEASIBILITY_AUDIT.md) (D2, approved), [OSIERI_SIGNOUT_WORKSPACE.md](OSIERI_SIGNOUT_WORKSPACE.md) (Phase 2B, closed — reuse target, unchanged), [OSIERI_ENTERPRISE_ADMINISTRATION_IMPLEMENTATION_PLAN.md](OSIERI_ENTERPRISE_ADMINISTRATION_IMPLEMENTATION_PLAN.md) (plan precedent), [F4_AI_REPORTING_DESIGN.md](F4_AI_REPORTING_DESIGN.md), Helix v1.0 (frozen) |
| Last Updated | 2026-07-13 |
| Priority | P1 (the binding contract for the A1–A14 build) |
| Expected Next Milestone | Plan approval → A1 (workspace shell) → checkpointed compose-only build through A14 closeout, each independently reviewed |

This is the **binding implementation contract** for Phase 3A. Every checkpoint, owner mapping, permission,
verification gate, and truthfulness boundary below governs the build. It contains **no code, no schema, no
Helix, no permission/seed, no roadmap change, and no commit.** The architecture (D1) and feasibility (D2)
are approved and **frozen** (§2); this plan operationalizes them and must not reopen them without a verified
blocker.

---

## 1. Governing principle

Diagnostic truth belongs to owner systems. The Diagnostic Case Workspace may only **compose, summarize,
organize, reveal, invoke owner workflows, and navigate.** It may **never** diagnose, interpret, infer,
authorize, release, edit, persist, validate, recalculate, duplicate owner business logic or lifecycle,
proxy image delivery, generate AI, or present simulated AI as genuine AI. Every checkpoint is tested against
this principle at its verification gate (§8, §19).

---

## 2. Frozen architecture (must not be reopened)

Approved in D1/D2 and **frozen for Phase 3A**:

1. **Diagnostic Case is a separate aggregate.** Endpoint: **`GET /diagnostic-case/:recordId/overview`**.
2. **Sign-Out remains unchanged** — no payload extension, no absorption, no replacement, no shared-loader
   service, no refactor of Sign-Out during Phase 3A.
3. **Reuse from Sign-Out (verbatim):** the `Section<T>` and `SectionStatus` types, the `EffectivePermissions`
   pattern, the partial-failure isolation behaviour, and the permission model. The **owner loader methods**
   Sign-Out already calls are reused **by calling the same owner service methods** (not by importing
   Sign-Out's private loaders).
4. **Option 2 (shared composition service)** is documented as a **future** optimization only, viable **after
   a second consumer exists** — explicitly out of scope for Phase 3A.
5. **Clinical section order is frozen** (§4) and must never be reordered later.

A change to any of these requires a new, verified blocker surfaced for review — not an in-flight decision.

---

## 3. Aggregate contract (frozen)

The aggregate is a NestJS module `diagnostic-case` exposing one read-only endpoint. It composes owner
**services** (never Prisma) and returns a single typed payload. Shapes below are the **contract**; field
lists per section are fixed at their checkpoint.

### 3a. Types (reused from Sign-Out; the diagnostic payload extends only its own map)
```
// REUSED VERBATIM from the frozen Sign-Out contract (signout.service.ts:20-24):
type SectionStatus = 'ready' | 'empty' | 'forbidden' | 'error' | 'deferred';
interface Section<T> { status: SectionStatus; data: T | null; reason?: string; }

// Multi-source bands carry a per-source availability list:
interface UnavailableSource { source: string; status: 'forbidden' | 'error' | 'empty' | 'deferred'; reason?: string; }
// A multi-source section's data includes `unavailable: UnavailableSource[]` and renders partially.
```

### 3b. `DiagnosticCaseOverview` (the frozen envelope)
```
interface DiagnosticCaseOverview {
  recordId: string;
  permissions: EffectivePermissions;          // descriptive; owner endpoints remain authoritative
  // Bands in frozen order (§4). Each is a Section<T> (multi-source bands carry unavailable[]).
  caseIdentity:        Section<CaseIdentity>;
  diagnosticMaterial:  Section<DiagnosticMaterial>;   // slides(meta) + attachments(meta)
  interpretation:      Section<Interpretation>;        // bethesda + resultSheet meta/events + coding
  decisionSupport:     Section<DecisionSupport>;        // aiDrafts(meta) + aiScreening(labeled) + kb(invoke-only)
  priorEvidence:       Section<PriorEvidence>;          // priors + correlation + historical reports
  collaboration:       Section<Collaboration>;          // teleconsult + escalation ; internal notes = deferred
  reporting:           Section<Reporting>;              // resultSheet state + report + release (owner-invoke)
  timeline:            Section<Timeline>;               // status + result-sheet events (source-labeled)
  // Band 9 (Permissions & Actions) is the top-level `permissions` map above + per-section status.
}
```

### 3c. `EffectivePermissions` extension (reuse Sign-Out map; add diagnostic-only keys)
Reuse verbatim from `signout.service.ts:863-887`: `viewCase`, `viewSlide`, `viewAI`, `viewBethesda`,
`viewCorrelation`, `viewPriors`, `viewResultSheet`, `createResultSheet`, `viewAttachments`, `viewAudit`,
`amend`. **Add (descriptive only):** `viewCoding = record:view`, `viewQuality = record:view`,
`viewConsult = record:view`, `viewRecall = record:view`, `viewReport = report:view`,
`viewChangeRequests = changerequest:view` (surfaced honestly as superuser-only). Built via
`has(code) = !!user.isSuperRole || user.permissions.includes(code)`.

### 3d. Composition rules (frozen)
- The service holds **no Prisma**; it injects owner services and calls **only mutation-free reads** (§5, §6).
- All section loaders run in parallel; **each always resolves to a `Section<T>`** and never rejects. Failure
  of one owner **never** collapses another section (§7).
- **Metadata only:** no image bytes/`slideUrl`, no attachment bytes/`storageUrl`, no AI `output`/`finalText`,
  no result entry/line/narrative bodies, no PDF, no tokens.
- **Side-effecting reads are blacklisted** (§5b).

---

## 4. Clinical section order (frozen — never reorder)

1. **Case Identity** · 2. **Diagnostic Material** · 3. **Diagnostic Interpretation** · 4. **Decision
Support** · 5. **Prior Evidence** · 6. **Collaboration** · 7. **Reporting & Sign-Out** · 8. **Timeline &
Provenance** · 9. **Permissions & Actions**.

---

## 5. Owner mapping (verified — no invented methods)

### 5a. Required reads (all verified mutation-free; the build uses these)
| Band | Owner service | Reused method | Source | Reused-from-Sign-Out? |
|---|---|---|---|---|
| 1 | `RecordsService` | `findOne(recordId)` | `records.service.ts:217` | Yes (`signout:407`) |
| 2 | `WsiService` | `listByRecordMeta(recordId)` | `wsi.service.ts:65` | Yes (`signout:451`) |
| 2 | `FilesService` | `getRecordAttachments(recordId)` | `files.service.ts` | Yes (`signout:580`) |
| 3 | `BethesdaService` | `getByRecord(recordId)` | `bethesda.service.ts:128` | Yes (`signout:511`) |
| 3 | `ResultSheetsService` | `metaByRecord(recordId)` / `eventsByRecord(recordId)` | `result-sheets.service.ts:171,154` | Yes (`signout:601,608`) |
| 3 | `CodingService` | `getRecordCodings(recordId)` | `coding.service.ts:66` | No (new reuse) |
| 4 | `AiReportingService` | `draftsByRecord(recordId)` | `ai-reporting.service.ts:82` | Yes (`signout:646`) |
| 4 | `AIScreeningService` | `getByRecord(recordId)` | `ai-screening.service.ts:42` | Yes (`signout:474`) |
| 5 | `RecordsService` | `priorsByPatient(patientId, excludeRecordId)` | `records.service.ts:170` | Yes (`signout:774`) |
| 5 | `CorrelationService` | `byCytologyRecord(recordId)` / `byPatient(patientId)` | `correlation.service.ts:85,79` | Yes (`signout:548,782`) |
| 5/7 | `ReportsService` | `findAll(query)` (record/patient-filtered) | `reports.service.ts:81` | No (new reuse) |
| 6 | `TeleconsultService` | `list(query)` / `detail(id)` | `teleconsult.service.ts` | No (new reuse) |
| 6 | `EscalationService` | `list(query)` / `summary()` | `escalation.service.ts` | No (new reuse) |
| 6 | `QcService` | `list(query)` (record-filtered) | `qc.service.ts:81` | No (new reuse) |
| 6 | `TatService` | `listAlerts(query)` | `tat.service.ts` | No (new reuse) |
| 6 | `RecallService` | `byPatient(patientId)` | `recall.service.ts` | No (new reuse) |
| 8 | `RecordsService` | `findOne(...).statusHistory` + `resultSheets.eventsByRecord` | (as above) | Yes |
| 9 | (permission map) | `buildPermissions()` pattern | `signout.service.ts:863` | Pattern reused |

### 5b. Side-effecting reads — BLACKLISTED (aggregate must never call; verified in D2 §7)
- `KnowledgeBaseService.getArticleBySlug` — increments `viewCount` (`knowledge-base.service.ts:165`).
  **KB is owner-invoked only; the aggregate never reads an article.**
- `TeleconsultService.publicCase` — flips `Pending → Viewed` (`teleconsult.service.ts:175`). Aggregate uses
  read-only `list`/`detail` only.
- `FormConfigService.getOrCreate`/`getConfig`/`getFormSchema` — persist defaults (`form-config.service.ts:25`).
  **Form-config is intake-only and not in this workspace.**
- `ResultTemplatesService.use()` — increments `usageCount` (`result-templates.service.ts:103`). Not called.
- `AIScreeningService.triggerScreening`/`review` — write. Aggregate uses read-only `getByRecord`.
- `AiReportingService.generateNarrative`/`suggestCodes`/`checkConsistency`/`acceptNarrative` — persist
  `AiDraft`/mutate. **Owner-invoked only;** aggregate uses read-only `draftsByRecord`.

### 5c. Optional future convenience reads (NOT required for Phase 3A; separately reviewed if built)
Additive, read-only, no schema: record-scoped `escalation.byRecord` / `qc.byRecord` / `tat.byRecord` /
`recall.byRecord` / `teleconsult.byRecord`, and a metadata-only `reports.metaByRecord`. These are payload/
latency optimizations only; the §5a filtered global reads satisfy feasibility. **No owner-read addition is
required to complete Phase 3A.** Any such addition is its own reviewed, additive commit — never bundled into
a band checkpoint.

---

## 6. Permission model (frozen)

Reuse existing permissions only. **No aliases, no synthetic permissions, no role-name authorization; owner
endpoints remain the enforcement authority.** The aggregate's map is **descriptive**.

- **Base entry gate:** `record:view` (mirrors Sign-Out's `/signout/case/:recordId`). The controller carries
  `@RequirePermissions('record:view')`.
- **Per-section descriptive gates (verified seeded):**
  `record:view`/`:change` → case, specimens, slides, attachments, coding, correlation, screening,
  teleconsult, QC, escalation, TAT, recall, timeline; `patient:view` → patient; `resultentry:view`/`:change`
  → Bethesda, priors; `resultsheet:view`/`:create`/`:authorize` → result sheets, authorize/amend;
  `aidraft:view`/`:create` → AI reporting drafts (**held by Authorizers/Pathologist only**); `report:view`/
  `:create` → report/release.
- **Superuser-only / unseeded caveats surfaced honestly:** `applicationprefs:*` (AI settings — superuser-only,
  **not surfaced in this case workspace**), `kb:manage` (KB authoring — superuser-only; KB *read* is open but
  owner-invoked), **`changerequest:*` unseeded → superuser-only** (its panel renders `forbidden`, never
  `empty`, for ordinary staff).
- **`EffectivePermissions` is extended, not forked** (§3c). Enforcement stays at each owner endpoint; the map
  only drives which panels render `ready` vs `forbidden`.

---

## 7. Section-state & failure-isolation contract (frozen)

Five states, reused verbatim: **`ready`** (data present), **`empty`** (owner read ok, no rows — never a
clinical claim), **`forbidden`** (caller lacks the owner permission — never rendered as `empty`), **`error`**
(owner read threw — isolated, with `reason`), **`deferred`** (capability not built — honest placeholder).

- **Case Identity is the root:** its failure is a single top-level `error`; it is **never** a blank with
  fabricated identity. Every other band fails independently.
- **Multi-source bands** (Diagnostic Material, Decision Support, Prior Evidence, Collaboration; and Quality
  within Collaboration) carry **`unavailable: UnavailableSource[]`**, **render partially**, show **no false
  `empty`**, substitute **no inferred data**, and **never collapse** the workspace.
- Loaders compose via `Promise.all`; each returns a `Section<T>` and never rejects.

---

## 8. Verification gates (mandatory for every checkpoint)

Every A-checkpoint must pass, before its commit is proposed:
1. **API TypeScript** — `cd apps/api && npx tsc --noEmit` clean.
2. **Web TypeScript** — `cd apps/web && npx tsc --noEmit` clean (ignore stale `.next-prod` TS6053).
3. **API build** — `nest build` clean when the change is substantial.
4. **Web build** — `next build` (`.next-prod`) clean when the change is substantial.
5. **Owner traceability** — every datum traces to a §5a owner read; **no direct Prisma in the aggregate.**
6. **No duplicated owner logic** — no copied lifecycle/validation/authorization/AI/image logic.
7. **No mutation primitives** — the aggregate and page use only `api.get` + `router.push`; grep confirms no
   POST/PUT/PATCH/DELETE in the workspace path; **blacklist (§5b) not called.**
8. **Permission verification** — base gate present; descriptive map matches owner gates; `changerequest`
   forbidden-honest.
9. **Failure isolation** — interception test: force each owner read to throw → that section `error`, others
   `ready`; case identity preserved.
10. **Truthfulness audit** — per §9 boundaries for the bands the checkpoint touches (esp. AI screening
    labeling at A8).
11. **Secret/PHI/binary scan** — no `slideUrl`/bytes, no `storageUrl`/bytes, no AI `output`/`finalText`, no
    result content, no tokens, no PDF in the payload.
12. **Responsive** — 390/768/1024/1440/1920; body never scrolls horizontally; wide content scrolls in its
    own container.
13. **Zero-orange** — pixel detector reports 0 on any UI added.
14. **Accessibility** — semantic headings/landmarks; state announcements; keyboard shortcuts with input/
    dialog guards; focus-once on the case heading.
15. **Rollback verification** — the checkpoint reverts cleanly to the prior commit with no orphaned wiring
    (§ per-checkpoint rollback boundary).

Browser-driven verification uses the standard logins; production build on :3100 for experience/motion checks
where UI is added.

---

## 9. Truthfulness boundaries (what the workspace refuses to claim)

- **AI Reporting:** real, LLM-backed, redacted, provenance-tracked, persisted, human-reviewed, gracefully
  degrading, non-blocking to authorization. Surface **metadata only** (`kind`/`status`/`model`/
  `promptVersion`/`redactionPolicy`/timestamps) — never `output`/`finalText`. Generation/accept/reject are
  owner-invoked.
- **AI Screening:** **simulated, random-number based, not image inference, not clinically authoritative, no
  model/version provenance, no slide linkage.** May appear **only** with a persistent "Simulated /
  experimental — not diagnostic" label, in a visually distinct non-diagnostic treatment, and **never inside
  the primary diagnostic decision flow** (never adjacent to Bethesda/interpretation); `confidence`/
  `primaryFinding`/`flaggedAreas` never shown as real; no "AI agreement/accuracy" figure presented as real.
  Fallback if disclosure is judged insufficient at A8 review: **omit it** from this workspace.
- **Diagnosis:** **no first-class `Diagnosis` model exists;** the workspace never synthesizes, merges, or
  infers a diagnosis. It shows Bethesda (cervical-only structured), result-sheet *state*, coding, and the
  released report *link* as **separate owner evidence**, each labeled. `Record.clinicalDiagnosis` is the
  **referring clinician's intake impression**, labeled as such.
- **Image delivery:** the viewer owns delivery; the aggregate carries slide **metadata only** (no `slideUrl`,
  no bytes); scan metadata is caller-asserted and labeled.
- **Slide relationships:** **no slide↔specimen relation exists;** slides are Record-anchored; the workspace
  never implies a slide belongs to a specimen or that an AI finding maps to a slide region.
- **Activity history:** no canonical ledger; `RecordStatusEvent` has no event-type discriminator and mixes
  transitions with pinned notes; the timeline is **source-labeled and non-canonical**; `updatedAt` is never
  an event; unresolved actors/timestamps render "—".
- **Authorization:** stays entirely on the owner (`result-sheets.authorize`); the workspace shows state and
  invokes; it never authorizes/de-authorizes.
- **Lifecycle:** owner-constrained (`ALLOWED_TRANSITIONS`); the workspace shows status/history and routes
  changes to the owner; **`Released`/`Archived` are not modeled and are never claimed.**
- **Knowledge Base:** generic lab-authored Markdown CMS — **not** validated clinical reference; owner-invoked
  only (read increments viewCount); never auto-bound to a diagnosis.
- **Teleconsult:** external, token-based consultation; **not** internal collaboration, **not** an
  authenticated platform-clinician identity; `sharedImages` does **not** deliver slides; agreement/diagnosis
  shown as consultant-asserted; token never surfaced.
- **Notifications:** per-user delivery artifacts, not a case audit; not surfaced as case events (their
  `entityId` is a loose string, not an FK).
- **Forms:** intake-only config; `getOrCreate` persists defaults → **excluded** from the workspace entirely.

---

## 10. Implementation checkpoints (A1–A14)

Each checkpoint is **independently reviewable and rollback-safe**, ends with a review stop, and ships only
after its §8 gates pass. Commit messages follow the Phase 2 form and end with the required trailer.

### A1 — Workspace shell
- **Purpose:** Route + empty page + entry gate; no data, no aggregate logic.
- **Owner services:** none (permission check only).
- **Permissions:** entry gate `record:view`.
- **New files:** `apps/web/src/app/(app)/diagnostic-case/[recordId]/page.tsx` (shell), `.../types.ts` (client
  contract stub).
- **Modified files:** none required (nav entry deferred to A13).
- **Verification gates:** web tsc/build; route renders under gate; no mutation; responsive/zero-orange/a11y
  on the shell.
- **Rollback boundary:** delete the route dir; nothing else references it.
- **Known limitations:** placeholder only.
- **Independence:** fully standalone.
- **Commit message:** `Osieri v3 — A1 Diagnostic Case workspace shell`
- **Review stop:** yes.

### A2 — Aggregate contract
- **Purpose:** NestJS `diagnostic-case` module + controller + service returning `DiagnosticCaseOverview` with
  **all bands `deferred`**, the descriptive `EffectivePermissions` map, and the base gate. No owner reads yet.
- **Owner services:** none composed yet (permission map via the reused `buildPermissions` pattern).
- **Permissions:** controller `@RequirePermissions('record:view')`; map built descriptively.
- **New files:** `apps/api/src/modules/diagnostic-case/diagnostic-case.module.ts`, `.controller.ts`,
  `.service.ts`; web `types.ts` finalized; a `useQuery(['diagnostic-case-overview', recordId])` wired to the
  empty aggregate.
- **Modified files:** `apps/api/src/app.module.ts` (register module).
- **Verification gates:** api+web tsc/build; endpoint returns the frozen envelope; every section `deferred`;
  no Prisma in the service; failure-isolation harness scaffolded.
- **Rollback boundary:** remove the module + app.module registration; web query no-ops.
- **Known limitations:** no data.
- **Independence:** standalone after A1.
- **Commit message:** `Osieri v3 — A2 Diagnostic Case aggregate contract`
- **Review stop:** yes.

### A3 — Case Identity (Band 1)
- **Purpose:** Hydrate case identity + patient + clinical context.
- **Owner services:** `RecordsService.findOne`.
- **Permissions:** `record:view` (+ `patient:view` sub-read honesty).
- **New files:** section loader + `CaseIdentity` type + web panel.
- **Modified files:** `diagnostic-case.service.ts` (add loader), web page (render band 1).
- **Verification gates:** identity renders; band-1 failure = top-level `error` (root behaviour); creator shown
  as "first recorded action by" or omitted (no inferred-creator claim); tsc/build/responsive/zero-orange/a11y.
- **Rollback boundary:** revert the loader + panel; other bands unaffected.
- **Known limitations:** no `createdBy`; age derived.
- **Independence:** standalone after A2.
- **Commit message:** `Osieri v3 — A3 Diagnostic Case identity + clinical context`
- **Review stop:** yes.

### A4 — Diagnostic Material: specimens (Band 2, part 1)
- **Purpose:** Specimen list from the record.
- **Owner services:** `RecordsService.findOne` (`specimens` + `images` stub).
- **Permissions:** `record:view`.
- **New files:** specimen sub-section type + panel.
- **Modified files:** service + page.
- **Verification gates:** specimens render; no sub-specimen structure claimed; no image bytes; standard gates.
- **Rollback boundary:** revert sub-section.
- **Known limitations:** `SpecimenImage` is a stub; no Block/Slide sub-structure.
- **Independence:** standalone after A3.
- **Commit message:** `Osieri v3 — A4 Diagnostic Case specimens`
- **Review stop:** yes.

### A5 — Diagnostic Material: WSI metadata (Band 2, part 2)
- **Purpose:** Slide **metadata** + owner-viewer invocation.
- **Owner services:** `WsiService.listByRecordMeta`.
- **Permissions:** `record:view`.
- **New files:** slide sub-section type + panel with deep-link to `/wsi/[slideId]`.
- **Modified files:** service + page.
- **Verification gates:** **no `slideUrl`/bytes in payload** (secret scan); scan metadata labeled
  caller-asserted; deep-link only; failure isolates within Band 2 (`unavailable[]`); standard gates.
- **Rollback boundary:** revert slide sub-section; specimens/attachments unaffected.
- **Known limitations:** point annotations only; no slide↔specimen.
- **Independence:** standalone after A4.
- **Commit message:** `Osieri v3 — A5 Diagnostic Case WSI slide metadata`
- **Review stop:** yes.

### A6 — Diagnostic Material: attachments (Band 2, part 3)
- **Purpose:** Attachment metadata + owner-invoke to `/files`.
- **Owner services:** `FilesService.getRecordAttachments`.
- **Permissions:** `record:view`.
- **New files:** attachment sub-section type + panel.
- **Modified files:** service + page; finalize Band 2 `unavailable[]` composition.
- **Verification gates:** **no `storageUrl`/bytes** (secret scan); Band 2 renders partially when one source
  fails; standard gates.
- **Rollback boundary:** revert attachment sub-section.
- **Known limitations:** no typing/version/checksum/author; Record-level only.
- **Independence:** standalone after A5.
- **Commit message:** `Osieri v3 — A6 Diagnostic Case attachments`
- **Review stop:** yes.

### A7 — Diagnostic Interpretation (Band 3)
- **Purpose:** Bethesda + result-sheet metadata/events + coding — **metadata only**, side-by-side, each
  labeled with its owner; **no merged "diagnosis."**
- **Owner services:** `BethesdaService.getByRecord`, `ResultSheetsService.metaByRecord`/`eventsByRecord`,
  `CodingService.getRecordCodings`.
- **Permissions:** `resultentry:view` (Bethesda), `resultsheet:view` (sheets), `record:view` (coding).
- **New files:** `Interpretation` type + panels (Bethesda, result-sheet state, coding).
- **Modified files:** service + page.
- **Verification gates:** **no entry/line/narrative bodies** (secret scan); Bethesda `shortCode` shown as
  derived; nulls render "—" (no inferred negatives); no synthesized diagnosis (truthfulness audit); per-source
  isolation; standard gates.
- **Rollback boundary:** revert Band 3 loaders + panels.
- **Known limitations:** Bethesda cervical-only; no first-class diagnosis; no primary-code flag.
- **Independence:** standalone after A6.
- **Commit message:** `Osieri v3 — A7 Diagnostic Case interpretation metadata`
- **Review stop:** yes.

### A8 — Decision Support (Band 4) — AI Reporting + **explicit simulated AI Screening disclosure**
- **Purpose:** AI reporting draft **metadata**; AI screening **as a labeled simulation**, visually separated
  and outside the primary decision flow; KB as owner-invoked reference (no aggregate read).
- **Owner services:** `AiReportingService.draftsByRecord` (metadata), `AIScreeningService.getByRecord`.
  **KB is owner-invoked only — no read in the aggregate (blacklist §5b).**
- **Permissions:** `aidraft:create`/`aidraft:view` (Authorizers/Pathologist) for drafts; `record:view` for
  screening.
- **New files:** `DecisionSupport` type + panels (AI drafts metadata; **AI-screening simulated panel** with
  mandatory disclosure treatment; KB link-out).
- **Modified files:** service + page.
- **Verification gates (checkpoint-critical truthfulness gate):** **no AI `output`/`finalText`** (secret
  scan); AI-screening panel carries persistent "Simulated / experimental — not diagnostic" labeling, is
  visually distinct, and is **not placed adjacent to interpretation** (truthfulness audit is a hard gate
  here); no "AI agreement/accuracy as real" figure; KB never read by the aggregate (blacklist grep); standard
  gates. **If disclosure is judged insufficient at review, omit AI screening from this workspace.**
- **Rollback boundary:** revert Band 4; interpretation unaffected.
- **Known limitations:** screening is a simulation; no image AI.
- **Independence:** standalone after A7.
- **Commit message:** `Osieri v3 — A8 Diagnostic Case decision support (AI reporting metadata + simulated-screening disclosure)`
- **Review stop:** yes (mandatory — AI-screening disclosure sign-off).

### A9 — Prior Evidence (Band 5)
- **Purpose:** Priors + correlation + historical reports; historical clearly distinct from current.
- **Owner services:** `RecordsService.priorsByPatient`, `CorrelationService.byCytologyRecord`/`byPatient`,
  `ReportsService.findAll` (record/patient-filtered).
- **Permissions:** `resultentry:view` (priors), `record:view` (correlation), `report:view` (reports).
- **New files:** `PriorEvidence` type + panels.
- **Modified files:** service + page.
- **Verification gates:** priors bounded (`take:50` reused); each prior labeled with its date + own case link;
  **no longitudinal conclusion, no concordance computed** (truthfulness audit); per-source isolation; standard
  gates.
- **Rollback boundary:** revert Band 5.
- **Known limitations:** correlation concordance is human-entered; `cytologyDiagnosis` is a snapshot.
- **Independence:** standalone after A8.
- **Commit message:** `Osieri v3 — A9 Diagnostic Case prior evidence + correlation`
- **Review stop:** yes.

### A10 — Collaboration (Band 6)
- **Purpose:** Teleconsult (external, provenance-honest) + escalations + quality signals (QC/TAT/recall);
  internal notes render `deferred`.
- **Owner services:** `TeleconsultService.list`/`detail`, `EscalationService.list`/`summary`,
  `QcService.list`, `TatService.listAlerts`, `RecallService.byPatient`. **`teleconsult.publicCase` blacklisted.**
- **Permissions:** `record:view` across; `changerequest:view` (superuser-only) if a client-request panel is
  included → renders `forbidden` for staff.
- **New files:** `Collaboration` type + panels; internal-notes `deferred` placeholder.
- **Modified files:** service + page.
- **Verification gates:** teleconsult labeled external/token-verified; token never in payload; `sharedImages`
  not presented as delivery; notify timestamps not shown as receipts; internal notes `deferred` (honest);
  `changerequest` forbidden-honest; per-source `unavailable[]`; standard gates.
- **Rollback boundary:** revert Band 6.
- **Known limitations:** no internal case-note model; no structured adjudication.
- **Independence:** standalone after A9.
- **Commit message:** `Osieri v3 — A10 Diagnostic Case collaboration`
- **Review stop:** yes.

### A11 — Reporting & Sign-Out integration (Band 7) — **reuse only, no Sign-Out modification**
- **Purpose:** Result-sheet authorization **state** + amend flag + released report + PDF link — all
  owner-invoked; and a link to the existing **Sign-Out** surface for the sign-out moment.
- **Owner services:** `ResultSheetsService.metaByRecord`/`eventsByRecord`, `ReportsService.findAll`/
  `renderForRecord` (invoke), and a `router.push` to `/sign-out/[recordId]`. **Sign-Out code unchanged.**
- **Permissions:** `resultsheet:view` (+ `amend = resultentry:change && resultsheet:authorize` descriptive),
  `report:view`/`:create`.
- **New files:** `Reporting` type + panel with owner-invoke actions.
- **Modified files:** service + page. **No modification to `signout.*`** (verification asserts this).
- **Verification gates:** **`git diff` shows zero changes under `apps/api/src/modules/signout/**` and
  `apps/web/src/app/(app)/sign-out/**`**; no authorize/release primitive in the workspace (grep); PDF is
  owner-invoked (no bytes in payload); `Released`/`Archived` not claimed; standard gates.
- **Rollback boundary:** revert Band 7; Sign-Out provably untouched throughout.
- **Known limitations:** no amendment/versioning; content vs live PDF divergence surfaced honestly.
- **Independence:** standalone after A10.
- **Commit message:** `Osieri v3 — A11 Diagnostic Case reporting + sign-out invocation (reuse only)`
- **Review stop:** yes (assert Sign-Out unchanged).

### A12 — Timeline & Provenance (Band 8)
- **Purpose:** Source-labeled, non-canonical timeline from recorded events.
- **Owner services:** `RecordsService.findOne(...).statusHistory` + `ResultSheetsService.eventsByRecord`
  (+ optional provenance from already-loaded AI/consult sections).
- **Permissions:** `record:view`.
- **New files:** `Timeline` type + panel (source-labeled, newest-first, bounded).
- **Modified files:** service + page.
- **Verification gates:** each event source-labeled; **`updatedAt` never used as an event**; no event-type
  synthesized where not recorded; nullable actors render "—"; per-source `unavailable[]`; bounded; standard
  gates.
- **Rollback boundary:** revert Band 8.
- **Known limitations:** no canonical ledger; QC notes pinned at current status.
- **Independence:** standalone after A11.
- **Commit message:** `Osieri v3 — A12 Diagnostic Case timeline + provenance`
- **Review stop:** yes.

### A13 — Workflow continuity (Band 9 + entry)
- **Purpose:** Return-aware entry + validated `returnTo` + guarded shortcuts + nav placement + the
  descriptive Permissions & Actions surfacing.
- **Owner services:** none (permission map already built).
- **Permissions:** entry `record:view`; the descriptive map drives panel states.
- **New files:** shortcut-help component (reuse pattern).
- **Modified files:** `apps/web/src/lib/nav.ts` (add entry to the `results`/`lab` group, feature-gated as
  appropriate), `apps/web/src/components/dashboard/nav-pills.tsx` (add the route to `RETURN_AWARE`),
  `diagnostic-case/[recordId]/page.tsx` (`safeReturnTo`, focus-once, shortcuts, Worklist button).
- **Verification gates:** `safeReturnTo` rejects external/`//`/backslash/control/auth routes; shortcuts
  guard inputs/dialogs; `returnTo` restores the source worklist; classic-scrollbar single-scroll-container
  check; standard gates.
- **Rollback boundary:** revert nav + continuity wiring; the workspace still reachable by URL.
- **Known limitations:** none beyond scope.
- **Independence:** standalone after A12.
- **Commit message:** `Osieri v3 — A13 Diagnostic Case workflow continuity`
- **Review stop:** yes.

### A14 — Final verification & closeout
- **Purpose:** Whole-workspace verification + documentation closeout (docs only).
- **Owner services:** none (verification).
- **Permissions:** full matrix re-verified.
- **New files:** none.
- **Modified files:** the three D-docs' completion records (documentation-only closeout commit).
- **Verification gates:** full §8 suite across all bands; end-to-end failure-isolation sweep (force each owner
  to throw → only its section `error`, identity intact); secret/PHI/binary sweep; **Sign-Out untouched**
  assertion for the whole phase; zero-orange full-page; responsive matrix; performance observation via the
  Phase 2 harness (no invented budget).
- **Rollback boundary:** documentation-only.
- **Known limitations:** the deferred list (§11) remains deferred.
- **Independence:** closeout.
- **Commit message:** `Osieri v3 — Close out Phase 3A Diagnostic Case Workspace`
- **Review stop:** yes.

---

## 11. Deferred capabilities (frozen — not softened)

Each has **no owner model today**; none is built or simulated in Phase 3A.
- **First-class `Diagnosis`** — diagnosis is split across 5 representations; a unified model is a schema
  decision (would enable a real "the diagnosis" field the workspace today must never synthesize).
- **Generic synoptic reporting** — `BethesdaResult` is cervical-only, one-per-record; non-gyn synoptic needs
  new models.
- **Slide↔specimen relation** — `DigitalSlide` has no `specimenId`; specimen-centric review needs schema.
- **AI↔slide relation / image AI** — `ai-screening` reads no pixels; there is no AI↔slide link; real image AI
  needs image infrastructure + provenance.
- **ROI geometry / measurements / quantification** — annotations are points; no measurement model.
- **Internal case-note thread** — no `Note`/`Comment`/`CaseNote`; `messaging` has no `recordId`.
- **Internal consult model / structured consult adjudication** — teleconsult is external free text.
- **Report amendment / versioning** — `Report` is a single snapshot; no addendum/version chain.
- **Persisted PDF / delivery tracking** — PDF is rendered stateless; no delivery model.
- **Canonical activity ledger** — only entity-specific event tables; `RecordStatusEvent` has no type
  discriminator.
- **Case claim / lock** — each owner writes independently; no cross-owner transaction.
- **Per-case quality flag** — only `Record.urgent`; quality is derived from open QC/escalation/TAT rows.
- **Concordance ledger** — beyond the current human-entered `CorrelationCase`.
- **`Released` / `Archived` statuses** — not modeled; never claimed.

---

## 12. Performance plan

- **Expected owner reads:** ~16–18 per case load (12 shared with Sign-Out + coding + reports + teleconsult +
  qc + escalation + tat + recall), executed **in parallel** and **failure-isolated**.
- **Metadata-only policy:** no image bytes/`slideUrl`, no attachment bytes/`storageUrl`, no AI `output`/
  `finalText`, no result content, no PDF, no tokens.
- **Bounded lists:** priors `take:50` (reused); slides/attachments/coding/qc/escalation/tat/recall/teleconsult
  reads bounded per record (cap + count).
- **Failure isolation:** `Promise.all` of section loaders; each returns a `Section<T>`.
- **Future optimization (out of scope):** Option 2 shared composition service + record-scoped convenience
  reads (§5c) once a second consumer exists; client-side query-key dedupe across Sign-Out and this workspace.
- **No invented budgets** — the Phase 2 `measure:experience`/`check:motion-grammar` harnesses (production
  build on :3100) govern at build time.

---

## 13. Risk register

| # | Risk | Mitigation |
|---|---|---|
| 1 | Reopening the frozen architecture | §2 freeze; changes require a verified blocker surfaced for review. |
| 2 | Modifying Sign-Out | A11 asserts zero diff under `signout/**` and `sign-out/**`; whole-phase assertion at A14. |
| 3 | Second-record-page drift | Compose/invoke only; `api.get` + `router.push`; no editor. |
| 4 | Side-effecting reads in the aggregate | §5b blacklist enforced by grep gate (§8.7). |
| 5 | Simulated AI misrepresentation | A8 hard truthfulness gate: disclosure + separation + not-in-decision-flow; fallback omit. |
| 6 | Image/attachment bytes leaking | Metadata-only seams; secret-scan gate (§8.11). |
| 7 | PHI leakage | Owner redaction retained; no AI output/finalText/tokens/content in payload. |
| 8 | Synthesized diagnosis | Owner evidence shown separately/labeled; truthfulness audit (§8.10). |
| 9 | Historical-as-current | Per-prior date + case link; distinct treatment (A9). |
| 10 | Permission widening | Descriptive map mirroring owner gates; `changerequest` forbidden-honest; no aliasing (§6). |
| 11 | Partial-source failure collapsing identity | Identity is root; `unavailable[]`; isolation harness (§7, §8.9). |
| 12 | Payload/timeline growth | Bounded lists; source-labeled newest-first; no `updatedAt`-as-event (§12). |
| 13 | Responsive/cognitive overload | Collapsible bands in frozen order; single-column reflow; internal `overflow-x` (§8.12). |
| 14 | Schema creep | Compose-only; deferred list frozen (§11); no model/migration. |
| 15 | Helix scope creep | Helix tokens/components only; v1.0 frozen. |

---

## 14. Closeout

- **Phase completion criteria:** A1–A14 shipped as isolated reviewed commits; all nine bands compose from
  §5a owner reads with the frozen five-state contract and partial-failure isolation; base + descriptive
  permissions verified; the §5b blacklist never called; AI-screening disclosure signed off (A8); **Sign-Out
  provably unchanged** (A11/A14); every §11 capability deferred; zero schema/Helix/permission/seed change.
- **Remaining deferred platform work:** the §11 list — each a future schema/owner decision, not Phase 3A.
- **Recommended implementation order:** A1 → A14 as specified; do not reorder bands (§4). A8 and A11 are
  mandatory-sign-off checkpoints.
- **Architectural decision record:** (ADR-3A-1) separate aggregate `GET /diagnostic-case/:recordId/overview`;
  (ADR-3A-2) reuse Sign-Out owner methods + `Section<T>`/`SectionStatus`/`EffectivePermissions`, Sign-Out
  unchanged; (ADR-3A-3) Option 2 shared-loader consolidation deferred to a future second consumer;
  (ADR-3A-4) AI Screening surfaced only as labeled simulation outside the decision flow, else omitted;
  (ADR-3A-5) no owner-read addition required for feasibility (§5c optional, separately reviewed).
- **Required review gates before implementation begins:** approval of this plan; then each A-checkpoint is
  independently reviewed against its §8 gates and its own review stop.

---

## 15. Verification summary (of this plan)

- Every owner service and **reused method** named in §5a is verified to exist (D2 §6, with file:line);
  **no owner method is invented**; optional future reads (§5c) are clearly separated from required reads.
- The frozen architecture (§2) matches D2's approved decision (separate aggregate, Sign-Out unchanged, reuse
  contracts, Option 2 deferred).
- The aggregate contract (§3), section order (§4), permission model (§6), five-state/failure contract (§7),
  and truthfulness boundaries (§9) are internally consistent with D1/D2.
- The side-effecting-read blacklist (§5b) matches D2 §7 with file:line.
- No schema, code, Helix, permission, seed, or roadmap change is proposed. Internal links resolve. No conflict
  with the completed Phase 2 workspaces (Sign-Out is reused, not modified).

---

## 16. Status

Binding implementation contract — no code, no schema, no Helix, no permission/seed, no roadmap change, no
commit until reviewed. **This document does not begin implementation.** On approval, the build proceeds at
**A1 (workspace shell)**, then checkpoint-by-checkpoint through **A14**, each independently reviewed against
its §8 verification gates, with A8 (AI-screening disclosure) and A11 (Sign-Out untouched) as mandatory
sign-off stops. **It stops here for architectural review.**
