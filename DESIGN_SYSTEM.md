# CYTOLAB — Design System

> Implementation-facing tokens and component conventions. For brand philosophy
> and presentation standards, see **BRAND_GUIDELINES.md**. Design language:
> **Apple · Linear · Vercel · Stripe** — never Material, Bootstrap, or enterprise SAP.

---

## 1. Color — two-surface split (locked decision)

There are **two primary colors**, scoped by surface. This is intentional; do not merge them.

### Product (authenticated: dashboard, workstation, client portal, lab)
| Token | Value | Use |
|---|---|---|
| Primary (indigo) | `#4F46E5` | interactive: buttons, links, active nav, focus |
| Primary tint | `rgba(99,102,241,.10–.15)` | icon chips, hover, selected rows |
| Text primary | `#0a0b1a` / `#0F172A` | headings, values |
| Text secondary | `#64748b` | labels, meta |
| Surface | `#F8F8FA` / `#F8FAFC` | app background |
| Card | `#FFFFFF` | cards |
| Border | `#E5E7EB` / `#EEF2F7` | hairlines |
| Success | `#16A34A` / `#22c55e` | authorized, complete |
| Amber (safe) | bg `#FEF3C7` · text `#92400E` | warnings / pending — **the only sanctioned amber** |
| Error | `#ef4444` / `#DC2626` | destructive |
| Red accent | `#E63946` | branding, AI highlights, specimen visuals, key CTAs |

### Marketing (public landing, login, `apps/marketing`)
| Token | Value | Use |
|---|---|---|
| Brand primary (red) | `#E63946` | primary accent, CTAs, active states, italic emphasis |
| Ink / graphite | `#0E1016`–`#06070d` | dark section backgrounds |
| Violet ambient | `#8B5CF6` / `rgba(139,92,246,…)` | glows, cell clusters |
| Green | `#10B981` | live/positive indicators |

### 🚫 Absolute rules
- **ZERO-ORANGE.** Never emit a pixel where `r>200 && 100≤g≤190 && b<90`. Never
  `#F97316`, `#f59e0b`, `#FF6A5C`, or emoji that render orange/amber. Watch
  anti-aliased edges of yellow/amber on dark backgrounds (they blend into the trip
  box). Safe substitutes: dark amber `#92400E`/`#78350F`, `#FDE68A` (b=138), rose-400
  `#FB7185`, yellow-400 `#FACC15` (solid only). **Run the detector after every UI change.**
- **Never a blue *marketing* primary; never a red *product* primary.** (See split above.)
- No rainbow gradients; gradients are subtle and purposeful only.

---

## 2. Spacing system — enterprise design tokens
The permanent spacing architecture. Tokens live in `apps/marketing/app/globals.css`
(`:root`); use them as utility classes or directly in inline styles
(`style={{ padding: 'var(--space-32)' }}`). **Token name = pixel value**
(`--space-16` = 16px), values in rem so they scale with root font-size. **No magic
numbers** — never hand-type `1.1rem`, `10px`, `mt-11`, `pb-28`, `gap-7`.

### 2a. Scale
8px base rhythm, small `2/4/12` steps, deliberately sparse large-scale jumps.

| Token | px | Token | px | Token | px |
|---|---|---|---|---|---|
| `--space-2` | 2 | `--space-24` | 24 | `--space-96` | 96 |
| `--space-4` | 4 | `--space-32` | 32 | `--space-112` | 112 |
| `--space-8` | 8 (base) | `--space-40` | 40 | `--space-128` | 128 |
| `--space-12` | 12 | `--space-48` | 48 | `--space-160` | 160 |
| `--space-16` | 16 | `--space-56` | 56 | | |
| `--space-20` | 20 | `--space-64` / `--space-80` | 64 / 80 | | |

### 2b. Semantic tokens

**Section spacing** — a section's outer vertical padding (pair with `--section-gutter`, `clamp(20–40px)`):

| Token / class | px | Use |
|---|---|---|
| `--section-xs` / `.section-xs` | 40 | tight band |
| `--section-sm` / `.section-sm` | 56 | sub-section / split panel |
| `--section-md` / `.section-md` | 80 | **default** section |
| `--section-lg` / `.section-lg` | 96 | prominent section |
| `--section-xl` / `.section-xl` | 112 | hero / CTA |

**Card spacing** — interior padding: `--card-padding-sm` 24 · `--card-padding-md` **32 (default)** · `--card-padding-lg` 40 (`.card-padding-*`).

**Containers** — cap + center content: `--container-sm` 640 · `--container-md` 960 · `--container-lg` **1280 (default)** · `--container-xl` 1440 (`.container-*`).

**Content measure** — max readable line length: `--measure-xs` 320 · `--measure-sm` 400 · `--measure-md` **640 (~65ch, body prose)** · `--measure-lg` 768 (`.measure-*`).

### 2c. Where each is used (semantic application)

**Section spacing** — a section's establishing/outer vertical padding uses a
`--section-*` tier by the section's role; the outer side gutter uses
`--section-gutter`:

