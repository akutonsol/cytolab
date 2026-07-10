# PathOS — Experience Report (Sprint 7)

> **Discovery only. No code was changed in this sprint.**
> Helix v1 is frozen: no tokens, primitives, component APIs, or migrations were touched.
> Every number below was measured against the shipping codebase or a live browser, not estimated.
>
> Companion docs: **DESIGN_SYSTEM.md** (the frozen system), **CLAUDE.md** (engineering rules).

---

## 0. Executive summary

The design system is mature. **The product experience is not — and the gap is not where I expected it.**

Three findings dominate:

1. **The authenticated product has no motion language at all.** It has zero `<motion.*>` components. All 51 live in landing/marketing. What motion the product *does* have comes from three uncoordinated sources: 75 raw `@keyframes`, antd's unconfigured defaults, and 45 token-driven utilities. Motion-token adoption is **31.9%**.

2. **The product does not tell the user it is working.** 57 of 92 routes fetch data and render **neither skeleton nor spinner**. Three flagship screens (`/records`, `/patients`, `/qc`) render *literally nothing* — 0 characters — for 400–800ms, then a further ~600ms before settling. There are **zero** `loading.tsx`, `error.tsx`, `not-found.tsx`, or `template.tsx` files.

3. **Elevation is the least-governed dimension in the system.** 69 distinct inline `boxShadow` values and 12 arbitrary `shadow-[…]` classes sit alongside the 8 shadow tokens. Depth currently communicates nothing, because everything is a different depth.

The highest-leverage work is **not** adding animation. It is: give the product a voice while it waits, unify the three motion sources, and delete elevation noise. In that order.

---

# Phase 1 — Experience Audit

## 1.1 Visual rhythm

### Corner radii — 12 values in use

| class | uses | | class | uses |
|---|---:|---|---|---:|
| `rounded-lg` | 407 | | `rounded-pill` | 22 |
| `rounded-full` | 391 | | `rounded-control` | 18 |
| `rounded-xl` | 378 | | `rounded-card` | 12 |
| `rounded-2xl` | 218 | | `rounded-sm` | 4 |
| `rounded-md` | 58 | | `rounded-3xl` | 3 |

Plus 8 raw `borderRadius:` values in inline styles (`16px`, `8px`, `20px`, `30px`, `4px`, `50px`, `12px`, `24px`).

**Reading:** four radii carry 99% of the UI (`lg`, `full`, `xl`, `2xl`). The token radii (`rounded-card`, `rounded-control`, `rounded-panel`, `rounded-input`) are almost unused — 33 uses combined. The system's radius vocabulary is *not the one the product speaks*.

### Elevation — the worst offender

| source | count |
|---|---:|
| token shadow classes (`shadow-card`, `shadow-sm`, …) | 193 |
| arbitrary `shadow-[…]` classes | 41 (**12 distinct**) |
| inline `boxShadow:` values | 95 (**69 distinct**) |

**69 distinct inline shadows.** `shadow-xl` (56) and `shadow-2xl` (23) — Tailwind defaults, not tokens — outnumber `shadow-card` (22). Depth is applied per-component by taste.

### Border opacity — an undeclared axis

119 uses of fractional borders, dominated by a Material-3 leftover:

```
border-outline-variant/40   50
border-outline-variant/30   20
border-white/8              13
border-outline-variant/20    8
border-outline-variant/10    7
```

Five opacity steps of one colour, none of them a token.

### Density & page rhythm

**8 distinct page-container paddings.** `min-h-full pb-10 pt-4` (27 routes) and `min-h-full pt-4` (22) dominate, but `py-8`, `py-6`, `pt-10`, `pb-28`, `pb-12`, `pb-8` all appear. A user moving between screens experiences the page's top edge shifting.

Container widths are similarly ad-hoc: `max-w-md` (23) sits beside `max-w-[460px]` (6), `max-w-[480px]` (6), `max-w-[420px]` (4), `max-w-[520px]` (4).

---

## 1.2 Motion inventory

### Where motion lives — the key structural fact

| surface | `@keyframes` | `<motion.*>` | raw `duration:` |
|---|---:|---:|---:|
| **product** (`(app)/` + `ui/`) | 45 | **0** | 1 |
| landing / marketing / portal | 56 | 51 | 50 |

**The authenticated product contains no framer-motion.** Everything the design-system motion work anticipated — entrances, exits, choreography — exists only on the marketing site.

### The product's four motion systems

