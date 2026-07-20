# Helix Design System — v1.0.0

**Status: FROZEN — feature complete.** Helix v1.0 is the mature foundation Osieri /
CYTOLAB (product #1) is built on. From this milestone forward the architecture does not
change except through a versioned release justified by a real product requirement.

> **The freeze, in four rules**
> 1. No new tokens, primitive types, or design-system abstractions.
> 2. No architectural refactors unless a real product requirement proves Helix insufficient.
> 3. Every improvement must originate from a product need — not from framework aesthetics.
> 4. Helix evolves only through versioned releases; product work takes priority over framework work.

This file is the single source of truth for what v1.0 *is*. The companion docs remain
authoritative for detail: **DESIGN_SYSTEM.md** (full token/component reference),
**CLAUDE.md** (the engineering constitution and hard constraints), **ARCHITECTURE.md**,
**EXPERIENCE_REPORT.md** (Sprints 7–10 experience record), **TECH_DEBT.md**.

---

## 1 · Architecture overview

Helix is a **five-tier, contract-based** system. Each tier may only reference the tier
below it; a component never reaches past the contract to a raw value.

```
Tier 1  PRIMITIVE   raw ramps + motion primitives   --slate-600, --indigo-600, --duration-base
   ↓                (brand-agnostic; Helix core)
Tier 2  SEMANTIC    the UI contract                  --color-primary, --surface, --motion-hover
   ↓                (Helix core; themes override ONLY this tier)
Tier 2.5 DOMAIN     business semantics (per product) --specimen-*, --workflow-*, --status-*
   ↓                (Osieri-specific; 12 Circle supplies its own)
Tier 3  THEME       per-product re-pointing          [data-theme] re-points Tier 2
   ↓
Tier 4  COMPONENT   consumes Tier 2 / 2.5 + motion   <Card>, <Button>, <Badge>, <Th/Td>
```

**The load-bearing invariant:** a theme is a *bundle* (colour, type, motion, density,
assets/voice), and it may change brand or UI expression but **must never change business
meaning**. A status pill asks for `--status-warning`; what colour that is belongs to the
theme, but *that it means warning* is fixed. Components consume only semantic/domain/motion
tokens — **never a raw hex, never a raw duration or easing curve, never a hue name.**

The core (Tiers 1–2) knows nothing about pathology. A product = Helix core + one theme +
its own Tier 2.5. This is what makes the system reusable across future products (12 Circle
Fitness, etc.) — but per the long-term plan, **that extraction happens on product #2, not
by refactoring Osieri now.**

---

## 2 · Token architecture

- **Tier 1 — primitive ramps** (`globals.css` top block): raw palette (`--slate-*`,
  `--indigo-*`, `--gray-*`) + motion primitives. Brand-agnostic. A component reaches here
  *only* for a fixed, non-themeable neutral (e.g. a chart axis).
- **Tier 2 — semantic UI tokens** (`:root`): the public contract — `--color-primary`
  (`#4F46E5` → indigo), `--surface`, `--color-text-*`, `--color-danger/-success/-warning`,
  borders, table text (`--color-table-header/-cell`). **Themes override only this tier.**
- **Tier 2.5 — domain tokens** (Osieri): business semantics, each shipping a `fg` /
  `-soft` pair — `--specimen-*`, `--workflow-*`, `--priority-*`, `--status-*`, `--billing-*`,
  `--chart-*`, `--gauge-*`, `--identity-*`. A component never names a hue; a status pill
  asks for a role.
- **Tier 3 — theme**: `[data-theme=…]` re-points Tier 2 per product. A colour swap is not a
  theme; a theme overrides five dimensions (colour, type, motion, density/radius,
  assets/voice).
- **Tier 4 — components**: consume Tier 2 / 2.5 + motion tokens only.

**Retiring a hex:** point it at a Tier-1 token — never edit a Tier-2 *value* (Tailwind is
var-backed; editing a value recolours 600+ sites).

**Zero raw hex in components** is enforced by convention + review; the anti-aliasing corollary
(a "safe" solid can still violate through alpha blending) is caught by the pixel detector, not
by grep. See §9.

---

## 3 · Typography system

Two surfaces, deliberately distinct, never cross-applied:

- **Product app (`apps/web`)** — Inter / Geist, system fallback. Body `13–17px`, secondary
  `#64748b`. Numerics use `font-variant-numeric: tabular-nums`. Display headings `700–900`,
  tracking `-.02 … -.03em`.
- **Marketing (`apps/marketing`)** — a premium editorial scale, font-by-content-type:
  - **Newsreader** (`--font-display`) → `.display-xl/-lg` — hero and major headlines ONLY.
  - **Inter** (`--font-sans`) → `.heading-*`, `.body-*`, `.metric-*`, `.ui-sm` — anything a
    human reads or clicks.
  - **Space Mono** (`--font-mono`) → `.label`, `.label-pill`, `.ui-xs` — machine/clinical
    tokens: status, compliance certs, IDs, timestamps, KPI captions, version numbers.

  Full responsive scale (`clamp()`-based) in DESIGN_SYSTEM §5a. Rule: **no arbitrary text
  sizes** once a semantic utility exists.

**The merge contract (a permanent rule).** Any custom typography/spacing/sizing utility
namespace must be registered in `extendTailwindMerge` in `ui/cn.ts` **in the same change**.
An unregistered custom utility is mis-grouped and silently evicted by a later class in the
same group — no type error, just wrong rendering. This shipped once (`text-label-sm` filed as
a colour, evicted by `text-secondary`, tables rendered at 16px instead of 12px). Enforced by
`check:merge-contract`.

**Deferred (v1.x):** the product app runs *two* type families in tables — Group-B (`roles`,
`users`, `portal/records`) uses the reference tokens; every other table uses `text-sm` /
`slate-*`. Converging them is a design decision, not a migration. `Th`/`Td` carry a `family`
axis (`reference` / `slate`) so the choice is expressible without forcing it. See §12.

---

## 4 · Spacing system

Enterprise token scale, **8px base rhythm**, small `2/4/12` steps, sparse large jumps.
**Token name = pixel value** (`--space-16` = 16px), values in rem. **No magic numbers** —
never hand-type `1.1rem`, `mt-11`, `gap-7`.

- **Scale:** `--space-2 … --space-160` (2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64, 80, 96,
  112, 128, 160).
- **Section spacing:** `.section-xs/-sm/-md/-lg/-xl` (40 / 56 / **80 default** / 96 / 112),
  paired with `--section-gutter` `clamp(20–40px)`.
- **Card padding:** `sm 24 · md 32 (default) · lg 40`.
- **Containers:** `sm 640 · md 960 · lg 1280 (default) · xl 1440`.
- **Content measure:** `xs 320 · sm 400 · md 640 (~65ch) · lg 768`.

---

## 5 · Motion grammar

**One application, one vocabulary: two curves, six durations, all from tokens.**

**Tier 1 primitives**
- Durations: `--duration-instant 80` · `-fast 120` · `-quick 160` · `-base 200 (default)` ·
  `-slow 320` · `-slower 480` (ms).
- Curves: `--ease-standard cubic-bezier(0.22,0.8,0.2,1)` (state changes) ·
  `--ease-emphasized cubic-bezier(0.22,1,0.36,1)` (entrances). Nothing else.

**Tier 2 semantic motion (what components consume)**
`--motion-hover` (fast·standard) · `--motion-press` (instant·standard) · `--motion-focus`
(fast·out) · `--motion-entrance` (base·emphasized) · `--motion-exit` (quick·in) ·
`--motion-modal` (slow·emphasized).

**Laws**
- **Never animate `all`** — name the property, or the browser animates layout too.
- Every `@keyframes` takes its duration from a `--duration-*` token, so
  `prefers-reduced-motion` reaches it. A global backstop collapses everything (incl.
  third-party CSS) to **1ms** (not `0s`, so `transitionend`/`animationend` still fire).
- **Motion never withholds information** — the page transition *rises*, it does not fade in
  (a fade kept a skeleton invisible for 254ms and blew the cue budget).
- antd owns modals/drawers; it takes our duration tokens via `ConfigProvider` but hardcodes
  `transition: all .3s ease` on enter classes — overridden in globals.css. Don't remove those.
- Exactly **one** page transition, in `(app)/template.tsx` (the one place Next re-mounts on nav).

Enforced by `check:motion-grammar` (needs a production build on :3100).

---

## 6 · Component inventory (Tier 4)

Primitives live in `@/components/ui`; build screens from these, not hand-written class strings.
They consume Tier 2 / 2.5 + motion tokens only.

**Core primitives**
`Card` · `Button` (+ `loading`/`loadingLabel`, `compactButtonClass`, `IconAction`) · `Input` ·
`Badge` / `StatusBadge` · `Table` (`Th`/`Td`, axes: `density`, `size`, `tone`, `family`) ·
`DataTable` · `EmptyState` · `SectionContainer` / `SectionCard` · `IconButton` · `Skeleton` ·
`StatCard` · `PillSelect` · `Avatar` / `AvatarStack` · `AppShell` · `ScrollSentinel`.

**Charts (domain-tokened):** `BarChart` · `LineChart` · `MiniAreaChart` · `Gauge`
(consume `--chart-*` / `--gauge-*`).

**Support:** `cn.ts` (the merge contract), `icons.tsx`, `tokens.ts`, `index.ts`, `PastelCard`.

**Adoption at freeze** (from Sprint 5 inventory + Sprint 6 completion):
`Card` 98% (237 sites) · `Button` 100% of clean files (138 sites; +25 `loading=` after Sprint 10) ·
`Th`/`Td` (222 sites; Group-B kept as a documented type-family axis) · `Badge` (34 sites) ·
`IconAction`, `Input`, `EmptyState` completed in Sprint 6.

**Intentionally bespoke:** the dashboard (a reference implementation by decision, not a
migration target).

**Escape hatches** (one definition, not a second system): `cardClass()`, `fieldClass()`,
`compactButtonClass()` — used where the Security Center ships a smaller geometry; documented as
convergence debt, not a parallel component set.

---

## 7 · Experience principles

Product experience is governed by three **independent** latency classes plus one invariant.
Never collapse them into one number — different causes, different fixes.

| # | class | boundary | budget | fixed by |
|---|---|---|---|---|
| 1 | cold startup | blank → interactive shell | ≤ 2000ms | shipping less JS (a bar can't exist yet — it *is* React) |
| 2 | route loading | commit → content / → visible cue under latency | ≤ 400ms / ≤ 200ms | `loading.tsx`, Suspense, per-screen skeletons |
| 3 | interaction | click → visible acknowledgement | ≤ 100ms | `GlobalProgress`, Button `loading`, optimistic updates |

**Invariant — no false empty state while loading.** A `0` or "✓ No urgent cases" rendered
before data arrives is a lie, not a wait.

**Feedback (one language).** Every action and failure is acknowledged **once, from one
renderer** (`lib/notify.ts` over a single keyed antd holder), on a timer set by **meaning**:
success/info 3s, warning 5s, error 6s, progress until resolved. Dismiss timing is a
read-duration (JS timer) independent of reduced motion. Server-provided errors are preserved
(`errorMessage()` — the server's message wins). Every mutation has one of: visible success,
visible error, a documented silent mode, or self-evident navigation.

**Restraint.** Don't broaden optimistic UI without clear user value — it buys perceived speed
with rollback complexity. The unread badge qualifies (the eye is on it); the list behind it
does not.

---

## 8 · Engineering guards

Three executable guards, each **proven able to fail** (a negative control) before being
trusted. "A check that cannot fail is not a check."

| guard | asserts | needs |
|---|---|---|
| `npm run check:merge-contract` | custom utility namespaces survive tailwind-merge; `cn.ts` declares no stale keys | — |
| `npm run check:motion-grammar` | two curves / six durations, no `all`, reduced-motion ≤1ms | prod build on :3100 |
| `npm run measure:experience` | the three latency classes independently, + no false empty state | prod build on :3100 |
| `node scripts/verify-feedback.mjs` | toast aria-live polarity, aria-atomic, keyed dedupe, Escape dismiss | prod build + API |

Plus the **pixel (zero-orange) detector**: no pixel may satisfy `r>200 && g∈[100,190] && b<90`.
Run it against rendered screenshots after every UI change — grep is not an audit; a safe solid
can still violate through anti-aliased alpha blending; a safe gradient can interpolate into
orange between safe stops.

---

## 9 · Accessibility rules

- **Focus is an interaction state**, not a screenshot — verify focused/hovered/disabled/error/
  readonly/autofill/keyboard states, not just the resting pixel. The Input focus ring is a real
  a11y improvement and stays.
- **aria-live polarity by meaning:** errors are `assertive` (act-now), success/info are
  `polite`. The message region is `aria-atomic="false"` so it is not re-read whole on each
  update.
- **No duplicate screen-reader announcements:** notifications are keyed; a repeated event
  replaces rather than stacks, so a double-click cannot announce twice.
- **Keyboard dismiss:** Escape clears all toasts.
- **Reduced motion** shortens entrances (→1ms backstop), **never** the time information stays
  legible. Motion never withholds information.
- **Duplicate-submit prevention + `aria-busy`:** Button `loading` disables and marks busy;
  width is preserved (spinner replaces the leading icon; the label does not change) to avoid
  layout shift.

---

## 10 · Verification philosophy

1. **Measure before changing.** Sprint 8 nearly optimised the wrong thing by conflating cold
   start with route loading; the three latency classes exist so a good score in one can't hide
   a bad score in another.
2. **Prove by rendered pixels, not by source.** Zero-orange is a pixel fact; typography sizes
   are a rendered fact; a green typecheck does not excess-property-check a spread.
3. **Every guard must be able to fail** before it is trusted.
4. **Pixel parity first** on any migration that is not a deliberate redesign — settled and
   disabled states unchanged; only the intended state differs.
5. **Document exceptions, don't silently change them.** Convergence debt is named, not erased.
6. **Drive the real flow** (headless Chrome / Playwright) against a *production* build on :3100 —
   dev numbers measure the compiler, not the product.

Standard pre-ship gate: `tsc --noEmit` clean · production build clean · the four guards green ·
zero-orange 0px · pixel parity where output is meant to be unchanged.

---

## 11 · Sprint history (1–10)

| Sprint | Title | Outcome |
|---|---|---|
| 1 | Premium typography system | Marketing editorial type scale (Newsreader / Inter / Space Mono), font-by-content-type, section rollout. |
| 2 | Enterprise spacing tokens (+ 2.1–2.6 marketing motion) | 8px-rhythm spacing scale + semantic tokens; Lenis smooth scroll + GSAP motion system for marketing. |
| 3 | Semantic colour + domain token layer | Five-tier token architecture ratified; `#4F46E5 → --color-primary`; Tier 2.5 domain layer. |
| 4 | Motion tokens + core component primitives | Tier-1 motion system; Card/Button/Input/Badge/Table/EmptyState/SectionContainer; piloted on 5 screens; API validated before mass rollout. |
| 5 | Helix component rollout | Primitives adopted across the app at pixel parity; component inventory + adoption %. |
| 6 | Architecture completion (4 parts) | IconAction, Table→100%, Input system, EmptyState/TableEmpty, Security fold (structural, zero visual change), typography audit; the `cn()` merge-contract rule + executable guard. |
| 7 | Experience architecture | Discovery only: Experience Report, principles, motion-language spec, journey + friction audits. No code. |
| 8 | Perceived performance | `loading.tsx`, skeleton system, Suspense, `GlobalProgress`, Button `loading`, mutation acknowledgements; three latency classes made independently measurable. |
| 9 | Motion language | Page / drawer / modal transitions, table row insert/remove, card hover, button press, loading choreography, shared easing, reduced-motion compliance; `check:motion-grammar`. |
| 10 | Feedback system completion | One `notify` language (192 `message.*` → 296 `notify.*`, renderers retired); 198-mutation acknowledgement audit; Button `loading` adoption; dismiss-by-meaning; a11y (polarity, dedupe, Escape); `verify-feedback` guard. |

---

## 12 · Known technical debt & deferred items

**Design-system convergence debt** (named, not accidental — do NOT reconcile without a product need):
- **Two typography families in tables** — Group-B (reference tokens) vs the rest (`slate`).
  `Th`/`Td` carry a `family` axis so the choice is expressible; convergence is a future
  *visual* pass, not a migration.
- **IconAction off-tier tones** — 21 call sites (`#64748b`, `#94a3b8`) carry explicit
  `className` overrides for pixel parity; converging them is a reviewable recolour pass.
- **Security Center geometry** — smaller button/card/field shapes expressed via escape-hatch
  builders (`compactButtonClass` etc.); structural convergence done, visual convergence deferred.
- **Documented colour exceptions** (leave alone): processing-hue inconsistency, delete-button
  danger mismatch, standalone-marketing-indigo vs web-marketing-red disagreement, persisted
  cabinet swatches.

**Blocked by unrelated uncommitted work** (migrate once their pending edits land):
- `change-requests/page.tsx` and `SettingsListPane.tsx` still run the legacy per-page toast —
  their toast lines interleave with the user's pre-existing uncommitted edits in the same diff
  hunks, so they cannot be staged in isolation. They still acknowledge (via the old renderer);
  they are not *silent*.
- The unattributed `overflow-x: hidden` line in `globals.css` remains uncommitted pending a
  decision on whether it was intentional.

**Deferred product/feedback items:**
- **Undo** — not added anywhere: every mutation is server-final with no rollback endpoint.
  Revisit if/when the API grows compensating actions.
- **Raw-`<button>` `isPending` swaps** (23 sites) — converting them means a component migration,
  barred "just to adopt a primitive"; deferred as convergence debt.

**Platform debt** (tracked in TECH_DEBT.md, out of Helix scope): TD-001…TD-010 —
`@cytolab/types`/`config`/`shared` not yet consumed, client-only Sentry, in-process jobs,
imperative three.js hero, Next 14/React 18 → 15/19, no project-wide ESLint, stale
`.next-prod/types` TS6053 noise.

---

## 13 · Version & changelog

**Version: `1.0.0`** · Milestone tag: `helix-v1.0` · Frozen at commit for
"Sprint 10 — Complete Helix Feedback System".

Semantic intent for the line:
- **MAJOR** — a breaking change to the token contract, a primitive API, or a tier boundary.
- **MINOR** — a new capability added *because a product needed it* (new component, new token
  under an existing tier), backward compatible.
- **PATCH** — a fix that changes no contract.

### Changelog

#### 1.0.0 — Feature complete (freeze)
- **Architecture:** five-tier token system (primitive → semantic → domain → theme → component)
  ratified and frozen. Themes may change expression, never business meaning.
- **Typography:** product Inter/Geist; marketing editorial scale (Newsreader / Inter /
  Space Mono), font-by-content-type; the `cn()` merge-contract rule made permanent + guarded.
- **Spacing:** enterprise 8px-rhythm scale + semantic section/card/container/measure tokens.
- **Motion:** two curves, six durations, semantic motion tokens; single page transition;
  reduced-motion backstop (1ms); `check:motion-grammar`.
- **Components:** full primitive layer with adoption at/near 100% on clean files; documented
  escape hatches and convergence debt; dashboard intentionally bespoke.
- **Experience:** three independent latency budgets + no-false-empty-state invariant;
  `loading.tsx`/skeletons/Suspense/`GlobalProgress`; one `notify` feedback language with
  dismiss-by-meaning and preserved server errors.
- **Accessibility:** aria-live polarity, keyed dedupe (no double SR announce), Escape dismiss,
  `aria-busy` + width-preserving Button loading, focus as a verified interaction state.
- **Guards:** `check:merge-contract`, `check:motion-grammar`, `measure:experience`,
  `verify-feedback`, and the zero-orange pixel detector — each proven able to fail.

---

## 14 · Governing rule going forward

**Do not begin Helix v1.1 until a genuine product requirement justifies it.** When one does:
open a v1.x line, add the minimum capability the product needs (under the existing tiers,
without breaking the contract), record it in the changelog, and ship it as a versioned release.
Product work takes priority over framework work. Helix is done until Osieri — or the next
product — proves it insufficient.
