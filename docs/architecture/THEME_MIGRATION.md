# THEME_MIGRATION.md

**Purpose:** Define how Osieri / CYTOLAB migrates from raw color literals to semantic design tokens safely, incrementally, and verifiably — without recoloring the product or breaking the premium visual language.
**Scope:** `apps/web` component and page color usage against the token layer in `apps/web/src/app/globals.css`. Reflects state verified 2026-07-13. Marketing/landing is largely out of scope (scope-lock).
**Status:** Living document — active. No migration has been performed; this defines the future process.
**Owner:** Osieri Engineering (unassigned).
**Last Updated:** 2026-07-13.

---

## Objectives

- Route all component color through the semantic token layer so the product can be re-themed (including the long-term Helix theme system) without touching thousands of call sites.
- Preserve the current appearance exactly — migration is **presentation-only** and pixel-neutral.
- Maintain the hard constraints: the zero-orange rule and the locked color split (product = indigo `#4F46E5`), and never introduce a raw hex in the process.

## Current state (as-built)

- **Token layer is mature:** 346 CSS custom properties in `globals.css`, including semantic `--color-*` (primary/surface/border/danger/success/info/icon-*), `--accent-*`, and domain `--chart-specimen-*` tokens. Coverage of the common palette is high.
- **Violation surface:** ~5,180 raw hex literals (≈4,830 real after removing dead/demo/SVG/comments), **plus** ~1,522 Tailwind named-color utilities that a hex grep cannot see. True surface ≈ 6,700 occurrences.
- **Ambiguous minority:** one-off washes (e.g. `#EEF3FF`, `#E4E8F4`) have no palette token and require either a new token or a judgment call — do not guess.
- **Branch reality:** the top hex offenders are **dirty** on `feat/theme-system`; only three top offenders are clean: `system/support/page.tsx`, `system/page.tsx`, `qc/page.tsx`.

## Migration philosophy

- **Additive and reversible.** Change presentation only; never touch logic, data flow, or imports beyond what a class/style swap requires.
- **Token-first, not value-first.** Retire a hex by pointing it at an existing semantic token. Never edit a Tier-2 token *value* (Tailwind is var-backed — editing a value recolors 600+ sites). To retire a hex with no token, add a Tier-1-backed token first (a design decision, not a mechanical swap).
- **Do not rewrite stable screens** solely to adopt tokens (CLAUDE.md prime directive). Migrate opportunistically or in tightly-scoped, isolated batches.
- **Grep is a floor, not the audit.** The pixel/orange detector is authoritative — Tailwind utilities (`text-yellow-500`) carry no hex.

## Safe migration rules

1. One isolated checkpoint per batch; color migration is **never** combined with security, logging, tests, accessibility, or realtime changes.
2. Only migrate files that are **clean** in the working tree — never a file with concurrent uncommitted work (would collide with active theme/feature edits).
3. Map each hex to an existing semantic token; if no token fits, stop and escalate the token decision — do not invent an inline value.
4. Presentation-only: no change to component behavior, props, or logic.
5. Respect scope-locks: landing (`app/page.tsx`, `PlatformShowcase`, hero-v2) is excluded regardless of hex count.
6. Verify with the pixel detector (must report 0 orange) and a visual diff before/after (must be identical).

## Priority order

1. **Clean, simple, high-count, no SVG** — best first batch: `system/support/page.tsx` (169), `system/page.tsx` (109), `qc/page.tsx` (83). Presentation-only, collision-free.
2. Clean simpler screens as they surface.
3. Files touched by other in-flight work — migrate **when that work lands and the file goes clean**, not before.
4. Complex detail pages (`records/[id]`, `patients/[id]`) with heavy SVG/gradient content — later, higher risk, more one-offs.
5. Landing/marketing — only if scope-lock is lifted.

## Component-first strategy

Where a shared primitive exists (`Input`, `Modal`, `Badge`, `Card`, `Button`), migrate the **primitive** once so every consumer inherits tokens. This is the highest-leverage path: adopting the `Input` primitive alone removes a duplicated `h-10 w-full rounded-lg border border-[#E2E8F0] …` string (carrying hex) from ~20 files. Prefer this over per-screen edits where a primitive already covers the pattern — but do not rewrite a stable screen just to swap in a primitive.

## Screen-first strategy

For bespoke screens with no shared primitive, migrate the screen's color usage in place: replace hex/Tailwind-color utilities with token-backed classes or `var(--token)` styles, leaving structure and logic untouched. Use this for the clean top-offender pages above.

## Verification

- **Pixel/orange detector** after every batch — must report 0. A safe solid can still violate via anti-aliased edges over an amber background; check the foreground against its actual background at every alpha.
- **Motion/other detectors** unaffected (color-only change).
- **Typecheck + build** clean.
- Confirm the merge contract: if a batch introduces a new custom utility namespace, `extendTailwindMerge` in `ui/cn.ts` must be updated in the same change (a utility tailwind-merge doesn't know about is silently evicted).

## Pixel comparison

Capture before/after screenshots of each migrated screen at a fixed viewport and compare. Migration is accepted only when the rendered output is pixel-identical (token values must equal the hex they replace). Any intended color *change* is out of scope for migration and belongs to a separate design decision.

## Rollback strategy

- Each batch is one isolated commit touching only presentation in clean files — revert the commit to fully roll back with no data or logic impact.
- Because changes are pixel-neutral and logic-free, rollback risk is minimal; the pixel diff is the gate that makes rollback rarely necessary.

## Definition of complete

A file/component is "migrated" when: zero raw hex remain in it; zero raw Tailwind color utilities remain (mapped to token-backed equivalents); all colors resolve through semantic tokens; the pixel detector reports 0; and the before/after render is identical. The **program** is complete when this holds across all live production components (dead/demo/SVG-config exceptions documented), verified by the detector rather than by grep.

---

## Related documents
- RISK_REGISTER.md (R-009 hex/theme debt)
- Project docs: DESIGN_SYSTEM.md, BRAND_GUIDELINES.md (locked color split, zero-orange rule)

## Future revisions
- Record new semantic tokens added to resolve ambiguous one-off washes.
- Update the clean/dirty offender list as branches merge.
- Note when a primitive-first migration retires a duplicated class string across many files.

## Verification requirements
- No batch merges without a 0-orange pixel-detector result and an identical visual diff.
- No Tier-2 token *value* may be edited to retire a hex.
- This document performs no migration; color work lands only in CP-7 (and future isolated batches).