| # | system | timing | governed by tokens? |
|---|---|---|---|
| 1 | **antd** (all modals + drawers) | **300ms, `ease`** (measured) | ❌ no config in `providers.tsx` |
| 2 | raw CSS `@keyframes` | 75 definitions, hand-timed | ❌ |
| 3 | Tailwind token utilities | `duration-fast` ×10, `ease-standard` ×10 | ✅ |
| 4 | raw CSS `transition:` literals | 45 sites | ❌ |

`--motion-modal` is **320ms `cubic-bezier(.22,1,.36,1)`**. Every drawer and modal in the product runs **300ms `ease`** — the browser default curve. The motion system is not wired to the things that move most.

### Durations & easings actually in use

- **framer durations:** 25 distinct values (0.3s … 4s)
- **CSS transition durations:** 12 distinct (`.1s` … `.35s`), with `.15s` (8) and `0.15s` (4) written both ways
- **easings:** 10 distinct `cubic-bezier` spellings. The house curve `.22,.8,.2,1` appears **as four different strings** (`.22,.8,.2,1` ×13, `0.22,0.8,0.2,1` ×2, `0.22, 0.8, 0.2, 1` ×1, array form ×5). A rival curve `cubic-bezier(0.22, 0.61, 0.36, 1)` appears 7 times.
- **delays:** 57 framer `delay:` props, up to **2.1s**

**Motion-token adoption: 31.9%** (45 token usages vs 96 raw).

### Dead animations

**20 of 99 `@keyframes` are never referenced.** Thirteen of them (`drift1`–`drift8`, `colorDrift`, `glowPulse`, `microDrift`, `scanLine`, `ringSpin`) live in a single file: `records/[id]/page.tsx`, a decorative "AI scanning" scene. That one screen defines 13 keyframes and uses a minority of them.

### Animations that fight

- **21 `transition-all` sites** across 15 files. `transition-all` animates *every* property including layout (`width`, `padding`, `top`), which is why cards jitter on hover under load. Worst: `dashboard`, `reports`, `login` (3 each).
- **Reduced motion is only half-honoured.** `--duration-*` collapses to 1ms under `prefers-reduced-motion` — but **zero of the 99 `@keyframes` are driven by a duration token**, so every skeleton, spinner, pulse and drift keeps animating for users who asked it to stop. 29 `prefers-reduced-motion` occurrences exist, all in marketing.

---

## 1.3 Information flow

- **29 of 92 routes have no `<h1>`.** Heading tags across routes: `h1` 64, `h2` 42, `h3` 52 — many screens open at `h2`, so the document outline (and screen-reader landmark order) starts mid-hierarchy.
- **356 horizontal separators** (`border-b` / `border-t` / `<hr>`). The heaviest screens carry 8–10 each *on top of* card borders — a separator inside a bordered card inside a bordered section.
- **Card nesting is not the problem.** Only 2 files nest `<Card>` two deep. This audit item can be closed: the product does not over-nest cards.
- **Heaviest screens** (separators + shadows):

| screen | separators | shadows | icons | font weights | radii |
|---|---:|---:|---:|---:|---:|
| `billing` | 10 | 6 | 16 | 4 | 39 |
| `records/[id]` | 9 | 2 | 34 | 4 | 42 |
| `qc` | 8 | 7 | 8 | 2 | 21 |
| `change-requests` | 7 | 5 | 13 | 3 | 26 |

`records/[id]` uses **34 icons and 42 radius declarations on one screen**. That is where the eye stalls.

---

## 1.4 Interaction audit

| state | instances | verdict |
|---|---:|---|
| `hover:` | 622 | ✅ universal |
| `focus:` | 156 | ⚠️ styles focus, not focus-visible |
| **`focus-visible:`** | **6** | 🔴 keyboard users are near-invisible |
| `active:` (pressed) | 19 | 🔴 ~3% of hoverable things acknowledge a press |
| `disabled:` | 108 | ✅ |
| `group-hover:` | 7 | — |
| `aria-selected` | **0** | 🔴 no selected state is exposed to assistive tech |
| skeleton (`animate-pulse`) | 28 | ⚠️ 11 routes |
| spinner (`animate-spin` / `Loader2`) | 33 / 53 | ⚠️ 9 routes |

**Two parallel feedback systems.** antd `message.success` (90) + `message.error` (96) = 186 calls, alongside a hand-rolled `toast` (105). They look different, they stack differently, and they dismiss on different timers.

