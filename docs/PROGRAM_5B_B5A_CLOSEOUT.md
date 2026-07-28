# Program 5B · Stage B5-a — Operational Monitoring — Acceptance Closeout

**Status:** **ACCEPTED / FROZEN.** The last canonical Program 5B capability — **operational monitoring** — is
delivered as a **read-only, tenant-scoped** aggregation over existing persisted truth and proven against
persisted DB state in authoritative CI. No schema migration, no new permission, no source administration.

- **Accepted head (frozen):** `f20d4a9` · **Tag:** `p5b-b5a-accepted` → `f20d4a9`
- **Provenance:** B1 `b461342` → B2 `p5b-b2-accepted → 6efd9de` → B3 `843f110` → B4 `p5b-b4-accepted → fe96ce6`
  → **B5-a `f20d4a9`** (read-only monitoring API + UI + acceptance).
- **Zero schema migration** (`schema.prisma` untouched; no migration added).
- **No new permission** — monitoring reuses the existing `wsi:reconcile`; `system:ingestion` was **not**
  introduced (source administration / `system:ingestion` remain deferred to B5-b, not authorized).
- Preserves all Program 5A tags, `p5b-b2-accepted → 6efd9de`, and `p5b-b4-accepted → fe96ce6` unchanged.

## 1. What B5-a delivered (read-only; persisted truth only)
- **API** `GET /wsi/ingestion/monitoring` (`ingestion-monitoring.controller.ts` / `.service.ts`, gated
  `wsi:reconcile`): returns `{ asOf, totals, sources[] }` derived entirely from existing rows —
  `IngestionSource` (enabled/kind only), `IngestionDiscovery` (per-status tallies, reconciliation backlog =
  UNMATCHED+AMBIGUOUS+DUPLICATE+FAILED, activity timestamps, persisted failure reasons), `SlideProcessingJob`
  (WATCH_FOLDER-scoped job tallies), `DerivativeGeneration` (READY on WATCH_FOLDER slides, mapped to source via
  INGESTED `resultingSlideId`).
- **Deterministic facts only** — `ENABLED` / `DISABLED` / `HAS_BACKLOG`. No fabricated scanner/poller liveness,
  no health score, no `DEGRADED`/`ERROR` (those are not persisted, so they are not claimed).
- **Infrastructure-safe projection** — `IngestionSource` selected with only `{id,kind,enabled}`; the response
  never contains `rootPath`, absolute paths, mount names, `matchConfig`, credentials, tokens, storage keys, or
  object-store/scanner config.
- **Read-only boundary** — exception counts **deep-link** into the B4 reconciliation queue; monitoring never
  resolves / acknowledges / retries / dismisses, and introduces no auto-publication or alternate pipeline.
- **UI** `operations/ingestion` (gated `wsi:reconcile`): totals cards (sources, reconciliation backlog →
  deep-link, processing, **READY (unpublished)**) + per-source rows with expandable per-status detail. No
  source-config forms, no enable/disable controls, no rootPath, no fake real-time/percentages; zero-orange.

## 2. Authoritative CI evidence — GREEN at head `f20d4a9`
`wsi-auto-ingestion-acceptance` **run `30310446106` #3** — `workflow_dispatch` against `feat/legacy-etl`
(head `f20d4a9`), isolated Postgres, **workers ON** + **real libvips**. The registered workflow YAML is
byte-identical to `main`; only the invoked seed/assert scripts carry the B5-a extension. The DB-truth
assertion step (exits non-zero on any failed check) passed, printing:

```
stabIngested=true winner=cms3smuso000511gsvq8k75jn gen=READY
B4 reconciliation: dup=RECONCILED amb=INGESTED unmatched=INGESTED retry=INGESTED ready=3/3
B5a monitoring: sources=2 disc=6 backlog=0 ready=5 procDone=5
P5B-B2/B4/B5a AUTO-INGEST + RECONCILIATION + MONITORING ACCEPTANCE: all persisted-truth assertions passed.
```

The B5-a section drives the **real `IngestionMonitoringService`** (lab-scoped) and asserts against an
independent raw groupBy of the same DB:
- **Monitoring counts == DB truth** — all nine discovery statuses (incl. STABILIZING/UNMATCHED/AMBIGUOUS/
  DUPLICATE/FAILED/INGESTED), reconciliation backlog, total discoveries.
