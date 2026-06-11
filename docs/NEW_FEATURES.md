# Cytolab 2.0 — New Features Specification

Four features beyond legacy parity, in priority order. Multi-lab tenancy is foundational and is implemented in the schema from Phase 1; the rest layer on after their dependent parity phases.

## F1 — Multi-lab tenancy (foundational, Phase 1)

Every lab (tenant) operates in complete isolation: its own users, patients, clients, records, billing, and settings.

- New root entity: **Lab**. Every tenant-owned table carries `labId`; all queries are lab-scoped at the service layer (Prisma middleware/extension enforces it globally so a missed `where` can't leak data across labs).
- The legacy **Workspace** concept maps to sub-divisions *within* a lab; **Account** becomes billing identity per lab.
- JWT carries `labId`; staff users belong to exactly one lab. A future "lab group" super-admin view is possible but out of scope for v1.
- Lab-level settings: branding (logo/colors for reports and portal), report header/footer, currency, tax defaults.

## F2 — Client Space / Client Portal (after Phase 3)

A separate, login-protected area for referring doctors and partner labs (Clients) — distinct from the staff app. Legacy already has `user_enum = Client` and per-client record queries (`/specimens/client`, `/requisitions/client/{id}`), so the data paths exist; 2.0 gives them a real surface.

**v1 capabilities (as agreed):**
1. **Sample tracking** — list of the client's submitted records with live status timeline (Submitted → Processing → Completed → Approved), urgent flags, and date received/expected.
2. **Reports** — view and print/download authorized PDF reports only (authorization gate strictly enforced; unauthorized results are never visible).
3. **Change requests** — structured requests against a record: correction of patient demographics, add a test, cancel a request, general query. Each request has a status (Open → In Review → Actioned/Declined), a message thread with lab staff, and an audit trail.
4. Extensible foundation — module designed so new client-space features (statements/invoices, online requisition submission, result notifications) slot in without rework.

**Schema additions:** `PortalUser` (clientId-linked login, separate from staff `User`), `ChangeRequest`, `ChangeRequestMessage`, `RecordStatusEvent` (timeline), notification preferences per portal user.

**Security:** portal users authenticate on separate endpoints with their own JWT audience; they can only ever query `where client.id = portalUser.clientId AND labId = portalUser.labId`. Rate-limited, no staff endpoints reachable.

## F3 — Patient Portal (after F2)

Patients access their own results history. Reuses the portal infrastructure from F2 (separate identity, scoped queries, authorized-reports-only).

- Invite flow: lab staff or client sends a secure invite (email + DOB/registration-number verification) to bind a portal login to a Patient record.
- v1: view/download authorized reports, see visit history, update contact details (which raises a change request rather than writing directly — staff approve).
- Privacy note: result release to patients can be lab-configurable (immediate on authorization vs. N-day delay vs. client-mediated), since labs differ on policy.

## F4 — AI-assisted result reporting (after Phase 3)

Assist Authorizers (Pathologists/Cytologists) when composing result sheets. Strictly assistive — nothing AI-generated is ever released without human authorization.

**v1 capabilities:**
1. **Draft narrative generation** — given structured result entries, lab codes, code findings, and clinical context, generate a draft report narrative in the lab's house style for the Authorizer to edit.
2. **Code suggestion** — suggest likely code-sheet findings from the entered observations (accept/reject UI).
3. **Consistency checks** — flag contradictions between coded findings and narrative text before authorization.

**Implementation:** Anthropic API (Claude) server-side from the result-sheets module; prompts assembled from structured data, lab-configurable templates. Every AI draft is stored with provenance (`aiGenerated`, model, prompt version, editing diff) for auditability. PHI handling: requests sent with minimum necessary context; configurable redaction of patient identifiers (the model needs clinical data, not names).

**Schema additions:** `AiDraft` (resultSheetId, content, model, promptVersion, acceptedAt, editedDiff), lab-level AI settings (enabled, template, redaction policy).

## Revised phase plan

1. Foundation & Identity **+ tenancy (F1)**
2. Lab intake (patients, clients, requisitions, specimens, status timeline events)
3. Results & coding (+ report PDFs)
4. Revenue
5. **Client Space (F2)** — moved ahead of people-ops; it's the highest-value differentiator
6. **AI-assisted reporting (F4)**
7. People ops (employees, departments, payroll)
8. Platform (messaging, notifications, appointments, search, settings)
9. **Patient Portal (F3)**