**Conclusion: interactions do not belong to one system.** Hover is coherent. Everything else — press, focus, selection, loading, success — is per-screen improvisation.

---

## 1.5 Visual noise — recommend *removals*

| # | remove | evidence | why |
|---|---|---|---|
| N1 | 69 inline `boxShadow` values | measured | depth means nothing when every surface differs |
| N2 | 12 arbitrary `shadow-[…]` classes | measured | 4 of them duplicate `--shadow-card-soft` / `-raised` exactly |
| N3 | 20 dead `@keyframes` | never referenced | 13 in one file |
| N4 | 21 `transition-all` | measured | animates layout; replace with the property being changed |
| N5 | 5 border-opacity steps of `outline-variant` | measured | Material-3 leftover; a border is on or off |
| N6 | one of the two toast systems | 186 antd vs 105 custom | users see two different success languages |
| N7 | redundant separators inside bordered cards | 356 total | the card edge already separates |
| N8 | 6 font weights (`black`, `extrabold` ×46) | 7 routes use ≥4 weights | emphasis stops meaning emphasis |
| N9 | 8 page-container paddings → 1 | measured | the page's top edge should not move between routes |

**Nothing in this list is an addition.**

---

# Phase 2 — The Helix Experience Principles

Proposed as **permanent engineering rules**, in the same register as the zero-orange rule.

1. **Information appears before decoration.** A screen renders its structure and its data cue before anything animates. Never animate a container that has nothing in it.

2. **Motion explains state.** Every animation answers one of: *what changed*, *where did it come from*, *what is happening now*. Motion with no answer is deleted.

3. **Depth communicates hierarchy, and depth is scarce.** Three elevations exist: flat (page), raised (card), floating (modal/drawer/menu). A fourth means the hierarchy is wrong.

4. **Every transition has an origin and a destination.** Things enter from where they came from and leave toward where they went. Nothing fades in from nowhere.

5. **No animation exists for delight alone.** If removing it costs the user no information, remove it. (This deletes 20 dead keyframes on contact.)

6. **Every screen is calm under heavy data.** A screen with 10 rows and a screen with 10,000 must feel the same. Density is chosen once, in the primitive, not per screen.

7. **The product always tells you it is working.** No action, navigation, or fetch may leave the user without feedback for more than **150ms**.

8. **Acknowledge every action, once.** Exactly one confirmation per action, from one system, on one timer.

9. **Keyboard is a first-class input.** Every interactive element has a visible `:focus-visible` state and an exposed selected state. Hover is not an affordance for everyone.

10. **Reduced motion is honoured everywhere, not just where it was convenient.** If it moves, it respects the setting.

---

# Phase 3 — The Motion Grammar

One grammar. Every product motion is a sentence in it. All timings come from existing tokens — **no new tokens are proposed** (the system is frozen).

| gesture | token | movement | meaning |
|---|---|---|---|
| **Page enters** | `--motion-entrance` (200ms, emphasized) | opacity 0→1, y 8px→0 | you arrived |
| **Navigation transition** | `--motion-quick` (160ms) | outgoing fades, incoming rises | you moved |
| **Drawer opens** | `--motion-modal` (320ms, emphasized) | slides from the edge it is anchored to | it came from off-screen |
| **Modal scales** | `--motion-modal` | scale .96→1 + opacity, mask fades `--motion-quick` | it came from the page |
| **Card elevates** | `--motion-hover` (120ms) | `shadow-card` → `shadow-card-hover` only | it is interactive |
| **Press** | `--motion-press` (80ms) | scale .97 | you were heard |
| **Tooltip appears** | `--motion-fast` (120ms) after 400ms intent delay | opacity + 4px toward its anchor | it belongs to that element |
| **Success pulse** | `--motion-quick` | one 1.02 scale, then rest | it worked |
| **Progress fills** | `--motion-slow` (320ms, linear) | width only | it is advancing |
| **Loading shimmer** | 1200ms linear, token-driven | translateX sweep | it is coming |
| **Skeleton → content** | `--motion-quick` | cross-fade, no layout shift | it arrived |

**Rules of the grammar**

- Exactly **one** easing for entrances (`--ease-emphasized`) and **one** for state changes (`--ease-standard`). The 10 cubic-bezier spellings collapse to these two.
- Never animate `all`. Name the property.
- Delay > 200ms is a bug, not a flourish. (Today: 57 delays, up to 2.1s.)
- Every `@keyframes` takes its duration from a `--duration-*` token, so `prefers-reduced-motion` reaches it.
- antd's modal/drawer motion is configured to `--motion-modal`, or antd motion is disabled and replaced. It cannot stay at `300ms ease`.

