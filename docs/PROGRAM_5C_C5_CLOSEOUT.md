# Program 5C · Stage C5 — Scanner Health & Enterprise Import Monitoring — Acceptance Closeout

**Status:** **ACCEPTED / FROZEN.** Operational health of **accepted ingestion connections** — source
configuration, transport reachability, authentication validity, adapter registration/compatibility, and
accepted intake-path health — surfaced as a per-source **current snapshot** plus query-time import monitoring.
**This is NOT physical scanner-hardware health.**

- **Accepted head:** `d895738` · **Tag:** `p5c-c5-accepted → d895738` · **Closeout:** `<this commit>`
- **Provenance:** C1 `3d476d7` → C2 `p5c-c2-accepted → 7e2a657` → C3 `p5c-c3-accepted → bf0455d` →
  C4 `p5c-c4-accepted → 628a1f1` → **C5 `d895738`** (parent `524238d`).
- **Dependency:** **none new** — `package.json` / `package-lock.json` unchanged; no `axios`, no `pg`, no `@types/pg`.
  **Permission:** **none new** (reuses `system:ingestion` and `wsi:reconcile`). **Additive migration only.**
- Preserves all 5A / 5B / C1 / C2 / C3 / C4 accepted references and the legacy `adapterType=null` FILESYSTEM
  scheduler behaviour.

---

## 1. Accepted implementation & closeout SHAs, frozen tag
- **Accepted implementation SHA:** `d895738` (`feat/legacy-etl`).
- **Closeout SHA:** `<this commit>` (this document).
- **Frozen tag:** annotated `p5c-c5-accepted` → object `cd34f7b`, dereferences to commit `d895738` (pushed, no force).

## 2. Authoritative CI evidence — GREEN at exact head `d895738`
- **Workflow:** `wsi-auto-ingestion-acceptance` · **workflow id** `321629868`
- **Run number:** `#7` · **Run id:** `30384973237`
- **Reference:** https://github.com/akutonsol/cytolab/actions/runs/30384973237
- **Event:** `workflow_dispatch` · **Branch:** `feat/legacy-etl` · **Head SHA:** `d895738` (run header + REST both resolve exactly)
- **Conclusion:** `success` · **Wall-clock:** `2026-07-28T17:53:56Z → 17:56:13Z`
- **Job:** *P5B-B2 automated watch-folder (gated, workers ON)* — all steps `success`, incl. libvips install,
  `npm ci`, Prisma generate, **build acceptance DB schema from datamodel** (materializes the C5 health table),
  seed, **start isolated API :4001 with processing + watch-folder workers ON**, and the **DB-truth assertion**
  (non-zero exit on any failed check).
- **Artifact:** `p5b-b2-auto-ingestion-acceptance` (8664 bytes, not expired).
- **Persisted-truth line (authoritative — DB assertions, not the log alone):**
  ```
  C5 health: fs=HEALTHY miss=UNREACHABLE->HEALTHY web=HEALTHY auth=AUTH_REJECTED ssrf=MISCONFIGURED
  P5B-B2/B4/B5a + P5C-C2/C3/C4/C5 … : all persisted-truth assertions passed.
  ```

