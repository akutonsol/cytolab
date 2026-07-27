# Program 5 · P5-8 — Asset-graph Search & Navigation — Acceptance Closeout

**Status:** **ACCEPTED / FROZEN.** Canonical P5-8 (§13:228 — *"Asset-graph search & navigation"*) is
delivered: bounded, read-only, owner-composed navigation over the existing persisted asset graph, with the
generation lineage completed (ingestion→job→generation→asset) and the three permission tiers preserved.

- **Accepted head (frozen):** `c360a19` · **Tag:** `p5-8-accepted` → `c360a19`.
- **Provenance:** `651ba63` = the P5-8 **product implementation**; `c360a19` = `651ba63` **plus a single
  acceptance-harness fix** (`wsi-graph-global-setup.ts`). Product/contract code at `c360a19` is
  byte-identical to `651ba63` — the accepted tag points at the exact head the fully-GREEN authoritative
  matrix ran against.
- **Zero schema migrations, zero new infrastructure.** The asset graph is already persisted as Postgres/
  Prisma FKs; P5-8 is read + presentation only. No graph DB / search engine / new model / aggregate /
  permission.
- **Canonical numbering:** [`docs/PROGRAM_5_ROADMAP_CROSSWALK.md`](./PROGRAM_5_ROADMAP_CROSSWALK.md) (§13).
  Preserves `p5-4-*`, `p5-5-accepted` (`b911def`), `p5-6-accepted` (`2094003`), `p5-6.4-accepted`
  (`145b689`), `p5-7-accepted` (`a1b11ee`) unchanged.

## 1. What P5-8 delivered
- **Part A — bounded slide-neighbourhood traversal** (`GET /wsi/slides/:slideId/graph`, `record:view`):
  the slide's PERSISTED neighbourhood — record/patient/specimen (or explicit unassigned), truthful
  lifecycle, sibling-in-record count, deep-links, and a NON-INTERNAL generation summary. Generation/asset
  internals and pixels/storage-keys are deliberately absent.
- **Part B — lineage completeness**: the generation evidence read (`wsi:review`) now carries the
  ingestion→processing-job source half, completing ingestion→job→generation→asset. Reuses the existing
  review service; storage keys / error detail never exposed; history read from persisted rows, not
  reconstructed.
- **Part C — contextual navigation** (existing surfaces; no graph explorer): WSI-registry rows deep-link to
  record + patient; the viewer gains a RelatedResources panel over the Part-A read; GenerationEvidence
  renders the ingestion→job source lineage.

## 2. Invariants (preserved & proven)
- **Owner-composed, read-only** (D-002/D-004/D-019) — no god-service; a navigation surface is never an
  authority.
- **Permission tiers held independently:** `record:view` = metadata navigation; `wsi:review` =
  generation/asset internals; `wsi:view` = delivery. A `record:view` principal gets the neighbourhood but
  **403** on evidence and **403** on delivery-session.
- **Delivery boundary:** traversal issues no delivery session; READY/unpublished stays **409**/non-viewable
  (discoverable ≠ viewable); PUBLISHED viewability still derives from the accepted published-generation
  contract; `/graph` exposes no pixels/tokens/storage-keys/slideUrl/credentials.
- **Provenance is history (D-011):** lineage from persisted ingestion/job/generation/verification/
  publication rows, never reconstructed from current status.
- **Null truth:** a null `specimenId` stays explicitly unassigned; never inferred into a specimen.
- **Tenant/manipulated-id isolation:** cross-slide / cross-tenant node ids resolve to **404**, never a leak.
- **P5-5 unchanged:** slide-metadata search is neither replaced nor corrupted; new deep-links resolve
  through the bounded navigation model.

## 3. Acceptance evidence — authoritative CI, all GREEN at head `c360a19`
| Gate | Workflow | Run | Proves |
|---|---|---|---|
| **P5-8 dedicated** | `wsi-graph-acceptance` | `30284712181` | traversal (persisted edges only) · lineage (ingestion→job→generation→asset, seeded ids) · 3 permission tiers held independently · delivery boundary (no pixels/tokens/keys; READY→409) · null/lifecycle truth · tenant + manipulated-id isolation (404) · contextual UI grounded on relationships |
| **P5-4 viewer** | `wsi-viewer-acceptance` | `30285046785` | authenticated delivery render, no raw-URL pixel load |
| **P5-4 worker** | `wsi-upload-acceptance` | `30285048881` | upload → READY (not viewable) → authorized publish → render + publish **403**/no-mutation |
| **P5-5 search** | `wsi-search-acceptance` | `30285050495` | search/filter/sort/pagination + lifecycle truth |
| **P5-6 orchestration** | `wsi-orchestration-acceptance` | `30285052447` | tray + side-by-side + synchronized navigation |
| **P5-7 specimen** | `wsi-specimen-acceptance` | `30285054633` | specimen discovery/filter + workspace grouping + upload anchoring + null truth |

**RED history (documented; NOT acceptance evidence):** `wsi-graph-acceptance` run `30282832786` @ `651ba63`
failed in the acceptance `globalSetup` — the gate authenticates three tiered principals, and the viewer's
retrying browser-login collided with the correct **5/60s** login throttle (429 on the 3rd principal).
Fixed harness-only in `c360a19` (single deterministic API login + cookies-plus-claims storageState). The
product login throttle is unchanged and still enabled.

## 4. Registration & rollback boundaries
- Product code is **branch-only**; **no product code on `main`**. `wsi-graph-acceptance.yml` registered on
  `main` as one additive dispatch-only file (`b48b0ba`).
- Code-only, **no migration**; `git revert 651ba63` restores the pre-P5-8 navigation. The traversal read,
  lineage extension, and navigation components are self-contained.

## 5. Deferred / out of scope (unchanged)
Not pulled into P5-8: generic graph explorer; graph DB / search engine / vector infra; `specimen:*`/graph
permissions; recursive traversal; **P5-9** Phase-1 closeout; Programs 5B/5C; DICOM/scanner; `SpecimenImage`;
part/block hierarchy; historical URL re-ingestion; streaming SHA-256; the CI login-flake hardening. None was
required for canonical P5-8.