---

# Phase 4 — Journey audit

Measured across the eight journeys. `✓` = present.

| screen | `<h1>` | card variant used | skeleton | spinner | feedback system |
|---|:---:|---|:---:|:---:|---|
| Login | ✓ | *(raw card ×2)* | — | — | custom toast |
| Dashboard | ✗ | *(none)* | ✓ | — | **none** |
| Patients | ✗ | *(none)* | ✓ | — | **none** |
| Records | ✓ | `sm / sm / subtle` | — | — | custom toast |
| Reports | ✓ | `md / none / none` | — | — | custom toast |
| Settings | ✗ | *(none)* | — | ✓ | custom toast |
| Security | ✗ | *(none)* | — | — | **none** |
| Support | ✓ | `md / raised / hairline` | — | — | **antd message** |

### Discontinuities found

| # | discontinuity | evidence |
|---|---|---|
| J1 | **Half the journey has no page title.** | 4 of 8 screens have no `<h1>`; 29 of 92 app routes overall |
| J2 | **Cards sit at three different elevations across the journey.** | Records `elevation="sm"`, Reports `"none"`, Support `"raised"` |
| J3 | **Three feedback languages in eight screens.** | custom toast (4), antd message (1), silence (3) |
| J4 | **Loading is different on every screen.** | skeleton (2), spinner (1), nothing (5) |
| J5 | **The page's top edge moves.** | 8 distinct `min-h-full` paddings |
| J6 | **Records → Records detail changes design language.** | `records/[id]` adds 13 keyframes, 34 icons, 42 radii and an animated "scanning" scene absent from every other screen |
| J7 | **Login belongs to marketing, not the product.** | uses raw card markup + its own toast; the only journey screen with `transition-all` ×3 |

**Verdict: each screen was designed independently.** The shell is continuous; the content is not.

---

# Phase 5 — Friction audit

| # | friction | measurement |
|---|---|---|
| F1 | **The product goes blank while it thinks.** | `/records`, `/patients`, `/qc` render **0 characters** for 400–800ms mid-fetch (verified with a throttled API) |
| F2 | **57 of 92 routes fetch with no loading cue.** | neither `animate-pulse` nor spinner |
| F3 | **No route-level loading, error, or empty scaffolding.** | 0 `loading.tsx`, 0 `error.tsx`, 0 `not-found.tsx`, 0 `template.tsx` |
| F4 | **Actions complete in silence.** | 27 files run `useMutation` with **zero** success/error feedback (198 mutations total). Worst: portal requisitions (8), lab-codes (4), workforce/overtime (4) |
| F5 | **Success disappears on five different timers.** | `setTimeout` dismissals at 2500 / 3000 / 3200 / 3500 / 4000ms |
| F6 | **Navigation gives no pending feedback.** | no `useTransition`/pending UI in the shell; a click does nothing visible until the next screen paints |
| F7 | **Press is unacknowledged.** | 19 `active:` states against 622 `hover:` |
| F8 | **Keyboard focus is invisible.** | 6 `focus-visible:` sitewide |
| F9 | **Hierarchy shifts on navigation.** | page padding + missing `<h1>` mean the first line of content lands at a different y on each route |
| F10 | **Reduced-motion users still get motion.** | 0 of 99 keyframes are token-driven |

---

# Deliverable — prioritized improvements

**Impact** = perceived product quality. **Effort** = engineering days (1 dev). **Risk** = chance of visual regression.

## Tier 1 — the product should speak while it works
*Nothing here is decoration. This is the difference between "slow" and "broken".*

| # | improvement | impact | effort | risk |
|---|---|:---:|:---:|:---:|
| **1** | Route-level `loading.tsx` for all 92 routes, rendering the existing `EmptyState`/skeleton primitives | 🟢🟢🟢🟢🟢 | 3d | low |
| **2** | Skeletons for the 57 routes that fetch blind; kill the 0-character window on `/records`, `/patients`, `/qc` | 🟢🟢🟢🟢🟢 | 4d | low |
| **3** | Pending UI on navigation (`useTransition` in the shell) | 🟢🟢🟢🟢 | 1d | low |
| **4** | One feedback system. Pick one, delete the other. Single dismiss timer. | 🟢🟢🟢🟢 | 2d | medium |
| **5** | Acknowledge the 27 silent mutation files | 🟢🟢🟢🟢 | 2d | low |
| **6** | `error.tsx` + `not-found.tsx` | 🟢🟢🟢 | 1d | low |

