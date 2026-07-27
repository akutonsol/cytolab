# Program 5 — Roadmap Crosswalk & Label Erratum

**Status:** Documentation only. This file records numbering, maps session-era labels to the
canonical roadmap, and states current checkpoint status. It changes no code, tests, workflows,
tags, or historical records.

**Authoritative source:** [`docs/OSIERI_DIGITAL_PATHOLOGY_ARCHITECTURE.md`](./OSIERI_DIGITAL_PATHOLOGY_ARCHITECTURE.md)
**§13 "Phased roadmap (Programs 5A–5C)"** is the single, canonical numbering for Program 5.
Where any other document, commit message, tag, or note uses a different Program 5 label, this
crosswalk reconciles it to §13. §13 wins on every conflict.

---

## 1. Why this file exists

Program 5 accreted a second, informal numbering during implementation (a "delivery e2e"
labelled P5-5, a clinical-review vertical labelled P5-6.1–6.4, an undefined "P5-6b", and a
"Program 5A complete/frozen" shorthand). Those labels collide with the canonical §13 numbers
and describe different work. This document freezes the canonical meaning so future work
references §13 only, without rewriting any historical commit or tag.

---

## 2. Label crosswalk (session-era → canonical §13)

| Session-era label | What it actually delivered | Canonical §13 mapping |
|---|---|---|
| "P5-5 delivery e2e" | Authenticated tile-delivery session (issue/redeem/revoke) + authenticated tile/manifest/descriptor endpoints + private-storage boundary | **P5-3C** (authenticated delivery). **Not** canonical P5-5. |
| "P5-6.1 – P5-6.4" clinical review/publish | Read-only clinical-review surface, `wsi:review`/`wsi:publish` authorization, controlled publication over the sealed lifecycle, and the review-drawer UI | **P5-2R — Clinical Review & Controlled Publication**, an **extension of canonical P5-2** (lifecycle/provenance/publication). **Not** canonical P5-6. |
| "P5-6b" | Undefined shorthand; not defined by any committed design | **Retired.** Do not use. If a real checkpoint is needed later, define it in §13 first. |
| "Program 5A complete / frozen" | The delivered subset: core lifecycle + authenticated delivery (through canonical **P5-3C**) + the P5-2R clinical-review/publication surface | Applies **only to that delivered subset** — **not** to canonical P5-4, P5-5, P5-6, or P5-7. |

### 2a. P5-2R naming note

"P5-2R" is introduced here as the durable canonical name for the clinical-review & controlled-
publication capability, marked as an **extension of P5-2** because §13 does not enumerate it as
an independent numbered checkpoint. Future references to the accepted clinical-review work should
use **P5-2R**, not "P5-6.x".

---

## 3. Immutable historical tag

- **`p5-6.4-accepted`** points to `145b689213df3263e6afc65f00174a7722fb7204`, the accepted
  implementation of **P5-2R** (session-era label "P5-6.4"). Acceptance evidence:
  [`docs/PROGRAM_5B_P5-6-4_CLOSEOUT.md`](./PROGRAM_5B_P5-6-4_CLOSEOUT.md).
- This tag is **immutable history**. Do **not** rename, move, or delete it. Its "6.4" is a
  session-era label; this crosswalk supplies the canonical meaning (P5-2R). The tag name is
  preserved exactly as shipped so historical references keep resolving.

---

## 4. Canonical checkpoint status

Refreshed at Program 5A Phase-1 closeout (P5-9). Each accepted checkpoint carries its immutable tag +
narrow closeout doc; §13 remains authoritative for the definition of each checkpoint.

| Canonical §13 checkpoint | Status | Accepted tag / evidence |
|---|---|---|
| **P5-0** Architecture & domain design | **Accepted** | 5A closeout (`31f18db`) |
| **P5-1** Domain model & migration | **Accepted** | 5A closeout (`33af1d4`) |
| **P5-2** Lifecycle, provenance & generation integrity | **Accepted** | 5A closeout (P5-3B chain) |
| **P5-2R** Clinical review & controlled publication (ext. of P5-2) | **Accepted** | `p5-6.4-accepted` → `145b689` |
| **P5-3A** Upload orchestration & private storage | **Accepted** | 5A closeout (`c7fd09b`) |
| **P5-3B** Tiling worker & sealed generations | **Accepted** | 5A closeout (`a39faa8..b431df6`) |
| **P5-3C** Authenticated tile-delivery & private-storage boundary | **Accepted** | 5A closeout, delivery e2e gate `9563737` |
| **P5-4** Viewer on real in-platform tiles / retire paste-URL | **Accepted** | `p5-4-phase-a/b-part1/b-part2-accepted` → `9fc0f49` / `a73090c` / `5391293` |
| **P5-5** Metadata & indexing (search over slides) | **Accepted** | `p5-5-accepted` → `b911def` |
| **P5-6** Multi-slide orchestration | **Accepted** | `p5-6-accepted` → `2094003` |
| **P5-7** Case & specimen integration | **Accepted** | `p5-7-accepted` → `a1b11ee` |
| **P5-8** Asset-graph search & navigation | **Accepted** | `p5-8-accepted` → `c360a19` |
| **P5-9** Phase-1 validation & closeout | **Accepted** | `p5-9-accepted` / `program-5a-phase1-accepted` (see [`PROGRAM_5A_PHASE1_CLOSEOUT.md`](./PROGRAM_5A_PHASE1_CLOSEOUT.md)) |

**Program 5A / Phase 1 is complete** at this record. Full **Program 5** additionally requires **Program 5B**
(automated ingestion) and **Program 5C** (scanner & DICOM WSI), both of which remain **future work**.

> Historical note: an earlier line 58–61 of this table (pre-P5-9) recorded P5-4/P5-5/P5-6 as *Unopened* and
> P5-7 as *Partial* — the shipping state at that earlier writing. That is superseded by the accepted status
> above; the numbered checkpoints were subsequently implemented and frozen under the tags shown.

---

## 5. Recommended sequence

**P5-4 → P5-5 → P5-6**, with **P5-7 completion** afterward or alongside.

P5-4 is placed first because it is the earliest unopened canonical checkpoint and it wires the
product viewer to the already-complete authenticated delivery boundary (P5-3C); P5-5 (search) and
P5-6 (multi-slide) then operate on slides served through that real in-platform pipeline. P5-7
completion (surfacing the captured specimen linkage) can proceed in parallel.

---

## 6. Scope & rollback

Documentation only — a single new file. No code, test, workflow, tag, or existing historical
record is modified. Reversible with `git revert` of the commit that adds this file. The
`p5-6.4-accepted` tag and all prior closeout records are left exactly as they are.