- **Processing == DB truth** — WATCH_FOLDER `SlideProcessingJob` tallies (QUEUED/RUNNING/SUCCEEDED/FAILED/TIMED_OUT).
- **READY == DB truth** — READY generations on WATCH_FOLDER slides.
- **Enabled/disabled fact** — a seeded DISABLED Lab-A source reports `enabled:false` + `DISABLED`; the enabled
  source reports `ENABLED` (proven without any enable/disable mutation).
- **Tenant isolation** — Lab-A monitoring lists exactly its own sources (never the Lab-B source); Lab-B
  monitoring never lists a Lab-A source.
- **Security projection** — the serialized response contains no rootPath / filesystem path / `matchConfig` / secret.
- **READY-vs-PUBLISHED** — every READY WATCH_FOLDER slide counted has `publishedGenerationId=null` / not PUBLISHED.

**Authorization / 403** is proven at the same head by the real-`PermissionsGuard` authz spec
(`ingestion-monitoring.authz.spec.ts`): monitoring requires exactly `[wsi:reconcile]`; `record:view`/
`record:change`/`wsi:view`/`wsi:review`/`wsi:publish`/`system:ingestion` all yield `ForbiddenException` (→ 403);
super-role allowed; and `system:ingestion` is confirmed **absent** from the catalog (no new permission).

**B2/B3/B4 preserved in the same run** — watch-folder discovery + stability (`stabIngested=true`), SHA-256 dedup
+ B3 `duplicateOf` provenance, exact accession matching, accepted 5A handoff to READY-not-PUBLISHED, and the
full B4 reconciliation state machine (`dup=RECONCILED`, `amb/unmatched/retry=INGESTED`, `ready=3/3`).

## 3. Whole-of-Program-5B capability assessment
Against the canonical §13 five obligations, on accepted evidence only:

| Canonical 5B capability | Status | Accepted evidence |
|---|---|---|
| Watch-folder integration | **COMPLETE** | B2 `p5b-b2-accepted → 6efd9de` |
| Ingestion deduplication | **COMPLETE** | B2 (SHA-256 byte dedup) + B3 `duplicateOf` `843f110` |
| Accession matching | **COMPLETE** | B2 exact `AccessionMatchResolver` |
| Exception & reconciliation workflows | **COMPLETE** | B4 `p5b-b4-accepted → fe96ce6` |
| Operational monitoring | **COMPLETE** | B5-a `p5b-b5a-accepted → f20d4a9` |

**`CANONICAL PROGRAM 5B CAPABILITIES COMPLETE`** — all five delivered and independently accepted in
authoritative CI, without bypassing publication authority (the automated + reconciled path ends at
READY/unpublished; publication remains the human `wsi:publish` boundary).

## 4. Registration & rollback boundaries
- Product code is branch-only; **no product code on `main`**. **No workflow YAML change** — the registered
  `wsi-auto-ingestion-acceptance.yml` (`da47426` on `main`) ran B5-a unchanged (acceptance folded into the
  branch-side seed/assert scripts it already invokes).
- B5-a is code-only, **no migration, no seed/permission change**; `git revert f20d4a9` removes the monitoring
  surface with no residual schema/permission/state.

## 5. Remaining Program 5B scope — B6 (closeout only)
With all five canonical capabilities accepted, **B6 is a closeout/governance step, not feature development**:
- a Program-5B-level closeout document reconciling B1–B5a (accepted heads + tags + CI evidence);
- a program-level acceptance tag (e.g. `p5b-accepted`) at the final validated head;
- optional tag/branch reconciliation into `main`/dev-repo per governance.

## 6. Explicitly NOT done (deferred; not required for 5B completion)
- **B5-b** — source administration (list/create/update/enable-disable/archive) + the narrow `system:ingestion`
  permission + rootPath-visibility governance. **Not implemented** (non-canonical; separate authorization).
- **B5-c** — persisted scanner/poller liveness (`lastScanAt`/`lastScanError`) + `DEGRADED`/`ERROR` health. **Not
  implemented** (would require a migration; category-C / 5C-adjacent).
- **Program 5C** — scanner adapters, DICOM WSI/DICOMweb, scanner health, enterprise import monitoring, conformance.
