# LOGGING_STANDARD.md

**Purpose:** Define the authoritative logging standard for PathOS / CYTOLAB — levels, structure, correlation, and the privacy rules required for a HIPAA-adjacent cytology platform — so that observability can be added without leaking PHI/PII and without changing runtime behavior.
**Scope:** `apps/api` server-side logging. Client-side telemetry is out of scope (Deferred). Reflects infrastructure verified 2026-07-13.
**Status:** Living document — active. The AUDIT and SECURITY streams below are partially Deferred (see each section).
**Owner:** PathOS Engineering (unassigned).
**Last Updated:** 2026-07-13.

---

## Purpose (why this exists)

The backend uses a deliberate **graceful-degradation** pattern: an aggregate read isolates a failed sub-source to `{status:'error'}`/`[]`/`null` so one failure does not break the whole request. This is correct. The gap is that many of these catches **log nothing** and use bare `catch {` (no error binding), so failures are invisible in production. This standard defines how to add logging to those sites (and everywhere else) safely. See RISK_REGISTER.md R-006.

## Current logging infrastructure (as-built)

- **Library:** `nestjs-pino`. Config at `apps/api/src/app.module.ts:89-98`.
- `autoLogging: false` — no automatic per-request logs.
- `redact` currently covers only `req.headers.authorization`, `req.headers.cookie`, `res.headers["set-cookie"]` — **request bodies and params are NOT redacted.**
- `level` from `LOG_LEVEL` (default `info` in prod, `debug` in dev). Wired as the Nest logger (`apps/api/src/main.ts:55`).
- **Correlation:** pino-http auto-generates `req.id` per request (or echoes inbound `X-Request-Id`/`X-Correlation-Id`). There is no custom `genReqId`. `req.id` is **not** currently threaded into services.
- **Per-request context:** `LabContext` (`AsyncLocalStorage`) carries `labId`, `clientId`, `portal`, `system` (`apps/api/src/common/tenancy/lab-context.ts`) — the natural place to pull `labId` for logs and, in future, a `correlationId`.

## Levels

### INFO
Normal, expected lifecycle events worth retaining. Use sparingly on the hot path (`autoLogging` is off by design). Examples: service startup, a completed batch settlement (without financial detail), a scheduled job run summary.

### WARN
Expected, **isolated** degradation — a section/sub-source failed but the request succeeded. This is the correct level for the graceful-degradation catches (signout, diagnostic-case, quality-governance, enterprise-administration section loaders) and best-effort `.catch()` sites. Must include which section failed and a safe error identifier.

### ERROR
Unexpected failures that would otherwise be invisible — specifically a catch that masks a would-be 500. Example: the aggregate `getCaseContext` catch (`apps/api/src/modules/signout/signout.service.ts:416`) when the thrown error is not a `NotFoundException`. Include `err.name`/`err.code`/`err.stack`.

### AUDIT
**Deferred / partially Unknown.** A dedicated, tamper-resistant audit trail of who-did-what-to-which-entity is not documented as a unified subsystem today. Some domain events are persisted (e.g. login attempts, account locks, security alerts, payroll integrity hashes) but there is no single audit-log standard. When an audit subsystem is defined, document its schema, retention, and immutability here. Do not assume one exists.

### SECURITY
**Partially implemented.** Security-relevant events already persisted include login attempts/lockouts (`login-protection`), blocked IPs, and impossible-travel alerts. Standardize these under a `security` category with: event type, principal id (opaque), source IP, decision, and never the credential material. A unified security-event logging contract is otherwise **Deferred**.

## Correlation IDs

- **Long-term (recommended, Deferred):** add a `correlationId` to the `LabContext` `TenantStore`, seeded from pino `req.id` in `LabContextMiddleware`, so every degraded-section log carries a request-wide id without changing service signatures.
- **Short-term (available now):** use `labId` + `userId` + the in-scope entity id (`recordId`/`caseId`/`patientId` as an opaque key) as the correlation key. All are already available in-service.

## Request IDs

