# Cytolab 2.0

Rebuild of the Cytolab LIMS as a **NestJS modular monolith** (PostgreSQL + Prisma) with a **Next.js 14 + Ant Design v5** frontend.

```
cytolab/
├── apps/
│   ├── api/        # NestJS modular monolith (Swagger at /api/v1/docs)
│   └── web/        # Next.js frontend (proxies /api/v1 to the API in dev)
├── packages/
│   └── shared/     # shared types/enums between api & web
├── docs/           # REBUILD_PLAN.md, requirements baseline
└── docker-compose.yml  # Postgres 16, Redis 7, MailHog
```

See **docs/REBUILD_PLAN.md** for architecture decisions, the 6-phase build plan, and local setup commands.

## Frontend dev rule: never `next build` while `next dev` is running

`next build` and `next dev` must not share a build directory. Running a
production build while the dev server is up overwrites the chunks the dev server
is serving, so the browser gets `_next/static/chunks/*` **404s**, the page never
hydrates, and it looks dead (e.g. clicking a button does nothing).

This repo guards against that, but follow the rule anyway:

- **Verify compilation without building** — use the typecheck script, which runs
  `tsc --noEmit` and never touches `.next`:
  ```bash
  cd apps/web && npm run typecheck
  ```
- **Build outputs are separated** — `apps/web/next.config.mjs` sets `distDir`
  from `NODE_ENV`: `next dev` → `.next`, `next build`/`next start` → `.next-prod`.
  So a production build cannot clobber the dev server's `.next`. (Both dirs are
  git-ignored.)
- **If the dev server ever 404s its chunks** (after an interrupted/concurrent
  build), recover with:
  ```bash
  cd apps/web && rm -rf .next && npm run dev
  ```