## 3. Schema & migration proof (additive from the C4-accepted baseline)
Migration **`20260728180000_wsi_source_health_c5`**. `prisma migrate diff` from the parent (`524238d`, a
descendant of the C4-accepted `628a1f1`) datamodel to the C5 datamodel is **byte-identical to the committed
migration** and contains **only**: `CreateEnum` + `CreateTable` + 3× `CreateIndex` + 2× `AddForeignKey`.
- **No** `DROP TABLE/COLUMN/TYPE/CONSTRAINT`, **no** `ALTER COLUMN`, **no** `RENAME`, **no** destructive change.
- **No** unrelated schema changes (the C4→C5 span's Bill/Requisition deltas belong to intermediate ancillary-ordering
  commits, **not** C5; C5's own commit diff is health-only + two relation back-refs).
- **enum `SourceHealthState`** = `UNKNOWN HEALTHY DEGRADED UNREACHABLE AUTH_REJECTED MISCONFIGURED DISABLED`.
- **`IngestionSourceHealth`** (1:1 current snapshot): `id, labId, sourceId @unique, state @default(UNKNOWN),
  checkedAt?, lastSuccessfulCheckAt?, lastFailedCheckAt?, lastErrorCode?, consecutiveFailures @default(0),
  responseTimeMs?, nextEligibleCheckAt?, createdAt, updatedAt`.
- **Indexes:** `UNIQUE(sourceId)`, `(labId, state)`, `(labId, nextEligibleCheckAt)`.
- **FKs:** `labId → Lab (ON DELETE RESTRICT)`, `sourceId → IngestionSource (ON DELETE CASCADE)` — **source deletion
  cascades to its health snapshot.** Existing sources remain valid (snapshot is optional/nullable relation).
- All C1–C4 and 5B tables intact. **No** health-state fields added to `IngestionSource` directly.

## 4. Current-snapshot-only decision
A single 1:1 row per source. **No** health-history table, **no** event/time-series/materialized/counter table.
`STALE` is **derived** (not an enum value, not a stored status) from `lastSuccessfulCheckAt` + effective cadence.

## 5. Health boundary (what C5 is, and is not)
**Is:** ingestion-source configuration health · transport reachability · authentication validity · adapter
registration & transport compatibility · accepted intake-path operational health.
**Is not** — and **no** implementation exists of: SNMP, hardware telemetry, temperature, optics, calibration,
consumables, motors, command/control, scanner job submission, remote restart, fleet administration, vendor-SDK
hardware monitoring. The API claims none of these.

## 6. Health state model & precedence
Precedence `DISABLED > MISCONFIGURED / AUTH_REJECTED / UNREACHABLE > DEGRADED > HEALTHY > UNKNOWN`
(`HEALTH_STATE_RANK`). Never checked → `UNKNOWN`; `source.enabled=false` → `DISABLED` **without** transport I/O;
reachable → `HEALTHY`; transport failure → `UNREACHABLE`; 401/403 → `AUTH_REJECTED`; invalid config/adapter/host →
`MISCONFIGURED`. Failures increment `consecutiveFailures` + set `lastFailedCheckAt`; recovery to `HEALTHY` resets
`consecutiveFailures=0` + sets `lastSuccessfulCheckAt`. Only a **structured** `lastErrorCode` is persisted — never a
raw exception message.

## 7. Five-minute cadence correction & proof
Single floor **`MIN_HEALTH_CADENCE_MS = 300000`** in `loadHealthConfig`, applied (clamp-UP) to both `cadenceMs`
and the scheduler tick `intervalMs`; every derivation (`nextEligibleCheckAt` in the CAS claim and in `persist`,
staleness `staleMultiple × cadenceMs`) reads from it. Proven deterministically (`health-config.spec.ts`,
`source-health.service.spec.ts`, and the acceptance):
- default OFF; absent cadence/interval → ≥ 300000 ms;
- 30000 / 60000 / 299000 → **300000**; 300000 → 300000; > 300000 preserved (600000, 3600000);
- **no** one-minute runtime default exists;
- scheduled `nextEligibleCheckAt` cannot land sooner than 5 min — proven for **both** the CAS-claim timing and the
  persisted-snapshot timing, and asserted on the **persisted** row in the authoritative gate.

## 8. Transport-checker architecture
`ScannerAdapter` retains scan-discovery semantics; **health uses separate transport health-check contracts**
(`IngestionSourceHealthChecker { supports, check }`) resolved via a **static Nest DI registry**
(`SOURCE_HEALTH_CHECKERS`) — **no** dynamic/plugin loading, **no** DB-selected class instantiation, **no**
third-party executable checker module. Adapter registration and adapter/transport compatibility are validated
**separately** from transport probing.

## 9. Filesystem health proof
Valid FILESYSTEM source → root exists → `realpath` succeeds → readable/listable → adapter registered/compatible →
`HEALTHY`. Missing root → structured `FILESYSTEM_NOT_FOUND` → `UNREACHABLE` → no intake side effect. The checker
performs **no** write/create/delete/rename and mutates **no** scanner directory; **no** raw absolute path is
surfaced. A readable **idle** folder stays `HEALTHY` (absence of new slides never yields `DEGRADED`).

## 10. DICOMweb health proof
Reuses the accepted **C3** client and controls (HTTPS validation, SSRF guard, host allowlist, DNS/IP + loopback/
private/link-local rejection, redirect rejection, timeout, response-size cap, credential decryption, auth-header
handling, response redaction, `DicomWebError` taxonomy). The check issues a **minimal QIDO** only — **never** WADO
/ instance retrieval. Outcomes: valid → `HEALTHY`; bad creds → `AUTH_REJECTED`; unreachable/timeout →
`UNREACHABLE`; host/SSRF rejection → `MISCONFIGURED`; malformed response → deterministic non-healthy. No endpoint
URL, credential, `Authorization` header, query, or response body is persisted or exposed.

## 11. Adapter-config proof
`assertAdapterMatchesKind` + registry lookup validate registration/compatibility → `ADAPTER_NOT_REGISTERED` /
`ADAPTER_TRANSPORT_MISMATCH` / `SOURCE_MISCONFIGURED` → `MISCONFIGURED`, distinct from transport results.

## 12. Scheduler & claim semantics
`WSI_HEALTH_CHECK_ENABLED` **defaults OFF** (gate log: `source-health poller DISABLED`). Config-gated
`setInterval` + `unref`; cadence ≥ 5 min; bounded concurrency (`maxConcurrency`); per-source jitter/stagger;
per-check timeout; graceful drain (`OnModuleDestroy`); per-tick + per-source exception isolation. Multi-instance
safety via `nextEligibleCheckAt` **compare-and-set** (`updateMany … OR nextEligibleCheckAt null/≤now → now+cadence`;
`count!==1 → skip`); a disabled source performs **no** transport I/O. Health is independent of discovery /
ingestion / reconciliation / processing / aggregation.

## 13. Manual-check endpoint & authorization
`POST /wsi/ingestion/health/check` — **`system:ingestion`** (metadata asserts exactly `['system:ingestion']`).
One-source mode tenant-scoped; all-eligible mode lab-scoped; bounded synchronous execution; non-secret structured
response; every manual check audited. `wsi:view` cannot invoke; `wsi:reconcile` cannot substitute; **no** new
permission; **no** default role gained `system:ingestion`.

## 14. Monitoring extensions, throughput & backlog definitions
Existing `GET /wsi/ingestion/monitoring` (**`wsi:reconcile`**) was **extended, not replaced** (B5-a projection
preserved). Per-source health: `state, checkedAt, lastSuccessfulCheckAt, lastFailedCheckAt, lastErrorCode,
consecutiveFailures, responseTimeMs, stale`. Windows **1h / 24h / 7d** (default 24h, max 7d). Query-time throughput:
discovered, ingested, duplicate, unmatched, ambiguous, unsupported, failed, last-discovery, last-ingestion,
last-READY. **Backlogs remain distinct** — Operational (STABILIZING/incomplete, retryable FAILED) · Reconciliation
(accepted B4 defs) · Processing (QUEUED/RUNNING/FAILED) · Publication (READY-but-unpublished, **not** an error) —
**not** merged into one aggregate.

## 15. DEGRADED rule
Only when the direct check would be `HEALTHY` **and**, within the operational window, either ≥3 retryable import
failures with 0 successful ingestion, **or** ≥3 processing failures with 0 READY. **Never** from DUPLICATE /
UNMATCHED / AMBIGUOUS / UNSUPPORTED / NONCONFORMANT / no-activity / READY-unpublished-backlog-alone / tiny-sample
ratio.

## 16. Stale & idle semantics
`STALE` derived from `lastSuccessfulCheckAt` + effective (clamped) cadence; not an enum value, not persisted as a
status. Idle import activity alone makes a source neither stale nor unhealthy; **no** expected-activity policy exists.

## 17. Audit transitions (alert-ready, reused `AuditRecorder`)
Audited: every manual check; transitions to UNREACHABLE / AUTH_REJECTED / MISCONFIGURED / DEGRADED; and → HEALTHY
as `SOURCE_RECOVERED`. An unchanged successful scheduled check produces **no** transition noise (dedup by comparing
previous vs current persisted snapshot state). **No** health-history table, **no** alert-event table, **no** email
/ SMS / Slack / PagerDuty / webhook.

## 18. Redaction
No DTO / log / audit event / assertion output / persisted snapshot exposes rootPath, endpointBaseUrl,
credentialCipher, plaintext credentials, Authorization header, raw endpoint URL, endpoint query, raw remote
response, raw DICOM JSON, raw vendor payload, patient demographics, absolute patient-bearing path, or
identifier-bearing raw `sourceRef`. Allowed: labId, sourceId, source kind, adapterType, structured error code,
duration, aggregate counts, state transition. The authoritative gate asserts the monitoring JSON contains none of
rootPath / endpoint / credential.

## 19. No-side-effect proof
Health checks create/alter **no** `DigitalSlide`, `SlideIngestion`, `SlideProcessingJob`, `IngestionDiscovery`,
publication state, processing state, or reconciliation state. The acceptance explicitly asserts the source's
discovery count is **unchanged** across all health-check scenarios.

## 20. Tenancy scope
Monitoring and manual checks remain **lab-scoped**; cross-lab user queries fail closed; **no** new cross-lab
enterprise endpoint (the scheduler's system-scoped enumeration is internal only and does not widen user-facing
access); tenant Prisma extensions remain active.

## 21. Error taxonomy (structured; C3/C4 mapped, not rewritten)
`HEALTH_CHECK_TIMEOUT, FILESYSTEM_NOT_FOUND, FILESYSTEM_PERMISSION_DENIED, FILESYSTEM_UNREADABLE,
DICOMWEB_HOST_REJECTED, DICOMWEB_UNREACHABLE, DICOMWEB_AUTH_REJECTED, DICOMWEB_INVALID_RESPONSE,
ADAPTER_NOT_REGISTERED, ADAPTER_TRANSPORT_MISMATCH, SOURCE_MISCONFIGURED, CHECK_INTERNAL_ERROR`. No code or message
carries PHI, credentials, raw URLs, paths, or response bodies.

## 22. Regressions preserved at head `d895738`
The single authoritative gate exercises, all GREEN: **5A** upload/intake, processing, real tiling, sealing,
verification, publication boundary; **5B** legacy FILESYSTEM sources, stability, checksum dedup, accession matching,
reconciliation, B5-a monitoring; **C1** DICOM conformance/allowlist/identity; **C2** native local DICOM,
checksum provenance, supported/unsupported truth, READY-not-PUBLISHED; **C3** DICOMweb import, auth, SSRF, WADO
native-byte handoff, multi-instance UNSUPPORTED, tenancy; **C4** static registry, filesystem-DICOM routing,
DICOMweb delegation, sourceRef idempotency, completeness, READY-not-PUBLISHED. Legacy `adapterType=null` FILESYSTEM
scheduler behaviour, all accepted permissions, and all accepted tenancy behaviour preserved.

## 23. Whole-of-C5 assessment (read-only)
`configured ingestion source → transport health checker (static DI) → persisted 1:1 current snapshot → safe
query-time monitoring aggregation → tenant-scoped operational visibility → no ingestion side effects → no
scanner-hardware claim.` Coherent and closed.

## 24. Exact remaining C6 scope (NOT started)
**C6 — conformance / interoperability acceptance:** vendor/profile conformance and interoperability validation of
the accepted transports and adapters (e.g. DICOM/DICOMweb conformance-statement adherence, cross-vendor series/SOP
handling, negative-conformance surfacing) against the accepted intake pipeline — **no** new transport, ingestion
pipeline, processing worker, slide-creation, or publication path. Followed by **C7 — Program 5C closeout.**
C6 is explicitly **out of scope** for this closeout and has not been started.
