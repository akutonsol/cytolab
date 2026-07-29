# Program 5C · C6 — DICOM VL WSI Conformance & Interoperability Matrix

**Status:** C6 evidence artifact (test-owned truth). Records the accepted vendor-neutral profile, the
accepted/rejected characteristic matrix, fixture provenance, and the classification governance the frozen
C1–C5 pipeline already enforces. **No runtime capability is added or broadened by C6** — this documents and
tests what exists at `p5c-c5-accepted → d895738`.

Osieri does **not** claim full DICOM conformance, universal scanner compatibility, or commercial-vendor
certification. See the truthful-claim section.

---

## 1. Accepted profile (frozen C1 + C2 gates)

| Dimension | Accepted value | Owning gate |
|---|---|---|
| SOP Class | `1.2.840.10008.5.1.4.1.1.77.1.6` (VL Whole Slide Microscopy Image) | C1 |
| Transfer syntax (decodable) | Implicit VR LE `1.2.840.10008.1.2` · Explicit VR LE `1.2.840.10008.1.2.1` | C2 |
| Photometric / samples | RGB / 3 | C2 |
| Bits allocated | 8 | C2 |
| Dimension organisation | `TILED_FULL` | C2 |
| Optical paths | exactly 1 | C2 |
| Instances per series | exactly 1 | C3 (multi-instance → UNSUPPORTED, never WADO-retrieved) |
| Frame geometry | positive, internally sufficient (`NumberOfFrames ≥ ceil(totCols/frmCols)·ceil(totRows/frmRows)`) | C1 |
| Pixel data | native, uncompressed | C2 |

**Two-tier truth:** C1 accepts the full JPEG family as `VALID`; the C2 decode gate narrows to the two
uncompressed Little-Endian syntaxes. A JPEG / JPEG-LS / JPEG 2000 object is therefore **C1-VALID but
C2-UNSUPPORTED** and creates no slide. Not in the profile (never added by C6): JPEG/JPEG-LS/JPEG 2000,
MONOCHROME, YBR, TILED_SPARSE, multiple optical paths, multi-instance assembly, native DICOM viewer delivery.

## 2. Accepted / rejected characteristic matrix

`NC` = NONCONFORMANT, `US` = UNSUPPORTED. Every rejection creates **no** `DigitalSlide` / `SlideIngestion` /
`SlideProcessingJob` and is **transport-independent** (both transports converge on the same C1→C2 gate via
identical native bytes).

| Characteristic | Rejected → | Validator | Structured code | Class |
|---|---|---|---|---|
| SOP class | non-WSI | `dicom-conformance.ts` | `SOP_CLASS_UNSUPPORTED` | US |
| Transfer syntax | not in C1 set (e.g. RLE) | `dicom-conformance.ts` | `TRANSFER_SYNTAX_UNSUPPORTED` | US |
| Transfer syntax | compressed/encapsulated (JPEG family) | `dicom-wsi-decoder.ts` | `COMPRESSED_UNSUPPORTED` | US |
| Photometric / samples | not RGB/3 (e.g. MONOCHROME2) | `dicom-wsi-decoder.ts` | `PHOTOMETRIC_UNSUPPORTED` | US |
| Bits allocated | ≠ 8 | `dicom-wsi-decoder.ts` | `BIT_DEPTH_UNSUPPORTED` | US |
| Dimension organisation | ≠ TILED_FULL | `dicom-wsi-decoder.ts` | `TILING_UNSUPPORTED` | US |
| Optical paths | > 1 | `dicom-wsi-decoder.ts` | `MULTI_OPTICAL_PATH_UNSUPPORTED` | US |
| Instances per series | ≠ 1 | `dicomweb-import.service.ts` | discovery `UNSUPPORTED` | US |
| Required UID | missing | `dicom-conformance.ts` | `MISSING_REQUIRED_UID` | NC |
| UID form | malformed | `dicom-conformance.ts` | `MALFORMED_UID` | NC |
| Geometry | non-positive | `dicom-conformance.ts` | `GEOMETRY_INVALID` | NC |
| Frame count | below tile-grid floor | `dicom-conformance.ts` | `FRAME_COUNT_INVALID` | NC |
| Optical-path sequence | malformed | `dicom-conformance.ts` | `OPTICAL_PATH_MALFORMED` | NC |
| Decode geometry | incomplete | `dicom-wsi-decoder.ts` | `GEOMETRY_INCOMPLETE` | US |
| Accession | missing / no same-lab exact match | `accession-match.resolver` | `UNMATCHED` | — |
| Accession | > 1 exact same-lab candidate | `accession-match.resolver` | `AMBIGUOUS` | — |
| QIDO body | malformed | `dicomweb-client.ts` | `INVALID_QIDO_RESPONSE` → FAILED (retryable) | — |
| WADO body | malformed multipart | `multipart.ts` | `MALFORMED_MULTIPART` → FAILED (retryable) | — |

