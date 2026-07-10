# CLAUDE.md — Engineering constitution for CYTOLAB

Project-specific instructions for AI-assisted development. Read this before making
changes. Companion docs: **ARCHITECTURE.md**, **DESIGN_SYSTEM.md**,
**BRAND_GUIDELINES.md**, **ROADMAP.md**.

---

## Prime directives
1. **Do not rewrite the application.** Prefer refactoring over replacement. If an
   existing implementation works and is good, keep it.
2. **Preserve everything that works** — routes, APIs, pages, animations, business
   logic, auth. No breaking changes.
3. **Evolve incrementally.** Before any *structural* change, explain why, and get
   approval. Additive, low-risk work first (see ARCHITECTURE §7 phases).
4. **Keep the premium Apple/Linear/Vercel design language** intact.

## Locked decisions
- **Color split:** marketing = red `#E63946`; product = indigo `#4F46E5`. **Do not
  recolor the product UI.** (DESIGN_SYSTEM §1.) ⚠️ The standalone `apps/marketing`
  site actually ships **indigo**, not red — an unresolved contradiction, not a
  licence to recolor either surface. See DESIGN_SYSTEM §1e.
- **Color tokens:** three-tier + a domain layer (primitive → semantic UI → **domain**
  → theme → component). **No component may contain a raw hex**; consume
  `--color-*` (Tier 2) or `--specimen-* / --workflow-* / --billing-*` (Tier 2.5).
  Never name a hue in a component. To retire a hex, point it at a Tier-1 token —
  never edit a Tier-2 *value* (Tailwind is var-backed; you'd recolor 600+ sites).
- **UI libraries:** new components → **shadcn/ui**; migrate **antd** only when a screen
  is already being redesigned. Never rewrite a stable screen to swap libraries.
- **Primitives:** build screens from `@/components/ui` (`Card`, `Button`, `IconAction`,
  `Input`, `Badge`, `Th/Td/Tr`, `EmptyState`, `SectionContainer`) instead of hand-written
  class strings. Primitives consume Tier-2/2.5 + **motion tokens** only. Never write a
  raw duration or easing curve — use `--motion-hover/-press/-focus/-entrance/-modal`.
  Don't rewrite a stable screen just to adopt a primitive. (DESIGN_SYSTEM §6, §8.)
- **Custom utilities are part of the merge contract.** Whenever Helix introduces a custom
  utility namespace (typography, spacing, sizing, colour, radius, shadow, motion …),
  `extendTailwindMerge` in `ui/cn.ts` **must be updated in the same change**. A custom
  utility that tailwind-merge does not know about gets mis-grouped and silently evicted by
  a later class in the same group — no type error, no build error, just wrong rendering.
  This is a rule about the *merge contract*, not merely about the design tokens.
  (It shipped once: `text-label-sm` was filed as a colour and evicted by `text-secondary`,
  rendering the roles/users tables at 16px instead of 12px. DESIGN_SYSTEM §8j.)
- **Keep custom auth, GCS storage, and the Claude-based AI reporting path** (see
  ARCHITECTURE §4). Don't replace them to match the target doc literally.

## The zero-orange rule (hard constraint)
No pixel may satisfy `r>200 && g in [100,190] && b<90`. Never `#F97316`, `#f59e0b`,
`#D97706`, `#EAB308`, coral `#FF6A5C`, or orange/amber emoji. Anti-aliased edges of
yellow/amber on dark backgrounds trip it — verify, don't assume. Safe substitutes:
`#92400E`/`#78350F`/`#A16207` (dark amber), `#FDE68A` (b=138), `#FB7185` (rose),
`#FACC15` (solid yellow only).
**Gradients: safe stops ≠ safe gradient.** The browser interpolates between stops, so
`#EF4444 → #FACC15` paints `rgb(242,108,54)` in the middle. This shipped on `/billing`
behind a comment claiming compliance. Screenshot gradients and run the detector.
**Grepping for `#` is not an audit.** `/result-sheets` shipped `#EAB308` as the Tailwind
utility `text-yellow-500` — no hex to find. Only the pixel detector catches these.
**A safe solid can still be a violation.** `#B45309` (r=180) passes, but its anti-aliased
edges blend through the box (alpha .67–.73 → `rgb(202,134,82)`). It shipped in 42 places
behind "detector-safe" comments. Use `--color-warning` (`#A16207`) on white/amber-50, and
`--status-warning-strong` (`#854D0E`) on amber-100 — `#A16207` trips over amber-100.
Check a foreground against **its actual background, at every alpha**.
**Run the pixel detector after every UI change; it must report 0.**

## The motion grammar (one application, one vocabulary)
Two curves, six durations, all from tokens. `cd apps/web && npm run check:motion-grammar`
(needs a **production** build on :3100).

- `--ease-standard` for state changes; `--ease-emphasized` for entrances. Nothing else.
- **Never animate `all`.** Name the property, or the browser animates layout too.
- Every `@keyframes` takes its duration from a `--duration-*` token, so
  `prefers-reduced-motion` reaches it. A global backstop in globals.css collapses
  everything (including third-party CSS) to 1ms — `1ms`, not `0s`, so `transitionend`
  still fires.
- antd owns the modals and drawers. It takes our duration tokens via `ConfigProvider`,
  but hardcodes `transition: all .3s ease` on its enter classes; globals.css overrides
  that. Don't remove those overrides.
- **Motion never withholds information.** The page transition rises, it does not fade in:
  a fade from `opacity: 0` kept the loading skeleton invisible for 254ms and blew the
  200ms cue budget. Information appears before decoration.
- The page transition lives in `(app)/template.tsx` — the one place Next re-mounts on
  navigation. There must be exactly one.

## Experience budgets (three independent latency classes)
Never collapse these into one number. Different causes, different fixes; a good score in
one hides a bad score in another. `cd apps/web && npm run measure:experience` (needs a
**production** build on :3100 — dev numbers measure the compiler, not the product).

| # | class | boundary | budget | fixed by |
|---|---|---|---|---|
| 1 | cold startup | blank → interactive shell | ≤ 2000ms | shipping less JS. A progress bar cannot exist yet — it *is* React. |
| 2 | route loading | commit → content (and → loading cue under latency) | ≤ 400ms / ≤ 200ms | `loading.tsx`, Suspense, per-screen skeletons |
| 3 | interaction | click → visible acknowledgement | ≤ 100ms | `GlobalProgress`, `Button loading`, optimistic updates |

Plus one non-negotiable invariant: **no false empty state while loading.** A `0` or a
"✓ No urgent cases" rendered before data arrives is a lie, not a wait.
Sprint 8 conflated classes 1 and 2 once (a dev-mode hard navigation looked like a blank
screen; in production it was a cold start) and nearly optimised the wrong thing.

**Don't broaden optimistic UI without clear user value.** It buys perceived speed with
rollback complexity. The unread badge qualifies (the eye is on it); the list behind it
does not (the row is on screen either way).

## Verification workflow (non-negotiable for shipping changes)
- `cd apps/web && npx tsc --noEmit` → clean (ignore stale `.next-prod/types/**`
  TS6053 noise; `rm -rf .next-prod` if needed).
- Production build clean when the change is substantial (`next build` uses `.next-prod`,
  safe alongside a running dev server).
- **Drive the real flow** to confirm behavior (headless Chrome / Playwright), not just
  types. Screenshot visual changes and run the orange detector.
- After a **web** change + commit: kill dev, `rm -rf apps/web/.next`, restart
  `npm run dev` (do **not** restart the API for web-only changes). Browser must see fresh chunks.
- Browser-verify logins: staff `william.brooks@cytolab.demo` / `Verify123!`;
  portal `drbrown@clinic.test` / `Portal123!`. Never overwrite the real user's password.

## Database & migrations
- Generate migrations with `prisma migrate diff --from-schema-datasource … --script`
  → write a **timestamped SQL file** → apply with `prisma migrate deploy`.
- **`prisma db push` is banned.** `prisma migrate dev` needs a TTY (won't run headless).
- Every tenant-owned model carries `labId`; tenancy is enforced via `AsyncLocalStorage`
  (`LabContext`) + a Prisma extension — never trust `labId` from the request body.

## Backend conventions
- NestJS modules under `apps/api/src/modules/*`. DTOs use `class-validator`.
- Realtime: inject `RealtimeGateway` and `emitToLab/emitToUser/emitToSuperusers`.
  Emit at real mutation sites; scope by `labId`.
- The AI service must **never throw** (graceful degradation); keep redaction in place.

## Frontend conventions
- `apps/web`: framer-motion for animation; Lucide icons; Recharts; Zustand + TanStack
  Query. `apps/marketing`: GSAP + Lenis.
- Inject a raw CSS string into a component with
  `<style dangerouslySetInnerHTML={{ __html: CSS }} />` (avoids SSR hydration mismatch
  on server-rendered pages).
- Keep deterministic render (no `Math.random`/`Date.now` at render time on SSR paths).
- The user runs space-consuming ("classic") scrollbars — nav + content must share one
  scroll container; test with overlay scrollbars disabled.

## Git & commits
- Work on a feature branch, not `main`. Commit/push only when asked.
- End commit messages with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Scope commits to the change; don't stage unrelated pre-existing modifications.

## Monorepo
- npm workspaces (`apps/*`, `packages/*`). Root scripts: `dev:api`, `dev:web`, `build`,
  `db:migrate`, `db:studio`. (Turborepo pipeline lands in Phase 1.)

## When unsure
Surface contradictions instead of guessing — especially design-doc rules that conflict
with the shipping product (e.g. color/primary). Give a recommendation; let the user decide.
