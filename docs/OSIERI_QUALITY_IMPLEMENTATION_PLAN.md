# Osieri — Quality & Governance Workspace (Phase 2C) implementation plan

| Field | Value |
|---|---|
| Status | Binding implementation contract — architecture only; no code until checkpoints are approved |
| Current Phase | Osieri Phase 2C (Quality & Governance Workspace) |
| Owner | Founder |
| Dependencies | [OSIERI_QUALITY_WORKSPACE.md](OSIERI_QUALITY_WORKSPACE.md) (architecture), [OSIERI_QUALITY_FEASIBILITY_AUDIT.md](OSIERI_QUALITY_FEASIBILITY_AUDIT.md) (feasibility), [OSIERI_SIGNOUT_IMPLEMENTATION_PLAN.md](OSIERI_SIGNOUT_IMPLEMENTATION_PLAN.md) (proven pattern), Helix v1.0 (frozen) |
| Last Updated | 2026-07-11 |
| Priority | P1 |
| Expected Next Milestone | Approval of this contract → checkpoint C1 (shell) only; each checkpoint reviewed before the next |

This is the **binding implementation contract** for the Quality & Governance Workspace (Workspace 3 of
[OSIERI_v2.md](OSIERI_v2.md)). It is architecture only: **no code, no schema, no Helix change, no
permission change, no wireframes, no commit.** It inherits the composition contract proven end-to-end
by the Sign-Out Workspace ([OSIERI_SIGNOUT_IMPLEMENTATION_PLAN.md](OSIERI_SIGNOUT_IMPLEMENTATION_PLAN.md),
B1–B13) and every classification in the approved feasibility audit
([OSIERI_QUALITY_FEASIBILITY_AUDIT.md](OSIERI_QUALITY_FEASIBILITY_AUDIT.md)).

Governing principle (binding, from the feasibility audit):

> **Quality surfaces recorded evidence. It never computes, infers, ranks, or invents quality conclusions that are not explicitly recorded.**

The Quality Workspace is an **orchestration surface**. It composes existing owner systems. It owns
**no** quality-domain logic.

---

## 1. Orchestration rule (binding)

The workspace is thin composition. Exactly as Sign-Out:

- **Compose, never own.** The workspace assembles evidence; owners keep their logic.
- **One aggregate endpoint.** A single read-only aggregate hydrates the workspace (§3).
- **All reads through owner services.** No direct Prisma in the workspace service; every read calls an
  existing owner service method (correlation, qc, proficiency, escalation, recall, report-center,
  result-sheets, records, security/system, change-requests, notifications).
- **All writes only by invoking owner workflows.** The workspace mutates nothing; review/grade/resolve
  happen by opening the owner's existing endpoint/surface.
- **No duplicated business logic** — no discordance derivation, no QC rules, no proficiency grading,
  no authorization, no benchmark calculation, no alert ranking, no CAP calculation.
- **No persistence.** The workspace stores nothing; it holds no domain rows.
- **No schema changes.** Anything requiring a new model is deferred (§8, §12).
- **Owner endpoints remain the enforcement authority.** The aggregate endpoint gates entry; each
  section mirrors its owner permission descriptively; the owner endpoint re-enforces on every action.
- **The workspace permission map is descriptive only** — it never grants, never aliases (§9).

**Success criterion for every checkpoint (§13):** *"Does this expose more recorded quality evidence
from one workspace without inventing quality conclusions or replacing an owner system?"* If no, it
does not ship.

---

## 2. Workspace lifecycle

The workspace holds **no persistent domain state**. Its lifecycle is:

1. **enter** — a permitted user opens the workspace (gated by the aggregate endpoint's base
   permission); an optional validated internal `returnTo` is honoured (Sign-Out §9 pattern).
2. **hydrate** — one call to the aggregate endpoint (§3); every section resolves independently to a
   truthful state.
3. **review** — the user reads recorded evidence across sections; nothing is computed client-side
   beyond formatting.
4. **invoke owner** — for any action (review a discordance, grade a proficiency case, resolve a QC
   alert, open a change request), the workspace opens the **existing owner surface/endpoint**
   unchanged.
5. **return** — the owner surface closes / navigates back; `returnTo` and browser history restore the
   workspace position.
