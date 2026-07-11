# PathOS — Unified Sign-Out Workspace (Phase 2B-1) implementation plan

| Field | Value |
|---|---|
| Status | Draft — binding engineering plan, pending approval; no implementation |
| Current Phase | PathOS Phase 2B-1 (compose existing capabilities) |
| Owner | Founder |
| Dependencies | [PATHOS_SIGNOUT_WORKSPACE.md](PATHOS_SIGNOUT_WORKSPACE.md), [PATHOS_SIGNOUT_FEASIBILITY_AUDIT.md](PATHOS_SIGNOUT_FEASIBILITY_AUDIT.md), Helix v1.0 (frozen) |
| Last Updated | 2026-07-11 |
| Priority | P0 |
| Expected Next Milestone | Approval → build checkpoint B1 |

Binding engineering plan for the Phase 2B-1 Unified Sign-Out Workspace. No implementation, no
schema, no React, no API code, no wireframes. Everything traces to the approved architecture and
feasibility audit.

**Governing principle.** The Sign-Out Workspace owns **orchestration, not functionality.** It must
never become a second slide viewer, a second reporting system, a second authorization system, a
second AI-screening implementation, or a mock clinical workstation. Existing domain surfaces remain
the source of truth for their behavior; the workspace composes them around one real clinical anchor
— `recordId` (priors via `patientId`).

**Orchestration Rule (binding).** The workspace is an orchestrator, and every one of these holds at
all times:

1. It **composes** existing surfaces; it **never owns domain functionality**.
2. There is exactly **one clinical anchor per instance**: `recordId` (priors via `patientId`).
3. All **reads** flow through the read-only aggregate (§3), which *calls* existing services and
   **duplicates no domain logic**.
4. All **writes** happen only by **invoking the existing owner surface** (WSI viewer, result-sheet
   editor, authorizer, AI-draft, amendment); the workspace implements none of them a second time.
5. It adds **no persistence and no schema**.
6. **Permissions are enforced by the owning endpoint**; the shell mirrors them to hide/disable —
   it never replaces enforcement.
7. **No capability is simulated**; absent data is shown as absent.

A change that would violate any clause belongs in a different, separately-approved effort — not in
the Sign-Out Workspace.

---

## 1. Scope

**Phase 2B-1 includes** a read-only orchestration shell that lets a pathologist, for one real case:
open it; review patient/clinical context; reach the existing WSI/slide experience; review real AI
findings/regions, Bethesda, and correlation; access priors and prior reports; review attachments;
edit the existing result sheet; use the existing AI-draft flow; invoke the existing
authorization/sign-out flow; review a timeline assembled from existing events; and return to the
worklist without losing context. Plus one read-only **aggregate endpoint** (no new persistence).

**Explicitly excluded** (each is honestly gated elsewhere): Read → Reveal; the Concordance Ledger;
AI quantification; supporting literature; rich region annotations; a new electronic-signature
framework; schema changes; route consolidation; and replacement/redesign of the WSI viewer,
result-sheet editor, report workflow, authorizer, or any stable screen. No capability is simulated.

## 2. Existing capability map

Tenancy for every row is lab-scoped via the injected Prisma client. "Composition" is the intended
Phase 2B-1 treatment.

