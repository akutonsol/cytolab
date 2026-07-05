# Cytolab Enterprise Security

Operational reference for the security subsystem (auth hardening, sessions, MFA,
PHI encryption, and the Security Center). Implemented in
`apps/api/src/modules/security/*`, `apps/api/src/common/crypto/*`, and
`apps/web/src/app/(app)/security/*`.

## Required environment variables (`apps/api/.env`)

| Var | Purpose | Default |
| --- | --- | --- |
| `ENCRYPTION_KEY` | 32-byte hex (64 hex chars) for AES-256-GCM PHI encryption. **App fails hard on boot if missing/malformed.** | — (required) |
| `SESSION_IDLE_MINUTES` | Idle timeout before a session is revoked. | `15` |
| `SESSION_MAX_HOURS` | Absolute session lifetime. | `12` |
| `COOKIE_SECURE` | Force the `Secure` flag on auth cookies (auto-on in production). | `false` |
| `JWT_SECRET` | Access-token + MFA-token signing secret. | — |

Generate a key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

> **Key rotation:** the cipher format is versioned (`v1:iv:tag:ciphertext`).
> Rotating `ENCRYPTION_KEY` requires decrypting with the old key and re-encrypting
> with the new one; do not change the key in place without a re-encryption pass.

## Authentication & sessions

- **Password hashing:** Argon2id (`memoryCost 65536, timeCost 3, parallelism 4`).
  Legacy bcrypt hashes are verified with bcrypt on next login and transparently
  re-hashed to Argon2id.
- **Tokens (dual-mode):** access token (JWT, 15 min) and opaque refresh token
  (64-byte hex, SHA-256 hashed at rest, 7 days) are set as `HttpOnly`, `Secure`,
  `SameSite=Strict` cookies. Tokens are **never** returned in the response body.
  The JWT strategy still accepts `Authorization: Bearer` so pre-existing sessions
  survive the migration.
- **Refresh:** `POST /auth/refresh` rotates the refresh token (old deleted, new
  minted) and re-issues the access cookie. Enforces the 12h max lifetime and 15m
  idle window.
- **Idle timeout:** every authenticated request touches its session
  (`SessionActivityInterceptor`); an idle/revoked session returns `401` with code
  `SESSION_IDLE_TIMEOUT`.

## Login protection

- Every attempt is recorded in `LoginAttempt`. Failures increment
  `User.failedLoginCount` and apply progressive lockout: 3→5m, 5→15m, 7→1h,
  10+→permanent (admin unlock). Login errors are always the generic
  *"Invalid username or password."*
- **IP denylist:** `IpBlockGuard` rejects blocked IPs on every request (30s cache).
  >20 failures from one IP in 1h auto-blocks it for 24h (`CREDENTIAL_STUFFING`).
- **Impossible travel:** Haversine distance vs. the previous session; >500km in
  <2h raises `IMPOSSIBLE_TRAVEL`, forces MFA, and emails the user.
- **Device trust:** a device that clears MFA is remembered; trusted devices skip
  MFA unless impossible travel is detected.

## MFA

TOTP (otpauth + QR) and email OTP. Backup codes: 8 × 10-char, Argon2-hashed,
single-use. TOTP secret is AES-256-GCM encrypted at rest. Login returns
`{ status: 'MFA_REQUIRED', mfaToken }` (5-min JWT, body only); the client
completes via `POST /auth/mfa/challenge`.

## PHI encryption at rest

Transparent field encryption via a Prisma client extension
(`common/crypto/phi-encryption.extension.ts`), chained after the tenancy guard.

**Encrypted fields:** `Patient.identityToken`, `Patient.motherMaidenName`,
`PatientAddress.line1`, `PatientAddress.line2`.

**Intentionally NOT encrypted** (documented trade-offs):
- `Patient.dateOfBirth` — a `DateTime` column; ciphertext is type-incompatible and
  age derivation/date filtering depend on it.
- `Patient.phoneNumber`, `Patient.email` — used in patient search (`contains`);
  GCM is randomised, so encrypting them silently breaks lookup.

Encryption keys off field name (covers nested relation writes); decryption is
prefix-detected (`v1:`) on any string in a result tree (covers nested includes).

## Audit trail hardening (manual DB step)

The activity log (`SystemLogService`) aggregates append-only event tables
(`RecordStatusEvent`, `AuthAttempt`, `ResultSheetEvent`, `ChangeRequestEvent`,
`LoginAttempt`, `SecurityAlert`, …). These rows are only ever inserted. To enforce
append-only at the database level, run (adjust the role name):

```sql
-- Append-only: allow INSERT + SELECT, deny UPDATE/DELETE on audit-source tables.
REVOKE UPDATE, DELETE ON "LoginAttempt", "SecurityAlert", "AuthAttempt",
  "RecordStatusEvent", "ResultSheetEvent", "ChangeRequestEvent"
  FROM cytolab_app;
```

Run this as a privileged role after deploy; it is not part of a Prisma migration
because Prisma needs UPDATE/DELETE grants for other tables under the same role.

## PHI logging policy

Never log PHI. Patient **names/IDs** are acceptable in audit detail; DOB,
address, national ID, diagnosis, and results are not. The encryption primitives
never log plaintext or ciphertext. Prefer structured metadata with allow-listed
keys over interpolating record fields into log strings.

## Rate limits

Global 100 req/min/IP (`ThrottlerModule`). `POST /auth/login`, `/auth/refresh`,
`/auth/mfa/challenge`: 5 req/min/IP (`@Throttle`).
