# Program 5 · P5-6 — Multi-slide Orchestration — Acceptance Closeout

**Status:** **ACCEPTED / FROZEN.** Canonical P5-6 (§13:226 — *"Multi-slide orchestration
(tray / side-by-side / synchronized viewports)"*) is delivered in full: case-aware tray with
record-scoped switching, two-slide side-by-side comparison, and synchronized navigation — each
slide individually authoritative through the P5-4 authenticated delivery boundary, with tenant/
record isolation and truthful per-slide lifecycle preserved.

- **Accepted head (frozen):** `2094003002a0930fe4cf4fddcfe2ff1dbe9ad7b2`
- **Branch:** `feat/legacy-etl` · **Tag:** `p5-6-accepted` → `2094003` (immutable; points to the
  validated implementation, **not** to this docs-only closeout commit).
- **Canonical numbering:** [`docs/PROGRAM_5_ROADMAP_CROSSWALK.md`](./PROGRAM_5_ROADMAP_CROSSWALK.md)
  (§13). Distinct from **`p5-6.4-accepted` → `145b689`**, which is the accepted **P5-2R clinical
  review** capability (session-era label "P5-6.4") and is preserved unchanged — a different
  canonical reference, not this checkpoint.

## 1. What P5-6 delivered
Built entirely on the existing `recordId` relationship + the **P5-5** `GET /wsi?recordId=` discovery
API + the **P5-4** authenticated per-slide delivery boundary. **No new viewer engine, no slide-set
aggregate, no schema migration** — OpenSeadragon preserved.

- **Part A — case-aware tray** (`SlideTray.tsx`, viewer page): the viewer resolves the record-scoped
  orchestration set (metadata only) and tracks an `activeId`; the tray shows each slide's identity,
  its **own** truthful lifecycle chip, the active marker, prev/next, and count. Switching re-keys the
  viewer, its delivery session, annotations, and the review drawer off `activeId`. Navigation is
  bounded to the record; tray membership is discovery only and never implies image access.
- **Part B — side-by-side + synchronized navigation** (`CompareViewer.tsx`): two independent
  single-slide `WSIViewer`/OpenSeadragon instances, each with its own slide, delivery session,
  lifecycle, and annotation context. Comparison selection is drawn **only** from the same record set
  (no cross-record / cross-tenant / arbitrary-global-id path); at most two active tile streams.
  "Sync navigation" mirrors pan/zoom via **normalized image-fraction coordinates + fit-relative
  zoom** (correct across mismatched dimensions/MPP) with a feedback-loop guard.
- **WSIViewer** gains one additive, read-only `onViewerReady` hook (exposes its OSD instance to the
  orchestration layer); its single-slide responsibility is otherwise unchanged.

## 2. Truthfulness invariants (preserved)
- **No co-registration claim.** The compare UI explicitly states the panels are *"not spatially
  aligned or co-registered"*; synchronization is navigation convenience only — it asserts no spatial,
  anatomical, or diagnostic correspondence.
- **Per-slide viewability.** A slide is viewable only through its own real published generation; a
  published Slide A is **not** delivery authority for an unpublished Slide B (201 vs 409 per slide).
- **Slide-specific annotations.** Annotations remain associated with the correct slide across
  repeated switching and in each compare panel independently.
- **Tenant/record isolation.** A record-scoped set never surfaces another lab's or another record's
  slides; the discovery (`record:view`) vs delivery (`wsi:view`) boundary is unchanged and not
  broadened.

## 3. Acceptance evidence — authoritative CI, all GREEN at head `2094003`
Isolated stacks (throwaway Postgres, schema-from-datamodel, production web build), `workflow_dispatch`.

| Gate | Workflow | Run | Proves |
|---|---|---|---|
| **P5-6 primary** | `wsi-orchestration-acceptance` | `30270323763` | Part A (tray/order/nav-bounds/tenant isolation/per-slide 201-vs-409/own-session render/slide-specific annotations) + Part B (two live authenticated tile streams, same-record-only selection, sync in-both-directions with no feedback recursion, no-co-registration language, per-slide viewability preserved in compare) |
| **P5-4 viewer** | `wsi-viewer-acceptance` | `30270814591` | authenticated delivery render, no raw-URL pixel load |
| **P5-5 search** | `wsi-search-acceptance` | `30270816255` | server-side search/filter/sort/pagination, truthful lifecycle, tenant isolation, discovery-vs-delivery authz |
| **P5-4 worker** | `wsi-upload-acceptance` | `30270817936` | real worker upload → READY (not viewable) → authorized publish → authenticated render + publish **403**/no-mutation boundary |

The primary gate seeds one Lab-A record with **two published slides** (real DZI) + a READY + a DRAFT
sibling, plus a Lab-B isolation record and a scoped principal (`record:view` + `record:change` +
`wsi:view` + `wsi:review`). Worker OFF for the primary gate (derivative sets seeded directly to a
shared store); the P5-4 worker regression covers the live processing path.

## 4. Registration & rollback boundaries
- Product code is **branch-only** (`2094003`); **no product code on `main`**.
- `wsi-orchestration-acceptance.yml` was registered on `main` as a single additive, dispatch-only
  file (`6f263b3`) solely for dispatchability.
- Code-only, no migration; `git revert 2094003` restores the prior single-slide viewer. The additive
  `WSIViewer.onViewerReady` hook and the two new components are self-contained.

## 5. Deferred / out of scope (unchanged)
Not pulled into P5-6: thumbnail tray previews (the tray is metadata-first by design); comparison of
more than two slides; OSD collection mode; any registration/co-registration transform; **P5-7**
case & specimen integration; **P5-8** asset-graph search; DICOM / Program 5C; historical URL-only
re-ingestion; streaming SHA-256; patient-identity WIP. None was required for canonical P5-6.
