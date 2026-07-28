# Program 5C · Stage C2 — Native DICOM WSI Ingestion → DZI → READY — Acceptance Closeout

**Status:** **ACCEPTED / FROZEN.** Native DICOM WSI enters the ONE accepted Osieri pipeline as another
server-owned intake method, is converted to a sealed/verified DZI derivative by the existing worker + libvips,
and reaches **READY — unpublished**. Proven end-to-end against persisted DB truth in authoritative CI with a
real binary DICOM fixture and the real tiling engine. No second ingestion/processing/tiling path, no viewer
change, no auto-publication, no DICOMweb, no scanner adapter.

- **Accepted head (frozen):** `7e2a657` · **Tag:** `p5c-c2-accepted` → `7e2a657`
- **Provenance:** C1 `3d476d7` (contracts/schema/conformance) → **C2 `7e2a657`** (native ingest + decode).
- **Architecture (governance-locked):** convert-to-DZI; import-only DICOMweb is C3; native DICOMweb delivery is
  out (separately governed).
- **Zero schema migration** (C1 supplied `SlideDicomMetadata`); **zero new permission**.
- **Dependency:** `dcmjs` 0.52.0 (MIT) **only** — no JPEG 2000 / JPEG-LS codec, no dicomweb-client, no native
  DICOM system dependency (the probe proved the uncompressed profile needs no frame codec).
- Preserves all Program 5A and Program 5B accepted references.

## 1. What C2 delivered
- **Parser adapter** (`dicom-wsi-parser.ts`): dcmjs → the C1 allowlist projection + a transient AccessionNumber
  (matching only) + acquisition scale (objectivePower/mpp → existing DigitalSlide fields). Raw dataset never
  returned/persisted; PHI never mapped.
- **Conformance + decode-profile gates** (`dicom-conformance.ts` C1 + `dicom-wsi-decoder.ts` C2): supported
  profile = VL Whole Slide Microscopy Image Storage · uncompressed (Explicit/Implicit VR Little Endian) · RGB
  8-bit · TILED_FULL · single optical path. Compressed / non-RGB / multi-optical-path / incomplete-geometry →
  truthful `UNSUPPORTED`; malformed/inconsistent → `NONCONFORMANT`. Both run **before** any slide/ingestion/job.
- **Decoder** (`dicom-wsi-decoder.ts`): reconstructs the TotalPixelMatrix deterministically from
  frameRows/Columns + TotalPixelMatrix + NumberOfFrames + TILED_FULL row-major ordering (edge padding handled),
  emitting a libvips-readable PNG. Never guesses frame placement.
- **DICOM-aware materializer decorator** (`dicom-source-materializer.ts`): wraps `LocalSourceMaterializer` —
  non-DICOM sources are byte-identical to 5A; a DICOM source decodes the verified native object into a
  **transient** PNG inside the same private workspace and hands it to the **existing** `LibvipsTilingEngine`
  via the unchanged `workingFilePath` contract. The engine is never taught DICOM.
- **Ingestion service** (`dicom-ingestion.service.ts`): server-owned handoff — `sourceKind=DICOM` set
  server-side → accepted `SlideIngestionService` initiate/append/complete (native-bytes SHA-256, VERIFIED,
  atomic enqueue) → persist `SlideDicomMetadata` (VALID) → map acquisition. A non-VALID / unsupported /
  unmatched / duplicate input creates NO slide, ingestion, or job. Public upload DTO whitelist untouched.