6. **refresh** — after a successful owner action, the workspace invalidates and re-hydrates the
   aggregate (React Query invalidation), so owner state changes surface truthfully.
7. **exit** — the user leaves; no workspace state persists anywhere.

No step writes domain data; the only client state is ephemeral UI (open panel, query cache).

---

## 3. Aggregate endpoint

**Proposed:** `GET /quality-governance/overview` — a single read-only aggregate, thin orchestration
module (`quality-governance` NestJS module) composing owner services, mirroring the `signout` module.

**Sections** (each carries its own status; the contract is stable from C2 and never re-shaped):

| Section | Composes (owner service) | Evidence |
|---|---|---|
| `overview` | counts assembled from the sections below | section counts only, no computed score |
| `correlation` | `CorrelationService` | correlation cases, review-required |
| `discordance` | `CorrelationService` | stored `correlationResult`/`discordanceReason` (never inferred) |
| `qc` | `QcService` | `QCCheck` + `QCFailureAlert` (incl. recorded corrective/failure text) |
| `proficiency` | `ProficiencyService` | tests, status, grading state |
| `escalations` | `EscalationService` | open / awaiting-review escalations |
| `recall` | `RecallService` | recall status / follow-up compliance |
| `benchmarks` | `ReportCenterService` (+ `BethesdaAnalyticsService`) | owner-computed CAP/Bethesda/TAT/abnormal status |
| `medicalDirector` | assembled review-required across correlation/proficiency/escalation | attention items linking to owners |
| `governance` | `ResultSheetsService`, `RecordsService`, `SecurityService`/`SystemLogService`, `ChangeRequestsService`, `NotificationsService` | assembled, source-labeled trail (non-canonical) |
| `permissions` | `EffectiveQualityPermissions` (descriptive) | per-capability booleans mirroring owner perms |

**Section-status contract** (identical to Sign-Out): every section is one of

- `ready` — evidence present,
- `empty` — owner returned nothing (truthful, not a stub),
- `forbidden` — user lacks the owner permission,
- `error` — the owner read failed,
- `deferred` — intentionally not built yet at this checkpoint (removed as each section lands).

**Partial-failure isolation:** each section resolves independently (`Promise.all` of guarded loaders);
one owner failing marks only its section `error` and never collapses the workspace or the case
identity/overview. Sources that assemble from several owners (governance, medicalDirector) carry a
per-source `unavailable[]` list, exactly as the Sign-Out timeline does.

**Scope guard (payload):** the overview aggregate returns **summaries and bounded lists only** (counts,
recent/attention items with a cap + truncation note), never full historical dumps — mitigating large
payloads (§12). Drill-down uses the owner surfaces.

---

## 4. Composition strategy

For every capability, exactly one strategy (verified owner in
[OSIERI_QUALITY_FEASIBILITY_AUDIT.md](OSIERI_QUALITY_FEASIBILITY_AUDIT.md) §2):

| Capability | Strategy | Owner |
|---|---|---|
| Correlation / discordance | aggregate read-only + **link to owner** (`/correlation/:id`) | `CorrelationService` |
| Discordance review | **invoke unchanged** (`POST /correlation/:id/review`) | `correlation` |
| QC checks / failures | aggregate read-only + **link to owner** (`/qc`) | `QcService` |
| QC alert resolve | **invoke unchanged** (`PATCH /qc/alerts/:id/resolve`) | `qc` |
| Proficiency | aggregate read-only + **link to owner** | `ProficiencyService` |
| Proficiency grade | **invoke unchanged** (`POST /proficiency/:id/grade`) | `proficiency` |
| Escalations | aggregate read-only + **invoke** (`PATCH /escalations/:id/review`) | `EscalationService` |
| Recall | aggregate read-only + **link to owner** (`/recalls`) | `RecallService` |
| Benchmarks (CAP/Bethesda/TAT/abnormal) | **display recorded fields only** (owner-computed status) | `ReportCenterService` |
| Operational quality alerts | **display recorded fields only** (owner-ranked) | `OperationsService` |
| Governance events | aggregate read-only (assembled, source-labeled) | `ResultSheetsService`, `RecordsService`, `SecurityService`, `ChangeRequestsService`, `NotificationsService` |
| Corrective-action notes | **display recorded fields only** (free text) | `qc`, `escalation` |
| CAPA / Concordance / doc control / complaints / accreditation | **defer** (schema) | — |

