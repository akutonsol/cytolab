# Architecture Decision Record

| Field | Value |
|---|---|
| Status | Active |
| Current Phase | Ongoing |
| Owner | Founder |
| Dependencies | None |
| Last Updated | 2026-07-10 |
| Priority | P0 |
| Expected Next Milestone | Recorded per decision |

Permanent record of major architecture decisions across all products. A decision that
shapes the foundation, a product's structure, or a cross-product practice is recorded here.
Decisions are append-only; when superseded, mark the old entry and add a new one.

---

## Template

```
### ADR-NNN · [title]

- Date:
- Decision:
- Context:
- Alternatives:
- Reasoning:
- Consequences:
- Status: Accepted | Superseded by ADR-NNN | Deprecated
```

---

## Decisions

### ADR-001 · Five-tier token architecture

- Date: 2026-07-09
- Decision: Colour and motion flow through five tiers — primitive → semantic → domain
  (Tier 2.5) → theme → component. Themes override only Tier 2. Components consume semantic,
  domain, and motion tokens; never raw hex, duration, or hue.
- Context: Multiple products will share one foundation; each needs its own brand without
  forking components.
- Alternatives: A flat token set; a three-tier system without a domain layer; per-product
  component forks.
- Reasoning: The domain layer lets business meaning stay fixed while brand expression varies
  by theme. The contract prevents raw values leaking into components.
- Consequences: A theme is a bundle of five dimensions, not a colour swap. Retiring a hex
  means pointing it at a Tier-1 token, never editing a Tier-2 value.
- Status: Accepted.

### ADR-002 · Two-surface colour split (product indigo, marketing red)

- Date: 2026-07-09
- Decision: The product UI is indigo (`#4F46E5` → `--color-primary`); marketing is red
  (`#E63946`). Do not recolor the product.
- Context: The product and marketing surfaces serve different audiences and moods.
- Alternatives: A single brand colour across both; recoloring one to match the other.
- Reasoning: The split is a locked brand decision; the product's calm indigo suits clinical
  work, the marketing red suits acquisition.
- Consequences: A documented, unresolved contradiction exists (standalone marketing site
  ships indigo). It is recorded, not silently resolved. See [../DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md) §1e.
- Status: Accepted.

### ADR-003 · Helix is a consumed package, not a fork

- Date: 2026-07-09
- Decision: Helix lives as a standalone package (`@helix/design-system`) at
  `~/Documents/projects/helix`. Products consume it and add a theme; they never fork it.
- Context: The long-term goal is a reusable foundation across many products.
- Alternatives: Copy the design system into each product; a monorepo-only shared folder.
- Reasoning: One source of truth for the contract; products stay thin (core + one theme).
- Consequences: Extraction of product-specific pieces happens on product #2, not by
  refactoring PathOS now.
- Status: Accepted.

### ADR-004 · Custom utilities are part of the merge contract

- Date: 2026-07-09
- Decision: Any custom Tailwind utility namespace (typography, spacing, sizing, colour,
  radius, shadow, motion) must be registered in `extendTailwindMerge` in `ui/cn.ts` in the
  same change, enforced by `check:merge-contract`.
- Context: A custom utility tailwind-merge does not know about is mis-grouped and silently
  evicted by a later class in the same group.
- Alternatives: Rely on review; avoid custom utilities.
- Reasoning: It shipped once (`text-label-sm` evicted by `text-secondary`, tables rendered at
  16px instead of 12px). The failure mode is invisible without the guard.
- Consequences: The merge contract is a permanent rule with an executable guard.
- Status: Accepted.

### ADR-005 · Three independent experience latency classes

- Date: 2026-07-09
- Decision: Cold startup, route loading, and interaction feedback are measured as three
  independent budgets, never collapsed into one number.
- Context: A good score in one class can hide a bad score in another; they have different
  causes and fixes.
- Alternatives: A single performance score.
- Reasoning: Sprint 8 nearly optimised the wrong thing by conflating cold start with route
  loading.
- Consequences: `measure:experience` reports all three plus the no-false-empty-state
  invariant, each provably able to fail.
- Status: Accepted.

### ADR-006 · One feedback language (notify over a single renderer)

- Date: 2026-07-10
- Decision: Every action and failure is acknowledged once, from one renderer (`lib/notify.ts`
  over a single keyed antd holder), on a timer set by meaning. Server-provided errors are
  preserved.
- Context: Two renderers (antd message and a per-page toast) showed two visual languages for
  the same event.
- Alternatives: Keep per-page toasts; build a bespoke renderer.
- Reasoning: One keyed renderer removes duplication, prevents duplicate screen-reader
  announcements, and centralizes dismiss timing by meaning.
- Consequences: Button `loading` is width-preserving (spinner replaces the leading icon; the
  label does not change) to avoid layout shift. Undo is only added where truly reversible.
- Status: Accepted.

### ADR-007 · Migrations are diffed to timestamped SQL; `prisma db push` banned

- Date: 2026-07-09
- Decision: Generate migrations with `prisma migrate diff --from-schema-datasource … --script`
  into a timestamped SQL file, applied with `prisma migrate deploy`. `prisma db push` is
  banned; `prisma migrate dev` needs a TTY and is not used headless.
- Context: Headless, reproducible migrations without destructive schema pushes.
- Alternatives: `db push`; `migrate dev`.
- Reasoning: Deterministic, reviewable SQL; no accidental data loss.
- Consequences: Every tenant-owned model carries `labId`; tenancy enforced via
  AsyncLocalStorage + a Prisma extension.
- Status: Accepted.

### ADR-008 · The AI service must never throw

- Date: 2026-07-09
- Decision: The AI reporting path degrades gracefully and never throws; redaction stays in
  place; every AI surface has a defined unavailable state.
- Context: Clinical safety and reliability; AI is assistive, not authoritative.
- Alternatives: Fail loudly on AI errors.
- Reasoning: The pathologist must always be able to proceed; AI proposes, a human signs.
- Consequences: Human-in-the-loop by default across AI features.
- Status: Accepted.

### ADR-009 · Freeze Helix at v1.0

- Date: 2026-07-10
- Decision: Helix v1.0 is feature complete and frozen. No new tokens, primitives, or
  abstractions; no refactors unless a real product proves it insufficient. Helix evolves only
  through versioned releases; product work takes priority.
- Context: Ten sprints completed the architecture; further framework work would be
  speculative without a product driving it.
- Alternatives: Continue open-ended framework development.
- Reasoning: An abstraction proven by one product is a guess; two make it a system. Stop and
  build products.
- Consequences: Future ideas are parked in [05_HELIX_v1_1.md](05_HELIX_v1_1.md) until a
  product justifies them.
- Status: Accepted.
