# CYTOLAB — Architecture

> Target architecture ("Tech Stack v2") + where the codebase stands today + the
> phased, **additive** migration plan. This is a living document. The guiding
> principle is **incremental evolution, never wholesale rewrite** — preserve every
> working route, API, page, animation, and business rule.

---

## 1. System overview

```
Client ─▶ Next.js (web) ─▶ NestJS (api) ─▶ Prisma ─▶ PostgreSQL
                                │
                                ├─▶ Anthropic Claude (AI reporting)
                                ├─▶ Google Cloud Storage (WSI / images / PDFs)
                                ├─▶ socket.io gateway (realtime push)
                                └─▶ LIS / FHIR export
```

Monorepo: **npm workspaces** (`apps/*`, `packages/*`). Local infra via
`docker-compose.yml` (Postgres).

### Apps
| App | Stack | Purpose |
|---|---|---|
| `apps/web` | Next 14 (App Router), React 18, Tailwind, antd, framer-motion, three/RTF | Authenticated product **and** public landing/login |
| `apps/api` | NestJS 10, Prisma 5, Postgres | LIMS backend, auth, AI, realtime |
| `apps/marketing` | Next, GSAP, Lenis, framer-motion | Standalone marketing site |

### Packages
| Package | Status |
|---|---|
| `packages/shared` (`@cytolab/shared`) | exists |
| `ui`, `config`, `types`, `animations`, `analytics` | **to be extracted** (Phases 2–3) |

---

## 2. Current stack (verified)

### Frontend (`apps/web`)
- **Next.js 14.2 / React 18.3** (target: 15 / 19 — Phase 5)
- **Tailwind 3.4** + `clsx` + `tailwind-merge`
- **Ant Design 5** — app shell (nav, drawer, menus, config provider). See UI strategy §5.
- **framer-motion 12** — primary web animation lib (GSAP/Lenis live only in `apps/marketing`)
- **three 0.160 + @react-three/fiber 8 + @react-three/drei 9** — installed; the hero vial (`HeroVial.tsx`) is currently **imperative three.js**, not RTF components
- **zustand 4** (state), **@tanstack/react-query 5** (data), **axios** (`portalApi`/`api`)
- **recharts 3** (charts), **lucide-react** (icons — never Heroicons)
- **socket.io-client 4** (realtime)
- Custom theme via `lib/theme-context.tsx`

### Backend (`apps/api`)
- **NestJS 10 + Prisma 5 + PostgreSQL**
- **Auth (custom — keep):** argon2id, TOTP (`otpauth`), email OTP, HttpOnly cookies
  (`session.service`), `@nestjs/jwt` + passport-jwt, throttler, helmet, custom RBAC
  (roles/permissions), multi-tenant via `AsyncLocalStorage` (`LabContext`)
- **Validation:** `class-validator` / `class-transformer` DTOs
- **AI:** `@anthropic-ai/sdk` (Claude, `claude-sonnet-4-6`) for **structured reporting**,
  with total graceful degradation (never throws)
- **Storage:** `@google-cloud/storage` (+ `googleapis`)
- **Realtime:** socket.io gateway (`modules/realtime`) — lab/user/superuser rooms
- **Email:** `nodemailer` · **Cron:** `@nestjs/schedule` (in-process, no queue yet)

---

## 3. Target vs current — gap summary

| Area | Target | Current | Action |
|---|---|---|---|
| Monorepo | Turborepo | npm workspaces, no `turbo.json` | Phase 1 (add pipeline) |
| Packages | ui/config/types/animations/… | `shared` only | Phase 2–3 (extract) |
| Framework | Next 15 / React 19 | Next 14 / React 18 | Phase 5 |
| Components | shadcn/ui | antd + custom | §5 — new = shadcn; migrate on redesign only |
| 3D | RTF + Drei | RTF/Drei installed; hero imperative | keep working; refactor opportunistically |
| Animation | GSAP + Framer + Lenis | Framer (web); GSAP/Lenis (marketing) | Phase 3 (`packages/animations`) |
| Realtime | WebSockets + SSE | socket.io ✓, no SSE | add SSE for AI progress (Phase 7) |
| Cache/Queue | Redis + BullMQ | in-process cron | Phase 6 |
| AI | Python/FastAPI + Torch/ONNX (CV) | Claude SDK (reporting) | **keep** — different capability (§4) |
| Storage | S3 / R2 | GCS | **keep** — satisfies "object storage" intent |
| Payments | Stripe | payments module, no Stripe | Phase 7 (as needed) |
| Search | Meilisearch | SQL `SearchModule` | Phase 7 (as needed) |
| Logging/Monitoring | Pino / Sentry | none | Phase 2 |
| Email/SMS | Resend / Twilio | nodemailer / none | keep nodemailer; SMS as needed |
| Analytics | PostHog | none | Phase 7 |

---

## 4. Deliberate divergences (do NOT "fix")

- **AI is Claude-based reporting, not a Python CV service.** The doc's
  FastAPI + Torch/ONNX targets *whole-slide computer-vision inference*. The current
  AI produces **structured, redacted diagnostic reports** via Claude with graceful
  degradation — a different, shipping capability. Add a CV microservice **only** when
  real WSI inference is on the roadmap (see ROADMAP Phase 5); do not remove the
  Claude reporting path.
- **Storage is GCS, not S3/R2.** Fully wired for WSI/images/reports/PDFs. The target's
  intent ("S3-compatible object storage") is met. Swapping providers is churn with no
  functional gain.
- **Custom auth stays** (the target doc explicitly recommends this for healthcare).

---

## 5. UI component strategy (decision — locked)

- **Do not perform a global Ant Design migration.**
- **All new components use shadcn/ui.**
- Existing antd screens are migrated **only** when already being redesigned or
  substantially refactored — **never** rewrite a stable screen solely to swap libraries.

## 6. Color strategy (decision — locked)

- **Marketing** (`apps/marketing` + public landing/login): **CYTOLAB Red `#E63946`** as
  the primary brand accent.
- **Authenticated product** (dashboard, workstation, client portal, lab): **Indigo
  `#4F46E5`** as the primary interactive color. **Do not recolor the product UI.**
- Red in the product is reserved for branding, AI highlights, specimen visuals, and
  destructive/critical actions.
- **Zero-orange is absolute** everywhere (see CLAUDE.md and BRAND_GUIDELINES.md).

---

## 7. Phased migration plan (additive, risk-ranked)

| Phase | Work | Risk | Breaking |
|---|---|---|---|
| **0** | Repo docs: ARCHITECTURE / DESIGN_SYSTEM / CLAUDE / ROADMAP / BRAND_GUIDELINES | none | no |
| **1** | `turbo.json` pipeline over existing npm workspaces | very low | no |
| **2** | Pino (API) + Sentry; extract `packages/types` & `packages/config` | low | no |
| **3** | Consolidate GSAP/Lenis; extract `packages/animations` | low–med | no |
| **4** | shadcn/ui for new components; migrate antd screen-by-screen on redesign | med–high | risk if rushed |
| **5** | Next 15 / React 19 behind build + e2e gate | med | possible |
| **6** | Redis + BullMQ for AI/report jobs | med | no |
| **7** | Stripe, Meilisearch, PostHog, SSE, TanStack Table — as needed | med | no |

**Rule:** each phase ships behind a clean `tsc --noEmit` + production build + the
zero-orange check, and preserves all existing behavior.
