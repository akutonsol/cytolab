# Program 5A — Digital Pathology — Closeout & Release Readiness

**Status:** functionally complete; **one** formal gate outstanding (P5-5 delivery HTTP e2e).
**Branch:** `feat/legacy-etl`  ·  **Head at closeout:** `d0993e4`  ·  **Date:** 2026-07-23
**Scope:** evolved the existing Tier-5 WSI vertical into an enterprise digital-pathology pipeline
(ingestion → verified derivatives → sealed/verified generations → manual publication → authenticated
delivery → automated worker), preserving provenance/audit/tenancy/security foundations. No greenfield.

Commit hashes below are the source of truth; reference commit **messages** (stable across rebases), not
raw SHAs, when closing risk-register entries.

---

## 1. Frozen checkpoints (chronological)

| Checkpoint | Commit | What it froze |
|---|---|---|
| P5-0 Architecture | `31f18db` | `OSIERI_DIGITAL_PATHOLOGY_ARCHITECTURE.md`; phased roadmap |
| P5-1A Domain model + migration | `33af1d4` | `DigitalSlide` extension; `SlideIngestion`/`SlideProcessingJob`/`DerivativeGeneration`/`SlideAsset`; enums; published partial-unique index |
| P5-3A Upload orchestration | `c7fd09b` | Private source object store; slide-ingestion service/controller |
| P5-3B.0 Processing schema | `a39faa8` | `MANIFEST` asset role; worker-lease columns + active-job partial-unique index |
| P5-3B.1A Job orchestration + leases | `3d9ccd2` | `JobLeaseService` (claim/renew/terminalize/reclaim); queue enqueue+reconcile; scheduler (coordination only) |
| P5-3B.1B Materializer + derivative store | `3ef697c` | Verified→working-file materializer; immutable write-once derivative object store |
| P5-3B.1C-i Tiling engine + validation | `82733a0` | Engine contract; fake engine; libvips adapter; untrusted-output validator |
| P5-3B.1C-ii Job processor + bootstrap | `ee5ff05` | `SlideProcessingProcessor.process()` → PROCESSING generation, assets registered, acquisition reconcile |
| P5-3B.2A Manifest builder + integrity | `4747f5a` | Canonical serializer; per-level persisted-byte digests; pure `buildManifest` |
| P5-3B.2B Atomic sealing + job completion | `c2234e5` | `GenerationSealer` → QC_PENDING + `SUCCEEDED` job + single MANIFEST asset (atomic) |
| P5-3B.3A Verification compute | `0ad700f` | `GenerationVerifier` (STORAGE⟷MANIFEST⟷DB triangulation); typed `readObject` contract |
| P5-3B.3B-i Verification provenance schema | `b431df6` | `VerificationOutcome` enum; append-only `GenerationVerification`; `verifiedAt` |
| P5-3B.3B-ii-a Certified-state fingerprint | `54cd2be` | `verification-fingerprint.ts`; `VERIFICATION_VERSION`; verifier `certifiedState` |
| P5-3B.3B-ii-b Verdict applier | `0e4d5fe` | `GenerationVerdictService.applyVerdict` (FOR UPDATE + stale guard + atomic verdict/provenance) |
| P5-4a Publication provenance schema | `5873d40` | `PublicationAction` enum; append-only `GenerationPublication` (shared `publicationEventId`); `supersededAt` |
| P5-4b Publication service | `79aa6db` | `SlidePublicationService.publish` — atomic demote→promote→repoint→provenance |
| P5-5A-i Delivery session schema | `0c07dde` | `DeliveryScope` enum; `DeliverySession` (tokenHash-only, scopes, expiry, revocation) |
| P5-5A-ii Delivery runtime + streaming | `f005ea5` | Published resolver; `DeliverySessionService` (issue/redeem/revoke); `openReadStreamChecked` |
| P5-5B-i Delivery auth wiring | `a7f8c65` | Issuance endpoint; `DeliveryTokenGuard`; `@DeliveryProtected`; `wsi:view` catalog entry |
| P5-5B-ii Artifact serving | `197ae62` | `ArtifactDeliveryService`; descriptor/tile/manifest/associated routes; failure→HTTP mapping |
| W-i Processing worker loop | `1a12329` | Claim/process/seal runtime; heartbeat→abort; durable failure disposition; drain |
| W-ii Verification worker | `d0993e4` | Immediate + reconciling verification → READY\|QC_FAILED; Option-B slot separation |

Supporting/adjacent (same span): `5654484`, `b1760ac` (sealed audit generations).

---

## 2. Final lifecycle / state machine

```
DigitalSlide.availabilityStatus:  DRAFT ──(publish)──▶ PUBLISHED ──(archive*)──▶ ARCHIVED   (*not built)

SlideIngestion:        UPLOADING → UPLOADED → VERIFIED   (FAILED on bad checksum)
SlideProcessingJob:    QUEUED → RUNNING → SUCCEEDED | FAILED | TIMED_OUT
                        (retry via reconcile iff isRetryable(errorCode) && attempt < maxAttempts)

DerivativeGeneration:  PROCESSING ─seal─▶ QC_PENDING ─verify─▶ READY | QC_FAILED
                                                         │
                                          READY ─publish─▶ PUBLISHED ; prior PUBLISHED ─▶ SUPERSEDED
```