**Tier 1 total: ~13 days.** This is the entire perceived-quality leap. No animation required.

## Tier 2 — one motion system
| # | improvement | impact | effort | risk |
|---|---|:---:|:---:|:---:|
| **7** | Configure antd motion to `--motion-modal`; every drawer/modal stops running `300ms ease` | 🟢🟢🟢🟢 | 1d | medium |
| **8** | Implement the Phase-3 grammar as shared variants; adopt on the 8 journey screens | 🟢🟢🟢🟢 | 4d | medium |
| **9** | Delete 20 dead keyframes; replace 21 `transition-all` with named properties | 🟢🟢🟢 | 1d | low |
| **10** | Drive every `@keyframes` from `--duration-*` so reduced-motion reaches them | 🟢🟢🟢 | 1d | low |
| **11** | Collapse 10 cubic-bezier spellings → 2 tokens | 🟢🟢 | 1d | low |

**Tier 2 total: ~8 days.**

## Tier 3 — calm the surfaces
| # | improvement | impact | effort | risk |
|---|---|:---:|:---:|:---:|
| **12** | Elevation to 3 levels: retire 69 inline shadows + 12 arbitrary classes | 🟢🟢🟢🟢 | 3d | **high** (visual) |
| **13** | One page-container padding; one `<h1>` per route | 🟢🟢🟢 | 2d | medium |
| **14** | `:focus-visible` + `active:` on every interactive primitive; expose `aria-selected` | 🟢🟢🟢 | 2d | low |
| **15** | Remove separators inside bordered cards; cap emphasis at 3 weights | 🟢🟢 | 2d | medium |
| **16** | Retire the 5 `outline-variant` opacity steps | 🟢 | 1d | medium |
| **17** | Rework `records/[id]`: 13 keyframes → grammar, 34 icons → ~12 | 🟢🟢🟢 | 3d | **high** |

**Tier 3 total: ~13 days.**

---

## Suggested rollout order

```
Sprint 8   Tier 1 (1→6)      the product learns to speak while it works
Sprint 9   Tier 2 (7→11)     one motion system, one grammar
Sprint 10  Tier 3 (12→16)    calm the surfaces  ← first sprint with visible redesign
Sprint 11  Item 17           records/[id], the one screen that is its own product
```

**Why this order.** Tier 1 is invisible when it works and unmistakable when it is missing — it is the only tier that changes how *slow* the product feels, and it carries almost no visual-regression risk. Tier 2 makes the product feel like one machine. Tier 3 is the first work that will show up in a pixel diff, and it should not be attempted until the first two tiers have made the product's behaviour predictable.

Do not start Tier 3 before Tier 1 ships. A calmer surface on a product that goes blank for 800ms is a nicer-looking pause.

---

## Corrections to earlier assumptions

Recorded because they changed the recommendations:

- **I expected the product to be over-animated.** It is under-animated: the authenticated app has **zero** `<motion.*>`. All 51 are on marketing. The problem is not too much motion — it is motion from four uncoordinated sources.
- **I expected card nesting to be a top offender.** Only 2 files nest cards. That audit item is closed, not deferred.
- **I expected the motion tokens shipped in Sprint 4 to be widely adopted.** They are at **31.9%**, and the single most-animated surface in the product — antd modals and drawers — does not consume them at all.


---

# Sprint 8 — implementation record (perceived performance)

## The premise was half wrong, and measuring said so

Sprint 7 reported "blank screens" from a **dev-mode, hard-navigation** probe. Re-measured
against a **production build**:

| | hard nav | client nav |
|---|---|---|
| dev | shell+content at ~400ms | shell 13ms, rows +580ms |
| **prod** | ~50ms | ~10ms, rows +50ms (local API) |

There is no blank-screen problem on a fast connection. **Under latency there is a worse
one.** With the API throttled to 1500ms, `/records` did not render a blank page — it
rendered *confident zeros*:

> `0` New Samples · `0%` authorized · `✓ No urgent cases` · `Completion Rate 0%` ·
> `Active Worklist (0)` · `No completed turnaround data yet`

