# Cytolab Database Security Runbook

## Database Users
- `cytolab_api` — runtime API user, SELECT/INSERT/UPDATE/DELETE only (no DDL/CREATE).
- `cytolab_migrate` — migration user, full privileges, used by `prisma migrate deploy` only.

## Initial Setup
Run `apps/api/prisma/scripts/db-security-setup.sql` as a PostgreSQL superuser on
each environment (dev, staging, prod). It is idempotent and safe to re-run:
user creation is guarded by existence checks, and the audit-log revokes only
apply to tables that exist.

> Replace the two `REPLACE_WITH_STRONG_PASSWORD` placeholders before running.

## Environment Variables
- `DATABASE_URL` — uses `cytolab_api` credentials (runtime).
- `DATABASE_MIGRATION_URL` — uses `cytolab_migrate` credentials (migrations only).
  Maps to the Prisma datasource `directUrl`; the running client always connects
  via `DATABASE_URL`, while `prisma migrate deploy` / introspection use this.
- Both must include `?sslmode=require` in production. The API **fails hard on
  boot** (`assertDatabaseSecurity()` in `apps/api/src/main.ts`) if
  `NODE_ENV=production` and `DATABASE_URL` lacks `sslmode=require`/`verify-full`.

## Audit Log Protection
Mutation (`UPDATE`, `DELETE`) is revoked from `cytolab_api` on the append-only
audit trails, so a compromised runtime cannot rewrite or erase history:
- `MaintenanceLog` — protected today.
- `LoginAttempt` — the current login/security audit trail; protected today.
- `AuditLog` — a dedicated audit table does not yet exist in the schema. The
  setup script guards this revoke with an existence check, so it applies
  automatically once an `AuditLog` table is introduced.

## Backup Encryption
All GCS backup snapshots are AES-256-CBC encrypted before upload. Each object is
`backups/cytolab-backup-<timestamp>.json.encrypted` — a random 16-byte IV is
prepended to the ciphertext. Encryption is enabled whenever `STORAGE_BUCKET` is
set; decryption requires the `ENCRYPTION_KEY` env var (the same 32-byte key used
for PHI encryption). Verify the latest backup monthly via
`POST /system/backup/verify-latest` (superuser only), which downloads, decrypts,
and structurally validates the newest snapshot.

## Password Rotation
Rotate database passwords every 90 days.
Update `DATABASE_URL` and `DATABASE_MIGRATION_URL` in Secret Manager.
Restart the API after rotation.

## Production Checklist
- [ ] `cytolab_api` user created with restricted permissions
- [ ] `cytolab_migrate` user created for migrations only
- [ ] `sslmode=require` in both DATABASE URLs
- [ ] `REVOKE UPDATE, DELETE` executed on `MaintenanceLog` / `LoginAttempt` (and `AuditLog` once it exists)
- [ ] Backup encryption verified via `/system/backup/verify-latest`
- [ ] Passwords stored in Google Cloud Secret Manager
- [ ] Password rotation scheduled (every 90 days)
