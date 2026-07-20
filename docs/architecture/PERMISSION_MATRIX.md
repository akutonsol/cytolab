# PERMISSION_MATRIX.md

**Purpose:** Document the current authorization architecture of Osieri / CYTOLAB so future work can extend it without reverse-engineering the guard stack, and so the known fail-open default is remediated from an explicit map.
**Scope:** `apps/api` request authorization — authentication gates, permission model, route/owner/sub-source permissions, and alternate guards. Data-layer tenancy is summarized here and detailed in SECURITY_ARCHITECTURE.md.
**Status:** Living document — active. Reflects architecture verified 2026-07-13.
**Owner:** Osieri Engineering (unassigned).
**Last Updated:** 2026-07-13.

---

## Authentication

Two authentication surfaces exist, each with its own JWT strategy:

- **Staff** — `JwtAuthGuard` (global `APP_GUARD`), `scope:'staff'`, `audience:'staff'`. Rejects any request lacking a valid staff JWT unless the route is `@Public()` or `@Portal()`. Evidence: `apps/api/src/modules/auth/guards/jwt-auth.guard.ts:13-21`; registration `apps/api/src/modules/auth/auth.module.ts:20-21`.
- **Portal** — `PortalAuthGuard` (controller-level), a separate JWT strategy for client-portal principals. Routes opt in with `@Portal()` so the staff guard stands down. Evidence: `apps/api/src/modules/portal/auth/portal-auth.guard.ts`.

Global guard order (all routes): `JwtAuthGuard` → `PermissionsGuard`. Additional global guards `ThrottlerGuard` (`apps/api/src/app.module.ts:170`) and `IpBlockGuard` (`apps/api/src/modules/security/security.module.ts:39`) perform rate-limiting and IP blocking, **not** authorization.

**Anonymous access is always explicit** — every truly public route carries `@Public()`. There is no anonymous fail-open path.

## Authorization

Authorization is layered on top of authentication by `PermissionsGuard`:

- Reads required permission strings from `@RequirePermissions(...)` metadata on the handler or controller class.
- **Super-role bypass:** `user.isSuperRole === true` is authorized for everything.
- Otherwise requires `required.every(p => user.permissions?.includes(p))`.
- **Fail-open default (documented risk R-001):** if no permission metadata is present, the guard returns `true` before inspecting the user. Evidence: `apps/api/src/modules/auth/guards/permissions.guard.ts:22`. This is locked by a passing test (`.../permissions.guard.spec.ts:55-58`).

## Permission model

- **Format:** colon-namespaced string permissions, e.g. `record:change`, `record:view`, `system:security`. Assigned to roles; a user's effective `permissions[]` and `roles[]` plus `isSuperRole` are carried in the JWT claims (`ver=3`, `sid`, `type:'access'`, `scope:'staff'`).
- **Roles:** created per lab; a Superuser role is created at lab registration with `isSuperRole` set.
- This document does **not** enumerate an invented permission taxonomy. The authoritative list is whatever `@RequirePermissions(...)` decorators exist in the controllers; a generated inventory is **Deferred** (see Future expansion).

## Route permissions

Representative mechanisms currently in use (not exhaustive; the full route list is best generated — Deferred):

| Mechanism | Example routes | Notes |
|---|---|---|
| Method-level `@RequirePermissions(...)` | the large majority of controllers | Standard pattern |
| Class-level `@RequirePermissions('system:security')` | `security.controller.ts`, `auth-security-admin.controller.ts` | Gates all routes on the controller |
| `@Public()` | health, auth login/refresh/logout/register/mfa-challenge, payment callback, teleconsult public, support public tickets | Explicit anonymous |
| `@Portal()` + `PortalAuthGuard` | all portal + requisition-portal routes | Portal principal |
| `@UseGuards(SuperuserGuard)` | lab-features management | Superuser only |
| `@UseGuards(WorkforceManagerGuard)` | workforce-reports; leave; payroll-engine | Manager gate (some also carry `@RequirePermissions`) |
| `FeatureGuard` | workforce-notification | Feature-flag gate, self-scoped by `recipientId` |
| JWT-only, self-service | `auth/me`, `auth/change-password`, `users/me/signature`, `users/password/change`, `mfa/*`, `profile-security/*` | Legitimate but **implicit** (no explicit marker) |
| **JWT-only, sensitive, no guard** | **appointments GET: `list`, `calendar`, `today`, `upcoming`, `stats`, `:id`** | **Accidental fail-open — R-002** |