**Classification governance:** precedence `NONCONFORMANT > UNSUPPORTED > VALID`. `FAILED` is reserved for genuine
retryable transport/processing faults (malformed QIDO/multipart, checksum mismatch, libvips/verification failure)
— never used where NC / US / UNMATCHED / AMBIGUOUS is more truthful.

## 3. Fixture provenance

| Fixture | Source | Provenance |
|---|---|---|
| `wsi-valid.dcm`, `wsi-ct.dcm`, `wsi-mono.dcm` (C2) | `dicom-wsi-fixture.ts::generateDicomWsiBytes` | synthetic, in-repo (dcmjs), deterministic |
| `wsi-b.dcm` (C6, independent) | `dicom-wsi-fixture-b.ts::generateDicomWsiBytesB` | separately-constructed synthetic, in-repo |
| `wsi-neg-bitdepth16 / -tiledsparse / -multiopticalpath.dcm` | `dicom-wsi-fixture-b.ts::generateDicomWsiNegative` | synthetic decode-negatives, in-repo |

All fixtures are **synthetic, self-generated (no proprietary/downloaded/vendor data), deterministic**, under the
experimental UID arc `1.2.826.0.1.3680043.2.9999.*`, and carry **fictional** PHI / vendor / private values used
**only** to prove they are never persisted. No production patient data; no new runtime dependency (dcmjs already
present). Binaries are generated once via ts-node and committed (ts-jest cannot run dcmjs `write`); the worker-
enabled acceptance gate generates equivalents live.

## 4. Fixture B independence (over more than Manufacturer)

Fixture B is an independent construction path (not a parameterised Fixture-A call) differing in: implementation
class UID + version name, Study/Series/SOP UID roots (`…9999.8888.*`), tile size, total-pixel-matrix size, frame
count, optional-tag presence (FrameOfReferenceUID, StudyID, SpecimenDescriptionSequence), accession/specimen
content, fictional Manufacturer/ManufacturerModelName/SoftwareVersions/DeviceSerialNumber, and a deterministic
private creator + private element — while remaining strictly in-profile (VL WSI · uncompressed · RGB/3 · 8-bit ·
TILED_FULL · one optical path · one instance). The evidence this supports is **independently-constructed
synthetic interoperability**, not validation against a named commercial scanner.

## 5. Vendor / private-tag invariants (source-reviewed + tested)

`Manufacturer`, `ManufacturerModelName`, `SoftwareVersions`, `DeviceSerialNumber`, and private tags are **read
nowhere and branch nowhere** across dicom / dicomweb / scanner / health — they do not drive routing, decoding,
conformance, or accession matching, and are never persisted to `SlideDicomMetadata`, exposed, or logged. A
conformant object carrying private tags (Fixture B) is accepted unchanged.

## 6. Transport & checksum equivalence

Identical native bytes delivered via FILESYSTEM_DICOM and DICOMWEB produce equal native SHA-256, equal
transport-independent DICOM identity + allowlist metadata, equal conformance, and equivalent READY/sealed/
verified/unpublished processing truth; only labId / IngestionSource / IngestionDiscovery / sourceRef differ.
Because identical bytes ⇒ identical Study/Series ⇒ same-lab identity dedup, the byte-equivalence proof uses two
labs; within one lab a repeated identity is a `DUPLICATE`. Byte-different fixtures (distinct UIDs) are never
collapsed as checksum duplicates.

## 7. DZI output invariants (not byte-identical archives)

libvips JPEG tiling is not byte-identical across engine versions, so output equivalence is asserted on structural
invariants: `status=READY`, `sealed`, `verified`, DZI descriptor present, `tiledWidth/tiledHeight/tileSize/
levelCount` present, non-zero tile pyramid, `publishedGenerationId=null` (READY ≠ PUBLISHED), backed by the
accepted verifier's three-way checksum / per-level digest integrity.

## 8. Truthful conformance claim

> "Osieri accepts a defined vendor-neutral subset of DICOM VL Whole Slide Microscopy Image objects — uncompressed
> RGB, 8-bit, TILED_FULL, single optical path and single instance — through filesystem and DICOMweb transports,
> and processes supported objects through a common native-byte ingestion and DZI pipeline, with per-object
> conformance classification."

**Prohibited:** full DICOM conformance · universal scanner compatibility · commercial-vendor certification ·
compatibility with a named vendor · all transfer syntaxes · all VL-WSI profiles · JPEG/JPEG-LS/JPEG 2000 decoding
· MONOCHROME support · multiple optical paths · multi-instance assembly · diagnostic/clinical validation ·
regulatory approval · PACS/VNA interoperability beyond tested read operations.

## 9. Deferred / characterised (not patched in C6)

- **Compressed-codec fixtures** (real JPEG/JPEG 2000/JPEG-LS bytes) — need a codec; out of scope.
- **QIDO pagination > 100** — single-page behaviour characterised; auto-paging not added.
- **Multipart bare-LF trailing separator** — characterised as current byte-mismatch behaviour; not patched.
- **Correction to preflight §18:** the watch-folder scanner lower-cases the file extension, so mixed-case
  `.DCM` / `.Dcm` **are already discovered** — mixed-case is accepted current behaviour, not a deferred gap.