## 2. Authoritative CI evidence — GREEN at head `7e2a657`
`wsi-auto-ingestion-acceptance` **run `30364074258` #4** — `workflow_dispatch` against `feat/legacy-etl`
(head `7e2a657`). CI env: **Node 20**, **libvips 8.15.1** (the ubuntu CI build — note it differs from the local
8.18.4, so the decode-to-PNG approach is proven build-independent), `npm ci` from the **committed lockfile**
(dcmjs 0.52.0 only; a non-fatal `EBADENGINE` warn for dcmjs's declared node range; **no codec/dicomweb-client**).
The registered YAML is byte-identical to `main`; only the invoked scripts carry the C2 extension. The DB-truth
assertion (exits non-zero on any failed check) passed:

```
stabIngested=true winner=cms4p7r2q0005yoysmubfsr08 gen=READY
B4 reconciliation: dup=RECONCILED amb=INGESTED unmatched=INGESTED retry=INGESTED ready=3/3
B5a monitoring: sources=2 disc=6 backlog=0 ready=5 procDone=5
C2 dicom: outcome=INGESTED slide=cms4p86hf000q141kqhikc46z mono=UNSUPPORTED dup=DUPLICATE labB=UNMATCHED
P5B-B2/B4/B5a + P5C-C2 AUTO-INGEST + RECONCILIATION + MONITORING + DICOM ACCEPTANCE: all persisted-truth assertions passed.
```

The C2 section drove the **real `DicomIngestionService`** with a real binary DICOM fixture and asserted, against
persisted state:
- **Real path → READY:** real DICOM → dcmjs parse → C1 VALID → exact accession match → server-owned handoff →
  native SHA-256 verification → `SlideIngestion` DICOM/VERIFIED → `SlideDicomMetadata` persisted → DICOM-aware
  materialization decode → **existing** worker + **real libvips** → **DZI** (`TILE_PYRAMID`+`MANIFEST` assets) →
  sealed+verified **READY**. No seeded READY, no mocked engine, no second pipeline.
- **Native provenance:** `SlideIngestion.sourceKind=DICOM` (server-side); `sourceChecksum` = SHA-256 of the
  native `.dcm` bytes; slide `sourceKind=DICOM`, DRAFT, matched the exact accession record.
- **PHI boundary:** the fixture carried PHI; `SlideDicomMetadata` persisted only the C1 allowlist (no
  PatientName/ID/…, no raw header); Patient/Record identity unchanged.
- **Unsupported/nonconformant:** a MONOCHROME (conformant-but-unsupported-profile) input → `UNSUPPORTED`, no
  slide/ingestion/job.
- **Duplicate:** the same Study+Series → `DUPLICATE`, exactly one `SlideDicomMetadata` for the series.
- **Tenancy:** Lab-B ingest of a Lab-A accession → `UNMATCHED` (a DICOM UID is not tenant authority).
- **READY-vs-PUBLISHED:** the READY DICOM slide has `publishedGenerationId=null`, `availabilityStatus≠PUBLISHED`,
  generation `≠PUBLISHED` — no auto-publication; DICOM ingestion does not bypass `wsi:publish`.
- **B2/B3/B4/B5a preserved** in the same run (watch-folder discovery/stability/dedup/matching/provenance,
  reconciliation state machine, monitoring truth).

**Transient cleanup:** the decoded PNG lives in the base materializer's private workspace; the processor's
existing `finally { dispose() }` (returned unchanged by the decorator) removes it on success and failure. The
5A/5B regression (267/267 local) confirms non-DICOM intake behaviour is byte-identical.

## 3. Whole-of-C2 assessment
Native DICOM WSI → the accepted Osieri pipeline → a real DZI derivative → READY, unpublished — delivered and
independently proven in authoritative CI, with truthful conformance/profile gating, PHI exclusion, tenant-safe
identity, native-source provenance, and no bypass of the human publication boundary. **C2 COMPLETE.**

## 4. Registration & rollback boundaries
- Product code is branch-only; **no product code on `main`**; **no workflow YAML change** (the acceptance is in
  the branch-side seed/assert scripts the registered gate already invokes; CI `npm ci` installs dcmjs from the
  committed lock; the DICOM fixtures are committed).
- C2 is code + one dependency (`dcmjs`), **no migration**; `git revert 7e2a657` removes the DICOM intake and the
  materializer decorator (non-DICOM behaviour is unchanged either way).

## 5. Remaining Program 5C scope (C3 next; not started)
- **C3 — DICOMweb import** (QIDO-RS discovery + WADO-RS retrieval from a controlled endpoint, server-side auth)
  feeding **this same** `DicomIngestionService`. Native WADO frame/tile delivery, STOW-RS, export, PACS/VNA
  remain out unless separately authorized.
- **C4** scanner-adapter framework · **C5** scanner health + import monitoring · **C6** conformance/interop
  acceptance · **C7** closeout.
- **Deferred (evidence-driven):** compressed transfer syntaxes (JPEG 2000 / JPEG-LS) — require a frame codec
  (OpenJPEG/CharLS WASM), authorized only when a real compressed fixture requires it; multi-optical-path;
  sparse tiling. **Program 9** owns production DICOM store/endpoint/secrets.
