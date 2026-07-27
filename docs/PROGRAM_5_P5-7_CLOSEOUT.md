# Program 5 · P5-7 — Case & Specimen Integration — Acceptance Closeout

**Status:** **ACCEPTED / FROZEN.** Canonical P5-7 (§13:227 — *"Case & specimen integration
(specimen-anchored slides in the workspaces)"*) is delivered: slides are surfaced grouped by their
**persisted** specimen anchor in both the diagnostic-case and sign-out workspaces, with a truthful
record-level/unassigned bucket, over the existing record authorization and tenant isolation.

- **Accepted head (frozen):** `a1b11ee` · **Tag:** `p5-7-accepted` → `a1b11ee` (immutable; points to
  the validated implementation, **not** this docs-only closeout commit).
- **Zero schema migrations.** The `DigitalSlide.specimenId` FK + index and the `Specimen` model already
  existed (P5-1); P5-7 is read + presentation integration only.
- **Canonical numbering:** [`docs/PROGRAM_5_ROADMAP_CROSSWALK.md`](./PROGRAM_5_ROADMAP_CROSSWALK.md) (§13).
  Preserves `p5-4-*`, `p5-5-accepted` (`b911def`), `p5-6-accepted` (`2094003`), and `p5-6.4-accepted`
  (`145b689`, P5-2R clinical review) unchanged.

## 1. What P5-7 delivered
Built entirely on the existing substrate — `DigitalSlide.specimenId` (nullable FK + index), the `Specimen`
model, upload-time same-record validation, and record authorization. **No new model, aggregate, service,
ACL, viewer, or `specimen:*` permission; no migration.**

- **API read exposure** (`wsi.service.ts`): `slideSelect`, `toRow`, and `listByRecordMeta` now carry the
  persisted specimen identity (`{id, type, label}`); a null `specimenId` stays truthfully record-level.
  `ListSlidesQueryDto` gains an optional `specimenId` filter — narrow + additive (analogous to `recordId`);
  P5-5 search/filter/sort/pagination/lifecycle are unchanged. The diagnostic-case overview and sign-out
  aggregate slide projections carry the same persisted identity, so both workspaces group from one source.
- **Web** (`lib/wsi-specimen.ts`): a single shared `groupSlidesBySpecimen` derivation (specimen groups
  first, unassigned/record-level bucket last). The diagnostic-case `SlidesSubArea` and sign-out `SlidesPanel`
  render slides grouped by their persisted specimen with an explicit unassigned bucket. `SlideUploadModal`
  gains an optional specimen picker (from the record's existing specimens); empty = record-level; the server
  remains authoritative and rejects a cross-record specimen (400).

## 2. Truthfulness invariants (preserved)
- **Persisted membership only** — grouping derives exclusively from persisted `specimenId`.
- **Null remains null** — a null anchor is shown as unassigned/record-level, never fabricated into a specimen.
- **No aggregate inference** — sharing a specimen implies nothing about review, completeness, publication,
  or spatial relationship.
- **Viewability independent** — specimen membership never grants image access; a READY-but-unpublished slide
  grouped under a specimen stays non-viewable (delivery still `wsi:view` + published-generation-bound).
- **Persisted identity** — the displayed specimen type/label is the persisted value, never invented.

## 3. Acceptance evidence — authoritative CI, all GREEN at head `a1b11ee`
Isolated stacks (throwaway Postgres, schema-from-datamodel, production web build), `workflow_dispatch`.

| Gate | Workflow | Run | Proves |
|---|---|---|---|
| **P5-7 dedicated** | `wsi-specimen-acceptance` | `30274876088` | specimen-aware discovery + `specimenId` filter (exact sets, null never fabricated) · both workspaces group by persisted specimen with truthful unassigned bucket (grounded on seeded relationships) · upload anchors `specimenId` + cross-record specimen → genuine **400** · READY-under-specimen stays non-viewable (409) · tenant + cross-record isolation |
| **P5-4 viewer** | `wsi-viewer-acceptance` | `30275298893` | authenticated delivery render, no raw-URL pixel load |
| **P5-4 worker** | `wsi-upload-acceptance` | `30275953522` | real worker upload → READY (not viewable) → authorized publish → authenticated render + publish **403**/no-mutation boundary |
| **P5-5 search** | `wsi-search-acceptance` | `30275302836` | server-side search/filter/sort/pagination + lifecycle truth (specimenId filter is additive, non-regressive) |
| **P5-6 orchestration** | `wsi-orchestration-acceptance` | `30275304819` | record-scoped tray + side-by-side + synchronized navigation intact |

The dedicated gate seeds Record A (specimen **S1**: one PUBLISHED + one READY slide; specimen **S2**: one
slide; one **null-specimen** slide), Record A2 (specimen **S3**, cross-record), and Lab B (specimen **SB**,
tenant isolation), driven by a scoped principal (`record:view` + `record:change` + `wsi:view`).

**CI note:** `wsi-upload-acceptance` run `30275301037` (first attempt) failed in its Playwright
`globalSetup` login (login-page asset 403/404 → button not hydrated → login timeout) — an environment/
provisioning flake in a path P5-7 does not touch. The clean re-run `30275953522` at the same head is GREEN;
the P5-4 viewer gate (same login mechanism) and the local P5-4 render regression at `a1b11ee` were both green.

## 4. Registration & rollback boundaries
- Product code is **branch-only** (`a1b11ee`); **no product code on `main`**.
- `wsi-specimen-acceptance.yml` was registered on `main` as a single additive, dispatch-only file
  (`d730ec2`) solely for dispatchability.
- Code-only, **no migration**; `git revert a1b11ee` restores the record-only workspaces. The shared web
  helper and the read-projection additions are self-contained.

## 5. Deferred / out of scope (unchanged)
Not pulled into P5-7: `SpecimenImage` revival; part/block hierarchy; `specimen:*` permissions; diagnostic
aggregation/AI; **P5-8** asset-graph search; **P5-9** Phase-1 closeout; Program 5B/5C; historical URL
re-ingestion; streaming SHA-256; patient-identity WIP. None was required for canonical P5-7.