**Never duplicated:** correlation logic · QC logic · proficiency grading · authorization · benchmark
calculation · alert ranking · CAP calculations. Where an owner has already computed a value, the
workspace **displays** it and must not re-derive or re-rank (governing rule + §6).

---

## 5. Governance trail

The `governance` section **assembles** recorded events from multiple owners into one chronological,
read-only view — the Sign-Out timeline pattern, reused:

| Source | Owner service | Event evidence |
|---|---|---|
| `ResultSheetEvent` | `ResultSheetsService.eventsByRecord` | Authorized / Deauthorized / Reauthorized / AiDrafted / AiAccepted |
| `RecordStatusEvent` | `RecordsService` (`statusHistory`) | status transitions |
| `LoginAttempt` | `SecurityService` | access attempts (gated `system:security`) |
| `MaintenanceLog` | `SystemLogService` | **system/job** maintenance (`ranAt`/`ranBy`/`results`) — labeled *system maintenance*, never equipment QC |
| Notification history | `NotificationsService` | recorded notifications (scoped to actor) |
| Change requests | `ChangeRequestsService` | requests + events (**only when permitted** — §9) |

Every assembled event **retains:** `source` (owner label), `actor` (or "Actor not recorded"),
`timestamp`, `ownerPath` (link), `description` (factual). Deterministic ordering (timestamp asc →
source priority for exact ties → stable id), never reordered for narrative.

> **This is NOT a canonical audit ledger.** It is a source-labeled assembly of independent owner
> events. Each source is named; any source that fails or is not permitted is shown as unavailable
> (never a false-complete trail). No event is invented; no `updatedAt` is treated as an event.

---

## 6. Quality evidence rules (presentation)

Binding presentation rules enforcing the governing principle. The workspace **never:**

- computes quality scores,
- computes risk,
- computes rankings,
- infers performance,
- infers competency,
- infers corrective-action success.

It **displays only recorded evidence.** Where an owner already recorded/computed a value (benchmark
status, discordance result, alert rank, abnormal rate), the workspace shows it verbatim and attributes
it to the owner. Any count in `overview` is a plain count of recorded rows, not a derived metric.
Status is carried by text (not colour alone); zero-orange holds.

---

## 7. Medical Director workspace

Three read-only queues, assembled from **recorded owner states only** — no prioritization algorithm,
no scoring, no ranking:

- **attention queue** — items an owner has already flagged as needing attention: `EscalationRecord`
  awaiting review, `QCFailureAlert` open, review-required `CorrelationCase`. Each item shows its
  recorded state and links to its owner.
- **review queue** — items whose owner state is "awaiting review/grade": correlation review-required,
  proficiency awaiting grade, escalation awaiting review. Ordered only by recorded date (no computed
  priority).
- **oversight queue** — recorded authorization/amendment activity from `ResultSheetEvent`
  (Authorized/Reauthorized/Deauthorized) for MD situational awareness — read-only, source-labeled.

Every item is a recorded owner state; the MD acts by invoking the owner. The queues **do not** compute
"most urgent" — they list recorded states and let the MD decide (governing principle).

---

## 8. Corrective action

**Display, verbatim, only these recorded fields** (verified: the only corrective-adjacent evidence in
the schema):

- `QCCheck.correctiveAction` (free text — "what was done to fix it"),
- `QCCheck.failureReason` (free text — required when `result = Fail`),
- `EscalationRecord.resolvedReason` (free text on escalation closure),
- `QCFailureAlert` status (`status`, `assignedTo`, `resolvedBy/At`).

**Never label these as** CAPA · Root Cause · Preventive Action · Effectiveness Review. The UI must
present them as *recorded corrective notes / resolution state*, nothing more.

**Future schema (documented separately, NOT in scope):** a first-class CAPA lifecycle
(`CorrectiveAction`: source ref, rootCause, action, owner, dueDate, effectivenessCheck, status) would
require an approved schema decision. This plan does **not** design or build it; it is named so the
display-only reality is not mistaken for a workflow. See
[OSIERI_QUALITY_WORKSPACE.md](OSIERI_QUALITY_WORKSPACE.md) §6.

---

## 9. Permissions

