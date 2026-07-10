# Releases

| Field | Value |
|---|---|
| Status | Active |
| Current Phase | Ongoing |
| Owner | Founder |
| Dependencies | None |
| Last Updated | 2026-07-10 |
| Priority | P1 |
| Expected Next Milestone | Next tagged release |

Version history for every product and the platform. Each entry records what shipped, what
broke, how to migrate, and how it was verified. Helix follows semantic versioning
(see [01_HELIX.md](01_HELIX.md)); PathOS ships as dated sprint releases.

Entry template:

```
### [product] [version] — [date]

- Summary:
- Breaking changes:
- Migration notes:
- Verification:
```

---

## Helix

### Helix 1.0.0 — 2026-07-10

- Summary: Feature complete and frozen. Five-tier token architecture; product and marketing
  typography; 8px spacing rhythm; two-curve/six-duration motion grammar; full Tier-4
  component layer; three independent experience budgets; one feedback language; four
  executable guards plus the zero-orange pixel detector. Milestone tag `helix-v1.0`.
- Breaking changes: None (initial stable release).
- Migration notes: None. Products consume Helix and supply one theme; they do not fork it.
- Verification: `tsc` clean; production build clean; `check:merge-contract`,
  `check:motion-grammar`, `measure:experience`, `verify-feedback` green; zero-orange 0px.
  Full record in [../HELIX_v1.0.md](../HELIX_v1.0.md) and [../EXPERIENCE_REPORT.md](../EXPERIENCE_REPORT.md).

## PathOS / CYTOLAB

The design-system and experience work shipped as sprints. Each preserved existing behaviour
(no breaking changes to routes, APIs, auth, or business logic). Detail for Sprints 7–10 is in
[../EXPERIENCE_REPORT.md](../EXPERIENCE_REPORT.md).

### PathOS Sprint 10 — 2026-07-10 · Complete Helix Feedback System

- Summary: One feedback language. 192 `message.*` calls migrated to 296 `notify.*`; per-page
  toast renderers retired; 198-mutation acknowledgement audit; Button `loading` adoption;
  dismiss-by-meaning; accessibility (aria-live polarity, keyed dedupe, Escape dismiss).
- Breaking changes: None.
- Migration notes: Two files remain on the legacy renderer, blocked by pre-existing
  uncommitted edits (see [07_TECHNICAL_DEBT.md](07_TECHNICAL_DEBT.md)).
- Verification: `tsc`, production build, three guards, `verify-feedback` green; zero-orange
  0px on rendered toasts.

### PathOS Sprint 9 — 2026-07-10 · One motion language

- Summary: Page/drawer/modal transitions, table row insert/remove, card hover, button press,
  loading choreography, shared easing, reduced-motion compliance; `check:motion-grammar`.
- Breaking changes: None.
- Migration notes: None.
- Verification: `check:motion-grammar` green (each assertion proven able to fail).

### PathOS Sprint 8 — 2026-07-09 · Perceived performance

- Summary: `loading.tsx`, skeleton system, Suspense, `GlobalProgress`, Button `loading`,
  mutation acknowledgements; the three latency classes made independently measurable.
- Breaking changes: None.
- Migration notes: None.
- Verification: `measure:experience` — cold start, route loading, interaction all within
  budget; no false empty state while loading.

### PathOS Sprint 6 — 2026-07-09 · Architecture completion

- Summary: IconAction, Table to 100%, Input system, EmptyState/TableEmpty, Security fold
  (structural, zero visual change), typography audit; the `cn()` merge-contract rule and its
  executable guard.
- Breaking changes: None (pixel parity preserved).
- Migration notes: None.
- Verification: `check:merge-contract` green; pixel parity on migrated screens.

### PathOS Sprint 5 — 2026-07-09 · Helix component rollout

- Summary: Helix primitives adopted across the application at pixel parity; component
  inventory and adoption percentages.
- Breaking changes: None.
- Migration notes: None.
- Verification: Pixel-diff parity per migrated screen; zero-orange.

### PathOS Sprint 4 — 2026-07-09 · Motion tokens + core component primitives

- Summary: Tier-1 motion system; Card, Button, Input, Badge, Table, EmptyState,
  SectionContainer; piloted on five representative screens to validate the API.
- Breaking changes: None.
- Migration notes: None.
- Verification: Pixel parity on pilot screens.

### PathOS Sprint 3 — 2026-07-09 · Semantic colour + domain token layer

- Summary: The five-tier token architecture ratified; `#4F46E5 → --color-primary`; the
  Tier 2.5 domain layer introduced.
- Breaking changes: None.
- Migration notes: Retire a hex by pointing it at a Tier-1 token; never edit a Tier-2 value.
- Verification: Zero-orange; documented colour exceptions preserved.

### Earlier sprints (marketing foundation)

Sprint 1 (premium typography system) and Sprint 2 (enterprise spacing tokens; marketing
motion 2.1–2.6) established the marketing foundation. See the git history and
[../DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md).

## Tierstrum

_No releases yet._

## 12 Circle Fitness

_No releases yet._