`req.id` exists at the HTTP layer (pino-http). Inbound `X-Request-Id`/`X-Correlation-Id` are echoed if present. Threading `req.id` into service-layer logs is **Deferred** (see Correlation IDs).

## PII rules

- Never log names, DOB, addresses, phone, email, national IDs, MRN/registration numbers, or account numbers.
- Prisma `PrismaClientKnownRequestError.meta` echoes conflicting **field values** (e.g. `registrationNo`, `labNumber`, patient `where` params) — **never log `err.meta`**. Log `err.code` (e.g. `P2002`) and `err.name` only.

## PHI rules

- Never log specimen/diagnosis free-text, Bethesda categories, HPV genotype/results, correlation discordance notes, or any clinical content.
- Entity **ids** (recordId, patientId, caseId) may be logged as opaque correlation keys — they are not PHI on their own — but never alongside the clinical payload.

## HIPAA considerations

- Logs are a disclosure surface: apply minimum-necessary. Structured fields only; never interpolate raw objects.
- Extend the pino `redact` list beyond headers to include at least: `req.body`, `*.passwordHash`, `*.refreshToken`, `*.token`, `err.meta`, payment/card fields.
- `apps/api/src/modules/system/system-health.service.ts:64` echoes `e.message` into the HTTP response — review so a driver error cannot surface a host/connection string.
- Retention, access control, and log-integrity requirements are **Deferred / Unknown** — document when an operations policy exists.

## Never-log list

Patient identifiers (name, DOB, MRN, registrationNo) · specimen/diagnosis/finding text · Bethesda/HPV values · correlation notes · `err.meta` · payment/card fields (PAN, CVV, tokens) · gateway `SpiToken` · JWT payloads/tokens · refresh tokens · `passwordHash`/argon2/bcrypt hashes · candidate passwords · request bodies · file bytes/base64 · `storageUrl`.

## Logging examples (conceptual — not implementation)

Recommended structured shape for a degraded section (WARN):

```
logger.warn(
  { labId, userId, section: 'bethesda', entityId: recordId,
    errName: err?.name, errCode: err?.code },
  'signout: section load degraded'
)
```

Recommended shape for a masked-500 (ERROR):

```
logger.error(
  { labId, userId, entityId: recordId, errName: err?.name,
    errCode: err?.code, stack: err?.stack },
  'signout: getCaseContext unexpected failure'
)
```

**Forbidden:** `logger.error(err)` spreading the whole error; `logger.warn(\`failed for ${patient.name}\`)`; logging `err.meta` or request bodies.

## Failure isolation guidance

- Keep the graceful-degradation contract: a failed sub-source returns `{status:'error'}`/`[]`/`null`; the request still succeeds. **Adding logging must not change the returned/degraded value.**
- WARN for isolated section degradation; ERROR only where the catch would otherwise hide a real 500.
- Auth/crypto `.catch(() => false)` hash-verify guards must stay silent — at most a debug counter, never with credential context.

## Exception handling expectations

- **Mechanical prerequisite:** most degradation sites use bare `catch {` with no binding, so they cannot log the error. Adding logging requires changing `catch {` → `catch (e) {` — a source change, scoped to the logging checkpoint (CP-6).
- Do not swallow errors that should propagate: retry/conflict rethrows and `UnauthorizedException`/`NotFoundException` rethrows must remain rethrows.
- **Scope exclusion:** `apps/api/src/modules/diagnostic-case/diagnostic-case.service.ts` is under active Phase 3A work and is **excluded** from the logging checkpoint until that work settles.

---

## Related documents
- RISK_REGISTER.md (R-006 swallowed exceptions)
- SECURITY_ARCHITECTURE.md (security events, tenancy context)
- TEST_STRATEGY.md (asserting log emission with zero behavior change)

## Future revisions
- Define the AUDIT subsystem (schema, immutability, retention) if/when built.
- Document the `correlationId`-in-`LabContext` mechanism once implemented.
- Expand the pino `redact` list and record the final set here.

## Verification requirements
- Any logging change must demonstrate the degraded return value is unchanged.
- A test or manual check must confirm no never-log field appears in output.
- This document authorizes no code change by itself; logging lands only in CP-6.
