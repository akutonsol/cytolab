# Helix Design System

| Field | Value |
|---|---|
| Status | Released (v1.0) |
| Current Phase | Frozen |
| Owner | Founder |
| Dependencies | None (foundation) |
| Last Updated | 2026-07-10 |
| Priority | P0 |
| Expected Next Milestone | None until a product proves v1.0 insufficient |

Helix is the shared, brand-neutral design system every product is built on. It is now
frozen at v1.0. This document is the planning-level summary; the authoritative
specification is [../HELIX_v1.0.md](../HELIX_v1.0.md), with full detail in
[../DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md) and the constraints in [../CLAUDE.md](../CLAUDE.md).

---

## Current version

**1.0.0** — feature complete, architecture frozen. Milestone tag: `helix-v1.0`.

## Version history

| Version | Date | Summary |
|---|---|---|
| 1.0.0 | 2026-07-10 | Feature complete. Five-tier token architecture, typography, spacing, motion grammar, full component layer, experience principles, engineering guards, accessibility rules, and verification philosophy. Frozen. |

Detailed release entries live in [08_RELEASES.md](08_RELEASES.md). Sprint-by-sprint history
is in [../HELIX_v1.0.md](../HELIX_v1.0.md) §11.

## Architecture summary

A five-tier, contract-based system. Each tier references only the tier below it; a component
never reaches past the contract to a raw value.

```
Tier 1  Primitive   raw ramps + motion primitives   (brand-agnostic)
Tier 2  Semantic    the UI contract                 (themes override only this tier)
Tier 2.5 Domain     business semantics              (per product)
Tier 3  Theme       per-product re-pointing
Tier 4  Component   consumes Tier 2 / 2.5 + motion
```

Load-bearing invariant: a theme may change brand or UI expression but must never change
business meaning. Components consume only semantic, domain, and motion tokens — never a raw
hex, raw duration, or hue name. Full description in [../HELIX_v1.0.md](../HELIX_v1.0.md) §1–6.

## Engineering principles

1. Measure before changing.
2. Prove by rendered pixels, not by source.
3. Every guard must be able to fail before it is trusted.
4. Pixel parity first on any migration that is not a deliberate redesign.
5. Document exceptions; do not silently change them.
6. Drive the real flow against a production build.

The three executable guards (`check:merge-contract`, `check:motion-grammar`,
`measure:experience`), the feedback guard (`verify-feedback`), and the zero-orange pixel
detector are the enforcement mechanism. See [../HELIX_v1.0.md](../HELIX_v1.0.md) §8–10.

## Governance rules

Helix v1.0 is frozen. From this milestone:

1. No new tokens, primitive types, or design-system abstractions.
2. No architectural refactors unless a real product requirement proves Helix insufficient.
3. Every improvement must originate from a product need, not framework aesthetics.
4. Helix evolves only through versioned releases; product work takes priority over
   framework work.

Any candidate change is first recorded in [05_HELIX_v1_1.md](05_HELIX_v1_1.md) with the
product that exposed the gap. It is not implemented until that entry is promoted to an
active, versioned release.

## Release process

1. A product hits a real limitation and records it in [05_HELIX_v1_1.md](05_HELIX_v1_1.md).
2. The gap is confirmed to be unsolvable within v1.0 (not merely inconvenient).
3. A versioned change is scoped under the existing tiers without breaking the contract.
4. Semantic versioning applies:
   - MAJOR — a breaking change to the token contract, a primitive API, or a tier boundary.
   - MINOR — a new capability added because a product needed it, backward compatible.
   - PATCH — a fix that changes no contract.
5. The change ships as a tagged release, recorded in [08_RELEASES.md](08_RELEASES.md), with
   migration notes and the guards green.
6. A significant decision behind the change is recorded in [06_DECISIONS.md](06_DECISIONS.md).

Helix lives as a standalone package (`@helix/design-system`) at
`~/Documents/projects/helix`. Products consume it; they do not fork it.

## Known technical debt

Named convergence debt carried intentionally into v1.0 (do not reconcile without a product
need). Full list in [07_TECHNICAL_DEBT.md](07_TECHNICAL_DEBT.md) and
[../HELIX_v1.0.md](../HELIX_v1.0.md) §12:

- Two typography families in tables (reference vs slate), expressible via a `family` axis.
- IconAction off-tier tones held at pixel parity via explicit overrides.
- Security Center geometry expressed through escape-hatch builders (structural convergence
  done; visual convergence deferred).
- Documented colour exceptions (processing hue, delete-button danger, marketing indigo vs
  red, persisted cabinet swatches).

## Future v1.1 ideas (do not implement)

Parked, not planned. Each must be justified by a product before it becomes work. The
register is [05_HELIX_v1_1.md](05_HELIX_v1_1.md). Illustrative candidates only:

- A dark-theme reference build, if a product ships dark mode.
- A density mode (compact/comfortable), if a data-dense product needs it.
- A charting token expansion, if a product needs chart types beyond the current set.
- A second theme extraction pass, triggered by onboarding product #2.

None of these are commitments. Helix only evolves when a real product proves it insufficient.