| Capability | Route | API endpoint | Model | Service | Permission | Current UI owner | Composition |
|---|---|---|---|---|---|---|---|
| Case context | `/records` | `records.findOne(id)` (record detail) | `Record` | records | `record:view` | records page | aggregate (read) |
| Patient context | `/patients` | `GET /patient/:id` | `Patient` | patients | `patient:view` | patients page | aggregate (read) |
| Clinical features | `/records` | via record (`clinicalDiagnosis`, `gyn/nonGynFeatures`) | `Record`,`GynClinicalFeatures` | records | `record:view` | record surfaces | aggregate (read) |
| Digital slides | `/wsi` | `GET /wsi/record/:recordId` | `DigitalSlide` | wsi | `record:view` | WSI page | aggregate metadata + link/embed viewer |
| WSI viewer | `/wsi` | (image delivery separate) | `DigitalSlide.slideUrl` | wsi | `record:view` | WSI viewer | invoke/embed unchanged |
| AI findings | `/ai-screening` | `GET /ai-screening/record/:recordId` | `AIScreeningResult` | ai-screening | `record:view` | `AIScreeningCard` | embed unchanged / aggregate read |
| Bethesda | `/bethesda` | `GET /bethesda/record/:recordId` | `BethesdaResult` | bethesda | `resultentry:view` | `BethesdaClassificationModal` | aggregate read; invoke modal to edit |
| Correlation | `/correlation` | `GET /correlation/patient/:patientId`, `/:id` | `CorrelationCase` | correlation | `record:view` | correlation page | aggregate read; link |
| Priors | `/patients` | `GET /patients/:patientId/history` | `Record`/`Report` | patients | `resultentry:view` | patient history | aggregate read |
| Attachments | `/files` | `GET /files/record/:recordId` | `RecordAttachment` | files | `record:view` | `RecordAttachments` | embed unchanged |
| Result sheet | `/result-sheets` | `GET/PUT /resultsheet/:id` | `ResultSheet`/`ResultEntry`/`ResultLine` | result-sheets | `resultsheet:view`/`resultentry:change` | `ResultSheetModal` | invoke unchanged |
| AI draft | `/result-sheets` | AI-draft endpoint (result-sheets) | `AiDraft` | result-sheets | (verify at B10) | `AuthorizationModal`/draft flow | invoke unchanged |
| Authorization | `/authorizer` | `PUT /resultsheet/authorize/:id` | `ResultSheet` | result-sheets | `resultsheet:authorize` | `AuthorizationModal` | invoke unchanged |
| Amendments | `/result-sheets` | deauthorize→reauthorize | `ResultSheetEvent` | result-sheets | `resultentry:change`/`resultsheet:authorize` | existing flow | invoke unchanged |
| Status history | — | `RecordStatusEvent` | `RecordStatusEvent` | records | `record:view` | (none unified) | aggregate → timeline |
| Audit history | — | `ResultSheetEvent`/`AiDraft` | `ResultSheetEvent`,`AiDraft` | result-sheets | `record:view`/`resultsheet:view` | (none unified) | aggregate → timeline |

## 3. Aggregate read model

**One read-only endpoint** composes the case for the shell. Proposed: `GET /signout/case/:recordId`,
in a thin new **`signout`** orchestration module (a NestJS module that injects and calls the existing
services — records, wsi, ai-screening, bethesda, correlation, files, patients, result-sheets — and
**owns no domain logic**). It exists to compose, and must not reimplement any read another module
already provides.

- **Response sections** (each optional, independently resolved): `case` (record detail),
  `patient`, `clinicalFeatures`, `slides` (WSI *metadata*: id, url, magnification, stain — not
  bytes), `ai` (`AIScreeningResult`), `bethesda`, `correlation` (this patient), `priors`
  (patient history summary), `attachments`, `resultSheets` (summary + ids), `timeline` (§6),
  `permissions` (the caller's effective rights for this case, §8).
- **Permissions.** The endpoint requires the base `record:view`. Each section is included only if
  the caller holds that section's own permission (e.g. `bethesda` needs `resultentry:view`; priors
  need `resultentry:view`); otherwise the section is `null` with a `reason: 'forbidden'` marker, not
  omitted silently and not a 403 for the whole case.
- **Tenancy.** Inherited — all composed reads are lab-scoped by the injected Prisma client; the
  endpoint adds no cross-lab access.
- **Partial-data behavior.** A missing section (e.g. no result sheet yet, no AI result) resolves to
  an explicit empty/absent marker, never a fabricated value. Truthful empty states downstream.
- **Error isolation.** Each section is resolved independently (`Promise.allSettled`-style); a failing
  section returns `{ error: true }` for that section only — one domain read failing must not fail the
  whole case load.
- **Loading strategy.** The shell may request the whole aggregate once and render per-section
  skeletons, or (if payload risk grows) split heavy sections (priors, timeline) into their own lazy
  calls. Default: one aggregate for light sections; WSI images and result-sheet bodies are **not** in
  the aggregate.
- **Cache / invalidation.** React Query key `['signout-case', recordId]`; invalidated on the realtime
  events the domain screens already emit (result authorized, dashboard refresh) and after any invoked
  modal completes (authorize, edit, amend). No new realtime channel.
- **Payload-size risks.** Priors and timeline can grow; bound them (recent priors, capped timeline)
  and paginate/lazy-load if needed. Never inline slide images or full report bodies.
- **WSI metadata vs image-delivery boundary.** The aggregate carries slide **metadata and URLs
  only**; pixel/tile delivery stays with the existing WSI viewer/endpoints. The shell links or embeds
  the viewer; it never proxies images.

## 4. Workspace shell

The shell (a new read route, e.g. `/sign-out/:recordId`) **owns orchestration only**:

- case identity (the `recordId` it is bound to);
- workspace navigation (which panel is focused) and panel coordination;
- loading state (per-section skeletons; no false empty state);
- **permission-aware actions** (show/enable only what the caller may do, from the aggregate's
  `permissions`);
