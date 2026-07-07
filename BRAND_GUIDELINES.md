# CYTOLAB — Brand Guidelines

> The visual and motion language of CYTOLAB. The *why* behind the tokens in
> **DESIGN_SYSTEM.md**. North star: a **premium medical operating system** that feels
> like Apple / Linear / Vercel / Stripe — not typical medical software.

---

## Brand essence
Precision, calm confidence, and living science. Every surface should feel engineered,
restrained, and trustworthy — clinical without being cold, premium without being loud.

## Color philosophy — two surfaces, one system
CYTOLAB runs **two primary colors on purpose**:

- **Red `#E63946` = brand.** The public/marketing voice. Energy, focus, the specimen.
  Used for accents, CTAs, italic emphasis ("work."), AI highlights, and specimen visuals.
- **Indigo `#4F46E5` = productivity.** The authenticated product voice. Calm, focused,
  interactive. The color clinicians work in all day.

Never invert this: no blue-primary marketing, no red-primary product. Supporting hues —
violet `#8B5CF6` (ambient/biology), green `#16A34A` (positive/live), safe amber
`#FEF3C7`/`#92400E` (caution). **Zero-orange, always** — orange/amber (and orange-rendering
emoji) are forbidden; verify with the pixel detector after every change.

## Typography
Geist / Inter. Big, tight, confident display type (marketing hero up to 80px, tracking
≈ −0.03em). Body stays quiet: `#64748b`, comfortable line-height. Numbers are tabular.
Hierarchy through weight and size, not decoration.

## Iconography
**Lucide** exclusively — thin, consistent, controllable stroke. No Heroicons, no emoji in
product UI (emoji are inconsistent across platforms and an orange-pixel risk).

## Glassmorphism
Frosted glass for elevated surfaces: translucent white/dark fills, `backdrop-filter: blur`,
a single hairline border, and a subtle inner top highlight. Glass suggests depth and
cleanliness — use it for hero cards, overlays, floating panels; not for everything.

## Shadows & elevation
Soft, wide, low-opacity, **very subtle**. Layered shadows imply lift without heaviness.
Never hard drop-shadows or neon glows (the one exception: intentional red bloom around the
AI/active node in the workflow story).

## Spacing & radius
8-pt rhythm. Generous breathing room. Rounded but not bubbly — marketing 20–28px, product
16px, controls 10–12px, pills fully round.

## Motion principles
Animation exists to **tell the product story**, never for decoration.
- Every section should read in under three seconds and flow into the next.
- Cards animate into place with subtle depth and spring; reveals are 600–800ms.
- Hover states: gentle lift + soft shadow, never exaggerated (150–350ms).
- Counters increment only on viewport entry.
- Background cells/particles drift continuously but almost imperceptibly — a living
  scientific environment.
- Prefer GPU transforms; `requestAnimationFrame` for continuous fields. Easing
  `cubic-bezier(.22,.8,.2,1)` (or the doc's `.22,.61,.36,1`).
- Tooling: **framer-motion** in `apps/web`, **GSAP + Lenis** in `apps/marketing`.

## Hero philosophy
The specimen vial is a **product**, not a decorative image — a cinematic, physically-based
WebGL render (PBR glass, blood simulation, ripple, floating cells) that reinforces
"Don't just test. Optimize." It should feel like an Apple product film. The same asset
serves the landing hero and the login page (`bare` mode over dark backgrounds).

## Product presentation rules
- Show the platform **working**, not screenshots — live, auto-advancing demonstrations
  (the pipeline dashboard, the workflow story).
- Minimalism over density; whitespace is a feature.
- Consistency across surfaces beats novelty on any one screen.
- Accessibility and 60fps performance are part of "premium," not afterthoughts.

## The anti-patterns (never)
Material Design · Bootstrap · enterprise SAP density · rainbow gradients · orange/amber ·
blue-primary marketing · red-primary product · exaggerated motion · decorative-only animation.
