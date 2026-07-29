# Program 5C · Stage C6 — Conformance & Cross-Vendor Interoperability — Acceptance Closeout

**Status:** **ACCEPTED / FROZEN.** An interoperability-evidence checkpoint over the frozen C1–C5 pipeline: two
independently constructed, standards-conformant DICOM VL WSI objects traverse **both** accepted transports to
READY-unpublished, with transport-independent native-byte truth, truthful UNSUPPORTED/NONCONFORMANT
classification, and zero vendor-specific branching or persistence. **No runtime capability was added or broadened.**

- **Accepted head:** `03215ec` · **Tag:** `p5c-c6-accepted → 03215ec` · **Closeout:** `<this commit>`
- **Provenance:** C1 `3d476d7` → C2 `p5c-c2-accepted → 7e2a657` → C3 `p5c-c3-accepted → bf0455d` →
  C4 `p5c-c4-accepted → 628a1f1` → C5 `p5c-c5-accepted → d895738` (closeout `33609df`) → **C6 `03215ec`**.
- **Change class:** test/fixture/doc ONLY. No schema, migration, dependency (`package.json`/lock unchanged; no
  axios/pg/@types/pg), workflow YAML, `src/seed.ts`, `main`, or accepted-runtime change. **Permission:** none new.
- Preserves all 5A / 5B / C1 / C2 / C3 / C4 / C5 accepted references and behaviours.

---

## 1. Accepted & closeout SHAs, frozen tag
- **Accepted implementation SHA:** `03215ec` (`feat/legacy-etl`).
- **Closeout SHA:** `<this commit>` (this document).
- **Frozen tag:** annotated `p5c-c6-accepted` → dereferences to commit `03215ec` (pushed, no force).

## 2. Authoritative CI evidence — GREEN at exact head `03215ec`
- **Workflow:** `wsi-auto-ingestion-acceptance` · **id** `321629868` · **run #8** · **run id** `30414325901`
- **URL:** https://github.com/akutonsol/cytolab/actions/runs/30414325901
- **Event:** `workflow_dispatch` · **Branch:** `feat/legacy-etl` · **Head SHA:** `03215ec` (run header + REST agree)
- **Conclusion:** `success` · **Wall-clock:** `2026-07-29T01:31:52Z → 01:34:18Z` · all **17** steps success (workers ON, real libvips).
- **Artifact:** `p5b-b2-auto-ingestion-acceptance` (9478 bytes, not expired).
- **Persisted-truth (authoritative — DB assertions, not the log alone):**
  ```
  C6 interop: Afs=INGESTED Aweb=INGESTED Bfs=INGESTED Bweb=INGESTED dedup=DUPLICATE shaEq=true negatives=5/5 dziA=READY dziB=READY
  P5B-B2/B4/B5a + P5C-C2/C3/C4/C5/C6 … : all persisted-truth assertions passed.
  ```
  (C2/C3/C4/C5 lines all remained GREEN in the same run — full regression preserved.)

## 3. What C6 delivered
- **Fixture B** (`dicom-wsi-fixture-b.ts`): an INDEPENDENTLY constructed (not a parameterised Fixture-A call)
  in-profile VL WSI object — distinct implementation class UID/version, UID roots (`…9999.8888.*`), tile/matrix
  geometry, optional-tag presence, accession/specimen content, fictional Manufacturer/model/software, and a
  deterministic private creator + private element — plus deterministic decode-negative builders (bit-depth,
  TILED_SPARSE, multi-optical-path, wrong-SOP, MONOCHROME). Committed as tiny synthetic binaries (ts-jest cannot
  run dcmjs `write`; the gate generates equivalents live).
- **Unit specs:** consolidated C1/C2 accept/reject matrix (owning gate + structured code + NC/US class); Fixture B
  independence + vendor/private/PHI non-persistence; QIDO / multipart / filesystem interop characterisation.
- **Acceptance (folded into `assert-wsi-autoingest-state.ts`, no YAML edit):** the cross-transport × two-fixture
  positive matrix, two-lab byte equivalence, same-lab dedup, byte-different non-collapse, private/vendor/PHI
  non-persistence, real libvips DZI structural invariants, live negative matrix, and C5 health independence.
- **Doc:** `PROGRAM_5C_C6_CONFORMANCE_MATRIX.md` (accepted profile, accept/reject matrix, provenance, truthful claim).

## 4. Accepted vendor-neutral profile (unchanged from C1/C2)
SOP `1.2.840.10008.5.1.4.1.1.77.1.6`; uncompressed Implicit/Explicit VR LE; RGB/3-sample; 8-bit; TILED_FULL;
exactly one optical path; exactly one instance; positive/sufficient frame geometry; native uncompressed pixels.
Two-tier: C1 accepts the JPEG family as VALID, the C2 decode gate narrows to uncompressed LE (JPEG →
C2-UNSUPPORTED). No profile widened by C6.

