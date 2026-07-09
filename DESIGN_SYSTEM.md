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

## 2. Spacing — 8pt system
Base unit **4px**; prefer multiples of 8 (`8, 16, 24, 32, 40, 56`). Page gutters:
product `24–56px`, marketing sections `56px`. Card padding `20–24px`.

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
