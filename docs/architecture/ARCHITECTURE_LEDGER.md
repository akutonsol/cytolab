# PathOS Architecture Ledger

**Purpose:** Record the canonical architectural decisions, owners, frozen invariants, deliberate exclusions, and extension rules for the architecture that currently exists in PathOS — so future work extends a documented system rather than re-deriving it. This is a decision ledger, not feature/API/user documentation.
**Scope:** The Diagnostic Case aggregate and the platform architecture principles it embodies, plus the Premium UI foundation and the boundaries certified through Phase 3A. Backend `apps/api`, web `apps/web`. Committed architecture only.
**Status:** Living architectural record — active. Phase 3A entries are CERTIFIED AND FROZEN.
**Owner:** PathOS Engineering (unassigned).
**Last Updated:** 2026-07-13.
**Certified baseline commit:** `c352deecdf27fcc9168067cb26dd88686eb833fe` (A12 `ea9f383` + Final Polish `c352dee`). Governance docs baseline: `cd8cf6a0306f8ca147d751c6ccfd666007ac725c`.
**Relationship to governance documents:** This ledger is the authoritative record of *what was decided and why*; the eight governance documents (RISK_REGISTER, PERMISSION_MATRIX, LOGGING_STANDARD, TEST_STRATEGY, THEME_MIGRATION, SECURITY_ARCHITECTURE, ACCESSIBILITY_DEBT_REGISTER, PRODUCTION_READINESS_CHECKLIST) remain the operational detail for their domains. The ledger references them; it does not duplicate or supersede them.
**Relationship to future ADRs:** This ledger predates a formal ADR series. Future one-decision-per-file ADRs may be introduced later; when they are, each should link back to the relevant ledger section. No ADR files are created in this checkpoint.

> Evidence rule: every claim below traces to committed code at `c352dee`, the completed Phase-3A audits, or the committed governance docs. Nothing here invents decisions, owners, permissions, schemas, workflows, or capabilities. Working-tree dirty changes are **not** part of the frozen architecture and are recorded only as git-status evidence.

---

## Section 1 — Platform architecture principles (frozen)

These are the rules the platform is built on. Each states what it prevents.

- **Owner-first architecture.** Every domain (records, result sheets, WSI, files, Bethesda, coding, AI reporting, correlation, escalation) is owned by exactly one module. *Prevents* diffuse ownership where two modules can mutate the same data with divergent rules.
- **Bounded owner modules.** A module exposes reads and mutations for its domain and nothing else. *Prevents* cross-domain god-services.
- **Composition over duplication.** New surfaces are built by *calling* owner reads, never by re-implementing owner logic. *Prevents* logic drift between the original and the copy.
- **No direct Prisma in aggregate/orchestration services.** The Diagnostic Case service holds no Prisma client. *Prevents* the aggregate silently becoming a second persistence owner with its own query rules and tenancy assumptions.
- **Owner endpoints remain authoritative.** The aggregate never becomes the enforcement point for anything an owner already governs. *Prevents* a read surface from becoming a shadow authority.
- **Reads may be composed; mutations remain owner-owned.** Aggregation composes read results only. *Prevents* a read aggregate from acquiring write side effects.
- **Lifecycle logic remains owner-owned.** Status transitions, authorization/amendment, releases — owned by the domain that persists them. *Prevents* duplicated, drifting lifecycle rules.
- **Authorization remains owner-owned.** The aggregate's permission map is descriptive; owner endpoints enforce. *Prevents* an aggregate from granting access an owner would deny.
- **Role-name authorization is prohibited.** Authorization keys off permission codes and the `isSuperRole` flag, never a role's display name. *Prevents* brittle, spoofable name-based checks.
- **Schema, permission, seed, and Helix changes require separate review.** None may ride inside a feature checkpoint. *Prevents* high-blast-radius changes from hiding in unrelated diffs.
- **Independent checkpoint and rollback discipline.** Each checkpoint is one branch/commit/review with its own rollback boundary. *Prevents* entangled changes that cannot be reverted in isolation.
- **Truthfulness over convenience.** The UI never shows a state it cannot substantiate (no false empties, no "released" when only "recorded"). *Prevents* clinically misleading surfaces.
- **Allowlist mapping instead of owner DTO spreading.** Every field surfaced is explicitly named; owner DTOs are never spread. *Prevents* silent leakage of PHI, storage URLs, tokens, or internal fields when an owner model gains a field.

