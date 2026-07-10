# Roadmap Index

The entry point for all product and platform planning. This is a product and platform
roadmap, not a feature backlog. It describes every active initiative, who owns it, its
current phase, and where its detail lives.

| Field | Value |
|---|---|
| Status | Active |
| Current Phase | Roadmap established; PathOS Phase 2 next |
| Owner | Founder |
| Dependencies | Helix v1.0 (frozen) |
| Last Updated | 2026-07-10 |
| Priority | P0 |
| Expected Next Milestone | PathOS Phase 2 kickoff |

---

## How to use this directory

- Every initiative has one roadmap document. That document is its single source of truth
  for planning.
- Existing engineering documentation is **referenced, not moved or duplicated**. Where a
  roadmap needs detail that already exists (architecture, design system, technical debt),
  it links to the authoritative file instead of restating it.
- Every roadmap document opens with the same header block: Status, Current Phase, Owner,
  Dependencies, Last Updated, Priority, Expected Next Milestone.
- Cross-links between documents are expected. Decisions live in `06_DECISIONS.md`, debt in
  `07_TECHNICAL_DEBT.md`, and shipped versions in `08_RELEASES.md` regardless of product.

## Portfolio model

All products are built on one shared foundation. The foundation knows nothing about any
product; a product is the foundation plus one theme plus its own domain layer.

```
Helix Design System (core, frozen v1.0)
        │
        ├── PathOS / CYTOLAB      product #1   (Active)
        ├── Tierstrum             company      (Planning)
        └── 12 Circle Fitness     product      (Planning)
```

## Active initiatives

| # | Initiative | Status | Owner | Priority | Current Phase | Last Updated | Dependencies |
|---|---|---|---|---|---|---|---|
| 01 | [Helix Design System](01_HELIX.md) | Released (v1.0) | Founder | P0 | Frozen | 2026-07-10 | None |
| 02 | [PathOS / CYTOLAB](02_PATHOS.md) | Active | Founder | P0 | Phase 1–3 shipped; Phase 2 (product) next | 2026-07-10 | Helix v1.0 |
| 03 | [Tierstrum](03_TIERSTRUM.md) | Planning | Founder | P1 | Brand + website | 2026-07-10 | Helix v1.0 |
| 04 | [12 Circle Fitness](04_12CIRCLE.md) | Planning | Founder | P2 | Concept | 2026-07-10 | Helix v1.0 (+ theme) |

## Registers (cross-product)

| # | Register | Purpose |
|---|---|---|
| 05 | [Helix v1.1 Parking Lot](05_HELIX_v1_1.md) | Future Helix ideas. Not active work. Each entry states the product that exposed the gap. |
| 06 | [Decision Record (ADR)](06_DECISIONS.md) | Permanent architecture decisions across all products. |
| 07 | [Technical Debt](07_TECHNICAL_DEBT.md) | All debt in one place, grouped by product, with priority and reason for deferring. |
| 08 | [Releases](08_RELEASES.md) | Version history for every product and the platform. |

## Referenced engineering documentation (authoritative, not duplicated here)

| Document | Owns |
|---|---|
| [../HELIX_v1.0.md](../HELIX_v1.0.md) | The frozen Helix v1.0 specification. |
| [../DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md) | Full token and component reference. |
| [../CLAUDE.md](../CLAUDE.md) | Engineering constitution and hard constraints. |
| [../ARCHITECTURE.md](../ARCHITECTURE.md) | System architecture and tech-migration phases. |
| [../EXPERIENCE_REPORT.md](../EXPERIENCE_REPORT.md) | Experience audit and Sprint 7–10 record. |
| [../TECH_DEBT.md](../TECH_DEBT.md) | PathOS/platform debt backlog (TD-001…). |
| [../ROADMAP.md](../ROADMAP.md) | Original CYTOLAB build-phase roadmap. |
| [../BRAND_GUIDELINES.md](../BRAND_GUIDELINES.md) | Brand rules. |

## Conventions

- **Priority:** P0 (foundational / current focus), P1 (next), P2 (later), P3 (someday).
- **Status vocabulary:** Released, Active, Planning, Future, Frozen, Blocked.
- **Owner:** currently a single founder across all initiatives; the field exists so it can
  split as the team grows.
- **Last Updated:** ISO date. Update it whenever a document's substance changes.
