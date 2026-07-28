# Program 5B — Automated Ingestion — PROGRAM CLOSEOUT

**Status:** **COMPLETE / CLOSED.** All five canonical Program 5B capabilities are delivered and independently
accepted against persisted DB truth in authoritative CI. This document reconciles the full accepted chain; it
introduces no product capability.

## Canonical requirement (governing language)
Per §13 ([OSIERI_DIGITAL_PATHOLOGY_ARCHITECTURE.md:231-233](OSIERI_DIGITAL_PATHOLOGY_ARCHITECTURE.md#L231)):

> **Program 5B — Automated Ingestion.** Watch-folder integration · ingestion deduplication · accession matching ·
> exception & reconciliation workflows · operational monitoring.

## Accepted implementation lineage
| Stage | Capability | Head | Tag / closeout |
|---|---|---|---|
| **B1** | pre-ingestion persistence & contracts (IngestionSource / IngestionDiscovery / resolver / dedup / composer seam) | `b461342` | — |
| **B2** | server-owned watch-folder discovery → stability → accepted 5A handoff | `6efd9de` | `p5b-b2-accepted` · `docs/PROGRAM_5B_B2_CLOSEOUT.md` |
| **B3** | duplicate provenance (`matchEvidence.duplicateOf`) | `843f110` | (folded into B4 acceptance) |
| **B4** | exception & reconciliation workflows (`wsi:reconcile`) | `fe96ce6` | `p5b-b4-accepted` · closeout `285bdf4` |
| **B5-a** | read-only operational monitoring | `f20d4a9` | `p5b-b5a-accepted` · closeout `884cee9` |

**Program-level accepted head (frozen): `f20d4a9`** — the final validated Program 5B implementation head
(B5-a), which builds on the full B1→B4 chain. **`p5b-accepted → f20d4a9`.**

### B1 — persistence & contracts
`IngestionSource` (labId-owned, FILESYSTEM, rootPath, matchConfig, enabled) + `IngestionDiscovery` (labId,
sourceId, sourceRef, sizeBytes, sourceChecksum, status, matchedRecordId/specimenId, matchEvidence,
resultingSlideId/IngestionId, reconciledById/Action/At, retryCount, failureReason). Idempotency DB-enforced by
`@@unique([labId, sourceId, sourceRef])`. `SlideSourceKind.WATCH_FOLDER` + `IngestionDiscoveryStatus` (incl.
`RECONCILED`) already provisioned — every later stage ran with **zero further migration**.

### B2 — automated watch-folder path
Config-gated poller (system-side enumerate → `runJob({labId})` per source) · realpath-confined scanner
(escaping symlinks/traversal fail-closed) · stability (size-stable + mtime-quiet) · streamed SHA-256 · exact
accession match (labNumber→identifier; unique only) · server-owned WATCH_FOLDER hand-off into the accepted 5A
`SlideIngestionService`. INGESTED only after the accepted service creates + verifies.

### B3 — duplicate provenance
On DUPLICATE, persists which prior authoritative object caused the verdict (`matchEvidence.duplicateOf`:
sourceType/priorIngestionId/priorSlideId/priorDiscoveryId). Byte-identity (SHA-256, lab-scoped) unchanged; no
clinical inheritance.

### B4 — exception & reconciliation workflows
New narrow `wsi:reconcile` (no default role). Tenant-scoped exception queue + enumerated actions (resolve /
acknowledge-duplicate / retry / dismiss) with a **status-column compare-and-set** (first operator wins; stale/
concurrent → 409). `RECONCILED` = human-closed without ingestion; a resolve/retry that ingests ends `INGESTED`.
Retry re-reads the confined source + re-verifies the persisted checksum (refuses changed bytes), idempotent.
Reuses the accepted pipeline; audited via reconciledBy/Action/At + best-effort AuditRecorder.

### B5-a — operational monitoring
Read-only `GET /wsi/ingestion/monitoring` (reuses `wsi:reconcile`). Aggregates persisted truth only —
`IngestionSource` (enabled/kind, never rootPath/matchConfig), `IngestionDiscovery` (per-status/backlog/
timestamps/failure reasons), `SlideProcessingJob` (WATCH_FOLDER-scoped), `DerivativeGeneration` (READY).
Deterministic facts only (ENABLED/DISABLED/HAS_BACKLOG); no fabricated scanner/poller health. Deep-links into
the B4 queue; never mutates.

## Authoritative CI evidence
Registered gate `wsi-auto-ingestion-acceptance` (workflow_dispatch; isolated Postgres; **workers ON** +
**real libvips**), DB-truth assertion (exits non-zero on any failed check):
- **B2 acceptance:** run `30296681882` #1 at `6efd9de` — GREEN.
- **B4 acceptance:** run `30308518982` #2 at `fe96ce6` — GREEN.
- **B5-a acceptance:** run `30310446106` #3 at `f20d4a9` — GREEN:
  `stabIngested=true … gen=READY` · `B4 reconciliation: dup=RECONCILED amb=INGESTED unmatched=INGESTED
  retry=INGESTED ready=3/3` · `B5a monitoring: sources=2 disc=6 backlog=0 ready=5 procDone=5` ·
  `P5B-B2/B4/B5a AUTO-INGEST + RECONCILIATION + MONITORING ACCEPTANCE: all persisted-truth assertions passed.`

Run #3 proves B5-a **and** re-proves B2/B3/B4 at the program head in one authoritative pass.

## Frozen tags
`p5b-b2-accepted → 6efd9de` · `p5b-b4-accepted → fe96ce6` · `p5b-b5a-accepted → f20d4a9` · **`p5b-accepted → f20d4a9`**.
All Program 5A tags preserved unchanged.

## Cross-cutting guarantees (held across B1–B5a)
- **Publication boundary:** the automated + reconciled path ends at **READY / unpublished**
  (`publishedGenerationId=null`, not PUBLISHED). No auto-publication; publication remains the human
  `wsi:publish` action. Monitoring reports READY as "unpublished" and never implies viewability.
- **Tenancy:** `labId` is authoritative from persisted source context / `LabContext` + the Prisma extension —
  never from filename/path/accession/request body. Cross-lab enumeration is system-worker-only; no operator API
  crosses labs. Proven both directions in CI.
- **Server-owned WATCH_FOLDER provenance:** `sourceKind='WATCH_FOLDER'` is set server-side; the public upload
  `@IsIn` whitelist is unchanged — a browser cannot spoof watch-folder provenance.
- **Accepted-pipeline reuse — one pipeline:** B2 hand-off and B4 resolve/retry both drive the accepted 5A
  `SlideIngestionService` (initiate → appendChunk → complete, checksum re-verified) + the accepted processing
  queue/worker. **There is no second ingestion path and no second processing/tiling path** — confirmed.

## Deliberately NOT required for canonical 5B completion
The following were assessed and **excluded** from canonical 5B; their absence does not make 5B incomplete:
- **B5-b source administration** (list/create/update/enable-disable/archive) — optional future operational/admin work.
- **`system:ingestion` permission** — deferred with B5-b (not introduced).
- **B5-c scanner/poller-liveness persistence** (`lastScanAt`/`lastScanError`, DEGRADED/ERROR health) — optional
  hardening requiring a migration; **Program 5C-adjacent** ("scanner health" is 5C language).
- **Scanner health** — Program 5C.
- **Force-reingest of a DUPLICATE** — a separate higher-risk decision, optional hardening.
- **Richer record-search for UNMATCHED reconciliation** — optional UX hardening (current control takes an
  explicit backend-validated record id).
- **Program 5C** (scanner adapters / DICOM WSI / DICOMweb / conformance) — the next program.

## Whole-of-Program-5B assessment
| Canonical capability | Status |
|---|---|
| Watch-folder integration | **COMPLETE** |
| Ingestion deduplication | **COMPLETE** |
| Accession matching | **COMPLETE** |
| Exception & reconciliation workflows | **COMPLETE** |
| Operational monitoring | **COMPLETE** |

**CANONICAL PROGRAM 5B COMPLETE.**

## Governance / rollback boundaries
- Product code is **branch-only** (`feat/legacy-etl`); **no Program 5B product code was merged to `main`**.
  The only 5B-related file on `main` is the dispatch-only gate `.github/workflows/wsi-auto-ingestion-acceptance.yml`
  (`da47426`) — CI registration, not product code.
- B1–B5a are code (+ B4's one seed permission) with **zero schema migration**. Each stage is independently
  revertible; the poller is default-off (`WSI_WATCH_FOLDER`), so accepted 5A behaviour is unchanged unless enabled.