A zero is indistinguishable from "not loaded". The user was shown a **false empty state** —
a lie, not a wait. That is the real defect this sprint fixed.

## What shipped

| | |
|---|---|
| `Skeleton` / `SkeletonText` / `SkeletonRows` / `SkeletonStat` | shape-preserving placeholders; never invent rows |
| `helix-shimmer` | the **only** keyframe in the product driven by a duration token, so `prefers-reduced-motion` reaches it (the other 99 do not) |
| `GlobalProgress` | 2px top bar on any in-flight query/mutation **or** navigation; peripheral, never competes with content |
| `(app)/loading.tsx` · `error.tsx` · `not-found.tsx` | there were **zero** before |
| `MutationCache.onError` | any unhandled mutation failure speaks. 54 mutations across 27 files acknowledged nothing |
| `MutationCache.onSuccess` | any unhandled success speaks; opt out with `meta: { silent: true }` or override with `meta: { successMessage }` |
| `QueryCache.onError` | a failed **first-load** query speaks; background refetches stay quiet |
| `lib/notify.ts` | one acknowledgement channel, one 3s timer (there were two systems and five timers) |
| `Button loading` | spinner + `aria-busy` + disabled; label does **not** change width mid-click |
| optimistic UI | unread badge decrements on click, rolls back on failure |

## A bug no net could have caught

`/notifications` `markAll` swallowed its own failures:

```ts
Promise.all([ api.put(…).catch(() => {}), api.patch(…).catch(() => {}) ])
```

A 500 resolved as success. No global error handler can catch what never rejects — a failed
"mark all read" was pixel-identical to a successful one. Replaced with `allSettled`, which
throws only when **every** endpoint fails (one may legitimately 404 behind a feature gate).

## Measured results

