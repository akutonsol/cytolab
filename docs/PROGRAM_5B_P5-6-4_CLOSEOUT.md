# Program 5B · P5-6.4 — Clinical Review — Rendered Acceptance Closeout

**Status:** **RENDERED ACCEPTANCE SATISFIED** — the P5-6.4 clinical review surface passed the full
rendered acceptance gate (G1–G10) in CI. This is the **freeze candidate**; freeze/closure follow-ups
(tag, branch reconciliation) are tracked below and were intentionally **not** performed as part of this
docs-only record.

- **Accepted commit (freeze candidate):** `145b689213df3263e6afc65f00174a7722fb7204`
- **Branch:** `feat/legacy-etl` (authoritative on the GitHub remote).
- **Gate:** `WSI Review Acceptance` GitHub Actions workflow, `workflow_dispatch`, **Run #15** — 2026-07-26.
- Companion: **`docs/PROGRAM_5A_CLOSEOUT.md`** (Program 5A, on which this builds).

> Convention: when closing risk-register entries, reference the commit **message**, not the SHA. The SHAs
> recorded here are point-in-time acceptance evidence for this specific run, not a durable identity.

---

## 1. Acceptance evidence — Run #15 (all green)

| Gate | What it proves | Result |
|---|---|---|
| **G1** | Publisher publishes READY → PUBLISHED; prior → SUPERSEDED; LIVE marker moves without reload | ✅ |
| **G2** | Reviewer (no `wsi:publish`) sees the Publish affordance disabled+explained; a forced API publish → **403**; generation unchanged | ✅ |
| **G3** | Deliberate, confirm-gated publish; server acknowledgement (`Generation published.`) | ✅ |
| **G4** | QC_FAILED evidence shows the real reason code + detail; no storage/pixel leakage | ✅ |
| **G5** | DIVERGENT state locks out ALL publication (banner + no enabled publish path) | ✅ |
| **G6** | Publication history paginates (keyset) with append + uniqueness across pages (25 events) | ✅ |
| **G7** | Mobile viewport: drawer usable, no horizontal body overflow | ✅ |
| **G8** | Rendered orange-pixel detector — 0 violations | ✅ |
| **G9** | Motion grammar (production build) | ✅ |
| **G10a** | Global experience budgets (cold start / route / interaction) | ✅ |
| **G10b** | Review interaction acknowledgement ≤ 100 ms | ✅ |

The gate runs against an isolated stack (Postgres 16 `cytolab_accept_test`, schema-from-datamodel, seeded
WSI fixtures, production web build proxied to a `ts-node` API), with **two seeded least-privilege scoped
principals** (reviewer = `record:view`+`wsi:review`; publisher = `+wsi:publish`) — never a superuser.

---

## 2. Acceptance scope (what was verified)

The full P5-6.1 → P5-6.4 clinical review vertical, over the frozen Program 5A publication lifecycle:

- **P5-6.1** — read-only clinical review surface: `SlideReviewService` + three `GET wsi/slides/*` routes.
- **P5-6.2** — `wsi:review` / `wsi:publish` authorization; the review surface is gated on `wsi:review`.
- **P5-6.3** — controlled publication endpoint over the frozen `SlidePublicationService` (SUCCESS-only audit).
- **P5-6.4** — the clinical review web UI (review drawer, generation evidence, publication history, publish
  confirm, status badges) over the frozen review/publication APIs.

Acceptance is **behaviour-oriented** (status labels, LIVE marker, QC reasons, disabled affordances, real
403s, keyset pagination) and drives the **real browser** through a **real cookie login** — no API shortcuts,
injected state, or bypassed authentication.

---

## 3. Fix / harness chain to green (evidence trail)

Exercising the full rendered surface in a clean CI environment surfaced a sequence of **harness / CI-bootstrap
/ one product-layering** defects. Each was diagnosed read-only, corrected with the smallest change, and
re-run. Chain `0e8e488..145b689` (GitHub `feat/legacy-etl`):

**Harness build + gate**
- `0e8e488` declare browser acceptance tooling dependencies (playwright, pngjs).
- `0594a07` reproducible P5-6.4 rendered acceptance harness (guarded seeder + specs).
- `0ea2613` gated `WSI Review Acceptance` workflow (`workflow_dispatch`).

