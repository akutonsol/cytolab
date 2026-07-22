# Osieri — Digital Pathology Architecture & Phased Roadmap

**Program:** 5 — Digital Pathology · **Checkpoint:** P5-0 (Architecture & Domain Design).
**Status:** Approved architecture record (docs-only). Establishes the governing scope, domain model,
integrity/security/lifecycle models, and the phased roadmap for Programs 5A–5C. **No code, schema,
Terraform, or application change is authorized by this document.**
**Prime directive:** *extend, do not replace.* A working WSI vertical already ships; Program 5 evolves
it to enterprise-grade while preserving it.
**Companion docs:** `PROGRAM_4_DEFERRED_ITEM_REGISTER.md` (Program 5/9 boundary), `docs/deploy/*`.
**Owner:** Osieri Engineering (unassigned).

---

## 1. Current-state inventory (what already exists)

Digital pathology is **not greenfield**. The following ships today and is the foundation to build on:

| Component | Location | State |
|---|---|---|
| `DigitalSlide` model | `schema.prisma:2690` | Real — record-anchored, tenant-scoped, `uploadedBy/uploadedAt`, `format` default `image` |
| `SlideAnnotation` model | `schema.prisma:2719` | Real — normalized 0–1 image coords, tenant-scoped |
| OpenSeadragon 5 viewer | `apps/web/src/components/WSIViewer.tsx` | Production-functional — pan/zoom/navigator + SVG annotation overlay reprojected per viewport event |
| WSI REST surface | `apps/api/src/modules/wsi/wsi.controller.ts` | Real — list, summary, per-record, create, annotation CRUD, PHI-audited detail, delete |
| Case-workspace seam | `WsiService.listByRecordMeta` → diagnostic-case `SlidesSubArea`, sign-out `SlidesPanel` | Real — metadata-only seam; viewer is sole owner of image bytes |
| Audit wiring | `wsi.service.ts` injects `AuditRecorder`; `recordPhiRead/List` with `resource.type:'DigitalSlide'/'SlideList'` | Real |
| Tenancy | `labId` on every model; writes via `tenantCreate<>` | Real |
| Feature tier | `WSI_VIEWER` = Tier 5 Enterprise (`features.ts`, `feature-catalog.ts`, `FeatureKey.WSI_VIEWER`), built + enabled | Real (nav-gated) |

**Leave alone:** the marketing prop `apps/web/src/components/experience/SlideViewer.tsx` (landing
scope-lock); the dead `SpecimenImage` stub (`schema.prisma:1450`, never referenced — **extend
`DigitalSlide`, do not revive it**); `AI_SCREENING` (intentionally contained/forced-off).

## 2. Gaps (the genuine Program 5A work)

| Gap | Today | Enterprise target |
|---|---|---|
| Ingestion | `AddSlideModal` = paste an external URL; no file upload | In-platform upload of gigapixel slides |
| Tiling | None; SVS/NDPI/TIFF unusable unless pre-tiled off-platform | Server-side, vendor-neutral pyramid generation |
| Storage/serving | Browser fetches an arbitrary external URL (CORS, **no access control**) | Private in-platform storage + **authenticated** tile delivery |
| Metadata | free-text `magnification/scanner`; no MPP, dimensions, tile-source, checksum, DICOM UIDs | Structured, indexed slide metadata |
| Hierarchy | slide → **Record** only (no `specimenId`) | case → specimen → slide (block/part later) |
| Lifecycle/provenance | none | Explicit state machine + sealed derivative generations |
| DICOM WSI | absent | DICOMweb (Program 5C) |

## 3. Objective

> Evolve the existing record-anchored WSI vertical into an **enterprise-grade digital pathology
> platform** — in-platform ingestion, private storage, vendor-neutral tiling, structured provenance,
> specimen/case integration, and search — while **preserving** the working viewer, annotation model,
> audit, tenancy, and Tier-5 entitlement. **No AI diagnosis or inference.**

## 4. Boundaries

