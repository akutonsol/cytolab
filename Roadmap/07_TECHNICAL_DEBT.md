# Technical Debt

| Field | Value |
|---|---|
| Status | Active |
| Current Phase | Ongoing |
| Owner | Founder |
| Dependencies | None |
| Last Updated | 2026-07-10 |
| Priority | P1 |
| Expected Next Milestone | Reviewed each phase boundary |

One place for all debt across every product, grouped by product. This is a register: it
references the authoritative detail rather than duplicating it. The full PathOS/platform
backlog lives in [../TECH_DEBT.md](../TECH_DEBT.md); Helix convergence debt is specified in
[../HELIX_v1.0.md](../HELIX_v1.0.md) §12.

Priority: P0…P3. Effort: S (hours), M (days), L (weeks).

---

## Helix

Intentional convergence debt carried into the freeze. Do not reconcile without a product
need (see [01_HELIX.md](01_HELIX.md)). Detail in [../HELIX_v1.0.md](../HELIX_v1.0.md) §12.

| Item | Priority | Effort | Reason for deferring |
|---|---|---|---|
| Two typography families in tables (reference vs slate) | P3 | M | Convergence is a design decision, not a migration; a `family` axis makes the choice expressible without forcing it. |
| IconAction off-tier tones (21 sites) | P3 | S | Held at pixel parity via explicit overrides; converging is a reviewable recolour pass, not urgent. |
| Security Center geometry via escape-hatch builders | P3 | M | Structural convergence done; visual convergence deferred to a dedicated design pass. |
| Documented colour exceptions (processing hue, delete danger, marketing indigo vs red, cabinet swatches) | P3 | S | Recorded deliberately; each is a decision to revisit, not a bug. |

## PathOS

Authoritative backlog: [../TECH_DEBT.md](../TECH_DEBT.md) (TD-001…TD-010). Summary:

| Item | Priority | Effort | Reason for deferring |
|---|---|---|---|
| TD-001 `@cytolab/types` / `@cytolab/config` not yet consumed | P2 | M | Works without them; consumption is cleanup, not capability. |
| TD-002 `@cytolab/shared` orphan package | P3 | S | No current consumer; remove or adopt later. |
| TD-003 Web Sentry client-only (no server instrumentation/sourcemaps) | P2 | M | Client coverage sufficient for now; server observability is a hardening item. |
| TD-004 No Redis / queue — jobs run in-process | P1 | L | Acceptable at current scale; needed before enterprise load. |
| TD-005 `HeroVial` imperative three.js, not R3F | P3 | M | Works; refactor only if the hero changes. |
| TD-006 Framework behind target (Next 14 / React 18 → 15 / 19) | P2 | L | Stable on current versions; upgrade is a planned pass, not urgent. |
| TD-007 Stale `.next-prod/types/**` trips `tsc` | P3 | S | Cosmetic noise; `rm -rf .next-prod` clears it. |
| TD-008 No project-wide ESLint | P2 | M | Type checking + guards cover the critical cases; linting is additive. |
| TD-009 `@cytolab/animations` only partially consumed | P3 | S | Partial adoption is harmless; finish opportunistically. |
| TD-010 `WorkflowSection.tsx` orphaned | P3 | S | Dead code; remove in a cleanup pass. |

Feedback-system carryover (Sprint 10):

| Item | Priority | Effort | Reason for deferring |
|---|---|---|---|
| Two files on the legacy toast renderer (`change-requests`, `SettingsListPane`) | P2 | S | Their toast lines interleave with pre-existing uncommitted edits; cannot be staged in isolation. Migrate once those edits land. |
| Unattributed `overflow-x: hidden` in `globals.css` | P3 | S | Left uncommitted pending a decision on whether it was intentional. |
| 23 `isPending` text-swaps on raw `<button>` | P3 | M | Converting requires a component migration, barred "just to adopt a primitive." |

## Tierstrum

_No recorded debt yet. The codebase is early; add entries as it matures._

## 12 Circle Fitness

_No recorded debt yet. No codebase exists._

## Review cadence

Reviewed at every product phase boundary. Items that become blocking are promoted in
priority; items resolved are moved to the Resolved section of the authoritative file they
came from ([../TECH_DEBT.md](../TECH_DEBT.md)).