| success metric | result |
|---|---|
| feedback within 100ms of an async action | **74ms** (mutation) |
| zero blank screens | 761 chars + 90 shimmer elements mid-load |
| zero false empty states | "No urgent cases" / "Active Worklist (0)" / TAT copy all suppressed while loading |
| skeletons removed on arrival | 0 remaining; 20 real rows |
| failed mutation acknowledged | `"Server said no"` (server's own message, surfaced) |
| failed first-load query acknowledged | `"Load failed"` |
| reduced motion | shimmer `animation-name: none` |

zero-orange 0 px · tsc clean · production build clean · merge-contract guard passing.

## Scope honestly stated

- Skeletons were wired into **`/records`, `/billing`, `/qc`** (the three flagship offenders).
  The other 54 fetch-blind routes are now covered by the **global progress bar** and
  `(app)/loading.tsx`, which is a floor, not a per-screen skeleton. Per-screen skeletons
  remain sequenced work.
- **87 buttons** still hand-roll a pending label (`{x.isPending ? 'Saving…' : 'Save'}`).
  One flagship was converted to `loading`; the rest are mechanical and deferred.
- The custom per-page toast (105 calls) was **not** removed. `notify` is now the single
  API and antd is the single renderer; retiring the hand-rolled toast is a visual change
  and belongs to the Tier-3 surface work.


---

## Post-Sprint-8 — the three latency classes are now independently measurable

`apps/web/scripts/measure-experience.mjs` (`npm run measure:experience`) measures each
class separately, with its own budget and its own pass/fail. They are never summed.

| class | boundary | budget | baseline (prod, local API) |
|---|---|---:|---:|
| 1 cold startup | blank → interactive shell | 2000ms | **17ms** |
| 2 route loading | commit → content (fast API) | 400ms | **104ms** |
| 2 route loading | commit → loading cue (API +1500ms) | 200ms | **89ms** |
| 3 interaction | click → visible acknowledgement | 100ms | **72ms** |
| — | no false empty state while loading | *invariant* | **honest** |

**Why they must stay separate.** Class 1 is bounded by bundle size and boot — no progress
bar can exist yet, because the bar *is* React and React has not run. Class 2 is bounded by
the route chunk and its first query. Class 3 is bounded by nothing but our own code. A fix
for one does nothing for the others, and Sprint 8 nearly optimised the wrong one after a
dev-mode hard navigation was mistaken for a blank screen.

**The harness is proven able to fail**, in both directions:

- with `--budget-interaction 1 --budget-cue 1` it reports ❌ and exits 1;
- with the `No urgent cases` gate temporarily removed and rebuilt, the honesty invariant
  reported `❌ lied` — then `✅ honest` once restored.

A check that cannot fail is not a check.

**Two traps this harness closes.** Its interaction probe must be *deterministic and
side-effect free*: the first version clicked "Mark all read", which is **disabled once
everything is read**, so the budget silently became a no-op. It now clicks the notification
bell — present on every authenticated screen, always enabled, writes nothing. And if the
trigger is ever missing it fails loudly rather than passing vacuously.


---

# Sprint 9 — implementation record (motion language)

## What the audit predicted, and what was actually there

Sprint 7 counted four uncoordinated motion sources. It missed a fifth: **the product
already had a page transition.** `(app)/layout.tsx` wrapped every route in
`<div key={pathname} className="animate-fade-slide-in">` — a hand-timed `0.3s ease-out`
fade. It never appeared in the "page transitions: 0" count because it was a CSS class, not
a `template.tsx`.

That mattered. It faded from `opacity: 0`, so **the loading skeleton Sprint 8 shipped was
invisible for ~250ms** while the DOM check reported it present at 94ms. Sprint 8's cue
budget was green against a screen the user could not yet read.

## The grammar

| gesture | token | property | verified |
|---|---|---|---|
| page enters | `--duration-base` · `--ease-emphasized` | `transform` only | ✅ |
| drawer opens | `--duration-slow` · `--ease-emphasized` | `transform` only | ✅ |
| drawer/modal mask | `--duration-slow` · `--ease-standard` | `opacity` | ✅ |
| modal scales | `--duration-slow` · `--ease-emphasized` | `transform`, `opacity` | ✅ |
| card lifts | `--motion-hover` | `box-shadow` only | ✅ |
| press | `--motion-press` (80ms) | `transform` only | ✅ |
| row arrives | `--duration-quick` · staggered ≤160ms | `transform`, `opacity` | ✅ |
| loading shimmer | `--duration-shimmer` | `background-position` | ✅ |

## Scoreboard (product scope)

| | before | after |
|---|---:|---:|
| `transition-all` | 16 | **0** |
| dead `@keyframes` | 11 | **0** |
| page transitions defined | **2** | 1 |
| antd motion mapped to tokens | 0 | 1 |
| `@keyframes` driven by a token | 1 | 5 |
| button families with a press gesture | 1 | 4 |
| global reduced-motion backstop | 0 | 1 |

Nine dead keyframes remain, all in landing/hero (scope-locked).

## The correction this sprint forced

**The page transition originally faded.** It measured beautifully and it was wrong:
the cue became visible at 254ms against a 200ms budget. Motion was withholding information
in order to decorate it — the exact inversion of Principle §1.

The fix was not to relax the budget. It was to delete the fade (the page now *rises*, every
pixel legible on frame one) and to delete the duplicate transition in `layout.tsx`. Then
the cue became visible at **91ms — the same instant it entered the DOM.**

The budget harness was also hardened: it now requires the skeleton to be **≥50% effective
opacity through all ancestors**, not merely present in the DOM. Presence is not a cue.

## Both guards are proven able to fail

- `check:motion-grammar` — reverting the antd override to `all … ease` produced
  `❌ drawer easing`, `❌ drawer animates transform only`. Restored → green.
- `measure:experience` — the visibility check caught the fade regression that the old
  presence check missed.

A check that cannot fail is not a check.

## Scope

Landing/marketing keeps its own motion (51 `<motion.*>`, 9 dead keyframes) and is
scope-locked. `login/page.tsx`, `AiSettingsPane`, `ResultTemplateSelector` still use
`transition-all` — the first is a marketing surface, the other two carry pre-existing
uncommitted changes. `records/[id]` keeps its decorative scanning scene (Tier-3 item 17);
only its 11 **dead** keyframes were removed.

---

# Sprint 10 — Feedback System Completion

One feedback language: every action and failure state acknowledged once, from one
renderer, on a timer set by meaning. No screens redesigned; no business logic touched.

## 1 · Renderer retirement — before / after

| | before | after |
|---|---|---|
| antd `message.*` calls | 192 | **0** |
| per-page `useState`+`setTimeout` toast renderers | 27 files | **2** (blocked — see exceptions) |
| inline `{msg && …}` status spans tied to a mutation | 1 (`productivity`) | **0** |
| canonical `notify.*` calls | 0 | **296** |

`message.*` and the hand-rolled toasts collapsed into `lib/notify.ts` — a single keyed
antd holder. Message **content and intent were preserved**; only the channel changed.

## 2 · Mutation feedback — audit of all 198 `useMutation` sites

| category | count |
|---|---|
| (a/b) speaks for itself — inline `notify` / inline error / self-evident state | 176 |
| (b) covered by the global error-net (no local `onError`) | 2 |
| (d) navigation whose success is self-evident | 10 |
| (c) **explicitly documented** silent mode | 6 |
| **silent, undocumented** (within committable scope) | **0** |

The root cause of the pre-sprint silence: defining `onSuccess` purely to invalidate a
query opts a mutation out of the global success-net. 18 subtle status transitions
(approvals, rejections, deletes, clock in/out, timesheet actions, payroll processing)
now emit an explicit `notify.success`; the genuinely self-evident and background ones
carry an inline `// self-evident … no toast` note so silence is a decision, not a gap.
**Server-provided errors are preserved** everywhere they were before — the global net
routes through `errorMessage()` (server message wins) and inline handlers still read
`err.response.data.message`. No error path was narrowed.

## 3 · Pending actions — Button `loading` adoption

23 hand-rolled `{m.isPending ? 'Saving…' : 'Save'}` text-swaps on Helix `<Button>` were
converted to `loading={m.isPending}` (25 `loading=` sites total). This is
**width-preserving** (spinner replaces the leading icon; label stays put — no layout
shift), sets `aria-busy`, and disables the button (duplicate-submit prevention). Settled
and disabled-state pixels are unchanged; only the in-flight frame differs, by design.

23 further text-swaps live on **raw `<button>`** elements. Converting them means a
component migration, which the locked decisions bar "just to adopt a primitive." Deferred
and listed as convergence debt.

## 4 · Undo

No action qualifies. Every mutation audited is server-final (create / update / delete /
approve / clock) with no rollback endpoint. Per the sprint rule — "do not add undo to
destructive or server-final actions without real rollback support" — **no undo was
added**. Revisit if/when the API grows compensating actions.

## 5 · Dismiss timing — by meaning, not by page

`NOTIFY_DURATION_S`: success/info 3s, warning 5s, error 6s, progress until resolved.
These are **read-durations driven by a JS timer**, independent of the reduced-motion CSS
backstop (which collapses only CSS animation/transition, never the auto-close timer). So
`prefers-reduced-motion` shortens the entrance, never the time text stays legible.

## 6 · Accessibility — browser-verified (`scripts/verify-feedback.mjs`)

Drives real toasts through the chrome-wide Report-an-issue control against the live,
themed antd holder on a production build:

- ✅ error → `aria-live="assertive"`, success → `aria-live="polite"` (polarity by meaning)
- ✅ `aria-atomic="false"` — the region is not re-read whole on each update
- ✅ four rapid submits collapse to **one** toast (dedupe by key → no duplicate SR announce)
- ✅ **Escape** dismisses all toasts (bound in `NotifierBridge`)
- ✅ zero-orange: both success and error toasts scanned → **0** violating pixels
  (theme sets `colorWarning:#a16207`, `colorError:#ef4444`, `colorSuccess:#22c55e`,
  `colorInfo:#4f7df9`; `notify.warning` is unused)

## Intentional silent exceptions (the complete list)

Each carries an inline comment at its `useMutation`:

- **messaging** — thread read-receipt on open (background; the unread badge clears)
- **notifications / WorkforceNotificationDrawer** — single-item read (the row's unread dot clears in place)
- **knowledge-base article feedback** — widget swaps to a "Thanks" state in place
- **portal payment-method select** — the chosen method becomes the selected chip on refetch
- **payroll AI assistant** — the reply renders in the answer pane
- **portal reset-request** — identical response either way (anti-enumeration)

## Verification — all green

`tsc` clean · production build clean · `check:merge-contract` · `check:motion-grammar` ·
`measure:experience` (cold 47ms / route 87ms / cue 102ms / interaction 61ms — all under
budget) · `verify-feedback` (6/6) · zero-orange 0px on rendered toasts.

## Blocked exceptions (not committed)

Two files still run the legacy per-page toast — `change-requests/page.tsx` and
`SettingsListPane.tsx`. Both carry **pre-existing uncommitted edits from the user**, and
the toast lines interleave with those edits in the same diff hunks, so migrating them
cannot be staged without also staging unrelated work. They are excluded from the Sprint 10
commit; migrate them once their pending changes land. (They are not truly *silent* — they
still acknowledge through the old renderer; they are just not yet on the canonical channel.)