Descriptive map only; every value mirrors a real owner permission; owner endpoints enforce. **Never
alias** one permission to another to widen access.

| Section | Mirrored owner permission |
|---|---|
| Enter / overview | `record:view` (aggregate base gate) |
| correlation / discordance | `record:view` |
| qc | `record:view` (view) / `record:change` (resolve) |
| proficiency | `record:view` (view) / `resultsheet:authorize` (grade) |
| escalations | `record:view` (view) / `record:change` (review) |
| recall | `record:view` |
| benchmarks | `report:view` |
| governance — result-sheet/record events | `resultsheet:view` / `record:view` |
| governance — security/login | `system:security` |
| governance — notifications | `notification:view` |
| governance — change requests | `changerequest:view` / `changerequest:change` |
| medicalDirector actions | per owner (`record:change`, `resultsheet:authorize`) |

**Documented gap (do not "fix" by aliasing):** `changerequest:view` and `changerequest:change` are
**declared on the owner controller but not seeded** — absent from the live permission catalog and held
by no role — so change-requests are **currently available only to superusers**. The workspace mirrors
the real permission and shows the change-request governance source as `forbidden` for non-superusers.
Seeding `changerequest:*` is a **separate, out-of-scope platform decision**; this plan changes no
permission ([OSIERI_QUALITY_FEASIBILITY_AUDIT.md](OSIERI_QUALITY_FEASIBILITY_AUDIT.md) §3).

---

## 10. Implementation checkpoints

Each checkpoint is an isolated, reviewed commit (Sign-Out discipline). Format:
**scope · files · owner services · permissions · verification · stop condition · rollback · commit
boundary.**

**C1 — Quality Workspace shell.**
Scope: route `app/(app)/quality-governance/page.tsx`; header, section scaffolding, all sections
`deferred`; validated `returnTo` + keyboard/focus reuse from Sign-Out.
Files: web page + a `types.ts` mirror. Owner services: none. Permissions: `record:view` (page gate).
Verification: web tsc + build; a11y (one h1); zero-orange. Stop: shell renders with deferred sections.
Rollback: delete the route + types. Commit: 1 web page + types.

**C2 — Aggregate endpoint.**
Scope: `quality-governance` NestJS module + `GET /quality-governance/overview` returning the §3
sections, all `deferred` except `permissions`; section-status contract + partial-failure harness.
Files: `signout`-style module/controller/service (API); web `types.ts`. Owner services: none yet
(scaffold). Permissions: `record:view` (endpoint gate) + descriptive `permissions` section.
Verification: API tsc + `nest build`; endpoint returns stable contract; tenancy (lab-scoped).
Stop: endpoint live, contract frozen. Rollback: remove module + app-module registration.
Commit: API module + web types.

**C3 — Overview.**
Scope: `overview` section = plain counts assembled from the (still-deferred) sections' owner reads as
they land; initially counts that exist (correlation/qc/escalation/recall summaries).
Files: service loader + web panel. Owner services: `CorrelationService`, `QcService`,
`EscalationService`, `RecallService` (summary reads). Permissions: `record:view`.
Verification: counts trace to owner summaries; no computed score. Stop: overview shows real counts.
Rollback: revert overview loader to deferred. Commit: API + web.

**C4 — Correlation / Discordance.**
Scope: `correlation` + `discordance` sections (review-required, stored results); link to
`/correlation/:id`; invoke review unchanged.
Files: loaders + web panels. Owner services: `CorrelationService` (`byPatient`/`list`/analytics).
Permissions: `record:view` / `record:change`. Verification: discordance shown only from stored result
(never inferred); owner opens; refresh on return. Stop: discordance queue truthful + owner reachable.
Rollback: sections → deferred. Commit: API + web.

**C5 — QC.**
Scope: `qc` section = checks + open `QCFailureAlert` + recorded corrective/failure **text** (display
only); invoke `/qc/alerts/:id/resolve`.
Files: loader + web panel. Owner services: `QcService`. Permissions: `record:view` / `record:change`.
Verification: corrective notes shown verbatim, never labeled CAPA; resolve invokes owner + refresh.
Stop: QC evidence + resolve reachable. Rollback: section → deferred. Commit: API + web.

