# Program 6 · Phase 6A — AI Infrastructure — Acceptance Closeout

**Status:** **ACCEPTED · FROZEN.** The AI-infrastructure architecture only — a lab-scoped model registry, versioned
metadata with permanent immutable identity, an append-only lifecycle state machine, and an inert inference-record
provenance shell. **No runtime inference or prediction functionality.** A parallel subsystem to the existing
text-reporting AI path (untouched); references the frozen Program 5 baseline and modifies nothing in it. Charter:
[`PROGRAM_6_CHARTER.md`](./PROGRAM_6_CHARTER.md) · Design of record: [`PROGRAM_6_6A_DESIGN.md`](./PROGRAM_6_6A_DESIGN.md).

---

## 1. Accepted scope
- **Lab-scoped AI model registry** (`AiModel`) — tenant-scoped via the Prisma tenancy extension (`labId`), cross-lab access fails closed; model `key` unique per lab.
- **Immutable model and model-version UUID identities** (`AiModel.modelUuid`, `AiModelVersion.versionUuid`) — permanent, independent of key/displayName/semver.
- **Semantic versioning** (`AiModelVersion` major/minor/patch), unique per logical model.
- **Lifecycle governance** — `DRAFT → VALIDATION → APPROVED → DEPRECATED → RETIRED` (+ `VALIDATION → DRAFT` send-back); `RETIRED` is terminal. Legal-only transitions; illegal and concurrent transitions cause no partial mutation.
- **Append-only lifecycle events** (`AiModelLifecycleEvent`) — exactly one event per successful transition; shared `eventId`; `onDelete: Restrict`.
- **Separate permissions** `aimodel:view`, `aimodel:manage`, `aimodel:promote` — granted to no default role (super-role reach only); `promote` (lifecycle transition, incl. → APPROVED) distinct from `manage`.
- **Inert `InferenceRecord` provenance shell** — created so the architecture exists; never written in 6A; identity + lab + model-version reference + optional slide reference + `requestedAt` + provenance digest only.
- **All Program 6A provenance foreign keys use `ON DELETE RESTRICT`** (8 FKs) — accepted provenance cannot lose its subject/version reference via a later deletion.
- **No runtime inference or prediction functionality.**

## 2. Accepted implementation lineage
| SHA | Meaning |
|---|---|
| `cf1da89` | Program 6 governance baseline |
| `2f820e3` | initial 6A implementation |
| `13beb74` | inert-shell + RESTRICT correction |
| `599f827` | initial 6A acceptance gate |
| `1618c72` | strict-TypeScript baseline correction |
| **`93ee7d7`** | **final exact-head candidate (reporting-spec gate)** |

**CI infrastructure commits (recorded separately — NOT part of the accepted implementation lineage):**
| SHA (on `main`) | Meaning |
|---|---|
| `944f90c` | initial workflow registration on `main` (default-branch `workflow_dispatch` registration) |
| `b69a3b9` | reporting-spec workflow registration update on `main` |

These `main` commits are **CI registration infrastructure only** — a `workflow_dispatch`-only gate, byte-identical to
the Program 6 branch copy. They are not the accepted Phase 6A implementation and carry no product/schema/runtime change.

## 3. Authoritative acceptance evidence
- **Workflow:** `p6-ai-registry-acceptance` · **Workflow ID:** `323140077`
- **Run number:** `2` · **Run ID:** `30500388811`
- **Event:** `workflow_dispatch` · **Branch:** `feat/program-6-ai-foundation`
- **Exact tested SHA:** `93ee7d7` (run header + in-run `git rev-parse HEAD == github.sha` verified)
- **Conclusion:** `success`

Accepted results:
- catalogue permissions: **3** (`aimodel:view/manage/promote`)
- lifecycle events: **6**
- concurrent transition winners: **1**
- inference rows: **0**
- provenance foreign keys: **8, all `RESTRICT`**
- AI-registry tests: **18/18**
- reporting-service tests: **3/3**
- TypeScript: **zero errors** (strict `npx tsc --noEmit -p tsconfig.json`, exit 0)
- persisted-state assertions: **all passed** (catalogue, no-default-grant, tenancy, cross-lab fail-closed, key + semver uniqueness, permanent UUIDs, legal lifecycle, concurrency safety, one-event-per-transition, RETIRED terminal, promote≠manage, inert/empty shell, RESTRICT FKs, reporting-path intact, screening unconnected).

An earlier run (`30474154789`, `#1`, head `1618c72`, success) remains valid supporting evidence; the `#2` run at
`93ee7d7` is the authoritative acceptance evidence.

## 4. Frozen reconciliation decisions
- Program 6 clinical/image AI remains **separate** from `AiService` and `AiDraft`.
- The existing reporting AI path remains **unchanged**.
- `AIScreeningResult` remains a **Legacy Demonstration Component** — not connected to or legitimised by the Program 6 registry.
- `InferenceRecord` remains **inert until Phase 6C**. Runtime, status, timing, prediction, result, confidence, and execution semantics remain deferred.
- **Program 5 remains immutable.**

## 5. Deferred scope (NOT in Phase 6A)
datasets or ground truth · inference execution · workers or queues · explainability · human review · validation
metrics · confidence calibration · continuous evaluation · clinical-performance reporting.

## 6. Freeze statement
**Program 6 · Phase 6A is immutable.** Future work must reference the accepted Phase 6A registry and provenance
foundation rather than modifying its accepted historical baseline. Corrections require a separately governed amendment.
