# Program 5B · Stage B4 — Exception & Reconciliation Workflows — Acceptance Closeout

**Status:** **ACCEPTED / FROZEN.** The human-resolution half of the automated intake pipeline is proven end to
end against persisted DB truth, with the real processing worker + real libvips: an operator resolves, retries,
acknowledges, or dismisses each classified intake exception (`UNMATCHED` / `AMBIGUOUS` / `DUPLICATE` / `FAILED`)
through the **accepted 5A/B2 ingestion pipeline** — no second intake or tiling path — and reconciliation **never
publishes** (ingest outcomes reach READY/unpublished; publication stays the human `wsi:publish` boundary).

- **Accepted head (frozen):** `fe96ce6` · **Tag:** `p5b-b4-accepted` → `fe96ce6`
- **Provenance:** `b461342` = B1 (persistence & contracts); `3b5348a`/`6efd9de` = B2 (watch-folder → accepted
  handoff, `p5b-b2-accepted`); `843f110` = B3 (duplicate-provenance hardening); `fe96ce6` = **B4 product +
  acceptance** (reconciliation service/controller/DTOs/UI + the extended DB-truth gate).
- **Zero schema migration in B4** — B1 already provisioned `reconciledById` / `reconciliationAction` /
  `reconciledAt` / `retryCount` / `failureReason` / `matchEvidence` / `resultingSlideId`/`resultingIngestionId`
  and the `RECONCILED` state; concurrency uses the existing `status` column as the compare-and-set token.
- **New permission (seed only, not schema):** `wsi:reconcile`, granted to **NO default role**.
- Preserves all Program 5A tags and `p5b-b2-accepted` → `6efd9de` unchanged.

## 1. What B4 delivered (on the B1 contracts; one pipeline, human resolution)
- **Permission** (`prisma/seed.ts`): `wsi:reconcile` added to the WSI catalog. Granted to no default role
  (`byPrefix(['wsi'],['view'])` excludes it); super-roles reach it via the guard bypass. Deliberately **not**
  `record:change` / `wsi:view` / `wsi:review` / `wsi:publish`, and **not** `system:ingestion` (reserved for B5).
- **Read surface** (`reconciliation.service.ts` `queue()` + `reconciliation.controller.ts` `GET
  /wsi/reconciliation`): tenant-scoped exception queue over the four exception states with server-side
  filter/sort/pagination + a bounded per-status backlog summary. Safe projection only — no root paths, absolute
  paths, object-store keys, credentials, or delivery tokens.
- **Enumerated actions** (no generic transition endpoint): `RESOLVE_TO_RECORD` (UNMATCHED/AMBIGUOUS; AMBIGUOUS
  constrained to the exact persisted candidate set; same-tenant record required), `ACKNOWLEDGE_DUPLICATE`
  (DUPLICATE → RECONCILED, no slide, `duplicateOf` retained), `RETRY` (FAILED, retryable only), `DISMISS`.
- **Compare-and-set** — every mutation is a status-guarded `updateMany({ where:{ id, status:<eligible> } })`;
  the first operator to flip a row out of its exception state wins, a concurrent/stale attempt matches 0 rows →
  `409`, and only the winner reaches the accepted handoff. No version column added or needed.
- **`RECONCILED` semantics** — human-closed **without** ingestion (dismiss / acknowledge). A resolve/retry that
  ingests ends truthfully **INGESTED** with resulting ids (the reconciliation audit fields are also persisted);
  `RECONCILED` never means processed/READY/published/viewable. Status is never overloaded.
- **Retry safety** — retryable only when a match + checksum are already persisted (post-match transient). Retry
  reconstructs the path from trusted `source.rootPath + sourceRef`, re-applies root confinement
  (`isWithinRoot`/realpath), re-hashes, and **refuses changed bytes** vs the persisted checksum. Idempotent: a
  second/stale retry after success matches 0 rows → 409, no second slide. No automatic retry scheduler.
- **Accepted-pipeline reuse** — any ingesting action goes through the B2 composer → accepted
  `SlideIngestionService` (server-owned WATCH_FOLDER, checksum re-verified) → accepted processing queue. No
  second ingestion/tiling path; no direct generation creation; **no auto-publication**.
- **Audit** — `reconciledById`/`reconciliationAction`/`reconciledAt` are the authoritative attribution
  (controller binds the authenticated principal, never the body); a best-effort `AuditRecorder` event is a
  supplementary trail that never fails the mutation.
- **UI** (`operations/reconciliation`): the smallest operator queue, gated on `wsi:reconcile`, with enumerated
  action controls + confirmations + truthful post-action state. No source configuration (that is B5).