**C6 — Proficiency.**
Scope: `proficiency` section = tests + status + grading state; invoke owner grade/administer.
Files: loader + web panel. Owner services: `ProficiencyService` (analytics/list). Permissions:
`record:view` (view) / `resultsheet:authorize` (grade). Verification: grading gate mirrors owner; no
competency inference. Stop: proficiency overview + owner reachable. Rollback: deferred. Commit: API + web.

**C7 — Escalation / Recall.**
Scope: `escalations` (open/awaiting-review, invoke review) + `recall` (status/compliance, link).
Files: loaders + panels. Owner services: `EscalationService`, `RecallService`. Permissions:
`record:view` / `record:change`. Verification: states truthful; review invokes owner + refresh.
Stop: both sections truthful. Rollback: deferred. Commit: API + web.

**C8 — Benchmarks.**
Scope: `benchmarks` section = owner-computed CAP/Bethesda/TAT/abnormal/recall-compliance **status
displayed verbatim** (no recomputation).
Files: loader + panel. Owner services: `ReportCenterService`, `BethesdaAnalyticsService`. Permissions:
`report:view`. Verification: values equal owner outputs; no computed metric added. Stop: benchmarks
displayed read-only. Rollback: deferred. Commit: API + web.

**C9 — Medical Director.**
Scope: `medicalDirector` section = attention/review/oversight queues from recorded owner states only;
no prioritization. Files: loader (assembles §7) + panel. Owner services: correlation/proficiency/
escalation/result-sheets reads. Permissions: `record:view` (+ per-action owner perms). Verification:
queues list recorded states only; ordering by recorded date; no computed priority. Stop: queues
truthful. Rollback: deferred. Commit: API + web.

**C10 — Governance Trail.**
Scope: `governance` section = assembled source-labeled events (§5); per-source unavailability;
non-canonical banner. Files: loader (reuses `ResultSheetsService.eventsByRecord` etc.) + panel.
Owner services: result-sheets, records, security/system, change-requests, notifications. Permissions: each
source mirrors its owner (incl. `system:security`, `changerequest:view` gap). Verification: each event
has source/actor/timestamp/link; partial-source isolation; MaintenanceLog labeled system-maintenance;
change-requests `forbidden` for non-superusers. Stop: trail truthful + source-labeled. Rollback:
deferred. Commit: API + web.

**C11 — Owner invocation.**
Scope: wire every action to the **existing** owner surface/modal/route unchanged; refresh-on-return.
Files: web wiring only. Owner services: none new. Permissions: mirror owners. Verification: each action
opens the real owner; recordId/context preserved; aggregate refreshes after success; no second editor.
Stop: all actions invoke owners. Rollback: remove action wiring. Commit: web.

**C12 — Workflow continuity.**
Scope: validated `returnTo`, deterministic return, focus-once, guarded keyboard shortcuts (Sign-Out
B12 pattern), one additive entry point (e.g. Operations/Quality Alerts → workspace) with validated
`returnTo`. Files: web page + one additive entry link. Owner services: none. Permissions: n/a.
Verification: returnTo validation (internal only), fallback, shortcut suppression in inputs/modals, no
mutating shortcut. Stop: continuity verified. Rollback: revert page + entry link. Commit: web (entry
point separate if it touches another screen).

**C13 — Verification / closeout.**
Scope: full contract (§11), fix only verified defects, closeout doc update. Files: docs (+ any defect
fix). Owner services: n/a. Permissions: full matrix verification. Verification: §11 in full. Stop: all
gates pass. Rollback: n/a (verification). Commit: implementation defects (if any) + documentation
closeout, separated.

---

## 11. Verification contract (per checkpoint, in full at C13)

- **API typecheck** clean · **Web typecheck** clean · **production builds** (API `nest build` + web
  `next build`) clean.
- **Responsive** verification at 390 / 768 / 1024 / 1440 / 1920 (horizontal overflow 0).
- **Accessibility** — one `h1`, ordered headings, labeled controls, visible focus, status-by-text
  (not colour alone), no keyboard trap.
- **Zero-orange** — 0 px across states and breakpoints.
- **Permission verification** — each section's forbidden/ready matches the real owner grant matrix
  (Superuser / Pathologist / Authorizers / Lab Technician / Receptionist).
- **Tenancy verification** — all reads lab-scoped via the injected Prisma client (a cross-lab id
  resolves to nothing).
