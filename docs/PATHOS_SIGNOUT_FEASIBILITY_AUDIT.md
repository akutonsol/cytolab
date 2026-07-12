# PathOS — Sign-Out Workspace (Phase 2B-1) composition feasibility audit

| Field | Value |
|---|---|
| Status | Audit complete — composition is feasible and truthful, with named conditions |
| Current Phase | PathOS Phase 2B-1 (compose existing capabilities) |
| Owner | Founder |
| Dependencies | [PATHOS_SIGNOUT_WORKSPACE.md](PATHOS_SIGNOUT_WORKSPACE.md), existing diagnosis modules |
| Last Updated | 2026-07-11 |
| Priority | P0 |
| Expected Next Milestone | Approval of the composition path (foundation first; flagship differentiators remain gated) |

Read-only feasibility audit for building a **unified Sign-Out Workspace now, by composing only
capabilities that already exist**. No implementation, no schema, no Helix change, no redesign of
the stable WSI / result-sheet / authorizer / report screens.

## The one question, answered

**Yes — PathOS can create a truthful unified Sign-Out Workspace now by composing existing
capabilities; it would not merely hide disconnected systems behind one shell — *provided* the four
conditions below hold.** The capabilities are not disconnected: they share a real anchor (every one
keys off `recordId`, priors off `patientId`), one tenancy model (lab-scoped via the injected Prisma
client), and a coherent permission set. A case-centric workspace is therefore a genuine composition,
not a cosmetic wrapper. The honest boundary: the composable-now surface is the **foundation** —
unified read + evidence + priors + report + sign — **not** the flagship Read→Reveal experience,
which stays gated on a data-model decision ([PATHOS_SIGNOUT_WORKSPACE.md](PATHOS_SIGNOUT_WORKSPACE.md)
§5, §9, §14).

**Conditions for truthfulness:**

1. Compose around the real `recordId` anchor (reuse real endpoints), not a presentational shell.
2. **Invoke** the existing components/modals; do not redesign the stable WSI / result-sheet /
   authorizer / report screens.
3. Respect each capability's own permission and tenancy — the workspace shows the union, but each
   action gates on its own right.
4. Do not simulate the flagship differentiators (Read→Reveal, Concordance Ledger, quantification)
   or present the existing mock `ClinicalWorkstation` content as real.

---

## 1. Capability classification

Classes: **directly reusable** · **reusable with composition work** · **partially supported** ·
**blocked by missing data** · **prohibited to simulate**. Tenancy for every row is lab-scoped via
the injected Prisma client (established pattern).

| # | Capability | Class | Route · endpoint · model · permission · current UI |
|---|---|---|---|
| 1 | WSI reading surface | reusable with composition work | `/wsi`; `GET /wsi/record/:recordId`; `DigitalSlide`; `record:view`; viewer page exists — embed/invoke in the workspace |
| 2 | Digital slides | directly reusable | `GET /wsi/record/:recordId`, `GET /wsi/:slideId`; `DigitalSlide`; `record:view` |
| 3 | AI findings & regions | directly reusable | `GET /ai-screening/record/:recordId`; `AIScreeningResult.findings` (`[{region,finding,confidence}]`); `record:view`; `AIScreeningCard` (embeddable) |
| 4 | Bethesda findings | directly reusable | `GET /bethesda/record/:recordId`; `BethesdaResult`; `resultentry:view`; `BethesdaClassificationModal` (invoke) |
| 5 | Prior cases & prior reports | reusable with composition work | `GET /patients/:patientId/history` (`resultentry:view`), `GET /correlation/patient/:patientId` (`record:view`); records/reports by `patientId` — the prior surface must be assembled |
| 6 | Patient & clinical context | directly reusable | `GET /patient/:id` (`patient:view`); record context on the record itself |
| 7 | Result-sheet editing | reusable with composition work | `GET/PUT /resultsheet/:id`, `/resultsheet/update/:id`; `ResultSheet`→`ResultEntry`→`ResultLine`; `resultsheet:view` / `resultentry:change`; `ResultSheetModal` (modal — invoke, do not embed-rebuild) |
| 8 | AI-assisted draft reporting | directly reusable | AiDraft endpoints (result-sheets); `AiDraft` (output→`finalText`, `editedDiff`, redaction snapshot); used in `AuthorizationModal` |
| 9 | Authorization / sign-out | reusable with composition work | `PUT /resultsheet/authorize/:id` (`resultsheet:authorize`); `AuthorizationModal` (modal — invoke) |
| 10 | Attachments | directly reusable | `GET /files/record/:recordId`; `RecordAttachment`; `record:view` / `record:change`; `RecordAttachments` (embeddable — no modal) |
| 11 | Amendments | reusable with composition work | Deauthorize→Reauthorize via result-sheet events; `ResultSheetEvent`; `resultentry:change` / `resultsheet:authorize`; invoke existing flow |
| 12 | Audit & status history | reusable with composition work | `RecordStatusEvent` + `ResultSheetEvent` (+ `AiDraft`); no timeline *endpoint* — the unified timeline must be assembled from existing events |
| 13 | Correlation data | directly reusable | `GET /correlation/patient/:patientId`, `GET /correlation/:id`; `CorrelationCase` (both dx + `correlationResult`); `record:view` |
| 14 | Existing annotations | partially supported | `POST /wsi/:slideId/annotations`, PATCH/DELETE; `SlideAnnotation` (**point `x,y`+label+color only** — no regions/polygons/measurements); `record:change` — do not claim rich annotation |

