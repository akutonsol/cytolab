# PROGRAM_2_CERTIFICATION_RECORD.md — Enterprise Audit Platform

**Purpose:** A permanent, contemporaneous certification artifact for **Program 2 — Enterprise
Audit Platform** (audit capture → query API → audit UI). It fixes the commit boundaries,
verification evidence, traceability, and open findings *as they stood at certification time*,
so a later re-evaluation against the original `PathOS-Enterprise-Audit.pdf` reads
contemporaneous evidence rather than reconstructing it.
**Scope:** Program 2 checkpoints P2-6 → P2-8. P2-9 (Export & Compliance) and P2-10 (Program 2
Final Certification) are **not** covered here — they remain open.
**Status:** Living until P2-10; the P2-8 Audit-UI section below is **frozen**.
**Owner:** PathOS Engineering.
**Last Updated:** 2026-07-18.

> This is an **engineering** certification of the committed architecture. It is **not** a
> regulatory certification and makes **no** claim of WCAG conformance or HIPAA attestation.
> Companion: ARCHITECTURE_LEDGER.md §20–§21, AUDIT_EVENT_CONTRACT.md, RISK_REGISTER.md,
> ACCESSIBILITY_DEBT_REGISTER.md.

---

## 1. Program ledger (at certification time)

| Checkpoint | Scope | Commit | Status |
|---|---|---|---|
| **P2-6** | Security-administration & session-revocation capture | frozen at `4b16889` | ✅ COMPLETE |
| **P2-7A** | Audit query contract + governance model | `d6f8526` | ✅ |
| **P2-7B** | Governed read-only query service + endpoints | `ed89c21` | ✅ |
| **P2-7C** | Fail-closed PHI audit-query read capture | `b65e9dd` | ✅ |
| **P2-7D** | Query hardening & certification | `c09745b` | ✅ |
| **P2-8A** | Audit UI architecture & contract | design-only (no code commit) | ✅ frozen in review |
| **P2-8B** | Audit Event List | `4c9fda0` | ✅ |
| **P2-8C** | Audit Event Detail | `8fe6498` | ✅ |
| **P2-8D** | PHI UX & hardening | `3f450e0` | ✅ |
| **P2-8E** | **Audit UI certification** | certification-only (no code change) | ✅ **CERTIFIED** |
| **P2-9** | Export & Compliance | — | ⬜ OPEN |
| **P2-10** | Program 2 Final Certification | — | ⬜ OPEN |

**Certified baseline (Audit UI):** HEAD `3f450e0` (P2-8D). P2-8E discovered **no implementation
defect**, required **no code change**, and violated **no architectural boundary**; the
certification is therefore a freeze of the committed bytes, not a new commit.

---

## 2. Architectural boundaries certified (from P2-8A, frozen)

- **Single transport boundary.** `apps/web/src/lib/audit/audit-query-client.ts` is the only web
  module importing the axios `api`; every component/hook reaches the backend through it.
- **URL = predicate, store = cursor.** Filters/scope/phi/pageSize live in the URL; the keyset
  cursor is opaque, predicate-bound, ephemeral store state (never in the URL).
- **PHI cache isolation.** `phi` is part of the query key, so base and PHI caches never share an
  entry; a PHI failure drops only the PHI cache.
- **Fail-closed PHI.** A PHI failure that is *not* 403/404 (5xx/network) auto-reverts to the base
  view, drops the PHI cache, and surfaces a neutral "PHI is unavailable" notice — never a partial
  PHI render, never a silent stay in PHI.
- **Concealment.** A single neutral 404 state for all "not available" causes; loading always wins
  over concealed (no false empty while loading).
- **No backend leakage.** Error classification reads status codes only; raw error bodies, stacks,
  and tokens never reach the DOM.

---

## 3. Certification traceability matrix (P2-8E)

| Requirement (P2-8A) | Implemented in | Verified by | Status |
|---|---|---|---|
| Single transport boundary | `lib/audit/audit-query-client.ts` | ownership regex; sole importer of `api` | PASS |
| URL predicate / store cursor | `lib/audit/audit-filters.ts`, `audit-cursor-store.ts` | live: back-nav excludes cursor | PASS |
| PHI cache isolation | `lib/audit/audit-query-keys.ts` | unit + live: PHI-only cache drop | PASS |
| Fail-closed PHI | `lib/audit/audit-phi.ts`; `audit/page.tsx`, `[id]/page.tsx` | live 500 → revert + notice (`[500,500,200]`) | PASS |
| Concealment (single 404 state) | `components/audit/AuditConcealedState.tsx`, `AuditDetailBoundary.tsx` | live deep-link unknown id | PASS |
| No false empty while loading | boundaries gate `!isLoading` | live loading-vs-empty | PASS |
| Detail focus / one H1 | `audit/[id]/page.tsx` (titleRef) | live: focus on H1; H1 count = 1 | PASS |
| Switch + dialog a11y | `components/audit/PhiToggle.tsx`, `PhiRevealControl.tsx` | live: `role=switch`+`aria-checked`; Escape closes + returns focus | PASS |
| No raw backend leakage | `AuditDetailBoundary.tsx`, `classifyAuditDetailError` | code + copy audit | PASS |
| Zero orange | `components/audit/AuditBadge.tsx` (warning→amber token) | pixel detector 0 ×6 surfaces | PASS |
| Response validation | `lib/audit/audit-query-client.ts` (`validateAuditEvent(Page)`) | 40 unit assertions | PASS |
| Navigation / return-path safety | `lib/audit/audit-back-nav.ts`; both pages | live: predicate preserved, cursor excluded | PASS |
| Transactional chain integrity | **backend** (out of P2-8 scope) | live 500 → correct fail-closed | **BLOCKER — R-016** |
| WCAG-AA contrast | **shared Tier-2 tokens** (out of P2-8 scope) | axe (tooled) | **DS FINDING — R-009/R-010** |