## Owner permissions

"Owner" (per-record / per-entity ownership) authorization is **partially implicit** today:

- Some routes self-scope by principal identity rather than a permission — e.g. workforce notifications filter by `recipientId`; self-service profile/MFA/session routes operate only on the caller's own entities.
- There is no centralized, declarative record-ownership policy layer. A formal owner-permission abstraction is **Deferred / Unknown** — document it here when/if introduced. Do not assume one exists.

## Sub-source permissions

Aggregate read endpoints (e.g. signout case context, diagnostic-case, quality-governance dashboards) compose multiple sub-sources under a **single** route permission; individual sub-sources are **not** separately permission-gated. Failure of a sub-source degrades that section rather than denying the request (see LOGGING_STANDARD.md, RISK_REGISTER.md R-006). Per-sub-source authorization is **Deferred** — not currently implemented.

## Base gates

Always-on, applied to every route unless explicitly exempted:

1. `JwtAuthGuard` (authentication; exempted by `@Public()`/`@Portal()`).
2. `PermissionsGuard` (authorization; currently fail-open on missing metadata).
3. `ThrottlerGuard` (rate limiting).
4. `IpBlockGuard` (IP block enforcement).

## Inherited gates

- **Class-level metadata is inherited by handlers** via `Reflector.getAllAndOverride([handler, class])` — a class-level `@RequirePermissions` covers all its routes; a handler-level decorator overrides.
- `@Public()`/`@Portal()` are similarly resolved at handler-or-class level.
- **Tenant isolation is inherited at the data layer**, not the route layer: a Prisma client extension backed by `AsyncLocalStorage` (`LabContext`) stamps/filters `labId` on every query regardless of the route (see SECURITY_ARCHITECTURE.md). `labId` is sourced from the JWT, never the request body.

## Future expansion strategy (recommendations — Deferred, not implemented)

The systemic weakness is that "authenticated-only" is expressed by the *absence* of a decorator, indistinguishable from a forgotten one. Recommended explicit contract (documented for R-001/R-003 remediation; not yet built):

1. Introduce **`@AuthenticatedOnly()`** — a recognized no-op marker declaring "any authenticated principal, no specific permission." Apply to the legitimate implicit routes (self-service, shared reads, self-scoped lists).
2. Add a **startup/test-time policy assertion** using `DiscoveryService` + `MetadataScanner` + `Reflector` over the existing metadata keys (`PERMISSIONS_KEY`, `IS_PUBLIC_KEY`, `IS_PORTAL_KEY`, `REQUIRE_FEATURE_KEY`) and `@UseGuards` reflection — fail boot if any route declares no policy.
3. Only **after** every route declares a policy, flip `PermissionsGuard` to **fail-closed** and update `permissions.guard.spec.ts`.
4. **Deferred:** a generated route→permission inventory document; a formal owner-permission layer; per-sub-source authorization.

Sequence: CP-1 (close appointments hole) → CP-3 (explicit contract + startup check → fail-closed). Never combine with logging, tests, or color migration.

---

## Related documents
- SECURITY_ARCHITECTURE.md (tenancy, sessions, JWT, MFA)
- RISK_REGISTER.md (R-001 fail-open, R-002 appointments)
- TEST_STRATEGY.md (route-level authorization tests)

## Future revisions
- Replace the representative route table with a generated full inventory once the enumeration tooling exists.
- Document `@AuthenticatedOnly()` and the startup policy check when implemented.
- Add an owner-permission section if/when a declarative ownership layer is built.

## Verification requirements
- Any claim of a route's protection mechanism must be backed by the decorator/guard present in the controller.
- The fail-closed flip must not ship until the startup policy assertion is green for all routes.
- No permission may be documented here unless it exists in code.