**Repo build-provenance repairs** (committed tree made standalone-buildable)
- `8fb94eb`, `282e9a1`, `e57f26b` — restore committed→dirty dependencies (notification sound, governance
  access-restriction, `FeatureDefinition` fields).

**CI bootstrap hardening (harness/env)**
- `9d9798a` assert the login response + web→API proxy readiness (fail-closed, not a blind nav timeout).
- `a5c7130` make the API readiness gate real (whitelist real HTTP statuses; `kill -0` liveness) — kills a
  `000000` false-positive.
- `e68ef62` satisfy `assertStrongSecrets` (≥32-char JWT_SECRET / JWT_PORTAL_SECRET) in the CI env.

**Product** (the single product change)
- `5cd56a7` **fix(auth): declare authenticated self-service contracts** — `GET /auth/me` and
  `POST /auth/change-password` were missing `@AuthorizationContract('authenticated')`, so the fail-closed
  `PermissionsGuard` denied any **non-super** principal (masked because real/e2e logins were super-role).
  This blocked claims hydration for the scoped acceptance principals.

**Product-layering (WSI workstation)**
- `4b80df8` then `c522cab` — the full-screen WSI workstation rendered inside `<main z-index:1>` while the
  app top-nav was `z-index:1000`; final fix sets `<main>` to `z-index:auto` on `/wsi/` so the workstation and
  its **body-portaled** review drawer participate in correct body-level ordering (header < workstation < drawer).

**Harness locator / interaction**
- `1a27d08` scope the generation-row locator to the Generations section (a published gen id legitimately
  appears in both the Generations list and Publication history → strict-mode fix).
- `77a9fc0` retry login within a 20 s aggregate budget (hydration race); `9082244` restore the 10 s per-attempt
  actionability budget; `56bee68` use **keyboard activation** (`press('Enter', { noWaitAfter })`) of the real
  Sign-in button — the software-WebGL login vial stalled pointer-click actionability in headless CI;
  `75c348d` retain the real login POST **response** via a passive observer so a boundary-timed response is
  still validated (never navigation/request-count alone; exactly one real login).
- `0ef7d1d`, `f4b1085`, `5a1e6a2` — secrets-safe, fail-closed diagnostics used to localize the above.
- `145b689` **G6:** await strict publication-row growth after each "Load more" before collecting, so the
  appended final page is captured (25 distinct events).

---

## 4. Rollback boundaries

- The single **product** change (`5cd56a7`) is additive: two `@AuthorizationContract('authenticated')`
  decorators on `AuthController.me` / `changePassword`. `git revert 5cd56a7` restores the prior (defective)
  deny-non-super behaviour; no guard, permission, fixture, or schema change.
- The **WSI-layering** change (`c522cab`) is a single route-scoped `<main>` `z-index` ternary
  (`/wsi/` → `auto`, else `1`). `git revert c522cab` restores `z-index:1`; no other route affected.
- Every **harness/CI** change is confined to `apps/web/acceptance/**` and
  `.github/workflows/wsi-review-acceptance.yml`; each is independently `git revert`-able and cannot affect
  product behaviour or the G-gate assertions.

---

## 5. Deferred items (recorded, NOT resolved here)

1. Dashboard **403/404** console entries after login (post-login dashboard data fetches; unrelated to the
   review gate).
2. **R-001a** authorization-contract architecture test **blind spot** — its class-region slice captures a
   controller's first `@Public()` decorator, so it never scans that controller's handlers.
3. **Five `ArtifactDeliveryController` handlers** flagged by R-001a as lacking a recognized authorization
   contract — need separate triage (genuine gap vs. delivery-token guard the recognizer doesn't list).
4. **Four pre-existing `${email}` principal identifiers** in `apps/web/acceptance/global-setup.ts` throw
   messages (harness hardening).
5. **GitHub Actions Node.js 20 deprecation** warning.

---

## 6. Freeze / closure follow-ups (pending authorization)

- Tag the freeze candidate at `145b689`.
- Reconcile the accepted chain `0e8e488..145b689` into the dev repo and/or `main` (currently GitHub-only on
  `feat/legacy-etl`; the dev-repo `origin` is 18 commits behind at `e57f26b`).
- `apps/web/tsconfig.tsbuildinfo` remains an untracked build artifact (not committed).

P5-6b and P5-7 remain **unopened**.