**In scope (across 5A–5C):** slide asset lifecycle & provenance; ingestion (manual → watch-folder →
scanner/DICOM); vendor-neutral tiling; private storage + authenticated tile serving; structured
metadata & indexing; multi-slide viewer orchestration; specimen↔slide linkage; audit/authz/search/
feature-tier integration.
**Out of scope:** AI diagnosis/inference (later AI program); rewriting the viewer; reviving
`SpecimenImage`; the marketing slide prop; unrelated workflow expansion; **live production provisioning
of any new infrastructure** (Program 9).

## 5. Preserved components (must not regress)

`DigitalSlide`, `SlideAnnotation`, `WSIViewer.tsx` (OpenSeadragon), the `wsi` REST surface, the
`listByRecordMeta` metadata seam and its diagnostic-case/sign-out consumers, existing PHI-read audit,
tenancy (`labId`), and the `WSI_VIEWER` Tier-5 entitlement.

## 6. Domain model (extend, do not replace)

The **logical slide** (`DigitalSlide`) is distinct from its **processing attempts** and **generated
derivatives**. The architecture distinguishes these responsibilities (not all necessarily separate
tables in P5-1, but the seams must exist):

- **`DigitalSlide`** — the logical slide. Extend with: `specimenId` (nullable — see §8); structured
  `dimensionsX/Y`, `mpp` (microns/pixel), `objectivePower`; `tileSourceType` (`IMAGE | DZI | IIIF |
  DICOMWEB`); in-platform `storageKey` alongside the legacy external `slideUrl`; `sourceKind`
  (`external_url | upload | watch_folder | scanner | dicom`); `lifecycleStatus` (§9);
  `publishedGenerationId` (points at the sealed derivative generation currently served); optional
  `thumbnailKey/labelKey/macroKey`; DICOM UIDs (5C).
- **`SlideIngestion`** — one intake of a source object (who/what/when, `sourceKind`, `sourceChecksum`,
  original filename/size, tenant/record correlation).
- **`SlideProcessingJob`** — one tiling attempt (worker/service actor, status, timings, error).
- **`SlideDerivativeGeneration`** — one **immutable** complete tiling result: `derivativeGenerationId`,
  `tileSourceType`, dimensions/tile-size/levels, `derivativeManifestChecksum` (§7), sealed/verified
  flags. Publication references a sealed generation; a new attempt creates a **new** generation.
- **`SlideAsset`** — an individual generated object (tile pyramid descriptor, tiles, label, macro,
  thumbnail), each with a storage key and optional per-asset checksum.

Also: a `slide` concept for authorization (policy, not necessarily a persisted ACL — §10); new
`FeatureKey`s only if ingestion/DICOM are separately entitled; new registry-backed audit actions (§11).

## 7. Derivative-generation integrity model

Carries forward the **R-016b principle: fingerprint the whole generation, not a convenient edge file.**
A single slide checksum is insufficient. The model distinguishes:

- **`sourceChecksum`** — hash of the original uploaded file (integrity of intake).
- **`derivativeGenerationId`** — immutable identity for one complete tiling attempt.
- **`derivativeManifestChecksum`** — a fingerprint covering the **entire** generated pyramid: the
  descriptor, the tile inventory, dimensions, tile size, level count, and all derivative assets
  (label/macro/thumbnail).
- **Optional per-asset checksums** where operationally useful.

**Governing rule:** *a tiled generation is not publishable until its entire derivative manifest has been
sealed and verified.* Publication binds `DigitalSlide.publishedGenerationId` to a sealed generation; a
failed or partial generation can never become the published one.

## 8. Hierarchy

**P5-1 target:**
```
Case / Record
    └── Specimen
          └── DigitalSlide
```
Rules: keep `recordId` as the **required** case/workflow rollup; add **nullable** `specimenId`; enforce
that a linked specimen belongs to the **same tenant and record**; allow legacy record-only slides while
migration is underway.

**Deferred (documented, non-destructive) future path** — do **not** encode P5-1 assumptions that would
make this destructive or require replacing the slide model:
```
Record
  └── Specimen
        └── Part / Block
              └── Slide
```

## 9. Lifecycle & provenance state machine

Explicitly separates **processing** from **clinical availability**. Starting model (names may be
refined in P5-1; the **rules** are binding):