- **Partial-failure verification** — erroring any owner isolates to its section; overview + other
  sections survive; no false empty state.
- **Truthful states** — ready/empty/forbidden/error/deferred all demonstrable.
- **Owner invocation** — every action opens the existing owner surface unchanged and refreshes on
  return.
- **No schema · no Helix · no duplicated logic** — architectural audit (no direct Prisma in the
  workspace service; all reads via owner services).

---

## 12. Risk register

- **Fragmented governance.** Assembling five event sources can imply a completeness the data lacks.
  Mitigate: name every source; per-source unavailability; explicit non-canonical banner (§5).
- **CAPA pressure.** The most visible gap invites faking a workflow. Mitigate: display-only recorded
  fields; never label CAPA; future schema documented separately (§8).
- **Permission fragmentation.** Seven permission families across owners. Mitigate: descriptive mirror;
  enforce at owner; alias none (§9).
- **Large aggregate payloads.** Quality data is broad. Mitigate: summaries + bounded/capped lists in
  the aggregate; drill-down on owner surfaces; truncation notes (§3 scope guard).
- **Change-request permissions.** `changerequest:*` unseeded → superuser-only. Mitigate: mirror the
  real permission; show `forbidden`; do not alias; flag seeding as a separate platform decision (§9).
- **Owner-computed metrics.** Re-deriving benchmarks/rankings would break the governing rule. Mitigate:
  display owner outputs verbatim; no recomputation (§6).
- **Historical event labeling.** Mislabeling an event's meaning. Mitigate: factual descriptions only;
  actor absence shown honestly; no inferred meaning.
- **Maintenance-log misuse.** `MaintenanceLog` is system/job maintenance, not equipment QC. Mitigate:
  label it "system maintenance"; never present as instrument QC (§5).
- **Medical Director persona vs seeded roles.** No seeded "Medical Director" role exists; the persona
  maps to Superuser / Pathologist / Authorizers (who hold the oversight permissions). Mitigate:
  document the mapping; gate by real permissions, not a persona name; create no throwaway role.

---

## 13. Success criterion

Every checkpoint must answer **yes** to:

> *"Does this expose more recorded quality evidence from one workspace without inventing quality
> conclusions or replacing an owner system?"*

If a checkpoint computes a score, infers a verdict, re-ranks an owner output, duplicates owner logic,
persists domain state, or requires schema — it does not ship under this contract.

---

## 14. Phase 2C completion record (C13 closeout)

Phase 2C is **complete**. Every checkpoint C1–C13 shipped or was verified under this contract; the
release gate (C13) passed all gates with **no implementation defects requiring correction**.

### 14a. Checkpoint → commit trace (isolated commits, Sign-Out discipline)

| Checkpoint | Delivered | Commit |
|---|---|---|
| Architecture | Workspace architecture doc | `6cd3cd1` |
| C1 | Workspace shell (route + types, all sections deferred) | `9df7db8` |
| C2 | Aggregate contract (`GET /quality-governance/overview`, frozen section-status) | `fc18104` |
| C3 | Overview (four owner-derived source summaries) | `baccead` |
| C4 | Correlation + Discordance | `585d911` |
| C5 + C6 | Quality Control + Proficiency (shipped in one commit) | `dc60b51` |
| C7 | Escalation + Recall | `fe8c338` |
| C8 | Benchmarks & compliance analytics | `d6edead` |
| C9 | Medical Director oversight | `5389ae1` |
| C10 | Source-labeled governance trail | `6c34ffe` |
| **C11** | **Owner invocation — verification-only, NO code commit** | *(none — audit)* |
| C12 | Workflow continuity (entry point + returnTo + shortcuts) | `19a1a83` |
| C13 | Final verification + this closeout | *(docs commit)* |

C11 was a pure audit: every actionable item already invoked only an owner surface with zero mutation,
so no code changed and **no empty commit was created**. It is recorded here as completed.

### 14b. Final production entry point

One additive nav item under **Lab** — `{ label: 'Quality & Governance', path: '/quality-governance',
permission: 'record:view', icon: ClipboardCheck }` (`apps/web/src/lib/nav.ts`). The nav renderer
(`nav-pills.tsx`) appends a validated, internal-only `returnTo` = the current route on click; the
workspace's `safeReturnTo` re-validates and falls back to `/records`. No existing nav item was
replaced.

