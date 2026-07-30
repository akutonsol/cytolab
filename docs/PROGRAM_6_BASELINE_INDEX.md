# Program 6 — Accepted Baseline Index

Single authoritative reference for every accepted Program 6 phase. **Append-only:** update a row **only** when
its phase is formally accepted and frozen. `origin/feat/program-6-ai-foundation` is the authoritative Program 6
history; each acceptance tag is the immutable governance anchor.

Per the stage convention: **Implementation Candidate** = the exact implementation/evidence head the authoritative
CI ran against · **Frozen Head** = the accepted stage head the acceptance tag points to (typically the closeout
commit; for 6B the governance authorization pinned the tag to the exact evidence head `1c27092`) · **Accepted Tag** =
annotated `p6-<phase>-accepted`.

| Phase | Implementation Candidate | Frozen Head | Accepted Tag | Status |
|-------|--------------------------|-------------|--------------|--------|
| 6A — AI Infrastructure | `93ee7d7` | `391dcd8` | `p6-6a-accepted` → `391dcd8` | **Accepted & Frozen** |
| 6B — Dataset Governance | `1c27092` | `1c27092` | `p6-6b-accepted` → `1c27092` | **Accepted & Frozen** |
| 6C — Inference Engine | — | — | — | Not Started |
| 6D — Explainability | — | — | — | Not Started |
| 6E — Human Review Workflow | — | — | — | Not Started |
| 6F — Validation | — | — | — | Not Started |
| 6G — Continuous Evaluation | — | — | — | Not Started |
| 6H — Clinical Performance | — | — | — | Not Started |

## Authoritative CI evidence
| Phase | Workflow | Run | Result |
|-------|----------|-----|--------|
| 6A | `p6-ai-registry-acceptance` (id `323140077`) | run `30500388811` (#2, `workflow_dispatch`, `feat/program-6-ai-foundation` @ `93ee7d7`) | success — AI-registry 18/18, reporting-service 3/3, strict tsc 0 errors, persisted assertions all passed |
| 6B | `p6-dataset-governance-acceptance` (id `323445791`) | run `30512769904` (#2, `workflow_dispatch`, `feat/program-6-ai-foundation` @ `1c27092`) | success — dataset-governance 14/14, Program-5/6A non-regression 30/30, strict tsc 0 errors, persisted assertions all passed (6 tables, 5 enums, 14 RESTRICT FKs) |

## CI registration infrastructure (NOT accepted-implementation lineage)
The Program 6 acceptance gate is registered on the default branch (`main`) so it is `workflow_dispatch`-dispatchable;
these commits are CI infrastructure only — no product/schema/runtime change, byte-identical to the Program 6 branch copy:
- `944f90c` — initial 6A gate registration on `main`
- `b69a3b9` — reporting-spec workflow registration update on `main`
- `0a9d87c` — initial 6B gate registration on `main`
- `2067a9f` — full-history-checkout 6B gate re-registration on `main` (byte-identical to branch copy `1c27092`)

## Notes
- Each phase opens only via its own **read-only preflight** + **explicit implementation authorization**, and is
  accepted only on a **GREEN exact-head authoritative CI run**, then frozen with `p6-<phase>-accepted`.
- Program 6 references — and never modifies — the frozen **Program 5** baseline (see `PROGRAM_5C_CLOSEOUT.md`).
- Charter: `PROGRAM_6_CHARTER.md`. Per-phase records: `PROGRAM_6_<phase>_DESIGN.md` / `PROGRAM_6_<phase>_CLOSEOUT.md`.