- return-to-context (§9); deep links (`/sign-out/:recordId`);
- timeline assembly display (§6).

It **does not** own: slide rendering, AI screening, result-sheet editing, report generation,
authorization, or amendment logic — those are invoked/embedded from their existing owners.

### 4a. Workspace lifecycle

The orchestration lifecycle of one case instance (read-first; the shell holds no domain state of its
own):

1. **Enter.** Reached by deep link (`/sign-out/:recordId`) or from a worklist. The base `record:view`
   is checked; the source context (§9) is captured for return.
2. **Hydrate.** The read-only aggregate (§3) loads. Each section renders a skeleton, then real data,
   or a truthful **empty / forbidden / error** marker — independently, with error isolation. No false
   empty state; nothing fabricated.
3. **Active.** The pathologist reviews (embedded and aggregated read surfaces) and acts (invoked owner
   surfaces). Actions are shown/enabled strictly by the aggregate's effective permissions (§8).
4. **Mutate.** A write happens **only inside an invoked owner surface** (edit, AI-draft, authorize,
   amend). On its completion the shell invalidates `['signout-case', recordId]` and any affected
   domain query keys and re-hydrates the changed sections. The shell never writes directly.
5. **Return.** "Back to worklist" restores the source list exactly (filters / page / scroll, §9); the
   instance unmounts holding no residual state.

The lifecycle is **idempotent and re-entrant**: re-opening the same case reproduces the same composed
view from current data; nothing is cached as truth beyond the invalidatable query.

## 5. Composition boundaries

For each surface, the decision and why:

- **WSI viewer / digital slides — invoke or embed unchanged.** Start by **linking**/opening the
  existing `/wsi` experience for the case (B4); embed the unchanged viewer component later if it is
  cleanly embeddable. Never rebuild a viewer. *Why: protects the stable, performance-sensitive
  screen.*
- **Result-sheet editor — invoke unchanged (`ResultSheetModal`).** *Why: it is a modal; invoking
  preserves the proven screen; embedding would require editing it.*
- **Authorization / sign-out — invoke unchanged (`AuthorizationModal`).** *Why: authorization is the
  most sensitive flow; it must remain the single implementation.*
- **Amendments — invoke unchanged** (existing deauthorize→reauthorize flow). *Why: one amendment
  path only.*
- **Bethesda — aggregate read; invoke `BethesdaClassificationModal` to edit.** *Why: read composes;
  edits stay with the owner.*
- **AI findings — embed unchanged (`AIScreeningCard`) / aggregate read.** *Why: it is embeddable and
  read-oriented.*
- **Attachments — embed unchanged (`RecordAttachments`).** *Why: already embeddable (no modal).*
- **Correlation, priors, patient/clinical context, status/audit — aggregate read-only.** *Why: these
  are read surfaces; the aggregate composes them; edits (if any) link out.*
- **Timeline — aggregate read-only (assembled, §6).**
- **Defer:** anything requiring the flagship models (Read→Reveal, Concordance, quantification) and
  rich annotations — out of Phase 2B-1.

## 6. Timeline composition

The unified timeline is **assembled from existing events only** (no invented events):

- `RecordStatusEvent` (status transitions, actor, notes);
- `ResultSheetEvent` (`Authorized` / `Deauthorized` / `Reauthorized`) — sign-out and amendments;
- amendment events (the Deauthorized→Reauthorized pair, with `editReason` where present);
- attachment events where recorded (`RecordAttachment.createdAt` + uploader);
- AI-screening timestamps (`AIScreeningResult.processedAt` / `reviewedAt`, `reviewedBy`);
- slide-upload timestamps (`DigitalSlide.uploadedAt`);
- correlation events where recorded (`CorrelationCase.createdAt` / `reviewedAt`);
- `AiDraft` events (generated / accepted) where present.

Each timeline item includes: **event type · timestamp · actor (if recorded, else "system"/unstated)
· source system/model · description · action link (only if a real destination exists).** Items with
no recorded actor say so; nothing is inferred. Ordering is by timestamp; ties broken deterministically.

## 7. Prior-aware review

A **read-only** prior-context surface over `patientId`-linked records/reports (`/patients/:patientId/
history`, `/correlation/patient/:patientId`):

- priors provide **context only**; they **never overwrite** the current case;
- **no inferred longitudinal diagnosis**, no automatic clinical conclusion;
- each prior preserves its **source report and date**;
- distinguish **cytology, histology, amendment, and correlation** history **only where the data
  supports it** (e.g. correlation cyto-vs-histo is explicit; a generic prior record is labeled as
  such, not classified beyond what is recorded);
