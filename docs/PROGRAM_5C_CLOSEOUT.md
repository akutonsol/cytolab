# Program 5C — Scanner & DICOM Whole-Slide Imaging — PROGRAM CLOSEOUT

**Status:** **COMPLETE · ACCEPTED · FROZEN.** This is the master governance record consolidating Program 5C
stages **C1–C6**. The per-stage closeouts remain the authoritative stage records; this document reconciles and
references them, records the immutable provenance chain, and seals the program. It introduces **no** runtime,
schema, migration, API, workflow, dependency, permission, or operational change — it is provenance and
governance only.

Companion authoritative stage records: [C2](./PROGRAM_5C_C2_CLOSEOUT.md) · [C3](./PROGRAM_5C_C3_CLOSEOUT.md) ·
[C4](./PROGRAM_5C_C4_CLOSEOUT.md) · [C5](./PROGRAM_5C_C5_CLOSEOUT.md) · [C6](./PROGRAM_5C_C6_CLOSEOUT.md) ·
[C6 conformance matrix](./PROGRAM_5C_C6_CONFORMANCE_MATRIX.md).

---

## 1. Program purpose
Add standards-based digital-pathology intake to Osieri: accept scanner/DICOM Whole-Slide Imaging output through
vendor-neutral transports and process it through the **one accepted** native-byte → DZI pipeline established in
Program 5A, without a second ingestion/processing/publication path and without vendor-specific runtime behaviour.

## 2. Canonical requirements
Standards-conformant native DICOM VL WSI object → accepted transport → accepted adapter → common C1 structural
conformance gate → common C2 decode-profile gate → native-byte checksum/provenance → exact accession + tenant
match → accepted processing worker → real libvips DZI → sealed and verified → **READY → unpublished** (human
`wsi:publish` gate). Rejections are truthfully classified and create no slide/ingestion/job. Operational health
of ingestion connections is observable but never mutates intake. No new transport, worker, tiler, codec, or
publication path; no vendor branching; lab-scoped tenancy throughout.

## 3. Accepted implementation lineage
| Stage | Scope | Accepted head |
|---|---|---|
| **C1** | DICOM WSI contracts, Prisma schema & structured conformance taxonomy (foundation) | `3d476d7` |
| **C2** | Native local DICOM WSI ingestion → decode → real DZI; checksum provenance; supported/unsupported truth; READY-not-PUBLISHED | `7e2a657` |
| **C3** | DICOMweb import: QIDO/WADO, SSRF guard, auth, byte-exact multipart, single-instance profile, tenancy | `bf0455d` |
| **C4** | Vendor-neutral scanner-adapter framework (static DI registry; filesystem-DICOM → C2, DICOMweb → C3); sourceRef idempotency | `628a1f1` |
| **C5** | Source health + enterprise import monitoring (1:1 current snapshot; 5-minute cadence floor; read-only, side-effect-free; default-OFF scheduler) | `d895738` |
| **C6** | Conformance & cross-vendor interoperability acceptance (independent Fixture B; cross-transport two-lab equivalence; negative matrix) — test/doc only | `03215ec` |

**C1 provenance note:** C1 established the DICOM WSI contracts, schema, and conformance foundation and was frozen
at `3d476d7`. Its runtime behaviour was first exercised end-to-end under the accepted **C2** implementation and
its authoritative acceptance workflow. The `p5c-c1-accepted` tag is a **provenance artefact only** — it
introduces no code, schema, or behavioural change and completes the symmetric C1→C6 acceptance chain.

## 4. Frozen tag lineage (immutable)
```
p5b-accepted     → f20d4a9
p5c-c1-accepted  → 3d476d7   (provenance artefact; acceptance subsumed under C2)
p5c-c2-accepted  → 7e2a657
p5c-c3-accepted  → bf0455d
p5c-c4-accepted  → 628a1f1
p5c-c5-accepted  → d895738
p5c-c6-accepted  → 03215ec
```
Master closeout commit: `<this commit>`.