```
UPLOADING → UPLOADED → PROCESSING → QC_PENDING → READY → PUBLISHED → ARCHIVED
                              │            └────────→ QC_FAILED
                              └──────────────────────→ FAILED
```

Rules:
- Upload completion ≠ tiling completion ≠ publication.
- Publication must reference a **sealed** derivative generation (§7).
- A failed/partial generation must **not** overwrite the last valid **published** generation.
- Retrying tiling creates a **new** generation (never mutates a prior one).
- Archival must **not** silently destroy provenance.
- Deletion and retention behavior are **separately governed** (not conflated with archival).
- The logical slide row persists across attempts; ingestions, jobs, and generations remain
  independently traceable.

## 10. Authorization policy

Access can no longer depend on navigation gating alone. **P5-1:**
- Add `@RequireFeature('WSI_VIEWER')` to the WSI API surface, alongside tenant + record authorization.
- Introduce a **centralized slide authorization policy/service** (a decision seam, **not** a second
  persisted ACL) that evaluates: tenant · feature entitlement · record permission · specimen
  relationship · slide **lifecycle status** · requested operation.

**Do NOT** introduce a persisted slide-permission/sharing object in P5-1. Record authorization remains
the primary source of truth. A persisted slide-sharing model is added **only** when a concrete use case
requires it — e.g.:
- slide-only external consultation;
- teaching-set access detached from the case;
- research de-identification;
- restricted slide access within an otherwise-visible case.

The centralized policy creates the architectural seam for granular authorization without prematurely
creating an ACL system that could drift from record permissions.

## 11. Audit model

Registry-backed action codes for meaningful slide events (added to `audit.registry.ts` ENTRIES +
CURRENT_VERSIONS):

`SLIDE_UPLOAD_INITIATED`, `SLIDE_UPLOADED`, `SLIDE_PROCESSING_STARTED`, `SLIDE_TILED`,
`SLIDE_QC_FAILED`, `SLIDE_PUBLISHED`, `SLIDE_ARCHIVED`, `SLIDE_VIEWED`, `SLIDE_ANNOTATION_CREATED`,
`SLIDE_ANNOTATION_UPDATED`, `SLIDE_ANNOTATION_DELETED`.

Rules:
- **Do not** emit user-originated audit semantics for background-worker actions. Processing events
  (`SLIDE_PROCESSING_STARTED/TILED/QC_FAILED`) identify the **system/service actor**.
- Correlate processing events to: ingestion · processing job · derivative generation · `sourceChecksum`
  · slide · record · tenant.
- Existing **PHI read auditing must remain intact** (`recordPhiRead/List`).

## 12. Authenticated tile-delivery model

**Rejected:** naïve per-tile GCS signed URLs as the primary architecture — a session may request
thousands of tiles; per-tile URL minting/refresh is brittle orchestration.

**Approved model:**
1. The user requests access to a slide.
2. The API performs tenant, record, authorization, entitlement, and **lifecycle** checks.
3. The API issues a **short-lived slide-view session/token** scoped to: tenant · user · slide ·
   **derivative generation** · permitted operations · expiration.
4. Tile requests flow through an **authenticated tile-delivery boundary**.
5. The underlying bucket remains **private**.

Initial implementation: an **authorization-aware tile proxy/gateway**. A later production optimization
may use Cloud CDN or equivalent signed-cookie/token delivery — but the **viewer-facing contract must not
depend on the infrastructure mechanism**.

The token authorizes **one immutable derivative generation**, not a mutable `DigitalSlide` row. The
boundary must prevent:
- changing a slide identifier while reusing another slide's token;
- accessing an unpublished or superseded derivative generation;
- cross-tenant tile access;
- access after the source record permission is revoked;
- unrestricted access to label, macro, or thumbnail derivatives.

## 13. Phased roadmap (Programs 5A–5C)

Program 5 is **not** complete after Phase 1. It comprises three programs; completion is declared only
after 5A–5C.

