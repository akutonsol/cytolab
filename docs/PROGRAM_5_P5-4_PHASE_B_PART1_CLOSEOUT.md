# Program 5 · P5-4 Phase B Part 1 — Ingestion-Backed Upload → Render — Acceptance Closeout

**Status:** **ACCEPTED / FROZEN.** The ingestion-backed slide-upload replacement flow is proven end to end
against the **real libvips processing worker**, from an uploaded fixture to an authenticated rendered WSI,
with the publication authorization boundary intact.

- **Accepted commit (frozen):** `a73090c01778b01052a0cd526f4b4c93e2f254bf`
- **Branch:** `feat/legacy-etl`
- **Tag:** `p5-4-phase-b-part1-accepted` → `a73090c` (immutable; points to the fully-validated implementation, not this doc)
- **Gate:** `wsi-upload-acceptance` GitHub Actions workflow (`workflow_dispatch`, **worker ON**, real libvips),
  **run `30235658847`** (run #2), head `a73090c`, 2026-07-27 — https://github.com/akutonsol/cytolab/actions/runs/30235658847
- Canonical numbering: [`docs/PROGRAM_5_ROADMAP_CROSSWALK.md`](./PROGRAM_5_ROADMAP_CROSSWALK.md) (§13 authoritative).

## 1. Provenance (two commits make up the accepted state)

- **`34093d3`** — Phase B Part 1 upload UI: the ingestion-backed replacement flow (initiate → chunk →
  complete with client sha256), truthful lifecycle, no auto-publish, paste-URL preserved as a secondary path.
  Accepted worker-OFF (deterministic: upload→VERIFIED→QUEUED→DRAFT, not-viewable, forced-publish 403).
- **`a73090c`** — the real-libvips correction required for genuine upload→render completion (see §3).

The accepted reference (`a73090c`) resolves to the fully-validated state (Part 1 UI + the correction).

## 2. Acceptance evidence — run 30235658847 (worker ON, real libvips), all green

The gate installs libvips, builds the production web, runs the **real** processing worker
(`WSI_PROCESSING_WORKER=true`, `WSI_TILING_ENGINE=libvips`) against an isolated stack, and proves — against
persisted backend truth, not UI state — the full path:

**upload (UI/ingestion) → checksum verification → ingestion VERIFIED → real worker → sealed generation →
verified READY → NOT viewable before publication (delivery issuance 409, no published pointer) → authorized
`wsi:publish` → persisted `publishedGenerationId` → authenticated Phase A delivery (Bearer) → actual rendered
WSI (nonblank canvas).**

Plus the clinical boundary: a `record:change`+`wsi:review` uploader **without** `wsi:publish` forcing a
publish receives a genuine backend **403** with no publication mutation.

DB-truth assertion (step 16) confirmed the generation is `PUBLISHED`, sealed+verified, with real
`DZI_DESCRIPTOR` + `TILE_PYRAMID` + `MANIFEST` assets, and `publishedGenerationId` pointing at it.

## 3. The real-libvips correction (`a73090c`)

The first real-worker run surfaced the pending "real-WSI seal gate" the `LibvipsTilingEngine` docstring
flagged: libvips `dzsave` writes a `vips-properties.xml` metadata sidecar at the top of the `*_files`
pyramid tree. Promotion aggregated **every** file (tiles + sidecar), inflating the registered
`TILE_PYRAMID.sizeBytes` beyond the manifest-declared tile aggregate, so `GenerationSealer` rejected the
generation (`PyramidAggregateMismatchError`) and no real slide could seal. The fake engine (all prior tests)
never emitted the sidecar.

**Fix (engine-local, narrowest):** after `dzsave`, prune every top-level non-directory entry from `*_files`
(the Deep Zoom `_files` top level legally holds only numbered level directories; the sidecar is the sole
exception, and this is robust to any future top-level sidecar). The sealer's integrity invariant is
**unchanged** — the promoted pyramid is now exactly the declared tiles, so registered aggregate == declared
aggregate. A libvips-free regression test locks the tiles-only pyramid contract.

## 4. Rollback boundaries

- The fix is confined to `LibvipsTilingEngine` (+ a focused test); `git revert a73090c` restores the prior
  (defective) real-engine behaviour without touching sealer/storage/schema/manifest.
- No sealer/`digestPyramid`, generic `putImmutableTree`, schema, manifest, or publication/viewability rule
  was changed. The integrity contract (registered promoted pyramid aggregate == manifest-declared tile
  aggregate) is preserved.

## 5. Deferred to Phase B Part 2 (NOT authorized here)

Retire paste-URL (remove `AddSlideModal`'s URL field, `CreateSlideDto.slideUrl`, the persisted/returned
`slideUrl`, the `DigitalSlide.slideUrl` type) only after the legacy external-URL disposition is decided.
See the disposition analysis accompanying this acceptance.