---

## Section 2 — Record as composition root

- **Record is the Diagnostic Case composition root.** The aggregate is addressed by a `recordId`; all bands are anchored to that Record (directly or via its `patientId`).
- **Record identity and patient relationship.** `RecordsService.findOne` supplies recorded identity (identifier, labNumber, formType, status, urgent, dates) and the patient relationship (`patientId`, and patient name/registrationNo/gender/dateOfBirth); patient-anchored bands derive from `patientId`.
- **Record-scoped owner relationships.** Slides, attachments, Bethesda, coding, AI drafts, escalations, and result sheets are read by record id from their owners; prior records and correlation are read by patient id.
- **Root `record:view` gate.** The aggregate is reachable only with `record:view` (base gate); the root record read is not attempted without it.
- **Root failure behavior.** If the root record read throws, the case-derived sections surface `error` (with the owner's reason preserved, e.g. NotFoundException → "Record not found"); the descriptive permission map still renders.
- **Root forbidden behavior.** Without `record:view`, case-derived sections surface `forbidden`; downstream owners are not invoked.
- **Why the aggregate does not own persistence.** Record and its child domains persist and enforce their own rules; the aggregate composes their reads so there is exactly one source of truth per domain.
- **Why Record remains separate from Sign-Out.** Record is the case root; Sign-Out is the authoritative reporting/authorization workspace. Keeping them separate preserves single ownership of the sign-out lifecycle.

*Record does not own the child domains' lifecycle logic — it is the anchor, not the authority, for slides, results, coding, escalations, or reporting.*

---

## Section 3 — Diagnostic Case aggregate

- **A separate, read-only aggregate.** Endpoint: `GET /diagnostic-case/:recordId/overview`. It returns the frozen nine-band envelope plus a descriptive permission map.
- **Option 3 architecture.** It reuses owner reads *independently*; it does **not** extend or fork Sign-Out, and it imports no owner module's internals.
- **Exact responsibility.** Orchestrate mutation-free owner reads, map each to an allowlisted metadata contract, apply the frozen Section status contract per band, and return a bounded, truthful, read-only composition. Nothing else.
- It is **not** a persistence owner, **not** a workflow engine, **not** a diagnosis model, **not** a report editor, **not** a WSI delivery service, **not** an audit-log viewer.

---

## Section 4 — Frozen Section contract

**`SectionStatus`:** `ready | empty | forbidden | error | deferred`.
**`Section<T>`:** `{ status; data: T | null; reason?: string }`.
**Multi-source sections** additionally carry **`unavailable[]`** (`{ key, label, reason? }`) naming sub-sources that failed or were restricted.

**Canonical precedence (frozen; identical across multi-source bands):**
1. recorded evidence exists → **ready**
2. else a technical failure exists → **error**
3. else an access restriction exists → **forbidden**
4. else all accessible sources empty → **empty**

**Invariants:**
- **forbidden is never converted to empty**; **error is never converted to empty**; **forbidden is never collapsed into error.**
- **deferred is not forbidden** — deferred means "not yet composed," a truthful loading/placeholder state, never an access decision.
- **Sibling failure isolation** — one sub-source failing degrades only that sub-source; available siblings still render.
- **Root-mirror behavior** — root error/forbidden mirrors to the band with `data: null`, and downstream owners are not invoked.
- **Retry is technical-error-only** — a `forbidden`/restricted source never offers Retry.
- **Source failures are named truthfully** — via `unavailable[]` and cause-specific wording (see §13, Final Polish P3).

---

## Section 5 — Nine-band Diagnostic Case model (frozen order)

| # | Band | Owner service(s) → read method | Permission gate | Surfaced (metadata only) | Excluded | Owner navigation |
|---|---|---|---|---|---|---|
| 1 | **Case Identity** | `RecordsService.findOne` | `record:view` | identifier, labNumber, formType, status (verbatim), urgent (recorded flag), specimenDate, registeredAt, statusChangedAt, patient (name/registrationNo/gender/dateOfBirth), referringDoctor, clinicalIndication, medicalEntry, client, assignedTo | diagnosis, synthesized urgency/severity, patient.id (removed — §13 P2) | `/records/:recordId` |
| 2 | **Diagnostic Material** | `RecordsService.findOne` (specimens) · `WsiService.listByRecordMeta` · `FilesService.getRecordAttachments` | `record:view` | specimen label/type/container/bloodGroup/receivedAt; slide format/magnification/stain/scanner/fileSizeBytes/uploadedAt; attachment name/fileType/createdAt | slide/image bytes, storageUrl, GCS paths, thumbnails, annotations | `/records/:recordId`; slide → `/wsi/:id` |
| 3 | **Diagnostic Interpretation** | `BethesdaService.getByRecord` · `CodingService.getRecordCodings` | Bethesda `resultentry:view`; Coding `record:view` | Bethesda structured enums + shortCode + reporter; coding codeType/system/code/display/category/assigner | Bethesda `generatedNarrative`; coding `notes`; any merged diagnosis | `/records/:recordId` |
| 4 | **Decision Support** | `AiReportingService.draftsByRecord` | `aidraft:view` | draft kind/status/model/promptVersion/createdBy/acceptedBy/timestamps; `edited` (presence boolean) | `output`/`finalText`, raw `editedDiff`, prompts, reasoning | `/records/:recordId` |
| 5 | **Prior Evidence** | `RecordsService.priorsByPatient` · `CorrelationService.byPatient` | Prior records `resultentry:view`; Correlation `record:view` | prior identity/lifecycle + embedded historical Bethesda selections + result-sheet/report *presence*; correlation existence + owner-recorded classification | prior report content; correlation diagnosis text/notes/outcome/patient identity | prior → `/records/:id`; correlation → `/correlation/:id` |
| 6 | **Collaboration** | `EscalationService.list({ recordId }, userId)` | `record:view` | escalation severity/trigger/status (verbatim), timestamps, physicianNotifiedAt/Via (recorded facts), reviewer/assignee display names | review notes, resolved reason, raw user ids | `/escalations` (owner workspace; not claimed record-filtered) |
| 7 | **Reporting & Sign-Out** | `ResultSheetsService.metaByRecord` + `ResultSheetsService.eventsByRecord` | `resultsheet:view` | per-sheet authorized/authorizedAt/authorizedBy/viewed/createdAt, entryCount, `hasReport` (presence), amended/reauthorized/deauthorized (from recorded events) | report prose, result lines, narrative, any authorize/amend/release action | `/sign-out/:recordId` |
| 8 | **Timeline & Provenance** | `RecordStatusEvent` (from `findOne.statusHistory`) + `ResultSheetsService.eventsByRecord` | lifecycle `record:view` (base gate); result-sheet `resultsheet:view` | per event: id, source, eventType (factual label), occurredAt, actor (or null→"System"), ownerPath | resultSheetId, notes, content, narrative, diagnosis, ids, IP, URLs, tokens, payloads, synthetic createdAt event | record-status → `/records/:id`; result-sheet → `/sign-out/:id` |
| 9 | **Permissions & Actions** | (derived from the caller's JWT claims) | descriptive only | which capabilities the caller may view/do, mapped to verified seeded codes + `isSuperRole` | — (grants nothing) | — |

Lifecycle/workflow for every band remains owner-owned; the band renders recorded metadata and links out.

---

## Section 6 — Owner composition map

All reads below are **mutation-free** and each is invoked **exactly once per overview** (verified at `c352dee`).

| Owner service → method | Anchor | Consumer band | Permission | Intentionally excluded |
|---|---|---|---|---|
| `RecordsService.findOne` | recordId | Case Identity (1), Diagnostic Material specimens (2), Timeline lifecycle (8) | `record:view` | — (full record read; only allowlisted fields surfaced) |
| `RecordsService.priorsByPatient` | patientId | Prior Evidence (5) | `resultentry:view` | prior report content |
| `WsiService.listByRecordMeta` | recordId | Diagnostic Material slides (2) | `record:view` | slideUrl, bytes, thumbnails, annotations |
| `FilesService.getRecordAttachments` | recordId | Diagnostic Material attachments (2) | `record:view` | storageUrl, GCS paths, bytes, credentials |
| `BethesdaService.getByRecord` | recordId | Diagnostic Interpretation (3) | `resultentry:view` | generatedNarrative |
| `CodingService.getRecordCodings` | recordId | Diagnostic Interpretation (3) | `record:view` | coding notes |
| `AiReportingService.draftsByRecord` | recordId | Decision Support (4) | `aidraft:view` | output/finalText, raw editedDiff |
| `CorrelationService.byPatient` | patientId | Prior Evidence (5) | `record:view` | diagnosis text, notes, outcome, identity |
| `EscalationService.list({ recordId }, userId)` | recordId | Collaboration (6) | `record:view` | review notes, resolved reason, user ids |
| `ResultSheetsService.metaByRecord` | recordId | Reporting & Sign-Out (7) | `resultsheet:view` | report prose, result lines |
| `ResultSheetsService.eventsByRecord` | recordId | Reporting (7) **and** Timeline (8) — shared single read | `resultsheet:view` | resultSheetId in public timeline item, notes, payloads |

**The aggregate calls no owner mutation.** It composes reads only; every mutation (create/update/authorize/amend/release/assign) stays behind its owner endpoint so there is exactly one write path and one rule set per domain.

**Owner graph (read composition):**
```
                         GET /diagnostic-case/:recordId/overview
                                      │ (record:view base gate)
                 ┌────────────────────┼───────────────────────────────┐
        RecordsService.findOne (once) │                    ResultSheetsService
        ├─ Case Identity              │                    ├─ metaByRecord ─────► Reporting & Sign-Out
        ├─ Material: specimens        │                    └─ eventsByRecord (once, shared) ─┬─► Reporting
        └─ Timeline: statusHistory ───┼──────────────────────────────────────────────────────┴─► Timeline
   WsiService.listByRecordMeta ───────► Material: slides
   FilesService.getRecordAttachments ─► Material: attachments
   BethesdaService.getByRecord ───────► Interpretation: Bethesda      RecordsService.priorsByPatient ─► Prior: records
   CodingService.getRecordCodings ────► Interpretation: Coding        CorrelationService.byPatient ───► Prior: correlation
   AiReportingService.draftsByRecord ─► Decision Support              EscalationService.list ─────────► Collaboration
```

---

## Section 7 — Single-read reuse decisions

- **`RecordsService.findOne` is loaded once** and reused across the record-derived bands (Case Identity, Diagnostic Material specimens, Timeline lifecycle) — no second record read.
- **`ResultSheetsService.eventsByRecord` is loaded once** (only when the root loaded OK and `resultsheet:view` is present) and threaded into **both** Reporting & Sign-Out (amended/reauthorized/deauthorized flags) **and** Timeline & Provenance (result-sheet events). Verified: exactly one invocation site; zero calls on root failure/forbidden.
- **No cross-request cache**, **no shared-loader framework**, **no N+1 fanout**, **no Sign-Out import.**

This is **composition reuse**, not duplicated ownership: the aggregate consumes a single owner read result in two bands; it does not re-derive or re-own the result-sheet event stream, and the owner remains the sole producer and authority.

---

## Section 8 — Sign-Out boundary

- **Sign-Out remains unchanged and authoritative.** The aggregate **links** to Sign-Out (`/sign-out/:recordId`) and independently reuses the owner reads Sign-Out also uses (`metaByRecord`, `eventsByRecord`).
- **These lifecycle actions remain Sign-Out-owned:** authorization, deauthorization, reauthorization, amendment, report authoring, report release, result-sheet editing, AI-draft acceptance.
- **Why `SignoutService` is not imported by Diagnostic Case:** importing it would couple the read aggregate to the sign-out workspace's internals and risk duplicating or forking its lifecycle logic. Reusing the *owner* reads (ResultSheetsService) instead keeps a single lifecycle authority and lets the aggregate stay read-only.

---

## Section 9 — Clinical truthfulness rules (frozen)

- **No first-class Diagnosis model exists.** None is synthesized from Bethesda, coding, narrative, reports, or result lines.
- **Bethesda and Coding remain separate evidence sources** — never merged into a single diagnosis.
- **No inferred severity, urgency, priority, risk, quality, adequacy, or correctness.** Recorded enums/flags are shown verbatim.
- **No generated prose is represented as clinician-authored truth** (AI narrative is provenance metadata, not diagnosis).
- **Report existence is not report release** — `hasReport` means a report record exists, nothing about publication/delivery.
- **Notification recorded is not delivered or acknowledged** — `physicianNotifiedAt/Via` are recorded app actions, not delivery proof.
- **Patient correlation is not necessarily prior** — correlations are patient-level and labeled neutrally; a correlation tied to the current record is not filtered out or called "prior."
- **Object timestamps are not automatically events**; **current state is not automatically history.**
- **Actorless events remain `actor: null`** (UI may render "System"); no user is fabricated.
- **No synthetic "Case created" timeline event** from `Record.createdAt`.

**Recorded truthfulness corrections (committed):**
- `reportReleased` → **`hasReport`** (presence, not release).
- Prior "report released" wording → **"report recorded"** (commit `1cf6983`).

---

## Section 10 — AI architecture boundary

- **AI Reporting** (surfaced): persisted draft **metadata** only, with model + prompt-version provenance; redacted; human-reviewed; non-blocking. The aggregate exposes metadata only — `output`/`finalText`/raw `editedDiff` are **excluded** (`edited` is a presence boolean).
- **AI Screening** (excluded from the primary flow): simulated / random-number based, not genuine image inference, not clinically authoritative; deliberately kept out of the Diagnostic Case bands.
- **AI does not create diagnosis truth.** It is assistive provenance; interpretation remains owner-recorded and human-authored.

---

## Section 11 — Data safety and allowlist policy

- **Explicit mapping only; never spread owner DTOs.** Every field is named. The aggregate is **metadata-only** with **null-safe rendering** ("—" for missing).
- **Excluded by policy:** internal ids (unless a safe navigation identifier), storage URLs, signed URLs, GCS paths, bytes/base64, credentials/tokens, IP/location/session data, report/result prose, AI output, raw audit payloads, and private/internal notes where not approved.

**Examples (committed):**
- **Attachments:** owner returns full rows incl. `storageUrl`/labId; only `id/name/fileType/createdAt` surfaced.
- **Slides:** `id` (viewer-safe → `/wsi/:id`) + recorded metadata; never `slideUrl`/bytes/annotations.
- **AI drafts:** provenance + `edited` boolean; never `output`/`finalText`/raw diff.
- **Correlations:** existence + classification (`correlationResult`) only; never diagnosis text/notes/identity; `id` used for `/correlation/:id`.
- **Escalations:** recorded enums + display names; never raw user ids or review notes.
- **Result sheets:** authorization/report *presence* + event-derived flags; never report content or result lines.
- **Timeline events:** exactly six fields; `resultSheetId`, notes, content, narrative, ids, IP, URLs, payloads excluded.

---

## Section 12 — Permission architecture

- **Base gate:** `record:view` (aggregate entry + record-derived bands).
- **Sub-source gates (verified seeded codes):** `resultentry:view` (Bethesda, Prior records), `resultsheet:view` (Reporting, Timeline result-sheet events), `aidraft:view` (Decision Support), `record:view` where the sub-source matches the base gate (Coding, Correlation, Collaboration, Diagnostic Material slides/attachments).
- **No invented permissions** — there is no `timeline:view`, `collaboration:view`, or `attachment:view`; the timeline's lifecycle events ride the base `record:view` gate and its result-sheet events ride `resultsheet:view`.
- **No role-name authorization** — checks key off permission codes and `isSuperRole` only.
- **Forbidden sub-sources remain visible as restricted; siblings remain visible.** A restricted source is named in `unavailable[]` ("Access restricted"), never hidden and never converted to empty.
- **Owner endpoints still enforce authorization.** The aggregate's permission map (Band 9) is **descriptive**, not a replacement for owner enforcement.

Operational detail and the platform-wide authorization model: **PERMISSION_MATRIX.md**.

---

## Section 13 — Timeline & Provenance decision (A12) + Final Polish P1–P4

**Approved authoritative event sources:** `RecordStatusEvent` (from `statusHistory`) and `ResultSheetEvent` (from the shared `eventsByRecord`). No other stream is treated as an event source.

**Unified event contract (exactly six public fields):** `id`, `source` (`record-status` | `result-sheet`), `eventType`, `occurredAt`, `actor` (nullable), `ownerPath`.

**Ordering (deterministic):** `occurredAt` ascending → fixed **source-priority** tie-break (`record-status`=0, `result-sheet`=1; a deterministic tie-break only, not importance) → stable source-prefixed id.

**Cap:** `TIMELINE_CAP = 50`; **true total computed before slicing**; **`truncated`** flag truthful.

**Event labels:** deterministic factual — record status → `Status set to <status>`; result-sheet fixed map `Authorized/Deauthorized/Reauthorized → same`, `AiDrafted → AI draft recorded`, `AiAccepted → AI draft accepted`; unmapped → raw owner value.

**Explicit exclusions:** synthetic `Record.createdAt` event, assignment reconstruction, slide/attachment object timestamps, audit logs, notifications, current-state escalation/correlation timestamps, IP/session/token data, notes and clinical payload.

**Final Polish (committed `c352dee`):**
- **P1 — A4 canonical precedence:** Diagnostic Material adopts the canonical ready → error → forbidden → empty precedence (forbidden never converted to error; error never to empty). The forbidden branch is retained for canonical symmetry though material siblings run under the base gate.
- **P2 — patient.id removal:** removed from the API `CaseIdentitySection` type, the API mapper, and the web type (and thus the serialized payload and DOM); all other approved patient fields preserved.
- **P3 — unavailable-source wording:** technical failure → **"Couldn't load: …"**, access restriction → **"Access restricted: …"** in the Material and Timeline bands — never merged; restricted shows no Retry.
- **P4 — terminal EmptyState:** Decision Support, Collaboration, Reporting & Sign-Out, and Timeline & Provenance use `EmptyState` for terminal empties; Reporting retains "Open Sign-Out" via the `action` prop; no empty state shows Retry; loading behavior unchanged.

---

## Section 14 — Premium UI foundation (v1)

The certified/frozen **foundation** (the primitive boundary and its rules) — **not** application-wide adoption:

- **Presentation-only primitive boundary** — primitives consume semantic/motion tokens; they hold no business logic.
- **Modal/Drawer accessibility engine**, **PageHeader one-h1 contract**, **navigation semantics**, **DataToolbar / SearchField ownership**, **Table/Th semantic defaults**, **Skeleton adoption principle**, **EmptyState opt-in announcement model**, **Field explicit-id ownership**, **reduced-motion rules**, the **responsive verification matrix** (§15), the **zero-orange rule**, and **surgical staging discipline** for dirty trees.
- **P4c row-action decision remains deferred.**

**Foundation completion ≠ page migration.** The primitives exist and are proven on the Diagnostic Case surface, but application-wide adoption is incomplete — many screens still hand-roll modals/inputs/tables (tracked as design-system/accessibility debt in RISK_REGISTER R-009/R-010 and THEME_MIGRATION). This ledger does **not** claim complete app-wide adoption.

---

## Section 15 — Responsive boundary

**Verified widths:** 390 · 768 · 1024 · 1440 · 1920.

**Certified finding:** Diagnostic Case changes introduce **no horizontal page overflow** at any width (`scrollWidth == clientWidth` at all five). A **global app-shell content-clipping at ~390px** remains a **pre-existing, product-wide limitation** (verified identically on `/records` and `/dashboard`; the `(app)` content column has a ~700px minimum width). This is **outside Phase 3A**, is **not fixed**, and is tracked as a separate responsive-shell workstream in RISK_REGISTER (R-015).

---

## Section 16 — Performance decisions

- **No N+1 owner fanout.** Each owner read is a single call; siblings run in parallel where independent.
- **Defensive caps** (50 per list) with **true totals** preserved, and **deterministic ordering** everywhere.
- **Single shared record read** and **single shared result-sheet event read.**
- **No cross-request cache; no premature shared-loader refactor.** Bands stay independently understandable and rollback-safe.
- **Latency opportunity (not a defect):** bands compose largely sequentially in the request; a future, reviewed change could parallelize independent bands. Recorded as an opportunity, not a fault.

---

## Section 17 — Deliberate exclusions

Excluded in the current phase, each for a stated reason:

- **Direct scanner integrations** — out of scope this phase; WSI is surfaced as metadata + viewer link only.
- **Teleconsult from Collaboration** — no safe record-scoped owner read that meets the metadata/allowlist bar.
- **Internal notes and messaging** — free-text/PHI risk; not an approved aggregate surface.
- **Raw audit logs / security logs / notifications** — not owner reads for this aggregate; separate concerns.
- **Assignment history** — not an authoritative event stream; would require reconstruction (prohibited).
- **Change requests, requisition tracking, TAT alerts** — separate owner surfaces, not part of the case read model.
- **Report prose / result lines / generated narrative** — clinical content excluded by the truthfulness + allowlist rules.
- **AI Screening** — simulated, non-authoritative (§10).
- **Object-creation timestamps in Timeline** — current state is not history (§9, §13).
- **Schema changes / new permissions / shared Sign-Out loader** — each requires separate governance review.

---

## Section 18 — Checkpoint and commit discipline

The working method, frozen as practice:

- **Audit before implementation**; **stop uncommitted**; **explicit approval** before staging.
- **Exact file scope** per checkpoint; **staged-diff review** (`git diff --cached`) before commit.
- **Independent rollback boundary** per checkpoint; **unrelated dirty-tree preserved and never swept in.**
- **Surgical staging** (`git add -p` / cached patches) when a file mixes concerns.
- **Concurrent-edit stability gate** — sample file hashes over a sustained window; **never stage from a moving file.**
- **Runtime verification against the exact committed bytes** (clean build, boot, drive), not stale artifacts.
- **Checkpoint isolation** — security, logging, tests, color migration, accessibility, realtime never share a commit.

*Concrete example:* A12 and Final Polish were kept as two isolated commits — `ea9f383` (A12 Timeline & Provenance) and `c352dee` (Final Polish P1–P4) — each scoped to exactly the three Diagnostic Case files, with the module/controller/schema/permissions untouched, and certified against the committed bytes. (Recorded as method, without private session detail.)

---

## Section 19 — Extension rules

**Allowed:**
- Add a **new owner-backed read** (mutation-free) and surface it via the frozen Section contract.
- Add a **new band or sub-source** through the Section contract + `unavailable[]` semantics.
- Add **additive metadata fields** drawn from an owner allowlist.
- Add **feature-driven Premium UI adoption** on a screen already being worked.
- Add **new permissions only through a separate reviewed governance change.**

**Forbidden:**
- Direct Prisma in the aggregate.
- Duplicating owner workflow / lifecycle logic.
- Synthesizing clinical truth (diagnosis/severity/etc.).
- Inferring events from current state.
- Spreading owner DTOs.
- Broadening permissions inside a feature checkpoint.
- Importing Sign-Out lifecycle logic.
- Changing the frozen Section contract casually.
- Combining unrelated workstreams in one checkpoint.

---

## Section 20 — Certification record

- **Phase 3A status:** **CERTIFIED AND FROZEN.**
- **Certified commit:** `c352deecdf27fcc9168067cb26dd88686eb833fe`
- **A12 commit:** `ea9f383` — feat(diagnostic-case): compose timeline and provenance section
- **Final Polish commit:** `c352dee` — fix(diagnostic-case): resolve phase 3a certification findings

**Certification result (against committed bytes):** clean API TypeScript, clean Web TypeScript, clean API build, clean Web build, API boot, route verification (`GET /diagnostic-case/:recordId/overview`), owner integrity (single reads, no mutation, Sign-Out untouched), full state matrix, clinical truthfulness, data-safety allowlist, full workspace UI (one h1, nine h2 in frozen order), responsive checks (no DC horizontal overflow; ~390px global app-shell clipping noted as pre-existing/out-of-scope), zero-orange, and **no production blocker**.

*This is an engineering certification of the committed architecture. It is **not** a regulatory certification and makes **no** claim of WCAG conformance.*

---

## Related documents
- RISK_REGISTER.md · PERMISSION_MATRIX.md · LOGGING_STANDARD.md · TEST_STRATEGY.md · THEME_MIGRATION.md · SECURITY_ARCHITECTURE.md · ACCESSIBILITY_DEBT_REGISTER.md · PRODUCTION_READINESS_CHECKLIST.md

## Future revisions
- Record subsequent phases (3B+) as new sections or a companion ledger; keep Phase-3A entries frozen unless a separately-reviewed defect is found.
- Link future ADR files back to the relevant sections when the ADR series begins.
- Update the Premium UI adoption status as page migration debt is retired.

## Verification requirements
- Every architectural claim must trace to committed code at `c352dee`, a completed audit, or a committed governance doc.
- No invented decisions, owners, permissions, schemas, or capabilities.
- This document is documentation only; it authorizes no code change.