**No requirement is left unclassified.** Two rows are external to the Audit UI and carry owners
outside P2-8 (see §5).

---

## 4. Verification artifacts (P2-8E, against committed bytes)

| Gate | Command | Result |
|---|---|---|
| Web TypeScript | `apps/web && npx tsc --noEmit` | clean |
| Audit logic units | `apps/web && jest -c jest.config.js` | **40 passed / 10 suites** |
| Production build | `apps/web && npm run build` | ✓ compiled; `/audit` 5.09 kB, `/audit/[id]` 4.11 kB |
| Live drive | Playwright, superuser, prod build on :3100 | list base/empty/loading/PHI-fail-closed; detail base/concealed; nav; dialog — desktop 1440 + mobile 390 |
| Accessibility | `@axe-core/playwright` (`wcag2a`,`wcag2aa`), scoped to audit content | only shared-token contrast (§5); no audit-authored a11y violation |
| Zero-orange | pixel detector on 6 surfaces | **0** |
| Horizontal overflow | `scrollWidth − clientWidth` on 6 surfaces | **0** |
| Runtime errors | pageerror listener across the drive | **0** |

State coverage certified — **List:** base, empty, loading, PHI-active, PHI fail-closed, unauthorized
(code), desktop, mobile. **Detail:** base, loading, concealed (404), unauthorized (code), generic/
network/500 error, PHI confirm dialog (open/cancel/Escape), fail-closed revert, desktop, mobile.

---

## 5. Open findings carried out of Program 2 (recorded, not fixed)

### R-016 — Backend transactional audit-chain integrity (Program 2 Certification Blocker)
- **Observed:** SYSTEM-scoped PHI capture returns 500 on the shared `system` hash chain (P2-4
  orphan-row sequence collision). The Audit UI **correctly fails closed** and the backend
  **correctly refuses** rather than leaking partial PHI.
- **Ownership:** Backend persistence integrity — **not** a UI, PHI-UX, transport, or cache defect,
  and **not** an Audit-UI certification failure. UI: PASS. Backend security (fail-closed): PASS.
  Backend persistence integrity: **FAIL.**
- **Why not fixed here:** a schema/data-integrity change, out of scope for every UI checkpoint;
  requires a dedicated backend remediation checkpoint.
- **Consequence:** the PHI-success detail view (patient panel / active notice with data) could not
  be screenshotted; it is certified by design + fail-closed evidence, not by a live success render.
- **Tracked in:** RISK_REGISTER.md **R-016**.

### Design-system contrast (WCAG-AA) — shared Tier-2 tokens
- **Observed (axe, tooled):** four AA contrast shortfalls, all in shared primitives the Audit UI
  *consumes* (names no color):

  | Token / role | fg | bg | ratio | need |
  |---|---|---|---|---|
  | `--color-text-tertiary` (PageHeader eyebrow) | #9ca3af | #f8f9fd | 2.41 | 4.5 |
  | `--color-neutral-badge` (Badge/neutral) | #6b7280 | #eef2f7 | 4.30 | 4.5 |
  | `--color-success` (Badge/success) | #22c55e | #dcfce7 | 2.07 | 4.5 |
  | `--color-info` (Badge/info) | #4f7df9 | #eaf1ff | 3.28 | 4.5 |

- **Ownership:** Design System. `Badge` has ~47 non-audit consumers; `PageHeader` ~16. Fixing means
  editing a Tier-2 *value* (locked decision: "you'd recolor 600+ sites") or forking the primitive
  (a redesign) — both P2-8E STOP conditions.
- **Recommended remediation (DS track):** darker on-soft foreground pairs (e.g. green-700-on-
  green-100), applied at the token layer per THEME_MIGRATION.md.
- **Tracked in:** ACCESSIBILITY_DEBT_REGISTER.md (Contrast) and RISK_REGISTER.md R-009 / R-010.

---

## 6. Certification verdict

**Program 2 Audit UI (P2-6 → P2-8): CERTIFIED AND FROZEN at `3f450e0`.**

Every P2-8A architectural requirement has implementation, verification, evidence, and a PASS
status. No implementation defect was discovered, no boundary was violated, and no code change was
required. The two open findings are correctly external to the Audit UI and owned elsewhere
(R-016 backend; DS contrast). Program 2 proceeds to **P2-9 (Export & Compliance)** and then
**P2-10 (Program 2 Final Certification)**, after which the planned full re-evaluation against
`PathOS-Enterprise-Audit.pdf` is performed.
