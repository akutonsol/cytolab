# Program 5 · P5-4 Phase B Part 2 — Retire Paste-URL Creation Path — Acceptance Closeout

**Status:** **ACCEPTED / FROZEN.** The legacy paste-URL slide-creation/write path is retired. Slides are
created only through the authenticated ingestion pipeline; viewability derives solely from a genuinely
published, sealed, verified generation via the delivery boundary — never from `slideUrl`.

- **Accepted commit (frozen):** `5391293482573aee0f6ad70d56d3e33bb27affa8`
- **Branch:** `feat/legacy-etl`
- **Tag:** `p5-4-phase-b-part2-accepted` → `5391293` (immutable; points to the implementation, not this doc)
- **Gate:** `wsi-upload-acceptance` (worker ON, real libvips), **run `30236707911`**, head `5391293`,
  2026-07-27 — https://github.com/akutonsol/cytolab/actions/runs/30236707911 — all 18 steps green.
- Canonical numbering: [`docs/PROGRAM_5_ROADMAP_CROSSWALK.md`](./PROGRAM_5_ROADMAP_CROSSWALK.md) (§13).

## 1. Legacy surfaces removed (write/creation path only)
- **web:** deleted `AddSlideModal.tsx` (the paste-URL modal); `/wsi` and record pages now open the ingestion
  `SlideUploadModal`; removed `slideUrl` from the client `DigitalSlide` type.
- **api:** retired `CreateSlideDto`, the `POST /wsi/record/:recordId` create handler, the `createSlide`
  service method, and `slideUrl` from the response projection (`slideSelect`).

## 2. Preserved (per the legacy-record governance decision: retained but non-viewable)
- The `GET /wsi/record/:recordId` read endpoint and all read/list behaviour (records/list still return legacy
  rows' metadata).
- The physical `DigitalSlide.slideUrl` **DB column** — **no schema migration**. Ingestion continues writing
  the `''` compatibility value. Existing historical values are untouched.
- Historical external-URL-only rows: **retained, discoverable/listable, and non-viewable** (already the
  accepted Phase A behaviour). No rows deleted, no values cleared, no archival, no fabricated generations, no
  auto-ingestion, no migration/backfill. A future re-ingestion/migration policy is a separately governed phase.

## 3. Static no-paste gate
`apps/web/acceptance/no-paste-url.check.mjs` (deterministic source scan; libvips/DB/browser-free) proves the
creation path cannot silently return — no paste field, no `AddSlideModal`, no web POST to `/wsi/record/:id`,
no `@Post('record/:recordId')`, no `CreateSlideDto` class, no `createSlide`, no `slideUrl` in the client type
or response projection — while confirming the GET read endpoint and the DB column remain. It distinguishes
legitimate historical references (schema column/comment, ingestion `''` write, test-data `''`, migrations).
Locally: 12/12 pass. *(Not yet CI-wired — see §5.)*

## 4. Regression — accepted replacement path intact
The authoritative worker-ON render gate (run `30236707911`, head `5391293`) passed unchanged after retirement:
upload → VERIFIED → real worker → sealed+verified READY → not-viewable → authorized `wsi:publish` →
persisted `publishedGenerationId` → authenticated delivery → rendered WSI; plus the non-`wsi:publish`
uploader forced-publish **403** with no mutation. Phase A viewer gate + DB-truth assertion also green. web+api
`tsc` clean; no test references the retired surfaces.

**Invariant preserved:** a slide becomes viewable ONLY through a real processed, sealed, verified, authorized
published generation. `slideUrl` has no authority over viewability.

## 5. Rollback boundaries / deferred
- Part 2 is code-only + a doc-comment correction; `git revert 5391293` restores the paste path without any
  schema/data change (column + rows untouched throughout).
- **Deferred (separately governed):** (a) a re-ingestion/migration/disposition policy for historical
  URL-only rows; (b) CI-wiring the static no-paste gate (adding it to a workflow would require a workflow
  change + `main` re-registration — to be authorized explicitly).