## 5. Classification governance (already enforced; asserted by C6)
Precedence `NONCONFORMANT > UNSUPPORTED > VALID`. UNSUPPORTED = valid-but-outside-profile (wrong SOP, compressed
syntax, non-RGB, non-8-bit, non-TILED_FULL, multi-optical-path, multi-instance). NONCONFORMANT = malformed/missing/
invalid structure (UID, geometry, frame count, optical-path sequence). UNMATCHED/AMBIGUOUS = accession outcomes.
`FAILED` reserved for genuine retryable transport/processing faults. No object outside the profile creates a
`DigitalSlide` / `SlideIngestion` / `SlideProcessingJob`.

## 6. Interoperability truths proven (persisted DB assertions)
- **Two independent fixtures × two transports → READY-unpublished:** A/filesystem, A/dicomweb, B/filesystem, B/dicomweb.
- **Cross-transport equivalence (two labs, identical bytes):** equal native SHA-256 (`shaEq=true`), equal
  transport-independent DICOM identity + allowlist metadata + VALID conformance; only labId/source/discovery/
  sourceRef differ.
- **Same-lab identity dedup:** re-delivered Study/Series in one lab → `DUPLICATE`, exactly one clinical identity.
- **Byte-different non-collapse:** A ≠ B → two distinct slides/identities, never checksum-collapsed.
- **Vendor/private/PHI:** Fixture B carries fictional Manufacturer/model/software + a private tag + PHI in native
  bytes; none reach `SlideDicomMetadata`, routing, decoding, conformance, or matching (source-reviewed + tested).
- **DZI invariants (real libvips):** all four positive paths sealed+verified, DZI descriptor + tile pyramid +
  manifest, `tiledWidth/tiledHeight/tileSize/levelCount` present, non-zero tiles, `publishedGenerationId=null`
  (READY ≠ PUBLISHED). Structural invariants — not byte-identical archives (JPEG tiling is engine-version-dependent).
- **Negative matrix (live):** wrong-SOP/bit-depth/TILED_SPARSE/multi-optical-path/MONOCHROME → UNSUPPORTED with no
  slide/ingestion/job (`negatives=5/5`); NONCONFORMANT cases proven at the C1 contract level.
- **C5 independence:** health checks over C6 sources remain read-only (created no discovery); scheduler default OFF;
  no health change from DUPLICATE/UNSUPPORTED outcomes.

## 7. Truthful claim (maximum authorised)
> "Osieri accepts a defined vendor-neutral subset of DICOM VL Whole Slide Microscopy Image objects — uncompressed
> RGB, 8-bit, TILED_FULL, single optical path and single instance — through filesystem and DICOMweb transports,
> and processes supported objects through a common native-byte ingestion and DZI pipeline, with per-object
> conformance classification."

**Prohibited:** full DICOM conformance · universal scanner compatibility · commercial-vendor certification ·
named-vendor compatibility · all transfer syntaxes/VL-WSI profiles · JPEG/JPEG-LS/JPEG 2000 decoding · MONOCHROME ·
multiple optical paths · multi-instance assembly · diagnostic/clinical validation · regulatory approval ·
PACS/VNA interoperability beyond tested read operations.

## 8. Regressions preserved at head `03215ec`
The single authoritative gate re-exercised, all GREEN: 5A (upload/processing/tiling/sealing/verification/publication
boundary), 5B (legacy FILESYSTEM, stability, checksum dedup, accession matching, reconciliation, B5-a monitoring),
C1 (conformance/allowlist/identity), C2 (native DICOM, checksum provenance, supported/unsupported, READY-not-
PUBLISHED), C3 (DICOMweb import/auth/SSRF/WADO native-byte/multi-instance/tenancy), C4 (static registry/routing/
delegation/idempotency/completeness), C5 (source health independence + 5-minute cadence + no-side-effect). Legacy
`adapterType=null` FILESYSTEM scanning, accepted permissions, and tenancy all preserved.

## 9. Deviations / deferred (characterised, not patched)
- **Preflight §18 corrected:** the watch-folder scanner lower-cases the file extension, so mixed-case `.DCM`/`.Dcm`
  are **already discovered** — accepted current behaviour, not a deferred gap.
- **Compressed-codec fixtures** (real JPEG/JPEG 2000/JPEG-LS bytes) — need a codec; out of scope. The
  compressed→UNSUPPORTED case is proven via the C1 transfer-syntax gate + C2 decode-set membership.
- **QIDO pagination > 100** and **multipart bare-LF trailing separator** — characterised as current behaviour;
  deliberately not broadened/patched.

## 10. Program 5C status & remaining C7 scope
With C6 accepted and frozen, the **Program 5C build (C1–C6) is complete and frozen**. The only remaining stage is
**C7 — Program 5C closeout & provenance reconciliation:** the program-level closure record reconciling the
C1→C6 accepted-SHA/tag chain, the consolidated conformance/interop claim, and the final Program 5C freeze. C7 is
explicitly **out of scope** for this closeout and has not been started.
