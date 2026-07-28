# Program 5C · Stage C4 — Vendor-Neutral Scanner Adapter Framework — Acceptance Closeout

**Status:** **ACCEPTED / FROZEN.** A vendor-neutral scanner-adapter framework: a **translation/routing layer**
over the ACCEPTED transports (FILESYSTEM / DICOMWEB) that routes each completed scan to the correct accepted
intake — never a new transport, ingestion pipeline, processing worker, slide-creation, or publication path.

- **Accepted head:** `628a1f1` · **Tag:** `p5c-c4-accepted → 628a1f1` · **Closeout:** `<this commit>`
- **Provenance:** C1 `3d476d7` → C2 `p5c-c2-accepted → 7e2a657` → C3 `p5c-c3-accepted → bf0455d` → **C4 `628a1f1`**.
- **Dependency:** **none new** (CI `npm ci` = 1415 packages, identical to C3). **Permission:** **none new** (reuses
  `system:ingestion`). Additive migration only. No new `IngestionSourceKind`, no new/activated `SlideSourceKind`.
- Preserves C1/C2/C3 and all 5A/5B accepted references.

## 1. What C4 delivered
- **Schema (additive migration `20260728160000_wsi_scanner_adapter_type_c4`):** enum `IngestionAdapterType
  {FILESYSTEM_IMAGE, FILESYSTEM_DICOM, DICOMWEB}` + nullable `IngestionSource.adapterType`. `SlideSourceKind.SCANNER`
  remains unused (slide provenance stays transport-truthful: DICOM for scanner DICOM).
- **Contract:** `ScannerAdapter { id, adapterType, discoverCompletedScans, validateCompleteness }` with a
  **discriminated locator union** (`IMAGE_FILE`/`DICOM_FILE {absPath}` | `DICOMWEB_SERIES {study,series}`) and an
  allowlisted `CanonicalScannerMetadata` (adapterId/version, vendor, model, pseudonymous deviceIdentifier,
  acquisitionAt, vendorSoftwareVersion) — no raw payload, no patient fields. Structured `ScannerAdapterError` taxonomy.
- **Registry:** a STATIC Nest DI registry (`SCANNER_ADAPTERS` token) indexed by `IngestionAdapterType` — no
  dynamic/plugin loading, no DB-driven class instantiation. `FILESYSTEM_IMAGE` is not registered (its 5B path is unchanged).
- **Router** (`ScannerRouterService.runSource`): resolve source → `assertAdapterMatchesKind` → adapter discovery →
  `IngestionDiscovery` idempotency → completeness → route by `objectKind`: **DICOM_FILE → exact native bytes →
  C2 `ingestDicomWsi`**; **DICOMWEB_SERIES → C3 `importSeries`**. The router creates no slide/ingestion/job itself.
- **Reference adapters:** (a) **filesystem-dicom** — the genuine gap: `.dcm` in a watch folder → accepted confined
  `WatchFolderScanner` discovery → 5B mtime-quiescence completeness → exact native bytes → C2 (never decodes/
  re-encodes; relative-path sourceRef; native accession authoritative). (b) **dicomweb** — a THIN wrapper
  delegating to C3 (no QIDO/WADO/SSRF/auth/multipart/checksum duplication).
- **Controller:** `POST /wsi/scanner/sources` (+ adapterType) and `/sources/:id/scan`, gated `system:ingestion`.
- **Compatibility:** the watch-folder scheduler now selects `enabled + FILESYSTEM + (adapterType null OR
  FILESYSTEM_IMAGE)` — legacy sources (null) still scan; `FILESYSTEM_DICOM` is router-owned.

## 2. Authoritative CI evidence — GREEN at head `628a1f1`
`wsi-auto-ingestion-acceptance` **run `30372027564` #6** — `workflow_dispatch` against `feat/legacy-etl`
(head `628a1f1`). CI env: **Node 20**, **libvips 8.15.1**, `npm ci` = **1415 packages (identical to C3 → NO new C4
dependency)**. Registered YAML byte-identical to `main`; only the invoked scripts carry the C4 extension. The
DB-truth assertion (non-zero on any failed check) passed:

```
C4 scanner: fsdicom=INGESTED ready=true rescan=INGESTED incomplete=INCOMPLETE dicomweb=INGESTED
P5B-B2/B4/B5a + P5C-C2/C3/C4 AUTO-INGEST + RECONCILIATION + MONITORING + DICOM + DICOMWEB + SCANNER ACCEPTANCE: all persisted-truth assertions passed.
```

Proven (persisted DB truth): a real stable `.dcm` in a FILESYSTEM/`FILESYSTEM_DICOM` source → filesystem-dicom
adapter discovery (relative sourceRef) → completeness → confined native-byte read → `ingestDicomWsi` →
`SlideIngestion` DICOM/VERIFIED with the **SHA-256 of the exact native file bytes** → `SlideDicomMetadata` (series
identity, no PHI) → real worker + libvips → **DZI → sealed/verified READY**, `publishedGenerationId=null`,
`availabilityStatus≠PUBLISHED`, DICOM provenance. **Idempotency** (`rescan=INGESTED`): a re-scan reused the
original terminal discovery — asserted `count(IngestionDiscovery where sourceId+sourceRef) === 1` (one identity,
no second slide/ingestion/job). **Incomplete** (freshly-written `.dcm`) → `INCOMPLETE`, no slide. **DICOMweb
adapter** delegated to C3 `importSeries` (`adapterType=DICOMWEB`). B2/B4/B5a/C2/C3 all preserved in the same run
(including legacy FILESYSTEM sources with `adapterType=null` scanning normally).

**Adapter/transport validation, registry resolution, no-slide-by-router, path confinement, metadata allowlist,
and `system:ingestion` authz** are proven at the same head by the unit/authz specs (18 scanner tests).

## 3. Whole-of-C4 assessment
Scanner output → canonical adapter discovery → existing transport → accepted intake → existing worker → real DZI →
READY, unpublished — delivered and independently proven in authoritative CI, with no second pipeline, no new
transport, no vendor-specific assumptions, and no publication bypass. **C4 COMPLETE.**

## 4. Boundaries maintained
Adapter = translation/routing only · no scanner health/telemetry/SNMP/fleet/command-control · no frame codecs ·
no multi-instance assembly · no native DICOMweb delivery/STOW/export/PACS write-back · no auto-publication · no
Program 9 work. Product code branch-only; no `main` product-code merge.

## 5. Remaining Program 5C scope
- **C5** scanner health + enterprise import monitoring (the deferred B5-c: persisted device/endpoint liveness,
  reachability, import throughput/backlog, per-vendor failure surfacing) · **C6** conformance/interoperability
  acceptance · **C7** closeout.
- Deferred (evidence-driven): vendor-specific adapters (Aperio/Hamamatsu/Philips/…), proprietary formats
  (`.svs/.ndpi` — libvips-OpenSlide evidence), compressed transfer syntaxes, multi-instance pyramid assembly,
  OAuth2/mTLS, scheduled scanner polling. **Program 9** owns production endpoints/credentials/networking.
