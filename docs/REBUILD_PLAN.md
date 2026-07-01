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
4. **Revenue** — billing + bill lines, payments + payment lines, services catalog & pricing, taxes. *Done.*
5. **Client Space / Client Portal (F2)** *(done)* — external `PortalUser` identity (lab- AND client-scoped), fully separate from staff `User`: separate login under `/portal/*`, separate JWT family (own `JWT_PORTAL_SECRET` + `aud`/`scope: 'portal'`) so a portal token can never authenticate a staff endpoint or vice versa. Client-scoping is enforced **structurally** in the Prisma tenancy guard: portal requests are auto-filtered by `clientId` (Rule A, crafted ids overridden) and **fail closed** on any tenant table that can't be client-scoped (Rule B); reports are the one narrow, ownership-gated escalation to lab-only scope. v1 capabilities: sample tracking (records + `RecordStatusEvent` timeline), authorized-only report PDFs (reuses the Phase 3.5 endpoint, gate strictly enforced), and change requests (`ChangeRequest` + `ChangeRequestMessage` thread + `ChangeRequestEvent` audit, lifecycle Open→InReview→Actioned|Declined). Provisioning is **staff-invite only** (no public self-signup) with single-use, time-limited email tokens (SHA-256-hashed; MailHog in dev); login is anti-enumeration (identical response + timing for wrong-password vs no-such-email). Rate-limited (`ThrottlerGuard` global; login/reset 5/min). Three proof tests assert token cross-rejection, cross-client read isolation, and unauthorized/foreign report refusal.
6. **Platform** — messaging threads, notifications, appointments/scheduler, settings/preferences, file storage, global search, dashboard analytics (replacing the separate analytics-service with a reporting module).

### Tracked debts

- **Phase 3.5 — Report rendering**: *resolved* — PDF rendering of authorized reports shipped (see phase list above). Residual: configurable `FormPrintGroup` multi-layout templating remains deferred.
- **Report/portal image embedding is data-URI-only** *(deferred from Phase 3.5; reaffirmed by F2)* — rendered reports embed logo/signature images only from `data:` URIs; remote URLs are not fetched (avoids SSRF/network failure in the render path). Folded into the **file-storage** work (Phase 6): wire safe image fetching once file storage lands, for both the staff and portal report endpoints.
- **LabCode ↔ Record / Client associations** *(deferred from Phase 3)* — `LabCode` shipped as a standalone CRUD table. The legacy `Client.labCode` (a client's assigned code/region) and `Record.labCodes` (codes applied to a record) associations were not wired, to avoid re-modelling Phase 2 tables mid-phase. These need wiring before results are considered complete; revisit during/after Phase 4.
- **Seed `changerequest:*` and `portaluser:*` permissions into default roles** *(deferred from F2 — small NEAR-TERM fix)* — these permission codes gate the staff-facing portal admin features (portal-user invite/manage, change-request triage) but are not yet attached to any default role, so only Superuser (which bypasses permission checks) can use them. **Grant them to the appropriate default staff roles before any non-super staff need the portal admin features.**
- **Portal login email disambiguation** *(deferred from F2 — until multi-lab-live)* — portal login resolves the account by email across labs (`findFirst` by email, matching staff parity). If the same portal email could exist in two labs, login could resolve the wrong account. Add lab disambiguation (slug/subdomain or explicit lab selection) before running multiple live labs that might share portal emails.
- **Roles are global, not lab-scoped** *(from the roles-admin work — BLOCKER before a 2nd lab / data migration)* — the `Role` model has a globally-unique `name` (`@unique`) and no `labId`, so all labs share one role table. This is inconsistent with the multi-tenant model: Lab A and Lab B must each define their own roles without name collisions or cross-contamination (a role edited by one lab affects the other; a lab can see/pick another lab's roles). **Not urgent with a single lab, but MUST be resolved before onboarding a second lab or running the data migration** — roles are referenced by `UserRole` and `RolePermission`, so the fix touches existing assignments. **Fix:** lab-scope `Role` (`labId` + `@@unique([labId, name])`, add it to the tenancy `CLIENT_SCOPED`/tenant-model set so queries auto-scope like every other tenant model), and **decide the lab-owned vs system-provided split** — e.g. seed the default roles (`Superuser`, `Authorizers`, `Pathologist`, `Lab Technician`, `Receptionist`) per-lab at `registerLab` time (lab-owned, editable) vs keeping a set of immutable system defaults. Note the guard's `isSuperRole` bypass is unaffected (flag on the row), and the roles-admin UI already works per-role — it just needs the scoped queries underneath.
- **Completed Requisition Report** *(deferred from the requisition rebuild → reporting phase)* — the legacy "Completed Requisition Report" screen (date-range + client filter, run report, notes/footer, and email / print / export) was not built; the requisition rebuild delivered the batch-intake model, create form, and list only. This is a **reporting feature**, tracked alongside the other deferred reporting/templating work (report `FormPrintGroup` multi-layout templating above); build it in the reporting phase, reusing the server-side PDF renderer (Phase 3.5) for print/export.
- **Requisition-grouped Overview tab** *(deferred from the results-entry rebuild — UI refinement, no correctness stakes)* — the Specimen Overview page's "Requisition" tab currently reuses the flat overview record list rather than a dedicated requisition-batch-grouped view (records nested under their originating requisition batch, with per-batch headers/counts/progress). The data is already available (records carry `requisitionLineId` → requisition), so this is purely a presentation refinement. Build a grouped/collapsible batch view when the Overview UI gets its next polish pass; no backend change required.
- **`Record.cabinetId` is dead weight** *(deferred from the Cabinet filing module — non-urgent cleanup)* — the Cabinet module moved to automatic-by-client contents (a cabinet lists records where `record.clientId == cabinet.clientId`), so the legacy per-record `Record.cabinetId` (+ its FK and index) is no longer read or written anywhere. It's harmless to leave, but it's a vestigial second filing mechanism. **Remove `Record.cabinetId`, its `Cabinet` relation, and the index in a future migration** — non-destructive to defer (nothing depends on it); fold it into the next Record-touching schema change rather than a standalone migration.
- **`Cabinet.identifier` is not DB-unique** *(deferred from the Cabinet filing module — optional hardening)* — the cabinet reference code `CB{accountNo}-{RAND4}` is generated at client-link time and stored in `Cabinet.identifier`, but there is no unique constraint on it. The 4-char random suffix makes practical collisions negligible (and one-cabinet-per-client already bounds how many exist), so this is not a correctness issue. **If we want the code guaranteed-unique, add `@@unique([labId, identifier])`** (NULLs are distinct in Postgres, so unlinked cabinets are unaffected) and a small regenerate-on-conflict retry in `create`/`update`.

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
