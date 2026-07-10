# PathOS / CYTOLAB

| Field | Value |
|---|---|
| Status | Active |
| Current Phase | Phases 1–3 shipped; Product Phase 2 next |
| Owner | Founder |
| Dependencies | Helix v1.0 (frozen), custom auth, GCS storage, Claude AI reporting |
| Last Updated | 2026-07-10 |
| Priority | P0 |
| Expected Next Milestone | PathOS Phase 2 kickoff |

The single source of truth for PathOS, the pathology operating system and product #1 on
Helix. This is the product roadmap; the original build-phase roadmap is
[../ROADMAP.md](../ROADMAP.md) and system detail is in [../ARCHITECTURE.md](../ARCHITECTURE.md).

> Note on phase numbering: [../ROADMAP.md](../ROADMAP.md) tracks the original six build
> phases (marketing site → client portal → lab ops → workstation → AI → enterprise), most
> of which are shipped. "Phase 2" and "Phase 3" below are the forward **product** phases
> that begin now that Helix is frozen. The two numbering schemes are kept distinct on
> purpose.

---

## Vision

PathOS is the operating system for modern pathology: one intelligent workflow from specimen
intake to signed, structured report. It unifies the referring-clinician portal, lab
operations, the pathologist workstation, AI-assisted reporting, and billing into a single
premium product that a lab can run its entire diagnostic day on.

## Product principles

1. Preserve everything that works. Refactor over replace; no breaking changes to routes,
   APIs, auth, or business logic.
2. Keep the premium Apple/Linear/Vercel design language, expressed through Helix.
3. The product UI is indigo (`#4F46E5`); marketing is red. Do not recolor the product.
4. Clinical safety first: the AI service degrades gracefully and never throws; redaction
   stays in place; feedback never withholds information.
5. Tenancy is enforced structurally (`labId` + AsyncLocalStorage + Prisma extension), never
   trusted from the request body.
6. Every action is acknowledged once, from one feedback language, within the experience
   budgets.

## Current state

Shipped and in use (see [../ROADMAP.md](../ROADMAP.md) for the detailed checklist):

- Marketing website (public), client portal, lab operations, workforce, billing.
- Realtime updates via socket.io, scoped by lab.
- AI-assisted reporting path (Claude), with redaction and graceful degradation.
- Helix component system adopted across the app; one feedback language; motion grammar;
  three independently measured experience budgets.

Foundational quality bars are green: `tsc`, production build, the three Helix guards,
`verify-feedback`, and zero-orange.

## Phase 2 goals (product)

Depth and reliability on what already ships.

- Close the remaining client-portal items: in-portal payments (Stripe), notification
  preferences, saved filters.
- Lab-operations depth: batch authorization, QC dashboards, reagent/inventory.
- Dashboard live status ribbon and action center to reference-implementation quality.
- Retire the two feedback files still on the legacy renderer once their pending edits land
  (see [07_TECHNICAL_DEBT.md](07_TECHNICAL_DEBT.md)).
- Migrate the two blocked files and resolve the `overflow-x` decision.

## Phase 3 goals (product)

The pathologist workstation as the center of gravity.

- Whole-slide viewing and structured findings at workstation quality.
- Turnaround-time analytics and worklist intelligence.
- Deeper reporting: templates, co-sign, amendment workflow.
- Correlation and proficiency modules matured from current scaffolding.

## Future enterprise goals

- Multi-lab / multi-tenant administration at scale.
- SSO / SAML, audit export, configurable retention.
- FHIR interoperability breadth beyond the current endpoints.
- Compliance surface (HIPAA, SOC 2, CAP, CLIA) evidenced in-product.

## Known technical debt

Tracked centrally in [07_TECHNICAL_DEBT.md](07_TECHNICAL_DEBT.md), which references the
authoritative [../TECH_DEBT.md](../TECH_DEBT.md) (TD-001…TD-010). Current highlights:
shared packages not yet consumed, client-only Sentry, in-process jobs (no Redis/queue),
framework behind target (Next 14 / React 18), no project-wide ESLint.

## Research backlog

- Foundation-model-assisted pre-screening quality and calibration.
- Structured-report extraction accuracy vs free text.
- Turnaround prediction from historical worklist data.
- On-device / edge inference feasibility for slide triage.

## AI roadmap

- Keep the Claude-based reporting path; never let it throw; keep redaction.
- Expand AI assistance from drafting to consistency-checking and coding suggestions
  (already scaffolded in the authorization flow).
- Human-in-the-loop by default: AI proposes, the pathologist signs.
- Measured degradation: every AI surface has a defined unavailable state.

## Clinical workflow roadmap

- Specimen intake to signed report as one continuous, observable pipeline.
- Batch authorization and co-sign.
- QC and proficiency as first-class operational surfaces.
- Amendment and correction workflow with full audit.

## Enterprise roadmap

- Tenancy administration, roles, and delegated administration.
- SSO/SAML, audit export, retention policy.
- Billing and payments hardening (Stripe, taxes, services catalog depth).
- Interoperability (FHIR) and external endpoint management.

## Success metrics

- Experience budgets held: cold start ≤ 2000ms, route content ≤ 400ms / cue ≤ 200ms,
  interaction ≤ 100ms.
- Zero silent actions; canonical feedback adoption at 100% of committable scope.
- Zero-orange 0px on every UI change.
- Turnaround time (specimen to signed report) trend.
- AI draft acceptance rate and degradation frequency.
- Portal adoption by referring clinicians.
