# CYTOLAB — Roadmap

> Living implementation plan by product surface. Distinct from ARCHITECTURE.md
> (which tracks the *technical* stack migration). This tracks *what we build*.
> Legend: ✅ shipped · 🟡 in progress · ⬜ planned.

---

## Phase 1 — Marketing website (public)
- ✅ Hero (premium WebGL specimen vial — `HeroVial`)
- ✅ Premium navigation (logo, links, Request Demo)
- ✅ Interactive workflow section (Collect → Process → AI → Review → Report)
- ✅ Auto-playing platform demo (live pipeline dashboard)
- ✅ Pricing
- ⬜ Case studies / logos, blog/docs surface, footer polish
- ⬜ Migrate marketing fully into `apps/marketing` (GSAP + Lenis) as it grows

## Phase 2 — Client portal (referring clinicians)
- ✅ Login (cookie auth) + password/reset flows
- ✅ Dashboard (stat cards, quick actions, turnaround card)
- ✅ My Records (filters, specimen dots, result slide-in)
- ✅ Reports (download authorized reports)
- ✅ Requisitions (batches, status timeline, digital requisition form)
- ✅ Messages (change requests, unread badge)
- ✅ Realtime updates (socket.io) for queue/notifications
- ⬜ In-portal payments (Stripe — Phase 7 tech)
- ⬜ Notifications preferences, saved filters

## Phase 3 — Lab portal / operations
- ✅ Records, requisitions, workspaces, cabinets, code sheets, lab codes
- ✅ Workforce (attendance/clock, schedule, timesheets)
- ✅ Billing / payments / taxes / services catalog
- 🟡 Live status ribbon + action center on the dashboard
- ⬜ Batch authorization, QC dashboards, reagent/inventory depth

## Phase 4 — Pathologist workstation
- ✅ Clinical Review Workstation (focus mode overlay)
- ✅ Specimen queue · AI cytology model · AI findings panels
- ✅ Zoom / pan / expand controls; keyboard shortcuts
- ⬜ Real WSI viewer integration (tiles / deep zoom)
- ⬜ Annotation tools, second-read AI overlay, sign-out workflow depth

## Phase 5 — AI
- ✅ Claude-based structured **reporting** with redaction + graceful degradation
- ✅ AI screening module (scaffolding), Bethesda analytics
- ⬜ Dedicated **Python / FastAPI** CV inference service (Torch/ONNX) for WSI —
  *only when real slide inference is scheduled* (do not remove the Claude reporting path)
- ⬜ SSE stream for AI progress; confidence/region overlays fed from CV service

## Phase 6 — Enterprise
- ⬜ SSO / advanced security, org-level RBAC review
- ⬜ Audit exports, FHIR/HL7 hardening, LIS/EHR connectors
- ⬜ Multi-lab admin, usage analytics (PostHog), SLA dashboards
- ⬜ Meilisearch, Redis + BullMQ at scale, observability (Pino/Sentry)

---

### How this maps to the tech-migration phases (ARCHITECTURE §7)
Product roadmap and stack migration run in parallel: additive tech work (Turborepo,
Pino/Sentry, shared packages, shadcn-for-new) proceeds continuously and independently,
without blocking product delivery or forcing a rewrite.
