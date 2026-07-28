# Program 5C · Stage C3 — DICOMweb Import → C2 → DZI → READY — Acceptance Closeout

**Status:** **ACCEPTED / FROZEN.** DICOMweb (QIDO-RS discovery + WADO-RS retrieval) is an **import-only**
transport that feeds the accepted C2 `ingestDicomWsi(bytes)` path. It reuses the accepted pipeline verbatim —
no second ingestion/processing/tiling path, no native tile/frame delivery, no STOW-RS, no export, no PACS/VNA
write-back, no auto-publication, no viewer change.

- **Accepted head:** `bf0455d` · **Tag:** `p5c-c3-accepted → bf0455d`
- **Provenance:** C1 `3d476d7` → C2 `p5c-c2-accepted → 7e2a657` → **C3** (DICOMweb import).
- **Architecture:** convert-to-DZI; **single-ingestable-WSI-object profile** (a multi-instance pyramid series
  is truthfully **UNSUPPORTED** — C2's single-object contract is never widened).
- **Dependency:** **none new** — a narrow native-`fetch` client (mirrors the repo's fhir/powertranz pattern).
- **Schema:** one additive migration (`20260728100000_wsi_dicomweb_source_c3`); **new permission `system:ingestion`**.
- Preserves C1/C2 and all 5A/5B accepted references.

## 1. What C3 delivered
- **Schema (additive):** `DicomWebAuthType {BEARER, BASIC}`; `IngestionSource` += `endpointBaseUrl?`,
  `authType?`, `credentialCipher?` (AES-256-GCM), `rootPath` relaxed to nullable, `@@unique([labId,
  endpointBaseUrl])`. DICOMweb discovery reuses `IngestionDiscovery` (sourceRef = `study/series`).
- **SSRF guard** (`ssrf-guard.ts`) — the outbound boundary that did not exist before C3: HTTPS-only, host
  allowlist (only configured endpoints), private/loopback/link-local/ULA rejection (loopback only under an
  explicit test flag for the mock), redirect blocking, timeouts, response-size caps.
- **Native-`fetch` DICOMweb client** (`dicomweb-client.ts`): QIDO series/instances + WADO single-instance
  retrieval; byte-exact `multipart/related` extraction (`multipart.ts`); structured `DicomWebError` taxonomy
  (transport/security distinct from clinical/conformance).
- **Import service** (`dicomweb-import.service.ts`): discover → select the **single** ingestable WSI SOP
  instance (multi-instance → UNSUPPORTED) → WADO native bytes → **provenance SHA-256 over the exact native
  object** → accepted `DicomIngestionService.ingestDicomWsi(bytes)` → discovery/dedup/idempotency via
  `IngestionDiscovery`. Credentials decrypted in-process only.
- **Endpoint administration** (`dicomweb-source.service.ts` / `dicomweb.controller.ts`, gated
  `system:ingestion`): create/list/enable + discover + import. The credential is encrypted at rest and
  **never returned** (only `hasCredential`). `labId` authoritative; public upload DTO untouched.
- **Permission:** new `system:ingestion` (endpoint admin + import execution), granted to **no default role** —
  not `wsi:view`/reconciliation/monitoring. B5-a monitoring keeps `wsi:reconcile` and auto-covers DICOMweb
  sources (kind/enabled/discovery counts) **without** exposing the endpoint URL or credential.

## 2. Authoritative CI evidence — GREEN at head `bf0455d`
`wsi-auto-ingestion-acceptance` **run `30368120232` #5** — `workflow_dispatch` against `feat/legacy-etl`
(head `bf0455d`). CI env: **Node 20**, **libvips 8.15.1**, `npm ci` = **1415 packages (identical count to the
C2 run → NO new C3 dependency**; native fetch, no dicomweb-client/axios/pg). Registered YAML byte-identical to
`main`; only the invoked scripts carry the C3 extension. The C3 section starts an **in-process mock DICOMweb
server** (127.0.0.1, Bearer-guarded) and drives the **real** import service. The DB-truth assertion (non-zero
on any failed check) passed:

```
C3 dicomweb: import=INGESTED dup=INGESTED multi=UNSUPPORTED mono=UNSUPPORTED unmatched=UNMATCHED auth=AUTH_REJECTED ssrf=HOST_NOT_ALLOWED labB=UNMATCHED
P5B-B2/B4/B5a + P5C-C2/C3 AUTO-INGEST + RECONCILIATION + MONITORING + DICOM + DICOMWEB ACCEPTANCE: all persisted-truth assertions passed.
```

Proven (persisted DB truth): authenticated QIDO → single-instance selection → WADO → **native-byte SHA-256 of
the extracted `application/dicom` object** → `SlideIngestion` DICOM/VERIFIED → `SlideDicomMetadata` (series
identity, no PHI) → real worker + libvips → **DZI → sealed/verified READY**, `publishedGenerationId=null`
(unpublished). **Idempotency:** a re-import returned INGESTED reusing the original result — asserted by
`count(SlideDicomMetadata where study+series) === 1` (exactly one series identity; no second ingestion).
Multi-instance and MONOCHROME → UNSUPPORTED (no slide); unmatched accession → UNMATCHED; **bad credential →
FAILED(AUTH_REJECTED)**; **private-IP endpoint → FAILED(HOST_NOT_ALLOWED)** (rejected before any fetch); Lab-B
import of a Lab-A accession → UNMATCHED; credential encrypted at rest (cipher ≠ plaintext) and never returned.
B2/B4/B5a/C2 preserved in the same run.

## 3. Whole-of-C3 assessment
DICOMweb import → the accepted C2 pipeline → real DZI → READY (unpublished), with a real SSRF boundary,
encrypted credentials, `system:ingestion` authority, native-byte preservation, and truthful UNSUPPORTED for
the deferred profiles — no second pipeline and no viewer/publication change. **C3 COMPLETE.**

## 4. Boundaries maintained (per governance)
Single native WSI-object profile only · no multi-instance pyramid assembly · no compressed transfer-syntax
support (frame codecs deferred) · no DICOMweb viewer/tile/frame delivery · no STOW-RS · no PACS/VNA write-back ·
no Program 9 infrastructure. Product code branch-only; no `main` product-code merge.

## 5. Remaining Program 5C scope
- **C4** vendor-neutral scanner-adapter framework · **C5** scanner health + enterprise import monitoring ·
  **C6** conformance/interoperability acceptance · **C7** closeout.
- Deferred (evidence-driven): compressed transfer syntaxes (OpenJPEG/CharLS WASM codecs); multi-instance WSI
  pyramid assembly (a C2-contract extension); OAuth2/mTLS auth; scheduled polling import. **Program 9** owns
  production endpoints/credentials/networking.