### 14c. Final supported capabilities (compose-only; all read-only navigation to owners)

- **Overview** — four owner-recorded open summaries (correlation, QC, escalations, recall). No score/verdict.
- **Correlation / Discordance** — recorded `CorrelationCase` counts + only stored `MinorDiscordant`/`MajorDiscordant`. → `/correlation/:id`.
- **Quality Control** — owner totals + recorded Pass/Fail/Marginal + open alerts; failure/corrective text shown as recorded notes (never CAPA). → `/qc`.
- **Proficiency** — owner totals/statuses; grading in-progress from recorded state only. → `/proficiency/:id`.
- **Escalations** — recorded lifecycle + severity; recorded resolution note. → `/escalations`.
- **Recall** — recorded Overdue/Due/Pending/Completed. → `/recalls`.
- **Benchmarks** — owner metrics verbatim (CAP, recall compliance, abnormal rate); no recomputation, no global verdict. → `/report-center`.
- **Medical Director** — gate `resultsheet:authorize`; owner-recorded open/review-required items from correlation/escalation/QC/proficiency. → owner routes.
- **Governance trail** — `nonCanonical: true`, source-labeled, historical-only, from result-sheet authorizations / security access / change-request creation. → `/records/:id`, `/security`, `/change-requests`.
- **Permissions** — descriptive map only; owner endpoints remain enforcement authority.

### 14d. Final permission matrix (from real seeded grants + deterministic `has()` resolution)

`has(code) = isSuperRole || permissions.includes(code)`. Derived from `apps/api/prisma/seed.ts`; no
throwaway roles were created (the seeded grants + traced section gates prove access deterministically).

| Capability (gate) | Superuser | Pathologist | Authorizers | Lab Technician | Receptionist |
|---|:--:|:--:|:--:|:--:|:--:|
| Workspace entry / Overview / Correlation / Discordance / QC / Proficiency / Escalations / Recall (`record:view`) | ✓ | ✓ | ✓ | ✓ | ✗ |
| Benchmarks (`report:view`) | ✓ | ✓ | ✓ | ✗ | ✗ |
| Medical Director (`resultsheet:authorize`) | ✓ | ✓ | ✓ | ✗ | ✗ |
| Governance · result-sheet source (`resultsheet:view`) | ✓ | ✓ | ✓ | ✗ | ✗ |
| Governance · security source (`system:security`) | ✓ | ✗ | ✗ | ✗ | ✗ |
| Governance · change-request source (`changerequest:view`) | ✓ | ✗ | ✗ | ✗ | ✗ |

**Permission caveats:**
- `changerequest:view/change` are **declared but not seeded** → only Superusers (isSuperRole bypass) see the governance change-request source; never aliased to `record:view`.
- `system:security` is held by no default role → the governance security source is Superuser/admin-only.
- `resultsheet:authorize` (Medical Director) and `report:view` (Benchmarks) are held by Pathologist/Authorizers, not Lab Technician.
- **Receptionist has no `record:view`** → cannot enter the workspace at all (nav item hidden; endpoint 403).
- Lab Technician sees the seven `record:view` sections; Benchmarks, Medical Director, and all three governance sources are truthfully forbidden.

### 14e. Section-contract status (frozen `ready|empty|forbidden|error|deferred`)

**No implemented section remains `deferred`** — the last deferred section (governance) hydrated at C10.
Source-unavailable is distinguished from section-empty everywhere: an empty section says "no recorded
items"; an unavailable source is named in the section's `unavailable[]` list (Overview, Benchmarks,
Medical Director, Governance) or shown as its own `error`/`forbidden` state. No false empty state:
verified by forcing every section to error while Overview/Permissions and real counts still render.

### 14f. Failure isolation

Structurally guaranteed: every loader wraps its owner reads in try/catch and always returns a
`Section` (never rejects), so `overview()`'s `Promise.all` cannot collapse. Verified at runtime by
forcing all nine evidence sections to `error` (Overview + Permissions survived; eight "Unavailable"
states; no page error; no false empty) and by an overview-only failure (sibling sections still rendered).

### 14g. Governance non-canonical limitation

