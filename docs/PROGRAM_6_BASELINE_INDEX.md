# Program 6 — Accepted Baseline Index

Single authoritative reference for every accepted Program 6 phase. **Append-only:** update a row **only** when
its phase is formally accepted and frozen. `origin/feat/program-6-ai-foundation` is the authoritative Program 6
history; each acceptance tag is the immutable governance anchor.

Per the stage convention: **Implementation Candidate** = the exact implementation/evidence head the authoritative
CI ran against · **Frozen Head** = the accepted stage head the acceptance tag points to (typically the closeout
commit; for 6B, 6C, and 6D the governance authorization pinned the tag to the exact evidence head — `1c27092` for 6B,
`1e31c4f` for 6C, `b20a69c` for 6D, `71efc5c` for 6E, `47e08ca` for 6F, with the closeout/index commit kept as a
descendant of the frozen evidence head) · **Accepted Tag** = annotated `p6-<phase>-accepted`. (6E's Implementation Candidate column shows the
original candidate `8d91c41` → its governance-directed terminal-state reconciliation `e0227a3`, the head CI ran against.)

| Phase | Implementation Candidate | Frozen Head | Accepted Tag | Status |
|-------|--------------------------|-------------|--------------|--------|
| 6A — AI Infrastructure | `93ee7d7` | `391dcd8` | `p6-6a-accepted` → `391dcd8` | **Accepted & Frozen** |
| 6B — Dataset Governance | `1c27092` | `1c27092` | `p6-6b-accepted` → `1c27092` | **Accepted & Frozen** |
| 6C — Inference Engine | `1f1856b` | `1e31c4f` | `p6-6c-accepted` → `1e31c4f` | **Accepted & Frozen** |
| 6D — Explainability | `dd3338e` | `b20a69c` | `p6-6d-accepted` → `b20a69c` | **Accepted & Frozen** |
| 6E — Human Review Workflow | `8d91c41` → `e0227a3` | `71efc5c` | `p6-6e-accepted` → `71efc5c` | **Accepted & Frozen** |
| 6F — Validation | `b9b9da6` | `47e08ca` | `p6-6f-accepted` → `47e08ca` | **Accepted & Frozen** |
| 6G — Continuous Evaluation | — | — | — | Not Started |
| 6H — Clinical Performance | — | — | — | Not Started |

## Authoritative CI evidence
| Phase | Workflow | Run | Result |
|-------|----------|-----|--------|
| 6A | `p6-ai-registry-acceptance` (id `323140077`) | run `30500388811` (#2, `workflow_dispatch`, `feat/program-6-ai-foundation` @ `93ee7d7`) | success — AI-registry 18/18, reporting-service 3/3, strict tsc 0 errors, persisted assertions all passed |
| 6B | `p6-dataset-governance-acceptance` (id `323445791`) | run `30512769904` (#2, `workflow_dispatch`, `feat/program-6-ai-foundation` @ `1c27092`) | success — dataset-governance 14/14, Program-5/6A non-regression 30/30, strict tsc 0 errors, persisted assertions all passed (6 tables, 5 enums, 14 RESTRICT FKs) |
| 6C | `p6-inference-engine-acceptance` | run `30516569762` (#1, `workflow_dispatch`, `feat/program-6-ai-foundation` @ `1e31c4f`) | success — inference-engine 24/24, Program-5/6A/6B non-regression 44/44, strict tsc 0 errors, persisted assertions all passed (2 tables, 2 enums, 9 RESTRICT FKs, raw active-job partial-unique index verified) |
| 6D | `p6-explainability-acceptance` | run `30558022107` (#1, `workflow_dispatch`, `feat/program-6-ai-foundation` @ `b20a69c`) | success — explainability 26/26, Program-5/6A/6B/6C non-regression 68/68, strict tsc 0 errors, persisted assertions all passed (4 tables, 2 enums, 11 RESTRICT FKs; no raw-SQL invariant) |
| 6E | `p6-human-review-acceptance` | run `30567815696` (#1, `workflow_dispatch`, `feat/program-6-ai-foundation` @ `71efc5c`) | success — human-review 20/20, Program-5/6A-6D non-regression 94/94, strict tsc 0 errors, persisted assertions all passed (4 tables, 2 enums, 12 RESTRICT FKs; no raw-SQL invariant) |
| 6F | `p6-validation-acceptance` | run `30574190699` (#1, `workflow_dispatch`, `feat/program-6-ai-foundation` @ `47e08ca`) | success — validation 19/19, Program-5/6A-6E non-regression 114/114, strict tsc 0 errors, persisted assertions all passed (4 tables, 1 enum, 9 RESTRICT FKs; no raw-SQL invariant) |

## CI registration infrastructure (NOT accepted-implementation lineage)
The Program 6 acceptance gate is registered on the default branch (`main`) so it is `workflow_dispatch`-dispatchable;
these commits are CI infrastructure only — no product/schema/runtime change, byte-identical to the Program 6 branch copy:
- `944f90c` — initial 6A gate registration on `main`
- `b69a3b9` — reporting-spec workflow registration update on `main`
- `0a9d87c` — initial 6B gate registration on `main`
- `2067a9f` — full-history-checkout 6B gate re-registration on `main` (byte-identical to branch copy `1c27092`)
- `dce2981` — 6C gate registration on `main` (byte-identical blob `765ee78` to branch copy `1e31c4f`)
- `5fd274e` — 6D gate registration on `main` (byte-identical blob `d5f83a5` to branch copy `b20a69c`)
- `639d5af` — 6E gate registration on `main` (byte-identical blob `c71deba` to branch copy `71efc5c`)
- `9bb4ddc` — 6F gate registration on `main` (byte-identical blob `a837326` to branch copy `47e08ca`)

## Notes
- Each phase opens only via its own **read-only preflight** + **explicit implementation authorization**, and is
  accepted only on a **GREEN exact-head authoritative CI run**, then frozen with `p6-<phase>-accepted`.
- Program 6 references — and never modifies — the frozen **Program 5** baseline (see `PROGRAM_5C_CLOSEOUT.md`).
- Charter: `PROGRAM_6_CHARTER.md`. Per-phase records: `PROGRAM_6_<phase>_DESIGN.md` / `PROGRAM_6_<phase>_CLOSEOUT.md`.