### Program 5A — Core Digital Pathology
| Checkpoint | Deliverable |
|---|---|
| **P5-0** | Architecture & domain design (this document) |
| **P5-1** | Domain model & migration (extend `DigitalSlide`, specimen link, structured metadata, lifecycle enum, integrity fields, authz-policy seam, audit codes) |
| **P5-2** | Lifecycle, provenance & generation integrity |
| **P5-3A** | Upload orchestration & private source-object storage |
| **P5-3B** | Vendor-neutral tiling worker & **sealed** derivative generations (OpenSlide + libvips → **DZI** canonical) |
| **P5-3C** | Authenticated tile-delivery session & private storage boundary |
| **P5-4** | Existing viewer integration on real in-platform tiles (preserve OpenSeadragon; retire paste-URL) |
| **P5-5** | Metadata & indexing (search over slides) |
| **P5-6** | Multi-slide orchestration (tray / side-by-side / synchronized viewports) |
| **P5-7** | Case & specimen integration (specimen-anchored slides in the workspaces) |
| **P5-8** | Asset-graph search & navigation |
| **P5-9** | **Phase 1** validation & closeout (not full Program 5 closeout) |

### Program 5B — Automated Ingestion
Watch-folder integration · ingestion deduplication · accession matching · exception & reconciliation
workflows · operational monitoring.

### Program 5C — Scanner & DICOM WSI
Vendor-neutral scanner adapters · DICOM WSI & DICOMweb (entering through the **same** `tileSourceType`
contract — no viewer rewrite) · scanner health · enterprise import monitoring · conformance &
interoperability validation.

### Tiling/format strategy (canonical)
Phase 1 canonical generated pyramid = **DZI** (integrates directly with the existing OpenSeadragon
viewer). The tile-source abstraction supports `IMAGE | DZI | IIIF | DICOMWEB`, but **do not generate
both DZI and IIIF by default** absent a real interoperability requirement. DICOM WSI is Program 5C via
the same contract.

## 14. Program 5 / Program 9 infrastructure boundary (ratified)

| Program 5 owns | Program 9 owns |
|---|---|
| Application architecture; ingestion orchestration; tiling **worker code**; storage interfaces; tile-delivery interfaces; **Terraform definitions** (gated, unapplied); tests; **non-production** validation; operational documentation | **Production** bucket provisioning; production worker provisioning; production service identities & IAM; production lifecycle policies; production DICOM store (when applicable); secret population; cost approval; production apply & cutover |

- **No Program 5 phase may provision production infrastructure merely to prove the design.**
- Non-production resources also require **explicit authorization, named environment scope, and cost
  awareness** — never created implicitly.

## 15. Acceptance criteria — **Program 5A** completion (not full Program 5)

Program 5A is complete when:
- SVS/NDPI/TIFF can be **uploaded through the platform**;
- the original source object is **private and integrity-verified** (`sourceChecksum`);
- a **sealed derivative pyramid** is generated (`derivativeManifestChecksum` verified);
- the existing OpenSeadragon viewer consumes that pyramid;
- tile access is **authorized and tenant-safe** (per §12);
- structured metadata is persisted and **searchable**;
- **specimen linkage and record rollup** are enforced;
- **multi-slide** workflows function;
- lifecycle, audit, entitlement, and provenance controls are **tested**;
- legacy external-URL behavior has an **explicit migration/deprecation policy**;
- **no AI inference capability** has been introduced.

Full **Program 5** is complete only after **5A + 5B + 5C**.

## 16. Explicitly deferred decisions

- Full **part/block hierarchy** (§8) — deferred until a concrete workflow requires it; the P5-1 model
  must not preclude it.
- **Persisted slide-permission/sharing ACL** (§10) — deferred until a real use case (external
  consultation / teaching set / research de-id / restricted-within-visible-case) requires it.
- **IIIF** derivative generation — deferred unless a real interoperability requirement justifies the
  extra storage/processing (§13).
- **DICOM WSI / DICOMweb** and **scanner integrations** — Program 5C.
- **Cloud CDN / signed-cookie** delivery optimization — a later production optimization behind the same
  viewer-facing contract (§12).
- **Retention/deletion policy** specifics — governed separately from archival (§9); ratify in 5A.
- All **production provisioning** — Program 9 (§14).