The governance trail is explicitly **not** an audit ledger: `nonCanonical: true`, partial when a source
is unavailable, historical-only. `RecordStatusEvent` is excluded (no standalone lab-wide owner read);
`MaintenanceLog` is excluded (global system/job maintenance, not lab equipment QC); notification
delivery is excluded (delivery ≠ acknowledgement). Result-sheet/change-request actors show "Actor not
recorded" where the owner read does not resolve them; security access is global under `system:security`.

### 14h. Performance (measured, warm, superuser demo lab)

- Aggregate response: **~15–25 ms warm** (~93 ms cold first hit); payload **~15.3 KB** (governance 12.3 KB / 37 events dominates).
- Composed owner reads run in parallel (`Promise.all`); no read blocks another.
- **List caps:** correlation recent 10 / discordance 25 · QC checks 10 / alerts 25 · proficiency 15 · escalation 20 · recall 20 · Medical Director 30 · governance 40.
- **Duplicate-read observation (not a defect):** Overview re-reads correlation/QC/escalation/recall summaries that the detail sections also read; because all reads are parallel and the aggregate returns in ~20 ms, this is not a bottleneck and was not "fixed" (a cross-section cache would add state for no measurable gain).

### 14i. Accessibility & responsive results

Exactly one `h1`; logical `h1 → h2` heading order; zero buttons/links without an accessible name;
visible focus ring; status conveyed by text (never color-only); no keyboard trap; shortcut sheet is a
labeled `role="dialog" aria-modal`. Shortcuts **W / Q / ? / Esc** are navigation-only, suppressed in
form controls / with Ctrl-Meta-Alt / while any dialog is open; focus moves to the heading once on entry
and is not stolen on refetch; `prefers-reduced-motion` backstop present. Horizontal overflow **0** and
**zero-orange 0 px** at 390 / 768 / 1024 / 1440 / 1920.

### 14j. Intentional deferrals & known limitations (unchanged, still blocked)

- **Deferred (require schema evolution):** CAPA / nonconformance / root-cause / preventive action, Concordance Ledger, document control, complaints, accreditation register — none added.
- **Blocked flagships:** Read → Reveal, quantification — none added.
- **Navigation-continuity limitations (C12):** scroll restoration on owner-route return is **browser-managed**, not pixel-guaranteed (no scroll store was added — a new cross-route state system was not warranted); there is **no previous/next case set** because no real ordered source set spans the composed owner domains, so none was invented; `returnTo` may carry a source route's own params but the workspace adds no clinical data of its own and re-validates every `returnTo` as internal-only.
- **Demo-data limitations:** the demo lab currently has live data only for escalations (1 open), benchmarks (6 metrics), and governance (37 events); correlation/QC/proficiency/recall are empty, so their ready-path rendering was verified via response interception + owner live data, and their empty states via real zero-data.
- **Outcome:** **no schema change, no Helix change, no permission seed/grant change** across all of Phase 2C. `changerequest:*` seeding remains a separate future platform decision.

---

## Conflict check

No conflicts with [OSIERI_QUALITY_WORKSPACE.md](OSIERI_QUALITY_WORKSPACE.md) or
[OSIERI_QUALITY_FEASIBILITY_AUDIT.md](OSIERI_QUALITY_FEASIBILITY_AUDIT.md): this plan builds only the
Existing/Partial-composable capabilities those documents classified as buildable, and defers every
schema-gated capability (CAPA, Concordance Ledger, document control, complaints, accreditation
register) and every blocked flagship (Read → Reveal, quantification). It inherits the Sign-Out
composition contract without modification and preserves the Helix v1.0 freeze
([../HELIX_v1.0.md](../HELIX_v1.0.md)). One item to verify during build, not a conflict: seeding of
`changerequest:*` remains a separate platform decision (§9).

---

## Status of this document

Binding engineering plan; architecture only. On approval, implementation proceeds checkpoint by
checkpoint (C1…C13), each tracing here and to [OSIERI_QUALITY_WORKSPACE.md](OSIERI_QUALITY_WORKSPACE.md)
and [OSIERI_QUALITY_FEASIBILITY_AUDIT.md](OSIERI_QUALITY_FEASIBILITY_AUDIT.md), verified against §11,
and recorded in [../Roadmap/08_RELEASES.md](../Roadmap/08_RELEASES.md). No code, no schema, no Helix,
no permission change, no commit until each checkpoint is separately approved.