## 5. Authoritative workflow evidence
Every runtime stage was accepted GREEN on the single gated workflow **`wsi-auto-ingestion-acceptance`**
(id `321629868`, `workflow_dispatch`, branch `feat/legacy-etl`, workers ON + real libvips), each at its exact head:

| Stage | Run # | Run id | Head | Conclusion |
|---|---|---|---|---|
| C2 | #4 | `30364074258` | `7e2a657` | success |
| C3 | #5 | `30368120232` | `bf0455d` | success |
| C4 | #6 | `30372027564` | `628a1f1` | success |
| C5 | #7 | `30384973237` | `d895738` | success |
| C6 | #8 | `30414325901` | `03215ec` | success |

C1 has no standalone gate run (contracts/schema — no runtime surface of its own); it is validated behaviourally
under the C2 run and every subsequent run. The C6 run (#8) additionally re-exercised 5A/5B/C1–C5 all GREEN in one
gate — see §11.

## 6. Consolidated supported DICOM conformance boundary
Accepted profile (frozen at C1/C2): SOP `1.2.840.10008.5.1.4.1.1.77.1.6`; uncompressed Implicit/Explicit VR LE;
RGB / 3 samples; 8-bit; TILED_FULL; exactly one optical path; exactly one instance; positive & internally
sufficient frame geometry; native uncompressed pixel data. Two-tier truth: C1 accepts the JPEG family as VALID,
the C2 decode gate narrows to uncompressed LE (JPEG/JPEG-LS/JPEG 2000 → C2-UNSUPPORTED). Classification precedence
`NONCONFORMANT > UNSUPPORTED > VALID`; UNMATCHED/AMBIGUOUS are accession outcomes; `FAILED` is reserved for
genuine retryable transport/processing faults. No object outside the profile creates a slide/ingestion/job. The
exhaustive accept/reject matrix and structured error codes are recorded in
[`PROGRAM_5C_C6_CONFORMANCE_MATRIX.md`](./PROGRAM_5C_C6_CONFORMANCE_MATRIX.md).

## 7. Consolidated interoperability boundary
Two accepted transports — **FILESYSTEM_DICOM** and **DICOMWEB** — route to the same native-byte intake and DZI
pipeline via thin C4 adapters. Cross-transport delivery of identical native bytes yields equal native SHA-256 +
equal transport-independent DICOM identity/allowlist metadata/conformance + equivalent processing truth (proven
across two labs, since identical bytes ⇒ same Study/Series ⇒ same-lab identity dedup). Byte-different objects are
never collapsed. Two independently constructed conformant fixtures interoperate over both transports with no
vendor-specific branch. **Truthful claim:** "Osieri accepts a defined vendor-neutral subset of DICOM VL WSI
objects — uncompressed RGB, 8-bit, TILED_FULL, single optical path and single instance — through filesystem and
DICOMweb transports, and processes supported objects through a common native-byte ingestion and DZI pipeline, with
per-object conformance classification." **Not claimed:** full DICOM conformance, universal/named-vendor
compatibility or certification, all transfer syntaxes/profiles, JPEG/JPEG-LS/JPEG 2000 decoding, MONOCHROME,
multiple optical paths, multi-instance assembly, diagnostic/clinical validation, regulatory approval, or PACS/VNA
interoperability beyond tested read operations.

## 8. Frozen architectural decisions
- **Convert-to-DZI, one pipeline** — DICOM/scanner intake feeds the accepted 5A worker + libvips; no second path.
- **Native-byte checksum + identity dedup** — SHA-256 over exact native bytes; DICOM dedup by `(labId, Study, Series)`; byte dedup advisory-only.
- **Static Nest DI registries** — scanner adapters (`SCANNER_ADAPTERS`) and health checkers (`SOURCE_HEALTH_CHECKERS`); no dynamic/plugin/DB-instantiated loading.
- **C3 outbound safety** — HTTPS/host-allowlist/private-IP/redirect/timeout/size-cap SSRF guard; AES-256-GCM credentials decrypted in-process only, never persisted/logged/returned.
- **C5 health** — 1:1 current snapshot only (no history/event/counter tables); 5-minute cadence floor; default-OFF scheduler; read-only and independent of intake.
- **PHI/vendor/private discipline** — persist only the metadata allowlist; vendor/private/PHI never routed, decoded, matched, persisted, or logged.
- **No vendor-specific runtime branching** anywhere in dicom/dicomweb/scanner/health.
- **Acceptance model** — one folded `wsi-auto-ingestion-acceptance` gate; stage evidence added via branch-side seed/assert scripts, no per-stage YAML.

## 9. Cross-cutting guarantees (held across C1–C6)
Lab-scoped tenancy (AsyncLocalStorage + Prisma extension); READY-not-PUBLISHED human gate; no auto-publish;
structured error taxonomies (no raw messages/URLs/credentials/PHI); rejected inputs create no slide/ingestion/job;
health checks create no discovery/ingestion/slide/job; legacy `adapterType=null` FILESYSTEM scanning preserved;
no new permission (reuses `system:ingestion`, `wsi:reconcile`, `wsi:publish`); additive-only migrations.

## 10. Deliberately NOT implemented
JPEG/JPEG-LS/JPEG 2000 or any compressed-codec decode; MONOCHROME/YBR; TILED_SPARSE; multiple optical paths;
multi-instance/concatenation assembly; native DICOM viewer delivery / WADO frame rendering / STOW-RS; PACS/VNA
write-back; scanner command-control / hardware telemetry / SNMP / fleet administration; automatic publication; a
second worker/tiler/pipeline; QIDO auto-pagination beyond a single page; multipart bare-LF-trailing correction;
any new runtime dependency. These are out of the accepted boundary and remain future-program candidates.

## 11. Regression-preservation evidence
The C6 authoritative run **#8 (`30414325901`, head `03215ec`)** re-exercised the full stack in one gate — all
GREEN: 5A (upload/processing/real tiling/sealing/verification/publication boundary), 5B (legacy FILESYSTEM,
stability, checksum dedup, accession matching, reconciliation, B5-a monitoring), C1 (conformance/allowlist/
identity), C2 (native DICOM, checksum provenance, supported/unsupported, READY-not-PUBLISHED), C3 (DICOMweb
import/auth/SSRF/WADO native-byte/multi-instance/tenancy), C4 (registry/routing/delegation/idempotency/
completeness), C5 (health independence + 5-minute cadence + no-side-effect). No accepted behaviour regressed
across the program.

## 12. Whole-of-program assessment
`configured DICOM/scanner source → accepted transport (filesystem | DICOMweb) → thin C4 adapter → common C1
structural + C2 decode gates → native-byte checksum/provenance → exact accession + tenant match → accepted
worker → real libvips DZI → sealed + verified → READY → unpublished`, with observable, side-effect-free source
health and truthful per-object conformance/interoperability classification. Coherent, closed, and consistent
across all six stages and both transports.

## 13. Governance and rollback boundary
Frozen stages C1–C6 are historical records and are **not amended**. Any behavioural, architectural, schema,
operational, interoperability, or conformance change is reopened only under a **new program or governance stage**
with its own authoritative acceptance — never by editing a frozen stage, retagging, or force-pushing. **Program 5C
has no remaining open program-scoped risks** (`docs/architecture/RISK_REGISTER.md` records none scoped to
Program 5C). The pre-existing `stash@{0}` WIP is unrelated to Program 5C and is preserved untouched.

## 14. Program freeze declaration
**Program 5C is complete, accepted, and frozen.** Any future behavioural, architectural, schema, operational,
interoperability, or conformance change must occur under a new programme or governance stage. Frozen stages
C1–C6 are historical records and are not amended.
