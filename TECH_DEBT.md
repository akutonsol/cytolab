# CYTOLAB — Technical Debt Backlog

> Record architectural compromises, temporary implementations, duplicated logic, and
> future improvements **instead of fixing them immediately**. Stability over
> perfection. This is the engineering backlog — triage from here, don't refactor mid-flight.

Format: `[ID] Title — context · impact · suggested fix · size`.

---

## Open

### TD-001 · `@cytolab/types` / `@cytolab/config` not yet consumed by apps
Phase 2 created the canonical shared packages but **did not rewire app imports** (per the
"leave imports working" guardrail). Apps still hold local copies of the constants
(API prefix, cookie names, audiences) and types.
- **Impact:** low — duplication persists until migration; no runtime effect.
- **Fix:** add `transpilePackages: ['@cytolab/types','@cytolab/config']` to the web/marketing
  Next configs, then replace local copies import-by-import. Verify each swap with a build.
- **Size:** M

### TD-002 · `@cytolab/shared` is an orphan package
`packages/shared` (`@cytolab/shared`) is imported by no app and duplicates `RECORD_STATUSES`
now living canonically in `@cytolab/types`.
- **Impact:** trivial — dead package.
- **Fix:** make `shared` re-export `@cytolab/types`, or remove it once nothing references it.
- **Size:** S

### TD-003 · Web Sentry is client-only (no server instrumentation / sourcemaps)
`sentry.client.ts` inits the browser SDK (DSN-guarded). There is **no** server-side
instrumentation hook and **no** `withSentryConfig` build wrapper (skipped to avoid Next 14
build risk), so no readable stack traces (sourcemaps) and no server/edge error capture.
- **Impact:** medium — partial monitoring on web.
- **Fix:** complete `@sentry/nextjs` setup (instrumentation + `withSentryConfig`) during the
  **Next 15 upgrade (Phase 5)**, where the App-Router integration is first-class.
- **Size:** M

### TD-004 · No Redis / queue — jobs run in-process
Cron/async work uses `@nestjs/schedule` in-process (no Redis, no BullMQ). Fine at current
scale; a single instance is a bottleneck/SPOF for AI + report jobs.
- **Impact:** medium (at scale).
- **Fix:** Phase 6 — Redis + BullMQ for AI/report/notification jobs.
- **Size:** L

### TD-005 · `HeroVial` is imperative three.js, not React Three Fiber
Target stack favors RTF + Drei (installed). The hero is hand-written imperative three.js.
Works and is performant; not idiomatic to the target.
- **Impact:** low — maintainability only.
- **Fix:** refactor to RTF opportunistically (only if the hero is reworked). Not urgent.
- **Size:** L

### TD-006 · Framework behind target (Next 14 / React 18 → 15 / 19)
- **Impact:** low now; compounds over time.
- **Fix:** Phase 5, isolated, behind a full build + e2e gate.
- **Size:** L

### TD-007 · Stale `.next-prod/types/**` trips `tsc --noEmit`
Leftover generated route types from a prior `next build` cause `TS6053` noise on
standalone `tsc`. Harmless.
- **Fix:** `rm -rf .next-prod` before typecheck, or exclude the glob when no prod build exists.
- **Size:** S

### TD-008 · No ESLint configuration (project-wide)
Both `apps/web` (`next lint`) and `apps/api` (`eslint`) have **lint scripts but no ESLint
config** — `next lint` prompts interactively and `eslint` reports "couldn't find a
configuration file." So the "lint passing" gate is currently unmeetable.
- **Impact:** medium — no automated style/quality enforcement; CI can't gate on lint.
- **Fix:** add a shared flat ESLint config in `packages/config` (Next + Nest presets) and
  wire each app's `lint` script to it. Expect to triage a backlog of pre-existing findings;
  land as its own PR, not mixed into feature work.
- **Size:** M

---

## Resolved
_(move items here with the commit that closed them)_