| Section role | Token | Applied to |
|---|---|---|
| Hero / major CTA / cinematic | `--section-xl` (112) | Hero, CTA |
| Prominent / dark feature panels | `--section-lg` (96) | Security |
| **Default** content sections | `--section-md` (80) | Problem, AI, Dashboard, Modules, Pricing headers |
| Compact supporting bands | `--section-sm` (56) / `--section-xs` (40) | Footer top; sub-blocks |
| Any section's L/R edge | `--section-gutter` (clamp 20–40px) | every full-bleed section (responsive) |

Deeper *content* spacing inside a section (column tops/bottoms, block gaps) stays
on the raw `--space-*` scale — those aren't the section's outer rhythm.

**Card spacing** — a card's interior padding uses `--card-padding-*` when it's a
uniform card (e.g. AI outcome cards → `--card-padding-sm`, the blue Fix panel →
`--card-padding-lg`). Do **not** use raw `--space-*` for card interiors *unless*
it's a documented exception (see 2d): the compact product-mock cards in the
Dashboard section (`--space-16`) and the asymmetric editorial cards (Pricing
`48/40`, Security cert cells `24/20`) intentionally keep bespoke padding.

**Grid spacing** — gaps between grid/flex children and margins between blocks use
the raw `--space-*` scale (`gap: var(--space-24)`, `marginBottom: var(--space-32)`).
Even steps for rhythm; `--space-4`/`--space-2` only for tight/hairline gaps.

**Typography spacing** — space *around* text blocks (heading→body, eyebrow→headline)
uses `--space-*`. Line-height / leading stays a **typographic** property (set by the
type utilities), not a spacing token.

**Measure** — cap paragraphs with `--measure-*`; cap page content (see below) with
`--container-*`.

### 2d. Container usage & full-bleed exception
The marketing site is **intentionally full-bleed / cinematic** — sections run
edge-to-edge with `--section-gutter` insets, and grids/split panels span the full
viewport. So `--container-*` are **available for capped editorial / content pages
(docs, blog, legal, article layouts), not required for full-bleed cinematic
marketing sections** — none are applied on the marketing homepage today, by design.

### 2e. Optical exceptions (intentional, documented — not accidental)
Visual rhythm > mathematical perfection. These may remain literals:
- **Button padding** (`13px 26px`, `14px 30px`, `11px`, `8px 18px`) — tuned for control balance; 8pt-snapping makes buttons feel wrong.
- **Baseline nudges ≤4px** (`marginTop: '3px'` under a metric, dot-seating `6px`) — optical alignment.
- **Headline leading** between stacked display lines (`0.1rem`, `0.25rem`) — part of the tight editorial composition.
- **Compact product-mock padding** (Dashboard mock cards, `--space-16`) — a deliberately dense UI facsimile, not a real content card.
- **Asymmetric editorial card padding** (Pricing plan cards `48/40`, Security cert cells `24/20`) — bespoke proportions where a single symmetric `--card-padding-*` wouldn't fit.
- **1px** borders / hairline divider lines and grid `gap: '1px'` separators.
- **Element dimensions** (dot/icon/line/bar `width`/`height`, e.g. `width: 3`) — graphic sizes, not layout spacing.
- **Structural positioning** — `inset: 0`, `translate(-50%,-50%)`, full-bleed offsets, decorative `vw`/`em` ghost-type positions.

Everything else references a token. Product app (`apps/web`) follows the same 8pt discipline via Tailwind's scale — avoid odd steps (`mt-11`, `gap-7`).

## 3. Radius
| Context | Radius |
|---|---|
| Marketing cards / large surfaces | `20–28px` (target 24px) |
| Product cards | `16px` |
| Controls / inputs | `10–12px` |
| Pills / chips | `999px` |

## 4. Elevation (soft, subtle — never harsh)
```
--shadow-sm: 0 8px 24px -14px rgba(15,23,42,.2);
--shadow-md: 0 18px 50px -20px rgba(15,23,42,.28);
--shadow-lg: 0 40px 90px -30px rgba(15,23,42,.28);
```
Glass surfaces: `background: rgba(255,255,255,.72–.9)` + `backdrop-filter: blur(14–24px)`
+ `1px` hairline border + `inset 0 1px 0 rgba(255,255,255,.7)`.

## 5. Typography
- Font: **Geist / Inter**, system fallback.
- Display headings `700–900`, tight tracking (`-.02 … -.03em`); marketing hero up to `80px`.
- Body `13–17px`, secondary `#64748b`. Numeric/tabular values use `font-variant-numeric: tabular-nums`.

### 5a. Marketing typography system (`apps/marketing`)
One reusable, premium/editorial type scale for the **marketing website only**. The
product app (`apps/web`) keeps Inter/Geist; the editorial serif is for the
marketing hero + section titles. Utilities live in `apps/marketing/app/globals.css`;
fonts are loaded once in `apps/marketing/app/layout.tsx`.

**Font roles (CSS variables, injected by `next/font`):**
- `--font-display` — **Newsreader** (editorial serif) → `.display-xl`, `.display-lg`
- `--font-sans` — **Inter** (SaaS) → headings, body, metrics, `.ui-sm`
- `--font-mono` — **Space Mono** (dedicated clinical/technical label face) →
  `.label`, `.label-pill`, `.ui-xs` — eyebrows, status, KPI captions, compliance,
  dashboard metadata