**Prohibited to simulate** (not a class of the 14, but binding): Read→Reveal, the Concordance
Ledger, and AI quantification ([PATHOS_SIGNOUT_WORKSPACE.md](PATHOS_SIGNOUT_WORKSPACE.md) §5, §9,
§14); and the mock content in the existing `ClinicalWorkstation` (§3 below).

## 2. Cross-cutting findings

- **Shared anchor (the reason composition is real).** Every capability is fetched by `recordId`
  (priors by `patientId`). A workspace that loads a case and hydrates each panel from these endpoints
  is a genuine composition over one subject, not a shell over unrelated systems.
- **Coherent permissions, but granular.** The set spans `record:view`/`record:change`,
  `resultsheet:view`/`:authorize`, `resultentry:view`/`:change`, `report:view`/`:create`,
  `patient:view`. The workspace must gate **each action on its own permission** (a reader with
  `record:view` but not `resultsheet:authorize` sees the case but cannot sign). No blanket
  "signout" permission exists — do not invent one.
- **Tenancy is uniform and safe** — all reads/writes are lab-scoped by the injected Prisma client;
  composition inherits this for free.
- **No unified case-fetch endpoint.** `records.controller` has queue/specimen endpoints but no
  `GET /records/:id/case` bundle. Composition either issues N per-capability calls by `recordId`, or
  adds a **read-only aggregate endpoint** (composition work over existing models — *no new model, no
  new field*). This is a data-composition gap, not a data gap.
- **No timeline endpoint.** The audit/timeline (capability 12) must be assembled from
  `RecordStatusEvent` + `ResultSheetEvent` + `AiDraft`; the events exist, the assembled view does not.
- **Data gaps (real, from the architecture audit):** rich annotations (points only), AI
  quantification (absent), Read→Reveal committed interpretation (absent), Concordance aggregation
  (absent). None may be faked.

## 3. Duplication and navigation risks

- **`ClinicalWorkstation` already exists — but is a mock shell.** The dashboard ships a
  `createPortal` "Clinical Review Workstation" overlay that lays out case header, AI findings, a case
  timeline, an authorization step, and collaboration — exactly the Sign-Out shape. **However, it is
  presentational and mock-driven**: it takes rendered `aiModel`/`aiFindings` as props and hardcodes
  demo content (named reviewer comments, placeholder timeline states). It proves the *layout* is
  composable but is **not wired to real endpoints**. Risk: presenting it as the real workspace would
  ship mock content. Path: wire a real workspace to the real endpoints (reusing its layout ideas is
  fine; presenting its mock data is prohibited).
- **Route duplication.** The same case is reachable today via `/records` (→ modals), `/wsi`,
  `/result-sheets`, `/authorizer`, `/reports`. A new unified surface adds another path to the same
  case. **Preserve current routes** until a consolidation path is proven; two doors to one case is a
  consistency risk, not a blocker.
- **Modal-bound editors.** `ResultSheetModal`, `AuthorizationModal`, `BethesdaClassificationModal`
  are modals (portal / `fixed inset-0`). Compose by **invoking** them from the workspace (opens the
  proven, unchanged screen), not by extracting their bodies into panels — extraction would edit the
  stable screens the constraints protect. `RecordAttachments` and `AIScreeningCard` are embeddable.

## 4. Composability verdict per surface

- **Read + evidence + priors + context (capabilities 1–6, 13):** composable now — embed the WSI
  viewer and AI/Bethesda/correlation/prior panels around one `recordId`/`patientId`. Truthful.
- **Report + sign (7–9, 11):** composable now by **invoking** the existing result-sheet, AI-draft,
  and authorization modals from the workspace; the flow and screens are unchanged. Truthful.
- **Attachments + audit/timeline (10, 12):** attachments embeddable now; the unified timeline is
  assembly work over existing events (no new model). Truthful.
- **Annotations (14):** point annotations only — usable; rich annotation must be labeled absent.
- **Flagship (Read→Reveal, Concordance, quantification):** **not** part of the composable-now
  surface; gated on a data-model decision. Building the foundation must not imply the flagship
  exists.

## 5. Recommendation

**A truthful unified Sign-Out Workspace is feasible now as a composition** — the "foundation"
version: one case-centric surface that hydrates real WSI, AI findings, Bethesda, correlation,
priors, and context by `recordId`/`patientId`, and **invokes** the existing result-sheet /
AI-draft / authorization / amendment flows without redesigning them, respecting each capability's
own permission and tenancy, with an assembled case timeline over existing events. Suggested smallest
composition step: a read-only case shell (new read-only aggregate endpoint, no new model) that
reuses existing components/modals; preserve all current routes.

**Do not** in this phase: implement Read→Reveal or the Concordance Ledger; add schema fields; modify
Helix; add design-system abstractions; claim quantification (only confidence + region JSON exist);
redesign the WSI / result-sheet / authorizer / report screens; or present `ClinicalWorkstation`'s
mock content as real.

## 6. Verification note

Nothing was implemented; this is a read-only audit. No code, schema, or Helix change; no stable
screen touched. Every capability class cites its real route, endpoint, model, permission, and UI
surface. The composable-now foundation is truthful; the flagship differentiators remain honestly
gated. Traces to [PATHOS_SIGNOUT_WORKSPACE.md](PATHOS_SIGNOUT_WORKSPACE.md), [PATHOS_v2.md](PATHOS_v2.md)
§4, and [../HELIX_v1.0.md](../HELIX_v1.0.md).