## 2. Authoritative CI evidence — GREEN at head `fe96ce6`
`wsi-auto-ingestion-acceptance` **run `30308518982` #2** — `workflow_dispatch` against `feat/legacy-etl`
(head `fe96ce6`), isolated Postgres, **workers ON** (`WSI_PROCESSING_WORKER=true` + `WSI_WATCH_FOLDER=true`) +
**real libvips**. The registered workflow YAML is byte-identical to `main`; only the invoked scripts carry the
B3+B4 extensions. The DB-truth assertion step (`assert-wsi-autoingest-state.ts`, which exits non-zero on any
failed check) passed, printing:

```
stabIngested=true winner=cms3rjgb50005e9pasvshllf8 gen=READY
B4 reconciliation: dup=RECONCILED amb=INGESTED unmatched=INGESTED retry=INGESTED ready=3/3
P5B-B2/B4 AUTO-INGEST + RECONCILIATION ACCEPTANCE: all persisted-truth assertions passed.
```

Against persisted state, the run drives the **real `ReconciliationService`** (via a lab-scoped DI context; the
primary API's workers tile the reconciled slides) and asserts:

- **Queue truth** — the queue returns only the four exception states, tenant-scoped (no Lab-B rows for a Lab-A
  operator).
- **Tenant isolation** — a Lab-B operator cannot act on a Lab-A discovery (fails closed via the tenancy
  extension; the row is not mutated).
- **DUPLICATE acknowledge + concurrency** — two parallel acknowledges → exactly one winner + one 409; result
  `RECONCILED`, attributed, **no slide/ingestion**, `duplicateOf` retained, no second VERIFIED ingestion of the
  bytes.
- **AMBIGUOUS** — a non-candidate record is rejected with the row unmutated; a valid candidate resolves →
  accepted handoff → **INGESTED**, attributed, one slide.
- **UNMATCHED** — resolve into a chosen same-lab record → accepted WATCH_FOLDER handoff → **INGESTED**, one
  slide + one VERIFIED ingestion.
- **FAILED retry** — a seeded retryable failure ingests once (path reconstructed + confined + checksum
  re-verified); a second/stale retry is refused (CAS) with **no second slide**.
- **Publication boundary** — the three reconciled/ingested slides reached **READY** via the accepted worker
  (`ready=3/3`) yet remain **DRAFT / `publishedGenerationId=null`**, no PUBLISHED generation.
- **B2/B3 preserved in the same run** — watch-folder discovery, stability (`stabIngested=true`), SHA-256 dedup
  (one INGESTED + one DUPLICATE), exact accession matching, B3 `duplicateOf` provenance, WATCH_FOLDER
  server-owned ingestion, and the 5A processing path to READY-not-PUBLISHED.

**Permission / 403 boundary** is proven at the same head by the real-`PermissionsGuard` authz spec
(`reconciliation.authz.spec.ts`): every route requires exactly `[wsi:reconcile]`; empty set / `record:change` /
`wsi:view+review+publish` / `system:ingestion` all yield a genuine `ForbiddenException` (→ HTTP 403); super-role
allowed; and the seed's own `buildRoleDefs` grants `wsi:reconcile` to no default role. The guard is a controller
concern, so it is asserted deterministically at the wiring/guard layer rather than re-exercised over HTTP in the
DB-truth gate. Real-Postgres CAS concurrency is additionally proven by `reconciliation.cas.integration.spec.ts`.

## 3. Whole-of-B4 assessment
The canonical Program 5B requirement — **exception & reconciliation workflows** — is delivered: the four
automated exception classifications each have an enumerated, tenant-scoped, audited, concurrency-safe human
resolution that reuses the accepted ingestion pipeline and never bypasses publication authority. Reconciliation
adds no second intake/tiling path, fabricates no clinical association, and confers no `wsi:publish`. **B4
COMPLETE.**

## 4. Registration & rollback boundaries
- Product code is branch-only; **no product code on `main`**. **No workflow YAML change** — the already-
  registered `wsi-auto-ingestion-acceptance.yml` (`da47426` on `main`) ran the B4 acceptance unchanged (the
  acceptance extensions live in the branch-side seed/assertion scripts it already invokes).
- B4 is code + seed only, **no migration**; `git revert fe96ce6` removes the reconciliation surface. The new
  `wsi:reconcile` permission is granted to no default role, so no principal gains reconciliation authority until
  it is explicitly assigned.

## 5. Deferred (later Program 5B / 5C — not begun)
- **B5** — source-management/admin surface + the recommended narrow `system:ingestion` permission
  (enabled/disabled source administration, source health/configuration), operational monitoring/dashboarding.
- **B6** — Program 5B closeout.
- **Program 5C** — scanner adapters, DICOM WSI/DICOMweb, scanner health, conformance.
- Deliberately out of B4: **force-reingest of a DUPLICATE** (a separate higher-risk decision); a full
  record-search picker for UNMATCHED resolution (the current control takes an explicit record id, backend-validated).
