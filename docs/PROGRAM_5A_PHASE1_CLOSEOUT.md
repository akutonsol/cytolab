# Program 5A · Phase 1 — Validation & Closeout (P5-9)

**This is Program 5A / Phase 1 closeout — NOT full Program 5 closeout.** Full Program 5 additionally
requires **Program 5B** (automated ingestion) and **Program 5C** (scanner & DICOM WSI), both of which
remain **future work**.

**Status:** **ACCEPTED / FROZEN.** All canonical §13 Program-5A checkpoints (P5-0 → P5-8) are implemented,
independently frozen, and re-validated GREEN at one final closeout head; the §15 completion criteria are
satisfied; the legacy-URL and retention/deletion policies are ratified; and the retired paste-URL creation
path is authoritatively CI-protected.

- **Final validated closeout head:** `<CLOSEOUT_HEAD>`
- **Tags:** `p5-9-accepted` and `program-5a-phase1-accepted` → `<CLOSEOUT_HEAD>`
- **P5-9 scope:** CI/governance/documentation only. **No product code, no schema, no migration.**

## 1. Scope
P5-9 (§13:229 "Phase-1 validation & closeout") closes Program 5A: it validates the accepted checkpoint set
at one head, ratifies the outstanding §15/§16 policies, wires the retired paste-URL path to authoritative
CI, hardens the render-gate acceptance login, and reconciles the Program-5A documentation record — without
altering any product behaviour or historical provenance.

## 2. Canonical checkpoint inventory (accepted tags/SHAs)
| Checkpoint | Deliverable | Accepted tag / evidence |
|---|---|---|
| P5-0 | Architecture & domain design | 5A closeout (`31f18db`) |
| P5-1 | Domain model & migration | 5A closeout (`33af1d4`) |
| P5-2 | Lifecycle, provenance & generation integrity | 5A closeout (P5-3B chain) |
| P5-2R | Clinical review & controlled publication | `p5-6.4-accepted` → `145b689` |
| P5-3A | Upload orchestration & private storage | 5A closeout (`c7fd09b`) |
| P5-3B | Tiling worker & sealed generations | 5A closeout (`a39faa8..b431df6`) |
| P5-3C | Authenticated tile-delivery & storage boundary | 5A closeout, gate `9563737` |
| P5-4 | Viewer on real tiles / retire paste-URL | `p5-4-phase-a/b-part1/b-part2-accepted` → `9fc0f49` / `a73090c` / `5391293` |
| P5-5 | Metadata & indexing (search) | `p5-5-accepted` → `b911def` |
| P5-6 | Multi-slide orchestration | `p5-6-accepted` → `2094003` |
| P5-7 | Case & specimen integration | `p5-7-accepted` → `a1b11ee` |
| P5-8 | Asset-graph search & navigation | `p5-8-accepted` → `c360a19` |
| P5-9 | Phase-1 validation & closeout | `p5-9-accepted` → `<CLOSEOUT_HEAD>` |

All prior tags are immutable and unchanged by P5-9.

## 3. Final validation matrix — authoritative CI at head `<CLOSEOUT_HEAD>`
Fresh same-head runs (not historical evidence):

| Gate | Workflow | Run | Result |
|---|---|---|---|
| P5-3C delivery E2E | `wsi-delivery-e2e` | `<RUN_P53C>` | `<R>` |
| P5-2R review/publication | `wsi-review-acceptance` | `<RUN_P52R>` | `<R>` |
| P5-4 viewer/delivery | `wsi-viewer-acceptance` | `<RUN_P54V>` | `<R>` |
| P5-4 worker upload→publish→render + 403 | `wsi-upload-acceptance` | `<RUN_P54W>` | `<R>` |
| P5-5 search | `wsi-search-acceptance` | `<RUN_P55>` | `<R>` |
| P5-6 orchestration | `wsi-orchestration-acceptance` | `<RUN_P56>` | `<R>` |
| P5-7 specimen integration | `wsi-specimen-acceptance` | `<RUN_P57>` | `<R>` |
| P5-8 graph/navigation | `wsi-graph-acceptance` | `<RUN_P58>` | `<R>` |
| No-paste static gate | `wsi-no-paste-gate` | `<RUN_NOPASTE>` | `<R>` |

## 4. §15 completion-criteria matrix
| §15 criterion | Evidence | Status |
|---|---|---|
| SVS/NDPI/TIFF uploaded through the platform | P5-3A + P5-4 B1; `wsi-upload-acceptance` | ✅ |
| Source private + integrity-verified (`sourceChecksum`) | P5-3A; upload gate | ✅ |
| Sealed derivative pyramid (`derivativeManifestChecksum` verified) | P5-3B; upload gate | ✅ |
| OpenSeadragon consumes the pyramid | P5-4; `wsi-viewer-acceptance` | ✅ |
| Tile access authorized + tenant-safe (§12) | P5-3C; `wsi-delivery-e2e` | ✅ |
| Structured metadata persisted + searchable | P5-1 + P5-5; `wsi-search-acceptance` | ✅ |
| Specimen linkage + record rollup enforced | P5-7; `wsi-specimen-acceptance` | ✅ |
| Multi-slide workflows function | P5-6; `wsi-orchestration-acceptance` | ✅ |
| Lifecycle/audit/entitlement/provenance tested | P5-2/P5-3B + `wsi-review-acceptance` | ✅ |
| Legacy external-URL explicit migration/deprecation policy | §7 below (ratified) | ✅ |
| No AI inference capability introduced | §6 below | ✅ |

