# E2E Findings — Access-Control Bugs (for the Security window)

Two access-control bugs found during E2E testing — need **client-side route guards** added.
Both are UI-exposure / defense-in-depth issues: the APIs already return `403`, so **no data
leaks**, but the spec requires these pages to be **superuser-only**. The fix in each case is a
simple page-level permission check + redirect.

Reproduced by the failing tests in [`access-control.spec.ts`](./access-control.spec.ts)
(staff identity = a provisioned **Lab Technician**, created in `global-setup.ts`).

---

## Bug 1 — `/security/*` accessible to non-superusers

A Lab Technician navigating directly to `/security`, `/security/sessions`,
`/security/blocked-ips`, etc. sees the full Security Center UI. The nav hides the link, but
there is **no page-level permission check**.

**Fix:** Add a guard at the top of each Security Center page (or in the security layout) that
checks `isSuperRole || can('system:security')` — if false, redirect to `/dashboard` with a
toast "Access denied."

**Evidence:** `access-control.spec.ts › cannot reach the Security Center` — staff renders the
`Active Sessions / Blocked IPs / Open Alerts / Failed Logins` KPIs (4 elements) instead of
being redirected.

---

## Bug 2 — `/system/support` management tabs accessible to non-superusers

Same issue — direct URL navigation bypasses the nav gate. The management tabs (Maintenance
Windows, Announcements, Analytics, full ticket list) render for staff.

**Fix:** Add a page-level guard in `apps/web/src/app/(app)/system/support/page.tsx` that checks
`can('system:health')` — if false, redirect to `/dashboard`.

**Evidence:** `access-control.spec.ts › cannot see support management tabs` — staff renders the
`Maintenance Windows / Announcements / New Ticket` controls (3 elements).

---

_Note: the two tests above are intentionally left asserting the **secure** behavior, so they
fail until the guards are added — that failure is the flag. Once guarded, they will pass._
