# Program 5 · P5-5 — Metadata & Indexing / Search over Slides — Acceptance Closeout

**Status:** **ACCEPTED / FROZEN.** Canonical P5-5 (§13:225 — *"Metadata & indexing (search over slides)"*)
is delivered: tenant-scoped, server-side slide discovery over authoritative metadata, with a truthful
lifecycle and the discovery-vs-delivery authorization boundary preserved.

- **Accepted head (frozen):** `b911def4baf4e06830d3168a0155634e9dd6d615`
- **Provenance:** `9e7f65c` = the P5-5 implementation; `b911def` = the P5-5 acceptance workflow + the head
  the authoritative gate ran against (impl + workflow).
- **Branch:** `feat/legacy-etl` · **Tag:** `p5-5-accepted` → `b911def` (immutable; points to the validated head)
- **Gate:** `wsi-search-acceptance` GitHub Actions workflow (`workflow_dispatch`, worker OFF — discovery is
  metadata-only over seeded lifecycle states), **run `30239071717`**, head `b911def`, 2026-07-27 — all steps green.
- Canonical numbering: [`docs/PROGRAM_5_ROADMAP_CROSSWALK.md`](./PROGRAM_5_ROADMAP_CROSSWALK.md) (§13).

## 1. What P5-5 delivered
- **API:** `GET /wsi` now takes `ListSlidesQueryDto extends PaginationDto` — free-text search (patient name,
  record lab/accession number, stain, scanner, format), filters (lifecycle status, stain, scanner, format,
  tileSourceType, recordId), newest/oldest sort with a deterministic secondary key (`id`), and `paginate()`.
  Owned by the WSI module; **PostgreSQL/Prisma only — no new search service, no Elasticsearch/OpenSearch**.
- **Truthful lifecycle** (`slide-lifecycle.ts`): DRAFT / PROCESSING / READY / QC_FAILED / PUBLISHED, with
  `viewable` true ONLY for a genuinely published generation — never inferred from `availabilityStatus`,
  `format`, `slideUrl`, or a READY generation. The status filter uses a matching where-fragment so display
  and filter agree.
- **DB:** one timestamped migration adds `DigitalSlide[labId, uploadedAt]` (the ordered browse path). No
  column/data change; the legacy `slideUrl` column and existing rows are untouched.
- **Web:** the WSI page is a server-backed registry — search, filters, sort, pagination, truthful lifecycle
  badges, empty/no-results states. OpenSeadragon + the P5-4 delivery viewer are untouched.

## 2. Acceptance evidence — run 30239071717 (head b911def), all green
The isolated gate seeds two labs + one slide in each lifecycle state + a deterministic 25-slide set, and
proves (against persisted backend truth, plus a UI network-assert):
- **Search correctness:** exact result sets for supported search terms.
- **Filters:** each filter (status/format/tileSourceType/stain) and a meaningful combination return exactly
  the expected slides.
- **Lifecycle truth:** READY (sealed+verified, unpublished) is **not** viewable; PUBLISHED viewability
  derives from the published generation; PROCESSING/QC_FAILED not viewable.
- **Pagination:** deterministic order, correct total, page boundaries, no duplicates/omissions across pages.
- **Sort:** newest vs oldest.
- **Tenant isolation:** a Lab-A searcher never discovers Lab-B slide metadata.
- **Authorization:** discovery requires `record:view`; the searcher lacks `wsi:view`, so a delivery-session
  issuance is a genuine **403** even for a published slide — discovery is NOT image-delivery authority.
- **No leakage:** `slideUrl`/storage keys never appear in results.
- **UI:** search/filter/sort/pagination controls request backend-grounded results (no client-only search).

**P5-4 regression** (authoritative CI run `30238783866`, head `b911def`): upload → worker → READY → publish
→ authenticated render + the 403/no-mutation boundary + the Phase A viewer all remain green with P5-5 present.

## 3. Truthfulness invariant (preserved)
A slide becomes viewable ONLY through a real processed, sealed, verified, authorized published generation.
Metadata/search never confers viewability, and `slideUrl` never regains authority over it.

## 4. Rollback boundaries
- Code-only + one additive index migration; `git revert 9e7f65c` restores the prior unfiltered list. The
  index migration is a pure `CREATE INDEX` (revertable with `DROP INDEX`); no column/data change.
- `wsi-search-acceptance.yml` was registered on `main` as a single additive file (`0432157`) solely for
  dispatchability; no product code on `main`.

## 5. Deferred / out of scope (unchanged)
Historical URL-only re-ingestion; streaming SHA-256 for large uploads; CI-wiring the P5-4 static no-paste
gate; the P5-4 crosswalk cosmetic erratum; DICOM metadata / Program 5C; **P5-8 asset-graph search**
(distinct from P5-5's slide-metadata search); patient-identity WIP; P5-6 / P5-7. None was pulled into P5-5.