**§15 completion: 11 / 11.**

## 5. Security / clinical invariants (preserved)
Tenant isolation; record/specimen truth; per-slide viewability bound to a published generation; publication
authorization; **review (`wsi:review`) vs delivery (`wsi:view`) separation**; append-only verification/
publication provenance; **no storage-key / `slideUrl` authority**; no diagnostic/AI claims beyond
owner-recorded data. No unresolved clinical-truthfulness or authorization blocker.

## 6. AI-inference statement (§15)
Program 5A introduced **no AI inference capability**. The sign-out workspace's "AI screening evidence" and
"AI draft" panels are **read-only projections of externally-recorded results** owned elsewhere; nothing in
the WSI pipeline (ingestion, tiling, generation, delivery, review, search, orchestration, specimen, graph)
performs or introduces automated diagnosis or inference.

## 7. Legacy external-URL policy (ratified)
Historical external-URL-only `DigitalSlide` records are:
- **retained**; **discoverable/listable** under existing authorization; **non-viewable** when they have no
  authoritative published generation; **not** automatically migrated; **not** automatically re-ingested;
  **not** deleted merely because paste-URL creation was retired.

To make a historical URL-only slide viewable under the current architecture, its source must be **manually
re-ingested through the supported upload/ingestion pipeline** and proceed through the normal
processing → review → publication lifecycle. **Bulk migration/re-ingestion is deferred** to a separately
governed future effort. **P5-9 mutates no historical data.** The retired paste-URL *creation* path is
CI-protected by the `wsi-no-paste-gate` static gate; the read path and the retained `DigitalSlide.slideUrl`
DB column are intentionally preserved.

## 8. Retention/deletion policy (ratified — Phase-1, conservative)
Phase-1 principle: **preserve clinical provenance and source/derivative evidence rather than destructively
deleting it without an explicitly ratified lifecycle policy.**
- Retained: source uploads; ingestion/integrity evidence; sealed/verified derivative generations;
  publication/verification provenance; annotations and existing clinical evidence (under their existing
  persistence rules); historical URL-only rows.
- P5-9 introduces **no automatic clinical WSI deletion** and **no destructive cleanup job**.
- Deferred to a separately governed future phase: deletion/retention automation, **legal retention periods**
  (none are asserted here), archival tiers, and production lifecycle policies requiring operational/legal
  decisions. This document asserts **no regulatory retention period**.

## 9. Release / operations requirements
- **Env:** `DATABASE_URL` (+ `DATABASE_MIGRATION_URL`); `JWT_*` / `JWT_PORTAL_*` / `ENCRYPTION_KEY`;
  `WSI_DERIVATIVE_STORE_DIR` (+ source/materialization dirs); `WSI_PROCESSING_WORKER` (worker enable);
  `WSI_TILING_ENGINE=libvips`; cookie/origin/CORS settings.
- **Worker + libvips:** the tiling worker (OpenSlide + libvips → DZI) must be enabled and libvips present
  for real ingestion→publish→render; the app degrades truthfully (non-viewable) without a published gen.
- **Migrations:** apply via `prisma migrate deploy` (the P5-1 asset-model migration + P5-5
  `DigitalSlide[labId,uploadedAt]` index). **`prisma db push` is banned.** No P5-9 migration.
- **Rollback:** each checkpoint is `git revert`-able; the P5-5 index is a pure `CREATE INDEX`
  (`DROP INDEX` to revert); no destructive data change anywhere in 5A.
- **Initial production data state:** legacy external-URL rows retained + non-viewable (§7).
- **Monitoring/logging:** audit (PHI read/list), realtime, and generation verification/publication logs
  already emit; ensure log capture in production.

## 10. Known limitations
- Single-image upload computes the SHA over the whole file (streaming SHA-256 for very large uploads is
  deferred hardening).
- No bulk legacy-URL re-ingestion (manual re-ingestion only; §7).
- No DICOM/scanner ingestion (Program 5C); no automated watch-folder ingestion (Program 5B).
- No AI/diagnostic inference (by design).
- Production provisioning/lifecycle (buckets, IAM, retention automation) is Program 9 / future-governed.

## 11. Deferred findings & ownership
| Finding | Disposition | Owner/phase |
|---|---|---|
| Streaming SHA-256 (large uploads) | Independent hardening, deferred | Future hardening |
| Historical bulk URL re-ingestion | Deferred (policy §7) | Separately governed effort |
| Patient-identity WIP | Unrelated to Program 5 | Its own track |
| DICOM / scanner integration | Program 5C | 5C |
| Automated watch-folder ingestion | Program 5B | 5B |
| `SpecimenImage` revival | Out of scope / deferred | Future |
| Part/block hierarchy | Deferred (§16) | Future |
| Generic graph explorer / recursive traversal | Deliberately excluded (P5-8) | N/A |
| New graph/specimen permissions | Deliberately excluded | N/A |
| Retention/deletion automation & legal periods | Deferred (§8) | Separately governed |

## 12. Provenance & governance
- P5-9 is **CI/governance/documentation only** — no product code, schema, or migration.
- The only `main` change is the single additive `wsi-no-paste-gate.yml` workflow registration (governed
  single-file pattern); no product code on `main`.
- All prior accepted tags (`p5-4-*`, `p5-5-accepted`, `p5-6-accepted`, `p5-6.4-accepted`, `p5-7-accepted`,
  `p5-8-accepted`) are intact and unmoved.

---

**PROGRAM 5A / PHASE 1 COMPLETE.** Program 5B and Program 5C remain future work.