- `--font-serif` — DM Serif Display — **legacy**, being migrated to `--font-display`

**Font decision rules — pick the font by content type, never guess:**

| Font | Utilities | Use for |
|---|---|---|
| **Space Mono** (`--font-mono`) | `.label` · `.label-pill` · `.ui-xs` | **Status** (AI Screening, LIVE, Processing, Complete, Pending) · **Compliance** (HIPAA, SOC 2, CAP, FHIR R4, CLIA) · **technical badges** · **version numbers** (v3.2) · **identifiers** (Slide IDs, Specimen IDs, accession/lab #) · **timestamps** · **KPI captions** |
| **Inter** (`--font-sans`) | `.heading-*` · `.body-*` · `.metric-*` · `.ui-sm` | **Buttons/CTAs** · **navigation** · **paragraphs/body** · **feature descriptions** · **card text** · SaaS section headings & KPI numbers |
| **Newsreader** (`--font-display`) | `.display-xl` · `.display-lg` | **Hero headlines and major section headlines ONLY** |

Rule of thumb: if it's a *machine/clinical token* (a code, ID, status, cert, timestamp, or a metric's caption) → Space Mono. If it's something a *human reads or clicks* (prose, a button, a nav item, a card) → Inter. If it's a *statement headline* → Newsreader.

**Utilities — use these instead of arbitrary text sizes (all responsive via `clamp()`):**

| Class | Use for | Family · size · leading · tracking · weight |
|---|---|---|
| `.display-xl` | **Homepage hero H1 only** | serif · `clamp(64–128px)` · `.92` · `-.055em` · 400 |
| `.display-lg` | Major section headers | serif · `clamp(44–76px)` · `.95` · `-.045em` · 400 |
| `.heading-xl` | Strong SaaS section titles | sans · `clamp(36–56px)` · `1.02` · `-.04em` · 650 |
| `.heading-lg` | Subsection titles | sans · `clamp(28–40px)` · `1.1` · `-.03em` · 650 |
| `.heading-md` | Card / feature titles | sans · `20px` · `1.25` · `-.02em` · 650 |
| `.body-xl` | Hero paragraph | sans · `clamp(18–22px)` · `1.55` · `-.01em` |
| `.body-lg` | Section body copy | sans · `18px` · `1.6` |
| `.body-md` | Normal body | sans · `16px` · `1.55` |
| `.body-sm` | Supporting text | sans · `14px` · `1.45` |
| `.label` | Small uppercase section labels | **mono** · `12px` · `1` · `.18em` · 700 · UPPER |
| `.label-pill` | Hero badges | **mono** · `12px` · `.16em` · 700 · UPPER |
| `.metric-xl` | Large KPI numbers | sans · `clamp(36–56px)` · `.95` · `-.045em` · 700 |
| `.metric-lg` | Smaller KPI numbers | sans · `32px` · `1` · `-.035em` · 700 |
| `.ui-sm` | Interface labels | sans · `13px` · `1.35` · 500 |
| `.ui-xs` | Tiny dashboard metadata | **mono** · `11px` · `1.25` · `.02em` · 600 |

**Rules:** no arbitrary/ad-hoc text sizes once this exists; replace repeated
Tailwind text classes with these semantic utilities as sections are migrated;
apply gradually (hero first, then per-section on approval). Do not apply globally
in a way that changes the product app.

## 6. Motion (see BRAND_GUIDELINES §Motion for the philosophy)
- Standard easing (marketing): `cubic-bezier(.22,.8,.2,1)`; doc-spec alt `cubic-bezier(.22,.61,.36,1)`.
- Durations: micro-interactions `150–350ms`; section reveals `600–800ms`.
- **framer-motion** in `apps/web`; **GSAP + Lenis** in `apps/marketing`. Prefer GPU
  transforms (`translate3d`, `scale`, `opacity`); drive continuous fields with
  `requestAnimationFrame`. Counters increment only on viewport entry.

## 7. Icons
**Lucide only.** Never Heroicons, never emoji in UI (emoji are inconsistent and an
orange risk — replace with Lucide SVGs).

## 8. Components — conventions
- **New components → shadcn/ui.** Existing **antd** stays until a screen is redesigned
  (see ARCHITECTURE §5). Never rewrite a stable screen to swap libraries.
- Compose class names with `clsx` + `tailwind-merge`.
- Charts: **Recharts**. Tables: custom today; **TanStack Table** for new complex tables.
- Status is communicated by the shared portal helpers (`StatusBadge`, `SpecimenIcon`)
  whose palettes are already zero-orange — reuse them, don't re-invent colors.

## 9. Verification (required for any visual change)
1. `tsc --noEmit` clean · production build clean.
2. Screenshot the changed surface (headless Chrome).
3. Run the **zero-orange pixel detector** → must be `0`.
4. Restart the web dev server + clear `.next` after a web change (not the API).
