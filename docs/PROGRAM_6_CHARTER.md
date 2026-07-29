# Program 6 — AI Foundation — CHARTER & ROADMAP

**Status:** DRAFT charter (governance framing for a NEW programme). Not yet accepted; no engineering authorized.
This document establishes the scope, invariants, phase structure, hard non-goals, and lifecycle for Program 6.
It **references** the frozen Program 5 baseline and modifies nothing in it.

---

## 1. Purpose
Establish the complete, **truthful** AI infrastructure for Cytolab/Osieri — model management, dataset governance,
traceable inference, human oversight, and performance measurement — **without making unsupported diagnostic
claims**. AI is **optional and human-supervised** at every phase. The human always owns the diagnosis.

## 2. Governing invariants (asserted at every phase)
1. **AI is optional.** The platform is fully functional with AI disabled; no clinical path depends on AI output.
2. **The human owns the diagnosis.** AI produces drafts/assists only; a pathologist accepts, rejects, or modifies.
3. **No unsupported claims.** No diagnostic, treatment, autonomy, or regulatory claim beyond what a model
   version's own validation evidence supports (Phase 6F). Explainability assists; it never asserts correctness.
4. **Immutable, traceable records.** Every model version, dataset version, and inference is an append-only,
   provenance-bearing record — the Program 5 "engineering / verification / governance" evidence separation.
   Every model and model version additionally carries a **permanent internal identity (UUID)** assigned at
   creation that never changes even as human-facing names/keys evolve; downstream inference records and audit
   logs reference that identity, not the display fields.
5. **No PHI duplication.** Datasets and inference records **reference** Program-5-accepted slides by identity;
   PHI is never copied into an AI table (the C6 metadata-allowlist / no-copy discipline).
6. **Lab-scoped tenancy** throughout (AsyncLocalStorage + Prisma extension), as in Programs 2–5.
7. **Graceful degradation.** AI services never throw into a clinical path; redaction is preserved (consistent
   with the existing Claude-based AI reporting path the codebase already keeps).
8. **References, never modifies, frozen Program 5.** No 5A–5C commit/tag/schema/closeout is amended.

## 3. Phase structure
| Phase | Name | Core deliverables | Explicitly still NOT |
|---|---|---|---|
| **6A** | AI Infrastructure | model registry; model metadata (modelId, semver, provenance); inference-job model (immutable records); model lifecycle Draft→Validation→Approved→Deprecated→Retired | no image inference, no predictions — architecture only |
| **6B** | Dataset Governance | validation datasets; training-dataset references; immutable dataset versions; dataset provenance; inclusion/exclusion rules; ground-truth labels; annotation lineage | never duplicate PHI; always reference Program-5-accepted slides |
| **6C** | Inference Engine | inference execution; inference queue; model selection; inference provenance; runtime metadata; timing; deterministic audit trail | no diagnostic claims |
| **6D** | Explainability | heatmaps; attention overlays; feature regions; probability distributions | explainability assists users; it does not justify correctness |
| **6E** | Human Review Workflow | AI Draft → pathologist review → Accept / Reject / Modify → final diagnosis | the human always owns the diagnosis |
| **6F** | Validation | sensitivity, specificity, ROC, precision, recall, confusion matrices, calibration curves, operating thresholds | validation belongs to the **model version**, not the slide |
| **6G** | Continuous Evaluation | drift; calibration decay; inference latency; confidence distribution; failure rate; model retirement | no automatic retraining |
| **6H** | Clinical Performance | reader agreement; turnaround impact; review time; workload reduction; concordance; operational KPIs | measures the AI; creates no new diagnoses |

Sequencing is strict: 6C only after 6A+6B; 6D after inference exists; 6E after 6D; 6F–6H after inference is real.

## 4. Hard non-goals (out of Program 6 — later programmes only)
Autonomous diagnosis · treatment recommendations · AI replacing a pathologist · model **training** pipelines ·
federated learning · LLM report generation · automatic model updates · adaptive models · reinforcement learning ·
scanner-specific AI · vendor-specific AI. Program 6 must not quietly drift into any of these to make a phase "work."

## 5. Relationship to the existing AI reporting path
The codebase already keeps a **Claude-based AI reporting path** (`apps/api/src/modules/ai/` — `AiService` +
allowlist redaction + append-only `AiDraft`; graceful-degradation, redaction-preserving). It solves a **different
problem** (text-reporting assist) from clinical image inference. Program 6 leaves it **untouched**: clinical
inference is a **parallel subsystem**; the reporting path is not refactored, and may only *optionally* reference
the registry in a later phase.

**Legacy Demonstration Component.** The existing `AIScreeningResult` (`ai-screening.service.ts`) is a **simulated
demonstration** (`Math.random` over the human's own entry; "not available for clinical use; no slide-image
analysis performed"). It is formally classified a **Legacy Demonstration Component**: still functional, still
truthful, **not clinical**, **not connected to Program 6 inference**, and **removable by a future governance
stage**. Program 6 neither builds on it nor legitimizes it; its future is a later governance decision, not a 6A
implementation change.

## 6. Per-phase lifecycle (same discipline as Program 5)
For each phase: **READ-ONLY PREFLIGHT** (repository-truth + design, one of DESIGN READY / GOVERNANCE DECISION
REQUIRED / REPOSITORY EVIDENCE REQUIRED) → explicit implementation authorization → narrow implementation →
**authoritative exact-head CI acceptance** → per-phase closeout → provenance reconciliation → **freeze** with an
annotated `p6-<phase>-accepted → <sha>` tag. Engineering, verification, and governance evidence stay distinct.

## 7. Evidence & provenance model
- **Engineering:** implementation commits on a Program-6 feature branch (never `main`, never a frozen tag).
- **Verification:** authoritative exact-head CI per phase (a Program-6 acceptance workflow; reuse the folded-gate
  pattern where possible — no per-phase YAML churn if avoidable).
- **Governance:** per-phase closeouts + a Program 6 master closeout + this charter; an immutable
  `p6-*-accepted` tag chain analogous to `p5c-*-accepted`.

## 8. What this charter does NOT do
It authorizes no engineering, schema, migration, dependency, permission, workflow, or runtime change. It is a
governance frame. Phase 6A begins only after its read-only preflight is reviewed and explicitly authorized.