**Automated pipeline (worker enabled):** `VERIFIED ingestion → reconcile → QUEUED → claim → RUNNING →
process → tile → promote → seal → QC_PENDING (+ job SUCCEEDED) → immediate/periodic verify → READY |
QC_FAILED`. **The worker stops at READY | QC_FAILED. Publication is a human/clinical action.**

**Provenance (append-only, RESTRICT-on-delete):** `GenerationVerification` (PASSED/FAILED, reasons, verifier
version, manifest checksum) and `GenerationPublication` (PUBLISHED/SUPERSEDED, shared event id, actor).

**Read path:** authenticated staff (`wsi:view`) → issues a generation-bound, scope-limited, hashed,
revocable/expiring `DeliverySession` → delivery-bearer artifact routes stream immutable derivatives.
Source objects are structurally unreachable from delivery (generation-prefix confinement; no source store).

---

## 3. Outstanding gate (blocks 100% formal closure)

| Gate | Requirement | Status |
|---|---|---|
| **P5-5 delivery HTTP e2e** | `WSI_DELIVERY_E2E=1` run passes once in a full-app/CI env (migrated DB + deps): proves HTTP issuance → capability → streamed artifact + credential separation (staff-JWT-alone→401, query-token→401, missing→404, `private, no-store`) | ⏳ **pending** (cannot bootstrap full app locally) |

Until this passes: P5-5B-ii **code approved/committed**; **P5-5 overall = provisional**; **Program 5A =
functionally complete, not formally closed.**

---

## 4. Deferred / not-built (intentional)

- **Program 9 — Production launch:** cloud provisioning, live cutover, real secrets. Terraform validated
  but **not applied** (all recurring resources gated `provision_* = false`).
- **Archive / unpublish** slide lifecycle (`ARCHIVED`).
- **QC_FAILED remediation/reprocessing** workflow (worker never auto-reprocesses).
- **Byte-range requests** in delivery (not needed by the current DZI viewer).
- **Associated-image MIME:** served as `application/octet-stream` (format not persisted on `SlideAsset`);
  a future schema refinement could persist it.
- **MANIFEST viewer scope:** the `/manifest` route exists but ordinary issuance grants only
  `DESCRIPTOR/TILES/ASSOCIATED_IMAGES`.
- **Delivery caching relaxation** beyond `private, no-store` (revisit after viewer testing).
- **Case-assignment-scoped viewing authz** (baseline is lab membership + `wsi:view`).

---

## 5. Operational enablement (required to run in an environment)

| Concern | Requirement |
|---|---|
| **DB migrations** | Apply the P5 migration chain (`migrate deploy`) to the target DB. |
| **Worker activation** | `WSI_PROCESSING_WORKER=true` **and** `NODE_ENV != test`. Default OFF ⇒ no claim/process/verify. Startup validates `0 < heartbeatIntervalMs ≤ leaseDurationMs/3` and the verify budgets, else fails fast. |
| **Worker tuning (env)** | `WSI_PROCESSING_{LEASE_MS,HEARTBEAT_MS,RECLAIM_MS,RECONCILE_MS,MAX_ATTEMPTS,CONCURRENCY,CLAIM_MS,DRAIN_MS}`; `WSI_VERIFY_{CONCURRENCY,BATCH,INTERVAL_MS}`. |
| **Tiling engine** | `WSI_TILING_ENGINE=fake` (CI) or `libvips` (real; requires the native binary). Unsupported value fails fast. |
| **Object stores** | `WSI_SOURCE_STORE_DIR` / `WSI_DERIVATIVE_STORE_DIR` (local); a GCS impl of the same interfaces lands in Program 9. |
| **Permission grant** | `wsi:view` is **cataloged but granted to no default role** — assign it to the intended staff roles (explicit role-config decision). Super-roles bypass. |
| **Delivery** | `WSI_DELIVERY_{TTL_MS,MAX_TTL_MS}`; tokens travel **only** in `Authorization: Bearer` (never URL/cookie/query). |
| **Delivery e2e** | `WSI_DELIVERY_E2E=1` to run the gated HTTP suite in CI. |

---

## 6. Release-readiness checklist

- [x] Domain model + all migrations authored, validated on a fresh DB, physical shape confirmed (FKs/indexes/enums).
- [x] Processing spine: leased jobs, immutable derivatives, canonical manifest, atomic sealing.
- [x] Independent verification with certified-state stale guard + append-only provenance.
- [x] Manual publication with atomic supersession + append-only provenance.
- [x] Delivery capability model (hashed/scoped/expiring/revocable) + authenticated artifact serving.
- [x] Source objects structurally unreachable from delivery; strict tile-coordinate validation.
- [x] Worker activation (processing + verification), default-OFF, durable retry, heartbeat abort, drain.
- [x] Full WSI regression green (24 suites + 1 gated; 177 tests + 4 skipped) · `tsc` clean.
- [ ] **P5-5 delivery HTTP e2e passes once (`WSI_DELIVERY_E2E=1`) in CI.** ← only open gate.
- [ ] `wsi:view` assigned to intended roles in the target environment (operator action).
- [ ] Worker enabled + tuned in the target environment (operator action).
- [ ] Program 9 provisioning/cutover (separate program; deferred).

---

**Bottom line:** the clinical WSI artifact lifecycle, read path, and automated worker are implemented,
tested, and frozen. The single remaining item before formal Program 5A closure is a green
`WSI_DELIVERY_E2E=1` run in a full-app/CI environment; everything else is either done or an explicit,
recorded deferral.
