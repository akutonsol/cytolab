# Program 5B · Stage B2 — Automated Watch-Folder Discovery & Ingestion Handoff — Acceptance Closeout

**Status:** **ACCEPTED / FROZEN.** The server-owned automated watch-folder path is proven end to end against
persisted DB truth, with the real processing worker + real libvips: a filesystem source file is discovered,
stabilised, hashed, exactly matched, handed off into the **accepted 5A ingestion pipeline** as a WATCH_FOLDER
ingestion, verified, tiled by the existing worker, and sealed+verified to **READY — unpublished**. Automation
never publishes; publication remains the human `wsi:publish` boundary.

- **Accepted head (frozen):** `6efd9de` · **Tag:** `p5b-b2-accepted` → `6efd9de`
- **Provenance:** `b461342` = B1 (persistence & contracts); `3b5348a` = **B2 product implementation**;
  `6efd9de` = `3b5348a` + acceptance support (product/contract code byte-identical to `3b5348a`).
- **Zero schema migration in B2** (B1 provided the persistence; `SlideSourceKind.WATCH_FOLDER` already existed).
- Preserves all Program 5A tags (`p5-4-*` … `p5-9-accepted`, `program-5a-phase1-accepted`) unchanged.

## 1. What B2 delivered (on the B1 contracts; one pipeline, multiple intake methods)
- **Poller** (`watch-folder.scheduler.ts`): config-gated (`WSI_WATCH_FOLDER`, disabled by default + under
  test), `workerId`, `setInterval` + safe tick + `unref` + graceful drain; enumerates enabled sources
  **system-side**, processes each inside its own `runJob({ labId: source.labId })` — the persisted source
  `labId` is the sole tenant authority; a per-source in-flight guard prevents overlapping scans.
- **Scanner** (`watch-folder-scanner.ts`): the security boundary — `realpath`-confined to the source root;
  escaping symlinks / traversal fail-closed; supported-extension allowlist; filename never trusted for identity.
- **Stability** (`watch-folder-util.ts` + processor): DISCOVERED→STABILIZING→stable via size-stable-across-
  polls + mtime-quiet (`settleMs`); a still-changing file never ingests. **No new persistence field** (uses B1
  `sizeBytes`+`status`).
- **Byte identity/dedup**: streamed SHA-256 → B1 `isDuplicateBytes` → truthful `DUPLICATE` (never silently
  ingested); never metadata-based.
- **Matching**: exact `AccessionMatchResolver` (labNumber→identifier); `unique`→MATCHED→handoff; `none`→
  UNMATCHED; conflict→AMBIGUOUS. UNMATCHED/AMBIGUOUS never create a slide; `matchedRecordId` never fabricated.
- **Handoff** (`automated-ingestion-composer.ts`): drives the accepted `SlideIngestionService`
  `initiate(sourceKind=WATCH_FOLDER, server-side)` → `appendChunk` → `complete`; INGESTED only after the
  accepted service creates + verifies. Failures persist FAILED + reason + `retryCount` (terminal; no hot retry).
- **WATCH_FOLDER stays server-owned**: the public `InitiateSlideUploadDto` `@IsIn` whitelist is **unchanged**
  (UPLOAD only); only the field TYPE widened. A browser cannot spoof WATCH_FOLDER (unit-proven).

## 2. Authoritative CI evidence — GREEN at head `6efd9de`
`wsi-auto-ingestion-acceptance` **run `30296681882` #1** — `workflow_dispatch`, isolated Postgres, **workers
ON** (`WSI_PROCESSING_WORKER=true` + `WSI_WATCH_FOLDER=true`) + **real libvips 8.15.1**. The DB-truth assertion
(`assert-wsi-autoingest-state.ts`) polled to READY and asserted, against persisted state:

- **Full real path → READY**: discovery → STABILIZING → quiescent → SHA-256 → exact match → server-owned
  WATCH_FOLDER ingestion → **VERIFIED** → accepted processing queue → **real libvips** → sealed+verified →
  **READY**. `IngestionDiscovery` INGESTED with `resultingSlideId`/`resultingIngestionId`; `DigitalSlide`
  `sourceKind=WATCH_FOLDER`, **DRAFT / `publishedGenerationId=null`**; `SlideIngestion` `sourceKind=WATCH_FOLDER`,
  VERIFIED, `sourceChecksum` = the real file bytes; generation **not PUBLISHED**; real `TILE_PYRAMID`+`MANIFEST`
  assets.
- **Stability**: a fresh-mtime file written live stayed pre-ingestion (STABILIZING, no slide) through the settle
  window, then progressed to INGESTED — the real rule, not a seeded-ingestible state (`stabIngested=true`).
- **Dedup**: same bytes / different accession → exactly one INGESTED + one **DUPLICATE**, no second slide.
- **Matching**: no-record → UNMATCHED; conflicting exact keys → AMBIGUOUS; neither creates a slide.
- **Filesystem security**: unsupported file + escaping symlink **not discovered** (fail-closed).
- **Idempotency**: one discovery per `(labId, sourceId, sourceRef)`; one VERIFIED ingestion for the bytes.
- **Tenant isolation**: Lab-B same-accession/same-bytes file stays UNMATCHED — no cross-lab match/dedup.

**Public boundary** (WATCH_FOLDER-spoof rejected) + the pipeline-reuse handoff are covered by the unit/
integration specs committed at `3b5348a`; the 5A ingestion/processing regression was green at `3b5348a`.

## 3. Whole-of-B2 assessment
Automated **watch-folder discovery → accepted ingestion handoff → real processing READY** is delivered and
independently proven in authoritative CI, **without bypassing publication authority** (ends at READY/unpublished;
no automatic PUBLISHED transition; no publication event from automation). **B2 COMPLETE.**

## 4. Registration & rollback boundaries
- Product code is branch-only; **no product code on `main`**. `wsi-auto-ingestion-acceptance.yml` registered on
  `main` as one additive dispatch-only file (`da47426`).
- B2 is code-only, **no migration**; `git revert 3b5348a` removes the automated path; the poller is disabled by
  default (`WSI_WATCH_FOLDER` gate) so the accepted 5A behaviour is unchanged unless explicitly enabled.

## 5. Deferred (later Program 5B / 5C — not begun)
- **B3** — first-class duplicate skip/reconciliation semantics.
- **B4** — operator reconciliation of UNMATCHED/AMBIGUOUS/DUPLICATE/FAILED (a human-resolve queue, persisted+
  audited).
- **B5** — source-management/admin surface + the recommended narrow `system:ingestion` permission (B2 added no
  controller; sources are read system-side / seeded).
- **B6** — Program 5B closeout.
- **Program 5C** — scanner adapters, DICOM WSI/DICOMweb, scanner health, conformance.
- Object-storage-prefix source kind; explicit specimen-from-filename convention; streaming SHA-256 hardening.