- bounded to recent priors with a link to full history; no fabricated trend.

## 8. Permissions

**There is no blanket sign-out permission.** The workspace composes the granular rights and
hides/disables each action by the caller's real permission (delivered in the aggregate's
`permissions` section):

| Action | Required permission |
|---|---|
| View case | `record:view` |
| View slide | `record:view` |
| View AI | `record:view` |
| View attachments | `record:view` |
| View audit / timeline | `record:view` |
| View Bethesda / priors | `resultentry:view` |
| Edit result sheet | `resultentry:change` |
| Generate AI draft | the existing AI-draft endpoint's right (verify at B10) |
| Authorize / sign out | `resultsheet:authorize` |
| Amend | `resultentry:change` + `resultsheet:authorize` |

A user with `record:view` but not `resultsheet:authorize` sees the case and evidence but the Sign
action is hidden/disabled. The shell never calls an action the caller lacks; the underlying endpoints
remain the enforcement point (defense in depth).

## 9. Navigation and context preservation

- **Source worklist:** `records/my-queue` (and other list entry points). The shell records where the
  user came from.
- **Preserved on entry:** selected `recordId`, the source route, its filters, pagination, selected
  tab/panel, and scroll position where practical (carried as return state, not new persistence).
- **Return path:** a single "back to worklist" that restores the list exactly (filters/page/scroll).
- **Deep links:** `/sign-out/:recordId` is directly addressable and permission-checked.
- **Preserve current routes** (`/records`, `/wsi`, `/result-sheets`, `/authorizer`, `/reports`) until
  a consolidation path is separately proven safe. Two doors to one case is accepted, temporarily.

## 10. Increment plan

**Success criterion (applies to every checkpoint).** A checkpoint is complete only when: (a) it
performs exactly its stated scope on a **real case with real data** — no mock, no placeholder —
demonstrated in an authenticated browser; (b) it meets the full **Verification Contract (§11)**
(typechecks, production builds, lab scoping, permission gating, truthful loading/empty/error,
zero-orange 0px); (c) it adds **no domain logic** (the aggregate calls existing services; the shell
invokes existing UI), **no schema change, no Helix change, and no simulated capability** (Orchestration
Rule); and (d) it is independently **revertible** at its rollback boundary without affecting other
checkpoints. Each checkpoint's `Stop` line below states its specific demonstrable outcome; this
universal criterion applies on top of it, and no checkpoint is committed until both are met.

Each checkpoint is an isolated, independently-committable slice with a rollback boundary. Scope /
files-likely-affected / permissions / verification / stop condition / rollback:

- **B1 — Read-only shell + route.** Scope: `/sign-out/:recordId` route + empty permission-gated shell
  (loads nothing yet). Files: new web route page + shell component. Perms: `record:view`. Verify:
  route loads for a real recordId, 401/permission gating. Stop: shell renders, no data. Rollback:
  delete the route.
- **B2 — Aggregate case hydration.** Scope: `signout` API module + `GET /signout/case/:recordId`
  composing existing service reads (case/patient/permissions sections first). Files: new
  `apps/api/.../signout/*`; web query hook. Perms: `record:view` + per-section. Verify: API/web tsc,
  lab scoping, per-section permission markers, error isolation. Stop: aggregate returns real
  case/patient. Rollback: remove module + hook.
- **B3 — Patient & clinical context panel.** Scope: render case/patient/clinical-features from the
  aggregate. Files: shell panels. Verify: values trace to real fields; truthful empty. Stop: context
  renders.
- **B4 — WSI & digital-slide invocation.** Scope: slide list (metadata) + open the existing WSI
  experience (link/invoke). Files: shell slide panel. Perms: `record:view`. Verify: slides are real;
  viewer opens unchanged; no image proxying. Stop: slides listed + viewer reachable.
- **B5 — AI / Bethesda / correlation evidence.** Scope: embed `AIScreeningCard`; render Bethesda +
  correlation from the aggregate (read). Files: shell evidence panel. Perms: `record:view` /
  `resultentry:view`. Verify: findings/regions real; no quantification claimed. Stop: evidence renders.
- **B6 — Prior-aware review.** Scope: read-only priors panel (§7). Files: shell priors panel. Perms:
  `resultentry:view`. Verify: priors preserve source+date; no inferred dx. Stop: priors render.
- **B7 — Attachments.** Scope: embed `RecordAttachments`. Files: shell attachments panel. Perms:
  `record:view`/`record:change`. Verify: real files. Stop: attachments render.
