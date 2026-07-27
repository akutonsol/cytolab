# Program 5 · P5-4 (Phase A) — Authenticated Viewer Delivery — Acceptance Closeout

**Status:** **ACCEPTED / FROZEN.** Canonical P5-4 ("Viewer on real in-platform tiles / retire paste-URL")
**Phase A** — wiring the WSI viewer to the authenticated delivery boundary — passed its browser acceptance
gate fully green on the authoritative isolated CI stack.

- **Accepted commit (frozen):** `9fc0f49d8bb37cfd3678e1e06d5b1167a83f3355`
- **Branch:** `feat/legacy-etl`
- **Tag:** `p5-4-phase-a-accepted` → `9fc0f49` (immutable; points to the implementation, not this doc)
- **Gate:** `wsi-viewer-acceptance` GitHub Actions workflow (`workflow_dispatch`), **run `30232563478`**, 2026-07-26 —
  https://github.com/akutonsol/cytolab/actions/runs/30232563478
- Canonical numbering: [`docs/PROGRAM_5_ROADMAP_CROSSWALK.md`](./PROGRAM_5_ROADMAP_CROSSWALK.md) (§13 authoritative).

> Convention (per the P5-6.4 closeout): recorded SHAs are point-in-time acceptance evidence for this run.
> The tag name preserves the accepted implementation; when closing risk items, reference the commit message.

---

## 1. Acceptance evidence — run 30232563478 (head 9fc0f49, all green)

Every workflow step succeeded. The load-bearing steps:

| Step | Proves | Result |
|---|---|---|
| Build acceptance DB schema from datamodel | isolated schema, no migration introduced | ✅ |
| Seed permission catalog + WSI viewer fixture | scoped non-super viewer (`record:view`+`record:change`+`wsi:view`) + a slide with a sealed+verified PUBLISHED generation + a minimal **real DZI** derivative set (descriptor + manifest + tile pyramid) | ✅ |
| Build web (production; proxy → isolated API) | production build clean | ✅ |
| Start isolated API :4001 / web :3001 / proxy readiness | fail-closed readiness (real HTTP, not "not 000") | ✅ |
| **P5-4 — Playwright authenticated viewer acceptance** | the gate (see §2) | ✅ |

The stack is fully isolated (Postgres 16 `cytolab_accept_test`, schema-from-datamodel, seeded fixtures,
production web build proxied to a `ts-node` API), driven by a **real cookie login** as the scoped
non-super viewer — never a superuser, no injected state.

---

## 2. Acceptance scope (what the gate verified)

A single behaviour-oriented Playwright spec (`apps/web/acceptance/wsi-viewer.spec.ts`) asserting the full
P5-4 Phase-A contract against real backend truth:

- The DZI **descriptor** and **every tile** are requested from `/api/v1/wsi/delivery/*` carrying
  `Authorization: Bearer <token>`; the token never appears in a URL/query string.
- **No raw `slideUrl` / external-origin pixel request** occurs (only same-origin delivery bytes; the sole
  permitted cross-origin fetch is OSD's UI-sprite chrome, never pixels).
- A **real, nonblank canvas region renders** through the authenticated tile pipeline.
- The **annotation overlay + add-annotation interaction** survive the transport rewrite.

---

## 3. What Phase A delivered (accepted at 9fc0f49 — 14 files)

- **Transport:** `apps/web/src/lib/wsi-delivery.ts` (in-memory delivery-session client; Bearer descriptor
  fetch; `tileUrl`; token never persisted/logged) + `apps/web/src/components/WSIViewer.tsx` (custom
  OpenSeadragon tile source, `loadTilesWithAjax` + `ajaxHeaders` Bearer, token-refresh on 401/403, truthful
  empty state; annotations preserved) + `apps/web/src/app/(app)/wsi/[slideId]/page.tsx` (passes `slideId`).
- **Permission:** `wsi:view` granted to the existing slide-viewer roles (Authorizers, Pathologist, Lab
  Technician — the roles already holding `record:view`) via `apps/api/prisma/seed.ts` + a timestamped,
  idempotent migration; `wsi:review`/`wsi:publish` remain granted to no default role. Invariant updated in
  `apps/api/src/modules/wsi/review/slide-review.authz.spec.ts`.
- **Gate:** seeder + spec + config + setup + CI workflow under `apps/web/acceptance/**`,
  `apps/api/scripts/seed-wsi-viewer-acceptance.ts`, `.github/workflows/wsi-viewer-acceptance.yml`.

---

## 4. Rollback boundaries

- P5-3C delivery internals were **not modified** (the gate demonstrated no incompatibility).
- The viewer/client changes are additive and revertable per file; `git revert 9fc0f49` restores the prior
  raw-`slideUrl` transport.
- The `wsi:view` grant migration has a tested rollback (`ROLLBACK.sql`) with an explicit, documented
  provenance precondition (no pre-migration `wsi:view` on the three roles — verified from the seed history).

---

## 5. Deferred to Phase B (NOT in scope here)

- Retire the paste-`slideUrl` path: remove `AddSlideModal`'s URL field, `CreateSlideDto.slideUrl`, the
  persisted/returned `slideUrl`, and the `DigitalSlide.slideUrl` type — **only after** building the real
  ingestion UI against the existing chunked-upload API (`POST /wsi/records/:id/slide-uploads → /chunks →
  /complete`), which **does not yet exist** in the web app.
- Back-compat disposition for legacy paste-URL slides (no generation → unviewable via delivery; the truthful
  empty state already covers display).

---

## 6. Registration note

`wsi-viewer-acceptance.yml` was added to the default branch `main` as a single-file additive commit
(`41f9b70`) solely so GitHub could register/dispatch the `workflow_dispatch` gate; no Phase A product code
was merged to `main`. The `p5-6.4-accepted` tag (`145b689`) is unchanged.
