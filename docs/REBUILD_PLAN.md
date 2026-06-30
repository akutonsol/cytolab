# Cytolab 2.0 — Rebuild Plan

## Why a rebuild

The legacy system (Java 11 / Spring Boot 2.7 microservices + CRA/MUI v4/antd v4 frontend) is functionally rich but built on end-of-life tooling and a heavy operational footprint (API gateway, Consul, Config Server, Elasticsearch, RabbitMQ, Redis). Cytolab 2.0 keeps the same domain requirements with a dramatically simpler architecture.

## Architecture decisions

| Concern | Legacy | Cytolab 2.0 | Rationale |
|---|---|---|---|
| Backend | Spring Boot microservices x4 | NestJS modular monolith | One deployable, same module boundaries, can extract services later if needed |
| ORM / migrations | Hibernate + Flyway | Prisma | Typed client, migrations built in |
| Database | PostgreSQL | PostgreSQL 16 | Keep |
| Search | Elasticsearch | Postgres full-text search (tsvector/GIN) | One less system; revisit only if search volume demands it |
| Messaging/queues | RabbitMQ | BullMQ on Redis (only when a real async job appears) | Most legacy AMQP usage was internal eventing a monolith doesn't need |
| Realtime | STOMP over WebSocket | Nest WebSocket gateway (socket.io) | For notifications/messaging modules |
| Auth | JWT + roles/permissions | JWT (access+refresh) + same role/permission codes | Preserve the permission matrix from legacy |
| Frontend | CRA, MUI v4 + antd v4 + jQuery | Next.js 14, Ant Design v5, React Query, Zustand | Single UI library, TypeScript throughout |
| Service discovery / config | Consul + Config Server | `.env` + ConfigModule | Monolith doesn't need them |

## Build phases (revised — see docs/NEW_FEATURES.md for feature specs)

> Multi-lab tenancy (F1) is implemented from Phase 1: every tenant-owned table carries `labId`, enforced globally.

Each phase reaches feature parity with the corresponding legacy modules before moving on.

1. **Foundation & Identity + Tenancy (F1)** — auth (login, refresh, lockout/AuthAttempt), users, roles & permissions, accounts, workspaces. *Scaffolded — Prisma schema for this phase is in place.*
2. **Lab intake** — patients, clients (referring physicians/clinics) & client types, requisitions + requisition lines, specimens/samples, record status workflow (DRAFT → RECEIVED → IN_PROGRESS → PARTIAL → COMPLETED → BILLED → PAID).
3. **Results & coding** — result sheets (entries/lines) with authorization gate + append-only audit (ResultSheetEvent), code sheets, code findings, lab codes, cabinets (storage), report release. *Done.*
3.5. **Report templating / rendering** *(done — was tracked debt from Phase 3)* — server-side PDF rendering of authorized result sheets (pdfmake, standard fonts, no headless browser). Lab branding (name/address/phone/email/logo) + patient demographics + referring client + specimens + result entries/lines/findings + diagnosis narrative + authorizer name/sign-off timestamp/signature (image-or-typed-name). Generation is **on-demand/stateless**, re-checking the Phase 3 authorization gate at render time so a de-authorized sheet immediately stops producing a report (no stale PDF). Endpoint `GET report/pdf/:recordId` (`report:view`, lab-scoped) — the same read-only endpoint the F2 client portal will call. *Remaining debt:* `FormPrintGroup` / per-form print-group templating (multiple report layouts) is **not** built — current rendering is a single canonical layout; revisit if F2 needs configurable form templates. Remote logo/signature URLs are not fetched (data-URI only) — wire safe image fetching when file storage lands.
4. **Revenue** — billing + bill lines, payments + payment lines, services catalog & pricing, taxes.
6. **Platform** — messaging threads, notifications, appointments/scheduler, settings/preferences, file storage, global search, dashboard analytics (replacing the separate analytics-service with a reporting module).

### Tracked debts

- **Phase 3.5 — Report rendering**: *resolved* — PDF rendering of authorized reports shipped (see phase list above). Residual: configurable `FormPrintGroup` multi-layout templating and remote (non-data-URI) image embedding remain deferred.
- **LabCode ↔ Record / Client associations** *(deferred from Phase 3)* — `LabCode` shipped as a standalone CRUD table. The legacy `Client.labCode` (a client's assigned code/region) and `Record.labCodes` (codes applied to a record) associations were not wired, to avoid re-modelling Phase 2 tables mid-phase. These need wiring before results are considered complete; revisit during/after Phase 4.

## Requirements baseline

Before Phase 2 begins, a full requirements document is extracted from the legacy codebase (entity-by-entity data model, endpoint inventory from all 31 controllers, business rules from the service layer, role/permission matrix) into `/docs/REQUIREMENTS_BASELINE.md`. New features are layered on after parity.

## Local development

```bash
# 1. infra
docker compose up -d

# 2. api
cd apps/api
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run start:dev          # http://localhost:4000/api/v1  (Swagger at /api/v1/docs)

# 3. web
cd ../web
npm install
npm run dev                # http://localhost:3000
```
