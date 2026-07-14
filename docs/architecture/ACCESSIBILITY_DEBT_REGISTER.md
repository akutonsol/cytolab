# ACCESSIBILITY_DEBT_REGISTER.md

**Purpose:** Track observed accessibility debt in the PathOS / CYTOLAB web app as a backlog to be remediated in a dedicated, isolated workstream — not mixed with security, logging, tests, or color migration.
**Scope:** `apps/web` product UI. Reflects observations from the 2026-07-13 frontend survey. This register records observations; it fixes nothing.
**Status:** Living document — active backlog.
**Owner:** PathOS Engineering (unassigned).
**Last Updated:** 2026-07-13.

---

## How to use

Each category lists observed issues with representative evidence and severity. Counts are from a survey of ~100 `(app)` pages and shared components; treat them as indicative, not exhaustive. Convert entries into tests (ACCESSIBILITY section of TEST_STRATEGY.md) and remediation tickets in a separate accessibility checkpoint. Do not fix inline during other work.

## Keyboard

- **~119 clickable `<div onClick>`** across `(app)` are not keyboard-operable — no `tabIndex`, `role="button"`, or `onKeyDown`. Screen-reader and keyboard users cannot activate them. **Severity: High.**
- Recommendation (Deferred): convert to `<button>`/`<a>`, or add role + tabIndex + key handlers; prefer a shared interactive primitive.

## ARIA

- Only ~31 of ~100 pages contain any `aria-*`/`role` attribute. Interactive custom widgets largely lack roles/labels. **Severity: Medium–High.**
- Clickable divs (above) announce as non-interactive.

## Forms

- An `Input` primitive exists but is bypassed by ~20 files repeating a raw class string; inputs are frequently unlabeled or rely on placeholder-as-label. **Severity: Medium.**
- Error states: recent work consolidated some accessible error states; confirm inputs expose `aria-invalid`/`aria-describedby` consistently (Unknown — verify per screen).

## Tables

- Data tables are often hand-rolled; some use `Th/Td/Tr` primitives, others do not. Header association (`scope`), captions, and row semantics are inconsistent. **Severity: Medium.** (Recent work added some table semantics — coverage is partial/Unknown.)

## Dialogs

- **~25 hand-rolled modal overlays** (`fixed inset-0 z-[...]`) lack focus trapping, `role="dialog"`, `aria-modal`, and Escape handling. Example: confirm dialog at `apps/web/src/app/(app)/records/[id]/page.tsx:674`. Only ~13 page files handle Escape anywhere. A `Modal` primitive exists but is used once. **Severity: High** (modals are ubiquitous).
- Recommendation (Deferred): adopt the `Modal` primitive (also removes hex debt); add focus trap, initial focus, restore focus on close, Escape.

## Focus

- No consistent focus management on route change or dialog open/close; focus is not moved to new content or trapped in overlays. **Severity: Medium–High.**
- Verify visible focus indicators survive the token/theme styling.

## Announcements

- No consistent live-region (`aria-live`) usage for async results, toasts, or loading/empty/error transitions. Status changes may be silent to assistive tech. **Severity: Medium.**
- Relates to the "no false empty state while loading" invariant — announcements should not fire before data arrives.

## Responsive

- ~17 raw `<img>` (vs 3 `next/image`) forgo responsive sizing/lazy-loading and risk missing `alt`. Some wide content (tables, charts) may not scroll within its own container. **Severity: Low–Medium.**
- The user runs space-consuming ("classic") scrollbars; nav + content must share one scroll container — verify layouts with overlay scrollbars disabled.

## Contrast

- Color usage is mid-migration (raw hex + Tailwind color utilities), so contrast is not centrally guaranteed. The zero-orange rule constrains palette but does not by itself ensure WCAG contrast ratios. **Severity: Medium (Unknown per screen).**
- Recommendation (Deferred): audit contrast after token migration (THEME_MIGRATION.md), checking foreground against actual background at every alpha.

---

## Related documents
- RISK_REGISTER.md (R-010 accessibility debt)
- TEST_STRATEGY.md (Accessibility class — convert entries to tests)
- THEME_MIGRATION.md (contrast verification post-migration)

## Future revisions
- Replace indicative counts with a tooled audit (e.g. axe) once integrated.
- Track per-screen remediation status as an accessibility checkpoint proceeds.
- Confirm partial items marked Unknown (forms error semantics, table headers, focus indicators).

## Verification requirements
- Remediation is verified by keyboard-only operation and an assistive-technology pass, not by code inspection alone.
- Accessibility work is a standalone checkpoint; never merged with security/logging/tests/color.
- This register fixes nothing; it is documentation only.
