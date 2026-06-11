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