- **B8 — Unified timeline.** Scope: assemble timeline (§6) in the aggregate + render. Files: aggregate
  timeline composer + shell timeline panel. Perms: `record:view`. Verify: every item traces to a real
  event; no invented events. Stop: timeline renders.
- **B9 — Result-sheet invocation.** Scope: open `ResultSheetModal` from the shell; invalidate on
  completion. Files: shell action wiring. Perms: `resultentry:change`. Verify: unchanged modal;
  edits persist via existing endpoint. Stop: edit round-trips.
- **B10 — AI-draft invocation.** Scope: open the existing AI-draft flow. Files: shell action wiring.
  Perms: verify + gate. Verify: unchanged flow; redaction intact. Stop: draft round-trips.
- **B11 — Authorization & amendment invocation.** Scope: open `AuthorizationModal` + amendment flow;
  invalidate. Files: shell action wiring. Perms: `resultsheet:authorize`. Verify: single auth path;
  sign-out works; amendment audited. Stop: sign-out + amend round-trip.
- **B12 — Return-to-context & keyboard workflow.** Scope: preserve/restore worklist state (§9);
  keyboard navigation between cases and panels. Files: shell nav + list entry. Verify: filters/page/
  scroll restored; no context loss. Stop: round-trip preserves context.
- **B13 — Verification & audit.** Scope: full verification pass (§11), zero-orange, permission
  matrix, no mock content. Files: verification scripts only. Verify: all gates green. Stop: contract met.

## 11. Verification contract

Every approved checkpoint requires, before its isolated commit: API and web typechecks clean;
API and web production builds clean; authenticated browser verification of the slice; **lab scoping**
verified; **permission testing** (each gated action hidden/disabled without its right; enforced by
the endpoint); **truthful loading / empty / error states**; **no mock content** (no
`ClinicalWorkstation` placeholder data); **no schema changes**; **no Helix changes**; **no duplicated
domain logic** (the aggregate calls existing services; the shell invokes existing UI); **zero-orange
0 px**; unrelated dirty files untouched; and an **isolated commit** staging only that checkpoint's
files.

## 12. Risks

- **Mock `ClinicalWorkstation` contamination.** The existing overlay is mock-driven; reusing its
  *layout ideas* is fine, presenting its *data* is prohibited. Mitigate: wire only to the real
  aggregate; a verification step asserts no placeholder strings.
- **Payload size.** Aggregate could balloon (priors, timeline, slides). Mitigate: metadata-only
  slides, bounded priors/timeline, lazy heavy sections.
- **WSI performance.** Gigapixel delivery is heavy. Mitigate: keep image delivery with the existing
  viewer; the shell never proxies pixels.
- **Permission fragmentation.** Many granular rights. Mitigate: the aggregate returns effective
  per-case permissions; the shell gates on them; endpoints enforce.
- **Route duplication.** A new door to the same case. Mitigate: preserve current routes; defer
  consolidation until proven.
- **Stale aggregate data.** Mitigate: invalidate on the domain realtime events and after every
  invoked modal.
- **Partial capability failure.** Mitigate: per-section error isolation; one failing read never fails
  the case.
- **Timeline inconsistency.** Mitigate: assemble from recorded events only; deterministic ordering;
  no inferred actors/events.
- **Accidental report duplication.** Mitigate: reporting is invoked from its owner only; the shell
  never generates reports.
- **Accidental authorization duplication.** Mitigate: authorization is invoked from `AuthorizationModal`
  only; no second sign path.

## Conflict check

No conflicts found with [PATHOS_SIGNOUT_WORKSPACE.md](PATHOS_SIGNOUT_WORKSPACE.md) or
[PATHOS_SIGNOUT_FEASIBILITY_AUDIT.md](PATHOS_SIGNOUT_FEASIBILITY_AUDIT.md). This plan builds only the
"foundation" the feasibility audit recommended (composition around `recordId`, invoke-not-redesign,
per-capability permissions, no unified-fetch/timeline reinvention beyond a read-only aggregate), and
honors every exclusion in the architecture doc (Read→Reveal, Concordance, quantification, rich
annotations, e-signature framework, schema, route consolidation, stable-screen redesign all deferred).
One item to verify during build, not a conflict: the exact permission on the AI-draft endpoint (B10).

## Status of this document

Binding engineering plan; architecture only. On approval, implementation proceeds checkpoint by
checkpoint (B1…B13), each tracing here and to [PATHOS_SIGNOUT_WORKSPACE.md](PATHOS_SIGNOUT_WORKSPACE.md),
verified against §11, and recorded in [../Roadmap/08_RELEASES.md](../Roadmap/08_RELEASES.md).
